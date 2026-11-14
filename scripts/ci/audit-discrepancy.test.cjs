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
const expiresAt = Date.parse(baseline.expiresAt);
const afterExpiry = expiresAt + 1;
function fixture() { return { production: read(path.join(dir, 'production.json')), full: read(path.join(dir, 'full.json')),
  exits: { production: 0, full: 1 }, lock: read(path.join(__dirname, '../../package-lock.json')),
  official: read(path.join(dir, 'official.json')) }; }
function refresh(f, key) { f.official.receipts[key].sha256 = digest(f.official[key]); }
function clean(f) { f.full = structuredClone(f.production); f.exits.full = 0; }
// Fixture observations/withdrawals and injected clocks below are simulations, never live consultations.
function observed(f, at) { f.official.observedAt = new Date(at).toISOString(); return f; }
function withdrawnClean(at) {
  const f = observed(fixture(), at); clean(f);
  f.official.ghsa.withdrawn_at = new Date(at - 1000).toISOString(); refresh(f, 'ghsa'); return f;
}
function withCli(f, at, run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-discrepancy-cli-'));
  try {
    const files = ['production', 'full', 'exits', 'lock', 'official'].map(k => { const file = path.join(temp, k + '.json'); fs.writeFileSync(file, JSON.stringify(f[k])); return file; });
    const before = files.map(file => fs.readFileSync(file, 'utf8'));
    // Only the disposable test child receives this preload. No production clock/env override is added.
    const clock = path.join(temp, 'clock.cjs'); fs.writeFileSync(clock, `Date.now = () => ${at};\n`);
    const cli = path.join(__dirname, 'audit-policy.cjs');
    run((count = 5) => spawnSync(process.execPath, ['--require', clock, cli, ...files.slice(0, count)], { encoding: 'utf8' }));
    assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
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
for (const at of [expiresAt - 1, expiresAt]) test(`six findings retain original inclusive deadline at ${at - expiresAt}ms`, () => {
  const f = observed(fixture(), at), result = evaluate(f, at);
  assert.equal(result.outcome, 'reviewed-cve-rejected-feed-discrepancy');
  assert.equal(result.reviewExpiresAt, '2026-11-10T22:09:20.702Z');
  assert.deepEqual(result.rawExitCodes, { production: 0, full: 1 });
});
for (const offset of [1, 86400000, 365 * 86400000]) {
  const at = expiresAt + offset;
  test(`review cannot renew automatically ${offset}ms after expiry with fresh official evidence`, () => {
    const f = observed(fixture(), at), before = structuredClone(f);
    assert.throws(() => evaluate(f, at), /AUDIT_POLICY_REJECTED: review-expired-or-future/);
    assert.deepEqual(f, before); assert.deepEqual(f.exits, { production: 0, full: 1 });
  });
  test(`withdrawal AND truly clean audits pass ${offset}ms after expiry without applying exception`, () => {
    const f = withdrawnClean(at), before = structuredClone(f);
    assert.deepEqual(evaluate(f, at), { outcome: 'clean-after-official-withdrawal', productionFindings: 0,
      fullFindings: 0, rawExitCodes: { production: 0, full: 0 }, localExceptionApplied: false });
    assert.deepEqual(f, before);
  });
}
test('six findings before original review cannot use a future approval', () => {
  const at = Date.parse(baseline.reviewedAt) - 60001;
  assert.throws(() => evaluate(observed(fixture(), at), at), /review-expired-or-future/);
});
test('clean feed but active GHSA after expiry remains a rejected discrepancy, not a clean shortcut', () => {
  const f = observed(fixture(), afterExpiry); clean(f);
  assert.throws(() => evaluate(f, afterExpiry), /active-ghsa-missing-from-feed/);
});
test('withdrawal but six npm findings after expiry remains rejected', () => {
  const f = observed(fixture(), afterExpiry);
  f.official.ghsa.withdrawn_at = new Date(expiresAt).toISOString(); refresh(f, 'ghsa');
  assert.throws(() => evaluate(f, afterExpiry), /withdrawn-feed-not-synchronized/);
});
const expiredCleanCases = {
  'failed full exit despite empty JSON': f => { f.exits.full = 1; },
  'full infrastructure exit': f => { f.exits.full = 2; },
  'failed production exit despite empty JSON': f => { f.exits.production = 1; },
  'production infrastructure exit': f => { f.exits.production = 2; },
  'missing real exit': f => { delete f.exits.full; },
  'string exit': f => { f.exits.full = '0'; },
  'findings with forged zero exit': f => { f.full = fixture().full; },
  'production findings with forged zero exit': f => { f.production = fixture().full; },
  'empty report with registry error': f => { f.full.error = { code: 'EAI_AGAIN' }; },
  'empty report with errors array': f => { f.production.errors = []; },
  'inconsistent totals': f => { f.full.metadata.vulnerabilities.total = 1; },
  'inconsistent severity counts': f => { f.full.metadata.vulnerabilities.low = 1; },
  'unsupported report version': f => { f.full.auditReportVersion = 1; },
  'missing official evidence': f => { delete f.official; },
  'stale official evidence': f => { observed(f, afterExpiry - 3600001); },
  'future official observation': f => { observed(f, afterExpiry + 60001); },
  'wrong source URL': f => { f.official.receipts.ghsa.url = 'https://example.invalid/ghsa'; },
  'HTTP source failure': f => { f.official.receipts.cve.status = 503; },
  'receipt hash mismatch': f => { f.official.ghsa.summary += ' tampered'; },
  'wrong GHSA identity': f => { f.official.ghsa.ghsa_id = 'GHSA-wrong'; refresh(f, 'ghsa'); },
  'missing withdrawal': f => { delete f.official.ghsa.withdrawn_at; refresh(f, 'ghsa'); },
  'invalid withdrawal date': f => { f.official.ghsa.withdrawn_at = 'bad'; refresh(f, 'ghsa'); },
  'CVE republished': f => { f.official.cve.cveMetadata.state = 'PUBLISHED'; refresh(f, 'cve'); },
  'NVD reclassified': f => { f.official.nvd.vulnerabilities[0].cve.vulnStatus = 'Analyzed'; refresh(f, 'nvd'); },
  'changed rejected CVE record': f => { f.official.cve.cveMetadata.dateUpdated = new Date(afterExpiry).toISOString(); refresh(f, 'cve'); },
  'changed rejected NVD record': f => { f.official.nvd.vulnerabilities[0].cve.lastModified = new Date(afterExpiry).toISOString(); refresh(f, 'nvd'); },
  'changed lock metadata': f => { f.lock.packages['node_modules/deepmerge'].integrity += 'x'; },
};
for (const [name, mutate] of Object.entries(expiredCleanCases)) test(`expired clean path still rejects ${name}`, () => {
  const f = withdrawnClean(afterExpiry); mutate(f);
  assert.throws(() => evaluate(f, afterExpiry), /AUDIT_POLICY_REJECTED/);
});
test('expired clean path retains the installed payload fingerprint check', () => {
  const f = withdrawnClean(afterExpiry), original = fs.readFileSync;
  const entry = path.resolve(__dirname, '../../node_modules/deepmerge/dist/cjs.js');
  try {
    fs.readFileSync = function(file, ...args) { const bytes = original.call(this, file, ...args);
      return file === entry ? Buffer.concat([bytes, Buffer.from('tampered')]) : bytes; };
    assert.throws(() => evaluate(f, afterExpiry), /changed-deepmerge-payload/);
  } finally { fs.readFileSync = original; }
});
deny('unknown changed npm source ID', f => { f.full.vulnerabilities.deepmerge.via[0].source++; });
deny('changed fixAvailable metadata', f => { f.full.vulnerabilities.jest.fixAvailable = false; });
deny('unreviewed lock metadata', f => { f.lock.packages['node_modules/deepmerge'].integrity += 'x'; });
deny('runtime semver drift', f => { f.lock.packages['node_modules/semver'].version = '7.8.6'; });
deny('new production edge despite false dev flag and clean production audit', f => { f.lock.packages[''].dependencies.deepmerge = '4.3.1'; });

test('CLI historical approved window uses5args, preserves files/exits; four-arg original still rejects six', () => {
  withCli(observed(fixture(), now), now, invoke => {
    const success = invoke(); assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(JSON.parse(success.stdout).rawExitCodes, { production: 0, full: 1 });
    const legacy = invoke(4); assert.equal(legacy.status, 1); assert.match(legacy.stderr, /changed-development-scope/);
  });
});
test('CLI truly clean withdrawal after expiry exits0, applies no exception and preserves all five files', () => {
  withCli(withdrawnClean(afterExpiry), afterExpiry, invoke => {
    const result = invoke(); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { outcome: 'clean-after-official-withdrawal', productionFindings: 0,
      fullFindings: 0, rawExitCodes: { production: 0, full: 0 }, localExceptionApplied: false });
  });
});
test('CLI six findings after expiry exits1, preserves raw full1 and never falls back to legacy', () => {
  withCli(observed(fixture(), afterExpiry), afterExpiry, invoke => {
    const result = invoke(); assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /review-expired-or-future/);
  });
});
for (const [name, make, expected] of [
  ['active GHSA / empty feed', () => { const f = observed(fixture(), afterExpiry); clean(f); return f; }, /active-ghsa-missing-from-feed/],
  ['withdrawn GHSA / six findings', () => { const f = observed(fixture(), afterExpiry);
    f.official.ghsa.withdrawn_at = new Date(expiresAt).toISOString(); refresh(f, 'ghsa'); return f; }, /withdrawn-feed-not-synchronized/],
  ['clean JSON / failed full exit', () => { const f = withdrawnClean(afterExpiry); f.exits.full = 1; return f; }, /clean-report-with-failed-exit/],
]) test(`CLI after expiry rejects ${name} and preserves raw files/exits`, () => {
  withCli(make(), afterExpiry, invoke => { const result = invoke(); assert.equal(result.status, 1);
    assert.equal(result.stdout, ''); assert.match(result.stderr, expected); });
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
