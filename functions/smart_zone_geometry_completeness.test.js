'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const geography=require('./smart_zone_geography'),geo=require('./smart_zone_planning'),service=require('./smart_zone_serviceability');
const f=require('./smart_zone_geographic_fixtures');
const boundary=geo.rectangleAround(f.anchor,2500,2500);
const snapshot=elements=>geography.snapshotFromElements(boundary,elements);
const shape=elements=>service.shape({anchor:f.anchor,boundary,snapshot:snapshot(elements),workType:'flyer_distribution',
 propertiesPerHour:45,desiredTargetLimit:5000,maximumZones:32,desiredMinutes:300},geo);
const relation=members=>({type:'relation',id:90001,tags:{type:'multipolygon',amenity:'school'},members});
const member=(ref,geometry,role='outer')=>({type:'way',ref,role,geometry});

test('split/reversed outer ways and duplicate member references join without fabricated closing lines',()=>{
 const ring=f.ring(500,500,700,700),a=member(1,ring.slice(0,3)),b=member(2,[...ring.slice(2)].reverse());
 const parsed=geography.elementFootprints(relation([b,a,{...a,geometry:[...a.geometry].reverse()}]));
 assert.equal(parsed.incomplete,false);assert.equal(parsed.footprints.length,1);assert.equal(parsed.footprints[0].polygon.length,5);
});
test('consecutive duplicate coordinates normalize; conflicting member geometry stays uncertain',()=>{
 const ring=f.ring(500,500,700,700),a=member(1,[ring[0],...ring]);
 assert.equal(geography.elementFootprints(relation([a])).incomplete,false);
 const parsed=geography.elementFootprints(relation([a,member(1,f.ring(100,100,200,200))]));
 assert.ok(parsed.reasons.includes('conflicting_member'));
});
test('inner hole is preserved; access still needs independent classified targets and permitted roads',()=>{
 const outer=f.ring(-800,-800,800,800),inner=f.ring(-400,-400,400,400);
 const land=relation([member(1,outer),member(2,[...inner].reverse(),'inner')]);
 const parsed=geography.elementFootprints(land);
 assert.equal(parsed.incomplete,false);assert.equal(parsed.footprints[0].holes.length,1);
 const result=shape([...f.grid(),land]);assert.ok(result.candidates.length);
 for(const c of result.candidates) assert.equal(service.polygonHitsLand(c.geometry,parsed.footprints[0],geo),false);
 assert.equal(shape([land]).candidates.length,0);
});
test('hole outside outer or touching it remains uncertain rather than granting access',()=>{
 for(const hole of [f.ring(900,900,1000,1000),f.ring(-800,-200,0,200)]) {
  const parsed=geography.elementFootprints(relation([member(1,f.ring(-800,-800,800,800)),member(2,hole,'inner')]));
  assert.equal(parsed.incomplete,true);assert.ok(parsed.reasons.includes('invalid_inner_topology'));
 }
});
test('separate outers and island inside a valid hole retain topology without merging disconnected land',()=>{
 const r=relation([member(1,f.ring(-800,-800,800,800)),member(2,f.ring(-400,-400,400,400),'inner'),
  member(3,f.ring(-50,-50,50,50)),member(4,f.ring(900,900,1100,1100))]);
 const parsed=geography.elementFootprints(r);assert.equal(parsed.incomplete,false);assert.equal(parsed.footprints.length,3);
 assert.equal(parsed.footprints.reduce((n,f)=>n+f.holes.length,0),1);
 const land=snapshot([r]).landFeatures;
 assert.ok(land.some(l=>service.landContains(f.p(0,0),l,geo)));
 assert.equal(land.some(l=>service.landContains(f.p(200,200),l,geo)),false);
});
test('missing/unsupported roles, member types and open members remain explicit failures',()=>{
 for(const m of [member(1,undefined),member(1,f.ring(500,500,700,700),''),
  {...member(1,undefined),type:'relation'},member(1,f.ring(500,500,700,700).slice(0,3))]) {
  const parsed=geography.elementFootprints(relation([m]));assert.equal(parsed.incomplete,true);
  assert.ok(parsed.reasons.length);assert.equal(shape([...f.grid(),relation([m])]).candidates.length,0);
 }
});
test('self-crossing relation cannot establish safe school geometry',()=>{
 const r=relation([member(1,[[0,0],[200,200],[0,200],[150,0],[0,0]].map(([x,y])=>f.osm(x,y)))]);
 assert.ok(geography.elementFootprints(r).reasons.includes('invalid_or_self_crossing_ring'));
 assert.equal(shape([...f.grid(),r]).candidates.length,0);
});
test('missing member with complete source bounds localizes only that envelope; absent extent stays fail-closed',()=>{
 const r=relation([member(1,undefined)]),sw=f.osm(650,650),ne=f.osm(900,900);
 r.bounds={minlat:sw.lat,minlon:sw.lon,maxlat:ne.lat,maxlon:ne.lon};
 const s=snapshot([r]);assert.equal(s.unresolvedLandFeatures[0].disposition,'local_source_bounds_guard');
 assert.equal(shape([...f.grid(),r]).candidates.reduce((n,c)=>n+c.features.length,0),48);
 delete r.bounds;assert.equal(shape([...f.grid(),r]).candidates.length,0);
});
test('a contradictory bounds claim cannot conceal missing member geometry',()=>{
 const r=relation([member(1,f.ring(-100,-100,100,100)),member(2,undefined)]),sw=f.osm(650,650),ne=f.osm(900,900);
 r.bounds={minlat:sw.lat,minlon:sw.lon,maxlat:ne.lat,maxlon:ne.lon};
 assert.equal(shape([...f.grid(),r]).candidates.length,0);
});
test('nearby point-only school trims affected targets/streets and polygons stay outside its guard',()=>{
 const school={type:'node',id:90002,...f.osm(550,0),tags:{amenity:'school'}};
 const s=snapshot([school]),guard=s.unresolvedLandFeatures[0].guard,result=shape([...f.grid(),school]);
 assert.ok(result.candidates.length);const n=result.candidates.reduce((n,c)=>n+c.features.length,0);assert.ok(n>0&&n<48);
 for(const c of result.candidates) {
  assert.equal(service.polygonsOverlap(c.geometry,guard,geo),false);
  for(const edge of c.networkSegments)assert.equal(service.lineHitsLand(edge.from,edge.to,{polygon:guard},geo),false);
 }
});
test('school marker inside complete mapped campus retains campus exclusion and audit association',()=>{
 const campus=f.land({amenity:'school'},90,-260,420,280,90003),node={type:'node',id:90004,...f.osm(200,0),tags:{amenity:'school'}};
 const s=snapshot([campus,node]);assert.equal(s.unresolvedLandFeatures[0].disposition,'covered_by_mapped_footprint');
 const result=shape([...f.grid(),campus,node]);assert.ok(result.candidates.length);
 for(const c of result.candidates)assert.equal(service.polygonsOverlap(c.geometry,s.landFeatures[0].polygon,geo),false);
});
test('restricted gate/entrance points and open gate ways use local access guards, never unknown land parcels',()=>{
 for(const e of [{type:'node',id:90005,...f.osm(0,0),tags:{access:'private',barrier:'gate'}},
  {type:'node',id:90006,...f.osm(0,0),tags:{access:'private',entrance:'yes'}},
  {type:'way',id:90007,geometry:[f.osm(-10,0),f.osm(10,0)],tags:{access:'permit',barrier:'gate'}}]) {
  const u=snapshot([e]).unresolvedLandFeatures[0];assert.equal(u.disposition,'local_access_guard');assert.equal(u.guardMeters,30);
  for(const c of shape([...f.grid(),e]).candidates)assert.equal(service.polygonsOverlap(c.geometry,u.guard,geo),false);
 }
 const unknown=snapshot([{type:'node',id:90009,...f.osm(0,0),tags:{access:'private',barrier:'no',entrance:'no'}}]).unresolvedLandFeatures[0];
 assert.equal(unknown.guardMeters,500);assert.equal(unknown.disposition,'local_point_uncertainty_guard');
});
test('unresolved highway barrier fails closed rather than disappearing',()=>{
 assert.equal(shape([...f.grid(),{type:'way',id:90008,tags:{highway:'motorway'}}]).candidates.length,0);
});
test('complete site members yield only a conservative collection guard; incomplete site stays unbounded',()=>{
 const r=relation([member(1,f.ring(900,900,950,950),''),member(2,f.ring(1000,1000,1100,1100),'')]);r.tags.type='site';
 const u=snapshot([r]).unresolvedLandFeatures[0];assert.equal(u.disposition,'local_complete_site_members_guard');
 assert.equal(u.guardMeters,500);assert.equal(snapshot([r]).landFeatures.length,0);
 assert.ok(shape([...f.grid(),r]).candidates.length);
 r.members.push(member(3,undefined));assert.equal(shape([...f.grid(),r]).candidates.length,0);
});
