'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { performance } = require('node:perf_hooks');
const { createNvdCapture, POLICY, retryAfter, transientNetwork } = require('./audit-nvd-source.cjs');
const { URLS, sha, fetchOfficial } = require('./audit-official-sources.cjs');
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/discrepancy/official.json'))).nvd;
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name)));
const ok = () => new Response(JSON.stringify(fixture()), { headers: { 'content-type': 'application/json; charset=utf-8' } });
const errorResponse = (status = 503, headers = {}) => new Response('<html>SIMULATED service unavailable</html>', { status, headers: { 'content-type': 'text/html', ...headers } });
function coded(code) { return new TypeError('SIMULATED fetch failure', { cause: Object.assign(Error('SIMULATED network'), { code }) }); }
async function scenario(actions, run, changes = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-nvd-test-'));
  let ms = 0, n = 0;
  const calls = [], waits = [], logs = [], signals = [];
  const runtime = { monotonic: () => ms, wall: () => Date.parse('2026-11-14T04:00:00.000Z') + ms,
    timeoutSignal: delay => { signals.push(delay); return new AbortController().signal; }, jitter: () => 0,
    sleep: async (delay, signal) => { assert.ok(signal instanceof AbortSignal); waits.push(delay); ms += delay; },
    log: line => logs.push(line), fetch: async (url, options) => {
      assert.equal(url, URLS.nvd); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(options.headers, { 'User-Agent': 'AFW-review-proposal', Accept: 'application/json' });
      calls.push(ms); const action = actions[n++]; assert.ok(action, 'unexpected extra fetch / retry');
      return typeof action === 'function' ? action({ advance: delay => { ms += delay; } }) : action;
    }, ...changes };
  try { await run({ dir, calls, waits, logs, signals, capture: createNvdCapture(runtime), advance: delay => { ms += delay; } }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('NVD limits are fixed reviewed production constants, not CLI/environment selection', () => {
  assert.deepEqual(POLICY, { timeoutMs: 30000, maxAttempts: 3, totalMs: 120000, baseWaitMs: 6000, maxJitterMs: 1000, maxBytes: 1048576 });
  assert.ok(Object.isFrozen(POLICY));
});
test('immediate success saves exact bytes/integrity, one attempt, no waits; refuses evidence reuse', async () => scenario([ok()], async t => {
  const result = await t.capture(t.dir); assert.deepEqual(result.data, fixture()); assert.equal(t.calls.length, 1); assert.deepEqual(t.waits, []);
  assert.deepEqual(t.signals, [120000, 30000]);
  const raw = fs.readFileSync(path.join(t.dir, 'nvd.body')), receipt = read(t.dir, 'nvd.receipt.json');
  assert.equal(receipt.rawSHA256, sha(raw)); assert.equal(result.rawSHA256, sha(raw)); assert.equal(receipt.status, 200);
  assert.deepEqual(raw, fs.readFileSync(path.join(t.dir, 'nvd.attempt-01.body')));
  assert.equal(read(t.dir, 'nvd.attempts.json').outcome, 'success');
  await assert.rejects(t.capture(t.dir), /refuse-evidence-overwrite/); assert.equal(t.calls.length, 1);
}));
for (const status of [408, 429, 500, 502, 503, 504, 520, 599]) test(`transient HTTP${status} (HTML error representation, never data) recovers with fresh200`, async () => scenario([errorResponse(status), ok()], async t => {
  await t.capture(t.dir); assert.deepEqual(t.waits, [6000]); assert.equal(t.calls.length, 2);
  assert.equal(read(t.dir, 'nvd.attempt-01.receipt.json').status, status);
  assert.equal(read(t.dir, 'nvd.attempt-01.failure.json').incomplete, false);
  assert.equal(read(t.dir, 'nvd.receipt.json').status, 200);
  assert.match(fs.readFileSync(path.join(t.dir, 'nvd.attempt-01.body'), 'utf8'), /SIMULATED/);
  assert.deepEqual(read(t.dir, 'nvd.body'), fixture()); assert.match(t.logs.join('\n'), /retry/);
}));
test('three attempts use progressive6/12s waits and preserve every exhausted HTTP failure, no success/fallback', async () => scenario([errorResponse(), errorResponse(), errorResponse()], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-retry-exhausted.*attempts=3\/3.*HTTP503/);
  assert.deepEqual(t.calls, [0, 6000, 18000]); assert.deepEqual(t.waits, [6000, 12000]);
  assert.equal(read(t.dir, 'nvd.attempts.json').attempts.length, 3);
  assert.equal(read(t.dir, 'nvd.failure.json').status, 503);
  for (let i = 1; i <= 3; i++) assert.equal(read(t.dir, `nvd.attempt-0${i}.receipt.json`).status, 503);
  assert.ok(!fs.existsSync(path.join(t.dir, 'nvd.body'))); assert.ok(!fs.existsSync(path.join(t.dir, 'bundle.json')));
}));
test('bounded jitter is added to each progressive floor', async () => scenario([errorResponse(), errorResponse(), ok()], async t => {
  await t.capture(t.dir); assert.deepEqual(t.waits, [7000, 13000]);
}, { jitter: () => 1000 }));
for (const status of [201, 204, 301, 400, 401, 403, 404, 405, 410, 501, 505, 511, 526]) test(`permanent HTTP${status} never retries`, async () => scenario([status === 204 ? new Response(null, { status }) : errorResponse(status)], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-http-permanent/); assert.equal(t.calls.length, 1); assert.deepEqual(t.waits, []);
}));
for (const code of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']) test(`known transient network ${code} recovers and preserves structured code`, async () => scenario([() => { throw coded(code); }, ok()], async t => {
  await t.capture(t.dir); assert.equal(t.calls.length, 2); assert.deepEqual(t.waits, [6000]);
  assert.ok(read(t.dir, 'nvd.attempt-01.failure.json').transportCodes.includes(code));
}));
for (const code of ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ENOTFOUND', 'ERR_INVALID_URL', 'UNKNOWN', undefined]) test(`permanent/unknown network ${code} never retries`, async () => scenario([() => { throw coded(code); }], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-network-permanent/); assert.equal(t.calls.length, 1); assert.deepEqual(t.waits, []);
}));
test('nested AggregateError network classification does not hide TLS/permanent errors or cycles', () => {
  assert.equal(transientNetwork(new AggregateError([coded('ECONNRESET'), coded('ETIMEDOUT')])).retryable, true);
  assert.equal(transientNetwork(new AggregateError([coded('ECONNRESET'), coded('CERT_HAS_EXPIRED')])).retryable, false);
  assert.equal(transientNetwork(new AggregateError([coded('ECONNRESET'), Error('unknown')])).retryable, false);
  const cycle = Error('cycle'); cycle.cause = cycle; assert.equal(transientNetwork(cycle).retryable, false);
});
test('timeout recovery, body + request remain under30s, request budgets do not restart total120s', async () => scenario([
  ({ advance }) => { advance(30000); throw new DOMException('SIMULATED timeout', 'TimeoutError'); },
  ({ advance }) => { advance(30000); throw new DOMException('SIMULATED timeout', 'TimeoutError'); },
  ({ advance }) => { advance(29999); return ok(); },
], async t => {
  await t.capture(t.dir); assert.deepEqual(t.calls, [0, 36000, 78000]); assert.deepEqual(t.signals, [120000, 30000, 30000, 30000]);
  assert.equal(read(t.dir, 'nvd.attempts.json').elapsedMs, 107999);
}));
test('three timeouts exhaust at108s rather than restarting120s per attempt', async () => scenario(Array.from({ length: 3 }, () => ({ advance }) => { advance(30000); throw new DOMException('SIMULATED', 'TimeoutError'); }), async t => {
  await assert.rejects(t.capture(t.dir), /nvd-retry-exhausted/); assert.equal(read(t.dir, 'nvd.attempts.json').elapsedMs, 108000); assert.equal(t.calls.length, 3);
}));
const base = Date.parse('2026-11-14T04:00:00.000Z');
for (const [value, expected, kind] of [[null, 0, 'absent'], ['0', 0, 'seconds'], ['12', 12000, 'seconds'], [' 12 ', 12000, 'seconds'], ['-1', 0, 'invalid'], ['1.5', 0, 'invalid'], ['1e2', 0, 'invalid'], ['NaN', 0, 'invalid'], ['nonsense', 0, 'invalid'], ['Wed, 21 Oct 2015 07:28:00 GMT', 0, 'date'], ['Sat, 14 Nov 2026 04:00:20 GMT', 20000, 'date'], ['Saturday, 14-Nov-26 04:00:20 GMT', 20000, 'date'], ['Sat Nov 14 04:00:20 2026', 20000, 'date']]) test(`Retry-After strict parsing ${value}`, () => {
  assert.deepEqual(retryAfter(value, base), { kind, ms: expected });
});
for (const value of ['20', 'Sat, 14 Nov 2026 04:00:20 GMT']) test(`Retry-After ${value} is respected, not retried early`, async () => scenario([errorResponse(429, { 'retry-after': value }), ok()], async t => {
  await t.capture(t.dir); assert.deepEqual(t.waits, [20000]);
}));
for (const value of ['999999999999999999999999', '121', 'Sun, 15 Nov 2026 04:00:00 GMT']) test(`Retry-After ${value} exceeding budget fails without truncating wait or retrying early`, async () => scenario([errorResponse(503, { 'retry-after': value })], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-retry-after-exceeds-budget/); assert.deepEqual(t.waits, []); assert.equal(t.calls.length, 1);
}));
test('invalid Retry-After uses conservative progressive floor and records invalid', async () => scenario([errorResponse(429, { 'retry-after': '-1' }), ok()], async t => {
  await t.capture(t.dir); assert.deepEqual(t.waits, [6000]); assert.equal(read(t.dir, 'nvd.attempts.json').attempts[0].retryAfter.kind, 'invalid');
}));
test('last attempt timeout is clipped to remaining total budget, late JSON cannot pass', async () => scenario([
  ({ advance }) => { advance(30000); return errorResponse(503, { 'retry-after': '50' }); },
  ({ advance }) => { advance(30000); return errorResponse(); },
], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-budget-exhausted/); assert.deepEqual(t.calls, [0, 80000]); assert.equal(t.calls.length, 2);
}));
test('last request uses only remaining20s after long compliant Retry-After and30s prior request', async () => scenario([
  ({ advance }) => { advance(30000); return errorResponse(429, { 'retry-after': '70' }); },
  ({ advance }) => { advance(20000); return ok(); },
], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-budget-exhausted/); assert.deepEqual(t.signals, [120000, 30000, 20000]);
  assert.ok(!fs.existsSync(path.join(t.dir, 'nvd.body')));
}));
test('sleep consuming deadline aborts operation, no request starts afterwards', async () => scenario([errorResponse()], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-budget-exhausted/); assert.equal(t.calls.length, 1);
}, { sleep: async () => { throw new DOMException('SIMULATED budget sleep abort', 'AbortError'); } }));
for (const [name, body, mime, expected] of [
  ['HTML200', '<html>maintenance</html>', 'text/html', /nvd-content-type/],
  ['HTML disguised asJSON', '<html>maintenance</html>', 'application/json', /nvd-invalid-json/],
  ['malformedJSON', '{"totalResults":', 'application/json', /nvd-invalid-json/],
  ['wrongMIME', JSON.stringify(fixture()), 'text/plain', /nvd-content-type/],
  ['JSONnull', 'null', 'application/json', /nvd-incompatible-data/],
  ['emptyresults', '{"totalResults":0,"vulnerabilities":[]}', 'application/json', /nvd-incompatible-data/],
]) test(`${name} fails permanently without retry or bundle`, async () => scenario([new Response(body, { headers: { 'content-type': mime } })], async t => {
  await assert.rejects(t.capture(t.dir), expected); assert.equal(t.calls.length, 1); assert.deepEqual(t.waits, []);
  assert.ok(fs.existsSync(path.join(t.dir, 'nvd.attempt-01.body'))); assert.ok(!fs.existsSync(path.join(t.dir, 'nvd.body')));
}));
for (const [name, change] of [
  ['wrongCVE', f => { f.vulnerabilities[0].cve.id = 'CVE-0000-0000'; }], ['wrongformat', f => { f.format = 'other'; }],
  ['wrongversion', f => { f.version = '9.0'; }], ['missingstatus', f => { delete f.vulnerabilities[0].cve.vulnStatus; }],
  ['duplicatedrecord', f => { f.vulnerabilities.push(f.vulnerabilities[0]); }],
]) test(`incompatible ${name} never retries or refreshes fingerprints`, async () => { const f = fixture(); change(f); await scenario([new Response(JSON.stringify(f), { headers: { 'content-type': 'application/json' } })], async t => {
  await assert.rejects(t.capture(t.dir), /nvd-incompatible-data/); assert.equal(t.calls.length, 1);
}); });
test('over1MiB preserves bounded explicitly partial prefix; never retries', async () => scenario([new Response('x'.repeat(1048577))], async t => {
  await assert.rejects(t.capture(t.dir), /official-response-too-large/); assert.equal(t.calls.length, 1);
  assert.equal(fs.statSync(path.join(t.dir, 'nvd.attempt-01.partial-body')).size, 1048576);
  const failure = read(t.dir, 'nvd.attempt-01.failure.json'); assert.equal(failure.incomplete, true); assert.equal(failure.bytesRead, 1048577);
  assert.ok(!fs.existsSync(path.join(t.dir, 'nvd.attempt-01.body')));
}));
test('transient reset during body preserves incomplete prefix and recovers with fresh JSON', async () => {
  let readCount = 0;
  const stream = new ReadableStream({ pull(c) { if (readCount++ === 0) c.enqueue(Buffer.from('{"partial":')); else c.error(coded('ECONNRESET')); } });
  await scenario([new Response(stream, { headers: { 'content-type': 'application/json' } }), ok()], async t => {
    await t.capture(t.dir); assert.equal(read(t.dir, 'nvd.attempt-01.failure.json').incomplete, true);
    assert.equal(fs.readFileSync(path.join(t.dir, 'nvd.attempt-01.partial-body'), 'utf8'), '{"partial":'); assert.equal(t.calls.length, 2);
  });
});
for (const [status, mime, expected] of [[403, 'text/html', /nvd-http-permanent HTTP403/],
  [501, 'application/json', /nvd-http-permanent HTTP501/], [200, 'text/html', /nvd-content-type/]]) {
  test(`HTTP${status} ${mime}: a broken body does not make a known permanent response retryable`, async () => {
    let count = 0;
    const body = new ReadableStream({ pull(c) { if (count++ === 0) c.enqueue(Buffer.from('partial')); else c.error(coded('ECONNRESET')); } });
    await scenario([new Response(body, { status, headers: { 'content-type': mime } })], async t => {
      await assert.rejects(t.capture(t.dir), expected);
      assert.equal(t.calls.length, 1); assert.deepEqual(t.waits, []);
      const attempt = read(t.dir, 'nvd.attempt-01.failure.json');
      assert.equal(attempt.incomplete, true); assert.equal(attempt.retryable, false);
      assert.ok(attempt.transportCodes.includes('ECONNRESET'));
      assert.equal(fs.readFileSync(path.join(t.dir, 'nvd.attempt-01.partial-body'), 'utf8'), 'partial');
    });
  });
}
test('a valid response delivered after the per-attempt deadline must not win the timer race', async () => scenario([
  ({ advance }) => { advance(30001); return ok(); }, ok(),
], async t => {
  await t.capture(t.dir);
  assert.deepEqual(t.calls, [0, 36001]);
  assert.equal(read(t.dir, 'nvd.attempt-01.failure.json').error, 'nvd-attempt-timeout');
  assert.equal(read(t.dir, 'nvd.attempt-01.failure.json').incomplete, false);
  assert.equal(read(t.dir, 'nvd.attempts.json').attempts[1].outcome, 'success');
}));
test('terminal transport failure identifies the transport code without printing arbitrary error text', async () => scenario([() => { throw coded('ENOTFOUND'); }], async t => {
  await assert.rejects(t.capture(t.dir), error => /nvd-network-permanent.*ENOTFOUND/.test(error.message) && !/SIMULATED/.test(error.message));
}));
test('changed valid NVD record is captured verbatim, never retried until matching an old fingerprint', async () => {
  const f = fixture(); f.vulnerabilities[0].cve.vulnStatus = 'Analyzed';
  await scenario([new Response(JSON.stringify(f), { headers: { 'content-type': 'application/json' } })], async t => {
    assert.deepEqual((await t.capture(t.dir)).data, f); assert.equal(t.calls.length, 1);
  }); // Original classifier/preflight still rejects changed status/hash; no policy acceptance here.
});
test('producer refuses to emit a bundle or consult GHSA after incompatible NVD data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-nvd-producer-'));
  const destination = path.join(root, 'official');
  const originalFetch = global.fetch, calls = [];
  try {
    global.fetch = async url => {
      calls.push(url);
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };
    await assert.rejects(fetchOfficial(destination), /nvd-incompatible-data/);
    assert.deepEqual(calls, [URLS.cve, URLS.nvd]);
    assert.ok(!fs.existsSync(path.join(destination, 'bundle.json')));
    assert.ok(fs.existsSync(path.join(destination, 'nvd.attempt-01.body')));
  } finally { global.fetch = originalFetch; fs.rmSync(root, { recursive: true, force: true }); }
});
test('CI allowlists only the fixed attempt numbers, suffixes and summary without copying links or nested data', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/security-ci.yml'), 'utf8');
  assert.ok(workflow.includes("suffixes = ('.body', '.receipt.json', '.failure.json', '.partial-body')"));
  assert.ok(workflow.includes("{'bundle.json', 'nvd.attempts.json'}"));
  assert.ok(workflow.includes("{f'nvd.attempt-{attempt:02d}' + suffix for attempt in range(1, 4) for suffix in suffixes}"));
  assert.match(workflow, /for file in sources\.iterdir\(\):\s+if file\.name in allowed and file\.is_file\(\) and not file\.is_symlink\(\):/);
});
test('real Node fetch aborts stalled headers AND stalled body on loopback under scaled immutable deadlines (test runtime only)', { timeout: 10000 }, async () => {
  for (const body of [false, true]) {
    let sockets = 0;
    const server = http.createServer((req, res) => { sockets++; req.on('close', () => sockets--); if (body) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"partial":'); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afw-nvd-abort-')), start = performance.now();
    try {
      const capture = createNvdCapture({ fetch: (_url, options) => fetch(`http://127.0.0.1:${server.address().port}`, options),
        monotonic: () => performance.now() * 100, timeoutSignal: ms => AbortSignal.timeout(Math.max(1, Math.floor(ms / 100))),
        wall: Date.now, jitter: () => 0, log: () => {}, sleep: (ms, signal) => require('node:timers/promises').setTimeout(ms / 100, undefined, { signal }) });
      await assert.rejects(capture(dir), /nvd-(retry-exhausted|budget-exhausted)/);
      assert.ok(performance.now() - start < 2500, 'scaled real native fetch operation must terminate');
      assert.ok(read(dir, 'nvd.attempts.json').attempts.length <= 3); assert.ok(!fs.existsSync(path.join(dir, 'nvd.body')));
      if (body) assert.equal(read(dir, 'nvd.attempt-01.failure.json').incomplete, true);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
    assert.equal(server.listening, false); assert.ok(sockets >= 0);
  }
});
