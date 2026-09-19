'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'') ||
 [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!=='demo-scaledcircle'))throw Error('local_demo_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const {createStore}=require('../functions-social-operations/social_customer_scheduling');
const {fixture}=require('./social_customer_scheduling.test');
const app=initializeApp({projectId:'demo-scaledcircle'},'customer-scheduling'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app)});
test('real transaction: one exact approval/job on concurrent taps, no plan/version mutation',async()=>{
 const f=fixture(),uid='customer_schedule_'+require('node:crypto').randomUUID(),itemId=uid+'_post';
 const version={...f.version,businessUid:uid,planId:'customer_plan'};
 const plan={...f.plan,businessUid:uid},item={...f.item,businessUid:uid,planId:'customer_plan'};
 const write=(path,value)=>db.doc(path).set(value);
 await Promise.all([write('socialContentPlans/customer_plan',plan),write('socialContentItems/'+itemId,item),
  write('socialContentVersions/'+itemId+'_v1',version),write(`socialConnections/${uid}/providers/facebook`,{...f.connection,businessUid:null,grantedScopes:[...f.connection.grantedScopes,'public_profile']}),
  write('socialContentQualityAssessments/'+itemId+'_v1',{...f.quality,businessUid:uid}),write('agentHealth/'+uid,f.health),
  write('socialProviderConfigs/production_meta',f.config),write('businessSubscriptions/'+uid,f.entitlement)]);
 const store=createStore({db,planEntitled:true,environment:'production',now:()=>f.now});
 const input={itemId,provider:'facebook',version:1,contentHash:version.contentHash,bindingHash:require('../functions-social-operations/social_growth_cycle').contentBinding({id:itemId+'_v1',record:version},uid).bindingHash};
 input.reviewDigest=(await store.preview(uid,input)).reviewDigest;
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,0);
 for(const denied of [{...f.entitlement,planId:'scale'},{...f.entitlement,status:'canceled'}]){
  await write('businessSubscriptions/'+uid,denied);
  assert.ok((await store.preview(uid,input)).reasons.some(r=>r.code==='scheduler'));
  assert.equal((await store.approve(uid,input)).status,'blocked');
 }
 await write('businessSubscriptions/'+uid,f.entitlement);
 const beforePlan=(await db.doc('socialContentPlans/customer_plan').get()).data(),beforeVersion=(await db.doc('socialContentVersions/'+itemId+'_v1').get()).data();
 await assert.rejects(store.approve('unrelated',input));
 await assert.rejects(store.approve(uid,{...input,contentHash:'b'.repeat(64)}));
 await assert.rejects(store.preview(uid,{itemId:'../private',provider:'facebook'}));
 await db.doc(`socialConnections/${uid}/providers/facebook`).update({providerUserId:'999'});
 await assert.rejects(store.approve(uid,input),/changed/);
 await db.doc(`socialConnections/${uid}/providers/facebook`).update({providerUserId:'123'});
 const result=await Promise.all([store.approve(uid,input),store.approve(uid,input)]);
 assert.equal(result[0].jobId,result[1].jobId);assert.equal(result.filter(r=>!r.reused).length,1);
 const jobs=await db.collection('socialGrowthJobs').where('businessUid','==',uid).get();assert.equal(jobs.size,1);
 assert.equal(jobs.docs[0].data().status,'scheduled');assert.equal(jobs.docs[0].data().customerApproval,true);
 const enrollment=require('../functions-social-operations/social_customer_enrollment');
 assert.ok(!(await enrollment.inventory({db,now:f.now})).uids.includes(uid));
 const due=await enrollment.inventory({db,now:f.now+600000});
 assert.deepEqual(due.jobIdsByBusiness[uid],[result[0].jobId]);
 assert.equal((await db.collection('socialGrowthApprovals').where('businessUid','==',uid).get()).size,1);
 assert.deepEqual((await db.doc('socialContentPlans/customer_plan').get()).data(),beforePlan);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v1').get()).data(),beforeVersion);
 assert.equal((await jobs.docs[0].ref.collection('providerSteps').get()).size,0);
 assert.equal((await jobs.docs[0].ref.collection('receipts').get()).size,0);
 await db.doc('socialContentVersions/'+itemId+'_v2').set({...version,version:2});
 await db.doc('socialContentItems/'+itemId).update({currentVersion:2});
 const newer=await store.preview(uid,input);
 const held=await store.approve(uid,{...input,version:2,bindingHash:newer.bindingHash,reviewDigest:newer.reviewDigest});
 assert.equal(held.status,'blocked');assert.ok(held.reasons.some(r=>r.code==='existing'));
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,1);
 await db.doc('socialContentItems/'+itemId).update({currentVersion:1});
 let clock=f.now,creates=0;
 const publisher=require('../functions-social-operations/social_meta_runtime').createPublisher({db,project:'scaled-circle',
   customerUids:[uid],providerCreatesEnabled:true,now:()=>clock,
   credentials:async()=>({businessUid:uid,providerUserId:'123',linkedPageId:'123',tokenType:'PAGE',accessToken:'mock-only'}),
   fetchImpl:async(_url,options)=>{if(options.method==='POST')creates++;return {ok:true,json:async()=>options.method==='POST'
     ? {id:'123_789'} : {id:'123_789',from:{id:'123'},message:version.variants[0].copy}};}});
 await assert.rejects(publisher.execute(result[0].jobId),/schedule_closed/);assert.equal(creates,0);
 clock=f.now+600000;
 await Promise.all([publisher.execute(result[0].jobId),publisher.execute(result[0].jobId)]);
 assert.equal(creates,1);assert.equal((await jobs.docs[0].ref.get()).data().status,'published');
 await publisher.execute(result[0].jobId);assert.equal(creates,1);
 assert.ok(!(await enrollment.inventory({db,now:clock})).uids.includes(uid));
 // Use the real approval store for the missed-window regression as well.
 const missedItem='customer_plan_missed',missedUid=uid+'_missed',missedVersion={...version,businessUid:missedUid,planId:missedItem};
 await Promise.all([write('socialContentItems/'+missedItem,{...item,businessUid:missedUid,planId:missedItem}),
  write('socialContentPlans/'+missedItem,{...plan,businessUid:missedUid}),
  write('socialContentVersions/'+missedItem+'_v1',missedVersion),
  write('socialContentQualityAssessments/'+missedItem+'_v1',{...f.quality,businessUid:missedUid}),
  write('agentHealth/'+missedUid,f.health),write('businessSubscriptions/'+missedUid,f.entitlement),
  write(`socialConnections/${missedUid}/providers/facebook`,{...f.connection,businessUid:missedUid})]);
 const missedPreview=await store.preview(missedUid,{itemId:missedItem,provider:'facebook'});
 const missedInput={...input,itemId:missedItem,bindingHash:missedPreview.bindingHash,reviewDigest:missedPreview.reviewDigest};
 const missed=await store.approve(missedUid,missedInput),expiredNow=f.now+600000+15*60000+1;
 assert.equal(missed.status,'scheduled');
 const expired=await enrollment.inventory({db,now:expiredNow});assert.ok(expired.jobIdsByBusiness[missedUid].includes(missed.jobId));
 let expiredProviderCalls=0;
 await require('../functions-social-operations/social_meta_scheduler').run({db,businessUid:missedUid,customerOnly:true,jobIds:[missed.jobId],now:expiredNow,
  publisher:{inspect:async()=>{expiredProviderCalls++;throw Error('expired_provider_forbidden');},execute:async()=>{expiredProviderCalls++;throw Error('expired_provider_forbidden');}}});
 const expiredJob=(await db.doc('socialGrowthJobs/'+missed.jobId).get()).data();
 assert.equal(expiredProviderCalls,0);assert.equal(expiredJob.status,'authority_review_required');assert.equal(expiredJob.blockedReason,'schedule_window_closed');
 assert.deepEqual((await db.doc('socialContentVersions/'+missedItem+'_v1').get()).data(),missedVersion);
 const blockedUid='customer_schedule_blocked';
 await write('socialContentItems/blocked_item',{...item,businessUid:blockedUid});
 await write('socialContentPlans/customer_plan_blocked',{...plan,businessUid:blockedUid});
 await write('socialContentItems/blocked_item',{...item,businessUid:blockedUid,planId:'customer_plan_blocked'});
 await write('socialContentVersions/blocked_item_v1',{...version,businessUid:blockedUid,planId:'customer_plan_blocked'});
 const blockedPreview=await store.preview(blockedUid,{itemId:'blocked_item',provider:'facebook'});
 const blocked=await store.approve(blockedUid,{...input,itemId:'blocked_item',bindingHash:blockedPreview.bindingHash,reviewDigest:blockedPreview.reviewDigest});
 assert.equal(blocked.status,'blocked');assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',blockedUid).get()).size,0);
});
