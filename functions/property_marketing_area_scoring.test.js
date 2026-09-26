'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {rankMarketingArea,buildMarketingContext,marketingTargetIntent,marketingHistorySignal}=require('./property_service_area_analysis');
const property=require('./property_intelligence');
const geography=require('./smart_zone_geography');
const planning=require('./smart_zone_planning');
const serviceability=require('./smart_zone_serviceability');
const fixture=require('./fixtures/21061-corkran-osm-public.json');

const geometry=planning.rectangleAround({latitude:39.15,longitude:-76.63},400,400);
const context={services:['Decks','Roofing','Landscaping','Remodeling'],priorityServices:[],excludedServices:[],
  goal:'Deck outreach to homeowners',campaignType:'flyer_distribution'};
function sample({kind='residential',tags={building:'detached'},count=12}={}){
  const features=Array.from({length:count},(_,i)=>({id:`way/${i+1}`,kind,latitude:39.149+Math.floor(i/4)*.0007,
    longitude:-76.631+(i%4)*.0006,observedTags:{...tags}}));
  const snapshot={source:'openstreetmap_bounded_snapshot_v1',dataTimestamp:'2026-09-26T18:45:17Z',
    fetchedAt:'2026-09-26T18:46:46.541Z',targetFeatures:features};
  const candidate={geometry,features:features.map(f=>({id:f.id})),networkSegments:[{geometry:geometry.slice(0,2)}],mappedRouteMeters:600};
  return {candidate,snapshot,context};
}
function facts(patch={}){
  return {geometryDigest:property.geometryDigest(geometry),source:'Maryland Open Data',sourceVersion:property.MARYLAND_SOURCE_VERSION,
    inputGranularity:'parcel_level',propertyCount:100,residentialStructureCount:90,percent20PlusYearsOld:80,
    percent40PlusYearsOld:20,confidence:'HIGH',limitations:[],...patch};
}

test('shared context binds saved profile/preferences, excludes services and preserves geography',()=>{
  const profile={businessUid:'owner',businessName:'Local services',servicesOffered:['Decks','Roofing'],servicesNotOffered:['Roofing']};
  const preferences={userUid:'owner',role:'business',schemaVersion:'ServiceAreaPreferencesV1',
    areas:[{id:'local',name:'Local',geometry}],priorityServices:['Roofing','Decks'],defaultResponseGoal:'Deck outreach to homeowners'};
  const input={businessId:'owner',profile,preferences,campaignType:'flyer_distribution'};
  const built=buildMarketingContext(input);
  assert.deepEqual(built.context.services,['Decks']);assert.deepEqual(built.context.priorityServices,['Decks']);
  assert.equal(built.context.targetIntent,'residential');assert.equal(built.context.outcomeEvidence.status,'unknown');
  assert.equal(built.normalized.areas.length,1);assert.deepEqual(built.eligibleGeography,built.normalized.union);
  assert.equal(buildMarketingContext(input).contextVersion,built.contextVersion);
  assert.notEqual(buildMarketingContext({...input,objective:'Find B2B business leads'}).contextVersion,built.contextVersion);
  assert.throws(()=>buildMarketingContext({...input,profile:{...profile,businessUid:'foreign'}}),/Save your Business profile/);
  assert.throws(()=>buildMarketingContext({...input,preferences:{...preferences,userUid:'foreign'}}),/Save your Business profile/);
  assert.throws(()=>buildMarketingContext({...input,preferences:{...preferences,areas:[]}}),/invalid_saved_service_area_geometry/);
});

test('explicit lead type overrides flyer format without inventing event support or resolving conflicting intent',()=>{
  assert.equal(marketingTargetIntent('flyer_distribution','Find B2B business leads'),'business');
  assert.equal(marketingTargetIntent('flyer_distribution','Find restaurants for commercial cleaning'),'business');
  assert.equal(marketingTargetIntent('business_outreach','Reach homeowners for roofing'),'residential');
  assert.equal(marketingTargetIntent('flyer_distribution','Roofing outreach'),'residential');
  assert.equal(marketingTargetIntent('event_marketing','Find B2B leads'),'unsupported');
  assert.equal(marketingTargetIntent('flyer_distribution','Find businesses and homeowners'),'unsupported');
});

