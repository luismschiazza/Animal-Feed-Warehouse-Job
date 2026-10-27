// Explicit disposable Docker smoke. Never reads .env/MONGO_URL or uses existing volumes.
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const image = process.env.CONTAINER_TEST_IMAGE;
if (!image) throw Error('Explicit CONTAINER_TEST_IMAGE required');
const mongo = process.env.CONTAINER_TEST_MONGO_IMAGE;
if (!mongo) throw Error('Explicit disposable CONTAINER_TEST_MONGO_IMAGE required');
const id = 'afw-compiled-test-' + randomUUID().slice(0, 8);
const network = id + '-net', database = id + '-mongo', api = id + '-api';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => execFileSync('docker', args, {encoding:'utf8',timeout:120000});
const uri = `mongodb://${database}:27017/sessions_test_compiled?replicaSet=compiledtest&directConnection=true`;
const env = ['-e','NODE_ENV=production','-e','HOST=0.0.0.0','-e','PORT=3000',
  '-e',`MONGO_URL=${uri}`,'-e','JWT_SECRET=compiled-smoke-disposable-only-not-production',
  '-e','JWT_EXPIRES_IN=15m','-e','CORS_ORIGIN=http://localhost:5173'];
(async () => {
  try {
    docker(['network','create',network]);
    docker(['run','-d','--rm','--name',database,'--network',network,mongo,'--replSet','compiledtest','--bind_ip_all']);
    let ready = false;
    for(let i=0;i<60;i++) {
      const ping = spawnSync('docker',['exec',database,'mongosh','--quiet','--eval','quit(db.adminCommand({ping:1}).ok?0:1)'],{timeout:10000});
      if(ping.status===0){ready=true;break;} await sleep(1000);
    }
    assert.ok(ready,'Disposable MongoDB must become available');
    docker(['exec',database,'mongosh','--quiet','--eval',`rs.initiate({_id:'compiledtest',members:[{_id:0,host:'${database}:27017'}]})`]);
    ready=false;
    for(let i=0;i<60;i++) {
      const primary=spawnSync('docker',['exec',database,'mongosh','--quiet','--eval','quit(db.hello().isWritablePrimary?0:1)'],{timeout:10000});
      if(primary.status===0){ready=true;break;} await sleep(1000);
    }
    assert.ok(ready,'Disposable replica set must have primary');
    const missing = spawnSync('docker',['run','--rm','--name',id+'-missing','--network',network,...env,image],{encoding:'utf8',timeout:60000});
    assert.equal(missing.status,1,'Missing metadata must refuse startup');
    assert.match(missing.stdout+missing.stderr,/Audit collection\/indexes unavailable|Session serialization must be initialized/);
    assert.doesNotMatch(missing.stdout+missing.stderr,/ENOENT|Cannot find module/);
    console.log('PASS actual CMD rejects missing operator metadata, not missing code/assets');
    const prepare = `
      require('reflect-metadata');
      const assert=require('node:assert/strict'),{createConnection}=require('mongoose');
      (async()=>{const c=await createConnection(process.env.MONGO_URL).asPromise();try{
        for(const [file,name,schema] of [
          ['common/audit/security-audit.schema','SecurityAuditRecord','SecurityAuditSchema'],
          ['features/auth/schemas/session-revocation.schema','SessionRevocation','SessionRevocationSchema'],
          ['features/auth/schemas/session-limit-revision.schema','SessionLimitRevision','SessionLimitRevisionSchema'],
          ['features/auth/schemas/session-serialization.schema','SessionSerialization','SessionSerializationSchema']]){
          const exports=require('./dist/'+file);const m=c.model(name,exports[schema]);await m.createCollection();await m.createIndexes();
        }
        for(const name of ['users','organizations','auth_sessions'])assert.equal(await c.db.collection(name).countDocuments(),0);
        await c.models.SessionSerialization.create({_id:'animal-feed-warehouse',sequence:0,serverNow:new Date()});
      }finally{await c.close();}})().catch(()=>process.exit(1));`;
    docker(['run','--rm','--network',network,...env,image,'node','-e',prepare]);
    docker(['run','-d','--rm','--name',api,'--network',network,'--read-only','--tmpfs','/tmp',...env,image]);
    ready=false;
    for(let i=0;i<90;i++) {
      const state=JSON.parse(docker(['inspect',api,'--format','{{json .State}}']));
      assert.ok(state.Running,'Production must remain running');
      if(state.Health?.Status==='healthy'){ready=true;break;} await sleep(1000);
    }
    assert.ok(ready,'Actual production healthcheck must pass');
    await sleep(32000); // observe another real healthcheck interval, not just startup.
    const state=JSON.parse(docker(['inspect',api,'--format','{{json .State}}']));
    assert.equal(state.Running,true);assert.equal(state.Health.Status,'healthy');
    assert.ok(state.Health.Log.filter(x=>x.ExitCode===0).length>=2,'At least two successful healthchecks');
    docker(['exec',api,'node','-e',`const assert=require('node:assert/strict'),fs=require('node:fs');assert.equal(process.getuid(),1000);assert.equal(fs.existsSync('src'),false);assert.ok(fs.existsSync('dist/features/mail/style/mail.css'));`]);
    docker(['exec',database,'mongosh','--quiet','--eval',`const d=db.getSiblingDB('sessions_test_compiled');for(const c of ['users','organizations','auth_sessions'])if(d.getCollection(c).countDocuments()!==0)quit(1);`]);
    console.log('PASS real production CMD, UID1000, readonly filesystem, no src, CSS present, two healthy probes, zero seeded accounts/orgs/sessions');
  } finally {
    for(const name of [api,id+'-missing',database]) spawnSync('docker',['rm','-f','-v',name],{stdio:'ignore',timeout:30000});
    spawnSync('docker',['network','rm',network],{stdio:'ignore',timeout:30000});
  }
})().catch(error=>{console.error('FAIL disposable production smoke:',error.message);process.exitCode=1;});
