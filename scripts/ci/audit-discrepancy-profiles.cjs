'use strict';
// Source-controlled owner decision only. No policy file/approval/clock override from CLI or env.
// This is a proposed gate, not independent cryptographic proof of owner identity.
const { check, digest } = require('./audit-official-sources.cjs');
const { PACKAGES } = require('./audit-discrepancy-scope.cjs');
const MAX_DURATION_MS = 72 * 3600000;
const decisionText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024;
function selectProfile(s1, candidate, now) {
  check(candidate?.schema === 1 && candidate.id === 'S2' && candidate.replacesExpiredProfile === 'S1'
    && ['PENDING_OWNER_APPROVAL', 'APPROVED_TEMPORARY_BY_OWNER', 'REVOKED'].includes(candidate.status), 'invalid-s2-profile');
  if (candidate.status === 'PENDING_OWNER_APPROVAL') {
    check(candidate.approval === null, 'pending-s2-must-not-claim-approval');
    return s1; // Original S1 deadline remains authoritative, including its expired rejection.
  }
  if (candidate.status === 'REVOKED') return s1;
  const approval = candidate.approval;
  check(approval && decisionText(approval.approvedBy) && decisionText(approval.decisionReference), 's2-owner-approval-required');
  const proposed = Date.parse(candidate.proposedAt), reviewed = Date.parse(candidate.reviewedAt);
  const expires = Date.parse(candidate.expiresAt), approved = Date.parse(approval.approvedAt);
  check(Number.isFinite(now) && Number.isFinite(proposed) && reviewed === proposed && Number.isFinite(expires)
    && candidate.maxDurationHours === 72 && expires - proposed === MAX_DURATION_MS, 'invalid-s2-fixed-window');
  check(proposed > Date.parse(s1.expiresAt), 'invalid-s2-original-expiry');
  // Historical S1 tests/replays retain their original window; S2 cannot backdate authorization.
  if (now < proposed) return s1;
  check(now <= expires, 'review-expired-or-future');
  check(Number.isFinite(approved) && approved >= proposed && approved <= now && approved < expires, 'invalid-s2-owner-decision-time');
  // No new advisories, versions, paths, findings or record refresh: exactly the previously reviewed pins.
  check(candidate.packages !== undefined && digest(candidate.packages) === digest(PACKAGES), 'changed-s2-package-scope');
  for (const key of ['advisory', 'cve', 'records', 'findings', 'lock', 'payload']) {
    check(candidate[key] !== undefined && digest(candidate[key]) === digest(s1[key]), 'changed-s2-reviewed-pins');
  }
  return candidate;
}
module.exports = { selectProfile, MAX_DURATION_MS };
