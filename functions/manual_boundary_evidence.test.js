'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const cache=require('./smart_zone_public_cache'),importer=require('./scripts/build_smart_zone_public_cache');
const geo=require('./smart_zone_geography'),zone=require('./zone_intelligence'),planning=require('./smart_zone_planning');
const fixture=require('./fixtures/ferndale-manual-public-cache-20260930.json');
const now=Date.parse('2026-09-30T12:00:00Z');
const geometry=[{latitude:39.174,longitude:-76.65},{latitude:39.174,longitude:-76.63},
 {latitude:39.186,longitude:-76.63},{latitude:39.186,longitude:-76.65}];
const road={type:'way',id:1,tags:{highway:'residential'},geometry:[{lat:39.179,lon:-76.649},{lat:39.179,lon:-76.631}]};
function building(id,lon,type='detached'){return {type:'way',id,tags:{building:type},geometry:[
 {lat:39.1791,lon},{lat:39.1792,lon},{lat:39.1792,lon:lon+.0001},{lat:39.1791,lon:lon+.0001},{lat:39.1791,lon}]};}
function bundle(elements=[road,building(2,-76.648),building(3,-76.632)]){
 const bounds=[-76.66,39.16,-76.62,39.20],coverage=[[[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[0],bounds[1]]]]];
 return importer.build({payload:{bounds,elements,referenceIncomplete:false,sourceSha256:'a'.repeat(64),
  sourceDataTimestamp:new Date(now).toISOString(),retrievedAt:new Date(now).toISOString(),buildingInventoryComplete:true,
  inventoryVersion:'OsmPublicObjectsV2'},sourceCoverage:coverage,now});
}
function store(b){return {readManifest:async()=>b?.manifest||null,readBlob:async name=>b.objects.get(name),
 readWindow:async()=>null,reserveRefresh:async()=>null};}
async function analyze(b,shape=geometry){const snapshot=await cache.createAcquirer({store:store(b),now:()=>now,
 allowPartialRegional:true,liveFetch:()=>assert.fail('No provider request authorized in test')})({selectedBoundary:shape});
 return zone.analyze({geometry:shape,snapshot,workType:'flyer_distribution'});}
