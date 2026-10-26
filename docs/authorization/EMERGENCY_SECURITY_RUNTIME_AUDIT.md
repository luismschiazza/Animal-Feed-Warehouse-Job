# Emergency runtime/dependency security review

## Scope and authorization

Repository confirmed: luismschiazza/Animal-Feed-Warehouse-Job, baseline main `be2fbd9`.
GitHub checked: #4/#5/#6/#16/#17 CLOSED; PR #26 MERGED. Work branch:
`chore/emergency-security-runtime-audit`. No #18/commercial CRUD, real database,
seed execution, PR creation, merge, deployment or production provisioning authorized.

## Stage 1 — runtime, startup and local containers

- Local Node 24.22.1 / npm 11.19.1. Preserve the user's existing .nvmrc change to 24.22.1.
- Engines Node >=24.22.1 <25, npm >=11.19.1 <12; matching lockfile metadata.
- Docker Node 24.22.1 bookworm-slim, immutable multiarch digest; npm 11.19.1 explicitly
  installed. All dependency stages use npm ci. Final image copies only dist,
  production node_modules and package.json; non-root node user. Development tree
  owned by node for watch/build writes. No automatic operator commands.
- .dockerignore excludes local env files (except the example), keys, Git,
  node_modules, tests and docs from context. No credentials embedded.
- Local Compose MongoDB 8.0.24 pinned by digest; single-node afwlocal replica set,
  loopback published ports, healthcheck requires expected setName + writable primary.
  MongoDB/Node tags and manifest digests verified against Docker registry; this is
  NOT an OS/image vulnerability scan or an executed image build.
- New local volume name deliberately does not reuse historical school data.
  No volume deleted, no existing database converted.
- Replica initiation is explicitly opt-in via setup profile, never normal app startup.
  The initializer refuses an unexpected existing set and does not seed or initialize
  application metadata. A single local node with no auth/TLS is NOT production
  infrastructure, HA, failover validation or a safe network deployment.
- Removed broken startup `npm run console seed`. Historical seed command and
  SeedService entrypoints now reject unconditionally, including direct calls;
  no environment flag can accidentally enable them. Old fixture classes remain
  historical source, not a supported provisioning path. Reviewed bootstrap/audit/
  session initialization commands remain separate and unchanged.

### Local usage (instructions only; NOT executed)

Use a new disposable local database; never use a production URI or historical volume.
Set a local JWT_SECRET outside Git. Start MongoDB explicitly, then initialize RS:

```text
docker compose up -d mongo-db
docker compose --profile setup run --rm mongo-rs-init
```

Before starting the application, perform reviewed operator provisioning in the order
specified by ATOMIC_SESSION_ADMISSION_STUDY.md and the audit runbook: organization
bootstrap on an EMPTY database first, then restricted roles/indexes/journals and
session coordinator metadata. Do not auto-run these in entrypoint/healthchecks.
The app must continue failing closed if metadata/topology/permissions are missing.
Operator tools inside a container must use the Compose network URI. Host-only tools
need directConnection=true with localhost for this single-node configuration because
the advertised hostname mongo-db resolves only inside the Compose network.

```text
docker compose up -d nest-app
```

Never use `down -v` on an existing environment. Production topology, auth, ACLs,
TLS, backups, NTP and exclusion of legacy writers remain separately authorized work.

## Baseline audit

npm audit (registry advisory snapshot; counts include transitive/meta vulnerabilities):
64 total = 3 critical / 25 high / 33 moderate / 3 low.
Production-only (`--omit=dev`): 24 = 2 critical / 16 high / 6 moderate.
These are dependency findings, not proof of exploitability of every API path.
No npm audit fix --force is permitted. Major upgrades require specific review.

## Stage 2 — dependency remediation

Baseline → compatible lockfile refresh: 64 → 6 findings (no --force, no major
Nest/Mongoose/ESLint/Jest upgrades). Then reviewed direct Nodemailer migration
and narrowly scoped overrides reduced both full and production audits to ZERO
in the registry snapshot. Audit is not a proof of absence of vulnerabilities.

Direct resolved changes (minimum manifest ranges also raised):

| Dependency | Before | After |
|---|---|---|
| @faker-js/faker | 10.1.0 | 10.6.0 |
| @nestjs/common/core/microservices/platform-express/testing | 11.1.9 | 11.2.8 |
| @nestjs/config | 4.0.2 | 4.0.4 |
| @nestjs/swagger | 11.2.3 | 11.4.7 |
| handlebars | 4.7.8 | 4.7.10 |
| mongoose | 8.20.1 | 8.24.7 |
| nodemailer | 7.0.11 | 10.2.1 |
| @nestjs/cli | 11.0.12 | 11.0.24 |
| @nestjs/schematics | 11.0.9 | 11.1.0 |

Removed obsolete @types/nodemailer 7.0.4: 10.2.1 includes native types.
Transitive patches include jws 3.2.3 (jsonwebtoken signature verification path),
proxy-addr 2.0.8, axios 1.20.0, body-parser 2.4.0, lodash 4.18.1 and qs 6.16.1.
Full production paths, 128 unique GHSA records, assigned CVEs and published patched
boundaries: [EMERGENCY_DEPENDENCY_FINDINGS.md](EMERGENCY_DEPENDENCY_FINDINGS.md).
GitHub advisory identifiers were queried, not guessed. Audit counts include
propagated/meta findings and multiple reports per package.

### Targeted compatibility decisions

- Nest platform-express 11.2.8 still pins vulnerable Multer 2.4.0. Override ONLY
  its multer to 2.5.0 (same major); do not accept audit's suggested Nest downgrade.
  HTTP multipart acceptance/size rejection tested in isolated fixture.
