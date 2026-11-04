// TLS-only loopback fixture in a disposable non-networked Mongo container; no real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const image = process.env.CONTAINER_TEST_MONGO_IMAGE;
if (!image) throw Error('Explicit disposable CONTAINER_TEST_MONGO_IMAGE required');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'afw-mongo-tls-'));
const name = 'afw-tls-' + randomUUID().slice(0,8);
const docker = args => execFileSync('docker',args,{encoding:'utf8',timeout:30000});
(async()=>{
  try {
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'ca.pem')],{stdio:'ignore',timeout:15000});
    fs.writeFileSync(path.join(directory,'server.pem'),Buffer.concat([fs.readFileSync(path.join(directory,'key.pem')),fs.readFileSync(path.join(directory,'ca.pem'))]));
    docker(['run','-d','--rm','--name',name,'--network','none','--mount',`type=bind,source=${directory},target=/tmp/tls-fixture,readonly`,image,
      '--bind_ip_all','--tlsMode','requireTLS','--tlsCertificateKeyFile','/tmp/tls-fixture/server.pem','--tlsCAFile','/tmp/tls-fixture/ca.pem']);
    let ok=false;
    const client=['exec',name,'mongosh','--quiet','--host','localhost:27017','--tls','--tlsCAFile','/tmp/tls-fixture/ca.pem','--tlsCertificateKeyFile','/tmp/tls-fixture/server.pem','--eval','quit(db.adminCommand({ping:1}).ok?0:1)'];
    for(let i=0;i<30;i++){
      if(spawnSync('docker',client,{timeout:10000}).status===0){ok=true;break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(ok,'Verified Mongo mutual TLS must work');
    const plain=spawnSync('docker',['exec',name,'mongosh','mongodb://localhost:27017/?serverSelectionTimeoutMS=2000&connectTimeoutMS=2000','--quiet','--eval','db.adminCommand({ping:1})'],{timeout:15000});
    assert.equal(plain.status,1,'requireTLS must reject plaintext');
    const untrusted=spawnSync('docker',['exec',name,'mongosh','mongodb://localhost:27017/?serverSelectionTimeoutMS=2000&connectTimeoutMS=2000','--quiet','--tls','--tlsCertificateKeyFile','/tmp/tls-fixture/server.pem','--eval','db.adminCommand({ping:1})'],{timeout:15000});
    assert.equal(untrusted.status,1,'Client must reject untrusted server certificate');
    console.log('PASS isolated Mongo verified mutual TLS; plaintext and untrusted CA rejected; no TLS bypass flags');
  }finally{
    spawnSync('docker',['rm','-f','-v',name],{stdio:'ignore',timeout:30000});
    fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error('FAIL isolated Mongo TLS:',error.message);process.exitCode=1;});
