'use strict';
// Real source/compiled entrypoints, never a real DB. Hooks fail the test even if the CLI catches the error.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(process.env.AFW_CLI_TEST_HOME || os.tmpdir(), 'afw-cli-'));
fs.chmodSync(temp, 0o700);
const hook = path.join(temp, 'guard.cjs');
fs.writeFileSync(hook, `
const fs = require('node:fs'), Module = require('node:module');
const receipt = { blocked: [], network: 0, subprocess: 0, envReads: 0 };
const save = () => fs.writeFileSync(process.env.AFW_CLI_RECEIPT, JSON.stringify(receipt));
const deny = (kind, name) => { receipt[kind]++; receipt.blocked.push(name); save(); throw Error('Forbidden CLI bootstrap side effect'); };
const load = Module._load;
Module._load = function(request, ...args) {
  const name = request.replaceAll('\\\\', '/');
  if (/(^|\\/)app\\/app\\.module(?:\\.js)?$/.test(name) || /^(mongoose|mongodb|dotenv|nodemailer|@nestjs\\/(mongoose|config))(\\/|$)/.test(name)) {
    receipt.blocked.push(name); save(); throw Error('Forbidden CLI module import');
  }
  return load.call(this, request, ...args);
};
require('node:net').Socket.prototype.connect = () => deny('network', 'net.connect');
require('node:tls').connect = () => deny('network', 'tls.connect');
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
  require('node:child_process')[method] = () => deny('subprocess', method);
const read = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (typeof file === 'string' && require('node:path').basename(file) === '.env') {
    receipt.envReads++; save();
    if (process.env.AFW_CLI_ALLOW_ENV !== '1') throw Error('Unexpected .env read');
  }
  return read.call(this, file, ...args);
};
process.on('exit', save); save();
`, { mode: 0o600, flag: 'wx' });
let serial = 0;
function run(mode, args, cwd, status, admin = false) {
  const receipt = path.join(temp, `receipt-${++serial}.json`);
  const entry = mode === 'source'
    ? ['-r', require.resolve('ts-node/register'), '-r', require.resolve('tsconfig-paths/register'), path.join(root, 'src/main-cli.ts')]
    : [path.join(root, 'dist/main-cli.js')];
  const r = cp.spawnSync(process.execPath, ['-r', hook, ...entry, ...args], {
    cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'test',
      TS_NODE_PROJECT: path.join(root, 'tsconfig.json'), TS_NODE_BASEURL: root,
      MONGO_URL: 'mongodb://never-probe.invalid:1/real',
      MAIL_USER: 'never-send@example.test', MAIL_PASS: 'CLI-MAIL-CANARY',
      AFW_DEMO_HOME: path.join(temp, 'absent-environments'),
      AFW_CLI_RECEIPT: receipt, AFW_CLI_ALLOW_ENV: admin ? '1' : '0' },
  });
  const output = (r.stdout || '') + (r.stderr || '');
  // Do not print captured output: assertions must never leak a generated secret or configured URI.
  assert.equal(r.error, undefined, 'CLI subprocess did not finish');
  assert.equal(r.status, status, 'Unexpected CLI exit status');
  const trace = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.deepEqual(trace.blocked, [], 'An application/DB/config/SMTP import or forbidden operation occurred');
  assert.equal(trace.network, 0);
  assert.equal(trace.subprocess, 0);
  if (!admin) assert.equal(trace.envReads, 0);
  assert.ok(!/mongodb(?:\+srv)?:\/\//i.test(output), 'Connection URI was printed');
  assert.ok(!output.includes('CLI-MAIL-CANARY'), 'Credential canary was printed');
  return output;
}
const invalid = [
  ['Seed'], ['Seed', '--name', 'loja'], ['SEED'], ['Seed', '--help'],
  ['--name', 'loja', 'seed'], ['--', 'seed'], ['unknown'], ['--unknown'],
  ['help', 'unknown'], ['--help', 'unknown'], ['--help', 'seed', 'extra'],
  ['help', 'seed', 'extra'], ['--help=seed'], ['-hseed'],
  ['seed'], ['seed', '--name'], ['seed', '--name', '../real'],
  ['seed', '--name', 'loja', '--uri', 'never-probe.invalid'],
  ['seed', '--name', 'loja', '-m', 'disciplines'],
  ['seed', '--name', 'loja', '-m', 'mails'],
  ['seed', '--name', 'loja', '-l', '25'],
  ['seed', '--name', 'loja', '--unknown'], ['seed', '--name', 'unproven'],
  ['generate:jwt-secret', '--unknown'], ['generate:jwt-secret', 'extra'],
  ['generate:jwt-secret', '--force=true'], ['generate:jwt-secret', '-f', '--force'],
];
const help = [
  [], ['help'], ['--help'], ['-h'], ['--help', 'seed'], ['-h', 'seed'],
  ['help', 'seed'], ['seed', '--help'], ['seed', '--name', 'loja', '-h'],
  ['help', 'generate:jwt-secret'], ['generate:jwt-secret', '--help'],
  ['generate:jwt-secret', '--force', '--help'],
];
for (const mode of ['source', 'compiled']) {
  test(`${mode}: invalid commands/seed variants fail before any DB/config/network access`, () => {
    const cwd = path.join(temp, mode + '-invalid'); fs.mkdirSync(cwd, { mode: 0o700 });
    const env = 'MONGO_URL=mongodb://never-probe.invalid:1/real\nJWT_SECRET=UNCHANGED-CLI-CANARY\n';
    fs.writeFileSync(path.join(cwd, '.env'), env, { mode: 0o600 });
    for (const args of invalid) {
      run(mode, args, cwd, 1);
      assert.equal(fs.readFileSync(path.join(cwd, '.env'), 'utf8'), env);
    }
  });
  test(`${mode}: global/command help has no imports, connection or .env side effects`, () => {
    const cwd = path.join(temp, mode + '-help'); fs.mkdirSync(cwd, { mode: 0o700 });
    const env = 'JWT_SECRET=UNCHANGED-CLI-CANARY\n';
    fs.writeFileSync(path.join(cwd, '.env'), env, { mode: 0o600 });
    for (const args of help) {
      assert.match(run(mode, args, cwd, 0), /Usage:/);
      assert.equal(fs.readFileSync(path.join(cwd, '.env'), 'utf8'), env);
    }
  });
  test(`${mode}: explicit administrative generator works without DB and preserves force semantics`, () => {
    const cwd = path.join(temp, mode + '-admin'); fs.mkdirSync(cwd, { mode: 0o700 });
    const file = path.join(cwd, '.env');
    fs.writeFileSync(file, 'JWT_SECRET=\nKEEP=unchanged\n', { mode: 0o600 });
    let previous;
    for (const [args, changes] of [
      [['generate:jwt-secret'], true], [['generate:jwt-secret'], false],
      [['generate:jwt-secret', '-f'], true], [['generate:jwt-secret', '--force'], true],
    ]) {
      const output = run(mode, args, cwd, 0, true);
      const current = fs.readFileSync(file, 'utf8');
      const value = /^JWT_SECRET=([a-f0-9]{64})$/m.exec(current)?.[1];
      assert.ok(value, 'Administrative generator did not write the expected secret format');
      assert.ok(!output.includes(value), 'Generated secret was printed');
      assert.ok(current.includes('KEEP=unchanged'));
      if (previous) assert.equal(current !== previous, changes);
      previous = current;
    }
  });
}
test.after(() => {
  // All paths were created by this test under its new private temp root; never touch developer .env.
  fs.rmSync(temp, { recursive: true });
});
