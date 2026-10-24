import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { AuthSessionsService } from '@/features/auth/services/auth-sessions.service';
import { SessionSerializationService } from '@/features/auth/services/session-serialization.service';
import { generateRefreshToken } from '@/features/auth/tokens/refresh-token';

// Two independent Nest applications, pools and driver sessions; one disposable database.
// Never reads application MONGO_URL, never imports dotenv, never sends email.
describe('#17 atomic admission — two independent HTTP instances / real replica set', () => {
  jest.setTimeout(120_000);
  const database = `sessions_test_atomic_${randomUUID().replace(/-/g, '')}`;
  const password = 'disposable-only-password';
  let apps: INestApplication[],
    db: Connection,
    uid: Types.ObjectId,
    a: Types.ObjectId,
    b: Types.ObjectId;
  const model = (name: string): Model<any> => db.models[name];

  async function instance() {
    const uri = process.env.SESSIONS_TEST_MONGO_URL;
    if (!uri) throw new Error('Explicit disposable SESSIONS_TEST_MONGO_URL required');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'disposable-only-jwt-secret' })],
        }),
        MongooseModule.forRoot(uri, { dbName: database, serverSelectionTimeoutMS: 5_000 }),
        EventEmitterModule.forRoot(),
        AuthModule,
        AuthorizationModule,
      ],
    }).compile();
    const connection = module.get<Connection>(getConnectionToken());
    for (const name of [
      'SecurityAuditRecord',
      'SessionRevocation',
      'SessionLimitRevision',
      'SessionSerialization',
    ]) {
      await connection.models[name].createCollection();
      await connection.models[name].createIndexes();
    }
    const fence = connection.models.SessionSerialization;
    if (!(await fence.exists({ _id: SESSION_LIMIT_APPLICATION })))
      await fence.create({ _id: SESSION_LIMIT_APPLICATION, sequence: 0, serverNow: new Date() });
    await Promise.all(Object.values(connection.models).map((m) => m.init()));
    const app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const context = app.get(AuditContext);
    app.use((req, res, next) =>
      context.run(req, () => {
        res.setHeader('X-Request-Id', context.get().requestId);
        next();
      }),
    );
    await app.init();
    return app;
  }
  beforeAll(async () => {
    apps = [await instance(), await instance()];
    db = apps[0].get(getConnectionToken());
  });
  beforeEach(async () => {
    for (const name of [
      'AuthSession',
      'SessionRevocation',
      'SessionLimitRevision',
      'SecurityAuditRecord',
      'OrganizationMembership',
      'Organization',
      'User',
    ])
      await model(name).deleteMany({});
    const user = await model('User').create({
      name: 'Disposable',
      email: 'atomic@example.test',
      password: await bcrypt.hash(password, 4),
      status: 'active',
      roles: ['CUSTOMER'],
    });
    uid = user._id;
    a = (await model('Organization').create({ name: 'A' }))._id;
    b = (await model('Organization').create({ name: 'B' }))._id;
    for (const org of [a, b])
      await model('OrganizationMembership').create({
        userId: uid,
        organizationId: org,
        status: 'active',
        roles: ['SYSTEM_ADMIN'],
      });
  });
  afterAll(async () => {
    if (db?.name === database) await db.dropDatabase();
    for (const app of apps ?? []) await app.close();
  });
  const login = (i = 0, org: Types.ObjectId | null = a) =>
    request(apps[i].getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'atomic@example.test',
        password,
        ...(org ? { organizationId: org.toString() } : {}),
      });
  const patch = (token: string, limit: number, expectedVersion: number, i = 0) =>
    request(apps[i].getHttpServer())
      .patch('/api/auth/organization-session-limit')
      .auth(token, { type: 'bearer' })
      .send({ limit, expectedVersion });
  const revoke = (token: string, path: string, i = 0) =>
    request(apps[i].getHttpServer()).delete(path).auth(token, { type: 'bearer' });
  async function active(org: Types.ObjectId = a) {
    const revocations = apps[0].get(AuthSessionsService);
    const page = await revocations.listOrganizationActive(
      org.toString(),
      generateRefreshToken().sessionId,
      100,
    );
    return page.items;
  }
  async function simultaneous(count: number, operation: (i: number) => PromiseLike<any>) {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobs = Array.from({ length: count }, (_, i) =>
      (async () => {
        await gate;
        return operation(i);
      })(),
    );
    release();
    return Promise.all(jobs);
  }

  it('admits exactly 3 of 12 simultaneous logins, five rounds, with both instances at a deterministic pre-admission barrier', async () => {
    for (let round = 0; round < 5; round++) {
      await model('AuthSession').deleteMany({});
      let arrived = 0,
        release: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spies = apps.map((app) => {
        const service = app.get(AuthSessionsService),
          original = service.create.bind(service);
        return jest.spyOn(service, 'create').mockImplementation(async (...args) => {
          if (++arrived === 12) release();
          await gate;
          return original(...args);
        });
      });
      try {
        const results = await simultaneous(12, (i) => login(i % 2));
        expect(results.filter((r) => r.status === 201)).toHaveLength(3);
        expect(results.filter((r) => r.status === 409)).toHaveLength(9);
        expect(await active()).toHaveLength(3);
        expect(
          new Set(results.filter((r) => r.status === 201).map((r) => r.body.session_id)).size,
        ).toBe(3);
        for (const denied of results.filter((r) => r.status !== 201))
          expect(denied.body).not.toHaveProperty('refresh_token');
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
    }
  });
  it('isolates A/B, another identity and personal context without inventing a personal numeric quota', async () => {
    const results = await simultaneous(18, (i) => login(i % 2, i < 6 ? a : i < 12 ? b : null));
    expect(results.slice(0, 6).filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.slice(6, 12).filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.slice(12).every((r) => r.status === 201)).toBe(true);
    const other = new Types.ObjectId();
    await apps[1].get(AuthSessionsService).create(other.toString(), {}, a.toString());
    expect(await model('AuthSession').countDocuments({ userId: other, organizationId: a })).toBe(1);
    expect(await active(a)).toHaveLength(4);
    expect(await active(b)).toHaveLength(3);
  });
  it('releases expired capacity without TTL and ignores a deliberately skewed Node clock for authentication', async () => {
    const first = await login().expect(201);
    await login().expect(201);
    await login().expect(201);
    await model('AuthSession').updateOne(
      { sessionId: first.body.session_id },
      { $set: { expiresAt: new Date(0) } },
    );
    expect(await model('AuthSession').countDocuments()).toBe(3);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      await expect(
        apps[1].get(AuthSessionsService).findActive(first.body.session_id, uid.toString()),
      ).rejects.toThrow();
    } finally {
      clock.mockRestore();
    }
    await login(1).expect(201);
    expect(await active()).toHaveLength(3);
  });
  it('treats expiration during an admission conservatively and frees capacity on the next attempt', async () => {
    const first = await login().expect(201);
    await login().expect(201);
    await login().expect(201);
    const expires = new Date(Date.now() + 1000);
    await model('AuthSession').updateOne(
      { sessionId: first.body.session_id },
      { $set: { expiresAt: expires } },
    );
    const coordinator = apps[1].get(SessionSerializationService),
      original = coordinator.run.bind(coordinator);
    const spy = jest.spyOn(coordinator, 'run').mockImplementation((work) =>
      original(async (session, now, sequence) => {
        expect(now.getTime()).toBeLessThan(expires.getTime());
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return work(session, now, sequence);
      }),
    );
    try {
      await login(1).expect(409);
    } finally {
      spy.mockRestore();
    }
    await login().expect(201);
    expect(await active()).toHaveLength(3);
  });
  it('specific logical revocation releases one slot; concurrent refresh and admission never create capacity', async () => {
    const one = await login().expect(201),
      two = await login(1).expect(201);
    await login().expect(201);
    await revoke(one.body.access_token, `/api/auth/sessions/${two.body.session_id}`, 1).expect(200);
    expect(
      (await model('AuthSession').findOne({ sessionId: two.body.session_id })).revokedAt,
    ).toBeNull();
    const results = await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => login(i % 2)),
      request(apps[1].getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: one.body.refresh_token }),
    ]);
    expect(results.slice(0, 6).filter((r) => r.status === 201)).toHaveLength(1);
    expect(results[6].status).toBe(200);
    expect(await active()).toHaveLength(3);
  });
  it('replay releases capacity through the authoritative rule while preserving strict refresh CAS', async () => {
    const one = await login().expect(201);
    await login().expect(201);
    await login().expect(201);
    const refresh = () =>
      request(apps[1].getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: one.body.refresh_token });
    await refresh().expect(200);
    await refresh().expect(401);
    expect(await active()).toHaveLength(2);
    await login(1).expect(201);
    await login().expect(409);
  });
  it('serializes global-others and organizational revocation, preserving excluded current and unrelated B/personal', async () => {
    const one = await login().expect(201);
    await login(1).expect(201);
    await login().expect(201);
    await login(1, b).expect(201);
    await login(0, null).expect(201);
    await revoke(one.body.access_token, '/api/auth/sessions/others', 1).expect(200);
    expect(await active()).toHaveLength(1);
    expect(await active(b)).toHaveLength(0);
    const newerB = await login(1, b).expect(201),
      personal = await login(0, null).expect(201);
    const results = await Promise.all([
      revoke(one.body.access_token, '/api/auth/organization-sessions', 1),
      ...Array.from({ length: 6 }, (_, i) => login(i % 2)),
    ]);
    expect(results[0].status).toBe(200);
    expect((await active()).length).toBeLessThanOrEqual(3);
    for (const current of [newerB, personal])
      await apps[1].get(AuthSessionsService).findActive(current.body.session_id, uid.toString());
    expect(await model('SessionRevocation').countDocuments()).toBe(2);
  });
  it('orders new births after global cutoffs even when timestamps are exactly equal; legacy rules retain date semantics', async () => {
    const one = await login().expect(201);
    await revoke(one.body.access_token, '/api/auth/sessions', 1).expect(200);
    const later = await login(1).expect(201);
    const rule = await model('SessionRevocation').findOne({ scope: 'user' });
    await model('AuthSession').collection.updateOne(
      { sessionId: later.body.session_id },
      { $set: { createdAt: rule.revokedBefore } },
    );
    await apps[0].get(AuthSessionsService).findActive(later.body.session_id, uid.toString());
    expect(await active()).toHaveLength(1);
    await model('SessionRevocation').collection.insertOne({
      scope: 'user',
      action: 'revoke_all',
      targetUserId: uid,
      revokedBefore: new Date(Date.now() + 60_000),
    });
    await expect(
      apps[0].get(AuthSessionsService).findActive(later.body.session_id, uid.toString()),
    ).rejects.toThrow();
    expect(await active()).toHaveLength(0);
  });
  it('serializes reduction with admissions, keeps existing sessions, blocks until below reduced limit, then applies a raise', async () => {
    const one = await login().expect(201);
    await login().expect(201);
    const results = await Promise.all([
      patch(one.body.access_token, 1, 0, 1),
      ...Array.from({ length: 8 }, (_, i) => login(i % 2)),
    ]);
    expect(results[0].status).toBe(200);
    const rows = await model('AuthSession').find({ organizationId: a });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(await model('SessionRevocation').countDocuments()).toBe(0);
    for (const row of rows)
      await apps[1].get(AuthSessionsService).findActive(row.sessionId, uid.toString());
    await login(1).expect(409);
    await patch(one.body.access_token, 4, 1).expect(200);
    const more = await simultaneous(6, (i) => login(i % 2));
    expect(more.filter((r) => r.status === 201)).toHaveLength(4 - rows.length);
    expect(await active()).toHaveLength(4);
  });
  it('counts pre-protocol legacy sessions above the quota without revoking or silently assigning metadata', async () => {
    const owner = await login().expect(201);
    for (let i = 0; i < 4; i++) {
      const credential = generateRefreshToken();
      await model('AuthSession').create({
        sessionId: credential.sessionId,
        userId: uid,
        organizationId: a,
        currentTokenId: credential.tokenId,
        currentTokenHash: credential.tokenHash,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
    }
    const before = await model('AuthSession').collection.find({ organizationId: a }).toArray();
    await login(1).expect(409);
    expect(await active()).toHaveLength(5);
    expect(await model('AuthSession').collection.find({ organizationId: a }).toArray()).toEqual(
      before,
    );
    expect(await model('SessionRevocation').countDocuments()).toBe(0);
    await patch(owner.body.access_token, 6, 0, 1).expect(200);
    await login(1).expect(201);
    await login().expect(409);
  });
  it('aborts partial session insertion when transactional audit insert is rejected by MongoDB', async () => {
    await db.db.command({
      collMod: 'security_audit_events',
      validator: { event: { $ne: AuditEvent.SESSION_ADMISSION } },
      validationAction: 'error',
    });
    try {
      await login().expect(503);
    } finally {
      await db.db.command({ collMod: 'security_audit_events', validator: {} });
    }
    expect(await model('AuthSession').countDocuments()).toBe(0);
    expect(
      await model('SecurityAuditRecord').countDocuments({ event: AuditEvent.SESSION_ADMISSION }),
    ).toBe(0);
    await login(1).expect(201);
  });
  it('post-commit login audit failure returns no credentials, retains counted sessions, and recovers only by explicit owner revocation', async () => {
    await db.db.command({
      collMod: 'security_audit_events',
      validator: { $nor: [{ event: AuditEvent.LOGIN, result: 'allowed' }] },
      validationAction: 'error',
    });
    try {
      for (let i = 0; i < 3; i++) {
        const r = await login(i % 2).expect(503);
        expect(r.body).not.toHaveProperty('access_token');
      }
      await login(1).expect(409);
      expect(await active()).toHaveLength(3);
    } finally {
      await db.db.command({ collMod: 'security_audit_events', validator: {} });
    }
    const personal = await login(1, null).expect(201);
    const list = await request(apps[1].getHttpServer())
      .get('/api/auth/sessions')
      .auth(personal.body.access_token, { type: 'bearer' })
      .expect(200);
    const target = list.body.items.find((item) => item.organizationId === a.toString());
    await revoke(personal.body.access_token, `/api/auth/sessions/${target.sessionId}`, 1).expect(
      200,
    );
    await login().expect(201);
    expect(await active()).toHaveLength(3);
  });
  it('recovers a genuinely abandoned transaction after a child process is killed, without an orphan reservation/session', async () => {
    const worker = spawn(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        '-r',
        'tsconfig-paths/register',
        'test/atomic-crash.worker.ts',
      ],
      {
        env: { ...process.env, ADMISSION_CRASH_DATABASE: database },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => reject(new Error('Crash worker did not reach barrier')),
          20_000,
        );
        worker.stdout.on('data', (data) => {
          output += String(data);
          if (output.includes('transaction-held')) {
            clearTimeout(timer);
            resolve();
          }
        });
        worker.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        worker.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Worker exited before barrier'));
        });
      });
      expect(await model('AuthSession').countDocuments()).toBe(0);
      worker.kill('SIGKILL');
      await new Promise<void>((resolve) => worker.once('exit', () => resolve()));
      await login(1).expect(201);
      expect(await model('AuthSession').countDocuments()).toBe(1);
    } finally {
      if (worker.exitCode === null) worker.kill('SIGKILL');
    }
  });
  it('real database lock timeout fails closed and recovers after the lock owner aborts', async () => {
    await db.db.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 60 });
    const held = await db.startSession();
    held.startTransaction();
    try {
      await model('SessionSerialization').updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $inc: { sequence: 1 } },
        { session: held },
      );
      const failed = await login(1).expect(503);
      expect(failed.body).not.toHaveProperty('refresh_token');
      expect(await model('AuthSession').countDocuments()).toBe(0);
    } finally {
      await held.abortTransaction();
      await held.endSession();
      await db.db.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 5 });
    }
    await login().expect(201);
  });
  it('keeps snapshot session reads available under write contention; both A/B admissions fail bounded and recover', async () => {
    const first = await login().expect(201),
      second = await login(1, b).expect(201);
    const before = await model('SessionSerialization')
      .findById(SESSION_LIMIT_APPLICATION)
      .lean<{ sequence: number }>();
    await db.db.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 60 });
    const held = await db.startSession();
    held.startTransaction();
    let timer: ReturnType<typeof setTimeout>;
    try {
      await model('SessionSerialization').updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $inc: { sequence: 1 } },
        { session: held },
      );
      const reads = Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          request(apps[i % 2].getHttpServer())
            .get('/api/auth/sessions')
            .auth((i % 2 ? second : first).body.access_token, { type: 'bearer' })
            .expect(200),
        ),
      );
      await Promise.race([
        reads,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Read-only session queries blocked behind write fence')),
            5000,
          );
        }),
      ]);
      clearTimeout(timer);
      expect(
        (await model('SessionSerialization').findById(SESSION_LIMIT_APPLICATION)).sequence,
      ).toBe(before.sequence);
      const denied = await Promise.all([login(0, a), login(1, b)]);
      expect(denied.map((r) => r.status)).toEqual([503, 503]);
      for (const response of denied) expect(response.body).not.toHaveProperty('refresh_token');
      expect(await model('AuthSession').countDocuments()).toBe(2);
      expect(await model('SessionRevocation').countDocuments()).toBe(0);
    } finally {
      clearTimeout(timer);
      await held.abortTransaction();
      await held.endSession();
      await db.db.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 5 });
    }
    await login(1, a).expect(201);
    await login(0, b).expect(201);
  });
  it('retries a real dropped commit connection without duplicating sessions or admission receipts', async () => {
    await db.db.admin().command({
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: { failCommands: ['commitTransaction'], closeConnection: true },
    });
    try {
      await login(1).expect(201);
    } finally {
      await db.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
    }
    expect(await model('AuthSession').countDocuments()).toBe(1);
    expect(
      await model('SecurityAuditRecord').countDocuments({
        event: AuditEvent.SESSION_ADMISSION,
        result: 'allowed',
      }),
    ).toBe(1);
  });
  it('rejects a watermark regression introduced AFTER the old separate clock check', async () => {
    const one = await login().expect(201);
    const service = apps[1].get(AuthSessionsService);
    const collection = model('SessionSerialization');
    const before = await collection.findById(SESSION_LIMIT_APPLICATION).lean<{ serverNow: Date }>();
    // Reproduce the two commands used before review: clock passes, watermark changes,
    // then the independent session query still returns an active row (the demonstrated bug).
    const [check] = await collection
      .aggregate([
        { $match: { _id: SESSION_LIMIT_APPLICATION } },
        { $project: { usable: { $gte: ['$$NOW', '$serverNow'] } } },
      ])
      .readConcern('majority');
    expect(check.usable).toBe(true);
    await collection.updateOne(
      { _id: SESSION_LIMIT_APPLICATION },
      { $set: { serverNow: new Date(Date.now() + 3_600_000) } },
    );
    try {
      expect(
        await model('AuthSession').findOne({
          sessionId: one.body.session_id,
          revokedAt: null,
          $expr: { $gt: ['$expiresAt', '$$NOW'] },
        }),
      ).not.toBeNull();
      await expect(service.findActive(one.body.session_id, uid.toString())).rejects.toThrow(
        'clock unavailable',
      );
      await expect(
        service.findTarget(one.body.session_id, { userId: uid.toString() }),
      ).rejects.toThrow('clock unavailable');
      await expect(service.listOwnedActive(uid.toString(), one.body.session_id)).rejects.toThrow(
        'clock unavailable',
      );
      await expect(
        service.listOrganizationActive(a.toString(), one.body.session_id),
      ).rejects.toThrow('clock unavailable');
      await expect(service.rotate(one.body.refresh_token)).rejects.toThrow('clock unavailable');
      expect(
        (await model('AuthSession').findOne({ sessionId: one.body.session_id })).rotationVersion,
      ).toBe(0);
    } finally {
      await collection.updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $set: { serverNow: before.serverNow } },
      );
    }
    const active = await service.findActive(one.body.session_id, uid.toString());
    expect(active).not.toHaveProperty('currentTokenHash');
    expect(active).not.toHaveProperty('consumedTokens');
  });
  it('returns no refreshed credential if the watermark changes after the CAS; the consumed verifier is not restored', async () => {
    const one = await login().expect(201),
      service = apps[1].get(AuthSessionsService);
    const fence = model('SessionSerialization');
    const before = await fence.findById(SESSION_LIMIT_APPLICATION).lean<{ serverNow: Date }>();
    const sessionModel = apps[1].get<Connection>(getConnectionToken()).models.AuthSession;
    const original = sessionModel.findOneAndUpdate.bind(sessionModel);
    const spy = jest
      .spyOn(sessionModel, 'findOneAndUpdate')
      .mockImplementation((...args: any[]) => {
        const query = original(...args),
          exec = query.exec.bind(query);
        query.exec = (async () => {
          const result = await exec();
          await fence.updateOne(
            { _id: SESSION_LIMIT_APPLICATION },
            { $set: { serverNow: new Date(Date.now() + 3_600_000) } },
          );
          return result;
        }) as any;
        return query;
      });
    try {
      await expect(service.rotate(one.body.refresh_token)).rejects.toThrow('clock unavailable');
      expect(
        (await model('AuthSession').findOne({ sessionId: one.body.session_id })).rotationVersion,
      ).toBe(1);
      expect(await model('SessionRevocation').countDocuments()).toBe(0);
    } finally {
      spy.mockRestore();
      await fence.updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $set: { serverNow: before.serverNow } },
      );
    }
    await expect(service.rotate(one.body.refresh_token)).rejects.toThrow();
    expect(await model('SessionRevocation').countDocuments({ action: 'refresh_reuse' })).toBe(1);
  });
  it('blocks admissions and existing authentication on database clock rollback without revoking anything', async () => {
    const one = await login().expect(201);
    const before = await model('SessionSerialization')
      .findById(SESSION_LIMIT_APPLICATION)
      .lean<{ serverNow: Date }>();
    await model('SessionSerialization').updateOne(
      { _id: SESSION_LIMIT_APPLICATION },
      { $set: { serverNow: new Date(Date.now() + 3_600_000) } },
    );
    try {
      await login(1).expect(503);
      await expect(
        apps[1].get(AuthSessionsService).findActive(one.body.session_id, uid.toString()),
      ).rejects.toThrow('clock unavailable');
      expect(await model('SessionRevocation').countDocuments()).toBe(0);
      expect(await model('AuthSession').countDocuments()).toBe(1);
    } finally {
      await model('SessionSerialization').updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $set: { serverNow: before.serverNow } },
      );
    }
    await apps[1].get(AuthSessionsService).findActive(one.body.session_id, uid.toString());
  });
  it('fails closed on missing coordination metadata, corrupt configuration or unsafe TTL, and never exposes secrets in receipts', async () => {
    const fence = await model('SessionSerialization').findById(SESSION_LIMIT_APPLICATION).lean();
    await model('SessionSerialization').deleteMany({});
    try {
      await login().expect(503);
      await expect(apps[1].get(SessionSerializationService).onModuleInit()).rejects.toThrow();
    } finally {
      await model('SessionSerialization').create(fence);
    }
    await model('SessionSerialization').collection.createIndex(
      { serverNow: 1 },
      { expireAfterSeconds: 3600, name: 'unsafe_atomic_ttl' },
    );
    try {
      await expect(apps[0].get(SessionSerializationService).onModuleInit()).rejects.toThrow();
    } finally {
      await model('SessionSerialization').collection.dropIndex('unsafe_atomic_ttl');
    }
    await model('SessionLimitRevision').collection.insertOne({
      applicationId: SESSION_LIMIT_APPLICATION,
      organizationId: a,
      limit: 0,
      version: 1,
    });
    await login(1).expect(503);
    await model('SessionLimitRevision').deleteMany({});
    const success = await login().expect(201);
    const receipt = await model('SecurityAuditRecord')
      .findOne({ event: AuditEvent.SESSION_ADMISSION })
      .lean<{ requestId: string; organizationId: Types.ObjectId }>();
    expect(receipt.requestId).toBe(success.headers['x-request-id']);
    expect(receipt.organizationId.toString()).toBe(a.toString());
    const serialized = JSON.stringify(receipt);
    for (const secret of [password, success.body.access_token, success.body.refresh_token])
      expect(serialized).not.toContain(secret);
  });
});
