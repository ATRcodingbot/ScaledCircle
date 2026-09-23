'use strict';
// Complete local release suite. Never uses cloud data or triggers deployed work.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cwd=path.join(root,'functions');
const output=path.join(root,'.firebase/launch-close-20260919/backend-release');
const env={...process.env};
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']) {
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(env[key]||''))throw Error('All three loopback emulators required: '+key);
}
for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_CONFIG','APP_ENV',
  'LIVE_PAID_WORK_ACTIVATION_ENABLED','PRODUCTION_PACKAGE_TEST','PRODUCTION_SETTLEMENT_TEST',
  'PRODUCTION_FUNDING_CANDIDATE','JOB_ROOM_PRESENTATION_ENTRY'])delete env[key];
env.QA_GEOMETRY_TEST_FILE=path.join(root,'.firebase/dual-qa-final-route.private.json');
env.QA_RETEST_GEOMETRY_TEST_FILE=path.join(root,'.firebase/kenilworth-retest.private.json');
for(const key of ['QA_GEOMETRY_TEST_FILE','QA_RETEST_GEOMETRY_TEST_FILE']) {
  if(!fs.existsSync(env[key]))throw Error('Required private fixture unavailable: '+key);
}
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw Error('Commit the stable candidate before the complete run');
const sha=git('rev-parse','HEAD');
fs.mkdirSync(output,{recursive:true});
const rows=[];
async function clearLocalNamespaces(file) {
  const source=fs.readFileSync(path.join(cwd,file),'utf8');
  const projects=new Set(['demo-scaledcircle',...source.matchAll(/['"]((?:demo-[a-z0-9-]+|scaled-circle|scaledcircle-staging))['"]/g)].map(x=>typeof x==='string'?x:x[1]));
  for(const project of projects) for(const [host,route] of [
    [env.FIRESTORE_EMULATOR_HOST,`/emulator/v1/projects/${project}/databases/(default)/documents`],
    [env.FIREBASE_AUTH_EMULATOR_HOST,`/emulator/v1/projects/${project}/accounts`],
  ]) {
    const response=await fetch(`http://${host}${route}`,{method:'DELETE'});
    if(!response.ok)throw Error(`Local reset failed: ${project} ${response.status}`);
  }
}
async function run(file,extra={},suffix='') {
  await clearLocalNamespaces(file);
  const log=path.join(output,file+suffix+'.tap');
  const fd=fs.openSync(log,'w');
  // Storage cross-service Rules reads must use the emulator's own project.
  const childEnv={...env,...(file==='account_closure_rules.test.js'?{GCLOUD_PROJECT:'demo-scaledcircle'}:{}),...extra};
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],
    {cwd,env:childEnv,stdio:['ignore',fd,fd],timeout:240000});
  fs.closeSync(fd);
  const text=fs.readFileSync(log,'utf8');
  const count=key=>Number(text.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]||0);
  const row={file,suffix,status:result.status,error:result.error?.message||null,
    tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),log:path.relative(root,log)};
  rows.push(row);console.log(JSON.stringify(row));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({sha,complete:false,rows},null,2));
}
(async()=>{
  // Prepare from this exact checked-in source, never a leftover generated directory.
  for(const tool of ['prepare_production_engineering.cjs','prepare_production_funding.cjs']) {
    const result=spawnSync(process.execPath,[path.join(__dirname,tool)],{cwd:root,env,encoding:'utf8'});
    fs.writeFileSync(path.join(output,tool+'.log'),(result.stdout||'')+(result.stderr||''));
    if(result.status!==0)throw Error('Release preparation failed: '+tool);
  }
  for(const file of fs.readdirSync(cwd).filter(n=>n.endsWith('.test.js')).sort())await run(file);
  // The two default-mode skips are exercised in the actual production adapter mode.
  await run('paused_work_backend.test.js',{PRODUCTION_SETTLEMENT_TEST:'true'},'.production');
  const clean=git('status','--porcelain')===''&&git('rev-parse','HEAD')===sha;
  const totals=rows.reduce((a,r)=>{for(const k of ['tests','pass','fail','skipped'])a[k]+=r[k];return a;},{tests:0,pass:0,fail:0,skipped:0});
  const result={sha,complete:true,clean,totals,rows,finishedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({sha,clean,totals}));
  process.exitCode=clean&&rows.every(r=>r.status===0)?0:1;
})().catch(error=>{console.error(error);process.exitCode=1;});
