'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-fair-sync'},'fair-sync'),db=app.firestore();
const {createReplySync}=require('../functions-business-email/reply_sync');
let clock,seen,sync;
const root=b=>db.doc('businessMailboxes/'+b),sub=(b,c,i)=>root(b).collection(c).doc(i),a={businessId:'owner'};
beforeEach(async()=>{for(const r of await db.collection('businessMailboxes').listDocuments())await db.recursiveDelete(r);
 clock=Date.parse('2026-09-21T15:00:00Z');seen=[];await root('owner').set({status:'connected',permissions:{read:true},generation:'g1'});
 sync=createReplySync({db,root,sub,now:()=>clock,reconcile:async(_,i)=>{seen.push(i.operationId);}});
});
after(()=>app.delete());
test('cursor reaches conversations beyond newest 100 and wraps with bounded provider reads',async()=>{
 const batch=db.batch();for(let i=0;i<107;i++)batch.set(sub('owner','operations','op_'+i),{businessId:'owner',state:'sent',requestedAt:clock-i-1000});await batch.commit();
 for(let i=0;i<36;i++){const r=await sync(a);assert.ok(r.attempted<=3);assert.ok(r.scanned<=100);clock+=300001;}
 assert.equal(new Set(seen).size,107);assert.ok(seen.includes('op_106'));
 assert.equal((await sub('owner','private','replySync').get()).data().cursor,null);
});
test('concurrent visits share a lease; disconnected/read-revoked mailbox cannot be read',async()=>{
 await sub('owner','operations','op').set({businessId:'owner',state:'sent',requestedAt:clock-1000});
 await Promise.all([sync(a),sync(a)]);assert.deepEqual(seen,['op']);
 clock+=300001;await root('owner').update({status:'not_connected'});assert.equal((await sync(a)).checked,0);assert.equal(seen.length,1);
});
test('failed conversation advances cursor; older active conversations remain monitored independently of labels',async()=>{
 const batch=db.batch();for(let i=0;i<5;i++)batch.set(sub('owner','operations','op_'+i),{businessId:i===0?'other':'owner',state:'sent',requestedAt:clock-i-1});
 batch.set(sub('owner','operations','old'),{businessId:'owner',state:'sent',requestedAt:clock-31*86400000});await batch.commit();
 sync=createReplySync({db,root,sub,now:()=>clock,reconcile:async(_,i)=>{seen.push(i.operationId);throw Error('fixture failure');}});
 assert.equal((await sync(a)).attempted,3);clock+=300001;assert.equal((await sync(a)).attempted,2);
 assert.deepEqual(seen,['op_1','op_2','op_3','op_4','old']);assert.equal((await sub('owner','private','replySync').get()).data().lease,null);
});