- Swagger 11.4.7 pins js-yaml 5.3.0. Override ONLY its js-yaml to 5.5.0;
  intermediate GHSA-r3ph-w7gj-g6xm (no CVE assigned) also addressed. Actual OpenAPI
  JSON/YAML HTTP generation tested; other js-yaml major lines not forced to 5.
- brace-expansion@^1.1.7 overridden to patched 1.1.21 on its existing major line.
  Revisit these overrides when upstream removes vulnerable pins; never silently
  remove them merely to reduce lockfile churn.
- Nodemailer 7 → 10 is an intentional reviewed major change: 8 renames NoAuth to
  ENOAUTH, 9 validates TLS for fetched remote content by default, 10 requires Node
  >=20 and ships CJS/ESM builds/native TypeScript definitions. Reviewed packaged
  CHANGELOG (8.0.0/9.0.0/10.0.0); application uses root createTransport/sendMail,
  not private paths, SES or error-code comparisons. Existing Gmail provider
  compiles unchanged. Offline stream transport test proves CJS import, built-in
  types, MIME generation and escaped Handlebars output WITHOUT SMTP/email delivery.
  Real Gmail/TLS/credential integration remains untested and is NOT authorized.
- Engine narrowing intentionally rejects Node 25+/npm 12 pending separate review;
  this is a toolchain compatibility boundary, not a claim those lines are unsafe.
- npm ci succeeds with lockfile v3. npm 11.19.1 reports unapproved install scripts
  for @scarf/scarf/unrs-resolver; no blanket allow-list added. Build and tests work
  without approving those scripts. Deprecation warnings for glob 7/inflight remain;
  zero registry audit findings does not make deprecated dependencies maintained.

## Stage 3 — compiled runtime packaging

Review caught a pre-existing build-layout incompatibility: broad TypeScript input
included root .mts configs, emitting dist/src/main.js, while startup expects
dist/main.js. Set build rootDir/include to src; configs/tests are not production
entrypoints. Disable incremental build metadata for production builds: a second
clean build exposed metadata outside dist skipping JS emission after deleteOutDir.
Two consecutive builds/smokes now verify deterministic entrypoint/assets. Nest build
still rewrites source aliases into compiled relative imports.
The template loader also depended on cwd/src and the Nest asset glob omitted
features/. Fixed both: templates ship next to compiled mail code under dist and
resolve relative to __dirname. No need to ship source/env/test files in production.

Added `node test/runtime-packaging.smoke.cjs`: copies dist to a unique temporary
directory WITHOUT src, registers the same helpers as MailModule and renders an
actual packaged template. Inline CSS is stubbed so no remote CSS/network can be
fetched. First smoke attempts correctly exposed build-path mismatch and then a
fixture missing helper registration; corrected before the final passing execution.
A repeated build additionally exposed stale incremental metadata; disabled it and
removed only the generated untracked tsconfig.build.tsbuildinfo.
This is packaging evidence, not a replacement for an actual container startup.

## Final validation status — PARTIAL, review required

| Check | Observed result |
|---|---|
| Node / npm | 24.22.1 / 11.19.1 |
| npm ci (reviewed lockfile, also run without --ignore-scripts) | PASS; 845 installed packages |
| npm audit full before → after | 64 (3 critical/25 high/33 moderate/3 low) → 0 |
| npm audit --omit=dev before → after | 24 (2 critical/16 high/6 moderate) → 0 |
| npm ls --depth=0 and production tree | PASS, no invalid dependency tree |
| npm run lint | PASS |
| npm run build | PASS; dist/main.js and template assets verified |
| npx --no-install tsc --noEmit --incremental false | PASS, including test typechecking |
| npm test -- --runInBand | PASS: 265 tests / 22 suites |
| npm run test:e2e -- --runInBand | PASS: 4 tests / 2 suites, no MongoDB |
| dist-only offline packaging smoke | PASS |
| Separate temporary npm ci --omit=dev --ignore-scripts + dist-only smoke | PASS: 299 installed runtime dependencies; temporary directory removed |
| docker compose config --quiet (dummy JWT only) | PASS; parses config without contacting database/daemon |
| git diff --check | PASS |
| Container builds / image vulnerability scan / production-image boot | PENDING: Docker daemon unavailable |
| Local RS initializer, primary healthcheck, ports, container non-root behavior | PENDING: requires daemon |
| test:sessions / atomic-admission / test:abac and real AppModule/security-root | PENDING: requires dedicated disposable MongoDB replica set |
| audit-operations / session-admission-operations / restricted ACL, crash and concurrency smokes | PENDING: requires dedicated disposable authenticated RS |
| Gmail SMTP/TLS delivery | NOT EXECUTED, no external email authorized |

The existing #4/#5/#6/#16/#17 security policies/transaction protocol were not changed.
Unit regressions pass but real MongoDB validation MUST be repeated with the updated
Mongoose/driver/Nest before acceptance. A single-node local RS does not prove HA,
failover, production TLS/ACL/backups or exclusion of old writers. Do not disable
snapshot/majority transactions or missing-metadata startup checks to make Compose boot.
OS/base-image/npm-runtime vulnerability scanning is NOT covered by npm audit; pinned
image manifests only prove reproducibility, not absence of OS/Node CVEs. Refresh
pins through a new review when newer security releases become necessary.

No real DB access, seed execution, merge, push, PR opening/finalization, deployment,
#18 change or commercial CRUD was performed. Stop here for owner review; do not
interpret zero audit findings as complete security approval or production readiness.
