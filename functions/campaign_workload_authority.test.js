'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const w=require('./campaign_workload_authority'),search=require('./smart_zone_intelligence');
const planning=require('./smart_zone_planning'),{zoneGeometryDigest}=require('./operational_layer');
for(const [hours,count]of [[.5,1],[2,1],[5,1],[6,1],[6.01,2],[6.5,2],[8,2],[10,2],[12,2],[12.01,3],[12.5,3],[15,3],[18,3],[18.01,4],[20,4],[24,4],[24.01,5],[192,32]]){
 test(`${hours} hours requires ${count} Zones with balanced demand only`,()=>{
  const r=w.requirement(hours);assert.equal(r.requiredZoneCount,count);
  assert.ok(Math.abs(r.targetMinutesPerZone*count-hours*60)<1e-9);assert.ok(r.targetMinutesPerZone<=360);
 });
}
for(const value of [.49,0,-1,null,true,'6','invalid',NaN,Infinity,192.01]){
 test(`invalid workload ${String(value)} rejected`,()=>assert.throws(()=>w.requirement(value),{code:'invalid-argument'}));
}
const geometry=x=>planning.rectangleAround({latitude:39,longitude:-76+x},100,100);
const zone=(id,x,minutes)=>({id,businessId:'b',campaignId:'c',status:'unassigned',serviceArea:geometry(x),
 zoneIntelligence:{version:'ZoneIntelligenceV1',geometryDigest:zoneGeometryDigest(geometry(x)),status:'available',
  workload:{minutes,oneScaler:minutes<=360}}});
const campaign={id:'c',businessId:'b',status:'draft',campaignWorkload:w.requirement(10)};
test('missing, invalid, stale, duplicate and extra polygons cannot meet required Zone count',()=>{
 const a=zone('a',0,190),b=zone('b',.01,140);
 assert.equal(w.summary(campaign,[a,b]).supportedMinutes,330);
 assert.equal(w.summary(campaign,[a,b]).ready,true);
 assert.match(w.summary(campaign,[a]).reason,/Add 1 more Zone/);
 for(const patch of [{serviceArea:geometry(.02)},{zoneIntelligence:null},{businessId:'other'},{campaignId:'other'},
   {assignedScalerId:'worker'},{mapLocked:true},{status:'completed'},{id:null}])
  assert.equal(w.summary(campaign,[a,{...b,...patch}]).ready,false);
 assert.equal(w.summary(campaign,[a,{...a,id:'duplicate'}]).ready,false);
 assert.equal(w.summary(campaign,[a,b,zone('extra',.02,20)]).ready,false);
 assert.equal(w.summary(campaign,[a,zone('too-long',.01,361)]).ready,false);
 assert.equal(w.summary({...campaign,campaignWorkload:{...campaign.campaignWorkload,requiredZoneCount:1}},[a]).ready,false);
});
test('five-hour request does not turn two small alternatives into simultaneous required Zones',()=>{
 const c={...campaign,campaignWorkload:w.requirement(5)};
 assert.equal(w.summary(c,[zone('one',0,24)]).supportedMinutes,24);
 assert.equal(w.summary(c,[zone('one',0,24)]).ready,true);
 assert.equal(w.summary(c,[zone('one',0,24),zone('two',.01,21)]).ready,false);
});
function fixture(hours=10){
 const candidates=[24,21,18,15].map((minutes,i)=>({id:'candidate'+i,propertyAreaId:'section'+i,
  geometry:geometry(i*.004),features:[{id:'target'+i,latitude:39,longitude:-76+i*.004,observedTags:{building:'detached'}}],
  ranking:{fit:90-i,reasons:['Observed residential evidence'],displaySignals:[],limitations:[]},
  networkSegments:[{from:geometry(i*.004)[0],to:geometry(i*.004)[1]}],
  workload:{estimatedMinutes:minutes,estimatedProperties:1,estimatedHours:minutes/60},
  source:{name:'synthetic fixture',freshness:'fresh'},mappedRouteMeters:100,sourceComponentIds:['component'+i]}));
 const input={desiredHours:hours,sourceAreaDigest:'source',contextVersion:'context',selectedBoundary:geometry(0),
  workType:'flyer_distribution',intelligenceContext:{goal:'Residential'},workerBasePayCents:1000};
 const evidence={version:search.VERSION,sourceAreaDigest:'source',contextVersion:'context',requestedHours:hours,
  goal:'Residential',targetIntent:'residential',candidates,
  propertyCandidates:candidates.map(c=>({id:c.propertyAreaId,geometry:c.geometry,ranking:c.ranking})),
  fullSearchCoverage:true,successfulWindowCount:4};
 return {input,evidence};
}
test('recommendation count follows demand without merging disconnected geometry or inflating time',()=>{
 for(const [hours,count]of [[5,1],[8,2],[10,2],[15,3]]){
  const {input,evidence}=fixture(hours),plan=search.generate(input,evidence);
  assert.equal(plan.zones.length,count);assert.equal(plan.campaignWorkload.requiredZoneCount,count);
  assert.equal(plan.totalEstimatedMinutes,evidence.candidates.slice(0,count).reduce((n,c)=>n+c.workload.estimatedMinutes,0));
  plan.zones.forEach((z,i)=>assert.deepEqual(z.geometry,evidence.candidates[i].geometry));
  assert.ok(plan.totalEstimatedMinutes<hours*60);
 }
});
test('alternate changes only selected slot, preserves context/other identities, rejects tampering',()=>{
 const {input,evidence}=fixture(),first=search.generate(input,evidence);
 const next=search.generate({...input,selectionIds:first.selectionIds,replaceZoneIndex:1},evidence);
 assert.equal(next.selectionIds[0],first.selectionIds[0]);
 assert.notEqual(next.selectionIds[1],first.selectionIds[1]);
 assert.deepEqual(next.zones[0],first.zones[0]);
 assert.deepEqual(next.campaignWorkload,first.campaignWorkload);
 assert.deepEqual(next.selectedTerritory,first.selectedTerritory);
 assert.throws(()=>search.generate({...input,selectionIds:['outside-run'],replaceZoneIndex:0},evidence));
 assert.throws(()=>search.generate({...input,selectionIds:[first.selectionIds[0],first.selectionIds[0]]},evidence));
 assert.throws(()=>search.generate({...input,alternativeIndex:1},evidence),/select_zone_to_replace/);
 assert.throws(()=>search.generate({...input,desiredHours:8},evidence),/context_changed/);
});

