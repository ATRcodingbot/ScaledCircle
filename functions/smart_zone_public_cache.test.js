'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const cache=require('./smart_zone_public_cache'),importer=require('./scripts/build_smart_zone_public_cache');
const geo=require('./smart_zone_geography'),pi=require('./property_intelligence');
const fixture=require('./fixtures/21061-corkran-osm-public.json');
const clock=Date.parse('2026-09-26T23:00:00Z'),boundary=fixture.selectedBoundary;
function bundle(age=1){
  const b=cache.boundsOf(boundary),coverage=[[[[b[0]-.01,b[1]-.01],[b[2]+.01,b[1]-.01],[b[2]+.01,b[3]+.01],[b[0]-.01,b[3]+.01],[b[0]-.01,b[1]-.01]]]];
  return importer.build({payload:{sourceDataTimestamp:new Date(clock-age*cache.DAY).toISOString(),retrievedAt:new Date(clock).toISOString(),
    sourceSha256:'a'.repeat(64),referenceIncomplete:false,bounds:b,elements:fixture.elements},sourceCoverage:coverage,now:clock});
}
function storeFor(b){const counts={reads:0,reserves:0,finishes:0};let saved=null;
  return {counts,readManifest:async()=>b?.manifest||null,readBlob:async name=>{counts.reads++;return b.objects.get(name);},
    readWindow:async()=>null,reserveRefresh:async()=>{counts.reserves++;return 'lease';},
    finishRefresh:async(_d,_l,value)=>{counts.finishes++;saved=value;},get saved(){return saved;}};}
