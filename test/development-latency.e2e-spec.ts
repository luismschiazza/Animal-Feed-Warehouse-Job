import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as request from 'supertest';
import { AppController } from '@/app/controllers/app.controller';
import { AppService } from '@/app/services/app.service';
import { configureApp } from '@/common/bootstrap/app-setup';
import { DelayInterceptor } from '@/common/interceptors/delay.interceptor';
import { validateEnvironment } from '@/config/environment.validation';

describe('Development latency — real configuration and HTTP', () => {
  it.each([
    ['development', undefined, false],
    ['development', 'false', false],
    ['development', 'true', true],
    ['production', 'true', false],
    ['test', 'true', false],
  ])('NODE_ENV=%s, DEV_SIMULATE_LATENCY=%s, simulated=%s', async (mode, flag, enabled) => {
    const folder = mkdtempSync(join(tmpdir(), 'afw-latency-config-'));
    let app: INestApplication | undefined;
    const envFilePath = join(folder, '.env');
    jest.replaceProperty(process, 'env', { NODE_ENV: mode });
    try {
      writeFileSync(
        envFilePath,
        [
          'HOST=127.0.0.1',
          'PORT=3000',
          'MONGO_URL=mongodb://127.0.0.1/config-test-unused',
          'JWT_SECRET=config-test-only',
          'JWT_EXPIRES_IN=15m',
          ...(flag === undefined ? [] : [`DEV_SIMULATE_LATENCY=${flag}`]),
        ].join('\n'),
      );
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, envFilePath, validate: validateEnvironment }),
        ],
        controllers: [AppController],
        providers: [AppService],
      }).compile();
      app = module.createNestApplication();
      const config = app.get(ConfigService);
      expect(config.get('DEV_SIMULATE_LATENCY')).toBe(flag);
      // Call through the real interceptor. Don't use a timing threshold to determine its presence.
      const intercept = jest.spyOn(DelayInterceptor.prototype, 'intercept');
      configureApp(app, config);
      await app.init();
      await request(app.getHttpServer()).get('/api').expect(200).expect({
        payload: 'Hello World!',
        message: 'Request successfully processed',
      });
      expect(intercept).toHaveBeenCalledTimes(enabled ? 1 : 0);
    } finally {
      try {
        await app?.close();
      } finally {
        jest.restoreAllMocks();
        rmSync(folder, { recursive: true, force: true });
      }
    }
  });
});
