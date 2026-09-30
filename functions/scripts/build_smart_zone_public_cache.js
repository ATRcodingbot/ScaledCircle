'use strict';
// Offline operator import. This script has no network, cloud SDK or credentials.
// PBF extraction/coverage must be completed first. Produces immutable objects
// and a manifest; publication is a separate reviewed deployment operation.
const fs=require('node:fs'),path=require('node:path'),clipping=require('polygon-clipping');
const cache=require('../smart_zone_public_cache');
function parsePoly(text){
  const lines=text.trim().split(/\r?\n/).slice(1),outer=[],holes=[];let ring=null,hole=false;
  for(const raw of lines){const line=raw.trim();if(line==='END'){if(ring){if(JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))ring.push(ring[0]);(hole?holes:outer).push(ring);ring=null;}continue;}
    if(!ring){ring=[];hole=line.startsWith('!');continue;}
    const point=line.split(/\s+/).map(Number);if(point.length!==2||!point.every(Number.isFinite))throw Error('invalid_source_coverage');ring.push(point);
  }
  if(!outer.length||ring)throw Error('invalid_source_coverage');
  let result=clipping.union(...outer.map(r=>[r]));if(holes.length)result=clipping.difference(result,...holes.map(r=>[r]));return result;
}
function build({payload,sourceCoverage,now=Date.now()}){
  if (payload.referenceIncomplete) {
    const unresolved=payload.elements?.flatMap(e=>(e.members||[]).filter(m=>m.type==='relation'||m.type==='way'&&!m.geometry?.length))||[];
    if (!unresolved.length || [...(payload.missingMemberWays||[]),...(payload.unsupportedNestedRelations||[])].some(id=>!unresolved.some(m=>m.ref===id))) throw Error('untraceable_incomplete_geometry');
  }
  const b=payload.bounds,rect=[[[b?.[0],b?.[1]],[b?.[2],b?.[1]],[b?.[2],b?.[3]],[b?.[0],b?.[3]],[b?.[0],b?.[1]]]];
  const manifest={version:cache.VERSION,parserVersion:cache.PARSER_VERSION,provider:'geofabrik_maryland',
    snapshotAt:payload.sourceDataTimestamp,retrievedAt:payload.retrievedAt,importedAt:new Date(now).toISOString(),
    sourceHash:payload.sourceSha256,bounds:b,sourceCoverageHash:cache.hash(JSON.stringify(sourceCoverage)),
    coverage:clipping.intersection(sourceCoverage,rect),// Completeness describes acquisition of source records, not certainty of
    // every footprint. Retained missing members are localized by the parser.
    complete:typeof payload.referenceIncomplete==='boolean'&&!(payload.invalidSourceWays>0),
    buildingInventoryComplete:payload.buildingInventoryComplete===true,inventoryVersion:payload.inventoryVersion||'LegacySelectedObjectsV1',
    unresolvedReferenceCount:(payload.missingMemberWays||[]).length+(payload.unsupportedNestedRelations||[]).length,tiles:{}};
  if(!cache.safeMetadata(manifest)||!manifest.coverage.length||!Array.isArray(payload.elements))throw Error('invalid_source_metadata');
  if(!manifest.complete)throw Error('incomplete_source_geometry');
  const tiles=new Map(cache.tileKeys(b).map(k=>[k,new Map()]));
  for(const e of payload.elements){
    if(!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id))throw Error('invalid_element');
    // Reject metadata outside the maintained public extractor contract.
    if(['user','uid','changeset'].some(k=>Object.hasOwn(e,k)))throw Error('unexpected_personal_metadata');
    const bounds=cache.elementBounds(e),keys=bounds?cache.tileKeys([Math.max(b[0],bounds[0]),Math.max(b[1],bounds[1]),Math.min(b[2],bounds[2]),Math.min(b[3],bounds[3])]):[...tiles.keys()];
    for(const key of keys){const tile=tiles.get(key);if(!tile)continue;const id=`${e.type}/${e.id}`,previous=tile.get(id);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(e))throw Error('conflicting_source_element');tile.set(id,e);}
  }
  const objects=new Map();
  for(const [key,tile] of tiles){
    const data={version:cache.VERSION,key,sourceHash:manifest.sourceHash,elements:[...tile.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.id-b.id)};
    const encoded=cache.encode(data);objects.set(cache.blobPath(encoded.hash),encoded.bytes);
    manifest.tiles[key]={hash:encoded.hash,complete:true,elementCount:tile.size,bytes:encoded.bytes.length};
  }
  return {manifest,objects};
}
function writeBundle(bundle,out){
  if(fs.existsSync(out))throw Error('output_already_exists');fs.mkdirSync(out,{recursive:true});
  for(const [name,bytes] of bundle.objects){const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  const manifestPath=path.join(out,cache.PREFIX,'maryland/current.json');fs.mkdirSync(path.dirname(manifestPath),{recursive:true});
  fs.writeFileSync(manifestPath,JSON.stringify(bundle.manifest,null,2)+'\n',{flag:'wx'});
}
if(require.main===module){
  const [input,poly,out]=process.argv.slice(2);if(!input||!poly||!out)throw Error('Usage: node build_smart_zone_public_cache.js public-elements.json source.poly NEW_LOCAL_DIRECTORY');
  const bundle=build({payload:JSON.parse(fs.readFileSync(input,'utf8')),sourceCoverage:parsePoly(fs.readFileSync(poly,'utf8'))});writeBundle(bundle,out);
  console.log(JSON.stringify({snapshotAt:bundle.manifest.snapshotAt,sourceHash:bundle.manifest.sourceHash,tiles:bundle.objects.size,
    compressedBytes:[...bundle.objects.values()].reduce((s,b)=>s+b.length,0),published:false}));
}
module.exports={parsePoly,build,writeBundle};