test('fresh regional cache works with provider down; overlap tiles deduplicate source IDs',async()=>{
 const b=bundle(),store=storeFor(b);let live=0,d;
 const acquire=cache.createAcquirer({store,now:()=>clock,liveFetch:async()=>{live++;throw Error('down');}});
 const s=await acquire({selectedBoundary:boundary,onDiagnostic:x=>d=x});
 assert.equal(live,0);assert.equal(store.counts.reserves,0);assert.equal(s.cacheEvidence.freshness,'fresh');
 assert.equal(s.cacheEvidence.transport,'regional_cache');assert.equal(new Set(s.targetFeatures.map(f=>f.id)).size,s.targetFeatures.length);
 assert.equal(d.rawElementCount,fixture.elements.length);assert.equal(d.routeWayCount,s.routeWays.length);
 const reads=store.counts.reads;await acquire({selectedBoundary:boundary});assert.equal(store.counts.reads,reads);
 assert.ok(s.landFeatures.some(f=>f.kind==='school'));assert.ok(s.cacheEvidence.sourceHash);
});
test('freshness uses source age, never recent import time or missing/future dates',()=>{
 for(const [age,label] of [[1,'fresh'],[7,'fresh'],[8,'usable_cached'],[14,'usable_cached'],[15,'stale'],[30,'stale'],[31,'unavailable']])
   assert.equal(cache.freshness(new Date(clock-age*cache.DAY).toISOString(),clock),label);
 assert.equal(cache.freshness(null,clock),'unavailable');assert.equal(cache.freshness(new Date(clock+cache.DAY).toISOString(),clock),'unavailable');
});
test('usable cache avoids live refresh; stale cache refresh success retains new source metadata',async()=>{
 const s=storeFor(bundle(10));await cache.createAcquirer({store:s,now:()=>clock,liveFetch:()=>assert.fail()})({selectedBoundary:boundary});assert.equal(s.counts.reserves,0);
 const stale=storeFor(bundle(20)),snap=geo.snapshotFromElements(boundary,fixture.elements,{dataTimestamp:new Date(clock).toISOString(),fetchedAt:new Date(clock).toISOString()});
 const result=await cache.createAcquirer({store:stale,now:()=>clock,liveFetch:async()=>snap})({selectedBoundary:boundary});
 assert.equal(result.cacheEvidence.transport,'live_refresh');assert.equal(result.cacheEvidence.freshness,'fresh');assert.ok(stale.saved.snapshot);
});
test('failed or partial live refresh preserves stale cache and safe diagnostics, never claims live',async()=>{
 const store=storeFor(bundle(20));let diag;
 const result=await cache.createAcquirer({store,now:()=>clock,liveFetch:async({onDiagnostic})=>{onDiagnostic({reasonCode:'provider_partial_response',httpStatus:200});return null;}})({selectedBoundary:boundary,onDiagnostic:d=>diag=d});
 assert.ok(result.targetFeatures.length);assert.equal(result.cacheEvidence.freshness,'stale');assert.equal(result.cacheEvidence.refreshFailed,true);
 assert.equal(result.cacheEvidence.transport,'regional_cache');assert.equal(store.saved.snapshot,undefined);assert.equal(diag.refresh.reasonCode,'provider_partial_response');
});
test('missing cache refresh failure is unavailable, not an empty successful snapshot; one live request per search',async()=>{
 const store=storeFor(null);let n=0,diag;
 const acquire=cache.createAcquirer({store,now:()=>clock,liveFetch:async({onDiagnostic})=>{n++;onDiagnostic({reasonCode:'timeout'});return null;}});
 assert.equal(await acquire({selectedBoundary:boundary,onDiagnostic:d=>diag=d}),null);assert.equal(diag.status,'unavailable');assert.equal(diag.rawElementCount,null);
 assert.equal(await acquire({selectedBoundary:boundary}),null);assert.equal(n,1);assert.equal(store.counts.reserves,1);
});
test('incomplete cache, damaged object and missing coverage do not masquerade as empty maps',async()=>{
 for(const alter of [b=>b.manifest.complete=false,b=>b.objects.set([...b.objects.keys()][0],Buffer.from('bad')),b=>b.manifest.coverage=[]]){
   const b=bundle();alter(b);const s=storeFor(b);let live=0;
   const result=await cache.createAcquirer({store:s,now:()=>clock,liveFetch:async()=>{live++;return null;}})({selectedBoundary:boundary});
   assert.equal(result,null);assert.equal(live,1);
 }
});
test('expired cache cannot enable Apply; refresh denial preserves usable stale data only',async()=>{
 for(const age of [20,31]){const store=storeFor(bundle(age));store.reserveRefresh=async()=>null;
  const s=await cache.createAcquirer({store,now:()=>clock,liveFetch:()=>assert.fail()})({selectedBoundary:boundary});
  if(age===20){assert.ok(s);assert.equal(s.cacheEvidence.freshness,'stale');}else assert.equal(s,null);
 }
});
test('unknown live snapshot age cannot be relabeled fresh',async()=>{
 const store=storeFor(null),s=await cache.createAcquirer({store,now:()=>clock,liveFetch:async()=>geo.snapshotFromElements(boundary,fixture.elements)})({selectedBoundary:boundary});
 assert.equal(s,null);assert.equal(store.saved.diagnostic.reasonCode,'source_date_unavailable');
});
test('exact live window cache is reusable without provider; different geometry is rejected',async()=>{
 const snap=geo.snapshotFromElements(boundary,fixture.elements,{dataTimestamp:new Date(clock).toISOString(),fetchedAt:new Date(clock).toISOString()});
 const digest=pi.geometryDigest(boundary),encoded=cache.encode({version:cache.VERSION,geometryDigest:digest,snapshot:snap}),store=storeFor(null);
 const meta={...bundle().manifest,provider:'overpass',snapshotAt:snap.dataTimestamp,retrievedAt:snap.fetchedAt,geometryDigest:digest,evidenceHash:encoded.hash};
 store.readWindow=async()=>meta;store.readBlob=async()=>encoded.bytes;
 assert.ok(await cache.createAcquirer({store,now:()=>clock,liveFetch:()=>assert.fail()})({selectedBoundary:boundary}));
 meta.geometryDigest='different';store.reserveRefresh=async()=>null;
 assert.equal(await cache.createAcquirer({store,now:()=>clock})({selectedBoundary:boundary}),null);
});
test('oversized territory fails before reading cache or provider',async()=>{
 const store={readManifest:()=>assert.fail(),reserveRefresh:()=>assert.fail()};
 const b=[{latitude:39,longitude:-77},{latitude:40,longitude:-77},{latitude:40,longitude:-76},{latitude:39,longitude:-76}];
 assert.equal(await cache.createAcquirer({store})({selectedBoundary:b}),null);
});
test('source .poly preserves holes; incomplete source import fails instead of publishing',()=>{
 const poly=importer.parsePoly('region\n1\n-77 39\n-76 39\n-76 40\n-77 40\n-77 39\nEND\n!2\n-76.8 39.2\n-76.6 39.2\n-76.6 39.4\n-76.8 39.4\n-76.8 39.2\nEND\nEND');
 assert.equal(poly[0].length,2);
 assert.throws(()=>importer.build({payload:{bounds:cache.boundsOf(boundary),sourceDataTimestamp:new Date(clock).toISOString(),retrievedAt:new Date(clock).toISOString(),sourceSha256:'a'.repeat(64),referenceIncomplete:true,elements:[]},sourceCoverage:poly}),/incomplete_source_geometry/);
});
test('refresh diagnostics exclude URLs, raw messages and caller context',()=>{
 const safe=require('./smart_zone_public_cache_runtime').safeDiagnostic({reasonCode:'timeout',httpStatus:504,raw:'token',message:'secret',workspace:'private',stage:'https://example.test/?key=secret'});
 assert.deepEqual(safe,{reasonCode:'timeout',httpStatus:504});
});
test('an older provider snapshot never displaces newer usable cached evidence',async()=>{
 const store=storeFor(bundle(20)),older=geo.snapshotFromElements(boundary,fixture.elements,{dataTimestamp:new Date(clock-25*cache.DAY).toISOString(),fetchedAt:new Date(clock).toISOString()});
 const result=await cache.createAcquirer({store,now:()=>clock,liveFetch:async()=>older})({selectedBoundary:boundary});
 assert.equal(result.dataTimestamp,new Date(clock-20*cache.DAY).toISOString());
 assert.equal(result.cacheEvidence.freshness,'stale');assert.equal(store.saved.snapshot,undefined);
 assert.equal(store.saved.diagnostic.reasonCode,'older_provider_snapshot');
});

