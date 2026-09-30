'use strict';

// Neutral public geography only. Business ranking and authorization remain in
// the existing PI/callable/run authorities. No provider work on construction.
const crypto=require('node:crypto'),zlib=require('node:zlib');
const geography=require('./smart_zone_geography'),planning=require('./smart_zone_planning');
const areas=require('./property_service_area_geometry'),pi=require('./property_intelligence');
const VERSION='SmartZonePublicCacheV1',PARSER_VERSION='SmartZoneOsmGeometryV2';
const PREFIX='smart-zone-public/v1/',GRID=.04,DAY=86400000;
const MAX_BLOB_BYTES=8*1024*1024,MAX_RAW_BYTES=32*1024*1024,MAX_ELEMENTS=20000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function freshness(snapshotAt,now=Date.now()){
  if(!date(snapshotAt)||Date.parse(snapshotAt)>now+300000)return 'unavailable';
  const age=now-Date.parse(snapshotAt);
  return age<=7*DAY?'fresh':age<=14*DAY?'usable_cached':age<=30*DAY?'stale':'unavailable';
}
const boundsOf=points=>[Math.min(...points.map(p=>p.longitude)),Math.min(...points.map(p=>p.latitude)),
  Math.max(...points.map(p=>p.longitude)),Math.max(...points.map(p=>p.latitude))];
const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function elementBounds(e){
  const points=e.type==='node'?[e]:(e.geometry||e.members?.flatMap(m=>m.geometry||[])||[]);
  const b=e.bounds;
  if(b&&[b.minlon,b.minlat,b.maxlon,b.maxlat].every(Number.isFinite)&&b.minlon<b.maxlon&&b.minlat<b.maxlat&&
    points.every(p=>p.lon>=b.minlon&&p.lon<=b.maxlon&&p.lat>=b.minlat&&p.lat<=b.maxlat))return [b.minlon,b.minlat,b.maxlon,b.maxlat];
  // Known members cannot narrow away an unknown school/restricted member.
  // Keep such a source record in every imported tile unless full bounds exist.
  if(e.type==='relation'&&geography.landKind(e.tags||{})&&e.members?.some(m=>m.type!=='way'||!m.geometry?.length))return null;
  if(!points.length)return null;
  let w=180,s=90,ea=-180,n=-90;
  for(const p of points){if(!Number.isFinite(p.lon)||!Number.isFinite(p.lat))return null;
    w=Math.min(w,p.lon);s=Math.min(s,p.lat);ea=Math.max(ea,p.lon);n=Math.max(n,p.lat);}
  return [w,s,ea,n];
}
function intersectsBounds(e,b){
  const eb=elementBounds(e);if(!eb)return true;if(!overlaps(eb,b))return false;
  const inside=p=>p.lon>=b[0]&&p.lon<=b[2]&&p.lat>=b[1]&&p.lat<=b[3];
  if(e.type==='node')return inside(e);
  const lines=e.geometry?[e.geometry]:(e.members||[]).filter(m=>m.type==='way').map(m=>m.geometry);
  if(!lines.length||lines.some(l=>!Array.isArray(l)||l.length<2))return true;
  // Liang-Barsky intersection: no clipping or replacement of source geometry.
  const crossing=(a,z)=>{let lo=0,hi=1;const dx=z.lon-a.lon,dy=z.lat-a.lat;
    const p=[-dx,dx,-dy,dy],q=[a.lon-b[0],b[2]-a.lon,a.lat-b[1],b[3]-a.lat];
    for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return false;continue;}
      const r=q[i]/p[i];if(p[i]<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return false;}
    return true;};
  for(const line of lines){if(line.some(inside))return true;
    for(let i=1;i<line.length;i++)if(crossing(line[i-1],line[i]))return true;}
  // A complete outer footprint may enclose the entire window without an edge
  // entering it. Retain unknown/incomplete outer rings conservatively too.
  const outers=e.geometry?[e.geometry]:(e.members||[]).filter(m=>m.role==='outer'&&m.type==='way').map(m=>m.geometry);
  if(!outers.length)return !!geography.landKind(e.tags||{});
  const ends=new Map();let odd=false;
  for(const line of outers){if(!line?.length)return true;
    for(const p of [line[0],line.at(-1)]){const key=`${p.lat},${p.lon}`;ends.set(key,(ends.get(key)||0)+1);}
    for(let i=1;i<line.length;i++){const a=line[i-1],z=line[i];
      if((a.lat>b[1])!==(z.lat>b[1])&&b[0]<(z.lon-a.lon)*(b[1]-a.lat)/(z.lat-a.lat)+a.lon)odd=!odd;}
  }
  if([...ends.values()].some(n=>n%2))return !!geography.landKind(e.tags||{});
  return odd;
}
function tileKeys(bounds){
  const keys=[];
  for(let x=Math.floor(bounds[0]/GRID);x<=Math.floor(bounds[2]/GRID);x++)
    for(let y=Math.floor(bounds[1]/GRID);y<=Math.floor(bounds[3]/GRID);y++)keys.push(`${x}_${y}`);
  return keys;
}
function safeMetadata(m){
  return m?.version===VERSION&&m.parserVersion===PARSER_VERSION&&date(m.snapshotAt)&&date(m.retrievedAt)&&
    date(m.importedAt)&&/^[a-f0-9]{64}$/.test(m.sourceHash||'')&&typeof m.provider==='string'&&
    ['geofabrik_maryland','overpass'].includes(m.provider)&&Array.isArray(m.bounds)&&m.bounds.length===4&&
    m.bounds.every(Number.isFinite)&&m.bounds[0]<m.bounds[2]&&m.bounds[1]<m.bounds[3];
}
function encode(value){const raw=Buffer.from(JSON.stringify(value));if(raw.length>MAX_RAW_BYTES)throw Error('cache_size_limit');
  const bytes=zlib.gzipSync(raw,{mtime:0});if(bytes.length>MAX_BLOB_BYTES)throw Error('cache_size_limit');
  return {bytes,hash:hash(bytes)};}
