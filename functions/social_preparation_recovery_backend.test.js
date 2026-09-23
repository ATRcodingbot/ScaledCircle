 'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'preparation-infrastructure-recovery'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app)});
test('catalog failure resumes exact source once under concurrent visits and preserves Facebook bytes',{timeout:20000},async()=>{
 const uid='infra_recovery_owner',itemId='infra_recovery_post',now=Date.parse('2026-09-22T10:00:00Z');
 const source=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId:'infra_plan',now,item:{itemKey:'post',scheduledFor:'2026-10-01T16:00:00Z',goal:'Explore a service',pillar:'Explore decks',variants:['facebook','instagram'].map(provider=>({provider,copy:'Explore a deck concept for your next project.',mediaRequirement:'image'}))}});
 const frozen={businessUid:uid,versionId:itemId+'_v1',provider:'facebook',status:'scheduled',scheduledFor:'2026-09-22T19:00:00Z',binding:{version:source}};
 await Promise.all([db.doc('socialContentItems/'+itemId).set({businessUid:uid,planId:'infra_plan',currentVersion:1}),db.doc('socialContentVersions/'+itemId+'_v1').set(source),db.doc('businessBrandProfiles/'+uid).set({businessUid:uid,approvedServiceCategories:['decks']}),db.doc('socialGrowthJobs/infra_frozen').set(frozen)]);
 // Keep the recovery in flight until the competing visit has checked its
 // lease. An immediate stub can finish before Firestore retries the second
 // transaction, which exercises a later readback rather than concurrent work.
 const entered=Promise.withResolvers(),release=Promise.withResolvers();
 let calls=0,requestId;const media={prepareCandidate:async(owner,input,recommendation)=>{assert.equal(owner,uid);if(requestId)assert.equal(recommendation.requestId,requestId);requestId=recommendation.requestId;calls++;if(calls===1){const error=Error('catalog unavailable');error.preparationStage='model_catalog';throw error;}entered.resolve();await release.promise;return {sha256:'same-existing-source',status:'blocked',subjectCheck:{status:'blocked',reasons:['Quality is genuinely below threshold']}};}};
 const editor={save:()=>{throw Error('unexpected copy/time change')},assess:async()=>({readyToPublish:false})};
 const prep=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,media,now:()=>now}),input={itemId,provider:'instagram',version:1};
 await assert.rejects(prep.prepare(uid,input),/catalog unavailable/);
 const ref=db.doc('socialCreativePreparation/'+require('../functions-social-operations/social_creative_diversity').leaseId(uid,input));
 assert.equal((await ref.get()).data().failureStage,'model_catalog');
 const recovering=prep.prepare(uid,input);await entered.promise;
 let competing;try{competing=await prep.prepare(uid,input);assert.equal(competing.creativeStatus,'preparing');}finally{release.resolve();}
 const results=[await recovering,competing];
 assert.equal(calls,2);assert.equal(results.filter(r=>r.creativeStatus==='concept_needs_review').length,1);
 const saved=(await ref.get()).data();assert.equal(saved.infrastructureRecoveryAttempts,1);assert.equal(saved.reviewCandidate.subjectCheck.status,'blocked');
 assert.deepEqual((await db.doc('socialGrowthJobs/infra_frozen').get()).data(),frozen);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v1').get()).data(),source);
 assert.equal((await db.collection('visualGenerationJobs').where('businessUid','==',uid).get()).size,0);
});
