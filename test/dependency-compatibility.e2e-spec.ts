import {
  Controller,
  Get,
  INestApplication,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import * as handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import * as request from 'supertest';

// Deliberately isolated fixture, NOT an application route or an auth bypass.
@Controller('dependency-probe')
class DependencyProbe {
  @Get()
  read() {
    return { ok: true };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 32 } }))
  upload(@UploadedFile() file: { size: number }) {
    return { size: file.size };
  }
}

describe('Dependency compatibility — no database or external mail', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [DependencyProbe] }).compile();
    app = module.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Dependency fixture').setVersion('1').build(),
    );
    SwaggerModule.setup('docs', app, document);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('serves JSON and YAML OpenAPI with the targeted js-yaml override', async () => {
    const json = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(json.body.paths['/dependency-probe']).toBeDefined();
    const yaml = await request(app.getHttpServer()).get('/docs-yaml').expect(200);
    expect(yaml.text).toContain('Dependency fixture');
    await request(app.getHttpServer()).get('/dependency-probe').expect(200, { ok: true });
  });
  it('accepts bounded multipart input and rejects over-limit upload with Multer 2.5', async () => {
    await request(app.getHttpServer())
      .post('/dependency-probe')
      .attach('file', Buffer.from('safe'), 'safe.txt')
      .expect(201, { size: 4 });
    await request(app.getHttpServer())
      .post('/dependency-probe')
      .attach('file', Buffer.alloc(64), 'large.txt')
      .expect(413);
  });
  it('uses the Nodemailer CJS API and built-in types without SMTP/network delivery', async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const html = handlebars.compile('<p>{{name}}</p>')({ name: '<unsafe>' });
      expect(html).toBe('<p>&lt;unsafe&gt;</p>');
      const result = await transport.sendMail({
        from: 'sender@example.invalid',
        to: 'recipient@example.invalid',
        subject: 'Offline compatibility',
        html,
      });
      expect(result.envelope.to).toEqual(['recipient@example.invalid']);
      expect(result.message.toString()).toContain('Offline compatibility');
      expect(result.message.toString()).toContain('&lt;unsafe&gt;');
    } finally {
      transport.close();
    }
  });
});
