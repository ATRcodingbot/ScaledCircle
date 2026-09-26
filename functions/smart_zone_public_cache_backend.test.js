'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const runtime=require('./smart_zone_public_cache_runtime'),cache=require('./smart_zone_public_cache');
const app=initializeApp({projectId:'demo-public-cache'},'public-cache'),db=getFirestore(app);
const objects=new Map(),bucket={file:name=>({save:async bytes=>objects.set(name,bytes)})};let clock=Date.now();
const store=runtime.createStore({db,bucket,now:()=>clock});
after(async()=>{await db.terminate();await deleteApp(app);});
test('one global refresh lease across simultaneous workspaces/windows; daily cap enforced',async()=>{
 const a='a'.repeat(64),b='b'.repeat(64),results=await Promise.all([store.reserveRefresh(a),store.reserveRefresh(b)]);
 assert.equal(results.filter(Boolean).length,1);
 const ref=db.doc(runtime.COLLECTION+'/authority');clock+=61000;
 await ref.set({day:new Date(clock).toISOString().slice(0,10),count:60,nextAt:0,leaseUntil:0});
 assert.equal(await store.reserveRefresh('c'.repeat(64)),null);
});
test('failed refresh keeps last good immutable pointer; late lease cannot overwrite newer evidence',async()=>{
 clock+=cache.DAY;const digest='d'.repeat(64),lease=await store.reserveRefresh(digest);assert.ok(lease);
 const meta={snapshotAt:new Date(clock).toISOString(),sourceHash:'e'.repeat(64)};
 await store.finishRefresh(digest,lease,{meta,snapshot:{source:'fixture'},diagnostic:{status:'success'}});
 const old=await store.readWindow(digest);assert.ok(old.evidenceHash);assert.equal(objects.size,1);
 clock+=16*60000;const second=await store.reserveRefresh(digest);assert.ok(second);
 await store.finishRefresh(digest,second,{diagnostic:{reasonCode:'timeout',raw:'secret'}});
 assert.deepEqual(await store.readWindow(digest),old);
 assert.equal(await store.finishRefresh(digest,lease,{diagnostic:{reasonCode:'late_result'}}),false);
 const doc=(await db.doc(runtime.COLLECTION+'/'+digest).get()).data();assert.deepEqual(doc.lastResult,{reasonCode:'timeout'});
});
