import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import { DelayInterceptor } from '@/common/interceptors/delay.interceptor';
import { ResponseTransformInterceptor } from '@/common/interceptors/response-transform.interceptor';

interface ConfigureAppOptions {
  validatorContainerModule?: Type<unknown>;
}

export function configureApp(
  app: INestApplication,
  configService: ConfigService,
  options: ConfigureAppOptions = {},
): void {
  if (options.validatorContainerModule) {
    useContainer(app.select(options.validatorContainerModule), {
      fallbackOnErrors: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: resolveCorsOrigin(configService),
    credentials: resolveCorsCredentials(configService),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  app.setGlobalPrefix('api');

  const interceptors = [new ResponseTransformInterceptor()];

  if (process.env.NODE_ENV === 'development') {
    interceptors.unshift(new DelayInterceptor(100));
  }

  app.useGlobalInterceptors(...interceptors);
}

function resolveCorsOrigin(configService: ConfigService): boolean | string | string[] {
  const configuredOrigin = configService.get<string>('CORS_ORIGIN');
  const nodeEnv = configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;

  if (!configuredOrigin) {
    return nodeEnv === 'production' ? false : true;
  }

  if (configuredOrigin === '*') {
    return true;
  }

  return configuredOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsCredentials(configService: ConfigService): boolean {
  const configuredValue = configService.get<string>('CORS_CREDENTIALS');

  if (!configuredValue) {
    return true;
  }

  return configuredValue.toLowerCase() === 'true';
}