function decode(bytes,expectedHash,onBytes=()=>{}){
  if(bytes.length>MAX_BLOB_BYTES||hash(bytes)!==expectedHash)throw Error('cache_integrity');
  const raw=zlib.gunzipSync(bytes,{maxOutputLength:MAX_RAW_BYTES});onBytes(raw.length);
  return JSON.parse(raw.toString('utf8'));
}
const blobPath=digest=>`${PREFIX}blobs/${digest}.json.gz`;
function decorate(snapshot,meta,now,extra={}){
  return {...snapshot,buildingInventoryComplete:meta.buildingInventoryComplete===true,cacheEvidence:{provider:meta.provider,snapshotAt:meta.snapshotAt,
    retrievedAt:meta.retrievedAt,importedAt:meta.importedAt,sourceHash:meta.sourceHash,
    bounds:meta.bounds,geometryVersion:'WGS84_OSM_complete_geometry_v2',datasetVersion:meta.version,parserVersion:meta.parserVersion,
    freshness:freshness(meta.snapshotAt,now),transport:meta.provider==='overpass'?'cached_overpass':'regional_cache',
    evidenceHash:meta.evidenceHash||meta.sourceHash,...extra}};
}
function counts(snapshot){
  const classifiedTargetCounts={};for(const f of snapshot.targetFeatures||[])classifiedTargetCounts[f.kind]=(classifiedTargetCounts[f.kind]||0)+1;
  return {classifiedTargetCounts,targetFeatureCount:snapshot.targetFeatures?.length||0,routeWayCount:snapshot.routeWays?.length||0,
    exclusionPolygonCount:snapshot.exclusionPolygons?.length||0,landFeatureCount:snapshot.landFeatures?.length||0,
    unresolvedLandFeatureCount:snapshot.unresolvedLandFeatures?.length||0,barrierWayCount:snapshot.barrierWays?.length||0};
}
// Read a halo so a point guard cannot disappear across a section/tile seam.
function evidenceBounds(bounds) {
  const lat=geography.POINT_GUARD_METERS/111320,lon=lat/Math.cos(Math.max(Math.abs(bounds[1]),Math.abs(bounds[3]))*Math.PI/180);
  return [bounds[0]-lon,bounds[1]-lat,bounds[2]+lon,bounds[3]+lat];
}
function createReader({store,now=Date.now,allowPartial=false,onCoverage}){
  let manifestPromise;const blobs=new Map();let bytesRead=0,rawBytesRead=0;
  const blob=async digest=>{
    if(!/^[a-f0-9]{64}$/.test(digest||''))throw Error('cache_integrity');
    if(!blobs.has(digest)){
      if(blobs.size>=48)throw Error('cache_read_budget');
      blobs.set(digest,(async()=>{const b=await store.readBlob(blobPath(digest),MAX_BLOB_BYTES);
        bytesRead+=b.length;if(bytesRead>24*1024*1024)throw Error('cache_read_budget');
        return decode(b,digest,size=>{rawBytesRead+=size;if(rawBytesRead>MAX_RAW_BYTES)throw Error('cache_read_budget');});})());
    }return blobs.get(digest);
  };
  return async boundary=>{
    const bounds=boundsOf(boundary),m=await(manifestPromise??=store.readManifest());
    const report=(reasonCode,extra={})=>{try{onCoverage?.({reasonCode,queryBounds:bounds,
      provider:safeMetadata(m)?m.provider:null,snapshotAt:safeMetadata(m)?m.snapshotAt:null,...extra});}catch(_){}};
    const halo=evidenceBounds(bounds),coverageBoundary=[{longitude:halo[0],latitude:halo[1]},{longitude:halo[2],latitude:halo[1]},
      {longitude:halo[2],latitude:halo[3]},{longitude:halo[0],latitude:halo[3]}];
    if(!safeMetadata(m)||m.provider!=='geofabrik_maryland'||m.complete!==true||
      !Array.isArray(m.coverage)){report('manifest_unavailable');return null;}
    const fullCoverage=areas.isContained(coverageBoundary,m.coverage);
    if(!allowPartial&&!fullCoverage){report('outside_cache_coverage');return null;}
    const keys=tileKeys(halo);if(keys.length>16){report('cache_tile_limit',{requestedTileCount:keys.length});return null;}
    const elements=new Map(),availableKeys=[],missingKeys=[],coverageTiles=[];
    for(const key of keys){
      const ref=m.tiles?.[key];if(!ref||ref.complete!==true){if(!allowPartial){report('tile_unavailable',{requestedTileCount:keys.length,missingTileKeys:[key]});return null;}missingKeys.push(key);continue;}
      availableKeys.push(key);const [x,y]=key.split('_').map(Number);coverageTiles.push([[[x*GRID,y*GRID],[(x+1)*GRID,y*GRID],[(x+1)*GRID,(y+1)*GRID],[x*GRID,(y+1)*GRID],[x*GRID,y*GRID]]]);
      const tile=await blob(ref.hash);
      if(tile.version!==VERSION||tile.sourceHash!==m.sourceHash||tile.key!==key||!Array.isArray(tile.elements))throw Error('cache_integrity');
      for(const e of tile.elements){
        if(!intersectsBounds(e,bounds)&&!(geography.landKind(e.tags||{})&&intersectsBounds(e,halo)))continue;
        const id=`${e.type}/${e.id}`,previous=elements.get(id);
        // Overlap copies from a single immutable dataset must agree exactly.
        if(previous&&JSON.stringify(previous)!==JSON.stringify(e))throw Error('cache_conflicting_evidence');
        elements.set(id,e);if(elements.size>MAX_ELEMENTS)throw Error('element_limit_exceeded');
      }
    }
    if(!availableKeys.length){report('outside_cache_coverage',{requestedTileCount:keys.length,availableTileCount:0});return null;}
    const clipping=require('polygon-clipping'),coverage=clipping.intersection(m.coverage,clipping.union(...coverageTiles));
    if(!coverage.length||!clipping.intersection(coverage,[[[...boundary,boundary[0]].map(p=>[p.longitude,p.latitude])]]).length){report('outside_cache_coverage');return null;}
    report(fullCoverage&&!missingKeys.length?'coverage_complete':'partial_coverage',{requestedTileCount:keys.length,availableTileCount:availableKeys.length,missingTileKeys:missingKeys});
    const snap=geography.snapshotFromElements(boundary,[...elements.values()],{dataTimestamp:m.snapshotAt,fetchedAt:m.retrievedAt,buildingInventoryComplete:m.buildingInventoryComplete});
    snap.evidenceCoverage=coverage;
    return {snapshot:decorate(snap,{...m,evidenceHash:hash(JSON.stringify(availableKeys.map(k=>m.tiles[k].hash)))},now(),
      {queryBounds:bounds,evidenceBounds:halo,geometryDigest:pi.geometryDigest(boundary),coverageState:fullCoverage&&!missingKeys.length?'complete':'partial',requestedTileCount:keys.length,availableTileCount:availableKeys.length,missingTileKeys:missingKeys,buildingInventoryComplete:m.buildingInventoryComplete===true}),
      rawElementCount:elements.size};
  };
}
function createAcquirer({store,liveFetch=geography.fetchSnapshot,now=Date.now,allowPartialRegional=false}){
  let regionalCoverage=null;const regional=createReader({store,now,allowPartial:allowPartialRegional,onCoverage:value=>{regionalCoverage=value;}});let refreshes=0;
  return async({selectedBoundary,endpoint,onDiagnostic})=>{
    regionalCoverage=null;const started=now();let cached=null,cacheReason='cache_missing',rawElementCount=null;
    const emit=(snapshot,reasonCode,refresh=null)=>{
      try{onDiagnostic?.({status:snapshot?'success':'unavailable',stage:'public_cache',reasonCode,
        elapsedMs:now()-started,cacheReason,rawElementCount,coverage:regionalCoverage,
        ...(snapshot?counts(snapshot):{}),cacheEvidence:snapshot?.cacheEvidence||null,refresh});}catch(_){}
      return snapshot;
    };
    const valid=planning.validateGeometry(selectedBoundary);
    if(!valid.valid||valid.areaSquareMeters>geography.MAX_QUERY_AREA_SQUARE_METERS)return emit(null,'invalid_query_geometry');
    const digest=pi.geometryDigest(selectedBoundary);
    try{const hit=await regional(selectedBoundary);cached=hit?.snapshot||null;rawElementCount=hit?.rawElementCount??null;
      if(cached)cacheReason='regional_cache_found';else if(regionalCoverage)cacheReason=regionalCoverage.reasonCode;}catch(error){cacheReason=['cache_integrity','cache_conflicting_evidence','cache_read_budget','cache_size_limit','element_limit_exceeded'].includes(error?.message)?error.message:'regional_cache_unavailable';}
    // A fresh regional snapshot needs no Firestore refresh lookup or provider call.
    if(cached&&['fresh','usable_cached'].includes(cached.cacheEvidence.freshness))return emit(cached,'cache_ready');
    try{
      const hit=await store.readWindow(digest);
      if(safeMetadata(hit)&&hit.complete===true&&hit.geometryDigest===digest&&
        (!cached||Date.parse(hit.snapshotAt)>Date.parse(cached.dataTimestamp))){
        const payload=decode(await store.readBlob(blobPath(hit.evidenceHash),MAX_BLOB_BYTES),hit.evidenceHash);
        if(payload.version===VERSION&&payload.geometryDigest===digest&&payload.snapshot&&payload.snapshot.dataTimestamp===hit.snapshotAt&&payload.snapshot.fetchedAt===hit.retrievedAt)
          cached=decorate(payload.snapshot,hit,now(),{queryBounds:boundsOf(selectedBoundary),geometryDigest:digest});
      }
    }catch(_){/* Do not discard a valid regional snapshot on cache IO failure. */}
    if(cached&&['fresh','usable_cached'].includes(cached.cacheEvidence.freshness))return emit(cached,'cache_ready');
    if(cached?.cacheEvidence.freshness==='unavailable')cached=null;
    const fallback=reason=>cached?{...cached,cacheEvidence:{...cached.cacheEvidence,refreshFailed:true,refreshReason:reason}}:null;
    if(refreshes>=1)return emit(fallback('request_refresh_budget'),'request_refresh_budget');
    let lease;try{lease=await store.reserveRefresh(digest);}catch(_){return emit(fallback('refresh_authority_unavailable'),'refresh_authority_unavailable');}
    if(!lease)return emit(fallback('refresh_cooldown'),'refresh_cooldown');
    refreshes++;let diagnostic=null,snapshot=null;
    try{snapshot=await liveFetch({selectedBoundary,endpoint,onDiagnostic:d=>{diagnostic=d;}});}catch(_){diagnostic={reasonCode:'provider_request_failed'};}
    // Unknown source age is not upgraded to fresh by retrieval time.
    if(snapshot&&cached&&Date.parse(snapshot.dataTimestamp)<Date.parse(cached.dataTimestamp)){
      try{await store.finishRefresh(digest,lease,{diagnostic:{reasonCode:'older_provider_snapshot'}});}catch(_){}
      return emit(fallback('older_provider_snapshot'),'older_provider_snapshot',diagnostic);
    }
    if(snapshot&&freshness(snapshot.dataTimestamp,now())!=='unavailable'){
      const meta={version:VERSION,parserVersion:PARSER_VERSION,provider:'overpass',snapshotAt:snapshot.dataTimestamp,
        retrievedAt:snapshot.fetchedAt,importedAt:new Date(now()).toISOString(),bounds:boundsOf(selectedBoundary),
        sourceHash:hash(JSON.stringify(snapshot)),geometryDigest:digest,complete:true,buildingInventoryComplete:snapshot.buildingInventoryComplete===true};
      try{await store.finishRefresh(digest,lease,{meta,snapshot,diagnostic});}catch(_){/* Local result is still usable; no stale pointer deletion. */}
      return emit(decorate(snapshot,meta,now(),{transport:'live_refresh',queryBounds:boundsOf(selectedBoundary),geometryDigest:digest}),'refresh_ready',diagnostic);
    }
    try{await store.finishRefresh(digest,lease,{diagnostic:diagnostic||{reasonCode:'source_date_unavailable'}});}catch(_){}
    return emit(fallback(diagnostic?.reasonCode||'source_date_unavailable'),'refresh_unavailable',diagnostic);
  };
}
module.exports={VERSION,PARSER_VERSION,PREFIX,GRID,DAY,MAX_BLOB_BYTES,MAX_RAW_BYTES,MAX_ELEMENTS,hash,
  freshness,boundsOf,evidenceBounds,overlaps,elementBounds,intersectsBounds,tileKeys,safeMetadata,encode,decode,blobPath,createReader,createAcquirer};
