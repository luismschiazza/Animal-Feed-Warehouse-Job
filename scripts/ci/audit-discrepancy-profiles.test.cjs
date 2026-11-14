'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { selectProfile } = require('./audit-discrepancy-profiles.cjs');
const { evaluate } = require('./audit-discrepancy.cjs');
const { digest } = require('./audit-official-sources.cjs');
const proposal = require('./audit-discrepancy-s2-proposal.json');
const s1 = require('./audit-discrepancy-baseline.json');
const definition = structuredClone(proposal);
const pending = () => ({ ...structuredClone(definition), status: 'PENDING_OWNER_APPROVAL', approval: null });
const read = file => JSON.parse(fs.readFileSync(file));
const dir = path.join(__dirname, 'fixtures/discrepancy');
const proposed = Date.parse(proposal.proposedAt), expires = Date.parse(proposal.expiresAt), now = proposed + 1000;
function fixture(at = now) {
  const official = read(path.join(dir, 'official.json')); official.observedAt = new Date(at).toISOString();
  return { production: read(path.join(dir, 'production.json')), full: read(path.join(dir, 'full.json')),
    exits: { production: 0, full: 1 }, lock: read(path.join(__dirname, '../../package-lock.json')), official };
}
function approved() {
  return { ...structuredClone(definition), status: 'APPROVED_TEMPORARY_BY_OWNER',
    approval: { approvedBy: 'SIMULATED owner, not a real decision', approvedAt: proposal.proposedAt,
      decisionReference: 'TEST FIXTURE ONLY; no approval or live source consultation occurred' } };
}
// Only this synchronous test process is mutated in memory; committed JSON stays pending/null.
function withCandidate(candidate, run) {
  const before = structuredClone(proposal);
  try { for (const k of Object.keys(proposal)) delete proposal[k]; Object.assign(proposal, candidate); return run(); }
  finally { for (const k of Object.keys(proposal)) delete proposal[k]; Object.assign(proposal, before); }
}
function cleanWithdrawn(at) {
  const f = fixture(at); f.full = structuredClone(f.production); f.exits.full = 0;
  f.official.ghsa.withdrawn_at = new Date(at - 1000).toISOString();
  f.official.receipts.ghsa.sha256 = digest(f.official.ghsa); return f;
}
test('pending proposal never authorizes findings, S1 keeps its original expiry, no rolling window', () => {
  const candidate = pending(); assert.equal(candidate.approval, null);
  assert.equal(s1.expiresAt, '2026-11-10T22:09:20.702Z'); assert.equal(expires - proposed, 72 * 3600000);
  assert.equal(selectProfile(s1, candidate, now), s1);
  assert.throws(() => withCandidate(candidate, () => evaluate(fixture(), now)), /review-expired-or-future/);
});
test('committed decision format is explicit and tests remain usable after approval/revocation', () => {
  const committed = read(path.join(__dirname, 'audit-discrepancy-s2-proposal.json'));
  assert.ok(['PENDING_OWNER_APPROVAL', 'APPROVED_TEMPORARY_BY_OWNER', 'REVOKED'].includes(committed.status));
  if (committed.status === 'PENDING_OWNER_APPROVAL') assert.equal(committed.approval, null);
  if (committed.status === 'APPROVED_TEMPORARY_BY_OWNER') {
    assert.ok(committed.approval.approvedBy.trim()); assert.ok(committed.approval.decisionReference.trim());
    assert.ok(Number.isFinite(Date.parse(committed.approval.approvedAt)));
  }
});
test('approved SIMULATION accepts exactly six dev with raw01, never claims full audit clean', () => {
  const f = fixture(), before = structuredClone(f);
  const result = withCandidate(approved(), () => evaluate(f, now));
  assert.equal(result.policyId, 'S2'); assert.equal(result.localExceptionApplied, true);
  assert.equal(result.outcome, 'reviewed-cve-rejected-feed-discrepancy'); assert.equal(result.fullFindings, 6);
  assert.deepEqual(result.rawExitCodes, { production: 0, full: 1 });
  assert.equal(result.reviewExpiresAt, proposal.expiresAt); assert.match(result.warning, /exit 1 \/ six LOW/);
  assert.deepEqual(f, before);
});
for (const at of [proposed, expires - 1, expires]) test(`SIMULATED approved S2 respects fixed boundary ${at}`, () => {
  assert.equal(withCandidate(approved(), () => evaluate(fixture(at), at)).reviewExpiresAt, proposal.expiresAt);
});
for (const offset of [1, 86400000, 365 * 86400000]) test(`S2 findings reject ${offset}ms after fixed expiry even with fresh evidence`, () => {
  const at = expires + offset, f = fixture(at), before = structuredClone(f);
  assert.throws(() => withCandidate(approved(), () => evaluate(f, at)), /AUDIT_POLICY_REJECTED: review-expired-or-future/);
  assert.deepEqual(f, before); assert.equal(f.exits.full, 1);
});
test('withdrawn+real00 simulation after both deadlines needs no S1/S2 approval', () => {
  const at = expires + 1;
  for (const candidate of [pending(), approved(), { ...approved(), status: 'REVOKED' }]) {
    assert.deepEqual(withCandidate(candidate, () => evaluate(cleanWithdrawn(at), at)), {
      outcome: 'clean-after-official-withdrawal', productionFindings: 0, fullFindings: 0,
      rawExitCodes: { production: 0, full: 0 }, localExceptionApplied: false });
  }
});
test('late approval reduces remaining time; never resets deadline', () => {
  const candidate = approved(); candidate.approval.approvedAt = new Date(expires - 1).toISOString();
  assert.equal(withCandidate(candidate, () => evaluate(fixture(expires), expires)).reviewExpiresAt, proposal.expiresAt);
  assert.throws(() => withCandidate(candidate, () => evaluate(fixture(expires + 1), expires + 1)), /review-expired-or-future/);
});
test('revocation returns expired S1, not another waiver', () => {
  const candidate = { ...approved(), status: 'REVOKED' };
  assert.equal(selectProfile(s1, candidate, now), s1);
  assert.throws(() => withCandidate(candidate, () => evaluate(fixture(), now)), /review-expired/);
});
const profileChanges = {
  'missing owner decision': c => { c.approval = null; },
  'empty owner': c => { c.approval.approvedBy = ''; },
  'empty decision reference': c => { c.approval.decisionReference = ' '; },
  'oversized decision reference': c => { c.approval.decisionReference = 'x'.repeat(1025); },
  'missing decision time': c => { delete c.approval.approvedAt; },
  'future decision time': c => { c.approval.approvedAt = new Date(now + 1).toISOString(); },
  'decision before proposal': c => { c.approval.approvedAt = new Date(proposed - 1).toISOString(); },
  'decision at expiry': c => { c.approval.approvedAt = c.expiresAt; },
  'invalid decision time': c => { c.approval.approvedAt = 'bad'; },
  'unsupported status': c => { c.status = 'APPROVED'; },
  'pending status with claimed approval': c => { c.status = 'PENDING_OWNER_APPROVAL'; },
  'wrong profile identity': c => { c.id = 'S3'; },
  'wrong original profile': c => { c.replacesExpiredProfile = 'other'; },
  'different schema': c => { c.schema = 2; },
  'longer duration': c => { c.maxDurationHours = 168; },
  'extended absolute deadline': c => { c.expiresAt = new Date(expires + 1).toISOString(); },
  'changed review start': c => { c.reviewedAt = new Date(proposed + 1).toISOString(); },
  'new package': c => { c.packages.other = '1.0.0'; },
  'missing package scope': c => { delete c.packages; },
  'missing record pin': c => { delete c.records; },
  'changed dev version': c => { c.packages.deepmerge = '4.3.2'; },
  'changed advisory': c => { c.advisory = 'GHSA-other'; },
  'changed CVE': c => { c.cve = 'CVE-other'; },
  'changed record pin': c => { c.records.ghsa += 'x'; },
  'changed findings pin': c => { c.findings += 'x'; },
  'changed lock pin': c => { c.lock += 'x'; },
  'changed payload pin': c => { c.payload.entry += 'x'; },
};
for (const [name, mutate] of Object.entries(profileChanges)) test(`S2 rejects ${name} in approved SIMULATION`, () => {
  const c = approved(); mutate(c);
  assert.throws(() => withCandidate(c, () => evaluate(fixture(), now)), /AUDIT_POLICY_REJECTED/);
});
const inputChanges = {
  'production finding': f => { f.production = structuredClone(f.full); f.exits.production = 1; },
  'production finding with forged0': f => { f.production = structuredClone(f.full); },
  'production infrastructure error': f => { f.exits.production = 2; },
  'full infrastructure error': f => { f.exits.full = 2; },
  'missing full exit': f => { delete f.exits.full; },
  'string exit': f => { f.exits.full = '1'; },
  'findings but full exit0': f => { f.exits.full = 0; },
  'empty report with failed exit': f => { f.full = structuredClone(f.production); },
  'JSON error': f => { f.full.error = { code: 'EAI_AGAIN' }; },
  'inconsistent metadata': f => { f.full.metadata.vulnerabilities.total = 0; },
  'new advisory on same package': f => { f.full.vulnerabilities.deepmerge.via[0].url += '-new'; },
  'new package finding': f => { f.full.vulnerabilities.other = { name: 'other', severity: 'low', nodes: [], via: [] }; f.full.metadata.vulnerabilities.total++; f.full.metadata.vulnerabilities.low++; },
  'higher severity': f => { f.full.vulnerabilities.jest.severity = 'high'; f.full.metadata.vulnerabilities.low--; f.full.metadata.vulnerabilities.high++; },
  'changed fix metadata': f => { f.full.vulnerabilities.jest.fixAvailable = false; },
  'new production edge': f => { f.lock.packages[''].dependencies.deepmerge = '4.3.1'; },
  'changed lock metadata': f => { f.lock.packages['node_modules/deepmerge'].integrity += 'x'; },
  'HTTP failure': f => { f.official.receipts.cve.status = 503; },
  'missing sources': f => { delete f.official; },
  'receipt mismatch': f => { f.official.ghsa.summary += 'tampered'; },
  'stale observation': f => { f.official.observedAt = new Date(now - 3600001).toISOString(); },
  'future observation': f => { f.official.observedAt = new Date(now + 60001).toISOString(); },
  'new GHSA definition/EPSS': f => { f.official.ghsa.epss = { percentage: 0.99 }; f.official.receipts.ghsa.sha256 = digest(f.official.ghsa); },
  'first patch appears': f => { f.official.ghsa.vulnerabilities[0].first_patched_version = '4.3.2'; f.official.receipts.ghsa.sha256 = digest(f.official.ghsa); },
  'CVE republished': f => { f.official.cve.cveMetadata.state = 'PUBLISHED'; f.official.receipts.cve.sha256 = digest(f.official.cve); },
  'withdrawn but feed6': f => { f.official.ghsa.withdrawn_at = new Date(now - 1).toISOString(); f.official.receipts.ghsa.sha256 = digest(f.official.ghsa); },
  'active GHSA but feed0': f => { f.full = structuredClone(f.production); f.exits.full = 0; },
};
for (const [name, mutate] of Object.entries(inputChanges)) test(`S2 retains rejection of ${name}`, () => {
  const f = fixture(); mutate(f);
  assert.throws(() => withCandidate(approved(), () => evaluate(f, now)), /AUDIT_POLICY_REJECTED/);
});
test('input cannot claim its own approval or choose profile', () => {
  const f = fixture(); f.profile = approved(); f.approval = approved().approval; f.policyId = 'S2';
  assert.throws(() => withCandidate(pending(), () => evaluate(f, now)), /review-expired/);
});
function cli(f, at, simulatedCandidate, inspect) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-s2-proposal-test-'));
  try {
    const keys = ['production', 'full', 'exits', 'lock', 'official'];
    const files = keys.map(k => { const p = path.join(temp, k + '.json'); fs.writeFileSync(p, JSON.stringify(f[k])); return p; });
    const committedPath = path.join(__dirname, 'audit-discrepancy-s2-proposal.json'), committedBefore = fs.readFileSync(committedPath, 'utf8');
    const before = files.map(p => fs.readFileSync(p, 'utf8')), alternate = path.join(temp, 'candidate.json');
    fs.writeFileSync(alternate, JSON.stringify(simulatedCandidate));
    // This preload exists ONLY in a disposable test child. Production has no env/argument hook.
    const hook = path.join(temp, 'test-only-preload.cjs');
    fs.writeFileSync(hook, `Date.now=()=>${at};\n` + (simulatedCandidate ? `const Module=require('node:module'),fs=require('node:fs'),load=Module._load;Module._load=function(request,parent,...args){if(request==='./audit-discrepancy-s2-proposal.json'&&parent.filename===${JSON.stringify(path.join(__dirname, 'audit-discrepancy.cjs'))})return JSON.parse(fs.readFileSync(${JSON.stringify(alternate)}));return load.call(this,request,parent,...args);};\n` : ''));
    inspect(extra => spawnSync(process.execPath, ['--require', hook, path.join(__dirname, 'audit-policy.cjs'), ...files, ...(extra ? [alternate] : [])], { encoding: 'utf8', env: { ...process.env, AFW_AUDIT_PROFILE: 'S2', AFW_S2_APPROVED: 'true' } }));
    assert.deepEqual(files.map(p => fs.readFileSync(p, 'utf8')), before);
    assert.equal(fs.readFileSync(committedPath, 'utf8'), committedBefore);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test('CI keeps raw audit exits, no-cache build and Mongo dependency; only warning wording changes', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/security-ci.yml'), 'utf8');
  assert.match(workflow, /mongo-integration:\r?\n    needs: quality/);
  assert.match(workflow, /docker build --no-cache --progress=plain --target development/);
  assert.match(workflow, /node --test scripts\/ci\/\*\.test\.cjs/);
  assert.match(workflow, /production_exit=\$\?/); assert.match(workflow, /full_exit=\$\?/);
  assert.match(workflow, /node scripts\/ci\/audit-policy\.cjs/);
  assert.doesNotMatch(workflow, /continue-on-error:|--audit-level/);
});
test('CLI committed decision follows source state, never env approval or wall-clock-dependent test acceptance', () => {
  const committed = read(path.join(__dirname, 'audit-discrepancy-s2-proposal.json'));
  const at = committed.status === 'APPROVED_TEMPORARY_BY_OWNER' ? Math.min(expires, Date.parse(committed.approval.approvedAt) + 1) : now;
  cli(fixture(at), at, null, invoke => {
    const r = invoke();
    if (committed.status === 'APPROVED_TEMPORARY_BY_OWNER') {
      assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).policyId, 'S2');
      assert.deepEqual(JSON.parse(r.stdout).rawExitCodes, { production: 0, full: 1 });
    } else { assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /review-expired/); }
  });
});
test('CLI pending fixture rejects six with clock after S1 expiry, env cannot activate it', () => cli(fixture(), now, pending(), invoke => {
  const r = invoke(); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /review-expired/);
}));
test('CLI approval SIMULATION preserves all raw files/exits and reports S2 disposition, not clean', () => cli(fixture(), now, approved(), invoke => {
  const r = invoke(); assert.equal(r.status, 0, r.stderr); const result = JSON.parse(r.stdout);
  assert.equal(result.policyId, 'S2'); assert.equal(result.localExceptionApplied, true);
  assert.deepEqual(result.rawExitCodes, { production: 0, full: 1 }); assert.equal(result.fullFindings, 6);
  assert.equal(result.reviewExpiresAt, proposal.expiresAt); assert.notEqual(result.outcome, 'clean');
}));
test('CLI cannot choose proposal as a sixth input', () => cli(fixture(), now, pending(), invoke => {
  const r = invoke(true); assert.equal(r.status, 1); assert.match(r.stderr, /usage-production-full-exits-lock-optional-official/);
}));
test('CLI S2 expiry simulation rejects six, no fallback', () => cli(fixture(expires + 1), expires + 1, approved(), invoke => {
  const r = invoke(); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /review-expired-or-future/);
}));
test('CLI withdrawn/00 after expiry remains clean without exception even when S2 stays pending', () => cli(cleanWithdrawn(expires + 1), expires + 1, pending(), invoke => {
  const r = invoke(); assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { outcome: 'clean-after-official-withdrawal', productionFindings: 0,
    fullFindings: 0, rawExitCodes: { production: 0, full: 0 }, localExceptionApplied: false });
}));
