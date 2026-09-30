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
test('branch and disconnected evidence retain separate local allocations without claiming overall finish',()=>{
 for(const edge of [{from:segments[2].from,to:{latitude:39.0044,longitude:segments[2].from.longitude}},
  {from:{latitude:39.005,longitude:-75.996},to:{latitude:39.005,longitude:-75.9958}}]){
  const v=comparison.compare({...input(),segments:[...segments,edge]});
  assert.equal(v.rows[3].splitUp.subdivisionEstablished,true);
  assert.equal(v.rows[3].splitUp.overallTeamFinishEstablished,false);
  conserved(v);
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
test('bounded oversized input fails closed, but repeated evidence is not counted as new distance',()=>{
 assert.equal(comparison.compare({...input(),segments:Array(2049).fill(segments[0])}).status,'unavailable');
 const v=comparison.compare({...input(),segments:Array(257).fill(segments[0]),features:[features[0]]});
 assert.equal(v.computation.deduplicatedSegmentCount,1);assert.equal(v.status,'supported_subset');
});

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
function conserved(v){
 assert.equal(v.status,'supported_subset');
 for(const row of v.rows){const allocations=row.splitUp.allocations;
  assert.equal(allocations.reduce((n,a)=>n+a.targetCount,0),v.coveredTargetCount);
  assert.equal(new Set(allocations.flatMap(a=>a.targetIds)).size,v.coveredTargetCount);
  const traversals=new Map();for(const a of allocations)for(const [id,n]of Object.entries(a.segmentTraversalCounts))traversals.set(id,(traversals.get(id)||0)+n);
  assert.equal(traversals.size,v.computation.deduplicatedSegmentCount);
  for(const count of traversals.values())assert.equal(count,2);
  assert.ok(Math.abs(allocations.reduce((n,a)=>n+a.walkingMinutes,0)-v.walkingMinutes)<1e-7);
  assert.ok(Math.abs(allocations.reduce((n,a)=>n+a.handlingMinutes,0)-v.handlingMinutes)<1e-7);
  const local=new Map();for(const a of allocations)local.set(a.localSection,Math.max(local.get(a.localSection)||0,a.rawFieldMinutes));
  assert.equal(row.splitUp.calculatedFieldMinutes,Math.ceil([...local.values()].reduce((n,v)=>n+v,0)));
 }
}
function chain(n){
 const points=Array.from({length:n+1},(_,i)=>({latitude:39.004,longitude:-75.999+i*.008/n}));
 return {...input(),segments:points.slice(1).map((p,i)=>({from:points[i],to:p})),
  features:points.slice(1).map((p,i)=>({id:'generated-'+i,latitude:p.latitude,longitude:(p.longitude+points[i].longitude)/2}))};
}
for(const n of [255,256,257,361,460])test('bounded path with '+n+' atomic segments preserves all work',()=>{
 const v=comparison.compare(chain(n));conserved(v);assert.equal(v.coveredTargetCount,n);assert.ok(v.computation.allocationTransitions<=327680);
});
test('increasing complexity exhausts operation budget with retained baseline, not zero work',()=>{
 const v=comparison.compare(chain(500));assert.equal(v.status,'allocation_incomplete');assert.equal(v.rows.length,0);
 assert.equal(v.coveredTargetCount,500);assert.ok(v.walkingMinutes>0&&v.handlingMinutes>0&&v.knownTargetCalculatedMinutes>0);
 assert.equal(v.computation.allocationTransitions,327681);assert.match(v.reason,/budget/);
});
test('degree-two compaction preserves junctions, target edges and access semantics',()=>{
 const sections=require('./own_team_street_sections');
 const p=i=>({latitude:39.004,longitude:-75.999+i*.0001});
 const edges=Array.from({length:8},(_,i)=>({id:'edge'+i,from:p(i),to:p(i+1),meters:10,access:i>=4?'restricted':'permitted'}));
 edges.push({id:'branch',from:p(3),to:{latitude:39.0042,longitude:p(3).longitude},meters:22,access:'permitted'});
 const compact=sections.compact(edges,[{id:'target'}],(_,e)=>e.id==='edge6'?0:100);
 assert.ok(compact.chains.length<edges.length);
 assert.equal(compact.chains.flatMap(c=>c.atoms).length,edges.length);
 assert.equal(compact.chains.reduce((n,c)=>n+c.meters,0),102);
 for(const c of compact.chains){const original=c.atoms.map(a=>edges.find(e=>e.id===a.id));
  assert.equal(new Set(original.map(e=>e.access)).size,1);
  if(c.targetIds.length)assert.equal(c.atoms.length,1);
 }
 const key=p=>`${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
 assert.ok(compact.chains.filter(c=>c.fromKey===key(p(3))||c.toKey===key(p(3))).length>=3);
 const walk=sections.walk(compact.components[0]);for(let i=1;i<walk.length;i++)assert.equal(walk[i-1].toKey,walk[i].fromKey);
 assert.equal(walk.flatMap(u=>u.targetIds).length,1);assert.equal(walk.reduce((n,u)=>n+u.meters,0),204);
});
test('cycles and fragmented walks retain every atom twice and deterministic target handling',()=>{
 const args=input();const p=segments[0].from,q=segments[2].to,r={latitude:39.0043,longitude:p.longitude};
 args.segments=[{from:p,to:q},{from:q,to:r},{from:r,to:p}];args.features=[features[0]];
 const first=comparison.compare(args);conserved(first);
 const changed=comparison.compare({...args,segments:args.segments.toReversed().map(e=>({from:e.to,to:e.from}))});
 const withoutBinding=rows=>rows.map(r=>({...r,stayTogether:{...r.stayTogether,binding:null},splitUp:{...r.splitUp,binding:null}}));
 assert.deepEqual(first.rows,comparison.compare(args).rows);assert.deepEqual(withoutBinding(first.rows),withoutBinding(changed.rows));assert.equal(first.networkMeters,changed.networkMeters);
});
test('duplicate conflicts fail closed; zero-length repeated edges cannot crash association',()=>{
 const args=input();args.segments.push({...segments[0],access:'no'});
 assert.match(comparison.compare(args).reason,/Conflicting/);
 const zero={from:segments[0].from,to:segments[0].from};
 conserved(comparison.compare({...input(),segments:[...segments,zero,zero]}));
});
test('separate street components exclude transfers and do not create additional campaign Zones',()=>{
 const args=input();args.segments.push({from:{latitude:39.006,longitude:-75.998},to:{latitude:39.006,longitude:-75.997}});
 const v=comparison.compare(args);assert.equal(v.computation.connectedLocalSectionCount,2);conserved(v);
 for(const row of v.rows){assert.equal(row.splitUp.fieldTimeBasis,'sequential_local_sections_excluding_transfers');
  assert.equal(row.splitUp.sectionTransferMinutes,null);assert.equal(row.stayTogether.personWorkMinutes,null);
  for(const a of row.splitUp.allocations)assert.equal(new Set(a.segmentIds.map(id=>row.splitUp.allocations.filter(b=>b.segmentIds.includes(id)).map(b=>b.localSection)).flat()).size,1);
 }
 assert.equal(v.planningCompatibility.createsSavedSections,false);assert.equal(v.planningCompatibility.plannerUsesComparison,false);
});
test('missing construction-year context cannot remove known walking/handling estimates',()=>{
 const args=input();const v=comparison.compare({...args,source:{constructionEra:null}});
 assert.deepEqual(v.rows.map(r=>r.splitUp.calculatedFieldMinutes),[21,12,9,7]);
});
test('maintained planner copies agree on actual whole-Zone read path and reject partial comparison as readiness',()=>{
 const copies=[require('./campaign_workload_authority'),require('../functions-business-operations/shared/campaign_workload_authority')];
 const c={id:'campaign',businessId:'business',executionMode:'own_team',campaignWorkload:require('./own_team_capacity').requirement({sessionHours:4,marketerCount:2,coveragePattern:'split_streets'})};
 const z={id:'z',businessId:c.businessId,campaignId:c.id,serviceArea:geometry,
  zoneIntelligence:{version:'ZoneIntelligenceV1',status:'partial',geometryDigest:require('./operational_layer').zoneGeometryDigest(geometry),workload:null,teamTimeComparison:comparison.compare(input())}};
 for(const copy of copies){const r=copy.summary(c,[z]);assert.equal(r.ready,false);assert.equal(r.validZoneCount,0);assert.equal(r.supportedMinutes,0);assert.equal(r.teamAllocation.estimatedFieldElapsedMinutes,null);}
 z.zoneIntelligence.workload={minutes:21,oneScaler:true};
 const semantic=r=>({ready:r.ready,supportedMinutes:r.supportedMinutes,elapsed:r.teamAllocation.estimatedFieldElapsedMinutes,allocations:r.teamAllocation.allocations,transfer:r.teamAllocation.sharedTravelMinutes});
 assert.deepEqual(semantic(copies[0].summary(c,[z])),semantic(copies[1].summary(c,[z])));
 const before=semantic(copies[0].summary(c,[z]));z.zoneIntelligence.teamTimeComparison=comparison.compare(chain(361));
 assert.deepEqual(semantic(copies[0].summary(c,[z])),before);
});
test('target association and response budgets fail closed with explicit retained scope',()=>{
 const tooMany={...input(),features:Array.from({length:5000},(_,i)=>({...features[0],id:'many-'+i})),segments:Array(401).fill(segments[0])};
 assert.match(comparison.compare(tooMany).reason,/target-association budget/);
 const largeIds={...input(),features:features.map((f,i)=>({...f,id:'id-'+i+'x'.repeat(30000)}))};
 const v=comparison.compare(largeIds);assert.equal(v.status,'allocation_incomplete');assert.equal(v.rows.length,0);
 assert.match(v.reason,/response budget/);assert.equal(v.coveredTargetCount,12);assert.ok(v.knownTargetCalculatedMinutes>0);
 assert.ok(Buffer.byteLength(JSON.stringify(v))<=v.limits.responseBytes);
});
test('fragmented equivalent path preserves length, handling and every original evidence atom',()=>{
 const a=chain(80),b={...a,segments:a.segments.flatMap(e=>{const mid={latitude:e.from.latitude,longitude:(e.from.longitude+e.to.longitude)/2};return [{from:e.from,to:mid},{from:mid,to:e.to}];})};
 const first=comparison.compare(a),second=comparison.compare(b);conserved(first);conserved(second);
 assert.ok(Math.abs(first.networkMeters-second.networkMeters)<1e-7);assert.equal(first.handlingMinutes,second.handlingMinutes);
 assert.equal(second.computation.deduplicatedSegmentCount,160);
});
test('maximum association work remains bounded and incomplete allocation preserves its known subtotal',()=>{
 const args=chain(2000);args.features=args.features.filter((_,i)=>i%2===0);
 const v=comparison.compare(args);assert.equal(v.status,'allocation_incomplete');assert.equal(v.coveredTargetCount,1000);
 assert.equal(v.computation.rawSegmentCount,2000);assert.equal(v.computation.deduplicatedSegmentCount,2000);
 assert.equal(v.computation.allocationTransitions,327681);assert.ok(v.knownTargetCalculatedMinutes>0);
});
