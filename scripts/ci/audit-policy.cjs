'use strict';

const fs = require('node:fs');

// Reviewed temporary DEVELOPMENT-only baseline. Never extend from registry output.
const ADVISORY = 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4';
const PACKAGES = Object.freeze({
  '@jest/core': '30.2.0',
  '@nestjs/cli': '11.0.24',
  deepmerge: '4.3.1',
  'fork-ts-checker-webpack-plugin': '9.1.0',
  jest: '30.2.0',
  'jest-cli': '30.2.0',
  'jest-config': '30.2.0',
  'ts-jest': '29.4.5',
});
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const own = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function reject(code) { throw new Error(`AUDIT_POLICY_REJECTED: ${code}`); }
function requireThat(condition, code) { if (!condition) reject(code); }

function report(value) {
  requireThat(record(value) && value.auditReportVersion === 2 && !own(value, 'error') && !own(value, 'errors'), 'invalid-audit-report');
  requireThat(record(value.vulnerabilities) && record(value.metadata?.vulnerabilities), 'missing-audit-data');
  const counts = Object.fromEntries(SEVERITIES.map(s => [s, 0]));
  for (const [name, finding] of Object.entries(value.vulnerabilities)) {
    requireThat(record(finding) && finding.name === name && SEVERITIES.includes(finding.severity), 'invalid-finding');
    counts[finding.severity]++;
  }
  for (const severity of SEVERITIES) requireThat(value.metadata.vulnerabilities[severity] === counts[severity], 'inconsistent-severity-count');
  const total = Object.keys(value.vulnerabilities).length;
  requireThat(value.metadata.vulnerabilities.total === total, 'inconsistent-total');
  return total;
}

function reachableProduction(lock) {
  requireThat(record(lock?.packages) && own(lock.packages, '') && record(lock.packages[''].dependencies), 'invalid-lockfile');
  const result = new Set(['']);
  const queue = [''];
  function resolve(from, name) {
    let parent = from;
    while (true) {
      const candidate = `${parent ? parent + '/' : ''}node_modules/${name}`;
      if (own(lock.packages, candidate)) return candidate;
      if (!parent) return undefined;
      const at = parent.lastIndexOf('/node_modules/');
      parent = at < 0 ? '' : parent.slice(0, at);
    }
  }
  while (queue.length) {
    const from = queue.shift();
    const pkg = lock.packages[from];
    requireThat(record(pkg), 'invalid-lock-package');
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      if (pkg[field] === undefined) continue;
      requireThat(record(pkg[field]), 'invalid-lock-dependencies');
      for (const name of Object.keys(pkg[field])) {
        const target = resolve(from, name);
        if (target && !result.has(target)) { result.add(target); queue.push(target); }
      }
    }
  }
  return result;
}

function evaluate({ production, full, exits, lock }) {
  requireThat(record(exits) && Number.isInteger(exits.production) && Number.isInteger(exits.full), 'missing-exit-codes');
  requireThat(exits.production === 0, 'production-audit-exit');
  requireThat(report(production) === 0, 'production-vulnerability');
  const total = report(full);
  if (total === 0) {
    requireThat(exits.full === 0, 'clean-report-with-failed-exit');
    return { outcome: 'clean', productionFindings: 0, fullFindings: 0, rawExitCodes: exits };
  }
  requireThat(exits.full === 1, 'unexpected-full-audit-exit');
  requireThat(total === Object.keys(PACKAGES).length && Object.keys(full.vulnerabilities).every(n => own(PACKAGES, n)), 'changed-development-scope');
  const reachable = reachableProduction(lock);
  let advisoryCount = 0;
  for (const [name, finding] of Object.entries(full.vulnerabilities)) {
    requireThat(finding.severity === 'low' && Array.isArray(finding.nodes) && finding.nodes.length === 1, 'changed-severity-or-nodes');
    const node = `node_modules/${name}`;
    requireThat(finding.nodes[0] === node && own(lock.packages, node), 'changed-package-path');
    const pkg = lock.packages[node];
    requireThat(record(pkg) && own(pkg, 'dev') && pkg.dev === true && pkg.version === PACKAGES[name] && !reachable.has(node), 'not-reviewed-dev-only-version');
    requireThat(Array.isArray(finding.via) && finding.via.length > 0, 'missing-advisory-chain');
    for (const via of finding.via) {
      if (typeof via === 'string') {
        requireThat(own(PACKAGES, via) && via !== name, 'unknown-advisory-reference');
      } else {
        requireThat(name === 'deepmerge' && record(via) && via.name === 'deepmerge' && via.dependency === 'deepmerge' && via.url === ADVISORY && via.severity === 'low', 'unknown-or-changed-advisory');
        requireThat(typeof via.range === 'string' && via.range.replace(/\s/g, '') === '>=4.2.0<=4.3.1', 'changed-advisory-range');
        advisoryCount++;
      }
    }
  }
  requireThat(advisoryCount === 1 && full.vulnerabilities.deepmerge.via.length === 1, 'unexpected-advisory-count');
  function leadsToDeepmerge(name, seen = new Set()) {
    if (name === 'deepmerge') return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return full.vulnerabilities[name].via.some(v => typeof v === 'string' && leadsToDeepmerge(v, new Set(seen)));
  }
  for (const name of Object.keys(PACKAGES)) requireThat(leadsToDeepmerge(name), 'unrelated-development-finding');
  return {
    outcome: 'known-development-advisory',
    advisory: 'GHSA-gcqx-w48m-w2h4', cve: 'CVE-2026-93753',
    productionFindings: 0, fullFindings: total, developmentOnly: true,
    rawExitCodes: exits,
    warning: 'Full npm audit remains exit 1. Reviewed development-only risk; no production clearance or blanket exception.',
  };
}

module.exports = { evaluate, PACKAGES };
if (require.main === module) {
  try {
    const files = process.argv.slice(2);
    requireThat(files.length === 4, 'usage-production-full-exits-lock');
    const [production, full, exits, lock] = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    console.log(JSON.stringify(evaluate({ production, full, exits, lock }), null, 2));
  } catch (error) {
    // Never echo registry response/credentials into workflow commands.
    console.error(error.message?.startsWith('AUDIT_POLICY_REJECTED:') ? error.message : 'AUDIT_POLICY_REJECTED: input-read-or-parse-error');
    process.exitCode = 1;
  }
}
