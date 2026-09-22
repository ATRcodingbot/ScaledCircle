'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'attached-cycle'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('approved v7 lineage proceeds through the real preparation/cadence/schedule stores exactly once across restart',async()=>{
 const uid='attached_cycle_owner',planId=uid+'_plan',itemId=planId+'_post',now=Date.parse('2026-09-22T11:00:00Z');
 const bounded=require('../functions-social-operations/social_bounded_authority'),d=require('../functions-social-operations/social_creative_diversity');
 const plan={businessUid:uid,status:'approved',planVersion:1,approvedVersion:1,strategy:{services:['decks']},items:[{itemKey:'post',variants:[{provider:'facebook'},{provider:'instagram'}]}]};
 const policy=bounded.createPolicy({uid,actorUid:uid,planId,plan,services:['decks'],destinations:['https://example.com/decks'],providers:['facebook','instagram'],maxPerWeek:5,startsAt:now,endsAt:now+7*86400000,now});
 const assetId='attached_asset',revisionId='attached_revision',sourceHash='a'.repeat(64),imageHash='b'.repeat(64),deliveryId='c'.repeat(64);
 const quality={policy:'SocialSubjectVisibilityV1',status:'passed',reasons:[],checkedSha256:imageHash,observations:{confidence:0.8}};
 const media=require('../functions-social-operations/social_meta_candidate').mediaRevision({businessUid:uid,assetId,provider:'instagram',customerDeliveryId:deliveryId,productionOrigin:'https://us-east1-scaled-circle.cloudfunctions.net',images:[{sha256:imageHash,bytes:317995,width:1024,height:1024,mime:'image/jpeg',url:`https://us-east1-scaled-circle.cloudfunctions.net/serveCustomerSocialMediaV1/${deliveryId}.jpg`}]});
 Object.assign(media,{sourceRevisionId:revisionId,sourceSha256:sourceHash,sourceOrigin:'generated_service_concept',preparation:{policy:'SocialFeedCreativeV2',pixelCheck:'passed',checkedSha256:imageHash,subjectQuality:quality}});
 const copy='Considering decks? Look beyond the first day: ask how material choices affect cleaning, routine care and future repairs. Fixture Remodel can discuss those trade-offs with you before you decide on a project scope.';
 const version=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId,previousVersion:6,now,item:{itemKey:'post',goal:'Discuss upkeep choices for decks',pillar:'Plan for ongoing care',scheduledFor:'2026-09-22T19:00:00Z',variants:[{provider:'instagram',format:'feed',copy,callToAction:'Request an estimate',destinationUrl:'https://example.com/decks',mediaAssetId:assetId,mediaRevisionId:media.id,mediaRequirement:'approved_image',altText:'Deck concept'}]}});
 const frozenVersion={...version,version:3,variants:[{provider:'facebook',format:'text',copy:'Original Facebook version remains unchanged.',mediaRequirement:'none'}]};
 const frozenJob={id:'attached_cycle_facebook',businessUid:uid,versionId:itemId+'_v3',provider:'facebook',status:'scheduled',scheduledFor:version.scheduledFor,customerApproval:true};
 const recommendation={policy:d.POLICY,historyPolicy:'SocialCreativeHistoryV2',format:'generated',service:'decks',requestId:'social_mix_original',label:'New service concept'};
 const candidate={assetId,revisionId,sourceSha256:sourceHash,sha256:imageHash,preparation:{subjectQuality:quality},status:'pending_owner_review',approved:false};
 const lease=db.doc('socialCreativePreparation/'+d.leaseId(uid,{itemId,provider:'instagram'}));
 const write=(p,v)=>db.doc(p).set(v);
 await Promise.all([
 write('socialContentPlans/'+planId,plan),write('socialManagedPolicies/'+uid,policy),
 write('socialContentItems/'+itemId,{businessUid:uid,planId,itemKey:'post',currentVersion:7,platformVersions:{facebook:3,instagram:7}}),
 write('socialContentVersions/'+itemId+'_v7',version),write('socialContentVersions/'+itemId+'_v3',frozenVersion),write('socialGrowthJobs/'+frozenJob.id,frozenJob),
 write('businessBrandProfiles/'+uid,{approvedServiceCategories:['decks']}),write('businessGrowthProfiles/'+uid,{businessName:'Fixture Remodel',services:['decks'],serviceArea:'Maryland'}),
 write('businessSubscriptions/'+uid,{plan:'managed_growth',status:'active',expiresAt:new Date(now+30*86400000)}),
 write('socialProviderConfigs/production_meta',{provider:'meta',environment:'production',enabled:true,writeScopesEnabled:true}),
 write(`socialConnections/${uid}/providers/instagram`,{businessUid:uid,environment:'production',status:'connected_write',tokenHealth:'healthy',credentialId:'fixture',providerUserId:'123',linkedPageId:'456',connectionRevision:1,credentialRotationGeneration:1,grantedScopes:['pages_read_engagement','instagram_basic','instagram_content_publish'],capabilities:{publishImage:true}}),
 write(`businessMediaLibraries/${uid}/mediaAssets/${assetId}`,{businessUid:uid,title:'Deck detail',currentRevisionId:revisionId,approvedRevisionId:revisionId}),
 write(`businessMediaLibraries/${uid}/mediaAssets/${assetId}/revisions/${revisionId}`,{businessUid:uid,status:'ready',approvalStatus:'approved',rightsAttestation:false,createdBy:'creative-media-core',generatedContentAcknowledged:true,approvedBy:uid,moderationStatus:'passed',moderation:{status:'passed',flags:[]},generationJobId:'visual_job_'+'d'.repeat(40),truthfulnessDisclosure:'Service concept image, not a photograph of completed Business work.',authorizationSource:'approved_strategy',managedPolicyId:policy.id,managedStrategyDigest:policy.strategyDigest,altText:'Deck detail',serviceLabel:'decks',origin:'generated_service_concept',contentHash:sourceHash,storageGeneration:'1',privateOriginalPath:`business_media_private/${uid}/${assetId}/${revisionId}/original`}),
 write(`socialMediaLibraries/${uid}/items/${media.id}`,media),write('customerSocialMedia/'+deliveryId,{businessUid:uid,status:'approved_for_social',assetId,revisionId,path:`customer_social_delivery/${deliveryId}.jpg`,generation:'2',sha256:imageHash,bytes:317995}),
 lease.set({businessUid:uid,itemId,provider:'instagram',version:7,state:'creative_review',recommendation,generationOverride:recommendation,reviewCandidate:candidate,infrastructureRecoveryAttempts:1,failureStage:'preparation',failureReason:'Previous private-source failure',finishedAt:now-1})]);
 const never=()=>assert.fail('No generation, review, media attachment or provider call is permitted');
 const freshCycle=()=>{
  const editor=require('../functions-social-operations/social_customer_editor').createEditor({db,planEntitled:true,now:()=>now});
  const preparation=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,media:{attach:never,prepareCandidate:never},now:()=>now});
  const store=require('../functions-social-operations/social_customer_scheduling').createStore({db,planEntitled:true,environment:'production',now:()=>now});
  return require('../functions-social-operations/social_managed_cycle').createCycle({db,store,editor,preparation,media:{attach:never},now:()=>now});
 };
 const first=await freshCycle().run(uid,{limit:1});
 assert.equal(first.results.find(r=>r.provider==='instagram')?.status,'scheduled',JSON.stringify(first));
 const jobs=await db.collection('socialGrowthJobs').where('businessUid','==',uid).get(),instagram=jobs.docs.filter(d=>d.data().provider==='instagram');
 assert.equal(instagram.length,1);const job=instagram[0].data();assert.equal(job.versionId,itemId+'_v7');assert.equal(job.scheduledFor,version.scheduledFor);
 const approval=(await db.doc('socialGrowthApprovals/'+job.approvalId).get()).data();assert.equal(approval.authorizationSource,'approved_strategy');assert.equal(approval.managedPolicyId,policy.id);
 const prep=(await lease.get()).data();assert.equal(prep.state,'prepared');assert.deepEqual(prep.reviewCandidate,candidate);assert.equal(prep.previousPreparationFailure.reason,'Previous private-source failure');
 await Promise.all([freshCycle().run(uid,{limit:1}),freshCycle().run(uid,{limit:1})]);
 assert.deepEqual((await instagram[0].ref.get()).data(),job);
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',uid).get()).size,2);
 assert.deepEqual((await db.doc('socialGrowthJobs/'+frozenJob.id).get()).data(),frozenJob);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v7').get()).data(),version);
 assert.deepEqual((await db.doc('socialContentVersions/'+itemId+'_v3').get()).data(),frozenVersion);
 for(const c of ['visualGenerationJobs','visualGenerationReservations','socialManagedGenerationRequests'])assert.equal((await db.collection(c).where('businessUid','==',uid).get()).size,0);
});
