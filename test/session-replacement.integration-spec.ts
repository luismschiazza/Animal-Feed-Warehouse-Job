import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { fork } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { join } from 'node:path';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { AuthSessionsService } from '@/features/auth/services/auth-sessions.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { SessionReplacementService } from '@/features/auth/services/session-replacement.service';
import { SessionRevocationsService } from '@/features/auth/services/session-revocations.service';
import { SessionSerializationService } from '@/features/auth/services/session-serialization.service';
import { generateReplacementToken } from '@/features/auth/tokens/session-replacement-token';

describe('#18 explicit replacement — two HTTP instances, real disposable replica set', () => {
  jest.setTimeout(120_000);
  const database = `sessions_test_replacement_${randomUUID().replace(/-/g, '')}`;
  const password = 'disposable-only-password';
  let apps: INestApplication[],
    db: Connection,
    uid: Types.ObjectId,
    a: Types.ObjectId,
    b: Types.ObjectId;
  const model = (name: string): Model<any> => db.models[name];
  async function instance() {
    if (!process.env.SESSIONS_TEST_MONGO_URL)
      throw new Error('Explicit disposable SESSIONS_TEST_MONGO_URL required');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'disposable-only-jwt-secret' })],
        }),
        MongooseModule.forRoot(process.env.SESSIONS_TEST_MONGO_URL, {
          dbName: database,
          serverSelectionTimeoutMS: 5_000,
        }),
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
      'SessionReplacement',
    ]) {
      await connection.models[name].createCollection();
      await connection.models[name].createIndexes();
    }
    if (!(await connection.models.SessionSerialization.exists({ _id: SESSION_LIMIT_APPLICATION })))
      await connection.models.SessionSerialization.create({
        _id: SESSION_LIMIT_APPLICATION,
        sequence: 0,
        serverNow: new Date(),
      });
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
    await app.listen(0, '127.0.0.1');
    return app;
  }
  beforeAll(async () => {
    apps = [await instance(), await instance()];
    db = apps[0].get(getConnectionToken());
  });
  beforeEach(async () => {
    for (const collection of [
      'auth_sessions',
      'auth_session_revocations',
      'security_audit_events',
      'session_replacement_challenges',
    ])
      await db.db.command({ collMod: collection, validator: {}, validationLevel: 'strict' });
    for (const name of [
      'SessionReplacement',
      'AuthSession',
      'SessionRevocation',
      'SessionLimitRevision',
      'SecurityAuditRecord',
      'OrganizationMembership',
      'Organization',
      'User',
    ])
      await model(name).deleteMany({});
    uid = (
      await model('User').create({
        name: 'Disposable',
        email: 'replacement@example.test',
        password: await bcrypt.hash(password, 4),
        status: 'active',
        roles: ['CUSTOMER'],
      })
    )._id;
    a = (await model('Organization').create({ name: 'A' }))._id;
    b = (await model('Organization').create({ name: 'B' }))._id;
    for (const organizationId of [a, b])
      await model('OrganizationMembership').create({
        userId: uid,
        organizationId,
        status: 'active',
        roles: ['SYSTEM_ADMIN'],
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (db?.name === database) await db.dropDatabase();
    for (const app of apps ?? []) await app.close();
  });
  const http = (i = 0) => request(apps[i].getHttpServer());
  const credentials = (org: Types.ObjectId | null = a) => ({
    email: 'replacement@example.test',
    password,
    ...(org ? { organizationId: org.toString() } : {}),
  });
  const login = (org: Types.ObjectId | null = a, i = 0) =>
    http(i).post('/api/auth/login').send(credentials(org));
  const start = (org: Types.ObjectId | null = a, i = 0) =>
    http(i).post('/api/auth/session-replacement/start').send(credentials(org));
  const flow = (action: string, token: string, extra = {}, i = 0) =>
    http(i)
      .post(`/api/auth/session-replacement/${action}`)
      .send({ replacementToken: token, ...extra });
  async function fill(org: Types.ObjectId = a) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const r = await login(org, i % 2);
      expect(r.status).toBe(201);
      rows.push(r.body);
    }
    return rows;
  }
  async function ticket(org: Types.ObjectId = a) {
    const r = await start(org);
    expect(r.status).toBe(201);
    return r.body.replacement_token as string;
  }
  async function active(org = a) {
    return (
      await apps[0]
        .get(AuthSessionsService)
        .listOrganizationActive(org.toString(), randomUUID(), 100)
    ).items;
  }
  const negative = (r: any) => {
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).not.toMatch(/access_token|refresh_token|replacement_token/);
  };
  async function rows() {
    return {
      sessions: await model('AuthSession').countDocuments(),
      rules: await model('SessionRevocation').countDocuments(),
    };
  }

  it('offers explicit capability at limit without granting a session; exposes minimal own-scope metadata and preserves old sessions on cancel', async () => {
    const old = await fill();
    negative(await login());
    const before = await rows(),
      token = await ticket();
    expect(await rows()).toEqual(before);
    const page = await flow('sessions', token);
    expect(page.status).toBe(200);
    expect(new Set(page.body.items.map((x) => x.sessionId))).toEqual(
      new Set(old.map((x) => x.session_id)),
    );
    expect(Object.keys(page.body.items[0]).sort()).toEqual([
      'createdAt',
      'device',
      'expiresAt',
      'lastUsedAt',
      'sessionId',
    ]);
    expect((await flow('cancel', token)).status).toBe(200);
    expect(await rows()).toEqual(before);
    for (const action of ['sessions', 'cancel', 'confirm'])
      negative(
        await flow(action, token, action === 'confirm' ? { sessionId: old[0].session_id } : {}),
      );
    for (const row of old)
      expect(
        (await http().get('/api/auth/sessions').auth(row.access_token, { type: 'bearer' })).status,
      ).toBe(200);
    const event = await model('SecurityAuditRecord').findOne({
      event: AuditEvent.REPLACEMENT_CANCEL,
      result: 'allowed',
    });
    expect(event.actorUserId.toString()).toBe(uid.toString());
    expect(event.organizationId.toString()).toBe(a.toString());
    expect(event.replacementFlowId).toBe(token.split('.')[1]);
    expect(
      await model('SecurityAuditRecord').countDocuments({
        event: AuditEvent.REPLACEMENT_START,
        replacementFlowId: event.replacementFlowId,
        result: 'allowed',
      }),
    ).toBe(1);
  });

  it('requires fresh password provenance and a reached explicit business quota; personal context has no invented quota', async () => {
    expect((await start()).status).toBe(409);
    expect((await start(null)).status).toBe(400);
    expect(
      (
        await http()
          .post('/api/auth/session-replacement/start')
          .send({ ...credentials(), password: 'wrong' })
      ).status,
    ).toBe(401);
    await expect(
      apps[0].get(SessionReplacementService).start({ id: uid.toString() } as any, a.toString()),
    ).rejects.toThrow('Password proof required');
    expect(await model('SessionReplacement').countDocuments()).toBe(0);
  });

  it('revokes only explicitly selected owned session, creates one admitted family and invalidates old JWT/refresh; replay is inert', async () => {
    const old = await fill(),
      token = await ticket(),
      selected = old[1];
    const response = await flow('confirm', token, { sessionId: selected.session_id });
    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeTruthy();
    expect(response.body.session_id).not.toBe(selected.session_id);
    expect(response.body.organization_id).toBe(a.toString());
    expect(await active()).toHaveLength(3);
    expect(
      (await http().get('/api/auth/sessions').auth(selected.access_token, { type: 'bearer' }))
        .status,
    ).toBe(401);
    negative(await http().post('/api/auth/refresh').send({ refreshToken: selected.refresh_token }));
    expect(
      (await http().get('/api/auth/sessions').auth(old[0].access_token, { type: 'bearer' })).status,
    ).toBe(200);
    const rule = await model('SessionRevocation').findOne({ action: 'replace_session' });
    expect(rule.targetSessionId).toBe(selected.session_id);
    expect(rule.actorSessionId).toBe(response.body.session_id);
    expect(rule.targetUserId.toString()).toBe(uid.toString());
    const admitted = await model('AuthSession').findOne({ sessionId: response.body.session_id });
    expect(admitted.admissionVersion).toBe(0);
    expect(admitted.admissionSequence).toBeGreaterThan(0);
    const selection = await model('SecurityAuditRecord').findOne({
      event: AuditEvent.REPLACEMENT_SELECTION,
      result: 'allowed',
    });
    expect(selection.requestId).toBe(rule.requestId);
    const before = await rows();
    negative(await flow('confirm', token, { sessionId: old[0].session_id }, 1));
    expect(await rows()).toEqual(before);
  });

  it('uses MongoDB expiry even when TTL has NOT removed the pending document', async () => {
    const old = await fill(),
      token = await ticket();
    const now = (await db.db.admin().command({ hello: 1 })).localTime as Date;
    await db.db
      .collection<{
        _id: string;
        createdAt: Date;
        expiresAt: Date;
      }>('session_replacement_challenges')
      .updateOne(
        { _id: token.split('.')[1] },
        {
          $set: {
            createdAt: new Date(now.getTime() - 180000),
            expiresAt: new Date(now.getTime() - 60000),
          },
        },
      );
    expect(await model('SessionReplacement').countDocuments()).toBe(1);
    const before = await rows();
    for (const action of ['sessions', 'cancel', 'confirm'])
      negative(
        await flow(action, token, action === 'confirm' ? { sessionId: old[0].session_id } : {}),
      );
    expect(await rows()).toEqual(before);
    expect((await start()).status).toBe(201); // expiry, not TTL deletion, releases pending-flow uniqueness
  });

  it('does not enqueue malformed/unknown/replayed capabilities on the global mutation fence', async () => {
    await fill();
    const token = await ticket();
    expect((await flow('cancel', token)).status).toBe(200);
    const fence = model('SessionSerialization');
    const before = (await fence.findById(SESSION_LIMIT_APPLICATION).lean()) as any;
    for (const value of ['x'.repeat(84), generateReplacementToken().token, token]) {
      negative(await flow('sessions', value));
      negative(await flow('cancel', value));
    }
    const after = (await fence.findById(SESSION_LIMIT_APPLICATION).lean()) as any;
    expect(after.sequence).toBe(before.sequence);
    expect(after.serverNow).toEqual(before.serverNow);
  });

  it('enforces one pending flow per identity/organization, without replacing its token or evicting sessions', async () => {
    await fill();
    const token = await ticket();
    const before = await rows();
    expect((await start(a, 1)).status).toBe(409);
    expect(await rows()).toEqual(before);
    expect((await flow('sessions', token)).status).toBe(200);
    expect((await flow('cancel', token)).status).toBe(200);
    expect((await start(a, 1)).status).toBe(201);
  });

  it('isolates A/B/personal/other owner and enforces exact audience in the service', async () => {
    const own = await fill(),
      other = await login(b),
      personal = await login(null);
    const stranger = await model('User').create({
      name: 'Other',
      email: 'other@example.test',
      password: await bcrypt.hash(password, 4),
      status: 'active',
    });
    await model('OrganizationMembership').create({
      userId: stranger._id,
      organizationId: a,
      status: 'active',
      roles: ['CUSTOMER'],
    });
    const foreign = await apps[0].get(AuthSessionsService).create(stranger.id, {}, a.toString());
    const token = await ticket(),
      before = await rows();
    for (const sid of [
      other.body.session_id,
      personal.body.session_id,
      foreign.sessionId,
      randomUUID(),
    ]) {
      negative(await flow('confirm', token, { sessionId: sid }));
      await expect(apps[1].get(SessionReplacementService).confirm(token, sid)).rejects.toThrow();
    }
    const list = await flow('sessions', token);
    expect(new Set(list.body.items.map((x) => x.sessionId))).toEqual(
      new Set(own.map((x) => x.session_id)),
    );
    negative(await flow('sessions', token.replace('sr1.', 'sr2.')));
    await db.db
      .collection<{ _id: string; applicationId: string }>('session_replacement_challenges')
      .updateOne({ _id: token.split('.')[1] }, { $set: { applicationId: 'another-application' } });
    await expect(
      apps[1].get(SessionReplacementService).confirm(token, own[0].session_id),
    ).rejects.toThrow();
    expect(await rows()).toEqual(before);
  });

  it('rejects client authority fields and capability-as-JWT/refresh on ordinary routes', async () => {
    const old = await fill(),
      token = await ticket();
    for (const field of ['userId', 'organizationId', 'applicationId', 'roles']) {
      expect(
        (await flow('confirm', token, { sessionId: old[0].session_id, [field]: b.toString() }))
          .status,
      ).toBe(400);
    }
    for (const route of [
      '/api/auth/sessions',
      '/api/auth/organization-session-limit',
      '/api/users',
    ])
      expect((await http().get(route).auth(token, { type: 'bearer' })).status).toBe(401);
    negative(await http().post('/api/auth/refresh').send({ refreshToken: token }));
    negative(await flow('confirm', old[0].refresh_token, { sessionId: old[0].session_id }));
    expect(await model('SessionRevocation').countDocuments()).toBe(0);
  });

  it.each(['account', 'organization', 'membership', 'password', 'recreated-membership'])(
    'revalidates live %s before selection with no side effects',
    async (kind) => {
      const old = await fill(),
        token = await ticket();
      if (kind === 'account')
        await model('User').updateOne({ _id: uid }, { $set: { status: 'suspended' } });
      if (kind === 'organization')
        await model('Organization').updateOne({ _id: a }, { $set: { status: 'suspended' } });
      if (kind === 'membership')
        await model('OrganizationMembership').updateOne(
          { userId: uid, organizationId: a },
          { $set: { status: 'suspended' } },
        );
      if (kind === 'password')
        await model('User').updateOne(
          { _id: uid },
          { $set: { password: await bcrypt.hash('changed-password', 4) } },
        );
      if (kind === 'recreated-membership') {
        await model('OrganizationMembership').deleteOne({ userId: uid, organizationId: a });
        await model('OrganizationMembership').create({
          userId: uid,
          organizationId: a,
          status: 'active',
          roles: ['SYSTEM_ADMIN'],
        });
      }
      const before = await rows();
      negative(await flow('confirm', token, { sessionId: old[0].session_id }));
      expect(await rows()).toEqual(before);
    },
  );

  it('uses current membership roles rather than elevating from the start-time role snapshot', async () => {
    const old = await fill(),
      token = await ticket();
    await model('OrganizationMembership').updateOne(
      { userId: uid, organizationId: a },
      { $set: { roles: ['CUSTOMER'] } },
    );
    const response = await flow('confirm', token, { sessionId: old[0].session_id });
    expect(response.status).toBe(200);
    const payload = JSON.parse(
      Buffer.from(response.body.access_token.split('.')[1], 'base64url').toString(),
    );
    expect(payload.roles).toEqual(['CUSTOMER']);
    expect(
      (
        await http()
          .patch('/api/auth/organization-session-limit')
          .auth(response.body.access_token, { type: 'bearer' })
          .send({ limit: 2, expectedVersion: 0 })
      ).status,
    ).toBe(403);
  });

  it('denies single-selection replacement after limit reduction rather than silently removing multiple sessions', async () => {
    const old = await fill(),
      token = await ticket();
    expect(
      (
        await http()
          .patch('/api/auth/organization-session-limit')
          .auth(old[0].access_token, { type: 'bearer' })
          .send({ limit: 1, expectedVersion: 0 })
      ).status,
    ).toBe(200);
    const before = await rows();
    expect((await flow('confirm', token, { sessionId: old[0].session_id })).status).toBe(409);
    expect(await rows()).toEqual(before);
    expect(await active()).toHaveLength(3);
    for (const row of old.slice(1))
      expect(
        (
          await http()
            .delete(`/api/auth/sessions/${row.session_id}`)
            .auth(old[0].access_token, { type: 'bearer' })
        ).status,
      ).toBe(200);
    const response = await flow('confirm', token, { sessionId: old[0].session_id });
    expect(response.status).toBe(200);
    expect(await active()).toHaveLength(1);
    expect(
      (await model('AuthSession').findOne({ sessionId: response.body.session_id }))
        .admissionVersion,
    ).toBe(1);
  });

  it.each(['confirm', 'cancel'])(
    'serializes confirm versus %s in independent pools with one winner',
    async (second) => {
      const old = await fill(),
        token = await ticket();
      let arrived = 0,
        release: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spies = apps.map((app) => {
        const serialization = app.get(SessionSerializationService),
          original = serialization.run.bind(serialization);
        return jest.spyOn(serialization, 'run').mockImplementation(async (work) => {
          if (++arrived === 2) release();
          await gate;
          return original(work);
        });
      });
      try {
        const results = await Promise.all([
          flow('confirm', token, { sessionId: old[0].session_id }, 0),
          flow(second, token, second === 'confirm' ? { sessionId: old[0].session_id } : {}, 1),
        ]);
        expect(arrived).toBe(2);
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(results.filter((r) => r.status === 401)).toHaveLength(1);
        const successes = results.filter((r) => r.status === 200 && r.body.access_token);
        expect(await model('SessionRevocation').countDocuments({ action: 'replace_session' })).toBe(
          successes.length,
        );
        expect(await model('AuthSession').countDocuments()).toBe(3 + successes.length);
        expect(await active()).toHaveLength(3);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    },
  );

  it.each(['consume', 'selection-audit', 'revocation', 'insert', 'completion-audit'])(
    'rolls back all state after a real MongoDB rejection at %s',
    async (stage) => {
      const old = await fill(),
        token = await ticket();
      const collections = {
        consume: 'session_replacement_challenges',
        'selection-audit': 'security_audit_events',
        revocation: 'auth_session_revocations',
        insert: 'auth_sessions',
        'completion-audit': 'security_audit_events',
      };
      const validator =
        stage === 'consume'
          ? { state: 'pending' }
          : stage === 'selection-audit'
            ? { event: { $ne: AuditEvent.REPLACEMENT_SELECTION } }
            : stage === 'completion-audit'
              ? { event: { $ne: AuditEvent.REPLACEMENT_CONFIRM } }
              : { impossible_test_field: { $exists: true } };
      await db.db.command({ collMod: collections[stage], validator, validationLevel: 'strict' });
      const before = await rows(),
        response = await flow('confirm', token, { sessionId: old[0].session_id });
      expect(response.status).toBe(503);
      negative(response);
      expect(await rows()).toEqual(before);
      expect((await model('SessionReplacement').findById(token.split('.')[1])).state).toBe(
        'pending',
      );
      expect(
        await model('SecurityAuditRecord').countDocuments({
          event: AuditEvent.REPLACEMENT_SELECTION,
          result: 'allowed',
        }),
      ).toBe(0);
      await db.db.command({
        collMod: collections[stage],
        validator: {},
        validationLevel: 'strict',
      });
      expect((await flow('confirm', token, { sessionId: old[0].session_id }, 1)).status).toBe(200);
    },
  );

  it('does not invent credentials/revive old session when response fails AFTER confirmed commit', async () => {
    const old = await fill(),
      token = await ticket();
    const spy = jest
      .spyOn(apps[0].get(AuthService), 'completeReplacement')
      .mockRejectedValueOnce(new ServiceUnavailableException('Injected after commit'));
    try {
      const result = await flow('confirm', token, { sessionId: old[0].session_id });
      expect(result.status).toBe(503);
      negative(result);
      expect(await rows()).toEqual({ sessions: 4, rules: 1 });
      expect(await active()).toHaveLength(3);
      negative(await flow('confirm', token, { sessionId: old[1].session_id }, 1));
      expect(await rows()).toEqual({ sessions: 4, rules: 1 });
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    { kind: 'clock', status: 503 },
    { kind: 'account', status: 401 },
    { kind: 'membership', status: 403 },
  ])(
    'rechecks live $kind after commit without resurrecting the replaced session',
    async ({ kind, status }) => {
      const old = await fill(),
        token = await ticket();
      const fence = model('SessionSerialization'),
        saved = (await fence.findById(SESSION_LIMIT_APPLICATION).lean()) as any;
      const auth = apps[0].get(AuthService),
        original = auth.completeReplacement.bind(auth);
      const spy = jest
        .spyOn(auth, 'completeReplacement')
        .mockImplementationOnce(async (...args) => {
          if (kind === 'clock')
            await fence.updateOne(
              { _id: SESSION_LIMIT_APPLICATION },
              { $set: { serverNow: new Date(Date.now() + 60000) } },
            );
          if (kind === 'account')
            await model('User').updateOne({ _id: uid }, { $set: { status: 'suspended' } });
          if (kind === 'membership')
            await model('OrganizationMembership').updateOne(
              { userId: uid, organizationId: a },
              { $set: { status: 'suspended' } },
            );
          return original(...args);
        });
      try {
        const response = await flow('confirm', token, { sessionId: old[0].session_id });
        expect(response.status).toBe(status);
        negative(response);
        expect(await rows()).toEqual({ sessions: 4, rules: 1 });
        expect((await model('SessionReplacement').findById(token.split('.')[1])).state).toBe(
          'consumed',
        );
      } finally {
        spy.mockRestore();
        if (kind === 'clock')
          await fence.updateOne(
            { _id: SESSION_LIMIT_APPLICATION },
            { $set: { serverNow: saved.serverNow } },
          );
      }
    },
  );

  it('returns no credentials on a real login-audit failure after the atomic replacement commit', async () => {
    const old = await fill(),
      token = await ticket();
    const audit = apps[0].get(SecurityAuditService),
      original = audit.record.bind(audit);
    const spy = jest.spyOn(audit, 'record').mockImplementation(async (...args) => {
      if (args[0] === AuditEvent.LOGIN && args[1] === 'allowed')
        throw new ServiceUnavailableException('Injected login audit failure');
      return original(...args);
    });
    try {
      const response = await flow('confirm', token, { sessionId: old[0].session_id });
      expect(response.status).toBe(503);
      negative(response);
      expect(await rows()).toEqual({ sessions: 4, rules: 1 });
      expect((await model('SessionReplacement').findById(token.split('.')[1])).state).toBe(
        'consumed',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('requires operational indexes without runtime repair and leaves normal login unchanged', async () => {
    await fill();
    await model('SessionReplacement').collection.dropIndex(
      'applicationId_1_userId_1_organizationId_1',
    );
    try {
      const before = await rows();
      expect((await start()).status).toBe(503);
      expect(await rows()).toEqual(before);
      expect((await login()).status).toBe(409);
      expect(
        (await model('SessionReplacement').collection.indexes()).some(
          (index) => index.name === 'applicationId_1_userId_1_organizationId_1',
        ),
      ).toBe(false);
    } finally {
      await model('SessionReplacement').createIndexes();
    }
  });

  it('rejects a stale/expired selected session without consumption, automatic fallback or eviction', async () => {
    const old = await fill(),
      token = await ticket();
    await model('AuthSession').updateOne(
      { sessionId: old[0].session_id },
      { $set: { expiresAt: new Date(0) } },
    );
    const before = await rows();
    negative(await flow('confirm', token, { sessionId: old[0].session_id }));
    expect(await rows()).toEqual(before);
    expect((await model('SessionReplacement').findById(token.split('.')[1])).state).toBe('pending');
    expect((await flow('confirm', token, { sessionId: old[1].session_id })).status).toBe(200);
    expect(await active()).toHaveLength(2);
  });

  it('fails closed on clock regression without consuming ticket or writing a revocation', async () => {
    const old = await fill(),
      token = await ticket(),
      fence = model('SessionSerialization');
    const saved = (await fence.findById(SESSION_LIMIT_APPLICATION).lean()) as any;
    await fence.updateOne(
      { _id: SESSION_LIMIT_APPLICATION },
      { $set: { serverNow: new Date(Date.now() + 60000) } },
    );
    try {
      const before = await rows();
      expect((await flow('confirm', token, { sessionId: old[0].session_id })).status).toBe(503);
      expect(await rows()).toEqual(before);
    } finally {
      await fence.updateOne(
        { _id: SESSION_LIMIT_APPLICATION },
        { $set: { serverNow: saved.serverNow } },
      );
    }
  });

  it('does not leak temporary token/password/verifiers into audit or negative responses; stored documents redact verifiers', async () => {
    const old = await fill(),
      token = await ticket();
    const probes = [
      jest.spyOn(console, 'log'),
      jest.spyOn(console, 'warn'),
      jest.spyOn(console, 'error'),
    ];
    try {
      const bad = generateReplacementToken().token;
      const denied = await flow('confirm', bad, { sessionId: old[0].session_id });
      negative(denied);
      expect((await flow('cancel', token)).status).toBe(200);
      const dump =
        JSON.stringify(await model('SecurityAuditRecord').find().lean()) +
        JSON.stringify(await model('SessionRevocation').find().lean()) +
        JSON.stringify(probes.map((p) => p.mock.calls)) +
        JSON.stringify(denied.body);
      for (const secret of [
        password,
        token,
        token.split('.')[2],
        bad,
        old[0].refresh_token,
        old[0].refresh_token.split('.')[2],
      ])
        expect(dump).not.toContain(secret);
      const stored = await model('SessionReplacement')
        .findById(token.split('.')[1])
        .select('+secretHash +passwordProof');
      expect(JSON.stringify(stored)).not.toMatch(/secretHash|passwordProof/);
      expect(dump).not.toContain(stored.secretHash);
      expect(dump).not.toContain(stored.passwordProof);
    } finally {
      probes.forEach((p) => p.mockRestore());
    }
  });

  // Independent client-side S256 construction; do not use the server's proof helper.
  async function recoverableAttempt() {
    const old = await fill();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
    const r = await http()
      .post('/api/auth/session-replacement/start')
      .send({ ...credentials(), recoveryChallenge: challenge });
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.recovery.flow_id).toBe(r.body.replacement_token.split('.')[1]);
    expect(r.body.recovery.expires_at).toBe(r.body.expires_at);
    expect(r.body.recovery.protocol).toBe(2);
    expect(r.body.recovery.max_recoveries).toBe(16);
    return {
      recoveryRequestId: randomUUID(),
      old,
      verifier,
      challenge,
      flowId: r.body.recovery.flow_id as string,
      token: r.body.replacement_token as string,
    };
  }
  type Attempt = Awaited<ReturnType<typeof recoverableAttempt>>;
  const recover = (attempt: Attempt, overrides = {}, i = 0) =>
    http(i)
      .post('/api/auth/session-replacement/recover')
      .send({
        ...credentials(),
        flowId: attempt.flowId,
        recoveryVerifier: attempt.verifier,
        recoveryRequestId: attempt.recoveryRequestId,
        ...overrides,
      });
  const confirmAttempt = (attempt: Attempt, i = 0) =>
    flow('confirm', attempt.token, { sessionId: attempt.old[0].session_id }, i);

  async function loseCommittedResponse(operation: () => ReturnType<typeof recover>, route: string) {
    let entered: () => void, release: () => void, finished: () => void, closed: () => void;
    const committed = new Promise<void>((r) => {
      entered = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const completed = new Promise<void>((r) => {
      finished = r;
    });
    const socketClosed = new Promise<void>((r) => {
      closed = r;
    });
    const auth = apps[0].get(AuthService),
      original = auth.completeReplacement.bind(auth),
      server = apps[0].getHttpServer();
    const onRequest = (req, res) => {
      if (req.url === route) res.once('close', () => closed());
    };
    server.on('request', onRequest);
    const spy = jest.spyOn(auth, 'completeReplacement').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      try {
        return await original(...args);
      } finally {
        finished();
      }
    });
    const pending = operation();
    const result = pending.then(
      () => 'response',
      () => 'aborted',
    );
    try {
      await committed;
      pending.abort();
      await socketClosed;
      expect(await result).toBe('aborted');
      release();
      await completed;
    } finally {
      release();
      spy.mockRestore();
      server.removeListener('request', onRequest);
    }
  }

  it('recovers by fresh password and per-attempt proof, invalidating the exact prior result without extending its lifetime or occupying another slot', async () => {
    const attempt = await recoverableAttempt(),
      first = await confirmAttempt(attempt);
    expect(first.status).toBe(200);
    const original = await model('AuthSession').findOne({ sessionId: first.body.session_id });
    const response = await recover(attempt, {}, 1);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.session_id).not.toBe(first.body.session_id);
    expect(response.body.organization_id).toBe(a.toString());
    expect(await rows()).toEqual({ sessions: 5, rules: 2 });
    expect(await active()).toHaveLength(3);
    const created = await model('AuthSession').findOne({ sessionId: response.body.session_id });
    expect(created.expiresAt).toEqual(original.expiresAt);
    expect(created.admissionSequence).toBeGreaterThan(original.admissionSequence);
    expect(
      (await http().get('/api/auth/sessions').auth(first.body.access_token, { type: 'bearer' }))
        .status,
    ).toBe(401);
    negative(
      await http().post('/api/auth/refresh').send({ refreshToken: first.body.refresh_token }),
    );
    expect(
      (await http().get('/api/auth/sessions').auth(response.body.access_token, { type: 'bearer' }))
        .status,
    ).toBe(200);
    expect(
      (await http().get('/api/auth/sessions').auth(attempt.old[1].access_token, { type: 'bearer' }))
        .status,
    ).toBe(200);
    const ticketRow = await model('SessionReplacement').findById(attempt.flowId);
    expect(ticketRow.state).toBe('recovered');
    expect(ticketRow.admittedSessionId).toBe(first.body.session_id);
    expect(ticketRow.recoveredSessionId).toBe(response.body.session_id);
    const rule = await model('SessionRevocation').findOne({
      action: 'recover_session_replacement',
    });
    expect(rule.targetSessionId).toBe(first.body.session_id);
    expect(rule.actorSessionId).toBe(response.body.session_id);
    const event = await model('SecurityAuditRecord').findOne({
      event: AuditEvent.REPLACEMENT_RECOVER,
      result: 'allowed',
    });
    expect(event.replacementFlowId).toBe(attempt.flowId);
    expect(event.requestId).toBe(rule.requestId);
    expect(event.actorUserId.toString()).toBe(uid.toString());
    expect(event.organizationId.toString()).toBe(a.toString());
    const before = await rows();
    negative(await recover(attempt));
    negative(await confirmAttempt(attempt));
    expect(await rows()).toEqual(before);
  });

  it('does not admit anything on a proven recovery before confirm commits; failed original transaction remains retryable', async () => {
    const attempt = await recoverableAttempt(),
      before = await rows();
    expect((await recover(attempt)).status).toBe(409);
    expect(await rows()).toEqual(before);
    await db.db.command({
      collMod: 'auth_session_revocations',
      validator: { impossible: { $exists: true } },
      validationLevel: 'strict',
    });
    try {
      expect((await confirmAttempt(attempt)).status).toBe(503);
    } finally {
      await db.db.command({
        collMod: 'auth_session_revocations',
        validator: {},
        validationLevel: 'strict',
      });
    }
    expect((await recover(attempt)).status).toBe(409);
    expect(await rows()).toEqual(before);
    expect((await confirmAttempt(attempt)).status).toBe(200);
    expect((await recover(attempt)).status).toBe(200);
  });

  it('recovers after an actual HTTP socket loss after the original commit', async () => {
    const attempt = await recoverableAttempt();
    await loseCommittedResponse(
      () => confirmAttempt(attempt),
      '/api/auth/session-replacement/confirm',
    );
    expect(await rows()).toEqual({ sessions: 4, rules: 1 });
    expect((await recover(attempt, {}, 1)).status).toBe(200);
    expect(await rows()).toEqual({ sessions: 5, rules: 2 });
    expect(await active()).toHaveLength(3);
    negative(await confirmAttempt(attempt));
    negative(await recover(attempt));
  });

  it('handles actual response loss before a real transaction rejection without assuming the request was cancelled', async () => {
    const attempt = await recoverableAttempt(),
      server = apps[0].getHttpServer();
    let entered: () => void, release: () => void, finished: () => void, closed: () => void;
    const inside = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const done = new Promise<void>((r) => {
        finished = r;
      }),
      socketClosed = new Promise<void>((r) => {
        closed = r;
      });
    const service = apps[0].get(SessionReplacementService),
      originalConfirm = service.confirm.bind(service);
    const confirmSpy = jest.spyOn(service, 'confirm').mockImplementationOnce(async (...args) => {
      try {
        return await originalConfirm(...args);
      } finally {
        finished();
      }
    });
    const revocations = apps[0].get(SessionRevocationsService),
      original = revocations.replaceInTransaction.bind(revocations);
    const spy = jest
      .spyOn(revocations, 'replaceInTransaction')
      .mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return original(...args);
      });
    const onRequest = (req, res) => {
      if (req.url === '/api/auth/session-replacement/confirm') res.once('close', () => closed());
    };
    server.on('request', onRequest);
    await db.db.command({
      collMod: 'auth_session_revocations',
      validator: { impossible: { $exists: true } },
      validationLevel: 'strict',
    });
    const pending = confirmAttempt(attempt),
      result = pending.then(
        () => 'response',
        () => 'aborted',
      );
    try {
      await inside;
      pending.abort();
      await socketClosed;
      expect(await result).toBe('aborted');
      release();
      await done;
      expect(await rows()).toEqual({ sessions: 3, rules: 0 });
      expect((await recover(attempt, {}, 1)).status).toBe(409);
      expect(
        (
          await http()
            .get('/api/auth/sessions')
            .auth(attempt.old[0].access_token, { type: 'bearer' })
        ).status,
      ).toBe(200);
    } finally {
      release();
      spy.mockRestore();
      confirmSpy.mockRestore();
      server.removeListener('request', onRequest);
      await db.db.command({
        collMod: 'auth_session_revocations',
        validator: {},
        validationLevel: 'strict',
      });
    }
    expect((await confirmAttempt(attempt)).status).toBe(200);
    expect((await recover(attempt)).status).toBe(200);
  });

  it('deduplicates the same recovery intent after response loss and keeps the explicit new-flow fallback available', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    await loseCommittedResponse(() => recover(attempt), '/api/auth/session-replacement/recover');
    expect(await rows()).toEqual({ sessions: 5, rules: 2 });
    negative(await recover(attempt, {}, 1));
    const lostId = (await model('SessionReplacement').findById(attempt.flowId)).recoveredSessionId;
    const next = await ticket();
    expect((await flow('sessions', next)).body.items.some((x) => x.sessionId === lostId)).toBe(
      true,
    );
    expect((await flow('confirm', next, { sessionId: lostId }, 1)).status).toBe(200);
    expect(await active()).toHaveLength(3);
    expect(await rows()).toEqual({ sessions: 6, rules: 3 });
  });

  it('rejects UUID/challenge/sr1/JWT/refresh theft, absent or wrong password and forged service identity without fence writes', async () => {
    const attempt = await recoverableAttempt(),
      first = await confirmAttempt(attempt),
      before = await rows();
    const fenceBefore = (await model('SessionSerialization')
      .findById(SESSION_LIMIT_APPLICATION)
      .lean()) as any;
    for (const value of [
      randomBytes(32).toString('base64url'),
      attempt.challenge,
      attempt.token,
      first.body.refresh_token,
      first.body.access_token,
      '',
      undefined,
    ])
      negative(await recover(attempt, { recoveryVerifier: value }));
    negative(await recover(attempt, { password: 'wrong' }));
    negative(await recover(attempt, { password: undefined }));
    negative(await recover(attempt, { flowId: randomUUID() }));
    await expect(
      apps[0]
        .get(SessionReplacementService)
        .recover(
          { id: uid.toString() } as any,
          a.toString(),
          attempt.flowId,
          attempt.verifier,
          randomUUID(),
        ),
    ).rejects.toThrow('Password proof required');
    const fenceAfter = (await model('SessionSerialization')
      .findById(SESSION_LIMIT_APPLICATION)
      .lean()) as any;
    expect(fenceAfter.sequence).toBe(fenceBefore.sequence);
    expect(await rows()).toEqual(before);
    expect((await recover(attempt)).status).toBe(200);
  });

  it('requires opt-in proof bound before confirm and refuses client authority fields/query and cross-context recovery', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const before = await rows();
    for (const extra of [
      { organizationId: b.toString() },
      { organizationId: undefined },
      { applicationId: 'another' },
      { userId: new Types.ObjectId().toString() },
      { sessionId: attempt.old[1].session_id },
      { roles: ['SYSTEM_ADMIN'] },
    ])
      negative(await recover(attempt, extra));
    expect(
      (
        await http()
          .post('/api/auth/session-replacement/recover')
          .query({ organizationId: b.toString() })
          .send({
            ...credentials(),
            flowId: attempt.flowId,
            recoveryVerifier: attempt.verifier,
            recoveryRequestId: attempt.recoveryRequestId,
          })
      ).status,
    ).toBe(400);
    const stranger = await model('User').create({
      name: 'Other',
      email: 'other-recovery@example.test',
      password: await bcrypt.hash(password, 4),
      status: 'active',
    });
    negative(await recover(attempt, { email: stranger.email }));
    expect(await rows()).toEqual(before);
    expect((await recover(attempt)).status).toBe(200);
    const oldStyle = await ticket();
    expect((await flow('confirm', oldStyle, { sessionId: attempt.old[1].session_id })).status).toBe(
      200,
    );
    negative(await recover(attempt, { flowId: oldStyle.split('.')[1] }));
  });

  it.each(['account', 'organization', 'membership', 'password', 'recreated-membership'])(
    'requires current identity and original membership/credential context on recovery: %s',
    async (kind) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      if (kind === 'account')
        await model('User').updateOne({ _id: uid }, { $set: { status: 'suspended' } });
      if (kind === 'organization')
        await model('Organization').updateOne({ _id: a }, { $set: { status: 'suspended' } });
      if (kind === 'membership')
        await model('OrganizationMembership').updateOne(
          { userId: uid, organizationId: a },
          { $set: { status: 'suspended' } },
        );
      if (kind === 'password')
        await model('User').updateOne(
          { _id: uid },
          { $set: { password: await bcrypt.hash('changed-password', 4) } },
        );
      if (kind === 'recreated-membership') {
        await model('OrganizationMembership').deleteOne({ userId: uid, organizationId: a });
        await model('OrganizationMembership').create({
          userId: uid,
          organizationId: a,
          status: 'active',
          roles: ['SYSTEM_ADMIN'],
        });
      }
      const before = await rows();
      negative(await recover(attempt, kind === 'password' ? { password: 'changed-password' } : {}));
      expect(await rows()).toEqual(before);
      expect((await model('SessionReplacement').findById(attempt.flowId)).state).toBe('consumed');
    },
  );

  it.each([false, true])(
    'enforces recovery expiry with TTL disabled, including after preflight=%s',
    async (afterPreflight) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      const expire = async () => {
        const now = (await db.db.admin().command({ hello: 1 })).localTime as Date;
        await db.db
          .collection<{
            _id: string;
            createdAt: Date;
            expiresAt: Date;
          }>('session_replacement_challenges')
          .updateOne(
            { _id: attempt.flowId },
            {
              $set: {
                createdAt: new Date(now.getTime() - 120001),
                expiresAt: new Date(now.getTime() - 1),
              },
            },
          );
      };
      const serialization = apps[0].get(SessionSerializationService),
        original = serialization.run.bind(serialization);
      const spy = afterPreflight
        ? jest.spyOn(serialization, 'run').mockImplementationOnce(async (work) => {
            await expire();
            return original(work);
          })
        : undefined;
      if (!afterPreflight) await expire();
      try {
        const before = await rows();
        expect((await recover(attempt)).status).toBe(401);
        expect(await rows()).toEqual(before);
        expect((await model('SessionReplacement').findById(attempt.flowId)).state).toBe('consumed');
        if (spy) expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy?.mockRestore();
      }
      const fallback = await ticket();
      expect((await flow('sessions', fallback)).status).toBe(200);
    },
  );

  it.each(['revoked', 'expired'])(
    'does not silently replace a recovery target that is already %s',
    async (kind) => {
      const attempt = await recoverableAttempt(),
        first = await confirmAttempt(attempt);
      expect(first.status).toBe(200);
      if (kind === 'expired')
        await model('AuthSession').updateOne(
          { sessionId: first.body.session_id },
          { $set: { expiresAt: new Date(0) } },
        );
      else
        expect(
          (await http().post('/api/auth/logout').auth(first.body.access_token, { type: 'bearer' }))
            .status,
        ).toBe(200);
      const before = await rows();
      negative(await recover(attempt));
      expect(await rows()).toEqual(before);
    },
  );

  it('uses current roles and denies recovery above a reduced limit without multi-eviction', async () => {
    const attempt = await recoverableAttempt(),
      first = await confirmAttempt(attempt);
    expect(first.status).toBe(200);
    expect(
      (
        await http()
          .patch('/api/auth/organization-session-limit')
          .auth(attempt.old[1].access_token, { type: 'bearer' })
          .send({ limit: 1, expectedVersion: 0 })
      ).status,
    ).toBe(200);
    const before = await rows();
    expect((await recover(attempt)).status).toBe(409);
    expect(await rows()).toEqual(before);
    for (const row of attempt.old.slice(1))
      expect(
        (
          await http()
            .delete(`/api/auth/sessions/${row.session_id}`)
            .auth(first.body.access_token, { type: 'bearer' })
        ).status,
      ).toBe(200);
    await model('OrganizationMembership').updateOne(
      { userId: uid, organizationId: a },
      { $set: { roles: ['CUSTOMER'] } },
    );
    const response = await recover(attempt);
    expect(response.status).toBe(200);
    expect(await active()).toHaveLength(1);
    expect(
      JSON.parse(Buffer.from(response.body.access_token.split('.')[1], 'base64url').toString())
        .roles,
    ).toEqual(['CUSTOMER']);
    expect(
      (await model('AuthSession').findOne({ sessionId: response.body.session_id }))
        .admissionVersion,
    ).toBe(1);
  });

  it.each(['confirm', 'recover'])(
    'serializes recovery versus %s across independent instances without extra capacity',
    async (other) => {
      const attempt = await recoverableAttempt();
      if (other === 'recover') expect((await confirmAttempt(attempt)).status).toBe(200);
      let arrived = 0,
        release: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const spies = apps.map((app) => {
        const s = app.get(SessionSerializationService),
          original = s.run.bind(s);
        return jest.spyOn(s, 'run').mockImplementation(async (work) => {
          if (++arrived === 2) release();
          await gate;
          return original(work);
        });
      });
      try {
        const result = await Promise.all([
          recover(attempt),
          other === 'confirm' ? confirmAttempt(attempt, 1) : recover(attempt, {}, 1),
        ]);
        expect(arrived).toBe(2);
        if (other === 'recover') {
          expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
        } else {
          expect([200, 409]).toContain(result[0].status);
          expect([200, 401]).toContain(result[1].status);
        }
        const didRecover =
          (await model('SessionReplacement').findById(attempt.flowId)).state === 'recovered';
        expect(await rows()).toEqual({ sessions: didRecover ? 5 : 4, rules: didRecover ? 2 : 1 });
        expect(await active()).toHaveLength(3);
        expect(
          await model('SecurityAuditRecord').countDocuments({
            event: AuditEvent.REPLACEMENT_RECOVER,
            result: 'allowed',
          }),
        ).toBe(didRecover ? 1 : 0);
      } finally {
        release();
        spies.forEach((s) => s.mockRestore());
      }
    },
  );

  it.each(['consume', 'revocation', 'insert', 'admission-audit', 'completion-audit'])(
    'rolls back recovery completely after a real MongoDB rejection at %s',
    async (stage) => {
      const attempt = await recoverableAttempt(),
        first = await confirmAttempt(attempt);
      expect(first.status).toBe(200);
      const collection =
        stage === 'consume'
          ? 'session_replacement_challenges'
          : stage === 'revocation'
            ? 'auth_session_revocations'
            : stage === 'insert'
              ? 'auth_sessions'
              : 'security_audit_events';
      const validator =
        stage === 'consume'
          ? { state: 'consumed' }
          : stage === 'admission-audit'
            ? { event: { $ne: AuditEvent.SESSION_ADMISSION } }
            : stage === 'completion-audit'
              ? { event: { $ne: AuditEvent.REPLACEMENT_RECOVER } }
              : { impossible: { $exists: true } };
      await db.db.command({ collMod: collection, validator, validationLevel: 'strict' });
      try {
        const before = await rows();
        const response = await recover(attempt);
        expect(response.status).toBe(503);
        negative(response);
        expect(await rows()).toEqual(before);
        expect((await model('SessionReplacement').findById(attempt.flowId)).state).toBe('consumed');
      } finally {
        await db.db.command({ collMod: collection, validator: {}, validationLevel: 'strict' });
      }
      expect(
        (await http().get('/api/auth/sessions').auth(first.body.access_token, { type: 'bearer' }))
          .status,
      ).toBe(200);
      expect((await recover(attempt, {}, 1)).status).toBe(200);
    },
  );

  it('handles real commit connection loss once without duplicated recovery effects', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const failure = {
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: { failCommands: ['commitTransaction'], closeConnection: true },
    };
    await db.db.admin().command(failure);
    try {
      expect((await recover(attempt)).status).toBe(200);
      expect(await rows()).toEqual({ sessions: 5, rules: 2 });
      expect(await active()).toHaveLength(3);
    } finally {
      await db.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
    }
  });

  it('binds the private proof to its own attempt and tenant, never to public challenge or a cancelled capability', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    await fill(b);
    const verifierB = randomBytes(32).toString('base64url'),
      challengeB = createHash('sha256').update(verifierB).digest('base64url');
    const begunB = await http()
      .post('/api/auth/session-replacement/start')
      .send({ ...credentials(b), recoveryChallenge: challengeB });
    expect(begunB.status).toBe(201);
    const before = await rows();
    negative(
      await recover(attempt, {
        organizationId: b.toString(),
        flowId: begunB.body.recovery.flow_id,
      }),
    );
    negative(await recover(attempt, { recoveryVerifier: verifierB }));
    expect((await flow('cancel', begunB.body.replacement_token)).status).toBe(200);
    negative(
      await recover(attempt, {
        organizationId: b.toString(),
        flowId: begunB.body.recovery.flow_id,
        recoveryVerifier: verifierB,
      }),
    );
    expect(await rows()).toEqual(before);
    await db.db
      .collection<{ _id: string; applicationId: string }>('session_replacement_challenges')
      .updateOne({ _id: attempt.flowId }, { $set: { applicationId: 'foreign-application' } });
    negative(await recover(attempt));
    expect(await rows()).toEqual(before);
  });

  it('normalizes a valid uppercase organization ID without creating an unusable postcommit receipt', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const response = await recover(attempt, { organizationId: a.toString().toUpperCase() });
    expect(response.status).toBe(200);
    expect(response.body.organization_id).toBe(a.toString());
  });

  it.each(['clock', 'account', 'membership', 'login-audit'])(
    'does not return credentials or undo committed recovery on postcommit %s failure',
    async (kind) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      const auth = apps[0].get(AuthService),
        original = auth.completeReplacement.bind(auth),
        fence = model('SessionSerialization');
      const saved = (await fence.findById(SESSION_LIMIT_APPLICATION).lean()) as any;
      const audit = apps[0].get(SecurityAuditService),
        originalAudit = audit.record.bind(audit);
      const auditSpy = jest.spyOn(audit, 'record').mockImplementation(async (...args) => {
        if (kind === 'login-audit' && args[0] === AuditEvent.LOGIN && args[1] === 'allowed')
          throw new ServiceUnavailableException('Injected audit failure');
        return originalAudit(...args);
      });
      const spy = jest
        .spyOn(auth, 'completeReplacement')
        .mockImplementationOnce(async (...args) => {
          if (kind === 'clock')
            await fence.updateOne(
              { _id: SESSION_LIMIT_APPLICATION },
              { $set: { serverNow: new Date(Date.now() + 60000) } },
            );
          if (kind === 'account')
            await model('User').updateOne({ _id: uid }, { $set: { status: 'suspended' } });
          if (kind === 'membership')
            await model('OrganizationMembership').updateOne(
              { userId: uid, organizationId: a },
              { $set: { status: 'suspended' } },
            );
          return original(...args);
        });
      try {
        const result = await recover(attempt);
        expect(result.status).toBeGreaterThanOrEqual(400);
        negative(result);
        expect(await rows()).toEqual({ sessions: 5, rules: 2 });
        expect((await model('SessionReplacement').findById(attempt.flowId)).state).toBe(
          'recovered',
        );
        negative(await recover(attempt, {}, 1));
        expect(await rows()).toEqual({ sessions: 5, rules: 2 });
      } finally {
        spy.mockRestore();
        auditSpy.mockRestore();
        if (kind === 'clock')
          await fence.updateOne(
            { _id: SESSION_LIMIT_APPLICATION },
            { $set: { serverNow: saved.serverNow } },
          );
      }
    },
  );

  it('redacts recovery proof and verifier from audit, negative responses and document serialization', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const denied = await recover(attempt, { password: 'wrong' });
    negative(denied);
    expect((await recover(attempt)).status).toBe(200);
    const stored = await model('SessionReplacement')
      .findById(attempt.flowId)
      .select('+passwordProof +secretHash +recoveryChallenge');
    expect(stored.recoveryChallenge).toBe(attempt.challenge);
    expect(JSON.stringify(stored)).not.toMatch(/passwordProof|secretHash|recoveryChallenge/);
    const dump =
      JSON.stringify(await model('SecurityAuditRecord').find().lean()) +
      JSON.stringify(await model('SessionRevocation').find().lean()) +
      JSON.stringify(denied.body);
    for (const secret of [
      attempt.verifier,
      attempt.challenge,
      attempt.token,
      password,
      stored.passwordProof,
      stored.secretHash,
    ])
      expect(dump).not.toContain(secret);
  });

  it('recovers through three consecutive real socket losses without accumulating families or renewing either expiry', async () => {
    const attempt = await recoverableAttempt();
    await loseCommittedResponse(
      () => confirmAttempt(attempt),
      '/api/auth/session-replacement/confirm',
    );
    const before = await model('SessionReplacement').findById(attempt.flowId);
    const original = await model('AuthSession').findOne({ sessionId: before.admittedSessionId });
    const used: string[] = [];
    for (let version = 1; version <= 3; version++) {
      const id = randomUUID();
      used.push(id);
      await loseCommittedResponse(
        () => recover(attempt, { recoveryRequestId: id }),
        '/api/auth/session-replacement/recover',
      );
      const row = await model('SessionReplacement').findById(attempt.flowId);
      expect(row.recoveryVersion).toBe(version);
      expect(row.expiresAt).toEqual(before.expiresAt);
      expect(
        (await model('AuthSession').findOne({ sessionId: row.recoveredSessionId })).expiresAt,
      ).toEqual(original.expiresAt);
      expect(await rows()).toEqual({ sessions: 4 + version, rules: 1 + version });
      expect(await active()).toHaveLength(3);
      const replay = await recover(attempt, { recoveryRequestId: id }, 1);
      expect(replay.status).toBe(409);
      expect(replay.body.code).toBe('recovery_already_applied');
      negative(replay);
    }
    const id = randomUUID(),
      response = await recover(attempt, { recoveryRequestId: id }, 1);
    expect(response.status).toBe(200);
    expect(response.body.recovery_version).toBe(4);
    expect(response.body.recovery_request_id).toBe(id);
    expect(
      (await http().get('/api/auth/sessions').auth(response.body.access_token, { type: 'bearer' }))
        .status,
    ).toBe(200);
    const events = await model('SecurityAuditRecord')
      .find({
        event: AuditEvent.REPLACEMENT_RECOVER,
        result: 'allowed',
        replacementFlowId: attempt.flowId,
      })
      .sort({ replacementRecoveryVersion: 1 });
    expect(events.map((e) => e.replacementRecoveryVersion)).toEqual([1, 2, 3, 4]);
    expect(events.map((e) => e.replacementRecoveryRequestId)).toEqual([...used, id]);
    expect(new Set(events.map((e) => e.sessionId)).size).toBe(4);
    expect(await active()).toHaveLength(3);
  });

  it.each([false, true])(
    'serializes later-generation requests in two instances; same ID=%s',
    async (same) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      expect((await recover(attempt)).status).toBe(200);
      let arrived = 0,
        release: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const spies = apps.map((app) => {
        const s = app.get(SessionSerializationService),
          original = s.run.bind(s);
        return jest.spyOn(s, 'run').mockImplementation(async (work) => {
          if (++arrived === 2) release();
          await gate;
          return original(work);
        });
      });
      const id = randomUUID(),
        other = same ? id : randomUUID();
      try {
        const responses = await Promise.all([
          recover(attempt, { recoveryRequestId: id }),
          recover(attempt, { recoveryRequestId: other }, 1),
        ]);
        expect(arrived).toBe(2);
        if (same) expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
        else {
          expect(responses.every((r) => [200, 401].includes(r.status))).toBe(true);
          expect(responses.some((r) => r.status === 200)).toBe(true);
        }
        const version = same ? 2 : 3;
        const row = await model('SessionReplacement')
          .findById(attempt.flowId)
          .select('+recoveryRequestIds');
        expect(row.recoveryVersion).toBe(version);
        expect(new Set(row.recoveryRequestIds).size).toBe(version);
        expect(await rows()).toEqual({ sessions: 4 + version, rules: 1 + version });
        expect(await active()).toHaveLength(3);
        for (const response of responses.filter((r) => r.status === 200)) {
          const check = await http()
            .get('/api/auth/sessions')
            .auth(response.body.access_token, { type: 'bearer' });
          expect(check.status).toBe(
            response.body.session_id === row.recoveredSessionId ? 200 : 401,
          );
        }
      } finally {
        release();
        spies.forEach((s) => s.mockRestore());
      }
    },
  );

  it('enforces the atomic budget of sixteen operations even if another unique ID is supplied', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    for (let i = 1; i <= 15; i++) {
      const r = await recover(attempt, { recoveryRequestId: randomUUID() }, i % 2);
      expect(r.status).toBe(200);
      expect(r.body.recovery_version).toBe(i);
    }
    const boundary = await Promise.all([
      recover(attempt, { recoveryRequestId: randomUUID() }),
      recover(attempt, { recoveryRequestId: randomUUID() }, 1),
    ]);
    expect(boundary.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(boundary.find((r) => r.status === 409).body.code).toBe('recovery_budget_exhausted');
    const before = await rows(),
      denied = await recover(attempt, { recoveryRequestId: randomUUID() });
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('recovery_budget_exhausted');
    negative(denied);
    const row = await model('SessionReplacement')
      .findById(attempt.flowId)
      .select('+recoveryRequestIds');
    expect(row.recoveryVersion).toBe(16);
    expect(row.recoveryRequestIds).toHaveLength(16);
    expect(await rows()).toEqual(before);
    expect(await active()).toHaveLength(3);
  });

  it.each(['revoked', 'expired'])(
    'never falls back to an earlier family when the CURRENT generation is %s',
    async (kind) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      expect((await recover(attempt)).status).toBe(200);
      const latest = await recover(attempt, { recoveryRequestId: randomUUID() });
      expect(latest.status).toBe(200);
      if (kind === 'revoked')
        expect(
          (await http().post('/api/auth/logout').auth(latest.body.access_token, { type: 'bearer' }))
            .status,
        ).toBe(200);
      else
        await model('AuthSession').updateOne(
          { sessionId: latest.body.session_id },
          { $set: { expiresAt: new Date(0) } },
        );
      const before = await rows();
      negative(await recover(attempt, { recoveryRequestId: randomUUID() }, 1));
      expect(await rows()).toEqual(before);
      expect((await model('SessionReplacement').findById(attempt.flowId)).recoveryVersion).toBe(2);
    },
  );

  it('requires both factors AGAIN for new IDs and explicitly demonstrates the limit of joint password/proof compromise', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const legitimate = await recover(attempt);
    expect(legitimate.status).toBe(200);
    const before = await rows();
    for (const fields of [
      { password: undefined },
      { password: 'wrong' },
      { recoveryVerifier: undefined },
      { recoveryVerifier: attempt.challenge },
      { flowId: randomUUID() },
      { organizationId: b.toString() },
      { recoveryRequestId: undefined },
    ])
      negative(await recover(attempt, { recoveryRequestId: randomUUID(), ...fields }, 1));
    expect(await rows()).toEqual(before);
    // Not a claimed security guarantee: holder of BOTH factors can create another intent.
    const compromised = await recover(attempt, { recoveryRequestId: randomUUID() }, 1);
    expect(compromised.status).toBe(200);
    expect(
      (
        await http()
          .get('/api/auth/sessions')
          .auth(legitimate.body.access_token, { type: 'bearer' })
      ).status,
    ).toBe(401);
    await model('User').updateOne(
      { _id: uid },
      { $set: { password: await bcrypt.hash('new-password', 4) } },
    );
    negative(await recover(attempt, { recoveryRequestId: randomUUID() }));
    negative(await recover(attempt, { recoveryRequestId: randomUUID(), password: 'new-password' }));
    expect(await active()).toHaveLength(3);
  });

  it.each([false, true])(
    'enforces original expiry after multiple generations, including after preflight=%s',
    async (after) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      expect((await recover(attempt)).status).toBe(200);
      expect((await recover(attempt, { recoveryRequestId: randomUUID() })).status).toBe(200);
      const expire = async () => {
        const now = (await db.db.admin().command({ hello: 1 })).localTime as Date;
        await db.db
          .collection<{
            _id: string;
            createdAt: Date;
            expiresAt: Date;
          }>('session_replacement_challenges')
          .updateOne(
            { _id: attempt.flowId },
            {
              $set: {
                createdAt: new Date(now.getTime() - 120001),
                expiresAt: new Date(now.getTime() - 1),
              },
            },
          );
      };
      const serialization = apps[0].get(SessionSerializationService),
        original = serialization.run.bind(serialization);
      const spy = after
        ? jest.spyOn(serialization, 'run').mockImplementationOnce(async (work) => {
            await expire();
            return original(work);
          })
        : undefined;
      if (!after) await expire();
      try {
        const before = await rows();
        const response = await recover(attempt, { recoveryRequestId: randomUUID() });
        expect(response.status).toBe(401);
        expect(await rows()).toEqual(before);
        expect((await model('SessionReplacement').findById(attempt.flowId)).recoveryVersion).toBe(
          2,
        );
        if (spy) expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy?.mockRestore();
      }
    },
  );

  it.each(['consume', 'revocation', 'insert', 'admission-audit', 'completion-audit'])(
    'rolls back later-generation version, request ID and pointer on real failure at %s',
    async (stage) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      const first = await recover(attempt);
      expect(first.status).toBe(200);
      const collection =
        stage === 'consume'
          ? 'session_replacement_challenges'
          : stage === 'revocation'
            ? 'auth_session_revocations'
            : stage === 'insert'
              ? 'auth_sessions'
              : 'security_audit_events';
      const validator =
        stage === 'consume'
          ? { recoveryVersion: 1 }
          : stage === 'admission-audit'
            ? { event: { $ne: AuditEvent.SESSION_ADMISSION } }
            : stage === 'completion-audit'
              ? { event: { $ne: AuditEvent.REPLACEMENT_RECOVER } }
              : { impossible: { $exists: true } };
      const id = randomUUID(),
        before = await rows();
      await db.db.command({ collMod: collection, validator, validationLevel: 'strict' });
      try {
        const response = await recover(attempt, { recoveryRequestId: id });
        expect(response.status).toBe(503);
        negative(response);
        expect(await rows()).toEqual(before);
        const row = await model('SessionReplacement')
          .findById(attempt.flowId)
          .select('+recoveryRequestIds');
        expect(row.recoveryVersion).toBe(1);
        expect(row.recoveryRequestIds).not.toContain(id);
        expect(row.recoveredSessionId).toBe(first.body.session_id);
      } finally {
        await db.db.command({ collMod: collection, validator: {}, validationLevel: 'strict' });
      }
      const retried = await recover(attempt, { recoveryRequestId: id }, 1);
      expect(retried.status).toBe(200);
      expect(retried.body.recovery_version).toBe(2);
      const duplicate = await recover(attempt, { recoveryRequestId: id });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('recovery_already_applied');
    },
  );

  it('keeps owner/tenant/roles and reduced quota authoritative on later generations', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const first = await recover(attempt);
    expect(first.status).toBe(200);
    const stranger = await model('User').create({
      name: 'Other',
      email: 'later-owner@example.test',
      password: await bcrypt.hash(password, 4),
      status: 'active',
    });
    const before = await rows();
    for (const fields of [
      { email: stranger.email },
      { organizationId: b.toString() },
      { organizationId: undefined },
      { userId: stranger.id },
      { applicationId: 'other' },
    ])
      negative(await recover(attempt, { recoveryRequestId: randomUUID(), ...fields }, 1));
    expect(await rows()).toEqual(before);
    expect(
      (
        await http()
          .patch('/api/auth/organization-session-limit')
          .auth(first.body.access_token, { type: 'bearer' })
          .send({ limit: 2, expectedVersion: 0 })
      ).status,
    ).toBe(200);
    expect((await recover(attempt, { recoveryRequestId: randomUUID() })).status).toBe(409);
    expect(await rows()).toEqual(before);
    expect(
      (
        await http()
          .delete(`/api/auth/sessions/${attempt.old[2].session_id}`)
          .auth(first.body.access_token, { type: 'bearer' })
      ).status,
    ).toBe(200);
    await model('OrganizationMembership').updateOne(
      { userId: uid, organizationId: a },
      { $set: { roles: ['CUSTOMER'] } },
    );
    const next = await recover(attempt, { recoveryRequestId: randomUUID() }, 1);
    expect(next.status).toBe(200);
    expect(next.body.recovery_version).toBe(2);
    expect(
      JSON.parse(Buffer.from(next.body.access_token.split('.')[1], 'base64url').toString()).roles,
    ).toEqual(['CUSTOMER']);
    expect(await active()).toHaveLength(2);
    expect(
      (await model('AuthSession').findOne({ sessionId: next.body.session_id })).admissionVersion,
    ).toBe(1);
  });

  it('does not treat a noncanonical uppercase operation ID as a new authorized spelling of an applied ID', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect((await recover(attempt, { recoveryRequestId: id })).status).toBe(200);
    const before = await rows();
    expect((await recover(attempt, { recoveryRequestId: id.toUpperCase() })).status).toBe(401);
    expect(await rows()).toEqual(before);
    const duplicate = await recover(attempt, { recoveryRequestId: id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('recovery_already_applied');
  });

  it.each(['missing', 'counter', 'history', 'original-pointer'])(
    'rejects inconsistent metadata (%s) instead of inventing another active family',
    async (kind) => {
      const attempt = await recoverableAttempt();
      expect((await confirmAttempt(attempt)).status).toBe(200);
      if (kind === 'original-pointer') expect((await recover(attempt)).status).toBe(200);
      const collection = db.db.collection<{
        _id: string;
        recoveryVersion?: number;
        recoveryRequestIds?: string[];
        admittedSessionId?: string;
      }>('session_replacement_challenges');
      if (kind === 'missing')
        await collection.updateOne(
          { _id: attempt.flowId },
          { $unset: { recoveryVersion: '', recoveryRequestIds: '' } },
        );
      if (kind === 'counter')
        await collection.updateOne({ _id: attempt.flowId }, { $set: { recoveryVersion: 2 } });
      if (kind === 'history')
        await collection.updateOne(
          { _id: attempt.flowId },
          { $set: { recoveryRequestIds: [randomUUID()] } },
        );
      if (kind === 'original-pointer')
        await collection.updateOne({ _id: attempt.flowId }, { $unset: { admittedSessionId: '' } });
      const before = await rows();
      negative(await recover(attempt, { recoveryRequestId: randomUUID() }));
      expect(await rows()).toEqual(before);
    },
  );

  it('continues in another real process after killing a worker AFTER its committed recovery and before its response', async () => {
    const attempt = await recoverableAttempt();
    expect((await confirmAttempt(attempt)).status).toBe(200);
    const children: ReturnType<typeof fork>[] = [];
    const waitFor = (child: ReturnType<typeof fork>, event: string) =>
      new Promise<any>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          child.off('message', message);
          child.off('exit', exited);
        };
        const message = (value: any) => {
          if (value?.event === event) {
            cleanup();
            resolve(value);
          } else if (value?.event === 'fixture-failed') {
            cleanup();
            reject(new Error('Disposable restart fixture failed'));
          }
        };
        const exited = () => {
          cleanup();
          reject(new Error('Disposable restart fixture exited'));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Disposable restart fixture startup deadline'));
        }, 30000);
        child.on('message', message);
        child.on('exit', exited);
      });
    const startChild = async (drop: boolean) => {
      const child = fork(join(__dirname, 'replacement-recovery-restart.fixture.ts'), [], {
        cwd: join(__dirname, '..'),
        execArgv: ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'],
        env: {
          ...process.env,
          REPLACEMENT_RESTART_TEST_DATABASE: database,
          REPLACEMENT_RESTART_TEST_DROP_AFTER_COMMIT: drop ? '1' : '0',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      children.push(child);
      child.stdout.resume();
      child.stderr.resume();
      return { child, port: (await waitFor(child, 'ready')).port };
    };
    const stop = async (child: ReturnType<typeof fork>) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    };
    try {
      const first = await startChild(true),
        committed = waitFor(first.child, 'replacement-committed');
      const id = randomUUID();
      const pending = request(`http://127.0.0.1:${first.port}`)
        .post('/api/auth/session-replacement/recover')
        .send({
          ...credentials(),
          flowId: attempt.flowId,
          recoveryVerifier: attempt.verifier,
          recoveryRequestId: id,
        })
        .then(
          () => 'response',
          () => 'lost',
        );
      await committed;
      expect((await model('SessionReplacement').findById(attempt.flowId)).recoveryVersion).toBe(1);
      await stop(first.child);
      expect(await pending).toBe('lost');
      const restarted = await startChild(false);
      expect(restarted.child.pid).not.toBe(first.child.pid);
      const send = (operationId: string) =>
        request(`http://127.0.0.1:${restarted.port}`)
          .post('/api/auth/session-replacement/recover')
          .send({
            ...credentials(),
            flowId: attempt.flowId,
            recoveryVerifier: attempt.verifier,
            recoveryRequestId: operationId,
          });
      const duplicate = await send(id);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('recovery_already_applied');
      const recovered = await send(randomUUID());
      expect(recovered.status).toBe(200);
      expect(recovered.body.recovery_version).toBe(2);
      expect(await rows()).toEqual({ sessions: 6, rules: 3 });
      expect(await active()).toHaveLength(3);
      expect(
        (
          await http()
            .get('/api/auth/sessions')
            .auth(recovered.body.access_token, { type: 'bearer' })
        ).status,
      ).toBe(200);
    } finally {
      for (const child of children) await stop(child);
    }
  });
});
