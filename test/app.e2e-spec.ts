import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppController } from '@/app/controllers/app.controller';
import { AppService } from '@/app/services/app.service';
import { configureApp } from '@/common/bootstrap/app-setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, ConfigService],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService), { validatorContainerModule: undefined });
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/api').expect(200).expect({
      payload: 'Hello World!',
      message: 'Request successfully processed',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
