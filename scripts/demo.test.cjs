'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  parse,
  validateInspection,
  secureDirectory,
  withLock,
  assertLock,
  isLocalEndpoint,
  locations,
} = require('./demo.cjs');
const id = 'a'.repeat(64),
  instance = 'b'.repeat(32);
const manifest = {
  version: 1,
  instance,
  containerId: id,
  imageId: 'sha256:' + id,
  database: 'afw_demo_' + instance,
  port: '54321',
};
const info = {
  Id: id,
  Name: '/afw-demo-' + instance,
  Image: manifest.imageId,
  Config: {
    Labels: {
      'afw.demo.purpose': 'afw-commercial-demo-v1',
      'afw.demo.instance': instance,
      'afw.demo.database': manifest.database,
    },
  },
  State: { Running: true },
  HostConfig: { Privileged: false, Binds: null },
  Mounts: [{ Type: 'volume', Destination: '/data/db' }],
  NetworkSettings: { Ports: { '27017/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } },
};
test('explicit names / bounded fixed modules and limits', () => {
  assert.equal(parse(['seed', '--name', 'loja', '-m', 'users', '-l', '15']).module, 'users');
  assert.equal(parse(['create', '--name', 'loja']).module, 'demo');
  assert.equal(parse(['seed', '--name', 'loja', '-m', 'products', '-l', '6']).module, 'products');
});
for (const args of [
  [],
  ['seed'],
  ['seed', '--name', '../real'],
  ['seed', '--name', 'loja', '--uri', 'mongodb://example.invalid'],
  ['seed', '--name', 'loja', '-l', '-1'],
  ['seed', '--name', 'loja', '-l', '0'],
  ['seed', '--name', 'loja', '-l', '1.2'],
  ['seed', '--name', 'loja', '-l', '99999'],
  ['seed', '--name', 'loja', '-l', '20'],
  ['seed', '--name', 'loja', '--force'],
  ['seed', '--name', 'loja', '--name', 'other'],
  ['create', '--name', 'loja', '-m', 'products'],
  ['seed', '--name', 'loja', '--confirm', 'anything'],
])
  test('rejects unsafe arguments without probing a destination', () =>
    assert.throws(() => parse(args)));
for (const m of ['disciplines', 'attendances', 'meetings', 'grades', 'mails'])
  test('school/mail selector remains disabled: ' + m, () =>
    assert.throws(() => parse(['seed', '--name', 'loja', '-m', m]), /disabled/),
  );
test('production environment refused before any Docker/database access', () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => parse(['seed', '--name', 'loja']));
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});
test('only exact owned image/container/database and loopback port accepted', () =>
  assert.doesNotThrow(() => validateInspection(manifest, info)));
for (const [key, mutate] of [
  ['container', (i) => (i.Id = 'c'.repeat(64))],
  ['image', (i) => (i.Image = 'sha256:' + 'c'.repeat(64))],
  ['label', (i) => (i.Config.Labels['afw.demo.instance'] = 'x')],
  ['public port', (i) => (i.NetworkSettings.Ports['27017/tcp'][0].HostIp = '0.0.0.0')],
  ['other port', (i) => (i.NetworkSettings.Ports['27017/tcp'][0].HostPort = '1')],
  ['privileged', (i) => (i.HostConfig.Privileged = true)],
  ['bind', (i) => (i.HostConfig.Binds = ['existing:/data/db'])],
  ['foreign mount', (i) => (i.Mounts = [{ Type: 'bind', Destination: '/data/db' }])],
  ['stopped', (i) => (i.State.Running = false)],
  ['extra port', (i) => (i.NetworkSettings.Ports['1234/tcp'] = [])],
])
  test('refuses inspection mismatch: ' + key, () => {
    const copy = structuredClone(info);
    mutate(copy);
    assert.throws(() => validateInspection(manifest, copy));
  });
test('private storage and exclusive operation lock; stale lock never silently reclaimed', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-guard-'));
  const dir = path.join(base, 'private');
  try {
    secureDirectory(dir, true);
    withLock(dir, () => {
      assertLock(dir);
      assert.throws(() => withLock(dir, () => {}));
    });
    assert.throws(() => assertLock(dir));
    fs.mkdirSync(path.join(dir, 'operation.lock'));
    assert.throws(() => withLock(dir, () => {}));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('only local Unix sockets and local named pipes', () => {
  for (const p of [
    'unix:///var/run/docker.sock',
    'npipe:////./pipe/docker_engine',
    'npipe:////./pipe/dockerDesktopLinuxEngine',
  ])
    assert.ok(isLocalEndpoint(p));
  for (const p of ['tcp://localhost:2375', 'ssh://remote', 'npipe:////remote/pipe/docker_engine'])
    assert.ok(!isLocalEndpoint(p));
});
test('refuses secrets storage inside a Git repository', () => {
  const old = process.env.AFW_DEMO_HOME;
  try {
    process.env.AFW_DEMO_HOME = path.join(__dirname, 'private');
    assert.throws(() => locations('example'), /outside ALL Git/);
  } finally {
    if (old === undefined) delete process.env.AFW_DEMO_HOME;
    else process.env.AFW_DEMO_HOME = old;
  }
});
test('async foreground operation retains its lock until settled', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-async-'));
  const dir = path.join(base, 'private');
  try {
    secureDirectory(dir, true);
    let finish;
    const wait = new Promise((resolve) => (finish = resolve));
    const result = withLock(dir, () => wait);
    assert.throws(() => withLock(dir, () => {}));
    finish();
    await result;
    withLock(dir, () => {});
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
