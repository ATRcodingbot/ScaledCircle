'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'diversity'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('attached approved candidate survives a preparation claim without re-review, generation or changing the scheduled sibling',async()=>{
 const uid='attached_owner',itemId='attached_post',provider='instagram',now=Date.parse('2026-09-22T11:00:00Z');
 const d=require('../functions-social-operations/social_creative_diversity'),assetId='attached_asset',revisionId='attached_revision',mediaId='attached_media',hash='a'.repeat(64);
 const version={businessUid:uid,planId:'attached_plan',version:7,goal:'Discuss deck upkeep',pillar:'Care choices',scheduledFor:'2026-09-22T19:00:00Z',variants:[{provider,copy:'Consider cleaning and routine care before choosing deck materials.',mediaAssetId:assetId,mediaRevisionId:mediaId,mediaRequirement:'approved_image'}]};
 const recommendation={policy:d.POLICY,historyPolicy:'SocialCreativeHistoryV2',format:'generated',service:'decks',requestId:'social_mix_original',label:'New service concept'};
 const candidate={assetId,revisionId,sourceSha256:hash,sha256:'b'.repeat(64),preparation:{subjectQuality:{status:'passed'}}};
 const lease=db.doc('socialCreativePreparation/'+d.leaseId(uid,{itemId,provider}));
 const frozen={businessUid:uid,versionId:itemId+'_v3',provider:'facebook',status:'scheduled',scheduledFor:version.scheduledFor};
 await Promise.all([
 db.doc('socialContentItems/'+itemId).set({businessUid:uid,planId:version.planId,currentVersion:7,platformVersions:{facebook:3,instagram:7}}),
 db.doc('socialContentVersions/'+itemId+'_v7').set(version),
 db.doc('socialContentVersions/'+itemId+'_v3').set({...version,version:3,variants:[{provider:'facebook',copy:'Preserved original',mediaRequirement:'image'}]}),
 db.doc('socialGrowthJobs/attached_facebook').set(frozen),
 db.doc('businessBrandProfiles/'+uid).set({approvedServiceCategories:['decks']}),
 db.doc(`businessMediaLibraries/${uid}/mediaAssets/${assetId}`).set({businessUid:uid,title:'Deck details',currentRevisionId:revisionId,approvedRevisionId:revisionId}),
 db.doc(`businessMediaLibraries/${uid}/mediaAssets/${assetId}/revisions/${revisionId}`).set({businessUid:uid,status:'ready',approvalStatus:'approved',rightsAttestation:true,altText:'Deck details',serviceLabel:'decks',origin:'generated_service_concept',contentHash:hash,storageGeneration:'1',privateOriginalPath:`business_media_private/${uid}/${assetId}/${revisionId}/original`}),
 db.doc(`socialMediaLibraries/${uid}/items/${mediaId}`).set({businessUid:uid,assetId,sourceSha256:hash,preparation:{policy:'SocialFeedCreativeV2'}}),
 lease.set({businessUid:uid,itemId,provider,version:7,state:'creative_review',recommendation,generationOverride:recommendation,reviewCandidate:candidate,infrastructureRecoveryAttempts:1,failureStage:'preparation',failureReason:'Previous private-source failure',finishedAt:now-1})]);
 const never=()=>{throw Error('must not generate, review, attach or edit');};
 const prepare=require('../functions-social-operations/social_customer_preparation').createPreparation({db,now:()=>now,editor:{save:never,assess:async()=>({readyToPublish:true})},media:{prepareCandidate:never,attach:never}});
 const result=await prepare.prepare(uid,{itemId,provider,version:7});
 assert.equal(result.creativeStatus,'approved_service_concept');assert.equal(result.generationRequest,null);
 const saved=(await lease.get()).data();assert.equal(saved.state,'prepared');assert.equal(saved.recommendation.assetId,assetId);assert.equal(saved.infrastructureRecoveryAttempts,1);
 assert.equal(saved.previousPreparationFailure.reason,'Previous private-source failure');
 assert.deepEqual(saved.reviewCandidate,candidate);
 assert.equal((await prepare.prepare(uid,{itemId,provider,version:7})).creativeStatus,'prepared');
 assert.deepEqual((await db.doc('socialGrowthJobs/attached_facebook').get()).data(),frozen);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v7').get()).data(),version);
 assert.equal((await db.collection('visualGenerationJobs').where('businessUid','==',uid).get()).size,0);
});
test('diversifies only unscheduled versions; disabled generation never substitutes reused media or approves',async()=>{
 const uid='diversity_owner',itemId='diversity_post',now=Date.parse('2026-09-14T01:00:00Z');
 const source=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId:'diversity_plan',now,
  item:{itemKey:'post',scheduledFor:'2026-10-01T16:00:00Z',goal:'Invite a useful conversation',pillar:'Your priorities',variants:
   ['facebook','instagram'].map(provider=>({provider,copy:'Which matters most for your next deck project: function, materials or timing? Share your priorities with us.',mediaRequirement:'image'}))}});
 const frozen={businessUid:uid,versionId:itemId+'_v1',provider:'instagram',status:'scheduled',scheduledFor:source.scheduledFor};
 await Promise.all([db.doc('socialContentItems/'+itemId).set({businessUid:uid,planId:'diversity_plan',currentVersion:1}),
  db.doc('socialContentVersions/'+itemId+'_v1').set({...source,scheduledFor:Timestamp.fromDate(new Date(source.scheduledFor))}),
  db.doc('businessBrandProfiles/'+uid).set({businessUid:uid,approvedServiceCategories:['decks']}),
  db.doc('socialGrowthJobs/diversity_frozen').set(frozen)]);
 const editor=require('../functions-social-operations/social_customer_editor').createEditor({db,now:()=>now,enabledUids:[uid]});
 const prepare=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,now:()=>now,media:{attach(){throw Error('must not attach');}}});
 const text=await prepare.prepare(uid,{itemId,provider:'facebook',version:1});
 assert.equal(text.creativeStatus,'text_only');assert.equal(text.version,2);
 const v=(await db.doc('socialContentVersions/'+itemId+'_v2').get()).data();
 assert.equal(v.variants.find(r=>r.provider==='facebook').mediaRequirement,'none');
 assert.equal(v.scheduledFor,source.scheduledFor);assert.equal(v.approvedAt,null);
 assert.equal((await db.doc('socialContentItems/'+itemId).get()).data().platformVersions.instagram,1);
 assert.deepEqual((await db.doc('socialGrowthJobs/diversity_frozen').get()).data(),frozen);
 const replay=await prepare.prepare(uid,{itemId,provider:'facebook',version:2});assert.equal(replay.creativeStatus,'prepared');
 const newId='diversity_new';await db.doc('socialContentItems/'+newId).set({businessUid:uid,planId:'diversity_plan',currentVersion:1});
 await db.doc('socialContentVersions/'+newId+'_v1').set({...source,pillar:'Explore decks',goal:'Explore a service'});
 const held=await prepare.prepare(uid,{itemId:newId,provider:'instagram',version:1});
 assert.equal(held.creativeStatus,'needs_creative');assert.equal(held.generationStatus,'configuration_unavailable');assert.equal(held.generationRequest,null);
 const d=require('../functions-social-operations/social_creative_diversity');
 const lease=(await db.doc('socialCreativePreparation/'+d.leaseId(uid,{itemId:newId,provider:'instagram'})).get()).data();
 assert.equal(lease.state,'needs_attention');assert.equal(lease.recommendation.format,'generated');
 for(const collection of ['socialGrowthApprovals','visualGenerationJobs','financialOperations'])assert.equal((await db.collection(collection).where('businessUid','==',uid).get()).size,0);
});
