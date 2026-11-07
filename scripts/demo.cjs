'use strict';
// Development-only environment manager. No dotenv, application bootstrap or arbitrary Mongo URI.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const purpose = 'afw-commercial-demo-v1';
const image = 'afw-commercial-demo-mongo:v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = () => {
  throw new Error(
    'Demo safety check failed; environment preserved. Review name, ownership and dataset; no automatic reset.',
  );
};

function parse(args) {
  const [action, ...rest] = args;
  if (!['create', 'seed', 'start', 'status', 'destroy'].includes(action)) fail();
  const options = { action, module: 'demo', dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--dry-run') {
      if (options.dryRun) fail();
      options.dryRun = true;
      continue;
    }
    const key = {
      '--name': 'name',
      '--module': 'module',
      '-m': 'module',
      '--limit': 'limit',
      '-l': 'limit',
      '--confirm': 'confirm',
    }[flag];
    if (
      !key ||
      !rest[i + 1] ||
      rest[i + 1].startsWith('-') ||
      (options[key] !== undefined && key !== 'module')
    )
      fail();
    if (key === 'module' && options.moduleSeen) fail();
    options[key] = rest[++i];
    if (key === 'module') options.moduleSeen = true;
  }
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(options.name || '')) fail();
  if (!['demo', 'users', 'products'].includes(options.module))
    throw new Error('School/mail seeds remain disabled. Choose demo, users or products.');
  if (options.limit !== undefined && !/^[1-9][0-9]{0,2}$/.test(options.limit)) fail();
  const expected = options.module === 'users' ? 15 : options.module === 'products' ? 6 : 21;
  if (options.limit !== undefined && Number(options.limit) !== expected)
    throw new Error(
      `This fixed scenario requires --limit ${expected}; omit --limit to use it. No records were omitted.`,
    );
  if (action !== 'destroy' && options.confirm !== undefined) fail();
  if (!['seed', 'create'].includes(action) && (options.moduleSeen || options.limit !== undefined))
    fail();
  if (action === 'create' && options.module === 'products') fail();
  if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) fail();
  return options;
}

function secureDirectory(dir, create = false) {
  if (create) fs.mkdirSync(dir, { mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  if (process.platform === 'win32') {
    // Never trust chmod on Windows. Remove inherited access BEFORE writing any secrets.
    const script = create
      ? `$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $env:AFW_PRIVATE_DIR -AclObject $acl;`
      : '';
    const check = `$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $acl=Get-Acl -LiteralPath $env:AFW_PRIVATE_DIR; if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){exit 1}; foreach($r in $acl.Access){if($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid -or $r.AccessControlType -ne 'Allow'){exit 1}}; if($acl.Access.Count -eq 0){exit 1}`;
    const r = cp.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference="Stop";' + script + check,
      ],
      { env: { ...process.env, AFW_PRIVATE_DIR: dir }, stdio: 'pipe', timeout: 15000 },
    );
    if (r.status !== 0) fail();
  } else if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) fail();
}

