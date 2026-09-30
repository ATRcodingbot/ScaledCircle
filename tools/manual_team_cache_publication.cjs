'use strict';
// Explicit operator action; no scheduler, refresh loop, service or SDK credentials exported.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),clipping=require('../functions/node_modules/polygon-clipping');
const root=path.resolve(__dirname,'..'),cache=require('../functions/smart_zone_public_cache'),{publishBundle}=require('../functions/scripts/publish_smart_zone_public_cache');
const state=path.join(root,'.firebase/manual-team-promotion'),dir=path.join(root,'.firebase/manual-analysis/cache-all-buildings');
const name='smart-zone-public/v1/maryland/current.json',bucket='scaled-circle.firebasestorage.app';
const endpoint='https://storage.googleapis.com/storage/v1/b/'+bucket+'/o/';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,name))),objects=new Map(Object.values(manifest.tiles).map(ref=>[cache.blobPath(ref.hash),fs.readFileSync(path.join(dir,cache.blobPath(ref.hash)))]));
let accessToken;
function token(){if(!accessToken)accessToken=cp.execFileSync('powershell.exe',['-NoProfile','-Command',"& 'C:/Users/Greg/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd' auth print-access-token"],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();return accessToken;}
async function request(url,opts={}){const r=await fetch(url,{...opts,headers:{Authorization:'Bearer '+token(),'X-Goog-User-Project':'scaled-circle',...opts.headers},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Object.assign(Error('storage_request_failed'),{code:r.status});return r;}
function safe(file,v){fs.writeFileSync(path.join(state,file),JSON.stringify(v,null,2)+'\n');}
async function main(mode){
 if(!['stage','publish'].includes(mode))throw Error('Explicit stage or publish required');
 if(objects.size!==16||!cache.safeMetadata(manifest)||manifest.complete!==true||!manifest.buildingInventoryComplete||manifest.inventoryVersion!=='OsmPublicObjectsV2')throw Error('invalid_reviewed_bundle');
 const bytes=[...objects.values()].reduce((n,b)=>n+b.length,0);if(bytes>8*1024*1024)throw Error('bounded_import_byte_limit');
 const metadata=await(await request(endpoint+encodeURIComponent(name))).json();
 const previousBytes=Buffer.from(await(await request(endpoint+encodeURIComponent(name)+'?alt=media&generation='+metadata.generation)).arrayBuffer());
 const previous=JSON.parse(previousBytes);
 if(JSON.stringify(previous.bounds)!==JSON.stringify(manifest.bounds)||clipping.difference(previous.coverage,manifest.coverage).length||previous.snapshotAt!==manifest.snapshotAt||previous.sourceHash!==manifest.sourceHash)throw Error('reviewed_coverage_or_source_changed');
 const priorPath=path.join(state,'cache-rollback.private.json');
 if(!fs.existsSync(priorPath))safe('cache-rollback.private.json',{generation:metadata.generation,manifest:previous});
 const rollback=JSON.parse(fs.readFileSync(priorPath));
 if(metadata.generation!==rollback.generation||JSON.stringify(previous)!==JSON.stringify(rollback.manifest))throw Error('pointer_changed_since_staging');
 const unique=new Map();let copies=0,roads=0,buildings=0,generic=0,relations=0,maxRaw=0;
 for(const [key,ref] of Object.entries(manifest.tiles)){
  const b=objects.get(cache.blobPath(ref.hash)),payload=cache.decode(b,ref.hash,n=>maxRaw=Math.max(maxRaw,n));
  if(payload.key!==key||payload.sourceHash!==manifest.sourceHash||payload.elements.length!==ref.elementCount)throw Error('tile_contract_mismatch');
  copies+=payload.elements.length;for(const e of payload.elements){const id=e.type+'/'+e.id,prior=unique.get(id);if(prior&&JSON.stringify(prior)!==JSON.stringify(e))throw Error('conflicting_cross_tile_object');unique.set(id,e);}
 }
 for(const e of unique.values()){if(e.tags?.highway)roads++;if(e.tags?.building&&e.tags.building!=='no')buildings++;if(e.tags?.building==='yes')generic++;if(e.type==='relation')relations++;}
 let priorUnique=0;
 for(const ref of Object.values(previous.tiles)){
  const oldBytes=Buffer.from(await(await request(endpoint+encodeURIComponent(cache.blobPath(ref.hash))+'?alt=media')).arrayBuffer());
  for(const e of cache.decode(oldBytes,ref.hash).elements){priorUnique++;if(!unique.has(e.type+'/'+e.id))throw Error('previous_object_omitted');}
 }
 let verified=0;
 const adapter={file:file=>({download:async()=>[Buffer.from(await(await request(endpoint+encodeURIComponent(file)+'?alt=media')).arrayBuffer())],save:async(b,options)=>{
  if(file===name){
   const summary={mode:'staged',snapshotAt:manifest.snapshotAt,retrievedAt:manifest.retrievedAt,importedAt:manifest.importedAt,
    sourceHash:manifest.sourceHash,manifestSha256:cache.hash(Buffer.from(JSON.stringify(manifest))),bounds:manifest.bounds,
    parserVersion:manifest.parserVersion,inventoryVersion:manifest.inventoryVersion,tiles:objects.size,compressedBytes:bytes,
    tileObjectCopies:copies,uniqueObjects:unique.size,roads,buildings,genericBuildings:generic,relations,maxTileRawBytes:maxRaw,
    verifiedReadbacks:verified,previousPointerGeneration:metadata.generation,previousCoveragePreserved:true,previousObjectsPreserved:true};
   safe('cache-staged.safe.json',summary);console.log(JSON.stringify(summary));
   if(mode==='stage')throw Error('staged_only');
   const staged=JSON.parse(fs.readFileSync(path.join(state,'cache-staged.safe.json')));if(staged.verifiedReadbacks!==objects.size)throw Error('staging_incomplete');
  }
  const url='https://storage.googleapis.com/upload/storage/v1/b/'+bucket+'/o?uploadType=media&name='+encodeURIComponent(file)+'&ifGenerationMatch='+options.preconditionOpts.ifGenerationMatch;
  try{await request(url,{method:'POST',headers:{'Content-Type':options.contentType},body:b});}catch(e){if(file===name||e.code!==412)throw e;}
  const readback=Buffer.from(await(await request(endpoint+encodeURIComponent(file)+'?alt=media')).arrayBuffer());
  if(cache.hash(readback)!==cache.hash(b))throw Error('published_byte_mismatch');
  if(file!==name)verified++;
 }})};
 try{await publishBundle({bucket:adapter,bundle:{manifest,objects},expectedGeneration:metadata.generation});}catch(e){if(mode==='stage'&&e.message==='staged_only')return;throw e;}
 const after=await(await request(endpoint+encodeURIComponent(name))).json();safe('cache-published.safe.json',{...JSON.parse(fs.readFileSync(path.join(state,'cache-staged.safe.json'))),mode:'published',generation:after.generation,publishedAt:after.updated});
 console.log(JSON.stringify({published:true,generation:after.generation,publishedAt:after.updated}));
}
main(process.argv[2]).catch(e=>{console.error(JSON.stringify({error:/^[a-z_]+$/.test(e.message)?e.message:'operator_tool_failed',code:e.code||null}));process.exitCode=1;});