test('incomplete workload preserves a machine-readable authority reason and human message',()=>{
 class HttpError extends Error {constructor(code,message,details){super(message);this.code=code;this.details=details;}}
 assert.throws(()=>w.assertComplete(campaign,[zone('one',0,20)],HttpError),e=>
   e.code==='failed-precondition'&&e.details.reason==='CAMPAIGN_ZONES_INCOMPLETE'&&/Add 1 more/.test(e.message));
});

test('explicit closing point is valid without changing the saved evidence digest',()=>{
 const z=zone('closed',0,24);z.serviceArea.push(z.serviceArea[0]);
 z.zoneIntelligence.geometryDigest=zoneGeometryDigest(z.serviceArea);
 assert.equal(w.validEvidence(z),true);
});

test('legacy five-hour multipart readback explains one-Zone adjustment without granting authority or mutating history',()=>{
 const c={id:'c',businessId:'b',status:'draft'},zs=[zone('a',0,24),zone('b',.01,21)];
 const run={businessId:'b',campaignId:'c',status:'complete',searchEvidence:{requestedHours:5}};
 const before=JSON.stringify([c,zs,run]),r=w.legacySummary(c,zs,run);
 assert.equal(r.requestedHours,5);assert.equal(r.requiredZoneCount,1);assert.equal(r.zoneCount,2);
 assert.equal(r.supportedMinutes,45);assert.equal(r.ready,false);
 assert.match(r.reason,/Choose which area to keep/);assert.match(r.reason,/remain unchanged/);
 assert.equal(JSON.stringify([c,zs,run]),before);assert.throws(()=>w.assertComplete(c,zs));
 assert.equal(w.legacySummary(c,zs,{...run,businessId:'foreign'}).requiredZoneCount,null);
});

test('representable values immediately around six-hour boundaries are never rounded across them',()=>{
 for(const boundary of [6,12,18,24,30,186]){
  const step=boundary*Number.EPSILON;
  assert.equal(w.requirement(boundary-step).requiredZoneCount,boundary/6);
  assert.equal(w.requirement(boundary).requiredZoneCount,boundary/6);
  assert.equal(w.requirement(boundary+step).requiredZoneCount,boundary/6+1);
 }
});