test('cached Corkran geometry retains schools and honest workload; stale provenance reaches customer limitations',async()=>{
 const engine=require('./smart_zone_intelligence'),areas=require('./property_service_area_geometry'),planning=require('./smart_zone_planning'),service=require('./smart_zone_serviceability');
 const store=storeFor(bundle(20));store.reserveRefresh=async()=>null;
 const acquire=cache.createAcquirer({store,now:()=>clock,liveFetch:()=>assert.fail()});
 const args={anchor:fixture.anchor,selectedBoundary:boundary,eligibleGeography:areas.normalizeAreas({areas:[{geometry:boundary}]}).union,
  desiredHours:5,workType:'flyer_distribution',sourceAreaDigest:'fixture',contextVersion:'fixture',label:'Corkran',
  intelligenceContext:{goal:'Deck prospects',services:['Deck construction'],targetIntent:'residential'}};
 const evidence=await engine.search(args,{fetchSnapshot:acquire,loadPropertyAnalysis:async g=>planning.pointInsidePolygon(fixture.anchor,g)?
  {source:'synthetic-property-fixture',confidence:'HIGH',propertyCount:100,residentialStructureCount:80,geometryDigest:pi.geometryDigest(g)}:null});
 const plan=engine.generate(args,evidence);assert.equal(plan.totalEstimatedProperties,19);assert.equal(plan.totalEstimatedMinutes,44);
 assert.equal(plan.recommendationContext.mapValidation,'partial');assert.equal(plan.recommendationContext.hasAlternative,false);
 assert.match(plan.recommendationContext.limitations.join(' '),/Stale mapped evidence/);
 assert.match(plan.recommendationContext.limitations.join(' '),/refresh was unavailable/);
 const school=geo.snapshotFromElements(boundary,fixture.elements).landFeatures.filter(f=>f.kind==='school');
 for(const zone of plan.zones)for(const f of school)assert.equal(service.polygonsOverlap(zone.geometry,f.polygon,planning),false);
 const reads=store.counts.reads;engine.generate({...args,alternativeIndex:1},evidence);assert.equal(store.counts.reads,reads);
});

