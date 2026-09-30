"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const pi=require('./property_intelligence'),fit=require('./property_service_area_analysis');
const connected=require('./smart_zone_connected_territory'),binding=require('./property_map_binding');
const capacity=require('./own_team_capacity'),contract=require('./smart_zone_entry_contract');
const g=[{latitude:39,longitude:-76},{latitude:39,longitude:-75.99},{latitude:39.01,longitude:-75.99},{latitude:39.01,longitude:-76}];
const rec=(id,x=.003,year=1970,type='DWEL Standard Unit',residential=true)=>({propertyId:id,latitude:39.003,longitude:-76+x,yearBuilt:year,yearBuiltBucket:pi.yearBucket(year),propertyType:type,residential,structureAreaSquareFeet:1800});
const context=goal=>({goal,services:['Deck repair and construction','Roofing','Concrete work'],targetIntent:'residential',campaignType:'flyer_distribution'});
const analysis=records=>({...pi.analyzeParcelObservations(records,{geometry:g}),geometryDigest:pi.geometryDigest(g)});
test('raw mixed goal retains distinct service intents and exclusions fail closed',()=>{
 assert.deepEqual(fit.serviceIntents(context('deck repairs or builds, roofing leads, cement work')).requested,['roofing','deck_repair','deck_build','concrete']);
 assert.equal(fit.serviceIntents({...context('roofing'),excludedServices:['Roofing']}).error,'This goal names a service excluded by your saved Business preferences.');
});
test('explicit goal does not acquire unrelated profile priorities and generic share is not personalized',()=>{
 const context={goal:'residential roofing',services:['build decks','fences','contracting MHIC work'],priorityServices:['build decks'],targetIntent:'residential'};
 assert.deepEqual(fit.serviceIntents(context).requested,['roofing']);
 assert.equal(fit.rankAnalysis(analysis([rec('a')]),{...context,goal:'general outreach',services:['General services'],priorityServices:[]}).personalizationStatus,'unavailable');
 const attached=analysis([rec('attached',.003,1970,'DWEL Center Unit')]);
 assert.equal(fit.rankAnalysis(attached,{...context,goal:'only detached homes for roofing'}).fit,null);
});
test('same property snapshot supports roof age proxy; deck build and concrete honestly tie on type',()=>{
 const a=analysis([rec('old'),rec('new',.004,2020)]);
 const roof=fit.rankAnalysis(a,context('roofing')),deck=fit.rankAnalysis(a,context('new deck construction')),cement=fit.rankAnalysis(a,context('cement work'));
 assert.equal(roof.scoreComponents.find(c=>c.intent==='roofing').ageFit,50);
 assert.ok(roof.fit<deck.fit);assert.equal(deck.fit,cement.fit);
 assert.match(roof.limitations.join(' '),/not component condition/);assert.doesNotMatch(roof.reasons.join(' '),/needs replacing|guaranteed leads|buying intent is/);
});
test('hard residential / commercial and ground-oriented constraints reject unsuitable records',()=>{
 const a=analysis([rec('commercial',.003,1970,'OFFICE Office Building',false)]);
 assert.equal(fit.rankAnalysis(a,context('residential roofing')).fit,null);
 assert.ok(fit.rankAnalysis(a,{...context('commercial roofing'),targetIntent:'business'}).fit!==null);
 const multi=analysis([rec('multi',.003,1970,'Apartment')]);
 assert.equal(fit.rankAnalysis(multi,context('only detached homes for deck building')).fit,null);
});
test('candidate projection clips official account points and preserves unknown years, never nearest matches',()=>{
 const a=analysis([rec('a'),rec('outside',.009),rec('unknown',.004,null)]),small=g.map(p=>({...p,longitude:p.longitude===-75.99?-75.995:p.longitude}));
 const v=fit.projectPropertyFacts(a,small);assert.equal(v.propertyCount,2);assert.equal(v.recordCoverage.knownYearRecords,1);
 assert.equal(v.geometryDigest,pi.geometryDigest(small));assert.equal(v.propertyRecords.find(r=>r.yearBuilt===null).yearBuilt,null);
});
test('ambiguous duplicate account geometry/year and malformed years are not guessed',()=>{
 const a=pi.analyzeParcelObservations([rec('same'),rec('same',.004,1980)],{geometry:g});assert.equal(a.propertyCount,0);assert.equal(a.recordCoverage.ambiguousRecords,1);
 const f=pi.MARYLAND_FIELDS;
 for(const year of ['1970abc','0','','9999',null])assert.equal(pi.normalizeMarylandRecord({[f.propertyId]:'id',[f.latitude]:39.003,[f.longitude]:-75.997,[f.yearBuilt]:year}).yearBuilt,null);
 assert.equal(analysis([rec('type'),rec('type',.003,1970,'OFFICE Office',false)]).recordCoverage.ambiguousRecords,1);
});
test('missing official schema fails closed and unusable spatial records remain explicit partial coverage',async()=>{
 const a={OBJECTID:1,ACCTID:'one',YEARBLT:1970,DESCBLDG:'DWEL Standard Unit',DESCLU:'Residential'};
 await assert.rejects(new pi.MarylandParcelPointProvider({fetchJson:async()=>({spatialReference:{wkid:4326},features:[{attributes:{...a,DESCBLDG:undefined},geometry:{x:-75.997,y:39.003}}].map(f=>JSON.parse(JSON.stringify(f)))})}).analyze({geometry:g}),/schema_missing/);
 const v=await new pi.MarylandParcelPointProvider({fetchJson:async()=>({spatialReference:{wkid:4326},exceededTransferLimit:false,
  features:[{attributes:a,geometry:{x:-75.997,y:39.003}},{attributes:{...a,OBJECTID:2,ACCTID:'two'},geometry:{x:null,y:null}}]})}).analyze({geometry:g});
 assert.equal(v.providerPagination.rejectedRecords,1);assert.equal(v.partialCoverage,true);assert.equal(v.recordCoverage.complete,false);
});
test('sparse OSM acquires classification only from unique official point inside a complete footprint',()=>{
 const footprint=[{latitude:39.002,longitude:-75.998},{latitude:39.002,longitude:-75.996},{latitude:39.004,longitude:-75.996},{latitude:39.004,longitude:-75.998}];
 const s={targetFeatures:[{id:'b',latitude:39.003,longitude:-75.997,kind:'unclassified_building',footprint,footprintComplete:true,observedTags:{building:'yes'}}]};
 const v=binding.bind(s,analysis([rec('a')]),g);assert.equal(v.snapshot.targetFeatures[0].kind,'residential');assert.equal(v.matching.newlyClassifiedFootprints,1);
 assert.equal(v.snapshot.targetFeatures[0].yearBuilt,undefined);assert.equal(s.targetFeatures[0].kind,'unclassified_building');
 const ambiguous=binding.bind(s,analysis([rec('a'),rec('b',.0035)]),g);assert.equal(ambiguous.matching.ambiguousFootprints,1);assert.equal(ambiguous.snapshot.targetFeatures[0].kind,'unclassified_building');
 const overlap=binding.bind({targetFeatures:[...s.targetFeatures,{...s.targetFeatures[0],id:'second'}]},analysis([rec('a')]),g);assert.equal(overlap.matching.newlyClassifiedFootprints,0);
});
test('official provider validates schema/spatial reference, paginates and excludes owner fields',async()=>{
 const requests=[];let n=0;
 const provider=new pi.MarylandParcelPointProvider({fetchJson:async url=>{requests.push(url);n++;return {spatialReference:{wkid:4326},exceededTransferLimit:n===1,features:[{geometry:{x:-75.997,y:39.003},attributes:{OBJECTID:n,ACCTID:'p'+n,JURSCODE:'02',YEARBLT:n===1?'1970':null,DESCBLDG:'DWEL Standard Unit',DESCLU:'Residential',SQFTSTRC:1500,BLDG_UNITS:1,MDPVDATE:Date.UTC(2026,0,1)}}]};}});
 const a=await provider.analyze({geometry:g});assert.equal(requests.length,2);assert.equal(a.propertyCount,2);assert.equal(a.providerPagination.truncated,false);assert.equal(a.recordCoverage.knownYearRecords,1);
 assert.ok(requests.every(u=>!decodeURIComponent(u).match(/OWNER|ADDRESS|CONDITION/)));assert.equal(new URL(requests[1]).searchParams.get('where'),'OBJECTID > 1');
 for(const patch of [{error:{code:400}},{spatialReference:{wkid:3857}}, {features:[{geometry:{x:0,y:0},attributes:{OBJECTID:1,ACCTID:'a'}}]}])
  await assert.rejects(new pi.MarylandParcelPointProvider({fetchJson:async()=>({spatialReference:{wkid:4326},features:[],...patch})}).analyze({geometry:g}));
});
test('incomplete pagination is explicit and cannot become complete inventory',async()=>{
 let pages=0;const p=new pi.MarylandParcelPointProvider({fetchJson:async()=>({spatialReference:{wkid:4326},exceededTransferLimit:true,features:Array.from({length:1000},(_,i)=>({geometry:{x:-75.997,y:39.003},attributes:{OBJECTID:++pages,ACCTID:'p'+pages,YEARBLT:'1970',DESCBLDG:'DWEL Standard Unit',DESCLU:'Residential'}}))})});
 const a=await p.analyze({geometry:g});assert.equal(a.propertyCount,5000);assert.equal(a.partialCoverage,true);assert.equal(a.recordCoverage.complete,false);
 await assert.rejects(new pi.MarylandParcelPointProvider({fetchJson:async()=>({spatialReference:{wkid:4326},features:[],exceededTransferLimit:true})}).analyze({geometry:g}),/pagination_incomplete/);
});
function c(id,x,minutes=15){const geometry=[{latitude:39.001,longitude:-76+x},{latitude:39.001,longitude:-76+x+.001},{latitude:39.002,longitude:-76+x+.001},{latitude:39.002,longitude:-76+x}];return {id,geometry,propertyAreaId:id,features:[{id:'f'+id,latitude:39.0015,longitude:-76+x+.0005}],networkSegments:[{from:{latitude:39.0015,longitude:-76+x},to:{latitude:39.0015,longitude:-76+x+.001}}],workload:{estimatedMinutes:minutes},ranking:{fit:90}};}
const region=require('./property_service_area_geometry').normalizeAreas({areas:[{geometry:g}]}).union;
test('one practical territory cannot aggregate disconnected pockets or outside targets/networks',()=>{
 const a=c('a',.001),b=c('b',.002),away=c('away',.006);const e={candidates:[a,b,away],propertyCandidates:[a,b,away].map(x=>({id:x.id,ranking:x.ranking}))};
 const opts=connected.options(e,capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'stay_together'}),region);
 assert.equal(opts[0].selected.length,2);assert.equal(opts[0].territory.length,1);assert.equal(opts[1].selected.length,1);
 assert.throws(()=>connected.assertSelection([a,away],region),/disconnected/);
 assert.equal(connected.contained({...a,features:[{...a.features[0],longitude:-77}]},region),false);
 assert.equal(connected.contained({...a,networkSegments:[{from:a.networkSegments[0].from,to:{latitude:39.5,longitude:-76}}]},region),false);
});
test('network crossing an exclusion hole fails even when both endpoints are inside outer boundary',()=>{
 const hole=[[-75.996,39.002],[-75.994,39.002],[-75.994,39.008],[-75.996,39.008],[-75.996,39.002]];
 assert.equal(connected.segmentContained({latitude:39.005,longitude:-75.999},{latitude:39.005,longitude:-75.991},[[region[0][0],hole]]),false);
});
test('shared street length cannot be double-counted and contiguous growth cannot worsen duration fit',()=>{
 const a=c('a',.001,120),b={...c('b',.001,180),features:[{...c('b',.001).features[0],id:'other'}]};
 assert.equal(connected.compatible(a,b),false);
 const next=c('next',.002,300),e={candidates:[a,next],propertyCandidates:[a,next].map(x=>({id:x.id,ranking:x.ranking}))};
 const options=connected.options(e,capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'stay_together'}),region);
 assert.equal(options[0].selected.length,1);assert.equal(options[0].selected[0].workload.estimatedMinutes,120);
});
test('stay together keeps 8 labor hours distinct from 4 unique coverage hours; split lanes remain complementary',()=>{
 const r=capacity.requirement({sessionHours:4,marketerCount:2,coveragePattern:'stay_together'});assert.equal(r.plannedLaborHours,8);assert.equal(r.uniqueCoverageTargetMinutes,240);
 const a=c('a',.001,60),b=c('b',.002,30),d=c('d',.003,45);
 const shared=capacity.allocate(r,[a,b,d]);assert.equal(shared.allocations.length,1);assert.equal(shared.estimatedFieldElapsedMinutes,135);
 const split=capacity.allocate({...r,coveragePattern:'split_streets'},[a,b,d]);assert.equal(split.connectedComplementarySections,true);assert.equal(split.allocations.length,2);assert.equal(new Set(split.allocations.flatMap(x=>x.sectionIds)).size,3);
 assert.equal(split.estimatedFieldElapsedMinutes,Math.max(...split.allocations.map(x=>x.minutes)));assert.equal(split.estimatedElapsedMinutes,null);
});
test('within-preview missing or mismatched scope never falls back to ZIP',()=>{
 assert.throws(()=>contract.recommendationScope({recommendationScope:'within_preview',areaSelection:{query:'21061'}}),/preview_boundary_required/);
 assert.throws(()=>contract.recommendationScope({recommendationScope:'location',analysisBoundary:g}),/invalid_recommendation_scope/);
 assert.equal(contract.recommendationScope({analysisBoundary:g}).scope,'within_preview');
});
test('relation footprint uncertainty and explicit holes cannot supply a guessed official match',()=>{
 const footprint=[{latitude:39.002,longitude:-75.998},{latitude:39.002,longitude:-75.996},{latitude:39.004,longitude:-75.996},{latitude:39.004,longitude:-75.998}];
 const f={id:'relation/123',kind:'unclassified_building',footprint};
 assert.equal(binding.bind({targetFeatures:[f]},analysis([rec('a')]),g).matching.matchedFootprints,0);
 assert.equal(binding.bind({targetFeatures:[{...f,footprintComplete:true,footprintHoles:[footprint]}]},analysis([rec('a')]),g).matching.matchedFootprints,0);
});

