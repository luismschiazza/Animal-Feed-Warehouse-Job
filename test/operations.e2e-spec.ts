import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { Server } from 'node:http';
import * as request from 'supertest';
import { HealthController } from '@/app/operations/health.controller';
import { OperationsService } from '@/app/operations/operations.service';
import { configureApp } from '@/common/bootstrap/app-setup';

let arrived: () => void;
let release: () => void;
let gate: Promise<void>;

@Controller('work')
class WorkController {
  @Get()
  async work() {
    arrived();
    await gate;
    return { completed: true };
  }
}

describe('Operational probes and drain', () => {
  let app: INestApplication;
  let operations: OperationsService;
  const command = jest.fn();
  const connection = { readyState: 1, db: { admin: () => ({ command }) } };

  beforeEach(async () => {
    connection.readyState = 1;
    command.mockReset().mockResolvedValue({ isWritablePrimary: true, setName: 'test' });
    const module = await Test.createTestingModule({
      controllers: [HealthController, WorkController],
      providers: [OperationsService, { provide: getConnectionToken(), useValue: connection }],
    }).compile();
    app = module.createNestApplication();
    operations = app.get(OperationsService);
    operations.bindServer(app.getHttpServer());
    app.use(operations.track);
    configureApp(app, new ConfigService());
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    release?.();
    await app.close();
  });

  it('reports process health independently, while readiness requires a writable replica primary', async () => {
    const http = request(app.getHttpServer());
    await http.get('/api/health/live').expect(200).expect('Cache-Control', 'no-store');
    expect(command).not.toHaveBeenCalled();
    await http.get('/api/health/ready').expect(200).expect('Cache-Control', 'no-store');
    expect(command).toHaveBeenCalledWith(
      { hello: 1 },
      { readPreference: 'primary', timeoutMS: 1000 },
    );
    command.mockResolvedValueOnce({ isWritablePrimary: true });
    await http.get('/api/health/ready').expect(503);
    command.mockResolvedValueOnce({ isWritablePrimary: false, setName: 'test' });
    await http.get('/api/health/ready').expect(503);
    command.mockRejectedValueOnce(new Error('fixture-sensitive-address'));
    const failure = await http.get('/api/health/ready').expect(503);
    expect(failure.text).not.toContain('fixture-sensitive-address');
    connection.readyState = 0;
    await http.get('/api/health/live').expect(200);
    await http.get('/api/health/ready').expect(503);
    expect(command).toHaveBeenCalledTimes(4);
    connection.readyState = 1;
    await http.get('/api/health/ready').expect(200);
  });

  it('shares only the in-flight check and observes a subsequent failure', async () => {
    let complete: (value: unknown) => void;
    command.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));
    const first = operations.ready();
    const second = operations.ready();
    expect(command).toHaveBeenCalledTimes(1);
    complete({ isWritablePrimary: true, setName: 'test' });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    command.mockRejectedValueOnce(new Error('unavailable'));
    await expect(operations.ready()).resolves.toBe(false);
  });

  it('stops readiness and new work during shutdown and waits for the admitted request', async () => {
    gate = new Promise<void>((resolve) => (release = resolve));
    const admitted = new Promise<void>((resolve) => (arrived = resolve));
    const http = request(app.getHttpServer());
    const first = http
      .get('/api/work')
      .expect(200)
      .then((response) => response.body);
    await admitted;
    let drained = false;
    const end = operations.beforeApplicationShutdown().then(() => (drained = true));
    try {
      await http.get('/api/health/live').expect(200);
      await http.get('/api/health/ready').expect(503);
      await http.get('/api/work').expect(503).expect('Connection', 'close');
      expect(drained).toBe(false);
    } finally {
      release();
    }
    await expect(first).resolves.toMatchObject({ payload: { completed: true } });
    await end;
    expect(drained).toBe(true);
  });

  it('stops accepting connections before force-closing after the grace budget', async () => {
    const order: string[] = [];
    operations.bindServer({
      listening: true,
      close: () => order.push('stop-accepting'),
      closeAllConnections: () => order.push('close-connections'),
    } as unknown as Server);
    const response = new EventEmitter();
    operations.track(
      { method: 'GET', path: '/api/work' } as Request,
      response as unknown as Response,
      jest.fn(),
    );
    jest.useFakeTimers();
    try {
      const draining = operations.beforeApplicationShutdown();
      await jest.advanceTimersByTimeAsync(59_999);
      expect(order).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);
      await draining;
      expect(order).toEqual(['stop-accepting', 'close-connections']);
    } finally {
      jest.useRealTimers();
      response.emit('close');
    }
  });
});
