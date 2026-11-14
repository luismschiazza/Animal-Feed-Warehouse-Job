'use strict';
// Temporary versioned S1 policy explicitly approved by the owner on 2026-11-04.
// Approval covers this reviewed candidate/publication for CI, not merge/deploy/issue closure.
// No signature infrastructure: assumes a trusted CI producer and reviewed workflow/code.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { evaluate: scope, PACKAGES } = require('./audit-discrepancy-scope.cjs');
const baseline = require('./audit-discrepancy-baseline.json'); // S1 archived unchanged; original deadline still applies.
const candidate = require('./audit-discrepancy-s2-proposal.json'); // PENDING, never activated by audit input.
const { selectProfile } = require('./audit-discrepancy-profiles.cjs');
const { check, digest, sha, URLS } = require('./audit-official-sources.cjs');

function payload() {
  const root = path.resolve(__dirname, '../..');
  const req = createRequire(path.join(root, 'node_modules/jest-config/package.json'));
  const entry = req.resolve('deepmerge');
  check(path.relative(root, entry).replaceAll('\\', '/') === 'node_modules/deepmerge/dist/cjs.js', 'changed-deepmerge-entry');
  return { entry: sha(fs.readFileSync(entry)), package: sha(fs.readFileSync(path.join(root, 'node_modules/deepmerge/package.json'))) };
}
function evaluate(input, now = Date.now()) {
  const { official, production, full, exits, lock } = input;
  // Reuse exactly the strict report/graph/chain validator, with six literal versions, not eight+six.
  const result = scope({ production, full, exits, lock });
  check(digest(lock) === baseline.lock, 'unreviewed-lock');
  check(digest(payload()) === digest(baseline.payload), 'changed-deepmerge-payload');
  const age = now - Date.parse(official?.observedAt);
  check(Number.isFinite(age) && age >= -60000 && age <= 3600000, 'official-evidence-stale-or-future');
  for (const key of Object.keys(URLS)) {
    const r = official.receipts?.[key];
    check(r?.status === 200 && r.url === URLS[key] && r.sha256 === digest(official[key]), 'invalid-official-receipt');
  }
  check(official.cve?.cveMetadata?.cveId === baseline.cve && official.cve.cveMetadata.state === 'REJECTED', 'cve-not-rejected');
  const entries = official.nvd?.vulnerabilities;
  check(official.nvd?.totalResults === 1 && Array.isArray(entries) && entries.length === 1
    && entries[0].cve?.id === baseline.cve && entries[0].cve.vulnStatus === 'Rejected', 'nvd-not-rejected');
  check(digest(official.cve) === baseline.records.cve && digest(entries[0].cve) === baseline.records.nvd, 'changed-cve-nvd-record');
  const ghsa = official.ghsa;
  check(ghsa?.ghsa_id === baseline.advisory && ghsa.cve_id === baseline.cve, 'wrong-ghsa');
  check(Object.hasOwn(ghsa, 'withdrawn_at') && (ghsa.withdrawn_at === null
    || (typeof ghsa.withdrawn_at === 'string' && Number.isFinite(Date.parse(ghsa.withdrawn_at)))), 'invalid-withdrawal');
  if (ghsa.withdrawn_at !== null) {
    check(result.outcome === 'clean' && exits.full === 0, 'withdrawn-feed-not-synchronized');
    return { ...result, outcome: 'clean-after-official-withdrawal', localExceptionApplied: false };
  }
  check(result.outcome !== 'clean', 'active-ghsa-missing-from-feed');
  // Only the six-finding exception expires; synchronized clean audits apply no exception.
  // Pending/revoked S2 returns the original S1: no automatic approval, renewal or fallback waiver.
  const profile = selectProfile(baseline, candidate, now);
  check(Number.isFinite(now) && now >= Date.parse(profile.reviewedAt) - 60000
    && now <= Date.parse(profile.expiresAt), 'review-expired-or-future');
  check(ghsa.type === 'reviewed' && ghsa.severity === 'low' && ghsa.vulnerabilities?.length === 1
    && ghsa.vulnerabilities[0].package?.ecosystem === 'npm' && ghsa.vulnerabilities[0].package.name === 'deepmerge'
    && ghsa.vulnerabilities[0].vulnerable_version_range?.replace(/[\s,]/g, '') === '>=4.2.0<=4.3.1'
    && ghsa.vulnerabilities[0].first_patched_version === null, 'changed-active-ghsa-scope');
  // Pin ALL definition fields (even EPSS); no silent refresh/extension from registry output.
  check(digest(ghsa) === baseline.records.ghsa, 'changed-ghsa-record');
  check(digest(full.vulnerabilities) === baseline.findings, 'changed-audit-findings');
  return { ...result, outcome: 'reviewed-cve-rejected-feed-discrepancy', policyStatus: profile.status,
    policyId: profile.id || 'S1', localExceptionApplied: true,
    consultedAt: official.observedAt, reviewExpiresAt: profile.expiresAt,
    warning: 'Full npm audit remains exit 1 / six LOW. Explicit owner-approved versioned exact dev-only disposition, not a package fix, clean audit, S1 renewal, merge/deploy or production clearance.' };
}
module.exports = { evaluate, PACKAGES, payload };