function locations(name) {
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(name || '')) fail();
  const home = path.resolve(
    process.env.AFW_DEMO_HOME || path.join(root, '..', 'Animal-Feed-Warehouse-demo-environments'),
  );
  const relative = path.relative(root, home);
  if (
    !relative ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
  )
    throw new Error('Demo private storage must be outside ALL Git repositories.');
  for (let dir = home; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git')))
      throw new Error('Demo private storage must be outside ALL Git repositories.');
    if (path.dirname(dir) === dir) break;
  }
  return { home, dir: path.join(home, name) };
}
function writeNew(dir, name, data) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
}
function readPrivate(dir, name) {
  const file = path.join(dir, name),
    s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    (process.platform !== 'win32' && (s.mode & 0o077 || s.uid !== process.getuid()))
  )
    fail();
  if (process.platform === 'win32') {
    // Reject explicit ACLs granting anyone else access to an individual file too.
    const r = cp.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference="Stop"; $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $a=Get-Acl -LiteralPath $env:AFW_PRIVATE_FILE; foreach($r in $a.Access){if($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $s){exit 1}}',
      ],
      { env: { ...process.env, AFW_PRIVATE_FILE: file }, stdio: 'pipe', timeout: 15000 },
    );
    if (r.status !== 0) fail();
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function docker(args, input) {
  const result = cp.spawnSync('docker', args, {
    cwd: root,
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 180000,
  });
  if (result.status !== 0) fail();
  return result.stdout.trim();
}
function isLocalEndpoint(endpoint) {
  return (
    /^unix:\/\/\//.test(endpoint) || /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/.test(endpoint)
  );
}
function localDocker() {
  if (process.env.DOCKER_HOST || process.env.DOCKER_TLS_VERIFY || process.env.DOCKER_CERT_PATH)
    fail();
  const context = JSON.parse(docker(['context', 'inspect']))[0];
  const endpoint = context?.Endpoints?.docker?.Host || '';
  if (!isLocalEndpoint(endpoint)) fail();
  if (docker(['info', '--format', '{{.OSType}}']) !== 'linux') fail();
}
function validateInspection(manifest, info) {
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9]{32}$/.test(manifest.instance || '') ||
    !/^[a-f0-9]{64}$/.test(manifest.containerId || '') ||
    !/^afw_demo_[a-f0-9]{32}$/.test(manifest.database || '') ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.imageId || '')
  )
    fail();
  if (
    info.Id !== manifest.containerId ||
    info.Name !== '/afw-demo-' + manifest.instance ||
    info.Image !== manifest.imageId ||
    info.Config?.Labels?.['afw.demo.purpose'] !== purpose ||
    info.Config?.Labels?.['afw.demo.instance'] !== manifest.instance ||
    info.Config?.Labels?.['afw.demo.database'] !== manifest.database ||
    !info.State?.Running ||
    info.HostConfig?.Privileged ||
    info.HostConfig?.Binds?.length
  )
    fail();
  if (
    info.Mounts?.some(
      (m) => m.Type !== 'volume' || !['/data/db', '/data/configdb'].includes(m.Destination),
    )
  )
    fail();
  const ports = info.NetworkSettings?.Ports;
  if (Object.keys(ports || {}).some((p) => p !== '27017/tcp')) fail();
  const bindings = ports?.['27017/tcp'];
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    String(bindings[0].HostPort) !== String(manifest.port) ||
    !/^[0-9]{1,5}$/.test(String(manifest.port))
  )
    fail();
}
function load(name) {
  const { home, dir } = locations(name);
  secureDirectory(home);
  secureDirectory(dir);
  const manifest = readPrivate(dir, 'environment.json');
  if (manifest.name !== name) fail();
  localDocker();
  const info = JSON.parse(docker(['inspect', manifest.containerId]))[0];
  validateInspection(manifest, info);
  const secrets = readPrivate(dir, 'credentials.json');
  if (secrets.instance !== manifest.instance) fail();
  return { dir, manifest, secrets };
}
function withLock(dir, callback) {
  const lock = path.join(dir, 'operation.lock');
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw new Error(
      'Demo operation locked; inspect any interrupted process before removing its operation.lock directory.',
    );
  }
  const previous = process.env.AFW_DEMO_LOCK_TOKEN;
  const token = crypto.randomBytes(32).toString('hex');
  writeNew(lock, 'owner.json', { token, pid: process.pid });
  process.env.AFW_DEMO_LOCK_TOKEN = token;
  const finish = () => {
    if (previous === undefined) delete process.env.AFW_DEMO_LOCK_TOKEN;
    else process.env.AFW_DEMO_LOCK_TOKEN = previous;
    fs.unlinkSync(path.join(lock, 'owner.json'));
    fs.rmdirSync(lock);
  };
  let result;
  try {
    result = callback();
  } catch (error) {
    finish();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.finally(finish);
  finish();
  return result;
}
function assertLock(dir) {
  const owner = readPrivate(path.join(dir, 'operation.lock'), 'owner.json');
  if (
    !process.env.AFW_DEMO_LOCK_TOKEN ||
    owner.token !== process.env.AFW_DEMO_LOCK_TOKEN ||
    ![process.pid, process.ppid].includes(owner.pid)
  )
    fail();
}
function runner(name, command, module = 'demo', dryRun = false) {
  const args =
    process.env.AFW_DEMO_COMPILED === '1'
      ? ['dist/commands/demo/demo.script.js']
      : [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          'src/commands/demo/demo.script.ts',
        ];
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    AFW_DEMO_NAME: name,
    AFW_DEMO_ACTION: command,
    AFW_DEMO_MODULE: module,
    AFW_DEMO_DRY_RUN: dryRun ? '1' : '0',
  };
  // Drop application/database/SMTP settings inherited from a developer's shell. No dotenv fallback.
  for (const key of Object.keys(env))
    if (/^(MONGO|AUDIT_|BOOTSTRAP_|SESSION_.*MONGO|PRODUCTS_MONGO|MAIL_|JWT_)/.test(key))
      delete env[key];
  if (command === 'start')
    return new Promise((resolve, reject) => {
      const child = cp.spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
      let stopping = false;
      const interrupt = () => {
          stopping = true;
          child.kill('SIGINT');
        },
        terminate = () => {
          stopping = true;
          child.kill('SIGTERM');
        };
      // Explicit stdin stop also works on Windows, where process.kill(SIGTERM)
      // force-terminates the supervisor without delivering a catchable signal.
      const input = (chunk) => {
        if (String(chunk).trim() === 'stop') terminate();
      };
      const finish = () => {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
        process.stdin.removeListener('data', input);
        process.stdin.pause();
      };
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', terminate);
      process.stdin.on('data', input);
      child.once('error', () => {
        finish();
        reject(new Error('Demo API did not start; state preserved.'));
      });
      child.once('exit', (code) => {
        finish();
        if (code === 0 || stopping) resolve();
        else reject(new Error('Demo API stopped; state preserved.'));
      });
    });
  const r = cp.spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    timeout: 180000,
  });
  if (r.status !== 0)
    throw new Error(
      'Demo operation failed; state preserved. Resolve reported conflict before retrying.',
    );
}
async function create(options) {
  if (options.dryRun) {
    console.info(
      'Would create a NEW owned disposable replica set and the fixed demo dataset. No database connection or files created.',
    );
    return;
  }
  localDocker();
  const { home, dir } = locations(options.name);
  if (!fs.existsSync(home)) {
    fs.mkdirSync(path.dirname(home), { recursive: true });
    secureDirectory(home, true);
  } else secureDirectory(home);
  if (fs.existsSync(dir))
    throw new Error(
      'Demo name already exists; use demo:seed/status or inspect it. Nothing was replaced.',
    );
  secureDirectory(dir, true);
  const instance = crypto.randomBytes(16).toString('hex'),
    password = () => crypto.randomBytes(24).toString('base64url');
  const manifest = {
    version: 1,
    name: options.name,
    instance,
    database: 'afw_demo_' + instance,
    containerId: null,
    imageId: null,
    port: null,
  };
  const secrets = {
    instance,
    adminPassword: password(),
    runtimePassword: password(),
    jwtSecret: password() + password(),
    userPasswords: Object.fromEntries(
      [
        'SYSTEM_ADMIN',
        'ORGANIZATION_OWNER',
        'MANAGER',
        'INVENTORY_OPERATOR',
        'SALES_ASSOCIATE',
        'CASHIER',
        'PURCHASING_AGENT',
        'FINANCIAL_ANALYST',
        'AUDITOR',
        'CUSTOMER',
        'shared',
        'personal',
        'suspended',
        'revoked',
        'membership-suspended',
      ].map((key) => [key, password()]),
    ),
  };
  writeNew(dir, 'credentials.json', secrets);
  console.info('Building the repository-pinned local Mongo image; no existing data is mounted.');
  docker(['build', '-f', 'docker/mongodb.Dockerfile', '-t', image, '.']);
  manifest.imageId = docker(['image', 'inspect', '--format', '{{.Id}}', image]);
  manifest.containerId = docker([
    'run',
    '-d',
    '--name',
    'afw-demo-' + instance,
    '--label',
    'afw.demo.purpose=' + purpose,
    '--label',
    'afw.demo.instance=' + instance,
    '--label',
    'afw.demo.database=' + manifest.database,
    '-p',
    '127.0.0.1::27017',
    '--entrypoint',
    'bash',
    manifest.imageId,
    '-lc',
    'set -eu; umask 077; openssl rand -base64 756 > /tmp/demo-keyfile; exec mongod --replSet afw-demo-rs --bind_ip_all --auth --keyFile /tmp/demo-keyfile',
  ]);
  const info = JSON.parse(docker(['inspect', manifest.containerId]))[0];
  manifest.port = info.NetworkSettings.Ports['27017/tcp'][0].HostPort;
  writeNew(dir, 'environment.json', manifest); // persist ownership BEFORE setup; failure never causes blind deletion
  validateInspection(manifest, info);
  async function wait(code) {
    for (let i = 0; i < 40; i++) {
      try {
        docker(['exec', manifest.containerId, 'mongosh', '--quiet', '--eval', code]);
        return;
      } catch {
        await sleep(1000);
      }
    }
    fail();
  }
  await wait('quit(db.adminCommand({ping:1}).ok?0:1)');
  docker([
    'exec',
    manifest.containerId,
    'mongosh',
    '--quiet',
    '--eval',
    'rs.initiate({_id:"afw-demo-rs",members:[{_id:0,host:"127.0.0.1:27017"}]})',
  ]);
  await wait('quit(db.hello().isWritablePrimary?0:1)');
  docker(
    [
      'exec',
      '-i',
      manifest.containerId,
      'mongosh',
      '--quiet',
      '--eval',
      'const p=JSON.parse(require("fs").readFileSync(0,"utf8")); db.getSiblingDB("admin").createUser({user:"demo_operator",pwd:p.password,roles:["root"]})',
    ],
    JSON.stringify({ password: secrets.adminPassword }),
  );
  withLock(dir, () => runner(options.name, 'seed', options.module));
  console.info(
    `Demo ready: ${options.name}. Credentials are in the protected file ${path.join(dir, 'credentials.json')}; values are NEVER printed. Use demo:status and demo:start.`,
  );
}
async function main(args = process.argv.slice(2)) {
  const options = parse(args);
  if (options.action === 'create') return create(options);
  const { dir, manifest } = load(options.name);
  return withLock(dir, () => {
    if (options.action === 'destroy') {
      runner(options.name, 'verify');
      if (options.dryRun || options.confirm !== manifest.containerId) {
        console.info(
          `No deletion. After review use demo:destroy -- --name ${options.name} --confirm ${manifest.containerId}. Only this owned container and its anonymous volumes will be discarded.`,
        );
        return;
      }
      // Recheck ownership after dataset verification, immediately before destructive action.
      load(options.name);
      docker(['rm', '-f', '-v', manifest.containerId]);
      writeNew(dir, 'destroyed.json', {
        instance: manifest.instance,
        at: new Date().toISOString(),
      });
      console.info(
        'Owned disposable container/anonymous volumes removed. Protected credentials and evidence preserved for explicit operator disposal; name is not silently reusable.',
      );
    } else if (options.action === 'status') {
      runner(options.name, 'verify');
      console.info(
        `Owned local demo ${options.name}; container ${manifest.containerId}; DB ${manifest.database}; credentials ${path.join(dir, 'credentials.json')}. No URI/password printed.`,
      );
    } else return runner(options.name, options.action, options.module, options.dryRun);
  });
}
module.exports = {
  parse,
  secureDirectory,
  validateInspection,
  locations,
  load,
  withLock,
  assertLock,
  isLocalEndpoint,
  main,
};
if (require.main === module)
  main().catch(() => {
    console.error(
      'Demo failed safely. No automatic reset or deletion. Inspect the protected environment directory and command options; no credentials logged.',
    );
    process.exitCode = 1;
  });
