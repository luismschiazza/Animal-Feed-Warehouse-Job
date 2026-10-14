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
import { UserModelModule } from '@/features/users/models/user-model.module';
import { User } from '@/features/users/schemas/user.schema';
import { UsersService } from '@/features/users/services/users.service';

@Controller('probe')
class ProbeController {
  @Get()
  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.PROFILE })
  probe(@Req() req) {
    return { id: req.user.id, sessionId: req.user.sessionId, roles: req.user.roles };
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
    await sessionModel.init();
    await users.init();
  });

  beforeEach(async () => {
    await sessionModel.deleteMany({});
    await users.deleteMany({});
    const user = await users.create({
      name: 'Session learner',
      email: 'session@example.com',
      password: await bcrypt.hash(password, 4),
      roles: [Role.CUSTOMER],
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (connection?.name === databaseName) await connection.dropDatabase();
    if (app) await app.close();
  });

  async function login(device = 'Computer') {
    const result = await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', device)
      .send({ email: 'session@example.com', password })
      .expect(201);
    return result.body as { access_token: string; refresh_token: string; session_id: string };
  }
  const probe = (token: string) =>
    request(app.getHttpServer()).get('/probe').auth(token, { type: 'bearer' });

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
    for (const path of ['admin', 'all-required']) {
      await request(app.getHttpServer())
        .get(`/probe/${path}`)
        .auth(session.access_token, { type: 'bearer' })
        .expect(200);
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

  it('reads current roles instead of trusting old JWT roles', async () => {
    const session = await login();
    await users.updateOne({ _id: userId }, { $set: { roles: [Role.MANAGER] } });
    const result = await probe(session.access_token).expect(200);
    expect(result.body.roles).toEqual([Role.MANAGER]);
  });
});
