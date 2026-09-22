'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local emulator required');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-unstarted-social'},'unstarted-social'),db=getFirestore(app);after(async()=>{await db.terminate();await deleteApp(app)});
const {resume}=require('../functions-social-operations/social_unstarted_generation');
async function fixture(){const uid='u'+crypto.randomUUID(),itemId=uid+'_item',policy={id:'policy',planId:'plan',providers:['facebook']},requestId='social_mix_'+uid;
 const input={requestId,socialPost:{itemId,provider:'facebook',version:2}},old={businessUid:uid,policyId:'policy',status:'needs_attention',reason:'prior infrastructure failure',input:{...input,socialPost:{...input.socialPost,version:1}}};
 const ref=db.doc('socialManagedGenerationRequests/'+uid),id='visual_job_'+crypto.createHash('sha256').update(uid+'\n'+requestId).digest('hex').slice(0,40);
 const version={businessUid:uid,planId:'plan',contentHash:'oldhash',goal:'Business value',pillar:'Clear evidence',variants:[{provider:'facebook',copy:'Unchanged exact copy',destinationUrl:'https://example.com'}]};
 const job={businessUid:uid,managedPolicyId:'policy',authorizationSource:'approved_strategy',requestId,status:'queued',attemptCount:0,safeBrief:{socialCreativeContext:{post:{contentHash:'oldhash'}}}};
 await Promise.all([ref.set(old),db.doc('visualGenerationJobs/'+id).set(job),db.doc('socialContentItems/'+itemId).set({businessUid:uid,planId:'plan',currentVersion:2}),db.doc('socialContentVersions/'+itemId+'_v1').set(version),db.doc('socialContentVersions/'+itemId+'_v2').set({...version,contentHash:'timechanged',scheduledFor:'2030-01-01'})]);
 const run=()=>db.runTransaction(async tx=>resume({db,tx,ref,old:(await tx.get(ref)).data(),uid,policy,input,now:1000}));return {uid,itemId,ref,id,job,run};}
test('concurrent recovery binds one existing never-attempted job with original request evidence',async()=>{const f=await fixture(),results=await Promise.all([f.run(),f.run()]);assert.equal(results.filter(Boolean).length,1);const record=(await f.ref.get()).data();assert.equal(record.jobId,f.id);assert.equal(record.input.socialPost.version,2);assert.equal(record.unstartedJobRecovery.previousInput.socialPost.version,1);assert.deepEqual((await db.doc('visualGenerationJobs/'+f.id).get()).data(),f.job);assert.equal((await db.doc('visualGenerationReservations/'+f.id).get()).exists,false);});
test('paid/unknown/attempted work, changed content, wrong tenant, and exhausted recovery never resume',async()=>{
 for(const kind of ['reservation','attempted','unknown','copy','tenant','used']){const f=await fixture();
 if(kind==='reservation')await db.doc('visualGenerationReservations/'+f.id).set({status:'reserved'});
 if(kind==='attempted')await db.doc('visualGenerationJobs/'+f.id).update({attemptCount:1});
 if(kind==='unknown')await db.doc('visualGenerationJobs/'+f.id).update({status:'unknown_provider_outcome'});
 if(kind==='copy')await db.doc('socialContentVersions/'+f.itemId+'_v2').update({goal:'A different topic'});
 if(kind==='tenant')await db.doc('visualGenerationJobs/'+f.id).update({businessUid:'other'});
 if(kind==='used')await f.ref.update({unstartedJobRecoveryAt:1});
 assert.equal(await f.run(),false,kind);assert.equal((await f.ref.get()).data().status,'needs_attention');}
});
