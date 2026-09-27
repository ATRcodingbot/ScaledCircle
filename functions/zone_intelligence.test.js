'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const z=require('./zone_intelligence'),planning=require('./smart_zone_planning'),geo=require('./smart_zone_geography');
const service=require('./smart_zone_serviceability'),fixture=require('./fixtures/21061-corkran-osm-public.json');
const shape=fixture.selectedBoundary;
const snapshot=()=>geo.snapshotFromElements(shape,fixture.elements,{dataTimestamp:fixture.dataTimestamp,fetchedAt:fixture.retrievedAt});
const feature=(id,building,extra={})=>({id,observedTags:{building,...extra}});
test('residential mix preserves explicit detached/attached/multifamily and unknown house attachment',()=>{
 const mix=z.propertyMix([feature('1','detached'),feature('2','terrace'),feature('3','apartments'),feature('4','house'),feature('5','yes')],'residential');
 assert.deepEqual(mix.categories,[{label:'Detached',count:1},{label:'Attached/semi-detached',count:1},
  {label:'Multifamily/shared residential',count:1},{label:'House (attachment unknown)',count:1}]);
 assert.equal(mix.classifiedCount,4);assert.equal(mix.unknownCount,1);
});
test('B2B category evidence does not inherit residential age claims',()=>{
 const result=z.project({geometry:shape,intent:'business',features:[feature('shop','retail',{shop:'hardware'})],
  propertyContext:{signals:[{label:'Predominant construction era',value:'1940–1959'},{label:'Business category',value:'Retail'}]}});
 assert.deepEqual(result.propertyMix.categories,[{label:'Retail',count:1}]);
 assert.deepEqual(result.regionalContext.signals,[{label:'Business category',value:'Retail'}]);
 assert.equal(result.workload,null);
});
test('unavailable evidence is unknown, not zero, and preserves exact geometry digest',()=>{
 const value=z.analyze({geometry:shape,workType:'flyer_distribution',snapshot:null});
 assert.equal(value.mappedTargetCount,null);assert.equal(value.propertyMix,null);assert.equal(value.supportingStreetMeters,null);
 assert.equal(value.geometryDigest,require('./operational_layer').zoneGeometryDigest(shape));
});
test('preview uses exact selected boundary and validated local streets with no paid/saved prerequisite',()=>{
 const result=z.analyze({geometry:shape,workType:'flyer_distribution',snapshot:snapshot()});
 assert.ok(result.mappedTargetCount>0);assert.ok(result.supportingStreetMeters>0);
 assert.equal(result.mode,'manual');assert.equal(result.executionRouteVerified,false);
 assert.equal(result.workload.propertiesPerHour,45);assert.equal(result.workload.networkTraversalFactor,2);
 assert.equal(result.geometryDigest,require('./operational_layer').zoneGeometryDigest(shape));
});
test('no local roads cannot fabricate walking distance or field time',()=>{
 const result=z.analyze({geometry:shape,workType:'flyer_distribution',snapshot:{...snapshot(),routeWays:[]}});
 assert.equal(result.workload,null);assert.equal(result.supportingStreetMeters,null);assert.ok(result.mappedTargetCount>0);
 assert.ok(result.limitations.some(v=>v.includes('0 of')));
});
test('unknown school extent and unsupported intent fail closed',()=>{
 const s=snapshot();s.unresolvedLandFeatures.push({id:'unknown',kind:'school',disposition:'unbounded_manual_review'});
 assert.equal(z.analyze({geometry:shape,workType:'flyer_distribution',snapshot:s}).mappedTargetCount,null);
 assert.equal(z.analyze({geometry:shape,workType:'event_marketing',snapshot:snapshot()}).workload,null);
});
test('serviceable network rejects motorways, ramps, access restrictions and school intersections',()=>{
 const snap=snapshot();const classified=service.shape({boundary:shape,anchor:fixture.anchor,snapshot:snap,
  workType:'flyer_distribution',propertiesPerHour:45,maximumZones:32,desiredTargetLimit:5000,desiredMinutes:360},planning);
 assert.ok(classified.analysis.segments.length);
 const excluded=snap.landFeatures.filter(f=>service.excluded(f.kind,'residential'));
 assert.ok(classified.analysis.segments.every(e=>excluded.every(p=>!service.lineHitsLand(e.from,e.to,p,planning))));
 for(const highway of ['motorway','motorway_link','trunk','trunk_link'])assert.equal(service.permitted({highway}),false);
 assert.equal(service.permitted({highway:'residential',foot:'no'}),false);
});
test('segment lengths are deduplicated, with no invented connector between separate clusters',()=>{
 const a={latitude:39,longitude:-76},b={latitude:39.001,longitude:-76},c={latitude:39.1,longitude:-76},d={latitude:39.101,longitude:-76};
 const result=z.project({geometry:shape,features:[],segments:[{from:a,to:b},{from:b,to:a},{from:c,to:d}]});
 assert.equal(result.supportingStreetMeters,223);
});
test('campaign work factors retain the existing model, never invent conversation durations',()=>{
 for(const type of ['flyer_distribution','door_hanger_distribution','door_to_door_outreach']){
  const r=z.analyze({geometry:shape,snapshot:snapshot(),workType:type});
  assert.equal(r.workload.campaignType,type);assert.equal(r.workload.conversationDuration,null);
  assert.equal(r.workload.minutes,z.analyze({geometry:shape,snapshot:snapshot(),workType:'flyer_distribution'}).workload.minutes);
 }
 const base=planning.estimateWorkload({estimatedProperties:45,estimatedWalkingMeters:160,workType:'flyer_distribution'});
 const yard=planning.estimateWorkload({estimatedProperties:45,estimatedWalkingMeters:160,workType:'yard_sign_installation'});
 assert.equal(base.estimatedMinutes,62);assert.equal(yard.estimatedMinutes,75);
});
test('six-hour limit is displayed without capping or inflating the underlying workload',()=>{
 const v=z.project({geometry:shape,features:[feature('1','house')],segments:[{from:shape[0],to:shape[1]}],workload:{estimatedMinutes:361}});
 assert.equal(v.workload.minutes,361);assert.equal(v.workload.oneScaler,false);assert.equal(v.workload.limitMinutes,360);
});
test('oversized selected area stays unchanged and produces no synthetic targets',()=>{
 const huge=planning.rectangleAround(fixture.anchor,8000,8000),before=JSON.stringify(huge);
 const r=z.analyze({geometry:huge,snapshot:snapshot(),workType:'flyer_distribution'});
 assert.equal(r.status,'unavailable');assert.match(r.limitations[0],/25 km²/);assert.equal(JSON.stringify(huge),before);
});
test('recommended per-area projection binds property context, observations and network to the exact area',()=>{
 const s=service.shape({boundary:shape,anchor:fixture.anchor,snapshot:snapshot(),workType:'flyer_distribution',
  propertiesPerHour:45,desiredTargetLimit:5000,maximumZones:32,desiredMinutes:360},planning);
 const c={...s.candidates[0],ranking:{reasons:['Supported residential concentration'],displaySignals:[{label:'Predominant construction era',value:'1940–1959'}],evidence:{source:'regional fixture'}},source:{name:'OpenStreetMap'}};
 const result=z.recommended(c,'flyer_distribution','residential');
 assert.equal(result.mode,'recommended');assert.equal(result.mappedTargetCount,c.features.length);
 assert.equal(result.supportingStreetMeters,c.mappedRouteMeters);assert.equal(result.workload.minutes,c.workload.estimatedMinutes);
 assert.equal(result.regionalContext.scope,'regional_property_context');
 assert.equal(result.geometryDigest,require('./operational_layer').zoneGeometryDigest(c.geometry));
 assert.equal(result.executionRouteVerified,false);
});