test('manual area unrelated to recommendation candidates crosses cache tiles with exact geometry and distinct objects',async()=>{
 const b=bundle(),result=await analyze(b);
 assert.equal(result.mappedTargetCount,2);assert.equal(result.coverage.state,'complete');
 assert.ok(result.coverage.requestedTileCount>1);assert.ok(result.supportingStreetMeters>0);
 assert.equal(result.geometryDigest,require('./operational_layer').zoneGeometryDigest(geometry));
 assert.ok(result.workloadComponents.targetHandlingMinutes>0);assert.ok(result.workloadComponents.walkingMinutes>0);
 assert.equal(result.workloadComponents.estimatedTeamElapsedMinutes,null);
});
test('partial tile coverage retains only guarded interior observations and never full-boundary workload',async()=>{
 const b=bundle();delete b.manifest.tiles['-1916_979'];
 const result=await analyze(b);assert.equal(result.status,'partial');assert.equal(result.coverage.state,'partial');
 assert.equal(result.mappedTargetCount,1);assert.equal(result.workload,null);
 assert.ok(result.supportingStreetMeters>0);assert.equal(result.walkingEvidence.walkingOnly,true);
 const strict=await cache.createReader({store:store(b),now:()=>now})(geometry);assert.equal(strict,null);
});
test('cache missing/failing or provider timeout never becomes numeric zero or empty success',async()=>{
 for(const b of [null,{manifest:{complete:true},objects:new Map()}]){
  const result=await analyze(b);assert.equal(result.status,'unavailable');assert.equal(result.mappedTargetCount,null);
 }
 const result=zone.analyze({geometry,snapshot:null,workType:'flyer_distribution',acquisition:{reasonCode:'timeout'}});
 assert.equal(result.mappedTargetCount,null);assert.equal(result.acquisition.reasonCode,'timeout');
});
test('outside cached coverage reports exact bounds and a bounded coverage reason rather than no properties',async()=>{
 const shape=geometry.map(p=>({...p,longitude:p.longitude+.1}));let diagnostic;
 const snapshot=await cache.createAcquirer({store:store(bundle()),now:()=>now,allowPartialRegional:true,
  liveFetch:()=>assert.fail('No live retry')})({selectedBoundary:shape,onDiagnostic:d=>diagnostic=d});
 assert.equal(snapshot,null);assert.equal(diagnostic.cacheReason,'outside_cache_coverage');
 assert.deepEqual(diagnostic.coverage.queryBounds,cache.boundsOf(shape));
 const result=zone.analyze({geometry:shape,snapshot,workType:'flyer_distribution',acquisition:diagnostic});
 assert.equal(result.mappedTargetCount,null);assert.match(result.limitations[0],/does not cover/);
});
test('unclassified buildings stay unclassified; valid streets survive missing property/target details',async()=>{
 const result=await analyze(bundle([road,building(2,-76.644,'yes')]));
 assert.equal(result.mappedTargetCount,null);assert.equal(result.unclassifiedMappedFeatureCount,1);
 assert.equal(result.status,'partial');assert.equal(result.regionalContext,null);
 assert.ok(result.supportingStreetMeters>0);assert.equal(result.workload,null);assert.ok(result.walkingEvidence.minutes>0);
});
test('successful complete empty inventory is distinct from missing acquisition and unknown classification',async()=>{
 const result=await analyze(bundle([]));assert.equal(result.status,'empty');assert.equal(result.mappedTargetCount,0);
 assert.equal(result.coverage.inventoryComplete,true);assert.equal(result.workload,null);
});
test('nearby retained Ferndale public fixture exposes classification gap and roads, not Founder original coordinates',()=>{
 const snapshot=geo.snapshotFromElements(fixture.geometry,fixture.elements,{dataTimestamp:fixture.source.snapshotAt,fetchedAt:fixture.source.retrievedAt});
 const result=zone.analyze({geometry:fixture.geometry,snapshot,workType:'flyer_distribution'});
 assert.equal(result.mappedTargetCount,null);assert.equal(result.coverage.inventoryComplete,false);
 assert.ok(result.supportingStreetMeters>0);assert.equal(result.workload,null);
 assert.ok(result.diagnostics.inputRoadWayCount>0);assert.equal(result.diagnostics.classifiedInBoundaryCount,0);
});
test('localized incomplete exclusion keeps its avoidance area without erasing unrelated supported streets',async()=>{
 const marker={type:'node',id:77,tags:{amenity:'school'},lat:39.183,lon:-76.632};
 const result=await analyze(bundle([road,building(2,-76.644),marker]));
 assert.equal(result.mappedTargetCount,1);assert.ok(result.supportingStreetMeters>0);
 assert.ok(result.diagnostics.geometryDiagnostics.localizedUncertainties>0);
});
test('retained missing relation dependency remains explicit and cannot certify an unbounded exclusion',()=>{
 const snapshot=geo.snapshotFromElements(geometry,[road,building(2,-76.644),{type:'relation',id:80,
  tags:{amenity:'school',type:'multipolygon'},members:[{type:'way',ref:999,role:'outer'}]}]);
 const result=zone.analyze({geometry,snapshot,workType:'flyer_distribution'});
 assert.equal(result.status,'unavailable');assert.equal(result.mappedTargetCount,null);
});
test('cross-tile copies preserve complete relation members and reject conflicting same-source objects',async()=>{
 const b=bundle([road,building(2,-76.644),{type:'relation',id:33,tags:{type:'multipolygon',building:'detached'},
  members:[{type:'way',ref:88,role:'outer',geometry:building(88,-76.64005).geometry}]}]);
 const snapshot=(await cache.createReader({store:store(b),now:()=>now})(geometry)).snapshot;
 assert.equal(snapshot.targetFeatures.filter(f=>f.id==='relation/33').length,1);
 const result=zone.analyze({geometry,snapshot,workType:'flyer_distribution'});assert.equal(result.mappedTargetCount,2);
});
test('manual analysis uses factual shape without replacing the boundary with a candidate hull',()=>{
 const before=JSON.stringify(fixture.geometry),snapshot=geo.snapshotFromElements(fixture.geometry,fixture.elements);
 zone.analyze({geometry:fixture.geometry,snapshot,workType:'flyer_distribution'});
 assert.equal(JSON.stringify(fixture.geometry),before);assert.ok(planning.validateGeometry(fixture.geometry).valid);
});
