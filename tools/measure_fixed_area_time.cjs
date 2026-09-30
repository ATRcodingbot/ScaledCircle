'use strict';
// Offline retained-input verification. No provider calls, credentials or writes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline='3a6e9d6103e91bb2c23c69678745dd2ebf695dca';
function model(variant){
 if(variant==='candidate')return require('../functions/own_team_time_comparison');
 const filename=path.join(root,'functions/own_team_time_comparison.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m._compile(cp.execFileSync('git',['show',baseline+':functions/own_team_time_comparison.js'],{cwd:root}).toString(),filename);return m.exports;
}
function verify(result,input){
 assert.equal(result.coveredTargetCount,input.features.length);assert.equal(result.geometryDigest,require('../functions/operational_layer').zoneGeometryDigest(input.geometry));
 assert.equal(result.totalSessionMinutes,null);assert.equal(result.fullAreaWorkloadEstablished,false);
 for(const row of result.rows){const a=row.splitUp.allocations,counts=new Map();
  assert.equal(a.reduce((n,v)=>n+v.targetCount,0),input.features.length);assert.equal(new Set(a.flatMap(v=>v.targetIds)).size,input.features.length);
  for(const lane of a)for(const [id,n]of Object.entries(lane.segmentTraversalCounts))counts.set(id,(counts.get(id)||0)+n);
  assert.equal(counts.size,result.computation.deduplicatedSegmentCount);for(const n of counts.values())assert.equal(n,2);
  assert.ok(Math.abs(a.reduce((n,v)=>n+v.walkingMinutes,0)-result.walkingMinutes)<1e-7);
  assert.ok(Math.abs(a.reduce((n,v)=>n+v.handlingMinutes,0)-result.handlingMinutes)<1e-7);
  assert.equal(row.splitUp.overallTeamFinishEstablished,false);
 }
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=result.limits.responseBytes);
}
function worker(filename,variant){
 const bytes=fs.readFileSync(filename),input=JSON.parse(bytes),m=model(variant),unchanged=JSON.stringify(input);
 for(let i=0;i<3;i++)m.compare(input);
 const times=[],heaps=[];let result;
 for(let i=0;i<30;i++){global.gc();const memory=process.memoryUsage().heapUsed,t=performance.now();result=m.compare(input);times.push(performance.now()-t);heaps.push(process.memoryUsage().heapUsed-memory);}
 assert.equal(JSON.stringify(input),unchanged);if(variant==='candidate')verify(result,input);
 times.sort((a,b)=>a-b);
 return {variant,inputSha256:crypto.createHash('sha256').update(bytes).digest('hex'),geometryDigest:result.geometryDigest,targets:input.features.length,atomicSegments:input.segments.length,status:result.status,
  samples:30,runtimeMs:{min:times[0],median:(times[14]+times[15])/2,max:times.at(-1)},maxObservedPostCallHeapDeltaBytes:Math.max(...heaps),processPeakRssKiB:process.resourceUsage().maxRSS,
  responseBytes:Buffer.byteLength(JSON.stringify(result)),computation:result.computation||null,networkMeters:result.networkMeters??null,walkingMinutes:result.walkingMinutes??null,handlingMinutes:result.handlingMinutes??null,
  rows:result.rows.map(r=>({marketers:r.marketerCount,stayTogether:r.stayTogether.calculatedFieldMinutes,splitCalculated:r.splitUp.calculatedFieldMinutes,splitWithFloor:r.splitUp.fieldMinutes,splitCriticalWalkingMinutes:r.splitUp.criticalWalkingMinutes??null,splitCriticalHandlingMinutes:r.splitUp.criticalHandlingMinutes??null,modeledPersonWorkMinutes:r.splitUp.allocatedPersonWorkMinutes??null})),conservationChecks:variant==='candidate'?'passed':null};
}
if(process.argv[2]==='--worker'){console.log(JSON.stringify(worker(process.argv[3],process.argv[4])));}
else{
 const filenames=process.argv.slice(2);if(filenames.length!==2)throw Error('Provide retained small and large input paths; they remain local and are not printed.');
 const results=filenames.map(filename=>['baseline','candidate'].map(variant=>JSON.parse(cp.execFileSync(process.execPath,['--expose-gc',__filename,'--worker',path.resolve(filename),variant],{cwd:root}))));
 assert.deepEqual(results[0][0].rows.map(r=>r.splitCalculated),results[0][1].rows.map(r=>r.splitCalculated));
 assert.deepEqual(results[0][0].rows.map(r=>r.stayTogether),results[0][1].rows.map(r=>r.stayTogether));
 console.log(JSON.stringify({execution:'Offline retained-input replay, not production/physical acceptance',baseline,node:process.version,platform:process.platform,results},null,2));
}
