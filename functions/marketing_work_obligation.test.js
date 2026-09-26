'use strict';
// Offline contract evidence only. This file invokes pure geometry evaluators;
// no callable, provider, financial operation, or production record is executed.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const parser=require('@babel/parser');
const progress=require('./route_progress'),coverage=require('./canvassing_completion');
const operations=require('./operational_layer');
const a={latitude:39,longitude:-76},b={latitude:39.001,longitude:-76};
const boundary=east=>[{latitude:38.9999,longitude:-76.0001},{latitude:39.0011,longitude:-76.0001},{latitude:39.0011,longitude:east},{latitude:38.9999,longitude:east}];
function zone(corridor){const centerline=[a,b];return {serviceArea:corridor,assignedHomes:225,estimatedHomes:225,executionRoute:{centerline,routeHash:progress.hash(centerline),corridorHash:progress.hash(corridor),denominatorMeters:progress.distance(a,b)}};}
const observed=Array.from({length:12},(_,i)=>({latitude:39+i*.001/11,longitude:-76,accepted:true,horizontalAccuracy:5,timestampMs:100000+i*10000}));
test('versioned route coverage does not add an obligation for unvisited campus/lake/park space inside the polygon',()=>{
 const small=coverage.coverage(zone(boundary(-75.9999)),observed),withEmptyLand=coverage.coverage(zone(boundary(-75.99)),observed);
 assert.equal(withEmptyLand.denominatorMeters,small.denominatorMeters);assert.equal(withEmptyLand.coveragePercentage,small.coveragePercentage);assert.ok(Math.abs(withEmptyLand.coveragePercentage-100)<1e-9);
 assert.equal(withEmptyLand.householdCoverage,null);
});
test('walking off the assigned route inside the polygon does not earn versioned route coverage',()=>{
 const z=zone(boundary(-75.99)),offRoute=observed.map(p=>({...p,longitude:-75.995}));
 assert.equal(coverage.coverage(z,offRoute).coveragePercentage,0);assert.ok(Math.abs(coverage.coverage(z,observed).coveragePercentage-100)<1e-9);
});
test('unverified property/workload counts cannot change the versioned route denominator or become household completion',()=>{
 const z=zone(boundary(-75.99)),ordinary=coverage.coverage(z,observed),changed=coverage.coverage({...z,assignedHomes:90000,estimatedHomes:90000,estimatedWalkingMeters:999999},observed);
 assert.equal(changed.coveragePercentage,ordinary.coveragePercentage);assert.equal(changed.denominatorMeters,ordinary.denominatorMeters);assert.equal(changed.householdCoverage,null);
});
test('changing the saved polygon cannot silently rewrite an accepted route binding',()=>{
 const z=zone(boundary(-75.9999));z.serviceArea=boundary(-75.99);assert.throws(()=>coverage.coverage(z,observed),/route_binding_invalid/);
});
// Characterize the preserved legacy fallback so the distinction remains
// explicit until a separately authorized migration replaces old obligations.
function legacyCalculate(){
 const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
 const names=new Set(['moneyValue','firstMoneyValue','validRoutePoints','calculateRouteCompletion','distanceMeters','pointInsidePolygon']);
 const found=parser.parse(source,{sourceType:'unambiguous'}).program.body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id?.name));
 assert.equal(found.length,names.size);
 return vm.runInNewContext(found.map(n=>source.slice(n.start,n.end)).join('\n')+'\ncalculateRouteCompletion',
  {routeProgress:progress,MINIMUM_PAYABLE_COMPLETION_PERCENTAGE:10,HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}}});
}
test('legacy fallback remains polygon-distance estimation and must not be presented as target/route verification',()=>{
 const calculate=legacyCalculate(),small=boundary(-75.9999),large=boundary(-75.99);
 const smallZone={serviceArea:small,assignedHomes:225,...operations.calculateGeometryWalkingEstimate(small)},largeZone={serviceArea:large,assignedHomes:225,...operations.calculateGeometryWalkingEstimate(large)};
 const smallResult=calculate(smallZone,observed),largeResult=calculate(largeZone,observed);
 assert.ok(largeResult.completionPercentage<smallResult.completionPercentage,'Empty added polygon area increases the geometry-derived legacy denominator.');
 const offRoute=observed.map(p=>({...p,longitude:-75.995}));assert.ok(calculate(largeZone,offRoute).completionPercentage>0,'Legacy inside-polygon walking has no assigned-route proximity test.');
 assert.equal(largeResult.completedHomes,Math.round(225*largeResult.completionPercentage/100));
});
