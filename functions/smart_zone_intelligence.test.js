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
// Synthetic PI facts exercise orchestration; OSM fixture remains public evidence only.
const propertyFacts=g=>({source:'synthetic-property-fixture',propertyCount:100,residentialStructureCount:80,
  confidence:'HIGH',geometryDigest:require('./property_intelligence').geometryDigest(g),limitations:[]});
async function replay(input=args()){
  const calls=[];
  const evidence=await search.search(input,{loadPropertyAnalysis:async g=>planning.pointInsidePolygon(corkran.anchor,g)?propertyFacts(g):null,fetchSnapshot:async({selectedBoundary,onDiagnostic})=>{
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
  assert.equal(calls.length,1);assert.equal(evidence.successfulWindowCount,1);
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
  const input=args();const evidence=await search.search(input,{loadPropertyAnalysis:async g=>propertyFacts(g),fetchSnapshot:async({onDiagnostic})=>{
    onDiagnostic({status:'unavailable',reasonCode:'provider_partial_response',httpStatus:200});return null;
  }});const plan=search.generate(input,evidence);
  assert.equal(plan.explanation,search.FAIL_SAFE);assert.equal(plan.totalEstimatedProperties,null);
  assert.equal(plan.targetEvidence.observedEligibleFeatureCount,null);assert.deepEqual(plan.zones,[]);
  assert.equal(plan.compensation,null);assert.equal(plan.plannedTerritory,null);
});
test('sequential request/time budgets stop safely and do not retry failed windows',async()=>{
  let clock=0,active=0,maximumActive=0,calls=0;
  const evidence=await search.search(args(),{loadPropertyAnalysis:async g=>propertyFacts(g),now:()=>clock,fetchSnapshot:async()=>{
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
test('B2B cannot turn residential Property Intelligence into commercial fit',async()=>{
  const boundary=planning.rectangleAround(fixture.p(0,1000),2500,2500),input=args(boundary);
  input.anchor=fixture.p(0,1000);input.workType='business_card_distribution';
  input.intelligenceContext={...input.intelligenceContext,services:['Office cleaning'],goal:'Office prospects',campaignType:input.workType};
  const elements=fixture.grid().map(e=>e.tags.building?{...e,tags:{office:'company'}}:e);
  const evidence=await search.search(input,{loadPropertyAnalysis:async g=>propertyFacts(g),fetchSnapshot:async({selectedBoundary})=>snapshot(selectedBoundary,elements)});
  const plan=search.generate(input,evidence);
  assert.equal(plan.totalEstimatedProperties,null);assert.equal(plan.targetEvidence.targetIntent,'business');
  assert.equal(evidence.propertyCandidates.length,0);assert.equal(evidence.completedWindowCount,0);
  assert.ok(plan.zones.every(z=>z.planningTargets.features.every(f=>f.kind==='business')));
});
test('same public snapshot repeated across bounded windows cannot double count selected source IDs',async()=>{
  const input=args(),{plan}=await replay(input);
  const ids=plan.zones.flatMap(z=>z.planningTargets.features.map(f=>f.sourceId));
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(plan.compensation.policyVersion,'ScalerCompensationQualityV1');
  assert.deepEqual(plan.compensation,planning.compensationRecommendation({estimatedMinutes:44}));
});

test('all PI sections rank before mapping; map failures never become alternatives',async()=>{
 const input=args(),events=[];
 const evidence=await search.search(input,{loadPropertyAnalysis:async g=>{events.push('property');return propertyFacts(g);},
   fetchSnapshot:async()=>{events.push('map');return null;}});
 assert.equal(events.slice(0,11).every(x=>x==='property'),true);
 assert.equal(evidence.propertyCandidates.length,11);
 const plan=search.generate(input,evidence),next=search.generate({...input,alternativeIndex:1},evidence);
 assert.equal(plan.explanation,search.FAIL_SAFE);
 assert.equal(plan.recommendationContext.mapValidation,'needs_review');assert.equal(plan.recommendationContext.hasAlternative,false);
 assert.equal(plan.totalEstimatedProperties,null);assert.equal(plan.totalEstimatedMinutes,null);
 assert.equal(plan.recommendationStatus,'manual_review_required');assert.deepEqual(plan.zones,[]);
 assert.equal(plan.reviewTerritory,null);assert.equal(next.reviewTerritory,null);
 assert.equal(plan.recommendationContext.propertyRecommendation,null);
 assert.equal(next.recommendationContext.hasAlternative,false);
 require('./smart_zone_intelligence_runtime').assertFirestoreValue(evidence);
});

test('mismatched property geometry cannot be rescued by OSM counts',async()=>{
 let calls=0;const input=args();const evidence=await search.search(input,{loadPropertyAnalysis:async g=>({...propertyFacts(g),geometryDigest:'different'}),fetchSnapshot:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(evidence.propertyCandidates.length,0);assert.equal(search.generate(input,evidence).totalEstimatedProperties,null);
});

test('requested workload selects nearby mapped sections without changing PI scores',()=>{
 const section=(id,x,fit)=>({id,geometry:planning.rectangleAround(fixture.p(x,0),100,100),ranking:{fit}});
 const sections=[section('a',0,95),section('b',1000,85),section('c',9000,70)];
 const evidence={propertyCandidates:sections,candidates:sections.map(s=>({...s,propertyAreaId:s.id,workload:{estimatedMinutes:140}}))};
 const small=search.propertyOptions(evidence,90),large=search.propertyOptions(evidence,300);
 assert.deepEqual(small[0].selected.map(s=>s.id),['a']);assert.deepEqual(large[0].selected.map(s=>s.id),['a','b']);
 assert.deepEqual(sections.map(s=>s.ranking.fit),[95,85,70]);assert.equal(large[1].primary.id,'c');
});
