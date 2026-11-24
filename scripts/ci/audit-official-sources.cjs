'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const { captureNvd, NVD_URL } = require('./audit-nvd-source.cjs');
const URLS=Object.freeze({cve:'https://cveawg.mitre.org/api/cve/CVE-2026-93753',nvd:NVD_URL,ghsa:'https://api.github.com/advisories/GHSA-gcqx-w48m-w2h4'});
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=v=>sha(canonical(v));
const check=(condition,code)=>{if(!condition)throw Error('AUDIT_POLICY_REJECTED: '+code);};
async function fetchOfficial(evidenceDir, { githubToken } = {}) {
  check(githubToken === undefined || (typeof githubToken === 'string' && /^ghs_[A-Za-z0-9_.~-]{16,2048}(?![\s\S])/.test(githubToken)), 'invalid-ghsa-credential');
  check(!fs.existsSync(evidenceDir), 'refuse-evidence-overwrite');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const bundle = { observedAt: new Date().toISOString(), receipts: {} };
  for (const [name, url] of Object.entries(URLS)) {
    if (name === 'nvd') {
      const captured = await captureNvd(evidenceDir);
      bundle.nvd = captured.data;
      bundle.receipts.nvd = { url, status: 200, sha256: digest(captured.data), rawSHA256: captured.rawSHA256 };
      continue;
    }
    const startedAt = new Date().toISOString();
    let response, size = 0;
    const chunks = [];
    // Only the fixed GitHub advisory URL can receive the temporary installation token.
    const token = name === 'ghsa' ? githubToken : undefined;
    const headers = { 'User-Agent': 'AFW-review-proposal', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const reflected = value => Boolean(token && (Buffer.isBuffer(value) ? value : Buffer.from(String(value))).includes(token));
    const responseHeaders = () => response ? Object.fromEntries(response.headers) : null;
    try {
      response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers });
      check(!reflected(JSON.stringify(responseHeaders())), 'ghsa-credential-reflected');
      for await (const bytes of response.body) {
        const allowed = Math.max(0, 1048576 - size);
        chunks.push(bytes.subarray(0, allowed)); size += bytes.length;
        check(size <= 1048576, 'official-response-too-large');
      }
      const raw = Buffer.concat(chunks);
      check(!reflected(raw), 'ghsa-credential-reflected');
      // Save responses BEFORE interpreting status/JSON, including HTTP errors.
      fs.writeFileSync(path.join(evidenceDir, `${name}.body`), raw, { flag: 'wx' });
      fs.writeFileSync(path.join(evidenceDir, `${name}.receipt.json`), JSON.stringify({ url, startedAt,
        observedAt: new Date().toISOString(), status: response.status, headers: Object.fromEntries(response.headers), rawSHA256: sha(raw) }, null, 2), { flag: 'wx' });
      check(response.status === 200 && (response.headers.get('content-type') || '').includes('application/json'), 'official-http-failure');
      bundle[name] = JSON.parse(raw);
      bundle.receipts[name] = { url, status: response.status, sha256: sha(canonical(bundle[name])), rawSHA256: sha(raw) };
    } catch (error) {
      // Prefix only when bounded/truncated; never mislabel it a complete response.
      const partial = Buffer.concat(chunks), capturedHeaders = responseHeaders();
      const unsafe = reflected(partial) || reflected(JSON.stringify(capturedHeaders)) || reflected(error.message);
      if (!unsafe && !fs.existsSync(path.join(evidenceDir, `${name}.body`)) && chunks.length)
        fs.writeFileSync(path.join(evidenceDir, `${name}.partial-body`), partial, { flag: 'wx' });
      const safeError = unsafe ? Error('AUDIT_POLICY_REJECTED: ghsa-credential-reflected') : error;
      fs.writeFileSync(path.join(evidenceDir, `${name}.failure.json`), JSON.stringify({ url, startedAt,
        endedAt: new Date().toISOString(), status: response?.status ?? null, headers: unsafe ? null : capturedHeaders,
        bytesRead: size, incomplete: !fs.existsSync(path.join(evidenceDir, `${name}.body`)), error: safeError.message }, null, 2), { flag: 'wx' });
      throw safeError;
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'bundle.json'), JSON.stringify(bundle, null, 2), { flag: 'wx' });
  return bundle;
}

module.exports={fetchOfficial,canonical,sha,digest,URLS,check};
if(require.main===module){fetchOfficial(process.argv[2],{githubToken:process.env.AFW_GHSA_TOKEN||undefined}).then(b=>console.log(JSON.stringify({observedAt:b.observedAt,sources:b.receipts}))).catch(error=>{console.error(error.message?.startsWith('AUDIT_POLICY_REJECTED:')?error.message:'AUDIT_POLICY_REJECTED: source-capture-failed');process.exitCode=1;});}