test('explicit commercial and nonresidential goals cannot score residential flyer targets',()=>{
  for(const goal of ['Commercial landscaping prospects','Nonresidential roofing outreach',
    'Non-residential landscaping leads','Non residential roofing clients']){
    assert.equal(marketingTargetIntent('flyer_distribution',goal),'business');
    assert.equal(rankMarketingArea({...sample(),context:{...context,goal}}).fit,null);
    const business=rankMarketingArea({...sample({kind:'business',tags:{building:'commercial'}}),context:{...context,goal}});
    assert.ok(business.fit>0);assert.equal(business.signals.targetIntent,'business');
    assert.equal(marketingTargetIntent('event_marketing',goal),'unsupported');
  }
  for(const goal of ['Commercial and residential landscaping prospects','Non-residential roofing for homeowners'])
    assert.equal(marketingTargetIntent('flyer_distribution',goal),'unsupported');
});

test('deck/landscape fit changes only with observed mapped housing types and discloses inference limits',()=>{
  const detached=rankMarketingArea(sample()),apartments=rankMarketingArea(sample({tags:{building:'apartments'}}));
  assert.ok(detached.fit>apartments.fit);
  assert.equal(detached.signals.housingTypeFit.matchingMappedFeatures,12);
  assert.match(detached.reasons.join(' '),/housing-type planning proxy/);
  assert.match(detached.limitations.join(' '),/ownership, outdoor space, component condition/);
  assert.match(detached.limitations.join(' '),/mapped evidence only/);
  assert.equal(detached.signals.propertyIntelligence.status,'unavailable');
  assert.ok(detached.displaySignals.some(s=>s.label==='Mapped ground-oriented housing types'&&s.value===12));
});

test('missing housing tags never become detached homes or known property characteristics',()=>{
  const result=rankMarketingArea(sample({tags:{}}));
  assert.equal(result.signals.housingTypeFit.matchingMappedFeatures,0);
  assert.equal(result.signals.housingTypeFit.featuresWithBuildingType,0);
  assert.equal(result.signals.scoreComponents.serviceBasis,'generic mapped target type');
  assert.match(result.limitations.join(' '),/housing-type tags are unavailable/);
  assert.ok(!result.displaySignals.some(s=>s.label==='Mapped ground-oriented housing types'));
});

test('maintained Property Intelligence scoring is used only for the exact candidate geometry',()=>{
  const input={...sample(),context:{...context,goal:'Roofing outreach'}};
  const same=rankMarketingArea({...input,analysis:facts()}),wrong=rankMarketingArea({...input,analysis:facts({geometryDigest:'other'})});
  assert.equal(same.signals.propertyIntelligence.status,'used');
  assert.equal(same.signals.propertyIntelligence.fit,85);
  assert.equal(wrong.signals.propertyIntelligence.status,'geometry_mismatch');
  assert.match(wrong.limitations.join(' '),/different geometry/);
  assert.ok(!wrong.reasons.some(x=>x.includes('20+')));
  assert.ok(same.fit>rankMarketingArea({...input,analysis:facts({percent20PlusYearsOld:10})}).fit);
});

test('missing exact age, aggregate estimates and unavailable facts do not become age fit',()=>{
  const input={...sample(),context:{...context,goal:'Roofing outreach'}};
  for(const patch of [{percent20PlusYearsOld:null},{percent20PlusYearsOld:'80'},
    {percent20PlusYearsOld:null,estimatedPercent20PlusYearsOld:90,inputGranularity:'aggregate_census'},
    {source:'none'},{confidence:'INSUFFICIENT'}]){
    const result=rankMarketingArea({...input,analysis:facts(patch)});
    assert.notEqual(result.signals.propertyIntelligence.status,'used');
    assert.match(result.limitations.join(' '),/mapped evidence only/);
  }
});

