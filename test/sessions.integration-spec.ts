import {
  Controller,
  Get,
  INestApplication,
  Req,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { exportAudit } from '@/common/audit/audit-export';
import { verifyAuditIndexes } from '@/common/audit/audit-indexes';
import { AuditQueryService } from '@/common/audit/audit-query.service';
import { AuditController } from '@/common/audit/audit.controller';
import { AuditEvent, SecurityAuditRecord } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { PoliciesGuard } from '@/common/authorization/policies.guard';
import { PolicyEngine } from '@/common/authorization/policy-engine.service';
import { Public, RequirePolicies } from '@/common/authorization/policy.decorators';
import { POLICY_DEFINITIONS } from '@/common/authorization/policy.registry';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ScopedResourcesModule } from '@/common/authorization/scoped-resources.module';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { AttendancesController } from '@/features/attendance/controllers/attendance.controller';
import { AttendanceListener } from '@/features/attendance/listerners/attendance.listener';
import { AttendancesService } from '@/features/attendance/services/attendance.service';
import { AuthSessionsModule } from '@/features/auth/auth-sessions.module';
import { AuthController } from '@/features/auth/controllers/auth.controller';
import { SessionLimitConfigurationController } from '@/features/auth/controllers/session-limit-configuration.controller';
import {
  OrganizationSessionsController,
  SessionsController,
} from '@/features/auth/controllers/sessions.controller';
import { SessionLimitModelModule } from '@/features/auth/models/session-limit-model.module';
import { AuthSession, SessionRevocationReason } from '@/features/auth/schemas/auth-session.schema';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { SessionLimitRevision } from '@/features/auth/schemas/session-limit-revision.schema';
import {
  RevocationAction,
  SessionRevocation,
} from '@/features/auth/schemas/session-revocation.schema';
import { SessionSerialization } from '@/features/auth/schemas/session-serialization.schema';
import {
  AuthSessionsService,
  MAX_SESSION_ROTATIONS,
} from '@/features/auth/services/auth-sessions.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { SessionLimitConfigurationService } from '@/features/auth/services/session-limit-configuration.service';
import { SessionManagementService } from '@/features/auth/services/session-management.service';
import { SessionRevocationsService } from '@/features/auth/services/session-revocations.service';
import { SessionSerializationService } from '@/features/auth/services/session-serialization.service';
import { JwtStrategy } from '@/features/auth/strategies/jwt.strategy';
import { LocalStrategy } from '@/features/auth/strategies/local.strategy';
import { DisciplinesController } from '@/features/disciplines/controllers/disciplines.controller';
import { DisciplinesService } from '@/features/disciplines/services/disciplines.service';
import { GradesController } from '@/features/grades/controllers/grades.controller';
import { GradeListener } from '@/features/grades/listeners/grade.listener';
import { GradesService } from '@/features/grades/services/grades.service';
import { MailService } from '@/features/mail/services/mail.service';
import { MeetingsController } from '@/features/meeting/controllers/meeting.controller';
import { MeetingListener } from '@/features/meeting/listeners/meeting.listener';
import { MeetingsService } from '@/features/meeting/services/meeting.service';
import { OrganizationsModule } from '@/features/organizations/organizations.module';
import {
  MembershipStatus,
  OrganizationMembership,
} from '@/features/organizations/schemas/organization-membership.schema';
import { Organization } from '@/features/organizations/schemas/organization.schema';
import { UsersController } from '@/features/users/controllers/users.controller';
import { UserModelModule } from '@/features/users/models/user-model.module';
import { User } from '@/features/users/schemas/user.schema';
import { UsersService } from '@/features/users/services/users.service';

@Controller('probe')
class ProbeController {
  @Get()
  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.PROFILE })
  probe(@Req() req) {
    return {
      id: req.user.id,
      sessionId: req.user.sessionId,
      roles: req.user.roles,
      organizationId: req.user.organizationId ?? null,
      membershipId: req.user.membershipId,
    };
  }

  @Get('admin')
  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.USER })
  admin() {
    return { allowed: true };
  }

  @Get('session-target/:id')
  @RequirePolicies({ action: PolicyAction.REVOKE, resource: PolicyResource.SESSION })
  unresolvedSessionTarget() {
    return { shouldNotExecute: true };
  }

  @Get('undeclared')
  undeclared() {
    return { shouldNotExecute: true };
  }

  @Get('empty')
  @RequirePolicies()
  empty() {
    return { shouldNotExecute: true };
  }

  @Get('all-required')
  @RequirePolicies(
    { action: PolicyAction.READ, resource: PolicyResource.PROFILE },
    { action: PolicyAction.LIST, resource: PolicyResource.USER },
  )
  allRequired() {
    return { allowed: true };
  }

  @Get('unknown-policy')
  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.SESSION })
  unknownPolicy() {
    return { shouldNotExecute: true };
  }

  @Get('conflict')
  @Public()
  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.PROFILE })
  conflicting() {
    return { shouldNotExecute: true };
  }
}

