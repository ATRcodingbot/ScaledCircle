'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const clip=require('polygon-clipping'),g=require('./property_service_area_geometry');
const {validateGeometry}=require('./property_intelligence');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const points=ring=>ring.slice(0,-1).map(([longitude,latitude])=>({latitude,longitude}));
const stored=(id,r)=>({id,name:id,enabled:true,geometryEncoding:'map-parts-v1',geometry:{points:points(r)},geometryParts:[{points:points(r)}]});
const geo=(id,coordinates)=>({id,name:id,geometry:{type:'Polygon',coordinates}});
const shape=c=>[[[...c.geometry.map(p=>[p.longitude,p.latitude]),[c.geometry[0].longitude,c.geometry[0].latitude]]]];
function verify(result,normalized,{complete=true}={}){
  assert.ok(result.candidates.length>0);
  for(const c of result.candidates){validateGeometry(c.geometry);assert.equal(clip.difference(shape(c),normalized.union).length,0,'no section outside saved geometry');}
  assert.equal(new Set(result.candidates.map(c=>c.id)).size,result.candidates.length);
  const union=clip.union(...result.candidates.map(shape));
  if(complete){assert.equal(result.sampling.complete,true);assert.equal(clip.difference(normalized.union,union).length,0,'no saved boundary or small piece omitted');}
}
test('actual map-parts-v1 large saved polygon is fully sectioned within original validator limits',()=>{
  const raw={geometryEncoding:'map-parts-v1',areas:[stored('main',rect(-76.9,38.9,.3,.3))]},before=structuredClone(raw);
  assert.throws(()=>validateGeometry(raw.areas[0].geometry.points),/too large/);
  const normalized=g.normalizeAreas(raw),result=g.candidates(normalized);
  verify(result,normalized);assert.ok(result.candidates.length>400);assert.deepEqual(raw,before);
  assert.equal(result.sampling.wholeAreaAnalyzed,false);
});
test('legacy geometryParts are authoritative and overlapping areas are deduplicated',()=>{
  const a=rect(-76.5,39,.008,.008),b=rect(-76.48,39,.004,.003);
  const raw={areas:[{id:'multi',name:'Multiple',geometry:points(a),geometryParts:[points(a),points(b)]},stored('overlap',a)]};
  const normalized=g.normalizeAreas(raw),result=g.candidates(normalized);verify(result,normalized);
  assert.ok(result.candidates.some(c=>c.areaIds.includes('multi')&&c.areaIds.includes('overlap')));
  for(let i=0;i<result.candidates.length;i++)for(let j=i+1;j<result.candidates.length;j++)assert.equal(g.intersects(shape(result.candidates[i]),shape(result.candidates[j])),false);
  const reverse=g.normalizeAreas({areas:[...raw.areas].reverse()});assert.equal(reverse.digest,normalized.digest);
  const reversedRings=g.normalizeAreas({areas:[stored('overlap',[...a].reverse()),{id:'multi',name:'Multiple',geometryParts:[[...b].reverse(),[...a].reverse()].map(points)}]});
  assert.equal(reversedRings.digest,normalized.digest);
  assert.deepEqual(g.candidates(reversedRings).candidates.map(c=>c.id).sort(),result.candidates.map(c=>c.id).sort());
});
test('explicit MultiPolygon retains tiny distant components, concavities and thin boundary slivers',()=>{
  const concave=[[-76,39],[-75.978,39],[-75.978,39.002],[-75.997,39.002],[-75.997,39.019],[-76,39.019],[-76,39]];
  const tiny=rect(-75.96,39.003,.00003,.000002),thin=rect(-75.951,39.005,.035,.0000001);
  const normalized=g.normalizeAreas({areas:[{id:'parts',geometry:{type:'MultiPolygon',coordinates:[[concave],[tiny],[thin]]}}]});
  verify(g.candidates(normalized),normalized);
});
test('holes entirely inside a cell are opened into sections and never filled',()=>{
  const outer=rect(-76.009,39.001,.008,.008),hole=rect(-76.006,39.004,.002,.002);
  const normalized=g.normalizeAreas({areas:[geo('hole',[outer,hole])]}),result=g.candidates(normalized);
  verify(result,normalized);assert.ok(result.candidates.length>=2);
  for(const c of result.candidates)assert.equal(g.intersects(shape(c),[[hole]]),false);
});
test('multiple holes and a hole crossed by grid lines preserve full coverage',()=>{
  const outer=rect(-76.03,39,.04,.025),holes=[rect(-76.025,39.001,.002,.003),rect(-76.012,39.009,.006,.005)];
  const normalized=g.normalizeAreas({areas:[geo('holes',[outer,...holes])]}),result=g.candidates(normalized);verify(result,normalized);
  for(const c of result.candidates)for(const hole of holes)assert.equal(g.intersects(shape(c),[[hole]]),false);
});
test('radius areas require explicit valid center/radius and remain inside maintained radius polygon',()=>{
  const normalized=g.normalizeAreas({areas:[{id:'radius',type:'around_business',center:{latitude:39,longitude:-76},radiusMiles:1}]});
  verify(g.candidates(normalized),normalized);
});
test('empty and malformed enabled geometry fail closed without point dropping or numeric coercion',()=>{
  for(const value of [null,{areas:[]},{areas:[{enabled:false}]},{areas:[{id:'missing'}]},
    {areas:[stored('bad',[[0,0],[1,0],[1,'1'],[0,0]])]},
    {areas:[stored('bad',[[0,0],[Infinity,0],[1,1],[0,0]])]},
    {areas:[{geometry:{points:[{longitude:0,latitude:0},{longitude:1,latitude:1},{longitude:2,latitude:2}]}}]},
    {areas:[{type:'around_business',center:{longitude:-76,latitude:39},radiusMiles:0}]}])assert.throws(()=>g.normalizeAreas(value));
});
test('large regions are deterministically sampled with bounded work and honest coverage',()=>{
  const normalized=g.normalizeAreas({areas:[geo('huge',[rect(-100,30,20,15)]),geo('small',[rect(-77,39,.001,.001)])]});
  const a=g.candidates(normalized,{maxCandidates:37}),b=g.candidates(normalized,{maxCandidates:37});
  assert.deepEqual(a,b);assert.ok(a.candidates.length<=37);assert.equal(a.sampling.complete,false);
  assert.ok(a.sampling.boundedGridCells<=a.sampling.iterationCap);assert.ok(a.sampling.approximatePlanarCoverageFraction<1);
  verify(a,normalized,{complete:false});assert.match(a.sampling.message,/Unexamined/);
  assert.ok(a.candidates.some(c=>c.areaIds.includes('small')));
});
test('history overlap means positive area, not shared edges or a bounding-box overlap',()=>{
  const a=[[rect(0,0,1,1)]],touch=[[rect(1,0,1,1)]],overlap=[[rect(.9,.9,.2,.2)]];
  assert.equal(g.intersects(a,touch),false);assert.equal(g.intersects(a,overlap),true);
  assert.equal(g.intersects(a,[[rect(2,2,1,1)]]),false);
  assert.equal(g.overlapsGeometry(points(a[0][0]),points(touch[0][0])),false);
  assert.equal(g.overlapsGeometry(points(a[0][0]),points(overlap[0][0])),true);
  assert.equal(g.isContained(points(rect(.1,.1,.5,.5)),a),true);
  assert.equal(g.isContained(points(rect(.99,.99,.1,.1)),a),false);
});
test('complex outlines are split to at most250 points without losing their shape',()=>{
  const r=Array.from({length:600},(_,i)=>{const angle=i*Math.PI/300,radius=i%2?.003:.004;return [-76.005+radius*Math.cos(angle),39.005+radius*Math.sin(angle)];});r.push(r[0]);
  const normalized=g.normalizeAreas({areas:[geo('detailed',[r])]}),result=g.candidates(normalized);
  verify(result,normalized);assert.ok(result.candidates.length>=4);
});
