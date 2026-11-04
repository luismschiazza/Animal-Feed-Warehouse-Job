# PR #27 — temporary S1 adoption for remote CI

On 2026-11-04 the repository owner explicitly approved the temporary S1 policy for the reviewed structural candidate and authorized its application/publication to execute complete remote CI, including mutual TLS on Ubuntu.

The authorization does **not** permit merge, deploy, auto-merge or issue closure. Those require a separate owner decision. No branch-protection settings, subscriptions, monitoring schedules or automatic renewal are enabled by this change.

## Exact scope remains unchanged

- Reviewed structural candidate content identity: `aed78860416b984455983b5514d5baec774eba040adb292e11d009cac7ccf82f` (16-file delivery before approval annotations).
- S1: six exact development packages/versions/paths, one GHSA-gcqx-w48m-w2h4, production findings/reachability rejected; complete lock/findings and official-definition fingerprints fixed.
- Original review timestamp: `2026-11-03T22:09:20.702Z`.
- Original expiry retained: **`2026-11-10T22:09:20.702Z`**. Approval does not renew it.
- Official observation remains limited to one hour; HTTP failures or changed definitions/findings block. No cached fallback, broad severity waiver or automatic fingerprint refresh.
- Preserve raw npm JSONs and real exit codes. Expected disputed state is six LOW/full exit1 and production0/exit0, not a clean full audit. The live remote execution must establish its actual result.
- Only adoption/status/warning annotations and this record differ from the reviewed candidate; test expectations reflect explicit owner approval without relaxing assertions.

The versioned producer/workflow trust model is the owner-approved S1 model, not independent signed authorization of V4. Earlier checks found no classic branch protection/applicable main rules; this task does not claim to provision them.

## Overrides and follow-up

`PR_27_DEPENDENCY_FOLLOWUP.md` records eight narrowly scoped overrides/nine out-of-parent-range edges, exact paths/versions, official sources, last observations and per-edge removal conditions/tests. No compatible stable consumer release was available at review. Do not remove or broaden these overrides without new evidence. This approval supersedes that document's historical "proposal awaiting adoption" wording only for this exact temporary S1 adoption; all technical restrictions remain.

Complete remote Security CI must verify npm tree, real production/full audits, all policy tests, lint/types/build/unit/E2E/Babel coverage/assets, replica-set HTTP/session/atomic-admission/ABAC/AppModule/CLI, authenticated ACL/transactions/retirement/exporter, and native Ubuntu UID999 mutual TLS with negative cases. A failed or skipped step is not certification. Passing these checks is not production/OS/operational clearance.
