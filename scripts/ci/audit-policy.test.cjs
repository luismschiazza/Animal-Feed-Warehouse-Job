'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluate, PACKAGES } = require('./audit-policy.cjs');

function report(vulnerabilities = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: Object.keys(vulnerabilities).length };
  for (const v of Object.values(vulnerabilities)) counts[v.severity]++;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}
function fixture() {
  const vulnerabilities = {}, packages = { '': { dependencies: {} } };
  for (const [name, version] of Object.entries(PACKAGES)) {
    vulnerabilities[name] = { name, severity: 'low', nodes: [`node_modules/${name}`], via: ['deepmerge'] };
    packages[`node_modules/${name}`] = { version, dev: true };
  }
  vulnerabilities.deepmerge.via = [{ name: 'deepmerge', dependency: 'deepmerge', url: 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4', severity: 'low', range: '>=4.2.0 <=4.3.1' }];
  return { production: report(), full: report(vulnerabilities), exits: { production: 0, full: 1 }, lock: { packages } };
}
function denied(change) {
  const input = fixture(); change(input);
  assert.throws(() => evaluate(input), /AUDIT_POLICY_REJECTED/);
}

test('accepts two clean audits only with real exit 0', () => {
  const input = fixture(); input.full = report(); input.exits.full = 0;
  assert.equal(evaluate(input).outcome, 'clean');
});
test('classifies exactly the reviewed dev baseline, retaining raw exit 1 and warning', () => {
  const input = fixture(), original = structuredClone(input), result = evaluate(input);
  assert.equal(result.outcome, 'known-development-advisory');
  assert.equal(result.rawExitCodes.full, 1);
  assert.equal(result.fullFindings, 8);
  assert.match(result.warning, /exit 1/);
  assert.deepEqual(input, original);
});
const cases = {
  'production advisory': x => { x.production = structuredClone(x.full); x.exits.production = 1; },
  'production finding forged exit 0': x => { x.production = structuredClone(x.full); },
  'production infrastructure failure': x => { x.exits.production = 2; },
  'full infrastructure failure': x => { x.exits.full = 2; },
  'missing real exit': x => { delete x.exits.full; },
  'string exit code': x => { x.exits.full = '1'; },
  'clean JSON but failed exit': x => { x.full = report(); },
  'findings but falsely successful exit': x => { x.exits.full = 0; },
  'registry error with empty findings': x => { x.production.error = { code: 'EAI_AGAIN' }; },
  'registry errors array': x => { x.full.errors = []; },
  'missing vulnerabilities': x => { delete x.full.vulnerabilities; },
  'missing metadata': x => { delete x.full.metadata; },
  'unsupported report format': x => { x.full.auditReportVersion = 1; },
  'inconsistent total': x => { x.full.metadata.vulnerabilities.total = 0; },
  'inconsistent severity count': x => { x.full.metadata.vulnerabilities.low = 0; },
  'new advisory under same package': x => { x.full.vulnerabilities.deepmerge.via[0].url = 'https://github.com/advisories/GHSA-new-advisory'; },
  'new package': x => { x.full.vulnerabilities.other = { name: 'other', severity: 'low', nodes: [], via: ['deepmerge'] }; x.full.metadata.vulnerabilities.total++; x.full.metadata.vulnerabilities.low++; },
  'higher propagated severity': x => { x.full.vulnerabilities.jest.severity = 'moderate'; x.full.metadata.vulnerabilities.low--; x.full.metadata.vulnerabilities.moderate++; },
  'higher root advisory severity': x => { x.full.vulnerabilities.deepmerge.via[0].severity = 'high'; },
  'changed advisory range': x => { x.full.vulnerabilities.deepmerge.via[0].range = '>=4.2.0 <=4.3.2'; },
  'dev flag absent': x => { delete x.lock.packages['node_modules/deepmerge'].dev; },
  'dev flag false': x => { x.lock.packages['node_modules/deepmerge'].dev = false; },
  'unreviewed version': x => { x.lock.packages['node_modules/deepmerge'].version = '4.3.2'; },
  'unreviewed consumer version': x => { x.lock.packages['node_modules/jest'].version = '31.0.0'; },
  'nested or different node': x => { x.full.vulnerabilities.deepmerge.nodes[0] = 'node_modules/unreviewed/node_modules/deepmerge'; },
  'additional vulnerable node': x => { x.full.vulnerabilities.deepmerge.nodes.push('node_modules/other/node_modules/deepmerge'); },
  'unknown via reference': x => { x.full.vulnerabilities.jest.via = ['other']; },
  'self reference': x => { x.full.vulnerabilities.jest.via = ['jest']; },
  'unrelated reference cycle': x => { x.full.vulnerabilities.jest.via = ['jest-cli']; x.full.vulnerabilities['jest-cli'].via = ['jest']; },
  'empty advisory chain': x => { x.full.vulnerabilities.jest.via = []; },
  'extra root advisory': x => { x.full.vulnerabilities.deepmerge.via.push(structuredClone(x.full.vulnerabilities.deepmerge.via[0])); },
  'forged dev flag but root production dependency': x => { x.lock.packages[''].dependencies.deepmerge = '4.3.1'; },
  'forged dev flag but transitive production dependency': x => { x.lock.packages[''].dependencies.runtime = '1'; x.lock.packages['node_modules/runtime'] = { version: '1', dependencies: { deepmerge: '4.3.1' } }; },
  'forged dev flag but production peer': x => { x.lock.packages[''].dependencies.runtime = '1'; x.lock.packages['node_modules/runtime'] = { version: '1', peerDependencies: { deepmerge: '4.3.1' } }; },
  'forged dev flag but production optional dependency': x => { x.lock.packages[''].dependencies.runtime = '1'; x.lock.packages['node_modules/runtime'] = { version: '1', optionalDependencies: { deepmerge: '4.3.1' } }; },
  'missing lockfile': x => { x.lock = null; },
};
for (const [name, change] of Object.entries(cases)) test(`rejects ${name}`, () => denied(change));

test('CLI rejects malformed input with nonzero exit, without echoing raw content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-audit-policy-'));
  try {
    const file = path.join(directory, 'invalid.json'); fs.writeFileSync(file, 'invalid-sensitive-marker');
    const result = spawnSync(process.execPath, [path.join(__dirname, 'audit-policy.cjs'), file, file, file, file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AUDIT_POLICY_REJECTED/);
    assert.doesNotMatch(result.stderr, /sensitive-marker/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
