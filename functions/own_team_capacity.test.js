"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const capacity=require('./own_team_capacity'),search=require('./smart_zone_intelligence'),planning=require('./smart_zone_planning');
const runtime=require('./smart_zone_intelligence_runtime'),workload=require('./campaign_workload_authority');
const retained=require('./fixtures/21061-team-capacity-retained.json');
for(const count of [1,2,3,4])test(`4 hours x ${count} marketers has explicit split target`,()=>{
 const r=capacity.requirement({sessionHours:4,marketerCount:count,coveragePattern:'split_streets'});
 assert.equal(r.targetPersonHours,count*4);assert.equal(r.requiredZoneCount,null);assert.equal(r.headcountIsAssignment,false);
 assert.equal(capacity.requirement({...r,coveragePattern:'stay_together'}).targetPersonHours,4);
});
for(const patch of [{sessionHours:.49},{marketerCount:0},{marketerCount:1.1},{marketerCount:'2'},{coveragePattern:'unknown'}])
 test('team input rejects '+JSON.stringify(patch),()=>assert.throws(()=>capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'split_streets',...patch})));
const section=(id,minutes)=>({id,features:[{id:'target-'+id}],workload:{estimatedMinutes:minutes}});
test('whole-section allocation retains uneven loads and unknown travel; duplicate targets rejected',()=>{
 const input={sessionHours:4,marketerCount:2,coveragePattern:'split_streets'};
 const sections=[section('a',240),section('b',180),section('c',120)];
 const r=capacity.allocate(input,sections);assert.deepEqual(r.allocations.map(a=>a.minutes),[240,300]);
 assert.equal(r.estimatedFieldElapsedMinutes,300);assert.equal(r.estimatedElapsedMinutes,null);assert.equal(r.sharedTravelMinutes,null);
 assert.equal(r.supportedPersonHours,9);assert.throws(()=>capacity.allocate(input,[sections[0],sections[0]]),/Overlapping/);
 const together=capacity.allocate({...input,coveragePattern:'stay_together'},sections);
 assert.equal(together.allocations.length,1);assert.equal(together.estimatedFieldElapsedMinutes,540);
});
test('legacy own-team workload remains unchanged and requires explicit team review',()=>{
 const c={executionMode:'own_team',campaignWorkload:workload.requirement(5)};
 const before=JSON.stringify(c),r=workload.legacySummary(c,[],{});
 assert.equal(r.ready,false);assert.equal(r.legacyAdjustmentRequired,true);assert.equal(r.requiredZoneCount,null);assert.match(r.reason,/remain unchanged/);assert.equal(JSON.stringify(c),before);
});
test('cache identity changes for every duration/headcount/pattern/mode/location/goal',()=>{
 const campaign={executionMode:'own_team',campaignWorkload:capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'split_streets'}),workloadVersion:1};
 const args={campaignId:'fixture',campaign,data:{areaSelection:{query:'21061',resultId:'21061'}},desiredHours:4,objective:'Decks'};
 const key=runtime.requestFingerprint(args);
 for(const field of [{desiredHours:5},{objective:'Fences'},{data:{areaSelection:{query:'other',resultId:'other'}}},
   {campaign:{...campaign,executionMode:'marketplace'}},
   ...[{marketerCount:3},{coveragePattern:'stay_together'},{sessionHours:5}].map(p=>({campaign:{...campaign,campaignWorkload:{...campaign.campaignWorkload,...p}}}))])assert.notEqual(runtime.requestFingerprint({...args,...field}),key);
});
test('retained ZIP evidence no longer aggregates nine disconnected team sections',()=>{
 const e={...structuredClone(retained.evidence),version:search.VERSION};
 const input={executionMode:'own_team',teamCapacity:{sessionHours:5,marketerCount:2,coveragePattern:'split_streets'},desiredHours:5,
   sourceAreaDigest:e.sourceAreaDigest,contextVersion:e.contextVersion,selectedBoundary:require('./fixtures/21061-zcta-public.json').geometry,
   workType:'flyer_distribution',intelligenceContext:{goal:e.goal}};
 input.eligibleGeography=require('./property_service_area_geometry').normalizeAreas({areas:[{geometry:input.selectedBoundary}]}).union;
 e.executionMode='own_team';e.teamCapacity=capacity.requirement(input.teamCapacity);e.searchBoundary=input.selectedBoundary;
 const before=JSON.stringify(e),p=search.generate(input,e);
 assert.ok(p.zones.length<9);assert.ok(p.totalEstimatedProperties<95);
 assert.equal(p.recommendedScalerCount,0);assert.equal(p.compensation,null);assert.equal(p.workloadFulfilled,false);
 assert.equal(JSON.stringify(e),before);assert.equal(p.teamCapacity.estimatedElapsedMinutes,null);
 assert.throws(()=>search.generate({...input,teamCapacity:{...input.teamCapacity,marketerCount:3}},e),/context_changed/);
});
function candidate(id,x,endpointOffset=0) {
 const geometry=[{latitude:39,longitude:-76+x},{latitude:39,longitude:-76+x+.001},{latitude:39.001,longitude:-76+x+.001},{latitude:39.001,longitude:-76+x}];
 return {id,propertyAreaId:'same-pi',geometry,features:[{id:'target-'+id,latitude:39.0005,longitude:-76+x+.0005}],
   networkSegments:[{from:{latitude:39.0005,longitude:-76+x+endpointOffset},to:{latitude:39.0005,longitude:-76+x+.001+endpointOffset}}],
   sourceComponentIds:[id],source:{freshness:'fresh',dataTimestamp:'2026-01-01',fetchedAt:'2026-09-26'},ranking:{fit:90,reasons:[],limitations:[]},
   workload:{estimatedMinutes:15,estimatedProperties:1},mappedRouteMeters:86};
}
test('one marketplace Zone can assemble compatible touching subareas; no gap or fake connection',()=>{
 const a=candidate('a',0),b=candidate('b',.001),away=candidate('away',.004);
 const e={candidates:[a,b,away],propertyCandidates:[{id:'same-pi',geometry:a.geometry,ranking:a.ranking}],workType:'flyer_distribution'};
 const pool=search.assembledCandidates(e,300),merged=pool.find(c=>c.memberIds?.length===2);
 assert.ok(merged);assert.equal(merged.features.length,2);assert.ok(!merged.memberIds.includes('away'));
 assert.ok(planning.validateGeometry(merged.geometry).valid);
 assert.equal(search.propertyOptions(e,300)[0].selected.length,1);
 assert.equal(search.propertyOptions(e,300)[0].selected[0].features.length,2);
 assert.equal(search.assembledCandidates({...e,candidates:[a,away]},300).length,2);
 assert.equal(search.assembledCandidates({...e,candidates:[a,{...b,networkSegments:away.networkSegments}]},300).length,2);
});

test('overlapping saved team sections cannot display double-counted supported workload',()=>{
 const geometry=require('./fixtures/21061-corkran-osm-public.json').selectedBoundary;
 const digest=require('./operational_layer').zoneGeometryDigest(geometry);
 const c={id:'campaign',businessId:'business',executionMode:'own_team',campaignWorkload:capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'split_streets'})};
 const a={id:'a',campaignId:c.id,businessId:c.businessId,serviceArea:geometry,
   zoneIntelligence:{version:'ZoneIntelligenceV1',status:'available',geometryDigest:digest,workload:{minutes:20,oneScaler:true}}};
 const r=capacity.summary(c,[a,{...a,id:'b'}]);assert.equal(r.ready,false);assert.equal(r.supportedMinutes,null);assert.equal(r.teamAllocation,null);
});
