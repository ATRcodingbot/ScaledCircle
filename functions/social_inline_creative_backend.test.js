'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-scaledcircle'},'inline-review'),db=getFirestore(app),sharp=require('sharp');
after(async()=>{await db.terminate();await deleteApp(app);});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function setup(uid){
 const f=require('./social_customer_scheduling.test').fixture(),itemId=uid+'_post',planId=uid+'_plan';
 const requestId='social_mix_'+hash(uid+':'+itemId+':SocialCreativeDiversityV1'),jobId='visual_job_'+hash(uid+'\n'+requestId).slice(0,40);
 const assetId='concept',revisionId='r1',prefix=`business_media_private/${uid}/${assetId}/${revisionId}/`;
 const rgb=Buffer.alloc(900*700*3);for(let i=0;i<rgb.length;i++)rgb[i]=(i*13+Math.floor(i/2700)*7)%220+15;
 const original=await sharp(rgb,{raw:{width:900,height:700,channels:3}}).png().toBuffer();
 const asset={businessUid:uid,currentRevisionId:revisionId,approvedRevisionId:null,removed:false};
 const source={businessUid:uid,status:'ready',approvalStatus:'pending',origin:'generated_service_concept',createdBy:'creative-media-core',generationJobId:jobId,
  moderationStatus:'passed',moderation:{status:'passed',flags:[]},privateOriginalPath:prefix+'original',storageGeneration:'1',contentHash:hash(original),
  altText:'Deck service concept',truthfulnessDisclosure:'Service concept image — not a completed Business project.'};
 const files=new Map([[prefix+'original',original]]),bucket={file:p=>({download:async()=>[files.get(p)],save:async b=>{if(!files.has(p))files.set(p,b);},getMetadata:async()=>[{generation:'1'}]})};
 const media=require('../functions-social-operations/social_customer_media').createMedia({db,bucket,project:'scaled-circle',enabledUids:[uid],
   subjectCheck:async({sha256})=>({policy:'SocialSubjectVisibilityV1',checkedSha256:sha256,status:'passed'})});
 const version=require('../functions-social-operations/social_operations').contentItemVersion({businessUid:uid,planId,now:f.now,item:{itemKey:'post',goal:'Explore decks',pillar:'Decks',
  scheduledFor:f.version.scheduledFor,variants:[{provider:'facebook',copy:'Explore a deck concept for your next project.',format:'feed',mediaRequirement:'image'}]}});
 const write=(p,d)=>db.doc(p).set(d);
 await Promise.all([write(`businessMediaLibraries/${uid}/mediaAssets/${assetId}`,asset),write(`businessMediaLibraries/${uid}/mediaAssets/${assetId}/revisions/${revisionId}`,source),
  write('visualGenerationJobs/'+jobId,{businessUid:uid,status:'review_required',candidateAssetId:assetId,candidateRevisionId:revisionId,moderation:{status:'passed'}}),
  write('socialContentItems/'+itemId,{businessUid:uid,planId,currentVersion:1}),write('socialContentVersions/'+itemId+'_v1',version),write('socialContentPlans/'+planId,{...f.plan,businessUid:uid}),
  write(`socialConnections/${uid}/providers/facebook`,{...f.connection,businessUid:uid,capabilities:{publishImage:true,publishText:true}}),
  write('socialProviderConfigs/production_meta',f.config),write('agentHealth/'+uid,f.health),write('businessSubscriptions/'+uid,f.entitlement)]);
 const candidate=await media.prepareCandidate(uid,{itemId,provider:'facebook',version:1},{requestId});
 const lease=db.doc('socialCreativePreparation/'+require('../functions-social-operations/social_creative_diversity').leaseId(uid,{itemId,provider:'facebook'}));
 await lease.set({businessUid:uid,itemId,provider:'facebook',version:1,state:'creative_review',reviewCandidate:candidate,recommendation:{policy:'SocialCreativeDiversityV1',format:'generated',service:'decks'}});
 const store=require('../functions-social-operations/social_customer_scheduling').createStore({db,bucket,environment:'production',enabledUids:[uid],now:()=>f.now});
 const preview=await store.preview(uid,{itemId,provider:'facebook'});
 assert.equal(preview.ready,true,JSON.stringify(preview.reasons));assert.equal(preview.reviewState,'ready_for_review');assert.equal(preview.version,1);
 assert.equal(preview.reviewedPost.images.length,0);assert.equal(preview.reviewCandidate.sha256,candidate.sha256);
 const input={itemId,provider:'facebook',version:preview.version,contentHash:preview.contentHash,bindingHash:preview.bindingHash,reviewDigest:preview.reviewDigest,
  inlineCreativeDigest:preview.inlineCreativeApproval.digest,confirmCreativeAndSchedule:true};
 return {uid,itemId,planId,source,asset,version,candidate,files,store,input,lease,f};
}
test('one exact action atomically approves creative, post and schedule; concurrent taps and retry create one job',async()=>{
 const s=await setup('inline_success');
 assert.equal((await db.collection('socialGrowthJobs').where('businessUid','==',s.uid).get()).size,0);
 assert.equal((await db.doc(`businessMediaLibraries/${s.uid}/mediaAssets/concept/revisions/r1`).get()).data().approvalStatus,'pending');
 await assert.rejects(s.store.approve(s.uid,{...s.input,confirmCreativeAndSchedule:false}));
 await assert.rejects(s.store.approve('other',s.input));
 const results=await Promise.all([s.store.approve(s.uid,s.input),s.store.approve(s.uid,s.input)]);
 assert.equal(results[0].jobId,results[1].jobId);assert.equal(results.filter(r=>!r.reused).length,1);
 const again=await s.store.approve(s.uid,s.input);assert.equal(again.reused,true);
 for(const c of ['socialGrowthJobs','socialGrowthApprovals','socialCreativeApprovals','customerSocialMedia'])assert.equal((await db.collection(c).where('businessUid','==',s.uid).get()).size,1,c);
 assert.deepEqual((await db.doc('socialContentVersions/'+s.itemId+'_v1').get()).data(),s.version);
 const next=(await db.doc('socialContentVersions/'+s.itemId+'_v2').get()).data();assert.ok(next.variants[0].copy.includes(s.candidate.disclosure));
 const audit=(await db.doc('socialCreativeApprovals/'+s.input.inlineCreativeDigest).get()).data();
 assert.equal(audit.actorUid,s.uid);assert.equal(audit.creative.derivativeSha256,s.candidate.sha256);assert.equal(audit.schedule.jobId,again.jobId);
 assert.equal((await db.doc(`businessMediaLibraries/${s.uid}/mediaAssets/concept/revisions/r1`).get()).data().approvalStatus,'approved');
 assert.equal((await db.doc('socialContentQualityAssessments/'+s.itemId+'_v2_facebook').get()).data().immutableSourceHash,next.contentHash);
 const job=(await db.doc('socialGrowthJobs/'+again.jobId).get()).data();assert.equal(job.status,'scheduled');
 assert.equal((await db.doc('socialGrowthJobs/'+again.jobId).collection('providerSteps').get()).size,0);
});
test('changed source, candidate, text, time, provider or permissions fail closed without partial approval',async()=>{
 for(const field of ['source','candidate','text','time','provider','member']){
  const s=await setup('inline_block_'+field),revision=db.doc(`businessMediaLibraries/${s.uid}/mediaAssets/concept/revisions/r1`);
  if(field==='source')await revision.update({moderationStatus:'blocked'});
  if(field==='candidate')await s.lease.update({'reviewCandidate.sha256':'0'.repeat(64)});
  if(field==='text')await db.doc('socialContentVersions/'+s.itemId+'_v1').update({contentHash:'0'.repeat(64)});
  if(field==='time')await db.doc('socialContentVersions/'+s.itemId+'_v1').update({scheduledFor:new Date(s.f.now).toISOString()});
  if(field==='provider')await db.doc(`socialConnections/${s.uid}/providers/facebook`).update({providerUserId:'999'});
  let result;try{result=await s.store.approve(s.uid,s.input,field==='member'?{actorUid:'unauthorized'}:{});}catch{result={status:'blocked'};}
  assert.equal(result.status,'blocked',field);
  assert.equal((await revision.get()).data().approvalStatus,'pending',field);
  for(const c of ['socialGrowthJobs','socialGrowthApprovals','socialCreativeApprovals','customerSocialMedia'])assert.equal((await db.collection(c).where('businessUid','==',s.uid).get()).size,0,field+':'+c);
 }
});
test('regeneration stays in draft flow and frozen posts are never replaced',async()=>{
 const s=await setup('inline_regeneration');
 const editor=require('../functions-social-operations/social_customer_editor').createEditor({db,enabledUids:[s.uid],now:()=>s.f.now});
 const preparation=require('../functions-social-operations/social_customer_preparation').createPreparation({db,editor,media:{},now:()=>s.f.now});
 await db.doc('providerConfigurations/generated-service-visuals').set({providerGenerationEnabled:false});
 const before=(await s.lease.get()).data();
 const off=await preparation.prepare(s.uid,{...s.input,action:'regenerate',candidateSha256:s.candidate.sha256,confirmRegeneration:true});
 assert.equal(off.creativeStatus,'generation_unavailable');assert.deepEqual((await s.lease.get()).data(),before);
 await s.store.approve(s.uid,s.input);
 await db.doc('providerConfigurations/generated-service-visuals').set({providerGenerationEnabled:true});
 await assert.rejects(preparation.prepare(s.uid,{...s.input,version:2,action:'regenerate',candidateSha256:s.candidate.sha256,confirmRegeneration:true}),/unscheduled/);
});
test('subject checks analyze exact derivative once, retain provider evidence and consume no generation units',async()=>{
 const uid='subject_check_owner',bytes=Buffer.from('owned generated derivative'),sha256=hash(bytes);let calls=0;
 await db.doc('providerConfigurations/generated-service-visuals').set({providerGenerationEnabled:false,authorizedBusinessUids:[uid]});
 const check=require('../functions-social-operations/social_creative_subject').createSubjectCheck({db,clientFactory:async()=>({models:{list:async()=>({data:[{id:'gpt-4.1-mini'}]})},responses:{create:async request=>{
   calls++;assert.equal(request.store,false);assert.equal(request.input[0].content[1].image_url,'data:image/jpeg;base64,'+bytes.toString('base64'));
   return {id:'mock_subject_response',output_text:JSON.stringify({subjectVisible:true,relevantToService:true,backgroundDominant:false,severeCrop:false,
     blankBands:false,logoOrWatermark:false,subjectFraction:.6,confidence:.9}),usage:{input_tokens:100,output_tokens:80}};
 }}})});
 const args={uid,bytes,sha256,service:'decks'},a=await check(args),b=await check(args);
 assert.deepEqual(a,b);assert.equal(a.status,'passed');assert.equal(calls,1);
 await assert.rejects(check({...args,bytes:Buffer.from('different')}));await assert.rejects(check({...args,uid:'other'}));
 assert.equal((await db.collection('visualGenerationUsage').where('businessUid','==',uid).get()).size,0);
 const result=(await db.collection('socialCreativeVisualAssessments').where('businessUid','==',uid).get()).docs[0].data();
 assert.equal(result.responseId,'mock_subject_response');assert.equal(result.sha256,sha256);
});
test('failed image analysis preserves only safe diagnostic codes and never approves the draft',async()=>{
 const uid='subject_error_owner',bytes=Buffer.from('private generated candidate'),sha256=hash(bytes);
 await db.doc('providerConfigurations/generated-service-visuals').set({providerGenerationEnabled:false,authorizedBusinessUids:[uid]});
 const check=require('../functions-social-operations/social_creative_subject').createSubjectCheck({db,clientFactory:async()=>({
   models:{list:async()=>({data:[{id:'gpt-4.1-mini'}]})},responses:{create:async()=>{throw Object.assign(new Error('private body and authorization must not be retained'),{status:403,code:'model_not_found',type:'invalid_request_error',headers:{authorization:'private'}});}}
 })});
 await assert.rejects(check({uid,bytes,sha256,service:'decks'}),/draft is preserved/);
 const record=(await db.collection('socialCreativeVisualAssessments').where('businessUid','==',uid).get()).docs[0].data();
 assert.equal(record.status,'unavailable');assert.equal(record.diagnostic.status,403);assert.equal(record.diagnostic.code,'model_not_found');
 assert.ok(!JSON.stringify(record).includes('private'));assert.equal((await db.collection('socialGrowthApprovals').where('businessUid','==',uid).get()).size,0);
 const s=await setup('inline_failure_copy');const c={...s.candidate,preparation:{...s.candidate.preparation}};delete c.preparation.subjectQuality;
 await s.lease.update({reviewCandidate:c,failureReason:'Creative preparation could not finish. Your saved preview is preserved.'});
 const preview=await s.store.preview(s.uid,s.input);assert.equal(preview.ready,false);assert.equal(preview.reviewState,'needs_attention');
 assert.ok(preview.reasons.some(r=>r.message?.includes('could not finish')));
});
