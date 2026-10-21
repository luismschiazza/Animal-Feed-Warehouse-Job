import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { configureApp } from '../src/common/bootstrap/app-setup';

// Separate process: exercise REAL AppModule wiring without Jest's ESM/Faker loader.
async function main() {
  const uri = process.env.SESSIONS_TEST_MONGO_URL;
  if (!uri) throw new Error('Set SESSIONS_TEST_MONGO_URL to an isolated server');
  const selected = new URL(uri);
  if (selected.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(selected.hostname))
    throw new Error('Root smoke requires the dedicated local MongoDB');
  const database = `audit_root_test_${randomUUID().replace(/-/g, '')}`;
  selected.pathname = '/' + database;
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URL = selected.toString();
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '3000';
  process.env.JWT_SECRET = 'root-smoke-only-secret-never-use-in-production';
  process.env.JWT_EXPIRES_IN = '15m';
  process.env.MAIL_USER = 'unused@example.invalid';
  process.env.MAIL_PASS = 'unused-test-value';
  const { AppModule } = await import('../src/app/app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  const connection = app.get<Connection>(getConnectionToken());
  try {
    if (connection.name !== database) throw new Error('Unexpected test database');
    for (const name of ['SecurityAuditRecord', 'SessionRevocation']) {
      await connection.models[name].createCollection();
      await connection.models[name].createIndexes();
    }
    configureApp(app, app.get(ConfigService), { validatorContainerModule: AppModule });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    await connection.models.User.create({
      name: 'Root smoke',
      email: 'root@example.invalid',
      password: await hash('smoke-only-password', 4),
      status: 'active',
      roles: ['CUSTOMER'],
    });
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'root@example.invalid', password: 'smoke-only-password' }),
    });
    if (login.status !== 201) throw new Error('Root login failed');
    const loginBody = (await login.json()) as { payload: { access_token: string } };
    const pair = loginBody.payload;
    const headers = { Authorization: `Bearer ${pair.access_token}` };
    const own = await fetch(base + '/api/audit/own-events', { headers });
    if (
      own.status !== 200 ||
      !((await own.json()) as { payload: { items: unknown[] } }).payload.items.length
    )
      throw new Error('Root scoped audit failed');
    const forbidden = await fetch(base + '/api/audit/organization-events', { headers });
    if (forbidden.status !== 403) throw new Error('Root personal tenant bypass');
    if (
      !(await connection.models.SecurityAuditRecord.countDocuments({
        event: 'authorization',
        result: 'denied',
      }))
    )
      throw new Error('Root denial not persisted');
    const missing = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (
      missing.status !== 401 ||
      !(await connection.models.SecurityAuditRecord.countDocuments({
        event: 'login',
        phase: 'http',
        result: 'denied',
      }))
    )
      throw new Error('Root prefixed login failure not audited');
    console.info(
      'PASS real AppModule smoke: login, audit persistence/read, personal tenant denial and prefixed login failure.',
    );
  } finally {
    if (connection.name === database) await connection.dropDatabase();
    await app.close();
  }
}
main().catch((error: Error) => {
  console.error('FAIL isolated real AppModule security smoke:', error.message);
  process.exitCode = 1;
});
