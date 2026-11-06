import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection } from 'mongoose';
import * as assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { ProductsModule } from '@/features/products/products.module';

async function mustDeny(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: { code?: number }) => error.code === 13);
}

async function main() {
  const input = process.env.AUDIT_TEST_ADMIN_URL;
  if (!input) throw new Error('Explicit disposable authenticated MongoDB required');
  const selected = new URL(input);
  if (selected.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(selected.hostname))
    throw new Error('Dedicated local MongoDB required');
  const database = `products_acl_test_${randomUUID().replace(/-/g, '')}`;
  selected.pathname = '/' + database;
  selected.searchParams.set('authSource', 'admin');
  const moduleFor = (uri: string) =>
    Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: 'disposable-products-operations-secret' })],
        }),
        MongooseModule.forRoot(uri, { dbName: database, autoCreate: false, autoIndex: false }),
        EventEmitterModule.forRoot(),
        AuthModule,
        AuthorizationModule,
        ProductsModule,
      ],
    }).compile();
  const operator = await moduleFor(selected.toString());
  const admin = operator.get<Connection>(getConnectionToken());
  let app: INestApplication;
  try {
    for (const model of Object.values(admin.models)) {
      await model.createCollection();
      await model.createIndexes();
    }
    await admin.models.SessionSerialization.create({
      _id: SESSION_LIMIT_APPLICATION,
      sequence: 0,
      serverNow: new Date(),
    });
    const password = randomBytes(24).toString('hex');
    const user = await admin.models.User.create({
      name: 'Disposable manager',
      email: 'products-acl@example.test',
      password: await bcrypt.hash(password, 4),
      status: 'active',
      roles: ['CUSTOMER'],
    });
    const org = await admin.models.Organization.create({ name: 'Disposable catalog' });
    await admin.models.OrganizationMembership.create({
      userId: user._id,
      organizationId: org._id,
      roles: ['MANAGER'],
      status: 'active',
    });
    const resource = (collection: string, actions: string[]) => ({
      resource: { db: database, collection },
      actions,
    });
    await admin.db.command({
      createRole: 'products_runtime',
      roles: [],
      privileges: [
        ...['users', 'organizations', 'organization_memberships'].map((c) => resource(c, ['find'])),
        ...['security_audit_events', 'auth_session_revocations', 'session_limit_revisions'].map(
          (c) => resource(c, ['find', 'insert', 'listIndexes']),
        ),
        resource('auth_sessions', ['find', 'insert', 'update', 'listIndexes']),
        resource('session_serialization', ['find', 'update', 'listIndexes']),
        resource('session_replacement_challenges', ['find', 'insert', 'update', 'listIndexes']),
        resource('products', ['find', 'insert', 'update', 'listIndexes']),
      ],
    });
    const runtimePassword = randomBytes(32).toString('hex');
    await admin.db.command({
      createUser: 'products_runtime',
      pwd: runtimePassword,
      roles: [{ role: 'products_runtime', db: database }],
    });
    const uri = new URL(selected);
    uri.username = 'products_runtime';
    uri.password = runtimePassword;
    uri.searchParams.set('authSource', database);
    const runtime = await moduleFor(uri.toString());
    const writer = runtime.get<Connection>(getConnectionToken());
    app = runtime.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const context = app.get(AuditContext);
    app.use((req, _res, next) => context.run(req, next));
    await app.listen(0, '127.0.0.1');
    const http = () => request(app.getHttpServer());
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'products-acl@example.test', password, organizationId: org.id });
    assert.equal(login.status, 201);
    const token = login.body.access_token;
    const created = await http().post('/api/products').auth(token, { type: 'bearer' }).send({
      sku: 'ACL-FEED',
      name: 'Disposable feed',
      category: 'feed',
      targetSpecies: 'dog',
      saleUnit: 'kg',
      priceCents: 1000,
    });
    assert.equal(created.status, 201);
    assert.equal(
      (await http().get('/api/products').auth(token, { type: 'bearer' })).body.items.length,
      1,
    );
    assert.equal(
      (
        await http()
          .patch('/api/products/' + created.body.id)
          .auth(token, { type: 'bearer' })
          .send({ priceCents: 1200 })
      ).status,
      200,
    );
    assert.equal(
      (
        await http()
          .delete('/api/products/' + created.body.id)
          .auth(token, { type: 'bearer' })
      ).status,
      200,
    );
    assert.ok((await admin.models.Product.findById(created.body.id)).archivedAt);
    assert.equal(
      await admin.models.SecurityAuditRecord.countDocuments({
        event: AuditEvent.PRODUCT,
        result: 'allowed',
      }),
      3,
    );
    await mustDeny(() => writer.models.Product.collection.deleteMany({}));
    await mustDeny(() => writer.models.Product.collection.dropIndex('product_org_sku_unique'));
    await mustDeny(() => writer.models.Product.collection.createIndex({ name: 1 }));
    await mustDeny(() =>
      writer.models.SecurityAuditRecord.collection.updateOne({}, { $set: { result: 'denied' } }),
    );
    await mustDeny(() => writer.models.SecurityAuditRecord.collection.deleteMany({}));
    assert.equal(await admin.models.Product.countDocuments(), 1);
    console.info(
      'PASS products HTTP CRUD + atomic completion events with restricted authenticated runtime; product delete/DDL and audit update/delete denied.',
    );
  } finally {
    if (app) await app.close();
    if (admin.name === database) {
      await admin.db.command({ dropAllUsersFromDatabase: 1 });
      await admin.db.command({ dropAllRolesFromDatabase: 1 });
      await admin.dropDatabase();
    }
    await operator.close();
  }
}
void main().catch(() => {
  console.error('Product operations smoke failed; no credentials logged.');
  process.exitCode = 1;
});
