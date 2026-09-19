'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'scheduled-changes'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('cancel preserves immutable binding and refuses other tenant, imminent or started publication',async()=>{
 const uid='change_'+Date.now(),now=Date.now(),service=require('../functions-social-operations/social_scheduled_changes').createChanges({db,now:()=>now});
 for(const [index,mode] of ['cancel','edit','started','imminent'].entries()){
  const id='social_growth_job_'+require('node:crypto').createHash('sha256').update(uid+index).digest('hex'),itemId=uid+'_'+index;
  const job={id,businessUid:uid,provider:'facebook',customerApproval:true,status:'scheduled',versionId:itemId+'_v1',
    scheduledFor:new Date(now+(mode==='imminent'?60000:3600000)).toISOString(),binding:{copy:'immutable'}};
  await db.doc('socialGrowthJobs/'+id).set(job);await db.doc('socialContentItems/'+itemId).set({businessUid:uid,currentVersion:1});
  if(mode==='started')await db.doc('socialGrowthJobs/'+id+'/providerSteps/step').set({state:'unknown'});
  await assert.rejects(service.cancel(uid,'other',{jobId:id,action:'cancel'}));
  if(['started','imminent'].includes(mode)){
   await assert.rejects(service.cancel(uid,uid,{jobId:id,action:'cancel'}));
   assert.equal((await db.doc('socialGrowthJobs/'+id).get()).data().status,'scheduled');continue;
  }
  const outcomes=await Promise.all([service.cancel(uid,uid,{jobId:id,action:mode}),service.cancel(uid,uid,{jobId:id,action:mode})]);
  assert.equal(outcomes.filter(x=>x.reused).length,1);
  const after=(await db.doc('socialGrowthJobs/'+id).get()).data();assert.deepEqual(after.binding,job.binding);
  assert.equal(after.status,'canceled');
  assert.equal((await db.doc('socialContentItems/'+itemId).get()).data().managedHolds.facebook.status,mode==='edit'?'editing':'canceled');
 }
});
