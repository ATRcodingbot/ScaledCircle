'use strict';
const crypto=require('node:crypto');
const cache=require('./smart_zone_public_cache');
const COLLECTION='smartZonePublicRefreshV1',MAX_DAILY_REFRESHES=60;
const MANIFEST=`${cache.PREFIX}maryland/current.json`;
// Stream limits apply before decompression; object names cannot escape the
// dedicated private prefix. No client Storage URL or credential is accepted.
function readObject(bucket,name,maxBytes){
  if(name!==MANIFEST&&!new RegExp(`^${cache.PREFIX}blobs/[a-f0-9]{64}\\.json\\.gz$`).test(name))throw Error('invalid_cache_path');
  return new Promise((resolve,reject)=>{
    const stream=bucket.file(name).createReadStream(),chunks=[];let size=0;
    const timer=setTimeout(()=>stream.destroy(Error('cache_read_timeout')),8000);
    stream.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)stream.destroy(Error('cache_size_limit'));else chunks.push(chunk);});
    stream.on('error',error=>{clearTimeout(timer);reject(error);});
    stream.on('end',()=>{clearTimeout(timer);resolve(Buffer.concat(chunks));});
  });
}
function safeDiagnostic(d){
  const out={};
  for(const key of ['status','stage','reasonCode','httpStatus','elapsedMs','rawElementCount','targetFeatureCount','routeWayCount','exclusionPolygonCount','unresolvedLandFeatureCount']){
    const v=d?.[key];if(typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^[a-z_]{1,80}$/.test(v))out[key]=v;
  }return out;
}
function createStore({db,bucket,now=Date.now}){
  const globalRef=db.collection(COLLECTION).doc('authority');
  const windowRef=digest=>{if(!/^[a-f0-9]{64}$/.test(digest))throw Error('invalid_geometry_digest');return db.collection(COLLECTION).doc(digest);};
  return {
    readManifest:async()=>JSON.parse((await readObject(bucket,MANIFEST,2*1024*1024)).toString('utf8')),
    readBlob:(name,max)=>readObject(bucket,name,max),
    readWindow:async digest=>(await windowRef(digest).get()).data()?.current||null,
    reserveRefresh:async digest=>{
      const t=now(),day=new Date(t).toISOString().slice(0,10),token=crypto.randomUUID(),ref=windowRef(digest);
      return db.runTransaction(async tx=>{
        const [a,w]=await Promise.all([tx.get(globalRef),tx.get(ref)]),g=a.data()||{},s=w.data()||{};
        if((g.nextAt||0)>t||(g.leaseUntil||0)>t||(s.nextAt||0)>t||(g.day===day&&(g.count||0)>=MAX_DAILY_REFRESHES))return null;
        tx.set(globalRef,{day,count:(g.day===day?g.count||0:0)+1,nextAt:t+60000,leaseUntil:t+30000,token},{merge:true});
        tx.set(ref,{nextAt:t+15*60000,leaseUntil:t+30000,token,lastAttemptAt:new Date(t).toISOString()},{merge:true});
        return token;
      });
    },
    finishRefresh:async(digest,token,{meta,snapshot,diagnostic})=>{
      let current=null;
      if(meta&&snapshot){
        const encoded=cache.encode({version:cache.VERSION,geometryDigest:digest,snapshot});
        await bucket.file(cache.blobPath(encoded.hash)).save(encoded.bytes,{resumable:false,contentType:'application/gzip',
          preconditionOpts:{ifGenerationMatch:0}}).catch(e=>{if(Number(e.code)!==412)throw e;});
        current={...meta,evidenceHash:encoded.hash};
      }
      return db.runTransaction(async tx=>{
        const ref=windowRef(digest),[w,a]=await Promise.all([tx.get(ref),tx.get(globalRef)]),old=w.data()||{};
        if(old.token!==token)return false;
        const update={leaseUntil:0,lastResult:safeDiagnostic(diagnostic),lastFinishedAt:new Date(now()).toISOString()};
        if(current&&(!old.current||Date.parse(current.snapshotAt)>=Date.parse(old.current.snapshotAt)))update.current=current;
        tx.update(ref,update);
        if(a.data()?.token===token)tx.set(globalRef,{leaseUntil:0},{merge:true});
        return true;
      });
    },
  };
}
function createAcquirer({db,bucket,liveFetch,now,allowPartialRegional=false}){return cache.createAcquirer({store:createStore({db,bucket,now}),liveFetch,now,allowPartialRegional});}
module.exports={COLLECTION,MAX_DAILY_REFRESHES,MANIFEST,readObject,safeDiagnostic,createStore,createAcquirer};
