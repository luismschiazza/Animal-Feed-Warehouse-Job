import { Connection, Types, createConnection } from 'mongoose';
import * as assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import 'reflect-metadata';
import { demoApp, operate, profiles } from '@/commands/demo/demo.script';
import { AuditEvent } from '@/common/audit/security-audit.schema';
import { Role } from '@/common/enums/role.enum';
import { AuthService } from '@/features/auth/services/auth.service';
import { MailService } from '@/features/mail/services/mail.service';

const root = path.resolve(__dirname, '..');
const manager = createRequire(__filename)(path.join(root, 'scripts/demo.cjs'));
const environments: any[] = [],
  captured: string[] = [],
  sensitive: string[] = [];
const fingerprint = (value: any) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tag = Date.now().toString(36);
const name = 'smoke-' + tag,
  interrupted = 'partial-' + tag;
function exec(args: string[], ok = true, compiled = false, legacy = false) {
  const entry = legacy
    ? compiled
      ? ['dist/main-cli.js', 'seed']
      : ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'src/main-cli.ts', 'seed']
    : ['scripts/demo.cjs'];
  const r = spawnSync(process.execPath, [...entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    env: {
      ...process.env,
      MONGO_URL: 'mongodb://do-not-probe.invalid:1/real',
      MAIL_USER: 'never-send@example.test',
      MAIL_PASS: 'DO-NOT-USE',
      AFW_DEMO_COMPILED: compiled ? '1' : '0',
    },
  });
  captured.push((r.stdout || '') + (r.stderr || ''));
  assert.equal(r.status === 0, ok, 'Unexpected demo CLI exit: ' + args[0]);
  console.info(
    'demo operation checked:',
    legacy ? 'legacy-compatible seed dispatcher' : args[0],
    ok ? 'success' : 'expected refusal',
    compiled ? 'compiled' : 'source',
  );
  return r;
}
function remember(n: string) {
  const e = manager.load(n);
  environments.push(e);
  sensitive.push(
    e.secrets.adminPassword,
    e.secrets.runtimePassword,
    e.secrets.jwtSecret,
    ...(Object.values(e.secrets.userPasswords) as string[]),
  );
  return e;
}
function uri(e: any, runtime = false) {
  const u = new URL(
    `mongodb://127.0.0.1:${e.manifest.port}/${e.manifest.database}?directConnection=true&replicaSet=afw-demo-rs`,
  );
  u.username = runtime ? 'demo_runtime' : 'demo_operator';
  u.password = runtime ? e.secrets.runtimePassword : e.secrets.adminPassword;
  u.searchParams.set('authSource', runtime ? e.manifest.database : 'admin');
  return u.toString();
}
async function connect(e: any) {
  return createConnection(uri(e), {
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
}
async function snapshot(db: Connection) {
  const out = {};
  for (const c of [
    'users',
    'organizations',
    'organization_memberships',
    'products',
    'security_audit_events',
  ])
    out[c] = await db.db.collection(c).find().sort({ _id: 1 }).toArray();
  return out;
}
function noLeaks() {
  for (const output of captured) {
    for (const value of sensitive)
      assert.ok(
        !output.includes(value),
        'A secret was found in captured command output (value withheld)',
      );
    assert.ok(!/mongodb(?:\+srv)?:\/\//i.test(output), 'A connection URI was logged');
    assert.ok(!/\$2[aby]\$12\$/.test(output), 'A password hash was logged');
  }
}
async function run() {
  process.env.AFW_DEMO_HOME = path.join(
    process.env.AFW_DEMO_TEST_HOME || os.tmpdir(),
    'afw-issue31-' + tag,
  );
  const absent = manager.locations('dry-' + tag).dir;
  exec(['create', '--name', 'dry-' + tag, '--dry-run']);
  assert.ok(!fs.existsSync(absent));
  exec(['seed', '--name', name, '--module', 'disciplines'], false, false, true);
  exec(['seed', '--name', name, '--module', 'mails'], false, true, true);
  exec(['create', '--name', name]);
  const e = remember(name);
  let db = await connect(e);
  try {
    const before: any = await snapshot(db);
    assert.equal(before.users.length, 15);
    assert.equal(before.organizations.length, 2);
    assert.equal(before.organization_memberships.length, 16);
    assert.equal(before.products.length, 6);
    for (const u of before.users) {
      assert.ok(u.password.startsWith('$2b$12$'));
      sensitive.push(u.password);
      assert.ok(u.roles.length === 1 && u.roles[0] === Role.CUSTOMER);
    }
    assert.equal(before.products.filter((p) => p.saleUnit === 'kg').length, 2);
    assert.ok(before.products.every((p) => p.stock === undefined && p.balance === undefined));
    assert.equal(
      before.security_audit_events.filter(
        (a) => a.event === AuditEvent.PRODUCT && a.result === 'allowed' && a.action === 'create',
      ).length,
      6,
    );
    assert.equal(
      before.security_audit_events.filter((a) => a.event === AuditEvent.DEMO_PROVISION).length,
      2,
    );
    exec(['create', '--name', name], false); // no replacement/adoption
    exec(['seed', '--name', name, '--dry-run']);
    exec(['seed', '--name', name]);
    exec(['--name', name, '-m', 'users', '-l', '15'], true, false, true);
    exec(['--name', name, '-m', 'products', '-l', '6'], true, true, true);
    const after: any = await snapshot(db);
    assert.ok(
      fingerprint(before) === fingerprint(after),
      'Repetition changed stable documents, passwords or audit history',
    );
    // Exclusive manager lock proves competing invocation refuses before seeding.
    manager.withLock(e.dir, () => exec(['seed', '--name', name], false));
    const p = before.products[0];
    await db.db
      .collection('products')
      .updateOne({ _id: p._id }, { $set: { priceCents: p.priceCents + 1 } });
    exec(['seed', '--name', name], false);
    exec(['destroy', '--name', name, '--confirm', e.manifest.containerId], false);
    assert.equal(
      (await db.db.collection('products').findOne({ _id: p._id })).priceCents,
      p.priceCents + 1,
    );
    await db.db.collection('products').replaceOne({ _id: p._id }, p); // explicit test-fixture restoration, NEVER performed by CLI
    await db.db.collection('foreign_records').insertOne({ testOwned: true });
    exec(['destroy', '--name', name, '--confirm', e.manifest.containerId], false);
    await db.db.collection('foreign_records').deleteMany({ testOwned: true });
    const foreignDb = db.getClient().db('foreign_fixture_' + tag);
    await foreignDb.collection('owned_test_record').insertOne({ testOwned: true });
    exec(['destroy', '--name', name, '--confirm', e.manifest.containerId], false);
    await foreignDb.dropDatabase(); // exact disposable fixture created immediately above
    const foreign = await db.db
      .collection('auth_sessions')
      .insertOne({ userId: new Types.ObjectId(), testOwned: true });
    exec(['destroy', '--name', name, '--confirm', e.manifest.containerId], false);
    await db.db.collection('auth_sessions').deleteOne({ _id: foreign.insertedId });
    await db.db.command({
      updateUser: 'demo_runtime',
      roles: [{ role: 'readWrite', db: e.manifest.database }],
    });
    exec(['seed', '--name', name], false);
    await db.db.command({
      updateUser: 'demo_runtime',
      roles: [{ role: 'demo_runtime', db: e.manifest.database }],
    });
    // Real authentication + tenant scope/role/person/membership state, not fabricated JWTs.
    const state: any = await db.db.collection('demo_dataset_state').findOne({});
    const app = await demoApp(uri(e, true), e.secrets.jwtSecret);
    try {
      await assert.rejects(
        () => app.get(MailService).send({ to: 'never-send@example.test' } as any),
        /disabled/,
      );
      await app.listen(0, '127.0.0.1');
      const base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
      for (const key of profiles) {
        const personal = key === 'personal';
        const res = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `${name}.${key.toLowerCase()}@example.test`,
            password: e.secrets.userPasswords[key],
            ...(personal ? {} : { organizationId: state.organizations[0] }),
          }),
        });
        const denied = ['suspended', 'revoked', 'membership-suspended'].includes(key);
        assert.equal(
          res.status,
          key === 'suspended' ? 401 : denied ? 403 : 201,
          'Authentication scenario ' + key,
        );
        if (denied) continue;
        const token: any = await res.json();
        sensitive.push(token.access_token, token.refresh_token);
        const headers = { Authorization: 'Bearer ' + token.access_token };
        const list = await fetch(base + '/products', { headers });
        assert.equal(
          list.status,
          personal || key === Role.CUSTOMER ? 403 : 200,
          'Catalog role ' + key,
        );
        if (list.status === 200) {
          const body: any = await list.json();
          assert.equal(body.items.length, 3);
          assert.ok(
            body.items.every(
              (x: any) =>
                x.id !==
                before.products
                  .find((x) => x.organizationId.toString() === state.organizations[1])
                  ._id.toString(),
            ),
          );
        }
        if (
          personal ||
          [Role.CASHIER, Role.AUDITOR, Role.SALES_ASSOCIATE, Role.CUSTOMER].includes(key as Role)
        ) {
          const deniedWrite = await fetch(base + '/products', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: 'MUST-NOT-EXIST',
              name: 'Denied',
              saleUnit: 'unit',
              priceCents: 1,
            }),
          });
          assert.equal(deniedWrite.status, 403);
        }
        const other = before.products.find(
          (x) => x.organizationId.toString() === state.organizations[1],
        );
        const cross = await fetch(base + '/products/' + other._id.toString(), { headers });
        assert.equal(
          cross.status,
          403,
          'Foreign product is denied without disclosing its tenant: ' + key,
        );
        await fetch(base + '/auth/logout', { method: 'POST', headers });
      }
      // The shared account has MANAGER in A but AUDITOR in B.
      const b = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${name}.shared@example.test`,
          password: e.secrets.userPasswords.shared,
          organizationId: state.organizations[1],
        }),
      });
      assert.equal(b.status, 201);
      const token: any = await b.json();
      sensitive.push(token.access_token, token.refresh_token);
      const identity = await app
        .get(AuthService)
        .validateSession(state.users.shared, token.session_id);
      assert.ok(identity.roles.length === 1 && identity.roles[0] === Role.AUDITOR);
      const denied = await fetch(base + '/products', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sku: 'DENIED', name: 'Denied', saleUnit: 'unit', priceCents: 1 }),
      });
      assert.equal(denied.status, 403);
      await fetch(base + '/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token.access_token },
      });
    } finally {
      await app.close();
    }
    assert.equal(await db.db.collection('products').countDocuments(), 6);
    console.info(
      'Verified schemas, bcrypt12, all role profiles, organization/personal scope, membership/account suspensions, audit and fail-on-send mail.',
    );
    // Exercise the real compiled start command and signal forwarding, not just its factory.
    const server = spawn(process.execPath, ['scripts/demo.cjs', 'start', '--name', name], {
      cwd: root,
      env: { ...process.env, AFW_DEMO_COMPILED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const done = new Promise<void>((resolve) => server.once('exit', () => resolve()));
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Demo start readiness timeout')), 30000);
        server.stdout.on('data', (chunk) => {
          output += chunk;
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/api/);
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        });
        server.stderr.on('data', (chunk) => {
          output += chunk;
        });
        server.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Demo API exited before readiness'));
        });
      });
      assert.equal((await fetch(url + '/products')).status, 401);
    } finally {
      server.stdin.end('stop\n');
      await done;
      captured.push(output);
    }
    assert.ok(
      !fs.existsSync(path.join(e.dir, 'operation.lock')),
      'Demo start left an orphan operation lock',
    );
    exec(['destroy', '--name', name, '--dry-run']);
    manager.load(name);
    exec(['destroy', '--name', name, '--confirm', 'wrong']);
    manager.load(name);
  } finally {
    await db.close();
  }
  exec(['destroy', '--name', name, '--confirm', e.manifest.containerId]);
  assert.ok(
    fs.existsSync(path.join(e.dir, 'credentials.json')),
    'Protected artifacts must not be silently deleted',
  );
  exec(['seed', '--name', name], false); // stopped/removed ID cannot redirect to a replacement

  exec(['create', '--name', interrupted, '--module', 'users']);
  const partial = remember(interrupted);
  const worker = manager.withLock(partial.dir, () =>
    spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        __filename,
        'fault-worker',
        interrupted,
      ],
      { cwd: root, env: process.env, encoding: 'utf8', timeout: 180000 },
    ),
  );
  captured.push((worker.stdout || '') + (worker.stderr || ''));
  assert.equal(worker.status, 1);
  db = await connect(partial);
  try {
    assert.equal(await db.db.collection('products').countDocuments(), 1);
    const stored: any = await db.db.collection('products').findOne({});
    const originalId = stored._id.toString();
    const state: any = await db.db.collection('demo_dataset_state').findOne({});
    assert.ok(Object.values(state.products).every((slot: any) => !slot.id));
    exec(['seed', '--name', interrupted], true, true);
    assert.equal(await db.db.collection('products').countDocuments(), 6);
    assert.ok(
      await db.db.collection('products').findOne({ _id: stored._id }),
      'Committed product was duplicated instead of recovered',
    );
    const recovered: any = await db.db.collection('demo_dataset_state').findOne({});
    assert.ok(Object.values(recovered.products).some((slot: any) => slot.id === originalId));
    assert.equal(
      await db.db
        .collection('security_audit_events')
        .countDocuments({ event: AuditEvent.PRODUCT, result: 'allowed', action: 'create' }),
      6,
    );
  } finally {
    await db.close();
  }
  exec(['destroy', '--name', interrupted, '--confirm', partial.manifest.containerId], true, true);
  noLeaks();
  // Successful automated tests explicitly dispose ONLY the exact protected artifacts they created.
  for (const owned of environments) {
    assert.ok(
      fingerprint(fs.readdirSync(owned.dir).sort()) ===
        fingerprint(['credentials.json', 'destroyed.json', 'environment.json']),
    );
    for (const file of ['credentials.json', 'destroyed.json', 'environment.json'])
      fs.unlinkSync(path.join(owned.dir, file));
    fs.rmdirSync(owned.dir);
  }
  fs.rmdirSync(process.env.AFW_DEMO_HOME);
  console.info(
    'PASS: full source/compiled CLI, repetition, no overwrite, concurrency lock, role/tenant isolation, no SMTP, conflicts/foreign data, guarded cleanup, post-commit failure/recovery, credential redaction.',
  );
}
if (process.argv[2] === 'fault-worker') {
  void operate(process.argv[3], 'seed', 'demo', false, () => {
    throw new Error('Injected post-commit checkpoint interruption');
  })
    .then(() => {
      process.exitCode = 2;
    })
    .catch(() => {
      console.info(
        'Expected injected interruption after a real ProductsService commit; state preserved.',
      );
      process.exitCode = 1;
    });
} else
  void run().catch((e) => {
    let message = String(e.message);
    for (const s of sensitive) message = message.replaceAll(s, '[REDACTED]');
    message = message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[REDACTED URI]');
    console.error('Demo smoke failed:', message);
    console.error('Owned environments preserved for diagnosis; no automatic deletion.');
    process.exitCode = 1;
  });