// Never uses the application's MONGO_URL. Only a unique test database is dropped.
describe('Device sessions — real MongoDB and HTTP authentication', () => {
  let app: INestApplication;
  let connection: Connection;
  let sessions: AuthSessionsService;
  let sessionModel: Model<AuthSession>;
  let revocationModel: Model<SessionRevocation>;
  let users: Model<User>;
  let organizations: Model<Organization>;
  let memberships: Model<OrganizationMembership>;
  let jwt: JwtService;
  let userId: string;
  const databaseName = `sessions_test_${randomUUID().replace(/-/g, '')}`;
  const password = 'integration-only-password';

  beforeAll(async () => {
    const uri = process.env.SESSIONS_TEST_MONGO_URL;
    if (!uri) throw new Error('Set SESSIONS_TEST_MONGO_URL to an isolated MongoDB test server');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'integration-only-secret-not-for-production' })],
        }),
        MongooseModule.forRoot(uri, { dbName: databaseName, serverSelectionTimeoutMS: 10_000 }),
        AuthSessionsModule,
        SessionLimitModelModule,
        UserModelModule,
        OrganizationsModule,
        ScopedResourcesModule,
        PassportModule.register({ defaultStrategy: 'jwt', session: false }),
        JwtModule.register({
          secret: 'integration-only-secret-not-for-production',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [
        AuthController,
        SessionLimitConfigurationController,
        AuditController,
        SessionsController,
        OrganizationSessionsController,
        ProbeController,
        UsersController,
        DisciplinesController,
        GradesController,
        AttendancesController,
        MeetingsController,
      ],
      providers: [
        AuthService,
        AuditQueryService,
        SessionManagementService,
        SessionLimitConfigurationService,
        UsersService,
        DisciplinesService,
        GradesService,
        AttendancesService,
        MeetingsService,
        LocalStrategy,
        JwtStrategy,
        PolicyEngine,
        { provide: APP_GUARD, useClass: PoliciesGuard },
        { provide: EventEmitter2, useValue: { emit: () => undefined } },
      ],
    }).compile();
    // Test operator provisions only the two audit collections in the generated DB.
    for (const name of [
      SecurityAuditRecord.name,
      SessionRevocation.name,
      SessionLimitRevision.name,
    ]) {
      const model = module.get<Model<any>>(getModelToken(name));
      await model.createCollection();
      await model.createIndexes();
    }
    const fence = module.get<Model<SessionSerialization>>(getModelToken(SessionSerialization.name));
    await fence.createCollection();
    await fence.create({ _id: SESSION_LIMIT_APPLICATION, sequence: 0, serverNow: new Date() });
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    connection = module.get(getConnectionToken());
    sessions = module.get(AuthSessionsService);
    sessionModel = module.get(getModelToken(AuthSession.name));
    revocationModel = module.get(getModelToken(SessionRevocation.name));
    users = module.get(getModelToken(User.name));
    jwt = module.get(JwtService);
    organizations = module.get(getModelToken(Organization.name));
    memberships = module.get(getModelToken(OrganizationMembership.name));
    await memberships.init();
    await sessionModel.init();
    await users.init();
  });

  beforeEach(async () => {
    for (const name of ['Discipline', 'Grade', 'Attendance', 'Meeting'])
      await connection.models[name].deleteMany({});
    await connection.models.SecurityAuditRecord.deleteMany({});
    await connection.models.SessionLimitRevision.deleteMany({});
    await sessionModel.deleteMany({});
    await revocationModel.deleteMany({});
    await users.deleteMany({});
    await memberships.deleteMany({});
    await organizations.deleteMany({});
    const user = await users.create({
      name: 'Session learner',
      email: 'session@example.com',
      password: await bcrypt.hash(password, 4),
      roles: [Role.CUSTOMER],
      status: AccountStatus.ACTIVE,
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (connection?.name === databaseName) await connection.dropDatabase();
    if (app) await app.close();
  });

  async function login(device = 'Computer', organizationId?: string) {
    const result = await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', device)
      .send({
        email: 'session@example.com',
        password,
        ...(organizationId ? { organizationId } : {}),
      })
      .expect(201);
    return result.body as {
      access_token: string;
      refresh_token: string;
      session_id: string;
      organization_id: string | null;
    };
  }
  const probe = (token: string) =>
    request(app.getHttpServer()).get('/probe').auth(token, { type: 'bearer' });

  async function tenant(name: string, roles: Role[] = [Role.MANAGER]) {
    const organization = await organizations.create({ name });
    await memberships.create({
      organizationId: organization._id,
      userId,
      status: MembershipStatus.ACTIVE,
      roles,
    });
    return organization._id.toString();
  }

  describe('General security audit — persisted events and isolated readers', () => {
    const auditModel = () => connection.models.SecurityAuditRecord as Model<SecurityAuditRecord>;
    const readAudit = (token: string, path = '/audit/own-events') =>
      request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });

    it('persists login/failure/refresh/policy decisions and correlates authoritative logout/replay without credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'session@example.com', password: 'wrong-secret' })
        .expect(401);
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(401);
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Request-Id', 'forged-client-trace')
        .send({ email: 'session@example.com', password })
        .expect(201);
      const current = response.body;
      const loginRow = await auditModel().findOne({ event: AuditEvent.LOGIN, result: 'allowed' });
      expect(loginRow.requestId).toBe(response.headers['x-request-id']);
      expect(loginRow.requestId).not.toBe('forged-client-trace');
      expect(loginRow.actorUserId.toString()).toBe(userId);
      await request(app.getHttpServer())
        .get('/probe/admin')
        .auth(current.access_token, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: current.refresh_token })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: current.refresh_token })
        .expect(401);
      const replay = await revocationModel.findOne({ targetSessionId: current.session_id });
      expect(replay.action).toBe(RevocationAction.REPLAY);
      expect(replay.initiator).toBe('system');
      expect(replay.requestId).toMatch(/^[a-f0-9-]{36}$/);
      const next = await login();
      const logout = await request(app.getHttpServer())
        .post('/auth/logout')
        .auth(next.access_token, { type: 'bearer' })
        .expect(200);
      expect((await revocationModel.findOne({ targetSessionId: next.session_id })).requestId).toBe(
        logout.headers['x-request-id'],
      );
      const rows = await auditModel().find().lean();
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: AuditEvent.LOGIN, result: 'denied' }),
          expect.objectContaining({ event: AuditEvent.REFRESH, result: 'allowed' }),
          expect.objectContaining({ event: AuditEvent.AUTHORIZATION, result: 'denied' }),
        ]),
      );
      const json = JSON.stringify(rows);
      for (const secret of [password, 'wrong-secret', current.access_token, current.refresh_token])
        expect(json).not.toContain(secret);
      expect(json).not.toMatch(
        /currentTokenHash|consumedTokens|password|access_token|refreshToken/,
      );
    });

    it('never attributes an invalid bearer payload to its claimed actor or organization', async () => {
      const org = await tenant('A');
      const fake = jwt.sign({
        sub: userId,
        sid: randomUUID(),
        organizationId: org,
        roles: [Role.SYSTEM_ADMIN],
      });
      await probe(fake).expect(401);
      const row = await auditModel().findOne({ event: AuditEvent.AUTHENTICATION });
      expect(row.actorUserId).toBeNull();
      expect(row.organizationId).toBeNull();
      expect(row.sessionId).toBeNull();
      const personal = await login();
      const own = await readAudit(personal.access_token).expect(200);
      expect(own.body.items.some((item) => item.eventId === row.id)).toBe(false);
    });

    it('filters A/B/personal streams and revalidates AUDITOR privileges; never trusts scope query/headers', async () => {
      const a = await tenant('A', [Role.AUDITOR]),
        b = await tenant('B', [Role.SYSTEM_ADMIN]);
      const inA = await login('A', a),
        inB = await login('B', b),
        personal = await login();
      const rows = await readAudit(inA.access_token, '/audit/organization-events')
        .set('X-Organization-Id', b)
        .expect(200);
      expect(rows.body.items.length).toBeGreaterThan(0);
      expect(rows.body.items.every((item) => item.organizationId === a)).toBe(true);
      expect(JSON.stringify(rows.body)).not.toContain(inB.session_id);
      await readAudit(personal.access_token, '/audit/organization-events').expect(403);
      await readAudit(inA.access_token, `/audit/organization-events?organizationId=${b}`).expect(
        400,
      );
      const own = await readAudit(personal.access_token).expect(200);
      expect(own.body.items.some((item) => item.organizationId === a)).toBe(true);
      expect(own.body.items.some((item) => item.organizationId === b)).toBe(true);
      await memberships.updateOne(
        { organizationId: a, userId },
        { $set: { roles: [Role.MANAGER] } },
      );
      await readAudit(inA.access_token, '/audit/organization-events').expect(403);
      const actor = await app.get(AuthService).validateSession(userId, inA.session_id);
      await expect(
        app.get(AuditQueryService).list(PolicyResource.AUDIT_EVENT, {
          ...actor,
          sessionId: inA.session_id,
          roles: [Role.SYSTEM_ADMIN],
        }),
      ).rejects.toThrow();
    });

    it('does not leak another account through own audit and denies anonymous/forged reader inputs', async () => {
      await users.create({
        name: 'Other',
        email: 'other@example.com',
        password: await bcrypt.hash(password, 4),
        roles: [Role.CUSTOMER],
        status: AccountStatus.ACTIVE,
      });
      const other = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'other@example.com', password })
        .expect(201);
      const me = await login();
      const rows = await readAudit(me.access_token).expect(200);
      expect(JSON.stringify(rows.body)).not.toContain(other.body.session_id);
      await request(app.getHttpServer()).get('/audit/own-events').expect(401);
      await readAudit(me.access_token, '/audit/own-events?userId=000000000000000000000001').expect(
        400,
      );
      for (const query of ['limit=101', 'limit=1.5', 'before=bad', 'before[$ne]=null'])
        await readAudit(me.access_token, '/audit/own-events?' + query).expect(400);
    });

    it('redacts cross-context actor organization/session in canonical revocations visible to A', async () => {
      const a = await tenant('A', [Role.SYSTEM_ADMIN]),
        b = await tenant('B', [Role.SYSTEM_ADMIN]);
      const adminA = await login('A admin', a),
        targetA = await login('A target', a),
        inB = await login('B', b);
      await request(app.getHttpServer())
        .delete(`/auth/sessions/${targetA.session_id}`)
        .auth(inB.access_token, { type: 'bearer' })
        .expect(200);
      const rows = await readAudit(adminA.access_token, '/audit/organization-events').expect(200);
      const canonical = rows.body.items.find((item) => item.targetSessionId === targetA.session_id);
      expect(canonical.source).toBe('revocation');
      expect(canonical.actorOrganizationId).toBeNull();
      expect(canonical.sessionId).toBeNull();
      expect(JSON.stringify(rows.body)).not.toContain(b);
      expect(JSON.stringify(rows.body)).not.toContain(inB.session_id);
    });

    it('paginates both sources without duplicates and projects out malicious/raw extra fields', async () => {
      const me = await login();
      const old = await sessions.create(userId);
      await sessions.revoke(old.sessionId, userId);
      for (let n = 0; n < 6; n++) await probe(me.access_token).expect(200);
      await auditModel().collection.updateMany(
        {},
        { $set: { password: 'UNSAFE_FIELD', currentTokenHash: 'UNSAFE_HASH' } },
      );
      await revocationModel.collection.updateMany({}, { $set: { refreshToken: 'UNSAFE_TOKEN' } });
      const seen: string[] = [];
      let cursor: string | null = null;
      let foundRevocation = false;
      for (let n = 0; n < 20; n++) {
        const response = await readAudit(
          me.access_token,
          '/audit/own-events?limit=2' + (cursor ? '&before=' + cursor : ''),
        ).expect(200);
        expect(JSON.stringify(response.body)).not.toMatch(
          /UNSAFE_|password|currentTokenHash|refreshToken/,
        );
        for (const row of response.body.items) {
          seen.push(row.eventId + '.' + row.source);
          if (row.source === 'revocation') foundRevocation = true;
        }
        cursor = response.body.nextCursor;
        if (!cursor) break;
      }
      expect(cursor).toBeNull();
      expect(foundRevocation).toBe(true);
      expect(new Set(seen).size).toBe(seen.length);
      await sessionModel.deleteOne({ sessionId: old.sessionId });
      expect(
        (await app.get(SecurityAuditService).page({ kind: 'user', id: userId }, 100)).items.some(
          (item) => item.source === 'revocation',
        ),
      ).toBe(true);
    });

    it('persists allow/deny decisions for every registered policy (global account writes deliberately have no allow)', async () => {
      const org = await tenant('Matrix', [Role.SYSTEM_ADMIN]);
      const loginPair = await login('Matrix', org);
      const identity = await app.get(AuthService).validateSession(userId, loginPair.session_id);
      const audit = app.get(SecurityAuditService),
        engine = app.get(PolicyEngine);
      for (const policy of POLICY_DEFINITIONS) {
        const actor = { ...identity, sessionId: loginPair.session_id, roles: [policy.roles[0]] };
        const resource = {
          type: policy.resource,
          ownerId: userId,
          organizationId: org,
          accessState: 'active' as const,
        };
        const allowed = engine.evaluate(policy, {
          subject: actor,
          resource,
          environment: { method: policy.action },
        }).allowed;
        const prohibited =
          policy.resource === PolicyResource.USER &&
          [PolicyAction.UPDATE, PolicyAction.DELETE].includes(policy.action);
        expect(allowed).toBe(!prohibited);
        await audit.record(
          AuditEvent.AUTHORIZATION,
          allowed ? 'allowed' : 'denied',
          'service',
          actor,
          policy,
        );
        expect(
          engine.evaluate(policy, {
            subject: { ...actor, roles: [] },
            resource,
            environment: { method: policy.action },
          }).allowed,
        ).toBe(false);
        await audit.record(AuditEvent.AUTHORIZATION, 'denied', 'service', actor, policy);
        expect(
          await auditModel().countDocuments({
            resource: policy.resource,
            action: policy.action,
            result: 'denied',
          }),
        ).toBeGreaterThan(0);
        if (!prohibited)
          expect(
            await auditModel().countDocuments({
              resource: policy.resource,
              action: policy.action,
              result: 'allowed',
            }),
          ).toBeGreaterThan(0);
      }
    });

    it('keeps concurrent persisted decisions and request IDs distinct', async () => {
      const me = await login();
      const responses = await Promise.all(
        Array.from({ length: 12 }, () => probe(me.access_token).expect(200)),
      );
      const ids = responses.map((response) => response.headers['x-request-id']);
      expect(new Set(ids).size).toBe(12);
      expect(
        await auditModel().countDocuments({
          requestId: { $in: ids },
          event: AuditEvent.AUTHORIZATION,
          phase: 'guard',
          result: 'allowed',
        }),
      ).toBe(12);
      await auditModel().updateOne(
        { requestId: ids[0] },
        { $set: { result: 'denied', requestId: 'tampered' } },
      );
      expect(await auditModel().countDocuments({ requestId: ids[0], result: 'allowed' })).toBe(1);
    });

    it('fails closed on real MongoDB audit insert rejection, returning no login/refresh credentials or business write', async () => {
      const me = await login();
      const org = await tenant('A', [Role.MANAGER]);
      const manager = await login('Manager', org);
      await connection.db.command({
        collMod: 'security_audit_events',
        validator: { $jsonSchema: { required: ['field_that_the_writer_never_supplies'] } },
        validationLevel: 'strict',
      });
      try {
        const loginFailure = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'session@example.com', password })
          .expect(503);
        const refreshFailure = await request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken: me.refresh_token })
          .expect(503);
        for (const response of [loginFailure, refreshFailure])
          expect(JSON.stringify(response.body)).not.toMatch(
            /access_token|refresh_token|mongodb|field_that/,
          );
        await request(app.getHttpServer())
          .post('/disciplines')
          .auth(manager.access_token, { type: 'bearer' })
          .send({ name: 'Must not be written' })
          .expect(503);
        expect(await connection.models.Discipline.countDocuments({})).toBe(0);
      } finally {
        await connection.db.command({ collMod: 'security_audit_events', validator: {} });
      }
      await probe(manager.access_token).expect(200);
    });

    it('does not grant audit results on a reader error or log/return raw diagnostic secrets', async () => {
      const me = await login();
      const failure = jest.spyOn(auditModel(), 'aggregate').mockReturnValueOnce({
        read: () => ({
          exec: async () => {
            throw new Error('mongodb://operator:NeverExpose@host jwt=NeverExpose');
          },
        }),
      } as any);
      try {
        const response = await readAudit(me.access_token).expect(503);
        expect(JSON.stringify(response.body)).not.toMatch(/NeverExpose|mongodb/);
      } finally {
        failure.mockRestore();
      }
      const accountRead = jest
        .spyOn(app.get(UsersService), 'findOneByEmailWithPassword')
        .mockRejectedValueOnce(new Error('password=NeverExpose'));
      try {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'session@example.com', password })
          .expect(500);
        expect(JSON.stringify(response.body)).not.toContain('NeverExpose');
        expect(JSON.stringify(await auditModel().find().lean())).not.toContain('NeverExpose');
      } finally {
        accountRead.mockRestore();
      }
    });

    it('refuses missing/unsafe audit indexes without destructive automatic repair', async () => {
      const model = auditModel();
      await model.collection.createIndex(
        { occurredAt: 1 },
        { name: 'test_unsafe_ttl', expireAfterSeconds: 86400 },
      );
      try {
        await expect(verifyAuditIndexes(model)).rejects.toThrow('operator review');
      } finally {
        await model.collection.dropIndex('test_unsafe_ttl');
      }
      await model.collection.dropIndex('requestId_1');
      try {
        await expect(verifyAuditIndexes(model)).rejects.toThrow('operator review');
      } finally {
        await model.createIndexes();
      }
      await expect(verifyAuditIndexes(model)).resolves.toBeUndefined();
      await expect(verifyAuditIndexes(revocationModel)).resolves.toBeUndefined();
    });

    it('exports a scoped JSONL archive with verified digest and never deletes authoritative rules', async () => {
      const me = await login();
      const old = await sessions.create(userId);
      await sessions.revoke(old.sessionId, userId);
      const directory = await mkdtemp(join(tmpdir(), 'issue6-audit-'));
      const destination = join(directory, 'archive.jsonl');
      try {
        await exportAudit(app.get(SecurityAuditService), { kind: 'user', id: userId }, destination);
        const bytes = await readFile(destination);
        const manifest = JSON.parse(await readFile(destination + '.manifest.json', 'utf8'));
        expect(manifest.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(manifest.count).toBe(bytes.toString().trim().split('\n').length);
        expect(manifest.deletionPerformed).toBe(false);
        expect(bytes.toString()).not.toContain(me.access_token);
        expect(bytes.toString()).not.toContain(me.refresh_token);
        await expect(
          exportAudit(app.get(SecurityAuditService), { kind: 'user', id: userId }, destination),
        ).rejects.toThrow();
        expect(await revocationModel.countDocuments({ targetSessionId: old.sessionId })).toBe(1);
        await expect(sessions.findActive(old.sessionId, userId)).rejects.toThrow();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });

  it('lists only my active sessions, identifies current SID, and never returns credentials', async () => {
    const current = await login('Current browser');
    const otherDevice = await login('Other browser');
    const org = await tenant('A');
    const organizationSession = await login('At A', org);
    const stranger = await users.create({
      name: 'Stranger',
      email: 'stranger@example.com',
      password: await bcrypt.hash(password, 4),
      status: AccountStatus.ACTIVE,
      roles: [Role.CUSTOMER],
    });
    const strangerSession = await sessions.create(stranger.id);
    const revoked = await sessions.create(userId);
    await sessions.revoke(revoked.sessionId, userId);
    const expired = await sessions.create(userId);
    await sessionModel.updateOne(
      { sessionId: expired.sessionId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const response = await request(app.getHttpServer())
      .get('/auth/sessions')
      .auth(current.access_token, { type: 'bearer' })
      .expect(200);
    expect(response.body.items.map((item) => item.sessionId).sort()).toEqual(
      [current.session_id, otherDevice.session_id, organizationSession.session_id].sort(),
    );
    expect(
      response.body.items.filter((item) => item.current).map((item) => item.sessionId),
    ).toEqual([current.session_id]);
    expect(
      response.body.items.find((item) => item.sessionId === organizationSession.session_id)
        .organizationId,
    ).toBe(org);
    expect(JSON.stringify(response.body)).not.toMatch(
      /currentToken|consumedTokens|tokenHash|password|rotationVersion/,
    );
    for (const secret of [
      current.access_token,
      current.refresh_token,
      strangerSession.refreshToken,
    ])
      expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(response.body.nextCursor).toBeNull();
  });

  it('resolves an arbitrary session target instead of assigning it the current owner', async () => {
    const current = await login();
    await request(app.getHttpServer())
      .get(`/probe/session-target/${randomUUID()}`)
      .auth(current.access_token, { type: 'bearer' })
      .expect(404);
  });

  it('paginates own sessions and rejects client-chosen user/organization and invalid limits', async () => {
    const current = await login('Current');
    const second = await login('Second');
    const get = (query = '') =>
      request(app.getHttpServer())
        .get(`/auth/sessions${query}`)
        .auth(current.access_token, { type: 'bearer' });
    const first = await get('?limit=1').expect(200);
    expect(first.body.items.map((item) => item.sessionId)).toEqual([second.session_id]);
    expect(first.body.nextCursor).toMatch(/^[a-f0-9]{24}$/);
    const next = await get(`?limit=1&before=${first.body.nextCursor}`).expect(200);
    expect(next.body.items.map((item) => item.sessionId)).toEqual([current.session_id]);
    expect(next.body.nextCursor).toBeNull();
    for (const query of [
      '?limit=0',
      '?limit=101',
      '?limit=1.5',
      '?before=bad',
      `?userId=${new Types.ObjectId()}`,
      `?organizationId=${new Types.ObjectId()}`,
    ])
      await get(query).expect(400);
    await request(app.getHttpServer()).get('/auth/sessions').expect(401);
  });

  describe('Audited revocations — real MongoDB, serialized with admission', () => {
    const call = (method: 'get' | 'delete', path: string, token: string) =>
      request(app.getHttpServer())[method](path).auth(token, { type: 'bearer' });
    const refresh = (token: string) =>
      request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: token });
    async function stranger(name = 'stranger') {
      const account = await users.create({
        name,
        email: `${name}@example.com`,
        password: await bcrypt.hash(password, 4),
        status: AccountStatus.ACTIVE,
        roles: [Role.CUSTOMER],
      });
      const enter = async (organizationId?: string) =>
        (
          await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: account.email, password, ...(organizationId ? { organizationId } : {}) })
            .expect(201)
        ).body;
      return { account, enter };
    }
    it('revokes one owned session, denies foreign IDs and immediately rejects both credentials', async () => {
      const current = await login('Current'),
        target = await login('Target'),
        outsider = await stranger();
      const other = await outsider.enter();
      await call('delete', `/auth/sessions/${other.session_id}`, current.access_token).expect(404);
      expect(await revocationModel.countDocuments()).toBe(0);
      const result = await call(
        'delete',
        `/auth/sessions/${target.session_id}`,
        current.access_token,
      ).expect(200);
      const event = await revocationModel.findById(result.body.revocationId).lean();
      expect(event.action).toBe(RevocationAction.REVOKE);
      expect(event.actorUserId.toString()).toBe(userId);
      expect(event.actorSessionId).toBe(current.session_id);
      expect(event.targetSessionId).toBe(target.session_id);
      expect(event.actorOrganizationId).toBeNull();
      await probe(target.access_token).expect(401);
      await refresh(target.refresh_token).expect(401);
      await probe(current.access_token).expect(200);
      await probe(other.access_token).expect(200);
      await call('delete', `/auth/sessions/${target.session_id}`, current.access_token).expect(404);
      const list = await call('get', '/auth/sessions', current.access_token).expect(200);
      expect(list.body.items.map((item) => item.sessionId)).toEqual([current.session_id]);
      const text = JSON.stringify(event);
      for (const secret of [target.access_token, target.refresh_token, current.refresh_token])
        expect(text).not.toContain(secret);
      expect(text).not.toMatch(/currentToken|consumedTokens|password|tokenHash/);
    });
    it('revokes others across own contexts, preserves current/other users and permits a later login', async () => {
      const current = await login('Current'),
        second = await login('Second');
      const org = await tenant('A'),
        inOrg = await login('Org', org);
      const other = await (await stranger()).enter();
      const result = await call('delete', '/auth/sessions/others', current.access_token).expect(
        200,
      );
      expect(result.body.excludesCurrent).toBe(true);
      for (const entry of [second, inOrg]) {
        await probe(entry.access_token).expect(401);
        await refresh(entry.refresh_token).expect(401);
      }
      await probe(current.access_token).expect(200);
      await probe(other.access_token).expect(200);
      const list = await call('get', '/auth/sessions?limit=1', current.access_token).expect(200);
      expect(list.body.items.map((item) => item.sessionId)).toEqual([current.session_id]);
      expect(list.body.nextCursor).toBeNull();
      const later = await login('Later');
      await probe(later.access_token).expect(200);
      expect((await revocationModel.findById(result.body.revocationId)).excludedSessionId).toBe(
        current.session_id,
      );
    });
    it('revokes all own sessions including current, not other users; later login and audited logout work', async () => {
      const current = await login('Current'),
        second = await login('Second'),
        other = await (await stranger()).enter();
      await call('delete', '/auth/sessions', current.access_token)
        .send({ userId: new Types.ObjectId().toString() })
        .expect(200);
      for (const entry of [current, second]) {
        await probe(entry.access_token).expect(401);
        await refresh(entry.refresh_token).expect(401);
      }
      await probe(other.access_token).expect(200);
      const later = await login('Later');
      await probe(later.access_token).expect(200);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .auth(later.access_token, { type: 'bearer' })
        .expect(200);
      const logout = await revocationModel.findOne({ targetSessionId: later.session_id });
      expect(logout.action).toBe(RevocationAction.LOGOUT);
      expect(logout.actorSessionId).toBe(later.session_id);
      await probe(later.access_token).expect(401);
    });
    it('binds administrative lookup/revoke to A even for an account shared with B', async () => {
      const a = await tenant('A', [Role.SYSTEM_ADMIN]),
        b = await tenant('B', [Role.SYSTEM_ADMIN]);
      const admin = await login('Admin A', a),
        inB = await login('Own B', b),
        personal = await login('Personal');
      const target = await stranger();
      for (const org of [a, b])
        await memberships.create({
          organizationId: org,
          userId: target.account._id,
          status: 'active',
          roles: [Role.CUSTOMER],
        });
      const targetA = await target.enter(a),
        targetB = await target.enter(b),
        targetPersonal = await target.enter();
      const listed = await call('get', '/auth/organization-sessions', admin.access_token).expect(
        200,
      );
      expect(listed.body.items.map((item) => item.sessionId).sort()).toEqual(
        [admin.session_id, targetA.session_id].sort(),
      );
      expect(listed.body.items.find((item) => item.sessionId === targetA.session_id).userId).toBe(
        target.account.id,
      );
      await call('delete', `/auth/organization-sessions/${targetB.session_id}`, admin.access_token)
        .set('X-Organization-Id', b)
        .expect(404);
      await call(
        'delete',
        `/auth/organization-sessions/${targetPersonal.session_id}`,
        admin.access_token,
      ).expect(404);
      await call('get', '/auth/organization-sessions', personal.access_token).expect(403);
      await memberships.updateOne(
        { userId, organizationId: a },
        { $set: { roles: [Role.MANAGER] } },
      );
      await call('get', '/auth/organization-sessions', admin.access_token).expect(403);
      await call('delete', '/auth/organization-sessions', admin.access_token).expect(403);
      await memberships.updateOne(
        { userId, organizationId: a },
        { $set: { roles: [Role.SYSTEM_ADMIN] } },
      );
      await call(
        'delete',
        `/auth/organization-sessions/${targetA.session_id}`,
        admin.access_token,
      ).expect(200);
      await probe(targetA.access_token).expect(401);
      for (const entry of [inB, personal, targetB, targetPersonal])
        await probe(entry.access_token).expect(200);
      const event = await revocationModel.findOne({ targetSessionId: targetA.session_id });
      expect(event.actorOrganizationId.toString()).toBe(a);
      expect(event.organizationId.toString()).toBe(a);
      expect(event.action).toBe(RevocationAction.ADMIN_REVOKE);
    });
    it('organization bulk revoke includes current but never personal/B sessions or later logins', async () => {
      const a = await tenant('A', [Role.SYSTEM_ADMIN]),
        b = await tenant('B', [Role.SYSTEM_ADMIN]);
      const admin = await login('A', a),
        inB = await login('B', b),
        personal = await login();
      const other = await stranger();
      await memberships.create({
        organizationId: a,
        userId: other.account._id,
        status: 'active',
        roles: [Role.CUSTOMER],
      });
      const targetA = await other.enter(a),
        targetPersonal = await other.enter();
      await call('delete', '/auth/organization-sessions', admin.access_token).expect(200);
      for (const entry of [admin, targetA]) {
        await probe(entry.access_token).expect(401);
        await refresh(entry.refresh_token).expect(401);
      }
      for (const entry of [inB, personal, targetPersonal])
        await probe(entry.access_token).expect(200);
      const later = await login('New A', a);
      await probe(later.access_token).expect(200);
      const event = await revocationModel.findOne({ action: RevocationAction.ADMIN_ALL });
      expect(event.organizationId.toString()).toBe(a);
      expect(event.revokedBefore).toBeInstanceOf(Date);
      expect(event.targetUserId).toBeUndefined();
    });
    it('keeps audit after physical session removal and deduplicates concurrent specific revocations', async () => {
      const first = await login('First'),
        second = await login('Second'),
        target = await login('Target');
      const responses = await Promise.all(
        [first, second].map((entry) =>
          call('delete', `/auth/sessions/${target.session_id}`, entry.access_token),
        ),
      );
      expect(responses.every((result) => [200, 404].includes(result.status))).toBe(true);
      const events = await revocationModel.find({ targetSessionId: target.session_id }).lean();
      expect(events).toHaveLength(1);
      expect([first.session_id, second.session_id]).toContain(events[0].actorSessionId);
      await sessionModel.deleteOne({ sessionId: target.session_id });
      expect(await revocationModel.countDocuments({ targetSessionId: target.session_id })).toBe(1);
      expect(
        (await revocationModel.collection.indexes()).some(
          (index) => index.expireAfterSeconds !== undefined,
        ),
      ).toBe(false);
    });
    it('does not perform an unaudited revocation when durable insertion fails', async () => {
      const current = await login('Current'),
        target = await login('Target');
      const failure = jest
        .spyOn(revocationModel, 'create')
        .mockRejectedValueOnce(new Error('Simulated audit write failure'));
      try {
        await call('delete', `/auth/sessions/${target.session_id}`, current.access_token).expect(
          503,
        );
      } finally {
        failure.mockRestore();
      }
      expect(await revocationModel.countDocuments()).toBe(0);
      await probe(target.access_token).expect(200);
      await refresh(target.refresh_token).expect(200);
    });
    it('can revoke the current session specifically, but rejects anonymous/invalid targets', async () => {
      const current = await login();
      await request(app.getHttpServer()).delete('/auth/sessions/others').expect(401);
      await call('delete', '/auth/sessions/not-a-valid-sid', current.access_token).expect(404);
      await call('delete', `/auth/sessions/${current.session_id}`, current.access_token).expect(
        200,
      );
      await probe(current.access_token).expect(401);
      await refresh(current.refresh_token).expect(401);
    });
    it('fails closed if authoritative revocation reads are unavailable', async () => {
      const current = await login();
      const failure = jest
        .spyOn(app.get(SessionRevocationsService), 'assertActive')
        .mockRejectedValueOnce(new Error('Simulated audit read failure'));
      try {
        await probe(current.access_token).expect(500);
      } finally {
        failure.mockRestore();
      }
      await probe(current.access_token).expect(200);
    });
    it('lets an A administrator revoke a suspended account context without killing its B context', async () => {
      const a = await tenant('A', [Role.SYSTEM_ADMIN]),
        b = await tenant('B', [Role.SYSTEM_ADMIN]);
      const admin = await login('Admin', a),
        target = await stranger();
      for (const org of [a, b])
        await memberships.create({
          userId: target.account._id,
          organizationId: org,
          status: 'active',
          roles: [Role.CUSTOMER],
        });
      const inA = await target.enter(a),
        inB = await target.enter(b);
      await users.updateOne(
        { _id: target.account._id },
        { $set: { status: AccountStatus.SUSPENDED } },
      );
      await call(
        'delete',
        `/auth/organization-sessions/${inA.session_id}`,
        admin.access_token,
      ).expect(200);
      await users.updateOne(
        { _id: target.account._id },
        { $set: { status: AccountStatus.ACTIVE } },
      );
      await probe(inA.access_token).expect(401);
      await probe(inB.access_token).expect(200);
    });

    it('any refresh result racing with revocation is unusable after revocation acknowledgement', async () => {
      const current = await login('Current'),
        target = await login('Target');
      const [rotated, deleted] = await Promise.all([
        refresh(target.refresh_token),
        call('delete', `/auth/sessions/${target.session_id}`, current.access_token),
      ]);
      expect(deleted.status).toBe(200);
      expect([200, 401]).toContain(rotated.status);
      await probe(target.access_token).expect(401);
      await refresh(target.refresh_token).expect(401);
      if (rotated.status === 200) {
        await probe(rotated.body.access_token).expect(401);
        await refresh(rotated.body.refresh_token).expect(401);
      }
      await probe(current.access_token).expect(200);
    });
  });

  describe('ABAC resources — real controllers/services and A/B IDOR', () => {
    let a: string, b: string, tokenA: string, tokenB: string;
    const cases = [
      ['disciplines', 'Discipline', PolicyResource.LEGACY_DISCIPLINE],
      ['grades', 'Grade', PolicyResource.LEGACY_GRADE],
      ['attendances', 'Attendance', PolicyResource.LEGACY_ATTENDANCE],
      ['meetings', 'Meeting', PolicyResource.LEGACY_MEETING],
    ] as const;
    const http = (
      method: 'get' | 'post' | 'patch' | 'delete',
      path: string,
      token: string,
      body?: object,
    ) => {
      const call = request(app.getHttpServer())[method](path).auth(token, { type: 'bearer' });
      return body ? call.send(body) : call;
    };
    async function other(name: string, org: string, roles: Role[] = [Role.CUSTOMER]) {
      const account = await users.create({
        name,
        email: `${name}@example.com`,
        password: await bcrypt.hash(password, 4),
        status: AccountStatus.ACTIVE,
        roles: [Role.SYSTEM_ADMIN],
      });
      await memberships.create({
        userId: account._id,
        organizationId: org,
        status: 'active',
        roles,
      });
      return account.id;
    }
    async function payload(path: string, token: string) {
      if (path === 'disciplines') return { name: 'Isolated record' };
      if (path === 'meetings')
        return {
          title: 'Isolated meeting',
          description: 'Study',
          start_at: '2030-01-01T10:00:00Z',
          end_at: '2030-01-01T11:00:00Z',
          participants: [userId],
        };
      const discipline = await http('post', '/disciplines', token, { name: 'Reference' }).expect(
        201,
      );
      return path === 'grades'
        ? { student: userId, discipline: discipline.body.id, value: 8, type: 'PROVA', term: 'BIM1' }
        : {
            student: userId,
            discipline: discipline.body.id,
            date: '2030-01-01',
            status: 'PRESENT',
          };
    }
    beforeEach(async () => {
      a = await tenant('A', [Role.SYSTEM_ADMIN, Role.MANAGER]);
      b = await tenant('B', [Role.SYSTEM_ADMIN, Role.MANAGER]);
      tokenA = (await login('A', a)).access_token;
      tokenB = (await login('B', b)).access_token;
    });
    it.each(cases)(
      'scopes every CRUD for %s; foreign IDs/headers cannot read or write',
      async (path, name) => {
        const dtoA = await payload(path, tokenA),
          dtoB = await payload(path, tokenB);
        const first = await http('post', `/${path}`, tokenA, dtoA).expect(201);
        const second = await http('post', `/${path}`, tokenB, dtoB).expect(201);
        const idA = first.body.id,
          idB = second.body.id;
        expect(idA).toMatch(/^[a-f0-9]{24}$/);
        expect(idB).toMatch(/^[a-f0-9]{24}$/);
        if (path === 'grades' || path === 'attendances') {
          expect(first.body.student).toBe(userId);
          expect(first.body.discipline).toBe(dtoA.discipline);
          expect(first.body.recordedBy).toBe(userId);
        }
        if (path === 'meetings') {
          expect(first.body.participants).toEqual([userId]);
          expect(first.body.createdBy).toBe(userId);
        }
        const stored = await connection.models[name].collection.findOne({
          _id: new Types.ObjectId(idA),
        });
        expect(stored.organizationId.toString()).toBe(a);
        expect(stored.ownerId.toString()).toBe(userId);
        expect(stored.createdBy.toString()).toBe(userId);
        const listed = await http('get', `/${path}`, tokenA).expect(200);
        expect(listed.body.map((item) => item.id)).toContain(idA);
        expect(listed.body.map((item) => item.id)).not.toContain(idB);
        await http('get', `/${path}/${idA}`, tokenA).expect(200);
        await http('get', `/${path}/${idB}`, tokenA).set('X-Organization-Id', b).expect(403);
        await http('patch', `/${path}/${idB}`, tokenA, dtoB).expect(403);
        await http('delete', `/${path}/${idB}`, tokenA).expect(403);
        const patch =
          path === 'disciplines'
            ? { name: 'Updated' }
            : path === 'grades'
              ? { value: 9 }
              : path === 'attendances'
                ? { status: 'ABSENT' }
                : { title: 'Updated' };
        await http('patch', `/${path}/${idA}`, tokenA, patch).expect(200);
        await http('delete', `/${path}/${idA}`, tokenA).expect(200);
        expect(await connection.models[name].exists({ _id: idA })).toBeNull();
        expect(await connection.models[name].exists({ _id: idB })).not.toBeNull();
      },
    );
    it.each(cases)(
      'denies locked writes, unscoped records and personal access for %s',
      async (path, name) => {
        const dto = await payload(path, tokenA);
        const saved = await http('post', `/${path}`, tokenA, dto).expect(201);
        await connection.models[name].collection.updateOne(
          { _id: new Types.ObjectId(saved.body.id) },
          { $set: { accessState: 'locked' } },
        );
        await http('get', `/${path}/${saved.body.id}`, tokenA).expect(200);
        await http('patch', `/${path}/${saved.body.id}`, tokenA, dto).expect(403);
        await http('delete', `/${path}/${saved.body.id}`, tokenA).expect(403);
        const legacy = await connection.models[name].collection.insertOne({ ...dto });
        await http('get', `/${path}/${legacy.insertedId}`, tokenA).expect(403);
        const listed = await http('get', `/${path}`, tokenA).expect(200);
        expect(listed.body.map((item) => item.id)).not.toContain(legacy.insertedId.toString());
        const personal = (await login()).access_token;
        await http('get', `/${path}`, personal).expect(403);
        await http('post', `/${path}`, personal, dto).expect(403);
      },
    );
    it.each(['grades', 'attendances'])(
      'rejects cross-org student/discipline on %s creation and update',
      async (path) => {
        const external = await other('external', b);
        const dto = await payload(path, tokenA);
        const foreign = await http('post', '/disciplines', tokenB, { name: 'B-only' }).expect(201);
        await http('post', `/${path}`, tokenA, { ...dto, student: external }).expect(403);
        await http('post', `/${path}`, tokenA, { ...dto, discipline: foreign.body.id }).expect(403);
        const own = await http('post', `/${path}`, tokenA, dto).expect(201);
        await http('patch', `/${path}/${own.body.id}`, tokenA, { student: external }).expect(403);
        await http('patch', `/${path}/${own.body.id}`, tokenA, {
          discipline: foreign.body.id,
        }).expect(403);
      },
    );
    it('rejects cross-org meeting participants and scopes schedule conflicts', async () => {
      const external = await other('external', b),
        dto = await payload('meetings', tokenA);
      await http('post', '/meetings', tokenA, { ...dto, participants: [external] }).expect(403);
      const own = await http('post', '/meetings', tokenA, dto).expect(201);
      await http('patch', `/meetings/${own.body.id}`, tokenA, { participants: [external] }).expect(
        403,
      );
      await http('post', '/meetings', tokenA, dto).expect(400);
      await http('post', '/meetings', tokenB, dto).expect(201);
    });
    it('scopes user administration and never changes/deletes shared global accounts', async () => {
      const onlyA = await other('only-a', a),
        onlyB = await other('only-b', b),
        shared = await other('shared', a);
      await memberships.create({
        userId: shared,
        organizationId: b,
        status: 'active',
        roles: [Role.CASHIER],
      });
      const list = await http('get', '/users', tokenA).expect(200);
      expect(list.body.map((u) => u.id).sort()).toEqual([onlyA, shared].sort());
      expect(list.body.find((u) => u.id === onlyA).roles).toEqual([Role.CUSTOMER]);
      expect(JSON.stringify(list.body)).not.toContain('password');
      await http('get', `/users/${onlyA}`, tokenA).expect(200);
      await http('get', `/users/${onlyB}`, tokenA).expect(403);
      await http('patch', `/users/${shared}`, tokenA, { email: 'hijack@example.com' }).expect(403);
      await http('delete', `/users/${shared}`, tokenA).expect(403);
      expect((await users.findById(shared)).email).toBe('shared@example.com');
    });
    it.each(['grades', 'attendances', 'meetings'])(
      'isolates %s notifications, recipients and aggregates',
      async (path) => {
        const resources = app.get(ScopedResourcesService);
        const mail = { send: jest.fn().mockResolvedValue(undefined) };
        const mailer = mail as unknown as MailService;
        const invoke =
          path === 'grades'
            ? new GradeListener(resources, mailer).handleGradeCreated.bind(
                new GradeListener(resources, mailer),
              )
            : path === 'attendances'
              ? new AttendanceListener(resources, mailer).handleAttendanceCreated.bind(
                  new AttendanceListener(resources, mailer),
                )
              : new MeetingListener(resources, mailer).handleMeetingCreated.bind(
                  new MeetingListener(resources, mailer),
                );
        const dto: Record<string, any> = await payload(path, tokenA);
        if (path === 'attendances') dto.status = 'ABSENT';
        const own = await http('post', `/${path}`, tokenA, dto).expect(201);
        const subject = {
          id: userId,
          sessionId: (jwt.decode(tokenA) as { sid: string }).sid,
          organizationId: a,
          status: AccountStatus.ACTIVE,
          roles: [Role.SYSTEM_ADMIN],
        };
        if (path === 'attendances') {
          // These invalid raw B references would inflate a global attendance count to 80%.
          await connection.models.Attendance.collection.insertMany(
            Array.from({ length: 4 }, () => ({
              organizationId: new Types.ObjectId(b),
              ownerId: new Types.ObjectId(userId),
              createdBy: new Types.ObjectId(userId),
              accessState: 'active',
              student: new Types.ObjectId(userId),
              discipline: new Types.ObjectId(dto.discipline),
              date: new Date(),
              status: 'PRESENT',
            })),
          );
        }
        await invoke({ record: { id: own.body.id }, subject });
        expect(mail.send).toHaveBeenCalledTimes(1);
        const foreignDto = await payload(path, tokenB);
        const foreign = await http('post', `/${path}`, tokenB, foreignDto).expect(201);
        await expect(invoke({ record: { id: foreign.body.id }, subject })).rejects.toThrow();
        expect(mail.send).toHaveBeenCalledTimes(1);
        const external = await other('external', b);
        const model =
          path === 'grades' ? 'Grade' : path === 'attendances' ? 'Attendance' : 'Meeting';
        await connection.models[model].collection.updateOne(
          { _id: new Types.ObjectId(own.body.id) },
          {
            $set:
              path === 'meetings'
                ? { participants: [new Types.ObjectId(external)] }
                : { student: new Types.ObjectId(external) },
          },
        );
        await expect(invoke({ record: { id: own.body.id }, subject })).rejects.toThrow();
        expect(mail.send).toHaveBeenCalledTimes(1);
      },
    );

    it('revalidates roles in services, rejects forged metadata and honors session/account state', async () => {
      const session = await login('direct', a);
      const subject = {
        id: userId,
        sessionId: session.session_id,
        organizationId: a,
        status: AccountStatus.ACTIVE,
        roles: [Role.SYSTEM_ADMIN],
      };
      const resources = app.get(ScopedResourcesService);
      await expect(
        resources.create(
          PolicyResource.LEGACY_DISCIPLINE,
          { name: 'Forged', organizationId: b },
          subject,
        ),
      ).rejects.toThrow();
      await http('post', '/disciplines', tokenA, {
        name: 'Forged',
        ownerId: new Types.ObjectId().toString(),
      }).expect(400);
      await memberships.updateOne(
        { organizationId: a, userId },
        { $set: { roles: [Role.CUSTOMER] } },
      );
      await http('get', '/disciplines', tokenA).expect(403);
      await expect(resources.list(PolicyResource.LEGACY_DISCIPLINE, subject)).rejects.toThrow();
      await memberships.updateOne(
        { organizationId: a, userId },
        { $set: { roles: [Role.MANAGER] } },
      );
      await users.updateOne({ _id: userId }, { $set: { status: AccountStatus.SUSPENDED } });
      await expect(resources.list(PolicyResource.LEGACY_DISCIPLINE, subject)).rejects.toThrow();
      await http('get', '/disciplines', tokenA).expect(401);
    });
  });

  describe('#16 configuration regression — reduction never evicts', () => {
    const path = '/auth/organization-session-limit';
    const http = (method: 'get' | 'patch', token: string, body?: object) => {
      const call = request(app.getHttpServer())[method](path).auth(token, { type: 'bearer' });
      return body ? call.send(body) : call;
    };
    async function setup() {
      const a = await tenant('Configuration A', [Role.SYSTEM_ADMIN]);
      const b = await tenant('Configuration B', [Role.SYSTEM_ADMIN]);
      const first = await login('Config A', a),
        second = await login('Config B', b);
      const identity = await app.get(AuthService).validateSession(userId, first.session_id);
      return { a, b, first, second, actor: { ...identity, sessionId: first.session_id } };
    }
    it('returns independent defaults without writes; personal is not assigned a limit', async () => {
      const s = await setup();
      for (const [token, org] of [
        [s.first.access_token, s.a],
        [s.second.access_token, s.b],
      ]) {
        const res = await http('get', token).expect(200);
        expect(res.body).toEqual({
          scope: 'organization',
          applicationId: 'animal-feed-warehouse',
          organizationId: org,
          limit: 3,
          version: 0,
        });
      }
      expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(0);
      await http('get', (await login()).access_token).expect(403);
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path + '?organizationId=' + s.b)
        .auth(s.first.access_token, { type: 'bearer' })
        .expect(400);
      const header = await http('get', s.first.access_token)
        .set('X-Organization-Id', s.b)
        .set('X-Application-Id', 'cta')
        .expect(200);
      expect(header.body.organizationId).toBe(s.a);
      expect(header.body.applicationId).toBe('animal-feed-warehouse');
    });
    it('persists versioned configuration and audit receipt without exposing identity/secrets', async () => {
      const s = await setup();
      await http('patch', s.first.access_token, { limit: 5, expectedVersion: 0 }).expect(200);
      const a = await http('get', s.first.access_token).expect(200);
      expect(a.body.limit).toBe(5);
      expect(a.body.version).toBe(1);
      expect((await http('get', s.second.access_token).expect(200)).body.limit).toBe(3);
      const row = await connection.models.SessionLimitRevision.findOne({
        organizationId: s.a,
      }).lean<SessionLimitRevision & { _id: Types.ObjectId }>();
      expect(row.previousLimit).toBe(3);
      expect(row.actorUserId.toString()).toBe(userId);
      expect(row.roles).toEqual([Role.SYSTEM_ADMIN]);
      const completion = await connection.models.SecurityAuditRecord.findOne({
        event: 'session_limit_configuration',
        result: 'allowed',
        targetId: row._id.toString(),
      });
      expect(completion.requestId).toBe(row.requestId);
      expect(JSON.stringify(row)).not.toContain(s.first.access_token);
      expect(Object.keys(a.body).sort()).toEqual([
        'applicationId',
        'limit',
        'organizationId',
        'scope',
        'version',
      ]);
      await http('patch', s.first.access_token, { limit: 4, expectedVersion: 0 }).expect(409);
    });
    it.each([Role.ORGANIZATION_OWNER, Role.MANAGER, Role.CUSTOMER, Role.AUDITOR])(
      'denies %s even with global administrative roles',
      async (role) => {
        const s = await setup();
        await users.updateOne({ _id: userId }, { $set: { roles: [Role.SYSTEM_ADMIN] } });
        await memberships.updateOne({ organizationId: s.a, userId }, { $set: { roles: [role] } });
        await http('get', s.first.access_token).expect(403);
        await http('patch', s.first.access_token, { limit: 2, expectedVersion: 0 }).expect(403);
        expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(0);
        expect(
          await connection.models.SecurityAuditRecord.countDocuments({
            resource: PolicyResource.SESSION_LIMIT_CONFIGURATION,
            result: 'denied',
          }),
        ).toBeGreaterThan(0);
      },
    );
    it('revalidates direct service calls, forged tenant/fields and inactive contexts', async () => {
      const s = await setup(),
        service = app.get(SessionLimitConfigurationService);
      await expect(
        service.update({ ...s.actor, organizationId: s.b }, { limit: 2, expectedVersion: 0 }),
      ).rejects.toThrow();
      for (const extra of [
        { organizationId: s.b },
        { applicationId: 'cta' },
        { userId },
        { roles: [Role.SYSTEM_ADMIN] },
      ]) {
        await http('patch', s.first.access_token, {
          limit: 2,
          expectedVersion: 0,
          ...extra,
        }).expect(400);
        await expect(
          service.update(s.actor, { limit: 2, expectedVersion: 0, ...extra }),
        ).rejects.toThrow();
      }
      await memberships.updateOne(
        { organizationId: s.a, userId },
        { $set: { roles: [Role.CUSTOMER] } },
      );
      await expect(
        service.update(
          { ...s.actor, roles: [Role.SYSTEM_ADMIN] },
          { limit: 2, expectedVersion: 0 },
        ),
      ).rejects.toThrow();
      await memberships.updateOne(
        { organizationId: s.a, userId },
        { $set: { roles: [Role.SYSTEM_ADMIN], status: 'suspended' } },
      );
      await expect(service.read(s.actor)).rejects.toThrow();
      await http('get', s.first.access_token).expect(403);
      await memberships.updateOne({ organizationId: s.a, userId }, { $set: { status: 'active' } });
      await organizations.updateOne({ _id: s.a }, { $set: { status: 'suspended' } });
      await expect(service.read(s.actor)).rejects.toThrow();
      await organizations.updateOne({ _id: s.a }, { $set: { status: 'active' } });
      await users.updateOne({ _id: userId }, { $set: { status: AccountStatus.SUSPENDED } });
      await expect(service.read(s.actor)).rejects.toThrow();
      expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(0);
    });
    it('rejects invalid values at HTTP and never changes sessions when reducing', async () => {
      const s = await setup();
      for (const limit of [0, -1, 101, 1.5, '3', null])
        await http('patch', s.first.access_token, { limit, expectedVersion: 0 }).expect(400);
      for (let i = 0; i < 2; i++) await login('Existing ' + i, s.a);
      const filter = { organizationId: new Types.ObjectId(s.a) };
      const before = await sessionModel.collection.find(filter).toArray();
      const revocationsBefore = await revocationModel.countDocuments();
      await http('patch', s.first.access_token, { limit: 1, expectedVersion: 0 }).expect(200);
      expect(await sessionModel.collection.find(filter).toArray()).toEqual(before);
      expect(await revocationModel.countDocuments()).toBe(revocationsBefore);
      await probe(s.first.access_token).expect(200);
    });
    it('allows exactly one successor across separate service instances and persists primary visibility', async () => {
      const s = await setup(),
        first = app.get(SessionLimitConfigurationService);
      const other = new SessionLimitConfigurationService(
        connection.models.SessionLimitRevision,
        app.get(SessionManagementService),
        app.get(SecurityAuditService),
        app.get(AuditContext),
        app.get(SessionSerializationService),
      );
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          (i % 2 ? first : other).update(s.actor, { limit: i + 1, expectedVersion: 0 }),
        ),
      );
      expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(
        attempts
          .filter((result) => result.status === 'rejected')
          .every((result) => (result as PromiseRejectedResult).reason.getStatus() === 409),
      ).toBe(true);
      expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(1);
      expect(await other.read(s.actor)).toEqual(await first.read(s.actor));
    });
    it('fails closed on missing/TTL configuration indexes and corrupt stored values', async () => {
      const s = await setup(),
        model = connection.models.SessionLimitRevision,
        service = app.get(SessionLimitConfigurationService);
      await model.collection.dropIndex('applicationId_1_organizationId_1_version_-1');
      try {
        await expect(service.onModuleInit()).rejects.toThrow('unavailable');
      } finally {
        await model.createIndexes();
      }
      await model.collection.createIndex(
        { occurredAt: 1 },
        { expireAfterSeconds: 3600, name: 'unsafe_config_ttl' },
      );
      try {
        await expect(service.onModuleInit()).rejects.toThrow('unsafe');
      } finally {
        await model.collection.dropIndex('unsafe_config_ttl');
      }
      await model.collection.insertOne({
        applicationId: 'animal-feed-warehouse',
        organizationId: new Types.ObjectId(s.a),
        version: 1,
        limit: 0,
      });
      await expect(service.read(s.actor)).rejects.toThrow('unavailable');
      await http('get', s.first.access_token).expect(503);
    });
    it('records failed configuration insertion without changing the policy', async () => {
      const s = await setup();
      await connection.db.command({
        collMod: 'session_limit_revisions',
        validator: { limit: { $lte: 1 } },
        validationAction: 'error',
      });
      try {
        await http('patch', s.first.access_token, { limit: 2, expectedVersion: 0 }).expect(503);
      } finally {
        await connection.db.command({ collMod: 'session_limit_revisions', validator: {} });
      }
      expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(0);
      expect(
        await connection.models.SecurityAuditRecord.countDocuments({
          event: AuditEvent.SESSION_LIMIT_CONFIGURATION,
          result: 'error',
        }),
      ).toBeGreaterThan(0);
      expect((await http('get', s.first.access_token).expect(200)).body).toMatchObject({
        limit: 3,
        version: 0,
      });
    });

    it('aborts configuration and receipt together on audit failure; retry remains versioned', async () => {
      const s = await setup(),
        audit = app.get(SecurityAuditService);
      const record = audit.record.bind(audit);
      const spy = jest.spyOn(audit, 'record').mockImplementation(async (...args) => {
        if (args[0] === AuditEvent.SESSION_LIMIT_CONFIGURATION && args[1] === 'allowed')
          throw new ServiceUnavailableException('Security audit unavailable');
        return record(...args);
      });
      try {
        await http('patch', s.first.access_token, { limit: 2, expectedVersion: 0 }).expect(503);
      } finally {
        spy.mockRestore();
      }
      expect(await connection.models.SessionLimitRevision.countDocuments()).toBe(0);
      expect((await http('get', s.first.access_token).expect(200)).body).toMatchObject({
        limit: 3,
        version: 0,
      });
      await http('patch', s.first.access_token, { limit: 2, expectedVersion: 0 }).expect(200);
      await http('patch', s.first.access_token, { limit: 2, expectedVersion: 0 }).expect(409);
    });
  });

  it('binds independent sessions to A/B and uses roles from each membership', async () => {
    const a = await tenant('A', [Role.MANAGER]);
    const b = await tenant('B', [Role.CASHIER]);
    const first = await login('A device', a);
    const second = await login('B device', b);
    expect(first.organization_id).toBe(a);
    expect(second.organization_id).toBe(b);
    const inA = await probe(first.access_token).expect(200);
    const inB = await probe(second.access_token).expect(200);
    expect(inA.body).toMatchObject({ organizationId: a, roles: [Role.MANAGER] });
    expect(inB.body).toMatchObject({ organizationId: b, roles: [Role.CASHIER] });
    const saved = await sessionModel.findOne({ sessionId: first.session_id });
    expect(saved?.organizationId?.toString()).toBe(a);
    expect(
      await sessionModel.collection.countDocuments({
        sessionId: first.session_id,
        userId: { $type: 'objectId' },
        organizationId: { $type: 'objectId' },
      }),
    ).toBe(1);
    expect(jwt.decode(first.access_token)).toMatchObject({ organizationId: a });
    const headerAttempt = await request(app.getHttpServer())
      .get('/probe')
      .auth(first.access_token, { type: 'bearer' })
      .set('X-Organization-Id', b)
      .expect(200);
    expect(headerAttempt.body.organizationId).toBe(a);
  });

  it('does not infer a tenant or administrative permission from account roles', async () => {
    await tenant('A', [Role.SYSTEM_ADMIN]);
    await users.updateOne({ _id: userId }, { $set: { roles: [Role.SYSTEM_ADMIN] } });
    const personal = await login();
    expect(personal.organization_id).toBeNull();
    expect((await probe(personal.access_token).expect(200)).body.roles).toEqual([Role.CUSTOMER]);
    await request(app.getHttpServer())
      .get('/probe/admin')
      .auth(personal.access_token, { type: 'bearer' })
      .expect(403);
  });

  it('rejects an unauthorized tenant before persisting a session and rejects invalid input', async () => {
    await tenant('A');
    const b = (await organizations.create({ name: 'B without membership' }))._id.toString();
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'session@example.com', password, organizationId: b })
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'session@example.com', password, organizationId: 'invalid' })
      .expect(400);
    expect(await sessionModel.countDocuments()).toBe(0);
  });

  it('blocks suspended accounts on existing access, refresh and new login', async () => {
    const current = await login();
    await users.updateOne({ _id: userId }, { $set: { status: AccountStatus.SUSPENDED } });
    await probe(current.access_token).expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: current.refresh_token })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'session@example.com', password })
      .expect(401);
  });

  it('denies legacy accounts without explicit active state rather than defaulting them active', async () => {
    const current = await login();
    await users.collection.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $unset: { status: '' } },
    );
    await probe(current.access_token).expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'session@example.com', password })
      .expect(401);
  });

  it.each([MembershipStatus.INVITED, MembershipStatus.SUSPENDED, MembershipStatus.REVOKED])(
    'blocks a tenant session after its membership becomes %s, not another tenant',
    async (status) => {
      const a = await tenant('A');
      const b = await tenant('B');
      const inA = await login('A', a);
      const inB = await login('B', b);
      await memberships.updateOne({ organizationId: a, userId }, { $set: { status } });
      await probe(inA.access_token).expect(403);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: inA.refresh_token })
        .expect(403);
      await probe(inB.access_token).expect(200);
    },
  );

  it('blocks suspended organizations without blocking personal access or another tenant', async () => {
    const a = await tenant('A', [Role.SYSTEM_ADMIN]);
    const b = await tenant('B');
    const inA = await login('A', a);
    const inB = await login('B', b);
    const personal = await login();
    await organizations.updateOne({ _id: a }, { $set: { status: 'suspended' } });
    await probe(inA.access_token).expect(403);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: inA.refresh_token })
      .expect(403);
    await probe(inB.access_token).expect(200);
    await probe(personal.access_token).expect(200);
  });

  it('reloads membership roles and rejects JWT tenant claims inconsistent with the session', async () => {
    const a = await tenant('A', [Role.SYSTEM_ADMIN]);
    const current = await login('A', a);
    await memberships.updateOne(
      { organizationId: a, userId },
      { $set: { roles: [Role.CUSTOMER] } },
    );
    expect((await probe(current.access_token).expect(200)).body.roles).toEqual([Role.CUSTOMER]);
    const wrong = jwt.sign({
      sub: userId,
      sid: current.session_id,
      organizationId: new Types.ObjectId().toString(),
    });
    const missing = jwt.sign({ sub: userId, sid: current.session_id });
    await probe(wrong).expect(401);
    await probe(missing).expect(401);
  });

  it('keeps refresh bound to its stored organization, ignoring forged headers', async () => {
    const a = await tenant('A');
    const b = await tenant('B');
    const current = await login('A', a);
    // Mongoose writes cannot move an existing session to another organization.
    await sessionModel.updateOne(
      { sessionId: current.session_id },
      { $set: { organizationId: b } },
    );
    expect(
      (await sessionModel.findOne({ sessionId: current.session_id }))?.organizationId?.toString(),
    ).toBe(a);
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('X-Organization-Id', b)
      .send({ refreshToken: current.refresh_token })
      .expect(200);
    expect(refreshed.body.organization_id).toBe(a);
    expect(jwt.decode(refreshed.body.access_token)).toMatchObject({ organizationId: a });
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refresh_token, organizationId: b })
      .expect(400);
  });

  it('returns 401 without authentication and 403 without an explicit allowed policy', async () => {
    await request(app.getHttpServer()).get('/probe/admin').expect(401);
    await request(app.getHttpServer()).get('/probe/undeclared').expect(401);
    const session = await login();
    for (const path of ['admin', 'undeclared', 'empty', 'all-required', 'unknown-policy']) {
      await request(app.getHttpServer())
        .get(`/probe/${path}`)
        .auth(session.access_token, { type: 'bearer' })
        .expect(403);
    }
    await request(app.getHttpServer()).get('/probe/conflict').expect(403);
    await users.updateOne({ _id: userId }, { $set: { roles: [Role.SYSTEM_ADMIN] } });
    // Global account roles and a personal session must never become tenant permissions.
    for (const path of ['admin', 'all-required']) {
      await request(app.getHttpServer())
        .get(`/probe/${path}`)
        .auth(session.access_token, { type: 'bearer' })
        .expect(403);
    }
    for (const path of ['undeclared', 'empty', 'unknown-policy']) {
      await request(app.getHttpServer())
        .get(`/probe/${path}`)
        .auth(session.access_token, { type: 'bearer' })
        .expect(403);
    }
  });

  it('keeps two device sessions independent through refresh and logout', async () => {
    const mobile = await login('Mobile');
    const computer = await login('Computer');
    expect(mobile.session_id).not.toBe(computer.session_id);
    await probe(mobile.access_token).expect(200);
    await probe(computer.access_token).expect(200);
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: mobile.refresh_token })
      .expect(200);
    expect(refreshed.body.session_id).toBe(mobile.session_id);
    await probe(refreshed.body.access_token).expect(200);
    await probe(computer.access_token).expect(200);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(refreshed.body.access_token, { type: 'bearer' })
      .send({})
      .expect(200);
    await probe(mobile.access_token).expect(401);
    await probe(refreshed.body.access_token).expect(401);
    await probe(computer.access_token).expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: computer.refresh_token })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refresh_token })
      .expect(401);
  });

  it('revokes the family on proven replay, not another device', async () => {
    const first = await login();
    const other = await login();
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refresh_token })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refresh_token })
      .expect(401);
    await probe(rotated.body.access_token).expect(401);
    await probe(other.access_token).expect(200);
    const saved = await sessionModel.findOne({ sessionId: first.session_id });
    expect(saved?.revocationReason).toBe(SessionRevocationReason.REFRESH_REUSE);
  });

  it('does not revoke for an incorrect secret, including a consumed token identifier', async () => {
    const first = await sessions.create(userId);
    const rotated = await sessions.rotate(first.refreshToken);
    const parts = first.refreshToken.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    await expect(sessions.rotate(parts.join('.'))).rejects.toThrow('Invalid or inactive session');
    await expect(sessions.findActive(first.sessionId, userId)).resolves.toBeTruthy();
    await expect(sessions.rotate(rotated.refreshToken)).resolves.toHaveProperty(
      'sessionId',
      first.sessionId,
    );
  });

  it('allows only one concurrent CAS winner and revokes on replay (five trials)', async () => {
    for (let trial = 0; trial < 5; trial++) {
      const session = await sessions.create(userId);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => sessions.rotate(session.refreshToken)),
      );
      // Exactly one CAS rotates, but replay can revoke it before credentials are returned.
      expect(results.filter((result) => result.status === 'fulfilled').length).toBeLessThanOrEqual(
        1,
      );
      const saved = await sessionModel
        .findOne({ sessionId: session.sessionId })
        .select('+consumedTokens');
      expect(saved?.rotationVersion).toBe(1);
      expect(saved?.consumedTokens).toHaveLength(1);
      expect(saved?.revocationReason).toBe(SessionRevocationReason.REFRESH_REUSE);
      expect(
        await revocationModel.countDocuments({
          targetSessionId: session.sessionId,
          action: RevocationAction.REPLAY,
        }),
      ).toBe(1);
      await expect(sessions.findActive(session.sessionId, userId)).rejects.toThrow();
    }
  });

  it('checks expiration explicitly and never extends it on refresh', async () => {
    const session = await sessions.create(userId);
    const rotated = await sessions.rotate(session.refreshToken);
    expect(rotated.expiresAt).toEqual(session.expiresAt);
    await sessionModel.updateOne(
      { sessionId: session.sessionId },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    await expect(sessions.findActive(session.sessionId, userId)).rejects.toThrow();
    await expect(sessions.rotate(rotated.refreshToken)).rejects.toThrow();
  });

  it('enforces ownership for access and logout', async () => {
    const session = await sessions.create(userId);
    const stranger = new Types.ObjectId().toString();
    await expect(sessions.findActive(session.sessionId, stranger)).rejects.toThrow();
    await expect(sessions.revoke(session.sessionId, stranger)).rejects.toThrow();
    await expect(sessions.findActive(session.sessionId, userId)).resolves.toBeTruthy();
    const token = jwt.sign({ sub: stranger, sid: session.sessionId });
    await probe(token).expect(401);
  });

  it('rejects legacy JWTs, expired JWTs and deleted users', async () => {
    const session = await login();
    await probe(jwt.sign({ sub: userId })).expect(401);
    await probe(jwt.sign({ sub: userId, sid: session.session_id }, { expiresIn: -1 })).expect(401);
    await users.deleteOne({ _id: userId });
    await probe(session.access_token).expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: session.refresh_token })
      .expect(401);
  });

  it('enforces the rotation limit only for the valid current credential', async () => {
    const session = await sessions.create(userId);
    await sessionModel.updateOne(
      { sessionId: session.sessionId },
      { $set: { rotationVersion: MAX_SESSION_ROTATIONS } },
    );
    const parts = session.refreshToken.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    await expect(sessions.rotate(parts.join('.'))).rejects.toThrow();
    await expect(sessions.findActive(session.sessionId, userId)).resolves.toBeTruthy();
    await expect(sessions.rotate(session.refreshToken)).rejects.toThrow();
    expect((await sessionModel.findOne({ sessionId: session.sessionId }))?.revocationReason).toBe(
      SessionRevocationReason.ROTATION_LIMIT,
    );
  });

  it('creates the unique session index and hides verifiers from normal reads and serialization', async () => {
    const session = await sessions.create(userId);
    const saved = await sessionModel.findOne({ sessionId: session.sessionId });
    expect(saved?.currentTokenHash).toBeUndefined();
    expect(saved?.consumedTokens).toBeUndefined();
    const raw = await sessionModel
      .findOne({ sessionId: session.sessionId })
      .select('+currentTokenHash +consumedTokens');
    expect(raw?.currentTokenHash).toHaveLength(64);
    expect(raw?.toJSON()).not.toHaveProperty('currentTokenHash');
    expect(raw?.toObject()).not.toHaveProperty('consumedTokens');
    await expect(
      sessionModel.create({
        sessionId: session.sessionId,
        userId,
        currentTokenId: randomUUID(),
        currentTokenHash: 'a'.repeat(64),
        expiresAt: session.expiresAt,
        lastUsedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects invalid login and malformed refresh without creating sessions', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'session@example.com', password: 'wrong' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'x'.repeat(600) })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'x'.repeat(117) })
      .expect(401);
    expect(await sessionModel.countDocuments()).toBe(0);
  });

  it('does not grant global account roles to an unaffiliated personal session', async () => {
    const session = await login();
    await users.updateOne({ _id: userId }, { $set: { roles: [Role.MANAGER] } });
    const result = await probe(session.access_token).expect(200);
    expect(result.body.roles).toEqual([Role.CUSTOMER]);
  });
});
