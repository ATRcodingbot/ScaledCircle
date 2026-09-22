'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),g=require('./weather_geography');
const box=(x,y,size=1)=>({type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]});
const saved=(id,x)=>({id,name:id,geometry:box(x,0).coordinates[0].map(([longitude,latitude])=>({longitude,latitude}))});
test('saved and explicitly added geography match; names alone cannot broaden scope',()=>{
 const c=g.coverage({preferences:{areas:[saved('inside',0),saved('outside',10),{id:'name-only',name:'inside'}]},extraAreas:[saved('watch',0)]});
 const result=g.matches(c,{geometry:g.geometry(box(.5,0)),basis:'official_polygon'});
 assert.deepEqual(result.map(r=>r.id),['inside','watch']);assert(result.every(r=>r.partial));assert.equal(c.unresolved.length,1);
 assert.equal(g.matches(g.coverage({preferences:{areas:[saved('outside',10)]}}),{geometry:g.geometry(box(0,0))}).length,0);
});
test('null-polygon county alerts resolve official county geometry; unresolved is not no alerts',async()=>{
 const a=await g.alertGeometry({geometry:null,properties:{geocode:{UGC:['MDC003']}}},async url=>{assert.equal(url,'https://api.weather.gov/zones/county/MDC003');return {geometry:box(0,0)};});
 assert.equal(g.matches(g.coverage({preferences:{areas:[saved('inside',0)]}}),a).length,1);
 await assert.rejects(g.alertGeometry({properties:{}},async()=>{}),/unresolved/);
 await assert.rejects(g.alertGeometry({properties:{affectedZones:['https://api.weather.gov/zones/forecast/MDZ014']}},async()=>{throw Error('provider_unavailable');}),/provider_unavailable/);
});
test('polygon authority is retained even when affected county is broader; preference reread can suppress',async()=>{
 const a=await g.alertGeometry({geometry:box(0,0),properties:{geocode:{UGC:['MDC003']}}},async()=>{throw Error('must not broaden polygon');});
 assert.equal(g.matches(g.coverage({preferences:{areas:[saved('changed',10)]}}),a).length,0);
});