test('B2B category preference ranks actual source tags and goal category precedes offered-service wording',()=>{
  const input=sample({kind:'business',tags:{building:'commercial',amenity:'restaurant'}});
  const business={...context,services:['Office cleaning'],goal:'Find restaurants for cleaning',targetIntent:'business'};
  const restaurant=rankMarketingArea({...input,context:business});
  assert.equal(restaurant.signals.businessCategories.matchingMappedFeatures,12);
  assert.deepEqual(restaurant.signals.businessCategories.requested,['restaurants']);
  const offices=rankMarketingArea({...sample({kind:'business',tags:{building:'commercial',office:'company'}}),context:business});
  assert.equal(offices.fit,null);assert.equal(offices.signals.businessCategories.matchingMappedFeatures,0);
  assert.match(offices.limitations.join(' '),/No observed business-category tags/);
  const differentGoal=rankMarketingArea({...sample({kind:'business',tags:{office:'company'}}),
    context:{...business,goal:'Find offices for cleaning'}});
  assert.ok(differentGoal.fit>0);assert.deepEqual(differentGoal.signals.businessCategories.requested,['offices']);
});

test('candidate assertions cannot invent tags, foreign/outside sources or duplicate target counts',()=>{
  const input=sample({tags:{building:'apartments'}});
  input.candidate.features.forEach(f=>{f.observedTags={building:'detached'};});
  input.candidate.features.push(input.candidate.features[0],{id:'fake'});
  input.snapshot.targetFeatures.push({id:'outside',kind:'residential',latitude:40,longitude:-76,observedTags:{building:'detached'}});
  input.candidate.features.push({id:'outside'});
  const result=rankMarketingArea(input);
  assert.equal(result.signals.mappedTargetCount,12);assert.equal(result.signals.housingTypeFit.matchingMappedFeatures,0);
  assert.equal(rankMarketingArea({...input,snapshot:null}).fit,null);
  assert.equal(rankMarketingArea({...input,snapshot:{...input.snapshot,source:'none'}}).fit,null);
  assert.equal(rankMarketingArea({...input,candidate:{...input.candidate,networkSegments:[]}}).fit,null);
});

test('requested hours and unsupported customer assertions do not change observations or infer demand',()=>{
  const input=sample();
  const first=rankMarketingArea({...input,context:{...context,desiredHours:1,buyingIntent:'high'}});
  const second=rankMarketingArea({...input,context:{...context,desiredHours:192,buyingIntent:'low'}});
  assert.deepEqual(first,second);assert.equal(first.signals.verifiedDeliveryPoints,false);
  assert.match(first.limitations.join(' '),/not verified households, delivery points, buying intent or guaranteed leads/);
  assert.equal(rankMarketingArea({...input,context:{...context,excludedServices:['Decks']}}).fit,null);
});

test('OSM parser retains only bounded observed classification tags with separate source/retrieval dates',()=>{
  const snapshot=geography.snapshotFromElements(geometry,[{type:'node',id:1,lat:39.15,lon:-76.63,
    tags:{building:'House','building:use':'residential',shop:'bakery',name:'Private name',phone:'555',
      owner:'Private owner','addr:full':'Private address','roof:material':'tile','roof:shape':'<script>'}}],
  {dataTimestamp:'2026-09-26T18:45:17Z',fetchedAt:'2026-09-26T18:46:46.541Z'});
  assert.deepEqual(snapshot.targetFeatures[0].observedTags,{building:'house','roof:material':'tile',shop:'bakery'});
  assert.equal(snapshot.dataTimestamp,'2026-09-26T18:45:17Z');assert.notEqual(snapshot.dataTimestamp,snapshot.fetchedAt);
  assert.ok(!JSON.stringify(snapshot.targetFeatures[0].observedTags).includes('Private'));
});

