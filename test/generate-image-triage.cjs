// Report-only utility: explicit archived SARIF inputs; never connects to a database.
const fs = require('node:fs');
const path = require('node:path');
const [beforeDir, afterDir, output] = process.argv.slice(2);
if (!beforeDir || !afterDir || !output) throw Error('Usage: node test/generate-image-triage.cjs <baseline-dir> <final-dir> <output.md>');
const rules = file => JSON.parse(fs.readFileSync(file, 'utf8')).runs[0].tool.driver.rules;
const severity = rule => rule.properties.cvssV3_severity || 'UNSPECIFIED';
const packages = rule => rule ? rule.properties.purls.map(x => decodeURIComponent(x).split('?')[0]).join('; ') : 'not detected in this scan';
const count = rows => {
  const counts = {CRITICAL:0,HIGH:0,MEDIUM:0,LOW:0,UNSPECIFIED:0};
  for (const row of rows) counts[severity(row)]++;
  return `${rows.length} total: ${JSON.stringify(counts)}`;
};
const lines = ['# Image CVE triage — baseline and final artifacts', '',
  'Scope: every baseline HIGH/CRITICAL finding and EVERY remaining final finding (including lower severities). Complete raw baseline/final SARIFs are archived externally. Identifiers/severities/versions/fix boundaries are copied from Scout, not invented or inferred. Findings are not proof of exploitability. No blanket suppression, CVE exception, or production acceptance is applied.', '',
  'Source evidence: original production/development/Mongo image SARIFs; final-phase2 SARIFs; Scout --locations logs; direct filesystem, package-manager and global-npm probes. Removed tools are absent from the final Mongo filesystem AND distributed final layers (clean copy from prepared pinned source, no vulnerable upstream layers shipped). The same mongod/mongosh/runtime libraries are retained; backup/import/automatic init is deliberately excluded. Linux Debian/Ubuntu severity feeds can differ for the same CVE; counts are not additive across images.', ''];
for (const name of ['production','development','mongo']) {
  const before = rules(path.join(beforeDir,`${name}-image.sarif`));
  const after = rules(path.join(afterDir,`final-${name}.sarif`));
  const a = new Map(after.map(x => [x.id,x]));
  const b = new Map(before.map(x => [x.id,x]));
  const ids = new Set([...before.filter(x => ['HIGH','CRITICAL'].includes(severity(x))).map(x=>x.id),...after.map(x=>x.id)]);
  lines.push(`## ${name}`, '', `Before: ${count(before)}`, `After: ${count(after)}`, '');
  for (const id of ids) {
    const old = b.get(id), current = a.get(id), rule = current || old;
    const p = packages(rule);
    let origin, exposure, decision;
    if (name === 'mongo' && /pkg:golang/.test(p)) {
      origin = 'Official Mongo source image: Go stdlib in /usr/local/bin/gosu and/or /usr/bin/mongo{dump,export,import,files,...}; x/crypto and x/net in database tools. Locations archived.';
      exposure = 'Administrative/helper executables, not an asserted mongod network vulnerability. Network/file/privilege prerequisites vary by advisory; not accepted merely as unreachable.';
      decision = 'Upgrade Mongo 8.0.24 to 8.0.34 (same server major/minor), remove unused Go tools/gosu, run non-root without init helper; runtime and layers no longer contain these binaries. Backup tooling is a separately reviewed operator image, NOT silently supported here.';
    } else if (name === 'mongo' && /pkg:npm/.test(p)) {
      origin = 'Official init helper parser under /opt/js-yaml and /js-yaml.js, not application package-lock.';
      exposure = 'Config parsing/automatic init path; not required by explicit mongod command or mongosh RS administration.';
      decision = 'Remove automatic init entrypoint/parser; reject MONGO_INITDB_* and init scripts explicitly. mongod itself still supports operator-managed configuration, auth, keyfiles and TLS.';
    } else if (/pkg:npm/.test(p)) {
      origin = 'Global npm toolchain in base/development image, outside application package-lock. Probed with npm ls --global and Scout locations.';
      exposure = 'Development/package-manager network/tool input; not an API business endpoint. Runtime does not need package managers.';
      decision = 'Remove npm/npx/corepack/yarn from production; update development npm within v11 to 11.21.1 and apply same-major patch-only undici6.29.1/ip-address10.7.4 to its bundled graph. Rebuild/ci/typecheck/tests validate compatibility; no npm12 or force upgrade.';
    } else {
      origin = name === 'mongo' ? 'Ubuntu 24.04 OS/runtime packages inherited from pinned Mongo image, not application npm.' : 'Debian OS/runtime packages (bookworm12 baseline → trixie13 final), not application npm.';
      exposure = /glibc|gnutls|cyrus|pcre|zlib/.test(p) ? 'Runtime/shared-library exposure can depend on request/data/protocol paths. Reachability is NOT certified absent; retain advisory prerequisites and operator review.' : 'OS utility/component; API does not intentionally expose arbitrary command/extraction input. Local/privileged/input prerequisites vary; no universal non-reachability claim.';
      decision = name === 'mongo' ? 'Use patched Mongo8.0.34 source and signed exact zlib1g1:1.3.dfsg-3.1ubuntu2.3. Keep required OS/auth/TLS libraries; do not replace/remove them to hide a finding.' : 'Move Node24.22.1 to maintained pinned Debian13 slim (same Node24/libc family). Keep ABI/runtime libraries intact; no hand-built system-library replacement or suppressed advisory.';
    }
    if (current) {
      decision += ' RESIDUAL: no production acceptance/exemption. ' + (current.properties.fixed_version === 'not fixed' ? 'Scanner lists no fixed version on this distro line; monitor signed distro/upstream fixes and require owner review.' : 'Review remaining published fix boundary and applicable distribution/version before acceptance.');
    } else decision += ' No longer reported in final artifact; this is not a claim that every historical upstream version was patched.';
    const detail = (rule.help?.text || '').split('\n\n')[0].replace(/\s+/g,' ').slice(0,900).trim();
    lines.push(`### ${id}`, `- Severity before → after: ${old ? severity(old) : 'not reported'} → ${current ? severity(current) : 'not reported'}.`,
      `- Package/version before: ${packages(old)}.`, `- Package/version after: ${packages(current)}.`,
      `- Published fix before / after: ${old?.properties.fixed_version || 'not listed'} / ${current?.properties.fixed_version || 'not applicable'}.`,
      `- Origin: ${origin}`, `- Advisory context: ${detail}`, `- Exposure: ${exposure}`, `- Decision: ${decision}`, '');
  }
}
lines.push('## Residual release decision', '',
  'CVE-2026-85091 remains HIGH in both Node Debian13 images (zlib OS package, no fixed Debian13 version reported). This is an explicit unresolved release risk, NOT an accepted exception. The Ubuntu package in Mongo is patched at its signed distro boundary. Lower findings remain listed individually; review is required before production. Do not compare an image scan to npm audit as if they cover the same dependency graph.', '');
fs.writeFileSync(output, lines.join('\n'));
console.log('Wrote per-finding triage:',output);
