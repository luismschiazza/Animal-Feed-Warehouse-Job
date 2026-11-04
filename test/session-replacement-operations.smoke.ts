import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection } from 'mongoose';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { verifyReplacementIndexes } from '@/features/auth/schemas/session-replacement.schema';

const execute = promisify(execFile);
let phase = 'setup';
const check = (condition: unknown) => {
  if (!condition) throw new Error('Replacement operations assertion failed');
};
async function mustDeny(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if ((error as { code?: number }).code === 13) return;
    throw error;
  }
  throw new Error('Unexpected runtime privilege');
}
async function main() {
  if (!process.env.AUDIT_TEST_ADMIN_URL)
    throw new Error('Explicit disposable authenticated URI required');
  const selected = new URL(process.env.AUDIT_TEST_ADMIN_URL);
  if (selected.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(selected.hostname))
    throw new Error('Dedicated local MongoDB required');
  const database = `replacement_acl_test_${randomUUID().replace(/-/g, '')}`;
  selected.pathname = '/' + database;
  selected.searchParams.set('authSource', 'admin');
  async function moduleFor(uri: string) {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'disposable-replacement-jwt-secret' })],
        }),
        MongooseModule.forRoot(uri, { dbName: database, autoCreate: false, autoIndex: false }),
        EventEmitterModule.forRoot(),
        AuthModule,
        AuthorizationModule,
      ],
    }).compile();
  }
  const operator = await moduleFor(selected.toString());
  const admin = operator.get<Connection>(getConnectionToken());
  let app: INestApplication;
  try {
    // This smoke runs in its OWN fresh development container; previous jobs' dist is not shared.
    // Always compile this checkout, never accidentally certify a stale/local prebuilt CLI.
    phase = 'compile-current-checkout';
    const preexistingCompiledCli = existsSync(
      'dist/commands/initialize-session-replacement.script.js',
    );
    await execute(process.execPath, ['scripts/build-with-tsc.cjs'], { timeout: 60_000 });
    check(existsSync('dist/commands/initialize-session-replacement.script.js'));
    console.info(
      `PASS current-checkout CLI build; preexisting_compiled_cli=${preexistingCompiledCli}`,
    );
    phase = 'operator-storage';
    for (const model of Object.values(admin.models)) {
      await model.createCollection();
      await model.createIndexes();
    }
    await admin.models.SessionSerialization.create({
      _id: SESSION_LIMIT_APPLICATION,
      sequence: 0,
      serverNow: new Date(),
    });
    // Both executable forms use an explicit operator URI, provision only storage and are idempotent.
    const env = {
      ...process.env,
      SESSION_REPLACEMENT_MONGO_URL: selected.toString(),
      MONGO_URL: 'mongodb://must-not-use.invalid/',
    };
    for (const args of [
      [
        'node_modules/ts-node/dist/bin.js',
        '-r',
        'tsconfig-paths/register',
        'src/commands/initialize-session-replacement.script.ts',
      ],
      ['dist/commands/initialize-session-replacement.script.js'],
    ]) {
      phase = args[0].startsWith('dist/') ? 'compiled-operator-cli' : 'source-operator-cli';
      await execute(process.execPath, args, { env, timeout: 60_000 });
    }
    check((await admin.models.SessionReplacement.countDocuments()) === 0);
    check((await admin.models.AuthSession.countDocuments()) === 0);
    check((await admin.models.User.countDocuments()) === 0);
    await verifyReplacementIndexes(admin.models.SessionReplacement);
    const missing = { ...env };
    delete missing.SESSION_REPLACEMENT_MONGO_URL;
    try {
      await execute(process.execPath, ['dist/commands/initialize-session-replacement.script.js'], {
        env: missing,
        timeout: 30_000,
      });
      throw new Error('Unexpected URI fallback');
    } catch (error) {
      check((error as { code?: number }).code === 1);
    }
    phase = 'restricted-runtime-http';
    const password = randomBytes(24).toString('hex');
    const uid = (
      await admin.models.User.create({
        name: 'Disposable',
        email: 'replacement-acl@example.test',
        password: await bcrypt.hash(password, 4),
        status: 'active',
        roles: ['CUSTOMER'],
      })
    )._id;
    const organization = await admin.models.Organization.create({
      name: 'Disposable organization',
    });
    await admin.models.OrganizationMembership.create({
      userId: uid,
      organizationId: organization._id,
      roles: ['CUSTOMER'],
      status: 'active',
    });
    const resource = (collection: string, actions: string[]) => ({
      resource: { db: database, collection },
      actions,
    });
    await admin.db.command({
      createRole: 'replacement_runtime',
      roles: [],
      privileges: [
        ...['users', 'organizations', 'organization_memberships'].map((name) =>
          resource(name, ['find']),
        ),
        ...['security_audit_events', 'auth_session_revocations', 'session_limit_revisions'].map(
          (name) => resource(name, ['find', 'insert', 'listIndexes']),
        ),
        resource('auth_sessions', ['find', 'insert', 'update', 'listIndexes']),
        resource('session_serialization', ['find', 'update', 'listIndexes']),
        resource('session_replacement_challenges', ['find', 'insert', 'update', 'listIndexes']),
      ],
    });
    const runtimePassword = randomBytes(32).toString('hex');
    await admin.db.command({
      createUser: 'replacement_runtime',
      pwd: runtimePassword,
      roles: [{ role: 'replacement_runtime', db: database }],
    });
    const runtime = new URL(selected);
    runtime.username = 'replacement_runtime';
    runtime.password = runtimePassword;
    runtime.searchParams.set('authSource', database);
    const module = await moduleFor(runtime.toString());
    const writer = module.get<Connection>(getConnectionToken());
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const context = app.get(AuditContext);
    app.use((req, _res, next) => context.run(req, next));
    await app.listen(0, '127.0.0.1');
    const http = () => request(app.getHttpServer());
    const credentials = {
      email: 'replacement-acl@example.test',
      password,
      organizationId: organization.id,
    };
    const old = [];
    for (let i = 0; i < 3; i++) {
      const r = await http().post('/api/auth/login').send(credentials);
      check(r.status === 201);
      old.push(r.body);
    }
    check((await http().post('/api/auth/login').send(credentials)).status === 409);
    const recoveryVerifier = randomBytes(32).toString('base64url');
    const recoveryChallenge = createHash('sha256')
      .update(recoveryVerifier, 'ascii')
      .digest('base64url');
    const begun = await http()
      .post('/api/auth/session-replacement/start')
      .send({ ...credentials, recoveryChallenge });
    check(begun.status === 201);
    const replacementToken = begun.body.replacement_token;
    check(
      (await http().post('/api/auth/session-replacement/sessions').send({ replacementToken }))
        .status === 200,
    );
    const confirmed = await http()
      .post('/api/auth/session-replacement/confirm')
      .send({ replacementToken, sessionId: old[1].session_id });
    check(confirmed.status === 200 && !!confirmed.body.access_token);
    check(
      (await http().get('/api/auth/sessions').auth(old[1].access_token, { type: 'bearer' }))
        .status === 401,
    );
    check(
      (await admin.models.SessionRevocation.countDocuments({ action: 'replace_session' })) === 1,
    );
    phase = 'restricted-runtime-recovery';
    const recoveryRequestId = randomUUID();
    const recovered = await http()
      .post('/api/auth/session-replacement/recover')
      .send({
        ...credentials,
        flowId: begun.body.recovery.flow_id,
        recoveryVerifier,
        recoveryRequestId,
      });
    check(recovered.status === 200 && !!recovered.body.access_token);
    check(recovered.body.session_id !== confirmed.body.session_id);
    check(
      (await http().get('/api/auth/sessions').auth(confirmed.body.access_token, { type: 'bearer' }))
        .status === 401,
    );
    check(
      (await http().post('/api/auth/refresh').send({ refreshToken: confirmed.body.refresh_token }))
        .status === 401,
    );
    const live = await http()
      .get('/api/auth/sessions')
      .auth(recovered.body.access_token, { type: 'bearer' });
    check(live.status === 200 && live.body.items.length === 3);
    check(
      (await admin.models.SessionRevocation.countDocuments({
        action: 'recover_session_replacement',
      })) === 1,
    );
    check(
      (
        await http()
          .post('/api/auth/session-replacement/recover')
          .send({
            ...credentials,
            flowId: begun.body.recovery.flow_id,
            recoveryVerifier,
            recoveryRequestId,
          })
      ).status === 409,
    );
    const next = await http()
      .post('/api/auth/session-replacement/recover')
      .send({
        ...credentials,
        flowId: begun.body.recovery.flow_id,
        recoveryVerifier,
        recoveryRequestId: randomUUID(),
      });
    check(next.status === 200 && next.body.recovery_version === 2);
    check(
      (await http().get('/api/auth/sessions').auth(recovered.body.access_token, { type: 'bearer' }))
        .status === 401,
    );
    check(
      (await http().get('/api/auth/sessions').auth(next.body.access_token, { type: 'bearer' })).body
        .items.length === 3,
    );
    phase = 'runtime-negative-acl';
    for (const collection of [
      'security_audit_events',
      'auth_session_revocations',
      'session_limit_revisions',
    ]) {
      await mustDeny(() =>
        writer.db.collection(collection).updateOne({}, { $set: { requestId: 'forged' } }),
      );
      await mustDeny(() => writer.db.collection(collection).deleteMany({}));
    }
    await mustDeny(() => writer.db.collection('session_replacement_challenges').deleteMany({}));
    await mustDeny(() =>
      writer.db
        .collection('session_replacement_challenges')
        .createIndex({ createdAt: 1 }, { expireAfterSeconds: 1 }),
    );
    await mustDeny(() => writer.db.dropCollection('session_replacement_challenges'));
    await mustDeny(() =>
      writer.db.command({ collMod: 'session_replacement_challenges', validator: {} }),
    );
    console.info(
      'PASS replacement and repeated recovery v2 authenticated HTTP/transaction/least-privilege ACL and source+compiled operator CLI; no runtime DDL or journal update/delete.',
    );
  } finally {
    await app?.close();
    if (admin.name === database) {
      await admin.db.command({ dropAllUsersFromDatabase: 1 });
      await admin.db.command({ dropAllRolesFromDatabase: 1 });
      await admin.dropDatabase();
    }
    await operator.close();
  }
}
void main().catch(() => {
  // Code-owned phase only: do not echo child errors/URIs/credentials into logs.
  console.error(`FAIL isolated session replacement operations smoke: ${phase}`);
  process.exitCode = 1;
});
