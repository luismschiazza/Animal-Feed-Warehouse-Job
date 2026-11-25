import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApp } from '@/common/bootstrap/app-setup';
import { AppModule } from './app/app.module';
import { OperationsService } from './app/operations/operations.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const host = configService.get<string>('HOST');
  const port = configService.get<number>('PORT');

  const operations = app.get(OperationsService);
  operations.bindServer(app.getHttpServer());
  app.use(operations.track);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  configureApp(app, configService, { validatorContainerModule: AppModule });

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Agora API')
      .setDescription('API documentation for the Agora project')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  await app.listen(port, host);

  logger.log(`Application running at: ${await app.getUrl()}/api`);
}

bootstrap();
