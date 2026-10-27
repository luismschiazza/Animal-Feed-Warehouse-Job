# Emergency phase 2 — CSS/startup and image CVE triage

Branch: chore/emergency-security-runtime-audit. No push/PR/merge/deploy, #18 or
commercial CRUDs. Only disposable MongoDB/fixtures; no seeds or real data.

## Commit 1 — real CSS packaging/startup regression

InlineCssProvider now resolves ../style/mail.css relative to its module (__dirname),
not cwd/src. Nest assets include mail/{templates,style}; no source tree copied into
production. The existing dist-only smoke now uses REAL InlineCssProvider (previous
stub concealed this failure), and a unit regression verifies cwd-independent loading
and actual CSS application.

Production Dockerfile adds a Node HTTP healthcheck for /api (30s interval, below
existing throttling threshold). No unauthenticated DB/metadata initialization added.

`CONTAINER_TEST_IMAGE=<explicit-local-image> CONTAINER_TEST_MONGO_IMAGE=<explicit-disposable-image> node test/production-container.smoke.cjs`
creates its own random-named Docker network, MongoDB replica set and database, no
host ports or reusable volumes. It first verifies actual compiled CMD refuses missing
operator metadata (not a missing module/asset). Then creates ONLY isolated test
journal/index/coordinator metadata, never users/organizations/business fixtures.
Actual CMD runs UID1000/read-only, without src, CSS present, healthy across at least
two healthcheck intervals, with zero user/org/session records. Containers/networks
removed in finally. This single node is not production HA/rollout validation.

Observed PASS against CSS-fixed image afw-emergency-phase2:css and original pinned
Mongo8.0.24. Source regression, full lint/build/unit tests and final-image regression
are also repeated before final report. No src bind mount or fake CSS injection.

Evidence: D:\programacao\documentos\evidencias\emergency-phase2\css-production-smoke.log.

## Commit 2 — CVE remediation/triage

Per-finding inventory: [EMERGENCY_IMAGE_CVE_TRIAGE.md](EMERGENCY_IMAGE_CVE_TRIAGE.md).
Every baseline HIGH/CRITICAL and every remaining final finding includes identifier,
package/version, origin, published fix, exposure limitations and technical decision.
Full baseline/final SARIFs, package locations, image identities and logs are archived
under D:\programacao\documentos\evidencias\emergency-phase2.

### Changes and compatibility boundaries

- Node stays 24.22.1, moves from pinned Debian12 bookworm-slim to pinned Debian13
  trixie-slim. Same Node major/patch and glibc family, rebuilt native dependencies;
  real compiled startup/TLS/full regressions validate this base change.
- Development/build npm minor update 11.19.1 → 11.21.1 (NOT npm12). Bundled undici
  patched 6.29.0 → 6.29.1 and ip-address10.7.2 → 10.7.4, exact same-major patch
  replacements with no extra dependencies. These are GLOBAL npm dependencies,
  not root package-lock overrides; npm ci/build/test execution validates the tool.
- Final Node image removes global npm/npx/corepack/yarn, unnecessary at runtime.
  Use node dist/commands/<script>.js for separately authorized compiled operator
  commands, NOT npm/ts-node in production. No application dependency ranges/lock
  changed in phase2, and no audit fix --force used. Host npm was not altered.
- Mongo 8.0.24 → 8.0.34, exact official digest, same 8.0 line. Signed Ubuntu exact
  zlib1g1:1.3.dfsg-3.1ubuntu2.3 upgrade fixes the published Ubuntu boundary.
  Do not disable apt signature verification or silently float versions.
- docker/mongodb.Dockerfile creates a LOCAL runtime with identical pinned-source
  mongod/mongosh/runtime libraries; excludes optional database backup/import tools,
  gosu/root-switch helper and js-yaml automatic-init helper. No root or init-script
  execution; MONGO_INITDB_* conventions are explicitly rejected, not silently ignored.
  UID999 with pre-owned/new storage; no automatic chown/migration of existing data.
- Mongo is copied from its cleaned prepared filesystem into a fresh final layer so
  removed vulnerable executables do not remain in distributed lower layers. This is
  removal, not CVE suppression: filesystem/package inventory and final image scans
  verify absence. TLS/auth/keyfile/RS/transactions remain functional, not bypassed.
