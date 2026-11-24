import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayInterceptor } from '@/common/interceptors/delay.interceptor';
import { ResponseTransformInterceptor } from '@/common/interceptors/response-transform.interceptor';
import { configureApp } from './app-setup';

describe('Development response simulation', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['development', undefined, false],
    ['development', 'false', false],
    ['development', 'TRUE', false],
    ['development', 'true', true],
    ['test', 'true', false],
    ['production', 'true', false],
  ])('with NODE_ENV=%s and flag=%s, registers simulation=%s', (mode, flag, enabled) => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: mode });
    delete process.env.DEV_SIMULATE_LATENCY;
    const useGlobalInterceptors = jest.fn();
    const app = {
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalInterceptors,
    } as unknown as INestApplication;
    configureApp(app, new ConfigService({ DEV_SIMULATE_LATENCY: flag }));
    expect(useGlobalInterceptors).toHaveBeenCalledTimes(1);
    expect(useGlobalInterceptors).toHaveBeenCalledWith(
      ...(enabled ? [expect.any(DelayInterceptor)] : []),
      expect.any(ResponseTransformInterceptor),
    );
  });
});
