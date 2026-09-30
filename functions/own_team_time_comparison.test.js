'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const comparison=require('./own_team_time_comparison'),projection=require('./zone_intelligence');
const geometry=[{latitude:39,longitude:-76},{latitude:39,longitude:-75.99},{latitude:39.01,longitude:-75.99},{latitude:39.01,longitude:-76}];
const segments=Array.from({length:7},(_,i)=>({from:{latitude:39.004,longitude:-75.998+i*.0003},to:{latitude:39.004,longitude:-75.998+(i+1)*.0003}}));
const features=Array.from({length:12},(_,i)=>({id:'synthetic-'+i,latitude:39.0041,longitude:-75.9979+i*.00016,kind:'residential'}));
const input=()=>({geometry:structuredClone(geometry),features:structuredClone(features),segments:structuredClone(segments),inventoryComplete:false});
test('fixed-area 1–4 comparison conserves every target and observed segment without writes',()=>{
 const args=input(),before=JSON.stringify(args),v=comparison.compare(args);assert.equal(JSON.stringify(args),before);
 assert.equal(v.boundaryFixed,true);assert.equal(v.fullAreaWorkloadEstablished,false);assert.equal(v.totalSessionMinutes,null);
 assert.deepEqual(v.rows.map(r=>r.marketerCount),[1,2,3,4]);
 for(const r of v.rows){assert.equal(r.coveredTargetCount,12);
  const lanes=r.splitUp.allocations;assert.equal(lanes.reduce((s,l)=>s+l.targetCount,0),12);
  assert.equal(new Set(lanes.flatMap(l=>l.targetIds)).size,12);
  assert.equal(new Set(lanes.flatMap(l=>l.segmentIds)).size,7);
  assert.ok(Math.abs(lanes.reduce((s,l)=>s+l.walkingMinutes,0)-v.walkingMinutes)<1e-9);
  assert.ok(Math.abs(lanes.reduce((s,l)=>s+l.handlingMinutes,0)-16)<1e-9);
  assert.equal(r.splitUp.fieldMinutes,Math.max(...lanes.map(l=>l.fieldMinutes)));
 }
});
test('stay together never divides duration; split uses contiguous cuts and maintained floor',()=>{
 const v=comparison.compare(input());assert.equal(new Set(v.rows.map(r=>r.stayTogether.fieldMinutes)).size,1);
 assert.deepEqual(v.rows.map(r=>r.splitUp.fieldMinutes),[21,15,15,15]);
 assert.equal(v.rows[1].splitUp.idealizedEvenDivisionMinutes,v.rows[0].splitUp.allocations[0].rawFieldMinutes/2);
 assert.match(v.rows[1].splitUp.idealizedLabel,/not a practical allocation/);
});
test('uneven long section stays intact; longest lane is not simple division',()=>{
 const args=input();args.segments=[{from:segments[0].from,to:segments.at(-1).to}];
 const v=comparison.compare(args);assert.equal(v.rows[3].splitUp.allocations.length,1);
 assert.equal(v.rows[3].splitUp.fieldMinutes,v.rows[0].splitUp.fieldMinutes);
});
test('duplicate/reversed network is deduplicated; duplicate targets fail closed',()=>{
 const args=input(),first=comparison.compare(args);args.segments.push({from:segments[0].to,to:segments[0].from});
 assert.equal(comparison.compare(args).networkMeters,first.networkMeters);
 args.features.push(args.features[0]);assert.equal(comparison.compare(args).status,'unavailable');
});
test('missing roads, out-of-bound features/streets and distant associations cannot invent split lanes',()=>{
 for(const args of [{...input(),segments:[]},{...input(),features:[{...features[0],longitude:-75}]},
   {...input(),segments:[{from:segments[0].from,to:{latitude:39.1,longitude:-75.998}}]}])assert.equal(comparison.compare(args).status,'unavailable');
 const distant={...input(),features:[{...features[0],latitude:39.009}]};
 const v=comparison.compare(distant);assert.equal(v.rows[3].splitUp.subdivisionEstablished,false);
 assert.equal(v.rows[3].splitUp.occupiedMarketers,1);
});
test('branch and disconnected evidence retain whole-area comparison, never imply practical division',()=>{
 for(const edge of [{from:segments[2].from,to:{latitude:39.0044,longitude:segments[2].from.longitude}},
  {from:{latitude:39.005,longitude:-75.996},to:{latitude:39.005,longitude:-75.9958}}]){
  const v=comparison.compare({...input(),segments:[...segments,edge]});
  assert.equal(v.rows[3].splitUp.subdivisionEstablished,false);
  assert.equal(v.rows[3].splitUp.fieldMinutes,v.rows[0].splitUp.fieldMinutes);
 }
});
test('geometry edits change comparison identity; partial status cannot become full-area completion',()=>{
 const first=comparison.compare(input()),changed=comparison.compare({...input(),geometry:geometry.map(p=>({...p,longitude:p.longitude===-75.99?-75.989:p.longitude}))});
 assert.notEqual(first.geometryDigest,changed.geometryDigest);assert.equal(first.fullAreaWorkloadEstablished,false);
 assert.equal(comparison.compare({...input(),inventoryComplete:true}).fullAreaWorkloadEstablished,true);
});
test('recommendation projection includes comparison only for own-team and same candidate geometry',()=>{
 const candidate={...input(),networkSegments:segments,workload:{estimatedMinutes:21},incompleteTargetInventory:true,unclassifiedMappedFeatureCount:7};
 assert.equal(projection.recommended(candidate,'flyer_distribution','residential').teamTimeComparison,undefined);
 const r=projection.recommended(candidate,'flyer_distribution','residential',true);
 assert.equal(r.teamTimeComparison.geometryDigest,r.geometryDigest);assert.equal(r.workload,null);assert.equal(r.teamTimeComparison.coveredTargetCount,12);
});
test('bounded oversized evidence fails closed',()=>assert.equal(comparison.compare({...input(),segments:Array(257).fill(segments[0])}).status,'unavailable'));