- This Mongo image is NOT a production infrastructure plan or a backup-tools image.
  Backup/import must use a separately reviewed operator artifact/version. Original
  official-image root/initdb semantics are deliberately unsupported; Compose commands
  and explicit mongosh init remain tested. No data/volume conversion was performed.

### Final image scans: before → after (Scout, no suppressed findings)

- Production: 65 (0C/13H/13M/39L) → 28 (0C/1H/1M/26L).
- Development: 65 (0C/13H/13M/39L) → 28 (0C/1H/1M/26L).
- Mongo: 231 (11C/43H/140M/35L/2 unspecified) → 28 (0C/0H/26M/2L).
- Remaining HIGH: CVE-2026-85091, Debian13 zlib1:1.3.dfsg+really1.3.1-1,
  present in both Node images, no fixed Debian13 boundary listed in the feed.
  The Ubuntu instance is patched at its published boundary. No ad-hoc shared-library
  replacement, no blanket unreachable claim, no accepted production exception.
- Medium/low findings remain individually documented. No production clearance from
  zero HIGH/CRITICAL in Mongo or zero application npm audit; these are distinct scopes.

### Regression results and honest failure history

- Final Linux container regression: 97 HTTP/atomic/session/audit tests, TWO complete
  consecutive runs PASS, same 12-login/five-round barriers, quotas and assertions.
- 13 ABAC/provisioning tests PASS; real AppModule and admission CLI smokes PASS;
  separate authenticated/keyfile Mongo ACL/legacy-writer retirement/export smoke PASS.
- Full final host lint/build/TypeScript PASS; 266 unit tests/23 suites PASS;
  4 E2E/2 suites PASS; full/production npm audits ZERO. Real dist-only CSS rendering
  PASS (no stub). Final individual Docker builds all returned exit0; final image
  identities/SARIFs are archived. No root manifest/lock dependency changes in phase2.
- SMTP/TLS offline verification inside final production image PASS (trusted CA works,
  untrusted/hostname mismatch denied, no MAIL/RCPT/DATA/AUTH). No real emails.
- Mongo verified mutual TLS PASS using disposable fixture, network none: TLS works,
  plaintext and untrusted CA rejected. Auth/keyfile and transaction tests are separate
  positive proofs; none replaces production TLS/ACL/HA validation.
- Actual CMD/non-root/read-only/no-src startup remains healthy across two real checks;
  missing operator metadata is correctly rejected. Zero seeded accounts/orgs/sessions.
- Final Compose on the patched Mongo runtime PASS: fresh namespaced volume, random
  loopback-only host port, explicit init, healthy primary, UID999 and zero business
  databases. Root and MONGO_INITDB_* probes exit1 as designed. No prior volumes used.
- SHA256 of mongod/mongosh in the custom image exactly matches the pinned official
  source binaries. Compiled runtime UID1000/protected-write denial/global-manager
  removal and image config/history checks PASS, no real secrets provided to builds.
- Test-history retained: repeated Windows run had ENOBUFS/ECONNRESET (94/97), followed
  by Linux run with one ECONNRESET in 12-request audit test (96/97; all20 atomic tests
  passed). Reviewed harness used Supertest temporary listeners, potentially closed
  during concurrent peers. Only change: both suites explicitly own app.listen(0,
  127.0.0.1) until app.close(). No application security code, quotas, timing budgets,
  concurrency, assertions or failpoints weakened. Two full Linux runs then passed.
  This is NOT a claim that the Windows host resource problem has been fixed.
- Some long build-wrapper commands reached the harness timeout after artifact logs;
  final individual builds, image identities/scans and real startup verify artifacts.
  Intermediate failed tests/scans are not counted as approved executions.

### Release status

Awaiting owner review. Residual HIGH and lower image CVEs remain open release risks;
no production approval, push, PR, merge or deploy. #18/commercial work untouched.
All containers/networks/volumes used here are unique/disposable and explicitly cleaned;
local validation images remain for review. No real data/seeds/credentials/email used.
Single-node Compose cannot certify HA/failover/backup/production rollout of #17.
