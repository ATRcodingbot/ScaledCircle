"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {hash,distance,validateRoute,projectProgress}=require('./route_progress');
const corridor=[{latitude:39,longitude:-76},{latitude:39.01,longitude:-76},{latitude:39.01,longitude:-75.99}];
const line=[{latitude:39,longitude:-76},{latitude:39.001,longitude:-76}];
const route={centerline:line,routeHash:hash(line),corridorHash:hash(corridor),denominatorMeters:distance(...line)};
test('denominator is the bound centerline length, never polygon area estimate',()=>{
 assert.equal(validateRoute(route,corridor),distance(...line));
 assert.throws(()=>validateRoute({...route,denominatorMeters:784.63},corridor));
 assert.throws(()=>validateRoute({...route,centerline:[...line].reverse()},corridor));
});
const session={sessionId:'s',zoneId:'z',scalerId:'u',chunkCount:1,pointCount:2};
const chunks=[{sessionId:'s',zoneId:'z',scalerId:'u',startSequence:1,points:line.map((p,i)=>({...p,sequence:i+1,accepted:true}))}];
test('accepted uploaded GPS returns server calculation without record mutations',()=>{
 const zone={serviceArea:corridor,executionRoute:route};const before=JSON.stringify({session,zone,chunks});
 const p=projectProgress(session,zone,chunks,(z,points)=>{
  assert.equal(z.estimatedWalkingMeters,route.denominatorMeters);assert.equal(points.length,2);
  return {completionPercentage:32,insideZoneDistanceMeters:35};
 });
 assert.equal(p.coveragePercentage,32);assert.equal(p.provisional,true);
 assert.equal(JSON.stringify({session,zone,chunks}),before);
});
test('missing or inconsistent evidence is calculating, not false zero',()=>{
 assert.equal(projectProgress(session,{},[],()=>{throw Error();}).coveragePercentage,null);
 assert.equal(projectProgress({...session,scalerId:'wrong'}, {},chunks,()=>{throw Error();}).state,'calculating');
});
test('genuine zero remains zero when server calculation supports it',()=>{
 assert.equal(projectProgress(session,{estimatedWalkingMeters:100},chunks,()=>({completionPercentage:0,insideZoneDistanceMeters:0})).coveragePercentage,0);
});
