'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { evaluate } = require('./audit-discrepancy.cjs');
const { digest, fetchOfficial } = require('./audit-official-sources.cjs');
const baseline = require('./audit-discrepancy-baseline.json');
const dir = path.join(__dirname, 'fixtures/discrepancy');
const read = file => JSON.parse(fs.readFileSync(file));
const now = Date.parse(baseline.reviewedAt) + 1000;
function fixture() { return { production: read(path.join(dir, 'production.json')), full: read(path.join(dir, 'full.json')),
  exits: { production: 0, full: 1 }, lock: read(path.join(__dirname, '../../package-lock.json')),
  official: read(path.join(dir, 'official.json')) }; }
function refresh(f, key) { f.official.receipts[key].sha256 = digest(f.official[key]); }
function clean(f) { f.full = structuredClone(f.production); f.exits.full = 0; }
function deny(name, mutate) { test(name, () => { const f = fixture(); mutate(f); assert.throws(() => evaluate(f, now), /AUDIT_POLICY_REJECTED/); }); }
test('exact owner-approved temporary six-dev scope retains all raw JSONs and real exits, no release approval implied', () => {
  const f = fixture(), copy = structuredClone(f), result = evaluate(f, now);
  assert.equal(result.outcome, 'reviewed-cve-rejected-feed-discrepancy'); assert.equal(result.fullFindings, 6);
  assert.deepEqual(result.rawExitCodes, { production: 0, full: 1 }); assert.equal(result.policyStatus, 'APPROVED_TEMPORARY_BY_OWNER'); assert.deepEqual(f, copy);
});
test('withdrawal AND clean npm retires exception', () => { const f = fixture(); clean(f); f.official.ghsa.withdrawn_at = new Date(now).toISOString(); refresh(f, 'ghsa');
  assert.equal(evaluate(f, now).outcome, 'clean-after-official-withdrawal'); });
deny('withdrawal with still-active npm findings', f => { f.official.ghsa.withdrawn_at = new Date(now).toISOString(); refresh(f, 'ghsa'); });
deny('clean npm but still active GHSA', clean);
deny('missing official bundle cannot fall back', f => { delete f.official; });
deny('missing withdrawn_at is not withdrawal', f => { clean(f); delete f.official.ghsa.withdrawn_at; refresh(f, 'ghsa'); });
deny('invalid withdrawal date', f => { clean(f); f.official.ghsa.withdrawn_at = 'bad'; refresh(f, 'ghsa'); });
deny('CVE republished', f => { f.official.cve.cveMetadata.state = 'PUBLISHED'; refresh(f, 'cve'); });
deny('NVD reclassified', f => { f.official.nvd.vulnerabilities[0].cve.vulnStatus = 'Analyzed'; refresh(f, 'nvd'); });
deny('CVE record update even with same rejected state', f => { f.official.cve.cveMetadata.dateUpdated = new Date(now).toISOString(); refresh(f, 'cve'); });
deny('GHSA updated_at change', f => { f.official.ghsa.updated_at = new Date(now).toISOString(); refresh(f, 'ghsa'); });
deny('GHSA severity change', f => { f.official.ghsa.severity = 'high'; refresh(f, 'ghsa'); });
deny('GHSA affected range change', f => { f.official.ghsa.vulnerabilities[0].vulnerable_version_range = '<=9'; refresh(f, 'ghsa'); });
deny('official first patch appears', f => { f.official.ghsa.vulnerabilities[0].first_patched_version = '4.3.2'; refresh(f, 'ghsa'); });
deny('new GHSA reference', f => { f.official.ghsa.references.push('https://example.invalid/new'); refresh(f, 'ghsa'); });
deny('EPSS update conservatively requires review', f => { f.official.ghsa.epss = { percentage: 0.99 }; refresh(f, 'ghsa'); });
deny('wrong official source URL', f => { f.official.receipts.ghsa.url = 'https://example.invalid/ghsa'; });
deny('HTTP source failure', f => { f.official.receipts.cve.status = 503; });
deny('receipt integrity mismatch', f => { f.official.ghsa.summary += ' edited'; });
deny('official evidence older than1h', f => { f.official.observedAt = new Date(now - 3600001).toISOString(); });
deny('official observation >60s in future', f => { f.official.observedAt = new Date(now + 60001).toISOString(); });
test('review cannot renew automatically after expiry', () => assert.throws(() => evaluate(fixture(), Date.parse(baseline.expiresAt) + 1), /review-expired/));
deny('unknown changed npm source ID', f => { f.full.vulnerabilities.deepmerge.via[0].source++; });
deny('changed fixAvailable metadata', f => { f.full.vulnerabilities.jest.fixAvailable = false; });
deny('unreviewed lock metadata', f => { f.lock.packages['node_modules/deepmerge'].integrity += 'x'; });
deny('runtime semver drift', f => { f.lock.packages['node_modules/semver'].version = '7.8.6'; });
deny('new production edge despite false dev flag and clean production audit', f => { f.lock.packages[''].dependencies.deepmerge = '4.3.1'; });