test('actual Corkran supported candidate remains source-backed and receives no fabricated property-age facts',()=>{
  const snapshot=geography.snapshotFromElements(fixture.selectedBoundary,fixture.elements,
    {dataTimestamp:fixture.dataTimestamp,fetchedAt:fixture.fetchedAt});
  const shaped=serviceability.shape({anchor:fixture.anchor,boundary:fixture.selectedBoundary,snapshot,
    workType:'flyer_distribution',propertiesPerHour:45,desiredTargetLimit:225,maximumZones:24},planning);
  assert.equal(shaped.candidates.length,1);
  const ranked=rankMarketingArea({candidate:shaped.candidates[0],snapshot,context});
  assert.ok(ranked.fit>0);assert.equal(ranked.signals.mappedTargetCount,19);
  assert.equal(ranked.signals.propertyIntelligence.status,'unavailable');
  assert.equal(ranked.signals.verifiedDeliveryPoints,false);
  assert.match(ranked.limitations.join(' '),/CRM outcomes/);
});

const history={status:'available',inventoryComplete:true,checkedAtMs:Date.UTC(2026,8,26,12),
  windowStartMs:Date.UTC(2025,8,26,12),records:[]};
const completed=(points=geometry,completedAtMs=Date.UTC(2026,7,1))=>({geometryParts:[{points}],completedAtMs,
  completionEvidenceSource:'business_reported'});

test('maintained completed-marketing overlap is a bounded advisory penalty, with union dedupe and no saturation claim',()=>{
  const input=sample(),fresh=rankMarketingArea({...input,context:{...context,marketingHistory:history}});
  const previous={...history,records:[completed(),completed()]};
  const repeat=rankMarketingArea({...input,context:{...context,marketingHistory:previous}});
  assert.equal(repeat.signals.marketingHistory.overlapPercent,100);
  assert.equal(repeat.signals.marketingHistory.penalty,15);assert.equal(fresh.fit-repeat.fit,15);
  assert.equal(repeat.signals.marketingHistory.recentRecordCount,2);
  assert.match(repeat.reasons.join(' '),/repeating this area remains allowed/);
  assert.match(repeat.limitations.join(' '),/does not measure saturation, response, conversion/);
  assert.ok(!JSON.stringify(repeat).includes('geometryParts'));
});

test('history uses exact saved partial-zone footprint and calendar twelve-month boundary',()=>{
  const half=[geometry[0],{...geometry[1],longitude:-76.63},{...geometry[2],longitude:-76.63},geometry[3]];
  const partial=marketingHistorySignal(geometry,{...history,records:[completed(half)]});
  assert.equal(partial.overlapPercent,50);assert.equal(partial.penalty,8);
  const old=marketingHistorySignal(geometry,{...history,records:[completed(geometry,history.windowStartMs-1)]});
  assert.equal(old.recentCompletedOverlap,false);assert.equal(old.penalty,0);
  const boundary=marketingHistorySignal(geometry,{...history,records:[completed(geometry,history.windowStartMs)]});
  assert.equal(boundary.recentCompletedOverlap,true);
  const leap={...history,checkedAtMs:Date.UTC(2024,1,29,12),windowStartMs:Date.UTC(2023,1,28,12)};
  assert.equal(marketingHistorySignal(geometry,leap).status,'available');
});

test('incomplete, malformed, unsupported or future history remains unknown without an absence claim or penalty',()=>{
  for(const value of [null,{...history,inventoryComplete:false},{...history,status:'unknown'},
    {...history,windowStartMs:0},{...history,records:[completed([],history.checkedAtMs)]},
    {...history,records:[completed(geometry,history.checkedAtMs+1)]},
    {...history,records:[{...completed(),completionEvidenceSource:'draft_campaign'}]}]){
    const signal=marketingHistorySignal(geometry,value);
    assert.equal(signal.status,'unknown');assert.equal(signal.recentCompletedOverlap,null);assert.equal(signal.penalty,0);
    const rank=rankMarketingArea({...sample(),context:{...context,marketingHistory:value}});
    assert.match(rank.limitations.join(' '),/no absence of prior marketing/);
  }
});
