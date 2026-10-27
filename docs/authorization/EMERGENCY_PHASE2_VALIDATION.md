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

`CONTAINER_TEST_IMAGE=<explicit-local-image> node test/production-container.smoke.cjs`
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

Results, decisions and residual findings are recorded below after scans and complete
regression. Zero npm audit findings is not image/SO/toolchain vulnerability clearance.
No production approval without owner review.
