'use strict';
// CI fixture teardown, NOT a public demo --force/reset command.
// The hosted runner and its unique private root were created for this disposable test only.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const manager = require('../demo.cjs');

function requireSafe(ok) {
  if (!ok) throw new Error('CI fixture ownership is not proven');
}
function docker(args) {
  const r = cp.spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  requireSafe(r.status === 0);
  return r.stdout.trim();
}
function cleanup(base) {
  requireSafe(
    process.env.GITHUB_ACTIONS === 'true' &&
      process.env.CI === 'true' &&
      process.platform === 'linux',
  );
  requireSafe(/^\/tmp\/afw-ci-[0-9]+-[0-9]+-demo$/.test(process.env.CI_REPORTS || ''));
  requireSafe(path.resolve(base) === path.join(process.env.CI_REPORTS, 'private'));
  manager.secureDirectory(base);
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    requireSafe(
      entry.isDirectory() && !entry.isSymbolicLink() && /^afw-issue31-[a-z0-9]+$/.test(entry.name),
    );
    const home = path.join(base, entry.name);
    manager.secureDirectory(home);
    for (const item of fs.readdirSync(home, { withFileTypes: true })) {
      requireSafe(
        item.isDirectory() &&
          !item.isSymbolicLink() &&
          /^(smoke|partial)-[a-z0-9]+$/.test(item.name),
      );
      const dir = path.join(home, item.name);
      manager.secureDirectory(dir);
      // A missing manifest means ownership/setup is uncertain: preserve rather than guess.
      const manifestFile = path.join(dir, 'environment.json');
      const stat = fs.lstatSync(manifestFile);
      requireSafe(stat.isFile() && !stat.isSymbolicLink());
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      requireSafe(manifest.name === item.name && /^[a-f0-9]{64}$/.test(manifest.containerId));
      // Never tear down while a supervisor/process still owns the fixture lock.
      requireSafe(!fs.existsSync(path.join(dir, 'operation.lock')));
      const ids = docker(['container', 'ls', '-a', '--no-trunc', '--format', '{{.ID}}']).split(
        /\s+/,
      );
      if (ids.includes(manifest.containerId)) {
        process.env.AFW_DEMO_HOME = home;
        const owned = manager.load(item.name); // verifies local daemon, owner/ACL, ID/image/labels/mounts/port/credentials
        requireSafe(owned.manifest.containerId === manifest.containerId);
        // This CI-only fixture may contain fault-injected records. It is never adopted from an external target.
        docker(['rm', '-f', '-v', manifest.containerId]);
        console.info('Removed verified disposable CI fixture:', item.name, manifest.containerId);
      } else {
        const marker = JSON.parse(fs.readFileSync(path.join(dir, 'destroyed.json'), 'utf8'));
        requireSafe(marker.instance === manifest.instance);
      }
      const known = new Set(['environment.json', 'credentials.json', 'destroyed.json']);
      for (const file of fs.readdirSync(dir)) {
        const s = fs.lstatSync(path.join(dir, file));
        requireSafe(known.has(file) && s.isFile() && !s.isSymbolicLink());
      }
      for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
      fs.rmdirSync(dir);
    }
    fs.rmdirSync(home);
  }
  fs.rmdirSync(base);
  console.info('CI demo cleanup complete; no credential directories uploaded.');
}
module.exports = { cleanup };
if (require.main === module) {
  try {
    cleanup(process.argv[2]);
  } catch {
    console.error('CI cleanup refused an uncertain fixture; no unknown resource was deleted.');
    process.exitCode = 1;
  }
}
