'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const search=require('./smart_zone_intelligence'),planning=require('./smart_zone_planning');
const geography=require('./smart_zone_geography'),areas=require('./property_service_area_geometry');
const serviceability=require('./smart_zone_serviceability'),clipping=require('polygon-clipping');
const zip=require('./fixtures/21061-zcta-public.json'),corkran=require('./fixtures/21061-corkran-osm-public.json');
const fixture=require('./smart_zone_geographic_fixtures');
const union=geometry=>areas.normalizeAreas({areas:[{geometry}]}).union;
function args(boundary=zip.geometry){return {anchor:corkran.anchor,selectedBoundary:boundary,
  eligibleGeography:union(boundary),desiredHours:5,workType:'flyer_distribution',label:'Glen Burnie / 21061',
  sourceAreaDigest:'test-source-digest',contextVersion:'test-authoritative-context',
  intelligenceContext:{goal:'Deck and remodeling prospects',services:['Deck construction'],
    priorityServices:[],excludedServices:[],campaignType:'flyer_distribution'}};}
const snapshot=(boundary,elements)=>geography.snapshotFromElements(boundary,elements,
  {dataTimestamp:corkran.dataTimestamp,fetchedAt:corkran.retrievedAt});
async function replay(input=args()){
  const calls=[];
  const evidence=await search.search(input,{fetchSnapshot:async({selectedBoundary,onDiagnostic})=>{
    calls.push(selectedBoundary);
    // The retained snapshot covers Corkran only. The rest of the ZIP is unknown,
    // not an observed empty response. No network/provider call is made in tests.
    if(!planning.pointInsidePolygon(corkran.anchor,selectedBoundary)){
      onDiagnostic({status:'unavailable',reasonCode:'fixture_outside_retained_coverage'});return null;
    }
    onDiagnostic({status:'success',reasonCode:'retained_public_fixture_replay'});
    return snapshot(selectedBoundary,corkran.elements);
  }});
  return {evidence,plan:search.generate(input,evidence),calls};
}
test('real 31.31 km² ZCTA is internally partitioned, with full search geometry and no inflated provider window',()=>{
  const input=args(),result=search.partition(input);
  assert.ok(planning.polygonAreaSquareMeters(input.selectedBoundary)>31000000);
  assert.equal(result.complete,true);assert.equal(result.windows.length,11);
  for(const w of result.windows){assert.ok(planning.polygonAreaSquareMeters(w.geometry)<=25000000);
    assert.ok(areas.isContained(w.geometry,result.region));}
  const combined=clipping.union(...result.windows.map(w=>union(w.geometry)));
  assert.ok(areas.isContained(zip.geometry,combined));assert.deepEqual(input.selectedBoundary,zip.geometry);
});
test('Corkran retained public evidence survives ZIP search; partial evidence supports44 minutes, not fictional5hours',async()=>{
  const {evidence,plan,calls}=await replay();
  assert.equal(calls.length,11);assert.equal(evidence.successfulWindowCount,1);
  assert.equal(evidence.fullSearchCoverage,false);
  assert.equal(plan.recommendationStatus,'review_required');assert.equal(plan.totalEstimatedProperties,19);
  assert.equal(plan.totalEstimatedMinutes,44);assert.equal(plan.zones[0].mappedRouteMeters,739);
  assert.equal(plan.targetEvidence.verifiedDeliveryPoints,false);
  assert.match(plan.recommendationContext.limitations.join(' '),/44 minutes.*300 minutes/);
  assert.match(plan.recommendationContext.limitations.join(' '),/unexamined/);
  assert.equal(plan.targetEvidence.dataTimestamp,corkran.dataTimestamp);
  assert.equal(plan.targetEvidence.fetchedAt,corkran.retrievedAt);
  assert.equal(plan.recommendationContext.hasAlternative,false);
  const schools=snapshot(corkran.selectedBoundary,corkran.elements).landFeatures.filter(f=>f.kind==='school');
  for(const zone of plan.zones)for(const school of schools){
    assert.equal(serviceability.polygonsOverlap(zone.geometry,school.polygon,planning),false);
    for(const segment of zone.planningNetwork.segments){
      assert.equal(planning.pointInsidePolygon(segment.from,school.polygon),false);
      assert.equal(planning.pointInsidePolygon(segment.to,school.polygon),false);
    }
  }
  assert.equal(plan.zones[0].planningNetwork.isExecutionRoute,false);
});
test('service-area intersection preserves holes and ineligible geography',()=>{
  const outer=planning.rectangleAround(fixture.anchor,5000,5000),hole=planning.rectangleAround(fixture.anchor,400,400);
  const input=args(outer);input.eligibleGeography=clipping.difference(union(outer),union(hole));
  const result=search.partition(input);assert.ok(result.windows.length>0);
  for(const w of result.windows){assert.ok(areas.isContained(w.geometry,input.eligibleGeography));
    assert.equal(areas.overlapsGeometry(w.geometry,hole),false);}
});
test('missing or nonintersecting eligible geography fails before provider work',async()=>{
  for(const eligibleGeography of [null,union(planning.rectangleAround({latitude:38,longitude:-77},200,200))]){
    let calls=0;const input={...args(),eligibleGeography};
    const evidence=await search.search(input,{fetchSnapshot:async()=>{calls++;}});
    assert.equal(calls,0);assert.equal(search.generate(input,evidence).totalEstimatedProperties,null);
  }
});
test('provider timeout or partial response never becomes zero targets or fake geometry',async()=>{
  const input=args();const evidence=await search.search(input,{fetchSnapshot:async({onDiagnostic})=>{
    onDiagnostic({status:'unavailable',reasonCode:'provider_partial_response',httpStatus:200});return null;
  }});const plan=search.generate(input,evidence);
  assert.equal(plan.explanation,search.FAIL_SAFE);assert.equal(plan.totalEstimatedProperties,null);
  assert.equal(plan.targetEvidence.observedEligibleFeatureCount,null);assert.deepEqual(plan.zones,[]);
  assert.equal(plan.compensation,null);assert.equal(plan.plannedTerritory,null);
});
test('sequential request/time budgets stop safely and do not retry failed windows',async()=>{
  let clock=0,active=0,maximumActive=0,calls=0;
  const evidence=await search.search(args(),{now:()=>clock,fetchSnapshot:async()=>{
    active++;maximumActive=Math.max(maximumActive,active);calls++;clock+=60000;active--;return null;
  }});
  assert.equal(calls,3);assert.equal(maximumActive,1);assert.equal(evidence.reasonCode,'bounded_search_time_budget');
  assert.ok(calls<=search.MAX_WINDOWS);
});
test('unsupported or event intent cannot invoke provider by requesting a business goal',async()=>{
  for(const workType of ['event_marketing','unsupported']){
    const input=args();input.workType=workType;input.intelligenceContext.targetIntent='business';
    let calls=0;const evidence=await search.search(input,{fetchSnapshot:async()=>{calls++;}});
    assert.equal(calls,0);assert.equal(evidence.reasonCode,'unsupported_target_intent');
  }
});
test('larger regions disclose bounded sampling without replacing the original region',()=>{
  const input=args(planning.rectangleAround(fixture.anchor,24000,24000)),copy=structuredClone(input.selectedBoundary);
  const result=search.partition(input);assert.equal(result.windows.length,12);assert.equal(result.complete,false);
  assert.ok(result.totalWindows>12);assert.deepEqual(input.selectedBoundary,copy);
});
test('alternate requests and changed inputs bind to reviewed context; nonexistent alternatives stay disabled',async()=>{
  const input=args(),{evidence,plan}=await replay(input);
  assert.equal(search.generate(input,evidence).planId,plan.planId);
  assert.throws(()=>search.generate({...input,contextVersion:'another-business-context'},evidence),/context_changed/);
  assert.throws(()=>search.generate({...input,desiredHours:10},evidence),/context_changed/);
  const alternate=search.generate({...input,alternativeIndex:1},evidence);
  assert.equal(alternate.reasonCode,'no_supported_alternative');assert.deepEqual(alternate.zones,[]);
});
test('nearby supported clusters can combine while disconnected alternatives remain separate',()=>{
  const make=(id,x,minutes,fit)=>({id,geometry:planning.rectangleAround(fixture.p(x,0),100,100),
    ranking:{fit},workload:{estimatedMinutes:minutes}});
  const pool=[make('a',0,140,90),make('b',1000,145,85),make('c',9000,270,80)];
  const options=search.groups(pool,300);
  assert.deepEqual(options.map(group=>group.map(c=>c.id)),[['a','b'],['c']]);
  assert.notDeepEqual(options[0][0].geometry,options[0][1].geometry);
  assert.deepEqual(pool.map(c=>c.id),['a','b','c']);
});
test('synthetic B2B uses actual commercial features, never residential inventory',async()=>{
  const boundary=planning.rectangleAround(fixture.p(0,1000),2500,2500),input=args(boundary);
  input.anchor=fixture.p(0,1000);input.workType='business_card_distribution';
  input.intelligenceContext={...input.intelligenceContext,services:['Office cleaning'],goal:'Office prospects',campaignType:input.workType};
  const elements=fixture.grid().map(e=>e.tags.building?{...e,tags:{office:'company'}}:e);
  const evidence=await search.search(input,{fetchSnapshot:async({selectedBoundary})=>snapshot(selectedBoundary,elements)});
  const plan=search.generate(input,evidence);
  assert.ok(plan.totalEstimatedProperties>0);assert.equal(plan.targetEvidence.targetIntent,'business');
  assert.ok(plan.zones.every(z=>z.planningTargets.features.every(f=>f.kind==='business')));
});
test('same public snapshot repeated across bounded windows cannot double count selected source IDs',async()=>{
  const input=args(),{plan}=await replay(input);
  const ids=plan.zones.flatMap(z=>z.planningTargets.features.map(f=>f.sourceId));
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(plan.compensation.policyVersion,'ScalerCompensationQualityV1');
  assert.deepEqual(plan.compensation,planning.compensationRecommendation({estimatedMinutes:44}));
});
