import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Connection, createConnection } from 'mongoose';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { AuditContext } from '@/common/audit/audit-context.service';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { SecurityAuditService } from '@/common/audit/security-audit.service';
import { AuthorizationModule } from '@/common/authorization/authorization.module';
import { PolicyAction, PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { Role } from '@/common/enums/role.enum';
import { AuthModule } from '@/features/auth/auth.module';
import { SESSION_LIMIT_APPLICATION } from '@/features/auth/schemas/session-limit-revision.schema';
import { AuthService } from '@/features/auth/services/auth.service';
import { MailModule } from '@/features/mail/mail.module';
import { MailService } from '@/features/mail/services/mail.service';
import { ProductsModule } from '@/features/products/products.module';
import { ProductsService } from '@/features/products/services/products.service';

const manager = createRequire(__filename)(path.resolve(__dirname, '../../../scripts/demo.cjs'));
const version = 'commercial-demo-v1';
const metadata = 'demo_dataset_state';
const check = (ok: unknown) => {
  if (!ok) throw new Error('Demo dataset conflict; no automatic overwrite or reset.');
};
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const digest = (value: any) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
    .digest('hex');
async function rows(db: Connection, collection: string) {
  return db.db.collection(collection).find().sort({ _id: 1 }).toArray();
}

export const profiles = [
  ...Object.values(Role),
  'shared',
  'personal',
  'suspended',
  'revoked',
  'membership-suspended',
];
export const productDefinitions = [
  {
    sku: 'RACAO-FECHADA-15KG',
    name: 'Ração fictícia — saco fechado 15 kg',
    category: 'feed',
    targetSpecies: 'dog',
    saleUnit: 'unit',
    priceCents: 18990,
    packageWeightGrams: 15000,
    status: 'active',
  },
  {
    sku: 'RACAO-GRANEL',
    name: 'Ração fictícia — venda a granel por kg',
    category: 'feed',
    targetSpecies: 'dog',
    saleUnit: 'kg',
    priceCents: 1290,
    status: 'active',
  },
  {
    sku: 'PETISCO-ENCERRADO',
    name: 'Petisco fictício descontinuado',
    category: 'treat',
    targetSpecies: 'cat',
    saleUnit: 'unit',
    priceCents: 990,
    status: 'discontinued',
  },
];

function connectionUri(env: any, user: 'admin' | 'runtime') {
  const uri = new URL(
    `mongodb://127.0.0.1:${env.manifest.port}/${env.manifest.database}?directConnection=true&replicaSet=afw-demo-rs`,
  );
  uri.username = user === 'admin' ? 'demo_operator' : 'demo_runtime';
  uri.password = user === 'admin' ? env.secrets.adminPassword : env.secrets.runtimePassword;
  uri.searchParams.set('authSource', user === 'admin' ? 'admin' : env.manifest.database);
  return uri.toString();
}
export async function demoApp(uri: string, jwtSecret: string) {
  // This is an explicitly development-only tool. Testing builder permits a fail-on-send
  // provider without changing production MailModule or exposing a privileged API.
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => ({ JWT_SECRET: jwtSecret })],
      }),
      MongooseModule.forRoot(uri, {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 5000,
        retryAttempts: 0,
      }),
      EventEmitterModule.forRoot(),
      MailModule,
      AuthModule,
      AuthorizationModule,
      ProductsModule,
    ],
  })
    .overrideProvider(MailService)
    .useValue({
      send: async () => {
        throw new Error('External email disabled in demo');
      },
    })
    .compile();
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
  return app;
}

