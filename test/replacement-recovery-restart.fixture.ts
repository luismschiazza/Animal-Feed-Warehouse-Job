// Disposable test child only. No dotenv, seed, DDL, real URI fallback or credentials in IPC/logs.
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { AuthModule } from '@/features/auth/auth.module';
import { AuthService } from '@/features/auth/services/auth.service';

async function main() {
  const uri = process.env.SESSIONS_TEST_MONGO_URL;
  const database = process.env.REPLACEMENT_RESTART_TEST_DATABASE;
  if (
    !uri ||
    !/^mongodb:\/\/(localhost|127\.0\.0\.1):\d+\//.test(uri) ||
    !/^sessions_test_replacement_[a-f0-9]{32}$/.test(database ?? '')
  )
    throw new Error('Explicit local disposable restart fixture required');
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => ({ JWT_SECRET: 'disposable-only-jwt-secret' })],
      }),
      MongooseModule.forRoot(uri, {
        dbName: database,
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 5000,
      }),
      EventEmitterModule.forRoot(),
      AuthModule,
      AuthorizationModule,
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const context = app.get(AuditContext);
  app.use((req, _res, next) => context.run(req, next));
  if (process.env.REPLACEMENT_RESTART_TEST_DROP_AFTER_COMMIT === '1') {
    const auth = app.get(AuthService);
    auth.completeReplacement = async () => {
      process.send?.({ event: 'replacement-committed' });
      return new Promise<never>(() => undefined); // parent kills this owned process after actual commit
    };
  }
  await app.listen(0, '127.0.0.1');
  process.send?.({ event: 'ready', port: app.getHttpServer().address().port });
  process.on('message', (message) => {
    if (message === 'stop') void app.close().then(() => process.exit(0));
  });
}
void main().catch(() => {
  process.send?.({ event: 'fixture-failed' });
  process.exitCode = 1;
});