test('publication validates all blobs first and switches one generation-guarded pointer last',async()=>{
 const {publishBundle}=require('./scripts/publish_smart_zone_public_cache'),{MANIFEST}=require('./smart_zone_public_cache_runtime');
 const b=bundle(),writes=[],bucket={file:name=>({save:async(_data,options)=>writes.push({name,options})})};
 await publishBundle({bucket,bundle:b,expectedGeneration:0});
 assert.equal(writes.at(-1).name,MANIFEST);assert.equal(writes.at(-1).options.preconditionOpts.ifGenerationMatch,0);
 assert.equal(writes.length,b.objects.size+1);
 const corrupt=bundle();corrupt.objects.clear();writes.length=0;
 await assert.rejects(publishBundle({bucket,bundle:corrupt,expectedGeneration:0}),/missing_blob/);assert.equal(writes.length,0);
});

test('publication rejects source rollback and surfaces concurrent pointer replacement',async()=>{
 const {publishBundle}=require('./scripts/publish_smart_zone_public_cache'),{MANIFEST}=require('./smart_zone_public_cache_runtime');
 const old=bundle(20),newer=bundle(),writes=[];
 const bucket={file:name=>({download:async()=>[Buffer.from(JSON.stringify(newer.manifest))],save:async()=>{writes.push(name);if(name===MANIFEST)throw Object.assign(Error('generation_changed'),{code:412});}})};
 await assert.rejects(publishBundle({bucket,bundle:old,expectedGeneration:'123'}),/source_regression/);assert.equal(writes.length,0);
 await assert.rejects(publishBundle({bucket,bundle:newer,expectedGeneration:'123'}),/generation_changed/);
 assert.equal(writes.at(-1),MANIFEST);
});

test('spatial reads retain enclosing/crossing footprints but reject bbox-only overlap without clipping',()=>{
 const b=[0,0,1,1],p=(lon,lat)=>({lon,lat});
 const ring=[p(-2,-2),p(2,-2),p(2,2),p(-2,2),p(-2,-2)];
 assert.equal(cache.intersectsBounds({type:'way',tags:{amenity:'school'},geometry:ring},b),true);
 const multi={type:'relation',tags:{amenity:'school'},members:ring.slice(1).map((z,i)=>({type:'way',role:'outer',geometry:[ring[i],z]}))};
 assert.equal(cache.intersectsBounds(multi,b),true);
 const outside={type:'way',tags:{natural:'water'},geometry:[p(-2,-2),p(2,-2),p(-2,2),p(-2,-2)]};
 assert.equal(cache.intersectsBounds(outside,[.5,.5,1,1]),false);
 assert.equal(cache.intersectsBounds({type:'way',tags:{highway:'motorway'},geometry:[p(-2,.5),p(2,.5)]},b),true);
 assert.equal(cache.intersectsBounds({type:'relation',tags:{amenity:'school'},members:[{type:'way',role:'outer',geometry:[p(-2,-2),p(2,2)]},{type:'way',role:'outer'}]},b),true);
 assert.equal(ring.length,5);
});
