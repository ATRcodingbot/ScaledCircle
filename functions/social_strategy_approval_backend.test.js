'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-social-strategy'},'strategy-tests'),db=app.firestore();
const source=fs.readFileSync(require('node:path').join(__dirname,'../functions-social-operations/index.js'),'utf8');
const start=source.indexOf('exports.approveSocialContentPlanV1 ='),end=source.indexOf('exports.createEmailContentPlanV1 =',start),handlers={};
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
vm.runInNewContext(source.slice(start,end),{exports:handlers,onCall:(_,fn)=>fn,db:new Proxy(db,{get:(t,k)=>k==='runTransaction'?fn=>t.runTransaction(tx=>Promise.resolve(fn(tx))):typeof t[k]==='function'?t[k].bind(t):t[k]}),FieldValue:admin.firestore.FieldValue,HttpsError,readText:x=>x,requireSocialOperationsBusiness:async request=>({uid:request.auth.uid}),socialOperations:require('../functions-social-operations/social_operations')});
after(()=>app.delete());
test('strategy approval is version-bound, idempotent and does not approve/schedule posts',async()=>{
 const ref=db.doc('socialContentPlans/strategy_review_test'),item=db.doc('socialContentItems/strategy_item_test');
 await ref.set({businessUid:'owner',planVersion:3,status:'ready_for_review',strategy:{version:'CustomerSocialDraftStrategyV1'},items:[{creativeBrief:'Not finished media'}]});
 await item.set({businessUid:'owner',planId:ref.id,currentVersion:1,status:'ready_for_review'});
 const before=(await item.get()).data(),approve=uid=>handlers.approveSocialContentPlanV1({auth:{uid},data:{planId:ref.id,planVersion:3}});
 await assert.rejects(approve('other'),{code:'permission-denied'});
 await assert.rejects(handlers.approveSocialContentPlanV1({auth:{uid:'owner'},data:{planId:ref.id,planVersion:2}}),{code:'failed-precondition'});
 const results=await Promise.all([approve('owner'),approve('owner')]);assert.equal(results.filter(r=>r.duplicate).length,1);
 assert.equal((await ref.get()).data().status,'approved');assert.deepEqual((await item.get()).data(),before);
 assert.equal((await db.collection('socialPublishingJobs').get()).size,0);
});
