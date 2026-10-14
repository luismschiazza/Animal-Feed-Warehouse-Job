import { Controller, Get, INestApplication, Req, ValidationPipe } from '@nestjs/common';
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
import * as request from 'supertest';
import { PoliciesGuard } from '@/common/authorization/policies.guard';
import { PolicyEngine } from '@/common/authorization/policy-engine.service';
import { Public, RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { AuthSessionsModule } from '@/features/auth/auth-sessions.module';
import { AuthController } from '@/features/auth/controllers/auth.controller';
import { AuthSession, SessionRevocationReason } from '@/features/auth/schemas/auth-session.schema';
import {
  AuthSessionsService,
  MAX_SESSION_ROTATIONS,
} from '@/features/auth/services/auth-sessions.service';
import { AuthService } from '@/features/auth/services/auth.service';
import { JwtStrategy } from '@/features/auth/strategies/jwt.strategy';
import { LocalStrategy } from '@/features/auth/strategies/local.strategy';
import { OrganizationsModule } from '@/features/organizations/organizations.module';
import {
  MembershipStatus,
  OrganizationMembership,
} from '@/features/organizations/schemas/organization-membership.schema';
import { Organization } from '@/features/organizations/schemas/organization.schema';
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
        UserModelModule,
        OrganizationsModule,
        PassportModule.register({ defaultStrategy: 'jwt', session: false }),
        JwtModule.register({
          secret: 'integration-only-secret-not-for-production',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [AuthController, ProbeController],
      providers: [
        AuthService,
        UsersService,
        LocalStrategy,
        JwtStrategy,
        PolicyEngine,
        { provide: APP_GUARD, useClass: PoliciesGuard },
        { provide: EventEmitter2, useValue: { emit: () => undefined } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    connection = module.get(getConnectionToken());
    sessions = module.get(AuthSessionsService);
    sessionModel = module.get(getModelToken(AuthSession.name));
    users = module.get(getModelToken(User.name));
    jwt = module.get(JwtService);
    organizations = module.get(getModelToken(Organization.name));
    memberships = module.get(getModelToken(OrganizationMembership.name));
    await memberships.init();
    await sessionModel.init();
    await users.init();
  });

  beforeEach(async () => {
    await sessionModel.deleteMany({});
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
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const saved = await sessionModel
        .findOne({ sessionId: session.sessionId })
        .select('+consumedTokens');
      expect(saved?.rotationVersion).toBe(1);
      expect(saved?.consumedTokens).toHaveLength(1);
      expect(saved?.revocationReason).toBe(SessionRevocationReason.REFRESH_REUSE);
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
