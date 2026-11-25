import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { NextFunction, Request, Response } from 'express';
import { Connection } from 'mongoose';
import { Server } from 'node:http';

const READY_TIMEOUT_MS = 1_000;
const DRAIN_TIMEOUT_MS = 60_000;
const probes = new Set(['/api/health/live', '/api/health/ready']);

@Injectable()
export class OperationsService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(OperationsService.name);
  private draining = false;
  private active = 0;
  private idle?: () => void;
  private server?: Server;
  private checking?: Promise<boolean>;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  bindServer(server: Server) {
    this.server = server;
  }

  track = (req: Request, res: Response, next: NextFunction) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && probes.has(req.path)) return next();
    if (this.draining) {
      return res
        .set({ Connection: 'close', 'Cache-Control': 'no-store' })
        .status(503)
        .json({ statusCode: 503, message: 'Service unavailable' });
    }
    this.active++;
    const done = () => {
      res.off('finish', done).off('close', done);
      if (--this.active === 0) this.idle?.();
    };
    res.once('finish', done).once('close', done);
    next();
  };

  async ready(): Promise<boolean> {
    if (this.draining) return false;
    // Coalesce simultaneous probes only. No cached successful result or authority.
    this.checking ??= this.probePrimary().finally(() => {
      this.checking = undefined;
    });
    const usable = await this.checking;
    return usable && !this.draining;
  }

  private async probePrimary(): Promise<boolean> {
    if (this.connection.readyState !== 1 || !this.connection.db) return false;
    try {
      const result = await this.connection.db
        .admin()
        .command({ hello: 1 }, { readPreference: 'primary', timeoutMS: READY_TIMEOUT_MS });
      return result.isWritablePrimary === true && typeof result.setName === 'string';
    } catch {
      return false;
    }
  }

  async beforeApplicationShutdown() {
    this.draining = true;
    if (!this.active) return;
    let timer: NodeJS.Timeout;
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.idle = resolve;
        }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, DRAIN_TIMEOUT_MS);
        }),
      ]);
      if (this.active) {
        this.logger.warn('http_drain_timeout');
        // Stop accepting before force-closing, otherwise sockets could race the close.
        if (this.server?.listening) this.server.close();
        this.server?.closeAllConnections();
      }
    } finally {
      clearTimeout(timer);
      this.idle = undefined;
    }
  }
}
