import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { ProductsModule } from '@/features/products/products.module';
import { ProductsService } from '@/features/products/services/products.service';

describe('Store products — real HTTP, original authentication and two Mongo pools', () => {
  const database = `products_test_${randomUUID().replace(/-/g, '')}`;
  const password = 'disposable-product-password';
  let apps: INestApplication[],
    db: Connection,
    uid: Types.ObjectId,
    a: Types.ObjectId,
    b: Types.ObjectId;
  let tokenA: string, tokenB: string, sessionA: string;
  const model = (name: string): Model<any> => db.models[name];
  const product = (patch = {}) => ({
    sku: 'racao-cao-15kg',
    name: 'Ração para cão adulto',
    category: 'feed',
    targetSpecies: 'dog',
    saleUnit: 'unit',
    priceCents: 18990,
    packageWeightGrams: 15000,
    brand: 'Marca de teste',
    ...patch,
  });
  const http = (i = 0) => request(apps[i].getHttpServer());
  const login = (org: Types.ObjectId | null = a) =>
    http()
      .post('/api/auth/login')
      .send({
        email: 'products@example.test',
        password,
        ...(org ? { organizationId: org.toString() } : {}),
      });
  const post = (data = product(), token = tokenA, i = 0) =>
    http(i).post('/api/products').auth(token, { type: 'bearer' }).send(data);
  const get = (id: string, token = tokenA) =>
    http()
      .get('/api/products/' + id)
      .auth(token, { type: 'bearer' });
  const patch = (id: string, data: object, token = tokenA, i = 0) =>
    http(i)
      .patch('/api/products/' + id)
      .auth(token, { type: 'bearer' })
      .send(data);
  const archive = (id: string, token = tokenA) =>
    http()
      .delete('/api/products/' + id)
      .auth(token, { type: 'bearer' });
  const subject = async (): Promise<PolicySubject> => ({
    id: uid.toString(),
    sessionId: sessionA,
    roles: [Role.SYSTEM_ADMIN],
    status: AccountStatus.ACTIVE,
    organizationId: a.toString(),
    membershipId: (
      await model('OrganizationMembership').findOne({ userId: uid, organizationId: a })
    ).id,
    organizationStatus: 'active',
    membershipStatus: 'active',
  });

  async function instance() {
    const uri = process.env.SESSIONS_TEST_MONGO_URL;
    if (!uri)
      throw new Error(
        'Explicit disposable SESSIONS_TEST_MONGO_URL required, no dotenv or real fallback',
      );
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'disposable-product-jwt-secret' })],
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
        ProductsModule,
      ],
    }).compile();
    const connection = module.get<Connection>(getConnectionToken());
    // Deliberate disposable operator setup, not DDL by product runtime.
    for (const m of Object.values(connection.models)) {
      await m.createCollection();
      await m.createIndexes();
    }
    if (!(await connection.models.SessionSerialization.exists({ _id: SESSION_LIMIT_APPLICATION })))
      await connection.models.SessionSerialization.create({
        _id: SESSION_LIMIT_APPLICATION,
        sequence: 0,
        serverNow: new Date(),
      });
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
    // Compile this checkout explicitly: the CI development image has no preexisting dist.
    execFileSync(process.execPath, ['scripts/build-with-tsc.cjs'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 30000,
    });
    apps = [await instance(), await instance()];
    db = apps[0].get(getConnectionToken());
  });
  beforeEach(async () => {
    for (const name of [
      'Product',
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
        name: 'Catalog manager',
        email: 'products@example.test',
        password: await bcrypt.hash(password, 4),
        status: 'active',
        roles: ['CUSTOMER'],
      })
    )._id;
    a = (await model('Organization').create({ name: 'Loja A' }))._id;
    b = (await model('Organization').create({ name: 'Loja B' }))._id;
    for (const organizationId of [a, b])
      await model('OrganizationMembership').create({
        userId: uid,
        organizationId,
        status: 'active',
        roles: ['MANAGER'],
      });
    const first = await login(a);
    expect(first.status).toBe(201);
    tokenA = first.body.access_token;
    sessionA = first.body.session_id;
    const other = await login(b);
    expect(other.status).toBe(201);
    tokenB = other.body.access_token;
  });
  afterAll(async () => {
    if (db?.name === database) await db.dropDatabase();
    for (const app of apps ?? []) await app.close();
  });

  it('creates, reads, lists, updates and ARCHIVES a real feed product without exposing authority metadata', async () => {
    const created = await post(product({ sku: '  racao-cao-15kg ', name: "  Ração d'Água  " }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      sku: 'RACAO-CAO-15KG',
      name: "Ração d'Água",
      saleUnit: 'unit',
      priceCents: 18990,
      packageWeightGrams: 15000,
      status: 'active',
      archivedAt: null,
    });
    for (const key of [
      'organizationId',
      'ownerId',
      'createdBy',
      'accessState',
      '__v',
      'student',
      'discipline',
    ])
      expect(created.body).not.toHaveProperty(key);
    const stored = await model('Product').findById(created.body.id);
    expect(stored.organizationId.toString()).toBe(a.toString());
    expect(stored.ownerId.toString()).toBe(uid.toString());
    expect((await get(created.body.id)).body.id).toBe(created.body.id);
    const page = await http().get('/api/products').auth(tokenA, { type: 'bearer' });
    expect(page.status).toBe(200);
    expect(page.body.items.map((p) => p.id)).toEqual([created.body.id]);
    expect(page.body.nextCursor).toBeNull();
    const changed = await patch(created.body.id, {
      priceCents: 20000,
      status: 'discontinued',
      description: 'Novo lote vendido separadamente',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.priceCents).toBe(20000);
    expect((await archive(created.body.id)).status).toBe(200);
    expect((await model('Product').findById(created.body.id)).archivedAt).toBeInstanceOf(Date);
    expect((await get(created.body.id)).status).toBe(404);
    expect((await patch(created.body.id, { priceCents: 1 })).status).toBe(403);
    expect((await archive(created.body.id)).status).toBe(403);
    expect(
      (await http().get('/api/products').auth(tokenA, { type: 'bearer' })).body.items,
    ).toHaveLength(0);
    expect((await post()).status).toBe(409);
    expect(await model('Product').countDocuments()).toBe(1);
  });

  it.each([
    { priceCents: '1990' },
    { priceCents: -1 },
    { priceCents: 0 },
    { priceCents: 12.3 },
    { priceCents: 100000001 },
    { priceCents: null },
    { sku: ' ' },
    { sku: 'a'.repeat(65) },
    { name: ' ' },
    { name: 'x'.repeat(161) },
    { category: 'discipline' },
    { targetSpecies: 'student' },
    { saleUnit: 'lesson' },
    { packageWeightGrams: 0 },
    { packageWeightGrams: 3.1 },
    { packageWeightGrams: null },
    { description: 'x'.repeat(1001) },
    { status: 'locked' },
    { status: null },
    { brand: null },
    { organizationId: '000000000000000000000001' },
    { ownerId: '000000000000000000000001' },
    { accessState: 'active' },
    { createdBy: '000000000000000000000001' },
    { roles: ['SYSTEM_ADMIN'] },
    { stock: 99 },
    { value: 10, student: 'x' },
    { $set: { priceCents: 1 } },
  ])('rejects invalid, monetary, school or authority input %j', async (fields) => {
    const response = await post(product(fields));
    expect(response.status).toBe(400);
    expect(await model('Product').countDocuments()).toBe(0);
  });

  it('allows money per kg and bounded package metadata, not free-form stock or implicit unit/SKU changes', async () => {
    const p = await post(
      product({ saleUnit: 'kg', priceCents: 1290, packageWeightGrams: undefined }),
    );
    expect(p.status).toBe(201);
    expect(p.body.saleUnit).toBe('kg');
    for (const data of [
      { sku: 'NEW' },
      { saleUnit: 'unit' },
      { archivedAt: new Date() },
      { priceCents: null },
      { name: null },
      {},
    ])
      expect((await patch(p.body.id, data)).status).toBe(400);
    expect((await get(p.body.id)).body.priceCents).toBe(1290);
  });

  it('keeps same SKU independent in A/B and blocks all cross-ID operations and query/body tenant overrides', async () => {
    const pa = await post(),
      pb = await post(product({ name: 'Produto exclusivo B' }), tokenB);
    expect(pa.status).toBe(201);
    expect(pb.status).toBe(201);
    for (const response of [
      await get(pb.body.id),
      await patch(pb.body.id, { priceCents: 1 }),
      await archive(pb.body.id),
    ]) {
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('Produto exclusivo B');
    }
    expect(
      (
        await http()
          .get('/api/products?organizationId=' + b)
          .auth(tokenA, { type: 'bearer' })
      ).status,
    ).toBe(400);
    expect((await patch(pa.body.id, { organizationId: b.toString() })).status).toBe(400);
    const page = await http().get('/api/products').auth(tokenA, { type: 'bearer' });
    expect(page.body.items.map((p) => p.id)).toEqual([pa.body.id]);
    expect((await get(pb.body.id, tokenB)).body.priceCents).toBe(18990);
  });

  it.each(Object.values(Role))(
    'enforces tenant permission matrix for %s using CURRENT membership, not stale JWT/account roles',
    async (role) => {
      const p = await post();
      expect(p.status).toBe(201);
      await model('OrganizationMembership').updateOne(
        { userId: uid, organizationId: a },
        { $set: { roles: [role] } },
      );
      const reader = role !== Role.CUSTOMER,
        writer = [Role.SYSTEM_ADMIN, Role.ORGANIZATION_OWNER, Role.MANAGER].includes(role);
      expect((await get(p.body.id)).status).toBe(reader ? 200 : 403);
      expect((await http().get('/api/products').auth(tokenA, { type: 'bearer' })).status).toBe(
        reader ? 200 : 403,
      );
      expect((await post(product({ sku: 'NEW-' + role }))).status).toBe(writer ? 201 : 403);
      expect((await patch(p.body.id, { priceCents: 25000 })).status).toBe(writer ? 200 : 403);
      expect((await archive(p.body.id)).status).toBe(writer ? 200 : 403);
      expect((await post(product({ sku: 'OTHER-ORG' }), tokenB)).status).toBe(201);
    },
  );

  it('denies anonymous, refresh/sr1-as-JWT, personal context and revoked sessions', async () => {
    expect((await http().get('/api/products')).status).toBe(401);
    const personal = await login(null);
    expect(personal.status).toBe(201);
    expect(
      (await http().get('/api/products').auth(personal.body.access_token, { type: 'bearer' }))
        .status,
    ).toBe(403);
    const root = await login(a);
    expect(root.status).toBe(201);
    expect((await login(a)).status).toBe(201);
    const start = await http()
      .post('/api/auth/session-replacement/start')
      .send({ email: 'products@example.test', password, organizationId: a.toString() });
    expect(start.status).toBe(201);
    for (const bad of [root.body.refresh_token, start.body.replacement_token])
      expect((await http().get('/api/products').auth(bad, { type: 'bearer' })).status).toBe(401);
    expect((await http().post('/api/auth/logout').auth(tokenA, { type: 'bearer' })).status).toBe(
      200,
    );
    expect((await post()).status).toBe(401);
  });

  it.each([
    'membership-revoked',
    'membership-suspended',
    'organization-suspended',
    'account-suspended',
  ])('revalidates %s for the same previously valid token', async (kind) => {
    if (kind.startsWith('membership'))
      await model('OrganizationMembership').updateOne(
        { userId: uid, organizationId: a },
        { $set: { status: kind.endsWith('revoked') ? 'revoked' : 'suspended' } },
      );
    if (kind === 'organization-suspended')
      await model('Organization').updateOne({ _id: a }, { $set: { status: 'suspended' } });
    if (kind === 'account-suspended')
      await model('User').updateOne({ _id: uid }, { $set: { status: 'suspended' } });
    expect([401, 403]).toContain((await post()).status);
    expect(await model('Product').countDocuments()).toBe(0);
  });

  it('does not let even an admin change locked products or adopt malformed legacy rows', async () => {
    const p = await post();
    expect(p.status).toBe(201);
    await model('Product').updateOne({ _id: p.body.id }, { $set: { accessState: 'locked' } });
    expect((await get(p.body.id)).status).toBe(200);
    expect((await patch(p.body.id, { priceCents: 1 })).status).toBe(403);
    expect((await archive(p.body.id)).status).toBe(403);
    const id = new Types.ObjectId();
    await model('Product').collection.insertOne({
      _id: id,
      name: 'Unowned',
      sku: 'LEGACY',
      organizationId: a,
      priceCents: 1,
    });
    expect((await get(id.toString())).status).toBe(403);
    expect(
      (await http().get('/api/products').auth(tokenA, { type: 'bearer' })).body.items.map(
        (p) => p.id,
      ),
    ).toEqual([p.body.id]);
  });

  it('uses a real unique compound index across two pools; normalizes ASCII aliases and does not leak foreign catalog', async () => {
    const responses = await Promise.all([
      post(product({ sku: '  same-SKU ' })),
      post(product({ sku: 'SAME-sku' }), tokenA, 1),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await model('Product').countDocuments({ organizationId: a })).toBe(1);
    expect(
      await model('SecurityAuditRecord').countDocuments({
        event: AuditEvent.PRODUCT,
        result: 'allowed',
        action: 'create',
      }),
    ).toBe(1);
    const duplicate = await post(product({ sku: 'SAME-SKU' }));
    expect(duplicate.status).toBe(409);
    expect(JSON.stringify(duplicate.body)).not.toMatch(/E11000|keyValue|products_test_/);
    expect(
      await model('SecurityAuditRecord').countDocuments({
        event: AuditEvent.PRODUCT,
        action: 'create',
        result: 'denied',
      }),
    ).toBe(2);
    expect((await post(product({ sku: 'same-sku' }), tokenB)).status).toBe(201);
  });

  it('blocks writes immediately when the unique index is dropped and never recreates it at runtime', async () => {
    expect((await post()).status).toBe(201);
    await model('Product').collection.dropIndex('product_org_sku_unique');
    try {
      const denied = await post(product({ sku: 'NO-INDEX' }));
      expect(denied.status).toBe(503);
      expect(await model('Product').countDocuments()).toBe(1);
      expect(
        (await model('Product').collection.listIndexes().toArray()).some(
          (i) => i.name === 'product_org_sku_unique',
        ),
      ).toBe(false);
    } finally {
      await model('Product').createIndexes();
    }
    expect((await post(product({ sku: 'NO-INDEX' }))).status).toBe(201);
  });

  it.each(['create', 'update', 'archive'])(
    'rolls back product %s when the completion audit is rejected by a real Mongo validator',
    async (operation) => {
      let id: string;
      if (operation !== 'create') {
        const p = await post();
        expect(p.status).toBe(201);
        id = p.body.id;
      }
      const before = await model('Product').find().lean(),
        allowedBefore = await model('SecurityAuditRecord').countDocuments({
          event: AuditEvent.PRODUCT,
          result: 'allowed',
        });
      await db.db.command({
        collMod: 'security_audit_events',
        validator: {
          $or: [{ event: { $ne: AuditEvent.PRODUCT } }, { result: { $ne: 'allowed' } }],
        },
        validationLevel: 'strict',
      });
      try {
        const response =
          operation === 'create'
            ? await post()
            : operation === 'update'
              ? await patch(id, { priceCents: 1 })
              : await archive(id);
        expect(response.status).toBe(503);
        expect(await model('Product').find().lean()).toEqual(before);
        expect(
          await model('SecurityAuditRecord').countDocuments({
            event: AuditEvent.PRODUCT,
            result: 'allowed',
          }),
        ).toBe(allowedBefore);
      } finally {
        await db.db.command({
          collMod: 'security_audit_events',
          validator: {},
          validationLevel: 'strict',
        });
      }
      expect(
        (operation === 'create'
          ? await post()
          : operation === 'update'
            ? await patch(id, { priceCents: 1 })
            : await archive(id)
        ).status,
      ).toBe(operation === 'create' ? 201 : 200);
    },
  );

  it.each(['create', 'update', 'archive'])(
    'does not commit a completion audit when Mongo rejects the product %s',
    async (operation) => {
      const p = operation === 'create' ? undefined : await post();
      if (p) expect(p.status).toBe(201);
      const before = await model('Product').find().lean();
      const events = await model('SecurityAuditRecord').countDocuments({
        event: AuditEvent.PRODUCT,
        result: 'allowed',
      });
      await db.db.command({
        collMod: 'products',
        validator: { sku: { $eq: 'REJECT-ALL-TEST-WRITES' } },
        validationLevel: 'strict',
      });
      try {
        const response =
          operation === 'create'
            ? await post()
            : operation === 'update'
              ? await patch(p.body.id, { priceCents: 1 })
              : await archive(p.body.id);
        expect(response.status).toBe(503);
        expect(await model('Product').find().lean()).toEqual(before);
        expect(
          await model('SecurityAuditRecord').countDocuments({
            event: AuditEvent.PRODUCT,
            result: 'allowed',
          }),
        ).toBe(events);
      } finally {
        await db.db.command({ collMod: 'products', validator: {}, validationLevel: 'strict' });
      }
    },
  );

  it('retries a real transient write conflict without duplicating product or completion audit', async () => {
    const p = await post();
    expect(p.status).toBe(201);
    const armed = await db.db.admin().command({
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: {
        failCommands: ['findAndModify'],
        errorCode: 112,
        errorLabels: ['TransientTransactionError'],
      },
    });
    try {
      const response = await patch(p.body.id, { priceCents: 21000 });
      expect(response.status).toBe(200);
      expect((await get(p.body.id)).body.priceCents).toBe(21000);
      expect(await model('Product').countDocuments()).toBe(1);
      expect(
        await model('SecurityAuditRecord').countDocuments({
          event: AuditEvent.PRODUCT,
          action: 'update',
          result: 'allowed',
        }),
      ).toBe(1);
    } finally {
      const disabled = await db.db
        .admin()
        .command({ configureFailPoint: 'failCommand', mode: 'off' });
      expect(disabled.count).toBe(armed.count + 1);
    }
  });

  it.each(['update', 'archive'])(
    'serializes competing update/%s between two pools without resurrection or partial audit',
    async (operation) => {
      const p = await post();
      expect(p.status).toBe(201);
      // Barrier after both live authorizations, before either starts its product write.
      let arrived = 0,
        release: () => void;
      const barrier = new Promise<void>((resolve) => (release = resolve));
      const spies = apps.map((app) => {
        const resources = app.get(ScopedResourcesService);
        const authorize = resources.authorize.bind(resources);
        return jest.spyOn(resources, 'authorize').mockImplementation(async (...args) => {
          const result = await authorize(...args);
          if (
            args[0] === PolicyResource.PRODUCT &&
            [PolicyAction.UPDATE, PolicyAction.DELETE].includes(args[1]) &&
            ++arrived <= 2
          ) {
            if (arrived === 2) release();
            await barrier;
          }
          return result;
        });
      });
      try {
        const responses = await Promise.all([
          patch(p.body.id, { priceCents: 21000 }),
          operation === 'update'
            ? patch(p.body.id, { priceCents: 22000 }, tokenA, 1)
            : http(1)
                .delete('/api/products/' + p.body.id)
                .auth(tokenA, { type: 'bearer' }),
        ]);
        expect(arrived).toBeGreaterThanOrEqual(2);
        const row = await model('Product').findById(p.body.id);
        if (operation === 'update') {
          expect(responses.map((r) => r.status)).toEqual([200, 200]);
          expect([21000, 22000]).toContain(row.priceCents);
        } else {
          expect(responses[1].status).toBe(200);
          expect([200, 403]).toContain(responses[0].status);
          expect(row.archivedAt).toBeInstanceOf(Date);
          expect((await get(p.body.id)).status).toBe(404);
          expect((await patch(p.body.id, { priceCents: 1 })).status).toBe(403);
        }
        expect(
          await model('SecurityAuditRecord').countDocuments({
            event: AuditEvent.PRODUCT,
            result: 'allowed',
            action: { $in: ['update', 'delete'] },
          }),
        ).toBe(responses.filter((r) => r.status === 200).length);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    },
  );

  it.each(['non-unique', 'partial', 'sparse'])(
    'fails closed for an inadequate %s SKU index without repairing DDL',
    async (kind) => {
      await model('Product').collection.dropIndex('product_org_sku_unique');
      try {
        await model('Product').collection.createIndex(
          { organizationId: 1, sku: 1 },
          {
            name: 'inadequate_test_index',
            ...(kind === 'non-unique' ? {} : { unique: true }),
            ...(kind === 'sparse' ? { sparse: true } : {}),
            ...(kind === 'partial' ? { partialFilterExpression: { archivedAt: null } } : {}),
          },
        );
        expect((await post()).status).toBe(503);
        expect(await model('Product').countDocuments()).toBe(0);
      } finally {
        await model('Product').collection.dropIndex('inadequate_test_index');
        await model('Product').createIndexes();
      }
    },
  );

  it('ignores tenant headers and denies forged direct-service contexts despite admin claims', async () => {
    const pa = await post(),
      pb = await post(product(), tokenB);
    expect(pa.status).toBe(201);
    expect(pb.status).toBe(201);
    const response = await http()
      .get('/api/products')
      .auth(tokenA, { type: 'bearer' })
      .set('X-Tenant-ID', b.toString())
      .set('X-Organization-ID', b.toString());
    expect(response.status).toBe(200);
    expect(response.body.items.map((p) => p.id)).toEqual([pa.body.id]);
    const actor = await subject();
    await expect(
      apps[0].get(ProductsService).get(pb.body.id, {
        ...actor,
        organizationId: b.toString(),
        roles: [Role.SYSTEM_ADMIN],
      }),
    ).rejects.toThrow();
  });

  it('bounds cursor pagination, rejects Mongo filters and never returns archived or foreign rows', async () => {
    for (let i = 0; i < 4; i++)
      expect((await post(product({ sku: 'PAGE-' + i }))).status).toBe(201);
    expect((await post(product({ sku: 'B-ROW' }), tokenB)).status).toBe(201);
    const first = await http().get('/api/products?limit=2').auth(tokenA, { type: 'bearer' });
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await http()
      .get('/api/products?limit=2&before=' + first.body.nextCursor)
      .auth(tokenA, { type: 'bearer' });
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    expect(new Set([...first.body.items, ...second.body.items].map((p) => p.id)).size).toBe(4);
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=1.5',
      'limit=no',
      'before=no',
      'ownerId=anything',
      'where[$ne]=null',
      'status[$ne]=active',
    ])
      expect(
        (
          await http()
            .get('/api/products?' + query)
            .auth(tokenA, { type: 'bearer' })
        ).status,
      ).toBe(400);
  });

  it('defends direct service callers and blocks the legacy generic CRUD bypass for products', async () => {
    const actor = await subject(),
      service = apps[0].get(ProductsService),
      generic = apps[0].get(ScopedResourcesService);
    for (const data of [
      product({ ownerId: uid.toString() }),
      product({ student: uid.toString() }),
      product({ priceCents: '1' }),
      product({ roles: ['SYSTEM_ADMIN'] }),
    ])
      await expect(service.create(data as any, actor)).rejects.toThrow();
    const p = await service.create(product() as any, actor);
    expect(p.sku).toBe('RACAO-CAO-15KG');
    await expect(
      service.update(p._id.toString(), { sku: 'OTHER' } as any, actor),
    ).rejects.toThrow();
    await expect(service.update(p._id.toString(), {} as any, actor)).rejects.toThrow();
    await expect(generic.delete(PolicyResource.PRODUCT, p._id.toString(), actor)).rejects.toThrow();
    await expect(generic.list(PolicyResource.PRODUCT, actor)).rejects.toThrow();
    await model('OrganizationMembership').updateOne(
      { userId: uid, organizationId: a },
      { $set: { roles: ['CUSTOMER'] } },
    );
    await expect(service.create(product({ sku: 'DENIED' }) as any, actor)).rejects.toThrow();
    expect(await model('Product').countDocuments()).toBe(1);
  });

  it('keeps mutation outcomes correlated and audit bodies free of product text, password and credentials', async () => {
    const p = await post(product({ description: 'private-catalog-description' }));
    expect(p.status).toBe(201);
    expect((await patch(p.body.id, { priceCents: 20000 })).status).toBe(200);
    expect((await archive(p.body.id)).status).toBe(200);
    const events = await model('SecurityAuditRecord')
      .find({ event: AuditEvent.PRODUCT, result: 'allowed' })
      .sort({ _id: 1 })
      .lean();
    expect(events.map((e) => e.action)).toEqual(['create', 'update', 'delete']);
    expect(
      events.every(
        (e) =>
          e.targetId === p.body.id &&
          e.organizationId.toString() === a.toString() &&
          e.actorUserId.toString() === uid.toString(),
      ),
    ).toBe(true);
    const dump = JSON.stringify(await model('SecurityAuditRecord').find().lean());
    for (const secret of [
      password,
      tokenA,
      tokenB,
      'private-catalog-description',
      'Marca de teste',
    ])
      expect(dump).not.toContain(secret);
  });

  it.each(['source', 'compiled'])(
    'initializes empty storage via %s CLI, refuses duplicates without repair and requires its dedicated URI',
    async (variant) => {
      const uri = new URL(process.env.SESSIONS_TEST_MONGO_URL);
      uri.pathname = '/' + database;
      const args =
        variant === 'source'
          ? [
              '-r',
              'ts-node/register',
              '-r',
              'tsconfig-paths/register',
              'src/commands/initialize-products.script.ts',
            ]
          : ['dist/commands/initialize-products.script.js'];
      await model('Product').collection.drop();
      const result = execFileSync(process.execPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, PRODUCTS_MONGO_URL: uri.toString() },
        encoding: 'utf8',
        timeout: 30000,
      });
      expect(result).toContain('Product catalog storage initialized');
      expect(await model('Product').countDocuments()).toBe(0);
      const first = await post(product({ sku: 'FIRST' }));
      const second = await post(product({ sku: 'SECOND' }));
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      await model('Product').collection.dropIndex('product_org_sku_unique');
      await model('Product').collection.updateOne(
        { _id: new Types.ObjectId(second.body.id) },
        { $set: { sku: 'FIRST' } },
      );
      try {
        expect(() =>
          execFileSync(process.execPath, args, {
            cwd: process.cwd(),
            env: { ...process.env, PRODUCTS_MONGO_URL: uri.toString() },
            encoding: 'utf8',
            timeout: 30000,
            stdio: 'pipe',
          }),
        ).toThrow();
        expect(await model('Product').countDocuments({ sku: 'FIRST' })).toBe(2);
        expect((await post(product({ sku: 'BLOCKED' }))).status).toBe(503);
      } finally {
        await model('Product').deleteOne({ _id: second.body.id });
        await model('Product').createIndexes();
      }
      expect(() =>
        execFileSync(process.execPath, args, {
          cwd: process.cwd(),
          env: { ...process.env, PRODUCTS_MONGO_URL: '', MONGO_URL: uri.toString() },
          encoding: 'utf8',
          timeout: 30000,
          stdio: 'pipe',
        }),
      ).toThrow();
    },
  );
});
