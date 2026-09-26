'use strict';
// Reviewed deployment helper, not invoked by imports or by recommendation calls.
// The caller supplies an existing bucket and explicit expected pointer generation.
const cache=require('../smart_zone_public_cache'),{MANIFEST}=require('../smart_zone_public_cache_runtime');
async function publishBundle({bucket,bundle,expectedGeneration}){
 if(!/^\d+$/.test(String(expectedGeneration))||!cache.safeMetadata(bundle.manifest)||bundle.manifest.complete!==true)throw Error('invalid_publication');
 for(const [key,ref] of Object.entries(bundle.manifest.tiles)){
  const bytes=bundle.objects.get(cache.blobPath(ref.hash));
  if(!bytes)throw Error('missing_blob');const payload=cache.decode(bytes,ref.hash);
  if(payload.key!==key||payload.sourceHash!==bundle.manifest.sourceHash||payload.version!==cache.VERSION)throw Error('source_mismatch');
 }
 // Check the prior version before any publication, then CAS after blob uploads.
 if(String(expectedGeneration)!=='0'){
  const [bytes]=await bucket.file(MANIFEST).download(),previous=JSON.parse(bytes.toString('utf8'));
  if(!cache.safeMetadata(previous)||Date.parse(previous.snapshotAt)>Date.parse(bundle.manifest.snapshotAt))throw Error('source_regression');
 }
 for(const [name,bytes] of bundle.objects){
  if(name!==cache.blobPath(cache.hash(bytes)))throw Error('invalid_blob_name');
  await bucket.file(name).save(bytes,{resumable:false,contentType:'application/gzip',preconditionOpts:{ifGenerationMatch:0}}).catch(e=>{if(Number(e.code)!==412)throw e;});
 }
 const bytes=Buffer.from(JSON.stringify(bundle.manifest));if(bytes.length>2*1024*1024)throw Error('manifest_size_limit');
 await bucket.file(MANIFEST).save(bytes,{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:expectedGeneration}});
 return {snapshotAt:bundle.manifest.snapshotAt,sourceHash:bundle.manifest.sourceHash,tiles:Object.keys(bundle.manifest.tiles).length};
}
module.exports={publishBundle};