async function assertEmpty(db: Connection) {
  for (const collection of await db.db.listCollections({}, { nameOnly: true }).toArray()) {
    if (!collection.name.startsWith('system.'))
      check(!(await db.db.collection(collection.name).findOne({})));
  }
}
async function initialize(app: INestApplication, env: any) {
  const db = app.get<Connection>(getConnectionToken());
  for (const model of Object.values(db.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  await db.db.createCollection(metadata);
  const session = await db.startSession();
  try {
    await session.withTransaction(
      async () => {
        check(!(await db.db.collection(metadata).findOne({ _id: version as any }, { session })));
        // Administrative demo adapter: same schemas/hash cost as the current account paths.
        // Public registration must NEVER accept these tenant grants; no user-schema change.
        const orgs = await db.models.Organization.create(
          [
            { name: 'Loja fictícia A', status: 'active' },
            { name: 'Loja fictícia B', status: 'active' },
          ],
          { session, ordered: true },
        );
        const users: Record<string, string> = {};
        for (const key of profiles) {
          const [user] = await db.models.User.create(
            [
              {
                name: `Demo ${key}`,
                email: `${env.manifest.name}.${key.toLowerCase()}@example.test`,
                password: await bcrypt.hash(env.secrets.userPasswords[key], 12),
                roles: [Role.CUSTOMER],
                status: key === 'suspended' ? 'suspended' : 'active',
              },
            ],
            { session },
          );
          users[key] = user.id;
          if (key !== 'personal') {
            await db.models.OrganizationMembership.create(
              [
                {
                  userId: user._id,
                  organizationId: orgs[0]._id,
                  roles: Object.values(Role).includes(key as Role)
                    ? [key]
                    : key === 'shared'
                      ? [Role.MANAGER]
                      : [Role.INVENTORY_OPERATOR],
                  status:
                    key === 'revoked'
                      ? 'revoked'
                      : key === 'membership-suspended'
                        ? 'suspended'
                        : 'active',
                },
              ],
              { session },
            );
          }
          if (key === Role.ORGANIZATION_OWNER || key === 'shared')
            await db.models.OrganizationMembership.create(
              [
                {
                  userId: user._id,
                  organizationId: orgs[1]._id,
                  roles: key === 'shared' ? [Role.AUDITOR] : [Role.ORGANIZATION_OWNER],
                  status: 'active',
                },
              ],
              { session },
            );
        }
        await db.models.SessionSerialization.create(
          [{ _id: SESSION_LIMIT_APPLICATION, sequence: 0, serverNow: new Date() }],
          { session },
        );
        const baseline = {};
        for (const c of ['users', 'organizations', 'organization_memberships']) {
          baseline[c] = digest(
            await db.db.collection(c).find({}, { session }).sort({ _id: 1 }).toArray(),
          );
        }
        const productSlots = Object.fromEntries(
          orgs.flatMap((org, i) =>
            productDefinitions.map((data, n) => [`${i}-${n}`, { org: org.id, data }]),
          ),
        );
        await db.db.collection(metadata).insertOne(
          {
            _id: version as any,
            instance: env.manifest.instance,
            users,
            organizations: orgs.map((o) => o.id),
            baseline,
            products: productSlots,
          },
          { session },
        );
        for (const org of orgs)
          await app.get(SecurityAuditService).record(
            AuditEvent.DEMO_PROVISION,
            'allowed',
            'service',
            {
              id: users[Role.ORGANIZATION_OWNER],
              organizationId: org.id,
              roles: [Role.ORGANIZATION_OWNER],
            },
            { resource: PolicyResource.USER, action: PolicyAction.CREATE },
            session,
          );
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    );
  } finally {
    await session.endSession();
  }
  // Separate operator setup; runtime cannot change grants or create DDL.
  await db.db.command({
    createRole: 'demo_runtime',
    privileges: runtimePrivileges(env.manifest.database),
    roles: [],
  });
  await db.db.command({
    createUser: 'demo_runtime',
    pwd: env.secrets.runtimePassword,
    roles: [{ role: 'demo_runtime', db: env.manifest.database }],
  });
}

function runtimePrivileges(database: string) {
  const resource = (collection: string, actions: string[]) => ({
    resource: { db: database, collection },
    actions,
  });
  return [
    resource('users', ['find', 'insert']),
    ...['organizations', 'organization_memberships'].map((c) => resource(c, ['find'])),
    ...['security_audit_events', 'auth_session_revocations', 'session_limit_revisions'].map((c) =>
      resource(c, ['find', 'insert', 'listIndexes']),
    ),
    resource('auth_sessions', ['find', 'insert', 'update', 'listIndexes']),
    resource('session_serialization', ['find', 'update', 'listIndexes']),
    resource('session_replacement_challenges', ['find', 'insert', 'update', 'listIndexes']),
    resource('products', ['find', 'insert', 'update', 'listIndexes']),
  ];
}

async function verifyRuntime(db: Connection, env: any) {
  const grant = await db.db.command({
    usersInfo: { user: 'demo_runtime', db: env.manifest.database },
    showPrivileges: true,
  });
  check(
    grant.users.length === 1 &&
      grant.users[0].roles.length === 1 &&
      grant.users[0].roles[0].role === 'demo_runtime' &&
      grant.users[0].roles[0].db === env.manifest.database,
  );
  const normalize = (items: any[]) =>
    items
      .map((x) => `${x.resource.db}/${x.resource.collection}:${[...x.actions].sort().join(',')}`)
      .sort();
  check(
    digest(normalize(grant.users[0].inheritedPrivileges)) ===
      digest(normalize(runtimePrivileges(env.manifest.database))),
  );
  const users = await db.db.command({ usersInfo: 1 });
  check(users.users.length === 1);
}

async function inspectDataset(db: Connection, env: any) {
  const state: any = await db.db.collection(metadata).findOne({ _id: version as any });
  check(
    state?.instance === env.manifest.instance &&
      Object.keys(state.users || {})
        .sort()
        .join() === [...profiles].sort().join(),
  );
  check((await db.db.collection(metadata).countDocuments()) === 1);
  for (const c of ['users', 'organizations', 'organization_memberships'])
    check(digest(await rows(db, c)) === state.baseline[c]);
  const permitted = new Set([
    'users',
    'organizations',
    'organization_memberships',
    'products',
    metadata,
    'auth_sessions',
    'auth_session_revocations',
    'security_audit_events',
    'session_limit_revisions',
    'session_serialization',
    'session_replacement_challenges',
  ]);
  for (const c of await db.db.listCollections({}, { nameOnly: true }).toArray()) {
    if (!c.name.startsWith('system.') && !permitted.has(c.name))
      check(!(await db.db.collection(c.name).findOne({})));
  }
  const allProducts = await rows(db, 'products');
  const matched = new Set<string>();
  for (const slot of Object.values(state.products) as any[]) {
    const found: any = allProducts.find(
      (p) => p.organizationId.toString() === slot.org && p.sku === slot.data.sku,
    );
    if (!found) {
      check(!slot.id);
      continue;
    }
    check(
      found.ownerId?.toString() === state.users[Role.ORGANIZATION_OWNER] &&
        found.createdBy?.toString() === state.users[Role.ORGANIZATION_OWNER] &&
        found.accessState === 'active' &&
        found.archivedAt === null,
    );
    const expectedKeys = [
      ...Object.keys(slot.data),
      '_id',
      'organizationId',
      'ownerId',
      'createdBy',
      'accessState',
      'createdAt',
      'updatedAt',
      'archivedAt',
    ];
    check(Object.keys(found).sort().join() === expectedKeys.sort().join());
    check(
      found.createdAt instanceof Date &&
        found.updatedAt instanceof Date &&
        found.createdAt.getTime() === found.updatedAt.getTime(),
    );
    for (const field of [
      'sku',
      'name',
      'category',
      'targetSpecies',
      'saleUnit',
      'priceCents',
      'packageWeightGrams',
      'status',
    ])
      check(found[field] === slot.data[field]);
    check(
      (await db.db.collection('security_audit_events').countDocuments({
        event: AuditEvent.PRODUCT,
        result: 'allowed',
        action: 'create',
        requestId: slot.requestId,
        targetId: found._id.toString(),
        organizationId: found.organizationId,
        actorUserId: found.ownerId,
      })) === 1,
    );
    if (slot.id) check(slot.id === found._id.toString() && slot.digest === digest(found));
    // A post-commit / pre-checkpoint result is reusable ONLY with exact content/actor/audit provenance.
    slot.found = { id: found._id.toString(), digest: digest(found) };
    matched.add(found._id.toString());
  }
  check(matched.size === allProducts.length);
  // Never reconstruct/reset missing or corrupt session coordination on repeat.
  const fence: any = await db.db
    .collection('session_serialization')
    .findOne({ _id: SESSION_LIMIT_APPLICATION as any });
  check(Number.isSafeInteger(fence?.sequence) && fence.sequence >= 0);
  check((await db.db.collection('session_serialization').countDocuments()) === 1);
  const ownedUsers = new Set(Object.values(state.users));
  const ownedOrganizations = new Set(state.organizations);
  const ownedMemberships = new Set(
    (await rows(db, 'organization_memberships')).map((r) => r._id.toString()),
  );
  for (const c of [
    'auth_sessions',
    'auth_session_revocations',
    'security_audit_events',
    'session_limit_revisions',
    'session_replacement_challenges',
  ]) {
    for (const row of await rows(db, c)) {
      for (const field of ['userId', 'actorUserId', 'targetUserId'])
        if (row[field]) check(ownedUsers.has(row[field].toString()));
      for (const field of ['organizationId', 'actorOrganizationId'])
        if (row[field]) check(ownedOrganizations.has(row[field].toString()));
      if (row.membershipId) check(ownedMemberships.has(row.membershipId.toString()));
      if (c === 'auth_sessions' || c === 'session_replacement_challenges')
        check(ownedUsers.has(row.userId?.toString()));
    }
  }
  return state;
}

export async function operate(
  name: string,
  action: string,
  module = 'demo',
  dryRun = false,
  afterProductCommit?: () => void,
) {
  Logger.overrideLogger(false);
  check(
    ['seed', 'verify', 'start'].includes(action) && ['demo', 'users', 'products'].includes(module),
  );
  // Guard again in this process BEFORE any database connection, even if invoked directly.
  manager.parse(['seed', '--name', name, '--module', module]);
  const env = manager.load(name);
  manager.assertLock(env.dir);
  for (const secret of [
    env.secrets.adminPassword,
    env.secrets.runtimePassword,
    ...Object.values(env.secrets.userPasswords),
  ])
    check(typeof secret === 'string' && /^[A-Za-z0-9_-]{32}$/.test(secret));
  check(typeof env.secrets.jwtSecret === 'string' && env.secrets.jwtSecret.length === 64);
  const db = await createConnection(connectionUri(env, 'admin'), {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
  let adminApp: INestApplication, app: INestApplication;
  let keepOpen = false;
  try {
    const hello = await db.db.admin().command({ hello: 1 });
    check(hello.setName === 'afw-demo-rs');
    const databases = await db.db.admin().command({ listDatabases: 1, nameOnly: true });
    check(
      databases.databases.every((item: any) =>
        ['admin', 'config', 'local', env.manifest.database].includes(item.name),
      ),
    );
    let state = await db.db.collection(metadata).findOne({ _id: version as any });
    if (!state) {
      await assertEmpty(db);
      if (action === 'verify' || dryRun) {
        console.info('Owned environment has an empty dataset. No writes performed.');
        return;
      }
      check(action === 'seed' && module !== 'products');
      adminApp = await demoApp(connectionUri(env, 'admin'), env.secrets.jwtSecret);
      await initialize(adminApp, env);
      state = await db.db.collection(metadata).findOne({ _id: version as any });
    }
    const current = await inspectDataset(db, env);
    await verifyRuntime(db, env);
    if (dryRun || action === 'verify') {
      console.info(
        `Demo dataset verified; no demo records changed. Organization A=${current.organizations[0]}, B=${current.organizations[1]}. Account emails: ${name}.<profile>@example.test (profiles documented in DEMO_SEEDS.md).`,
      );
      return;
    }
    // No silent elevation/repair after an interrupted operator setup.
    app = await demoApp(connectionUri(env, 'runtime'), env.secrets.jwtSecret);
    if (action === 'start') {
      await app.listen(0, '127.0.0.1');
      keepOpen = true;
      const address = app.getHttpServer().address();
      console.info(
        `Demo API listening ONLY on http://127.0.0.1:${address.port}/api. Use protected credentials.json; type stop + Enter (or Ctrl+C) to stop. No school modules, SMTP, stock or repacking are enabled.`,
      );
      const close = () => {
        void app.close().then(() => process.exit(0));
      };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
      return;
    }
    if (module === 'users') {
      console.info(
        'Demo users/organizations/memberships verified (15 accounts); products unchanged.',
      );
      return;
    }
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const base = `http://127.0.0.1:${address.port}/api`;
    for (const org of current.organizations) {
      const pending = Object.entries(current.products).filter(
        ([, s]: any) => s.org === org && !s.id,
      );
      if (!pending.length) continue;
      const login = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${name}.organization_owner@example.test`,
          password: env.secrets.userPasswords[Role.ORGANIZATION_OWNER],
          organizationId: org,
        }),
      });
      check(login.status === 201);
      const pair: any = await login.json();
      try {
        const identity = await app
          .get(AuthService)
          .validateSession(current.users[Role.ORGANIZATION_OWNER], pair.session_id);
        const actor: PolicySubject = { ...identity, sessionId: pair.session_id };
        for (const [key, rawSlot] of pending) {
          const slot: any = rawSlot;
          if (slot.found) {
            await db.db.collection(metadata).updateOne(
              { _id: version as any },
              {
                $set: {
                  [`products.${key}.id`]: slot.found.id,
                  [`products.${key}.digest`]: slot.found.digest,
                },
              },
            );
            continue;
          }
          await app.get(AuditContext).run({ method: 'POST' }, async () => {
            const requestId = app.get(AuditContext).get().requestId;
            await db.db
              .collection(metadata)
              .updateOne(
                { _id: version as any },
                { $set: { [`products.${key}.requestId`]: requestId } },
              );
            const p = await app.get(ProductsService).create(slot.data, actor);
            if (afterProductCommit) afterProductCommit(); // test hook, never configured by CLI/env
            const stored = await db.db.collection('products').findOne({ _id: p._id });
            await db.db.collection(metadata).updateOne(
              { _id: version as any },
              {
                $set: {
                  [`products.${key}.id`]: p._id.toString(),
                  [`products.${key}.digest`]: digest(stored),
                },
              },
            );
          });
        }
      } finally {
        await fetch(base + '/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + pair.access_token },
        });
      }
    }
    await inspectDataset(db, env);
    console.info(
      'Commercial demo ready: 15 accounts, 2 organizations, 6 products (closed bags and bulk kg). No stock, lots, opening or emails created. Repeating preserves IDs and passwords.',
    );
  } finally {
    if (app && !keepOpen) await app.close();
    if (adminApp) await adminApp.close();
    await db.close();
  }
}

if (require.main === module)
  void operate(
    process.env.AFW_DEMO_NAME,
    process.env.AFW_DEMO_ACTION,
    process.env.AFW_DEMO_MODULE,
    process.env.AFW_DEMO_DRY_RUN === '1',
  ).catch(() => {
    console.error(
      'Demo dataset operation refused or interrupted. Conflict/setup failure preserved; no credentials, URI or raw database error logged.',
    );
    process.exitCode = 1;
  });
