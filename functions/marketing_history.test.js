'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const g=require('../functions-business-operations/marketing_history_geometry');
const h=require('../functions-business-operations/marketing_history');
const now=Date.UTC(2026,8,26,15),box=(x=-76,y=39,w=.01,h=.01)=>[{latitude:y,longitude:x},{latitude:y,longitude:x+w},{latitude:y+h,longitude:x+w},{latitude:y+h,longitude:x}];
const record=(id,geometry=box(),completedAtMs=now-86400000,extra={})=>({id,schemaVersion:h.VERSION,businessId:'a',workspaceId:'a',campaignId:id,campaignName:id,completedAtMs,geometryParts:[{points:geometry}],executionMode:'own_team',completionEvidenceSource:'business_reported',immutable:true,...extra});
const summary=(records,geometry=box())=>h.summarize({businessId:'a',proposedParts:[{points:geometry}],records,nowMs:now});
test('calendar twelve months preserves UTC time and clamps leap day to February 28',()=>{
 assert.equal(g.twelveMonthsBefore(Date.UTC(2024,1,29,16,22,5,6)),Date.UTC(2023,1,28,16,22,5,6));
 assert.equal(g.twelveMonthsBefore(now),Date.UTC(2025,8,26,15));
});
test('recent full and partial overlap use saved polygon intersection',()=>{
 assert.equal(summary([record('full')]).overlapPercent,100);
 const partial=summary([record('partial',box(-76.005))]);assert.equal(partial.warning,true);assert.equal(partial.overlapPercent,50);assert.equal(partial.canContinue,true);
});
test('nonoverlap and boundary-only contact do not warn',()=>{
 for(const geometry of [box(-77),box(-75.99),box(-75.99,39.01)])assert.equal(summary([record('other',geometry)]).warning,false);
});
test('meaningful threshold requires both 25 square metres and 0.1 percent of proposed footprint',()=>{
 const sliver=box(-75.990005,39,.01,.01);assert.equal(summary([record('sliver',sliver)]).warning,false);
 const tiny=box(-76,39,.00002,.00002);assert.equal(summary([record('tiny',tiny)],tiny).warning,false);
 assert.equal(summary([record('meaningful',box(-75.999,39,.001,.001))]).warning,true);
});
test('older records remain historical and exact cutoff is included',()=>{
 const cutoff=g.twelveMonthsBefore(now),old=summary([record('old',box(),cutoff-1)]);
 assert.equal(old.warning,false);assert.equal(old.state,'marketed_historically');assert.equal(old.historical.length,1);
 assert.equal(summary([record('boundary',box(),cutoff)]).warning,true);
});
test('most recent relevant completion comes first and overlapping campaigns do not double count',()=>{
 const r=summary([record('first',box(-76,.0+39,.0075),now-90000),record('second',box(-75.9975),now-1000),record('distant',box(-77),now-1)]);
 assert.equal(r.recent[0].campaignId,'second');assert.equal(r.mostRecentCompletedAtMs,now-1000);assert.equal(r.recent.length,2);assert.equal(r.overlapPercent,100);
});
test('large geography detects overlap but omits an unsupported percentage',()=>{
 const p=box(-76,39,.3,.3),r=summary([record('large',p)],p);assert.equal(r.warning,true);assert.equal(r.overlapPercent,null);
});
test('holes retained by union do not become marketed territory',()=>{
 const frame=[box(-76,39,.01,.002),box(-76,39.008,.01,.002),box(-76,39,.002,.01),box(-75.992,39,.002,.01)].map(points=>({points}));
 const r=summary([record('frame',box(),now-1,{geometryParts:frame})],box(-75.997,39.003,.004,.004));assert.equal(r.warning,false);
});
test('corrupt tenant ownership, malformed geometry, and future history fail without a false fresh-area result',()=>{
 assert.throws(()=>summary([record('foreign',box(),now-1,{businessId:'b'})]),{code:'failed-precondition'});
 assert.throws(()=>summary([record('bad',[])]),{code:'failed-precondition'});
 assert.throws(()=>summary([record('future',box(),now+1)]),{code:'failed-precondition'});
});
test('marketplace authority requires approved bound completion and the exact zone footprint',()=>{
 const c={id:'campaign',businessId:'a',name:'Prior campaign'},z={id:'zone',businessId:'a',campaignId:c.id,status:'completed',reviewStatus:'approved',assignedScalerId:'scaler',submittedCompletionId:'completion',serviceArea:box()},proof={id:'completion',businessId:'a',campaignId:c.id,zoneId:z.id,scalerId:'scaler',status:'approved',reviewStatus:'approved',completedAt:now-100};
 const actual=h.marketplaceRecord('a',c,z,proof,now);assert.deepEqual(actual.geometryParts,[{points:z.serviceArea}]);assert.equal(actual.completedAtMs,now-100);
 for(const status of ['draft','canceled','scheduled','funded','downloaded','printed','submitted'])assert.equal(h.marketplaceRecord('a',c,{...z,status},proof,now),null);
 for(const change of [{status:'submitted'},{reviewStatus:'verification_pending'},{businessId:'b'},{zoneId:'other'},{campaignId:'other'},{scalerId:'other'},{completedAt:now+1}])assert.equal(h.marketplaceRecord('a',c,z,{...proof,...change},now),null);
 assert.equal(h.marketplaceRecord('b',c,z,proof,now),null);assert.equal(h.marketplaceRecord('a',{...c,executionMode:'own_team'},z,proof,now),null);
 const settled={...z,reserveSettlementId:z.id},settlement={id:z.id,zoneId:z.id,campaignId:c.id,businessId:'a',scalerId:'scaler',source:'ordinary_review'};
 assert.ok(h.marketplaceRecord('a',c,settled,proof,now,settlement));
 for(const source of ['partial_settlement','business_accepted_paused_work'])assert.equal(h.marketplaceRecord('a',c,settled,proof,now,{...settlement,source}),null);
 assert.equal(h.marketplaceRecord('a',c,settled,proof,now),null);assert.equal(h.marketplaceRecord('a',c,{...z,reviewMode:'access_exception'},proof,now),null);
});
test('self-crossing, retraced, and self-touching rings are rejected before polygon clipping',()=>{
 const points=coords=>coords.map(([longitude,latitude])=>({longitude,latitude}));
 for(const coords of [
  [[-76,39],[-75.99,39.01],[-75.99,39],[-76,39.01]],
  [[-76,39],[-75.99,39],[-75.995,39],[-75.99,39.01],[-76,39.01]],
  [[-76,39],[-75.99,39],[-75.995,39.005],[-75.99,39.01],[-76,39.01],[-75.995,39.005]],
 ])assert.throws(()=>g.shape([points(coords)]),{code:'failed-precondition'});
 const closed=[...box(),box()[0]];assert.ok(g.shape([closed]).length);assert.ok(g.shape([[...box().slice(0,1),box()[0],...box().slice(1)]]).length);
});
test('containment accepts complete saved zones, rejects outlying zones and preserves geometry',()=>{
 const outer=[{points:box()}],inside=[{points:box(-75.999,39.001,.001,.001)}],outside=[{points:box(-76.005)}],before=JSON.stringify(inside);
 assert.equal(g.containedParts(inside,outer),true);assert.equal(g.containedParts(outside,outer),false);assert.equal(JSON.stringify(inside),before);
});
