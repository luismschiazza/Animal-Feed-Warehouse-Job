'use strict';
// Fixed public GET only. No CLI/env selector, cache, alternate source or approval/clock override.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-93753';
const POLICY = Object.freeze({ timeoutMs: 30000, maxAttempts: 3, totalMs: 120000, baseWaitMs: 6000, maxJitterMs: 1000, maxBytes: 1048576 });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);
function transientNetwork(error) {
  const codes = [], seen = new Set();
  function visit(e) {
    if (!e || typeof e !== 'object' || seen.has(e) || seen.size >= 16) { codes.push('UNKNOWN'); return false; }
    seen.add(e);
    let known = true, found = false;
    if (typeof e.code === 'string') {
      codes.push(/^[A-Z][A-Z0-9_]{0,63}$/.test(e.code) ? e.code : 'UNKNOWN');
      known = networkCodes.has(e.code); found = true;
    }
    if (e.name === 'TimeoutError') { codes.push('TimeoutError'); found = true; }
    if (e.cause) { known = visit(e.cause) && known; found = true; }
    if (e instanceof AggregateError) {
      if (!e.errors.length) known = false;
      for (const nested of e.errors) known = visit(nested) && known;
      found = true;
    }
    if (!found) { codes.push('UNKNOWN'); return false; }
    return known;
  }
  return { retryable: visit(error), codes: [...new Set(codes)] };
}
function retryAfter(value, now) {
  if (value === null) return { kind: 'absent', ms: 0 };
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return { kind: 'seconds', ms: Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000 ? seconds * 1000 : Infinity };
  }
  // HTTP-date only (all three RFC9110 forms); do not let Date.parse accept "1e2", negative or fractional seconds as dates.
  const date = /^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/;
  // asctime has no explicit zone but HTTP-date is always UTC, never the host's local TZ.
  const parsed = date.test(text) ? Date.parse(text.endsWith('GMT') ? text : text + ' GMT') : NaN;
  return Number.isFinite(parsed) ? { kind: 'date', ms: Math.max(0, parsed - now) } : { kind: 'invalid', ms: 0 };
}
const failure = (reason, retryable = false) => Object.assign(new Error(reason), { reason, retryable });
const transientStatus = status => status === 408 || status === 429 || (status >= 500 && status <= 599 && ![501, 505, 511, 526].includes(status));
function responseFailure(response) {
  if (response.status !== 200) {
    const retryable = transientStatus(response.status);
    return failure(`nvd-http-${retryable ? 'transient' : 'permanent'} HTTP${response.status}`, retryable);
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) return failure('nvd-content-type');
  return null;
}
function compatible(data) {
  return data && data.format === 'NVD_CVE' && data.version === '2.0' && data.totalResults === 1
    && Array.isArray(data.vulnerabilities) && data.vulnerabilities.length === 1
    && data.vulnerabilities[0]?.cve?.id === 'CVE-2026-93753'
    && typeof data.vulnerabilities[0].cve.vulnStatus === 'string' && data.vulnerabilities[0].cve.vulnStatus.length > 0;
}
function createNvdCapture(runtime = {}) {
  // Dependency injection is a deterministic test seam, not a production input. Production below always uses reviewed constants/defaults.
  const rt = { fetch: (...args) => fetch(...args), monotonic: () => performance.now(), wall: () => Date.now(),
    timeoutSignal: ms => AbortSignal.timeout(ms), sleep: (ms, signal) => sleep(ms, undefined, { signal }),
    jitter: () => crypto.randomInt(POLICY.maxJitterMs + 1), log: line => console.error(line), ...runtime };
  return async function captureNvd(evidenceDir) {
    if (fs.readdirSync(evidenceDir).some(name => name.startsWith('nvd.')))
      throw Error('AUDIT_POLICY_REJECTED: refuse-evidence-overwrite');
    const started = rt.monotonic(), deadline = started + POLICY.totalMs, budgetSignal = rt.timeoutSignal(POLICY.totalMs);
    const journal = { url: NVD_URL, startedAt: new Date(rt.wall()).toISOString(), policy: POLICY, attempts: [] };
    const remaining = () => Math.max(0, deadline - rt.monotonic());
    const elapsed = () => Math.max(0, Math.round(rt.monotonic() - started));
    const write = (name, data) => fs.writeFileSync(path.join(evidenceDir, name), data, { flag: 'wx' });
    const json = (name, data) => write(name, JSON.stringify(data, null, 2));
    function finish(reason, last) {
      journal.outcome = 'failure'; journal.reason = reason; journal.endedAt = new Date(rt.wall()).toISOString(); journal.elapsedMs = elapsed();
      json('nvd.attempts.json', journal);
      json('nvd.failure.json', { ...last, error: reason, endedAt: journal.endedAt, elapsedMs: journal.elapsedMs,
        attempts: journal.attempts.length, journal: 'nvd.attempts.json' });
      const codes = last.transportCodes?.length ? ` [${last.transportCodes.join(',')}]` : '';
      throw Error(`AUDIT_POLICY_REJECTED: ${reason} (attempts=${journal.attempts.length}/${POLICY.maxAttempts} elapsedMs=${journal.elapsedMs} last=${last.error}${codes}; evidence=nvd.attempts.json)`);
    }
    for (let number = 1; number <= POLICY.maxAttempts; number++) {
      if (!remaining() || budgetSignal.aborted) finish('nvd-budget-exhausted', { error: 'deadline before request', status: null, incomplete: true });
      const timeoutMs = Math.max(1, Math.min(POLICY.timeoutMs, Math.floor(remaining()))), prefix = `nvd.attempt-${String(number).padStart(2, '0')}`;
      const attemptDeadline = rt.monotonic() + timeoutMs;
      const signal = AbortSignal.any([budgetSignal, rt.timeoutSignal(timeoutMs)]);
      const attempt = { number, startedAt: new Date(rt.wall()).toISOString(), timeoutMs, status: null };
      journal.attempts.push(attempt);
      let response, httpError, complete = false, size = 0;
      const chunks = [];
      try {
        response = await rt.fetch(NVD_URL, { redirect: 'error', signal, headers: { 'User-Agent': 'AFW-review-proposal', Accept: 'application/json' } });
        attempt.status = response.status;
        httpError = responseFailure(response);
        for await (const bytes of response.body || []) {
          chunks.push(bytes.subarray(0, Math.max(0, POLICY.maxBytes - size))); size += bytes.length;
          if (size > POLICY.maxBytes) throw failure('official-response-too-large');
        }
        const raw = Buffer.concat(chunks);
        complete = true;
        const receipt = { url: NVD_URL, startedAt: attempt.startedAt, observedAt: new Date(rt.wall()).toISOString(), status: response.status,
          headers: Object.fromEntries(response.headers), rawSHA256: sha(raw) };
        // Preserve even HTML/error representations BEFORE interpreting; HTTP errors are never parsed as NVD data.
        write(prefix + '.body', raw); json(prefix + '.receipt.json', receipt);
        if (!remaining() || budgetSignal.aborted) throw failure('nvd-budget-exhausted');
        if (httpError) throw httpError;
        let data;
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw failure('nvd-invalid-json'); }
        if (!compatible(data)) throw failure('nvd-incompatible-data');
        if (!remaining() || budgetSignal.aborted) throw failure('nvd-budget-exhausted');
        if (signal.aborted || rt.monotonic() >= attemptDeadline) throw failure('nvd-attempt-timeout', true);
        attempt.outcome = 'success'; attempt.endedAt = new Date(rt.wall()).toISOString(); attempt.bytesRead = size; attempt.rawSHA256 = sha(raw);
        journal.outcome = 'success'; journal.endedAt = attempt.endedAt; journal.elapsedMs = elapsed();
        // Only this invocation's fresh validated winning response can become the canonical capture. Never read prior attempts as fallback.
        write('nvd.body', raw); json('nvd.receipt.json', receipt); json('nvd.attempts.json', journal);
        rt.log(`NVD attempt ${number}/${POLICY.maxAttempts}: HTTP200 valid JSON; elapsedMs=${elapsed()}; evidence=${prefix}.receipt.json`);
        return { data, rawSHA256: sha(raw), status: 200 };
      } catch (error) {
        const network = transientNetwork(error);
        const exhausted = !remaining() || budgetSignal.aborted || error.reason === 'nvd-budget-exhausted';
        // A body reset/timeout must not override an already-known permanent HTTP/MIME error.
        const classified = error.reason ? error : (!complete && httpError && !httpError.retryable ? httpError : null);
        const reason = exhausted ? 'nvd-budget-exhausted' : (classified?.reason || (network.retryable ? 'nvd-network-transient' : 'nvd-network-permanent'));
        const retryable = !exhausted && (classified ? classified.retryable : network.retryable);
        const after = retryAfter(response?.headers.get('retry-after') ?? null, rt.wall());
        let waitMs = 0, final = null;
        if (!retryable) final = reason;
        else if (number === POLICY.maxAttempts) final = 'nvd-retry-exhausted';
        else {
          const jitter = rt.jitter();
          if (!Number.isInteger(jitter) || jitter < 0 || jitter > POLICY.maxJitterMs) final = 'nvd-invalid-runtime-jitter';
          else {
            waitMs = Math.max(POLICY.baseWaitMs * 2 ** (number - 1) + jitter, after.ms);
            // Must honor the entire Retry-After and leave time to start a request; never cap it and retry early.
            if (waitMs >= remaining()) final = after.ms >= remaining() ? 'nvd-retry-after-exceeds-budget' : 'nvd-budget-exhausted';
          }
        }
        if (!complete && chunks.length) write(prefix + '.partial-body', Buffer.concat(chunks));
        const record = { url: NVD_URL, startedAt: attempt.startedAt, endedAt: new Date(rt.wall()).toISOString(), status: response?.status ?? null,
          headers: response ? Object.fromEntries(response.headers) : null, bytesRead: size, incomplete: !complete, error: reason,
          transportCodes: error.reason ? [] : network.codes, retryable, nextWaitMs: final ? null : waitMs,
          retryAfter: { ...after, ms: Number.isFinite(after.ms) ? after.ms : null, exceedsNumericRange: !Number.isFinite(after.ms) }, elapsedMs: elapsed(),
          ...(chunks.length && !complete ? { partialSHA256: sha(Buffer.concat(chunks)) } : {}) };
        json(prefix + '.failure.json', record);
        Object.assign(attempt, record, { outcome: 'failure' });
        if (final) finish(final, record);
        rt.log(`NVD attempt ${number}/${POLICY.maxAttempts}: ${reason}${network.codes.length && !error.reason ? ' [' + network.codes.join(',') + ']' : ''}; retry in ${waitMs}ms; remainingBudgetMs=${Math.floor(remaining())}; evidence=${prefix}.failure.json`);
        try { await rt.sleep(waitMs, budgetSignal); }
        catch (waitError) { finish(waitError.name === 'AbortError' || waitError.name === 'TimeoutError' ? 'nvd-budget-exhausted' : 'nvd-backoff-failed', record); }
      }
    }
  };
}
const captureNvd = createNvdCapture();
module.exports = { captureNvd, createNvdCapture, POLICY, retryAfter, transientNetwork, NVD_URL };
