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

## Validation status

Stage 1: lint/build and Compose config syntax validation executed without daemon.
Unit tests include seed-denial tests with no database/mail dependencies.
Docker daemon unavailable at preflight: image build/startup/healthcheck/replica-set
behavior and all MongoDB integration/ACL/crash/concurrency smokes remain PENDING.
No complete security approval or production readiness claimed.