test('CLI profile round-trip uses5args, preserves files/exits; four-arg original still rejects six', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-discrepancy-cli-'));
  try {
    const f = fixture(); f.official.observedAt = new Date().toISOString(); // Simulated producer timestamp, NOT a new official consultation.
    const files = ['production', 'full', 'exits', 'lock', 'official'].map(k => { const file = path.join(temp, k + '.json'); fs.writeFileSync(file, JSON.stringify(f[k])); return file; });
    const before = files.map(file => fs.readFileSync(file, 'utf8'));
    const cli = path.join(__dirname, 'audit-policy.cjs'), success = spawnSync(process.execPath, [cli, ...files], { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).rawExitCodes.full, 1);
    const legacy = spawnSync(process.execPath, [cli, ...files.slice(0, 4)], { encoding: 'utf8' }); assert.equal(legacy.status, 1); assert.match(legacy.stderr, /changed-development-scope/);
    assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
async function network(handler, run) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-discrepancy-http-')), dest = path.join(folder, 'capture'), original = global.fetch;
  try { global.fetch = handler; await run(dest); } finally { global.fetch = original; fs.rmSync(folder, { recursive: true, force: true }); }
}
test('collector HTTPfailure simulation preserves body/headers/status', async () => network(async () => new Response('{"simulated":500}', { status: 500, headers: { 'content-type': 'application/json' } }), async dest => {
  await assert.rejects(fetchOfficial(dest), /official-http-failure/); assert.equal(read(path.join(dest, 'cve.receipt.json')).status, 500); assert.equal(fs.readFileSync(path.join(dest, 'cve.body'), 'utf8'), '{"simulated":500}');
}));
test('collector timeout simulation has no cached fallback', async () => network(async () => { throw Error('SIMULATED timeout'); }, async dest => {
  await assert.rejects(fetchOfficial(dest), /SIMULATED/); assert.equal(read(path.join(dest, 'cve.failure.json')).incomplete, true);
}));
test('collector overlimit simulation explicitly retains bounded partial response', async () => network(async () => new Response('x'.repeat(1048577)), async dest => {
  await assert.rejects(fetchOfficial(dest), /official-response-too-large/); assert.equal(fs.statSync(path.join(dest, 'cve.partial-body')).size, 1048576); assert.equal(read(path.join(dest, 'cve.failure.json')).incomplete, true);
}));
test('collector success simulation enforces fixed URLs/no redirect and refuses overwrite', async () => {
  const f = fixture(), names = ['cve', 'nvd', 'ghsa']; let n = 0;
  await network(async (url, options) => { const key = names[n++]; assert.equal(url, f.official.receipts[key].url); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(f.official[key]), { headers: { 'content-type': 'application/json' } }); }, async dest => {
    assert.equal((await fetchOfficial(dest)).ghsa.ghsa_id, baseline.advisory); assert.equal(n, 3); await assert.rejects(fetchOfficial(dest), /refuse-evidence-overwrite/);
  });
});