test('calculated time rounds up before the unchanged planning floor; patterns bind crew, area, targets, source and workload',()=>{
 const args={...input(),source:{datasetVersion:'fixture-v1',dataTimestamp:'2026-09-25'},unclassifiedCount:7,currentTeam:{marketerCount:2,coveragePattern:'stay_together'}};
 const v=comparison.compare(args);
 assert.deepEqual(v.rows.map(r=>r.splitUp.calculatedFieldMinutes),[21,12,9,7]);
 assert.deepEqual(v.rows.map(r=>r.splitUp.fieldMinutes),[21,15,15,15]);
 assert.deepEqual(v.rows.map(r=>r.stayTogether.calculatedFieldMinutes),[21,21,21,21]);
 assert.equal(v.unclassifiedCount,7);assert.equal(v.currentTeam.marketerCount,2);
 for(const r of v.rows)for(const [name,pattern] of [['stayTogether','stay_together'],['splitUp','split_streets']]){
  const b=r[name].binding;assert.equal(b.geometryDigest,v.geometryDigest);assert.equal(b.targetSetDigest,v.binding.targetSetDigest);
  assert.equal(b.evidenceDigest,v.binding.evidenceDigest);assert.equal(b.marketerCount,r.marketerCount);assert.equal(b.coveragePattern,pattern);
  assert.equal(b.workloadModelVersion,require('./smart_zone_planning').POLICY_VERSION);
  assert.equal(r[name].calculatedFieldMinutes,Math.max(...r[name].allocations.map(a=>Math.ceil(a.walkingMinutes+a.handlingMinutes))));
 }
 const crew=comparison.compare({...args,currentTeam:{marketerCount:4,coveragePattern:'split_streets'}});
 assert.equal(crew.geometryDigest,v.geometryDigest);assert.equal(crew.binding.targetSetDigest,v.binding.targetSetDigest);
 assert.equal(crew.binding.evidenceDigest,v.binding.evidenceDigest);
 assert.notEqual(comparison.compare({...args,source:{datasetVersion:'fixture-v2'}}).binding.evidenceDigest,v.binding.evidenceDigest);
 assert.notEqual(comparison.compare({...args,features:features.slice(1)}).binding.targetSetDigest,v.binding.targetSetDigest);
});
test('manual and recommended comparisons never exchange selected-area evidence',()=>{
 const c={...input(),networkSegments:segments,workload:{estimatedMinutes:21},incompleteTargetInventory:true,unclassifiedMappedFeatureCount:7};
 const small=projection.recommended(c,'flyer_distribution','residential',{marketerCount:2,coveragePattern:'stay_together'});
 const large=projection.analyze({geometry:geometry.map(p=>({...p,longitude:p.longitude===-75.99?-75.989:p.longitude})),snapshot:null,workType:'flyer_distribution',teamComparison:true});
 assert.equal(small.teamTimeComparison.unclassifiedCount,7);assert.equal(small.teamTimeComparison.currentTeam.coveragePattern,'stay_together');
 assert.equal(large.teamTimeComparison,undefined);assert.notEqual(large.geometryDigest,small.geometryDigest);
});
