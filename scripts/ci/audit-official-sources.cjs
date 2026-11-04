'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const URLS=Object.freeze({cve:'https://cveawg.mitre.org/api/cve/CVE-2026-93753',nvd:'https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-93753',ghsa:'https://api.github.com/advisories/GHSA-gcqx-w48m-w2h4'});
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=v=>sha(canonical(v));
const check=(condition,code)=>{if(!condition)throw Error('AUDIT_POLICY_REJECTED: '+code);};
async function fetchOfficial(evidenceDir) {
  check(!fs.existsSync(evidenceDir), 'refuse-evidence-overwrite');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const bundle = { observedAt: new Date().toISOString(), receipts: {} };
  for (const [name, url] of Object.entries(URLS)) {
    const startedAt = new Date().toISOString();
    let response, size = 0;
    const chunks = [];
    try {
      response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'AFW-review-proposal', Accept: 'application/json' } });
      for await (const bytes of response.body) {
        const allowed = Math.max(0, 1048576 - size);
        chunks.push(bytes.subarray(0, allowed)); size += bytes.length;
        check(size <= 1048576, 'official-response-too-large');
      }
      const raw = Buffer.concat(chunks);
      // Save responses BEFORE interpreting status/JSON, including HTTP errors.
      fs.writeFileSync(path.join(evidenceDir, `${name}.body`), raw, { flag: 'wx' });
      fs.writeFileSync(path.join(evidenceDir, `${name}.receipt.json`), JSON.stringify({ url, startedAt,
        observedAt: new Date().toISOString(), status: response.status, headers: Object.fromEntries(response.headers), rawSHA256: sha(raw) }, null, 2), { flag: 'wx' });
      check(response.status === 200 && (response.headers.get('content-type') || '').includes('application/json'), 'official-http-failure');
      bundle[name] = JSON.parse(raw);
      bundle.receipts[name] = { url, status: response.status, sha256: sha(canonical(bundle[name])), rawSHA256: sha(raw) };
    } catch (error) {
      // Prefix only when bounded/truncated; never mislabel it a complete response.
      if (!fs.existsSync(path.join(evidenceDir, `${name}.body`)) && chunks.length)
        fs.writeFileSync(path.join(evidenceDir, `${name}.partial-body`), Buffer.concat(chunks), { flag: 'wx' });
      fs.writeFileSync(path.join(evidenceDir, `${name}.failure.json`), JSON.stringify({ url, startedAt,
        endedAt: new Date().toISOString(), status: response?.status ?? null, headers: response ? Object.fromEntries(response.headers) : null,
        bytesRead: size, incomplete: !fs.existsSync(path.join(evidenceDir, `${name}.body`)), error: error.message }, null, 2), { flag: 'wx' });
      throw error;
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'bundle.json'), JSON.stringify(bundle, null, 2), { flag: 'wx' });
  return bundle;
}

module.exports={fetchOfficial,canonical,sha,digest,URLS,check};
if(require.main===module){fetchOfficial(process.argv[2]).then(b=>console.log(JSON.stringify({observedAt:b.observedAt,sources:b.receipts}))).catch(error=>{console.error(error.message?.startsWith('AUDIT_POLICY_REJECTED:')?error.message:'AUDIT_POLICY_REJECTED: source-capture-failed');process.exitCode=1;});}
