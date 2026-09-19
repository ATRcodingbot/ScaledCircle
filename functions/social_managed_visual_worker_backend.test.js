'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'managed-visual'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('server generation uses exact delegated request without a browser; paused workspace cannot generate',async()=>{
 const now=Date.now(),uid='visual_worker_'+now,planId=uid+'_plan',input={requestId:uid,serviceCategory:'decks',socialPost:{itemId:uid+'_post',provider:'facebook',version:1}};
 const plan={businessUid:uid,status:'approved',planVersion:1,approvedVersion:1,strategy:{services:['decks']}};
 const policy=require('../functions-social-operations/social_bounded_authority').createPolicy({uid,actorUid:uid,planId,plan,
   services:['decks'],providers:['facebook'],destinations:['https://example.com'],startsAt:now,endsAt:now+86400000,now});
 const ref=db.doc('socialManagedGenerationRequests/'+uid);
 await Promise.all([db.doc('socialContentPlans/'+planId).set(plan),db.doc('socialManagedPolicies/'+uid).set(policy),
  db.doc('users/'+uid).set({role:'business',active:true}),
  db.doc('socialContentItems/'+uid+'_post').set({businessUid:uid,planId,currentVersion:1}),
  ref.set({businessUid:uid,planId,policyId:policy.id,input,status:'pending'})]);
 let requests=0,processes=0;
 const worker=require('./social_managed_visual_worker').createWorker({db,now:()=>now,auth:{getUser:async()=>({emailVerified:true,disabled:false})},
  generation:{request:async args=>{assert.deepEqual(args.input,input);assert.equal(args.actor.managedAuthority.policyId,policy.id);requests++;return {jobId:'job',status:'queued'};},
   process:async()=>{processes++;return {status:'review_required'};}}});
 await worker.run();await worker.run();assert.equal(requests,1);assert.equal(processes,1);assert.equal((await ref.get()).data().status,'prepared');
 await ref.update({status:'pending'});await db.doc('socialManagedPolicies/'+uid).update({status:'paused'});
 await worker.run();assert.equal(requests,1);assert.equal((await ref.get()).data().status,'paused');
 await ref.update({status:'pending'});await db.doc('socialManagedPolicies/'+uid).update({status:'active'});
 await db.doc('socialContentItems/'+uid+'_post').update({managedHolds:{facebook:{status:'editing'}}});
 await worker.run();assert.equal(requests,1);assert.equal((await ref.get()).data().status,'needs_attention');
});