test('no usable years cannot invent a predominant era or zero-percent older properties',()=>{
 const a=analysis([rec('unknown',.003,null)]);assert.equal(a.predominantConstructionEra,'Unavailable');assert.equal(a.percent20PlusYearsOld,null);
 assert.equal(a.propertyAgeSignal,null);assert.equal(a.propertyAgeSignalCategory,'UNAVAILABLE');assert.doesNotMatch(a.aiSummary,/newer|older/);
 assert.equal(fit.rankAnalysis(a,context('roofing')).fit,null);assert.equal(fit.rankAnalysis(a,context('new deck construction')).fit,100);
});
test('recorded neutral fields use the exact official endpoint only, with redirect/secret protections preserved',async()=>{
 const http=require('./property_source_http');let calls=0;
 await assert.rejects(http.fetchJson('https://mdgeodata.md.gov/imap/rest/services/Other/MapServer/0/query'),/endpoint_not_allowed/);
 assert.deepEqual(await http.fetchJson('https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0/query?f=json',{fetchImpl:async()=>{calls++;return new Response('{}',{headers:{'content-type':'application/json'}})}}),{});
 assert.equal(calls,1);
});

test('retained official Corkran records feed the SAME service scorer with scoped type/year denominators',()=>{
 const fixture=require('./fixtures/21061-corkran-property-points-public-20260930.json'),osm=require('./fixtures/21061-corkran-osm-public.json');
 const records=fixture.records.map(r=>({...r,yearBuilt:/^\d{4}$/.test(String(r.yearBuilt))?Number(r.yearBuilt):null,
  yearBuiltBucket:pi.yearBucket(Number(r.yearBuilt)),residential:!/commercial|exempt/i.test(r.landUse||'')&&/residential/i.test(r.landUse||'')}));
 const facts={...pi.analyzeParcelObservations(records,{geometry:osm.selectedBoundary,partialCoverage:!fixture.complete}),
  geometryDigest:pi.geometryDigest(osm.selectedBoundary)};
 assert.ok(facts.propertyCount>0);assert.ok(facts.recordCoverage.knownYearRecords>0);
 for(const goal of ['residential roofing','deck repair','new deck construction','concrete work']) {
  const ranked=fit.rankAnalysis(facts,context(goal));assert.ok(ranked.scoreComponents.length);assert.ok(Number.isFinite(ranked.fit));
  assert.equal(ranked.recordCoverage.insideRecords,facts.propertyCount);assert.ok(ranked.scoreComponents.every(c=>c.knownYearCount<=c.recordCount));
 }
});
