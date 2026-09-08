'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const route=require('./canvassing_route_authority'),{distance}=require('./route_progress');
const geometry=require('./smart_zone_geography');
const a={latitude:40,longitude:-75},b={latitude:40.001,longitude:-75},c={latitude:40.001,longitude:-74.999};
const corridor=[{latitude:39.9999,longitude:-75.0001},{latitude:40.0011,longitude:-75.0001},
  {latitude:40.0011,longitude:-74.9989},{latitude:39.9999,longitude:-74.9989}];
const make=(ways=[{id:'road',geometry:[a,b,c],highway:'residential'}],extra={})=>({campaignId:'campaign',zoneId:'zone',corridor,
  snapshot:{source:'openstreetmap_bounded_snapshot_v1',routeWays:ways,exclusionPolygons:[],...extra},accessAcknowledged:true});
test('ordinary maintained geographic snapshot yields stable route and unique denominator',()=>{
 const snapshot=geometry.snapshotFromElements(corridor,[{id:1,tags:{highway:'residential'},geometry:[a,b,c].map(p=>({lat:p.latitude,lon:p.longitude}))}]);
 const input={...make(),snapshot},x=route.derive(input),y=route.derive(structuredClone(input));
 assert.deepEqual(x,y);assert.ok(Math.abs(x.executionRoute.uniqueRouteMeters-distance(a,b)-distance(b,c))<.001);
 assert.ok(Math.abs(x.executionRoute.denominatorMeters-2*x.executionRoute.uniqueRouteMeters)<.001);
 assert.equal(x.coverageAuthority.householdCoverage,null);
 route.assertReady({id:'zone',campaignId:'campaign',serviceArea:corridor,...x},{completionPolicyVersion:route.POLICY});
});
test('reverse/duplicate provider ways do not duplicate the denominator',()=>{
 const single=route.derive(make());
 const duplicated=route.derive(make([{id:'b',geometry:[c,b,a],highway:'residential'},{id:'a',geometry:[a,b,c],highway:'residential'}]));
 assert.deepEqual(duplicated.executionRoute,single.executionRoute);
});
test('overlapping ways with different vertices share one unique denominator',()=>{
 const middle={latitude:40.0005,longitude:-75};
 const one=route.derive(make([{id:1,geometry:[a,middle,b],highway:'residential'}]));
 const many=route.derive(make([{id:1,geometry:[a,middle,b],highway:'residential'},
  {id:2,geometry:[a,b],highway:'residential'}]));
 assert.deepEqual(many.executionRoute,one.executionRoute);
 assert.throws(()=>route.derive(make(undefined,{exclusionPolygons:[[a,b]]})),/malformed_exclusion/);
});
test('missing linework, malformed geometry, and empty route fail closed',()=>{
 assert.throws(()=>route.derive({...make(),corridor:[]}),/invalid_zone/);
 assert.throws(()=>route.derive(make([])),/no_serviceable/);
 assert.throws(()=>route.derive(make([{id:1,highway:'residential',geometry:[a,{latitude:NaN,longitude:2}]}])),/malformed/);
});
test('private/access-restricted roads cannot establish a payable route',()=>{
 for(const props of [{access:'private'},{foot:'no'},{highway:'service',service:'driveway'},{bridge:'yes'},{tunnel:'yes'}])
  assert.throws(()=>route.derive(make([{id:1,geometry:[a,b],highway:'residential',...props}])),/no_serviceable/);
});
test('disconnected road components are not joined across unobserved connectors',()=>{
 assert.throws(()=>route.derive(make([{id:1,geometry:[a,b],highway:'residential'},
  {id:2,geometry:[{latitude:40.0001,longitude:-74.9995},{latitude:40.0005,longitude:-74.9995}],highway:'residential'}])),/disconnected/);
});
test('water/access exclusion is never crossed by the generated route',()=>{
 const water=[{latitude:40.0004,longitude:-75.00005},{latitude:40.0006,longitude:-75.00005},
  {latitude:40.0006,longitude:-74.99995},{latitude:40.0004,longitude:-74.99995}];
 assert.throws(()=>route.derive(make([{id:1,geometry:[a,b],highway:'residential'}],{exclusionPolygons:[water]})),/disconnected/);
});
test('new payable publication rejects unreviewed routes and changed denominator',()=>{
 const input=make();input.accessAcknowledged=false;const z={id:'zone',campaignId:'campaign',serviceArea:corridor,...route.derive(input)};
 assert.throws(()=>route.assertReady(z,{completionPolicyVersion:route.POLICY}),/coverage_authority/);
 const approved={id:'zone',campaignId:'campaign',serviceArea:corridor,...route.derive(make())};approved.executionRoute.denominatorMeters++;
 assert.throws(()=>route.assertReady(approved,{completionPolicyVersion:route.POLICY}),/denominator/);
 assert.doesNotThrow(()=>route.assertReady({}, {campaignType:'yardCleanup'}));
});
