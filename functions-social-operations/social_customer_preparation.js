'use strict';
const {assertSource,MEDIA_POLICY}=require('./social_customer_media');
const crypto=require('node:crypto');
const diversity=require('./social_creative_diversity');
const toMillis=value=>value?.toMillis?value.toMillis():typeof value==='number'?value:Date.parse(value);
function futureSlot(value,now=Date.now()) {
 const current=toMillis(value);
 // UTC slot calculation is timezone/DST independent; the client displays local time.
 return new Date(Number.isFinite(current)&&current>=now+15*60000?current:Math.ceil((now+60*60000)/1800000)*1800000).toISOString();
}
function selectAsset({uid,assets,variant,goal,approvedServices=[]}) {
 const words=new Set((variant.copy+' '+goal).toLowerCase().match(/[a-z]{4,}/g)||[]);
 return assets.map(asset=>{
   const revision=asset.revisions?.find(r=>r.id===asset.approvedRevisionId);
   try{assertSource({uid,asset,revision,assetId:asset.id,revisionId:revision?.id});}catch{return null;}
   const description=[asset.title,revision.altText,revision.serviceLabel].filter(Boolean).join(' ').toLowerCase();
   if(/\b(logo|icon|internal qa|test image)\b/.test(description)||asset.purpose==='logo')return null;
   const direct=[...words].filter(w=>description.includes(w)).length;
   const contextual=approvedServices.some(service=>typeof service==='string'&&description.includes(service.toLowerCase()));
   const score=direct*10+(contextual?1:0);
   if(!score)return null;
   return {asset,revision,score,generated:revision.origin==='generated_service_concept'};
 }).filter(Boolean).sort((a,b)=>Number(a.generated)-Number(b.generated)||b.score-a.score||a.asset.id.localeCompare(b.asset.id))[0]||null;
}
function createPreparation({db,editor,media,now=Date.now}) {
 const current=async(uid,input)=>{
   const item=(await db.doc('socialContentItems/'+input.itemId).get()).data();
   if(item?.businessUid!==uid)throw Error('This post is not available.');
   const version=item.platformVersions?.[input.provider]??item.currentVersion;
   const data=(await db.doc('socialContentVersions/'+input.itemId+'_v'+version).get()).data();
   if(data?.businessUid!==uid)throw Error('This post is not available.');
   return {...data,version};
 };
 return {async prepare(uid,input){
   require('./social_customer_editor').validate(input);
   const key=crypto.createHash('sha256').update(uid+':'+input.itemId+':'+input.provider).digest('hex');
   const lease=db.doc('socialCreativePreparation/'+key),attempt=crypto.randomUUID();
   if(input.action==='regenerate'){
     if(input.confirmRegeneration!==true)throw Error('Confirm preparation of one new image.');
     const config=(await db.doc('providerConfigurations/generated-service-visuals').get()).data();
     if(config?.providerGenerationEnabled!==true)return {creativeStatus:'generation_unavailable',
       generationMessage:'Image generation is currently paused. Your saved preview is preserved. Upload an image or choose a different asset.'};
     await db.runTransaction(async tx=>{
       const [oldSnap,itemSnap,jobs]=await Promise.all([tx.get(lease),tx.get(db.doc('socialContentItems/'+input.itemId)),
         tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101))]);
       const old=oldSnap.data(),item=itemSnap.data();
       if(item?.businessUid!==uid||(item.platformVersions?.[input.provider]??item.currentVersion)!==input.version||
         jobs.size>100||jobs.docs.some(d=>d.data().provider===input.provider&&d.data().versionId?.startsWith(input.itemId+'_v')&&d.data().status!=='canceled'))throw Error('Only an unscheduled current draft can get new creative.');
       if(!old?.recommendation?.service||old.reviewCandidate?.sha256!==(input.candidateSha256||undefined))throw Error('Review the current image before regenerating it.');
       const requestId='social_regen_'+crypto.createHash('sha256').update(uid+':'+input.itemId+':'+input.provider+':'+input.version+':'+(input.candidateSha256||'no_candidate')).digest('hex');
       const override={...old.recommendation,format:'generated',label:'New service concept',requestId,assetId:null,revisionId:null,sourceHash:null,
         reason:'A replacement requested for this exact draft. Review it before approval.',visualDirection:old.recommendation.visualDirection||'practical'};
       tx.update(lease,{generationOverride:override,state:'regeneration_requested',regenerationRequestedAt:now()});
     });
   }
   const claimed=await db.runTransaction(async tx=>{
     const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
     if(jobs.size>100)throw Error('Publication history needs review.');
     if(jobs.docs.some(d=>d.data().provider===input.provider&&d.data().versionId?.startsWith(input.itemId+'_v')&&d.data().status!=='canceled'))return 'preserved';
     const old=(await tx.get(lease)).data();
     if(old?.state==='preparing'&&old.leaseUntil>now())return 'preparing';
     if(old?.state==='prepared'&&old.version===input.version&&old.recommendation?.policy===diversity.POLICY)return 'prepared';
     tx.set(lease,{businessUid:uid,itemId:input.itemId,provider:input.provider,attempt,state:'preparing',leaseUntil:now()+180000,startedAt:now(),generationOverride:old?.generationOverride||null,
       reviewCandidate:old?.reviewCandidate||null,version:old?.version||input.version});
     return 'claimed';
   });
   if(claimed!=='claimed')return {creativeStatus:claimed,approved:false,scheduled:false};
   try {
   let version=await current(uid,input);
   if(version.version!==input.version)throw Error('The post changed. Reopen the current preview.');
   let variant=version.variants.find(v=>v.provider===input.provider);
   const nextTime=futureSlot(version.scheduledFor,now());
   const oldTime=toMillis(version.scheduledFor);
   if(!Number.isFinite(oldTime)||nextTime!==new Date(oldTime).toISOString()) {
     await editor.save(uid,{...input,copy:variant.copy,callToAction:variant.callToAction,destinationUrl:variant.destinationUrl,
       scheduledFor:nextTime,textOnly:variant.mediaRequirement==='none'});
     version=await current(uid,input);variant=version.variants.find(v=>v.provider===input.provider);
   }
   const context=await diversity.readCreativeContext(db,uid);
   const override=(await lease.get()).data()?.generationOverride;
   const recommendation=override||diversity.planCreativeMix(context).decisions[diversity.key(input)];
   if(!recommendation)throw Error('This post is already scheduled.');
   await lease.update({recommendation});
   let creativeStatus=variant.mediaRevisionId?'prepared':variant.mediaRequirement==='none'?'text_only':'needs_creative';
   const oldMedia=variant.mediaRevisionId?(await db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`).get()).data():null;
   let generationRequest=null;
   let generationStatus=null;
   let reviewCandidate=null;
   if(recommendation.format==='text'){
     if(variant.mediaRequirement!=='none'){
       const disclosure="Service concept image — not a photo of this Business's completed work, team, customers, or property.";
       await editor.save(uid,{...input,version:version.version,copy:variant.copy.replace(disclosure,'').trim(),
         callToAction:variant.callToAction,destinationUrl:variant.destinationUrl,scheduledFor:nextTime,textOnly:true});
       version=await current(uid,input);variant=version.variants.find(v=>v.provider===input.provider);
     }
     creativeStatus='text_only';
   }else if(recommendation.assetId){
     if(oldMedia?.assetId!==recommendation.assetId||oldMedia?.preparation?.policy!==MEDIA_POLICY){
       await media.attach(uid,{...input,version:version.version,assetId:recommendation.assetId,revisionId:recommendation.revisionId,confirmPublicUse:true});
       version=await current(uid,input);variant=version.variants.find(v=>v.provider===input.provider);
     }
     creativeStatus=recommendation.format==='business_photo'?'approved_business_image':'approved_service_concept';
   }else{
     // Keep historical media immutable, but do not present it as the recommended
     // new creative. A disabled provider is never bypassed by reusing an image.
     const config=(await db.doc('providerConfigurations/generated-service-visuals').get()).data()||{};
     reviewCandidate=media.prepareCandidate?await media.prepareCandidate(uid,{...input,version:version.version},recommendation):null;
     generationStatus=reviewCandidate?'review_required':config.providerGenerationEnabled===true?'available':'configuration_unavailable';
     if(!reviewCandidate&&recommendation.service&&generationStatus==='available')generationRequest={requestId:recommendation.requestId,
       serviceCategory:recommendation.service,visualDirection:recommendation.visualDirection,materialSlot:'landing_page_hero'};
     creativeStatus=reviewCandidate?'concept_needs_review':'needs_creative';
   }
   const quality=await editor.assess(uid,{...input,version:version.version});
   const result={version:version.version,creativeStatus,quality,generationRequest,generationStatus,reviewCandidate,approved:false,scheduled:false};
   await db.runTransaction(async tx=>{const old=(await tx.get(lease)).data();
     const item=(await tx.get(db.doc('socialContentItems/'+input.itemId))).data();
     const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
     if(item?.businessUid!==uid||(item.platformVersions?.[input.provider]??item.currentVersion)!==version.version||jobs.size>100||
       jobs.docs.some(d=>d.data().provider===input.provider&&d.data().versionId?.startsWith(input.itemId+'_v')&&d.data().status!=='canceled'))throw Error('The post changed. Reopen its review.');
     if(old?.attempt===attempt)tx.update(lease,{state:reviewCandidate?'creative_review':creativeStatus==='needs_creative'?'needs_attention':'prepared',reviewCandidate,generationStatus,version:version.version,finishedAt:now(),leaseUntil:0,failureReason:null});});
   return result;
   }catch(error){
     await db.runTransaction(async tx=>{const old=(await tx.get(lease)).data();if(old?.attempt===attempt)tx.update(lease,{state:old.reviewCandidate?'creative_review':'needs_attention',finishedAt:now(),leaseUntil:0,
       failureReason:'Creative preparation could not finish. Your saved preview is preserved. Try the image check again or replace the image.'});});
     throw error;
   }
 }};
}
module.exports={futureSlot,selectAsset,createPreparation,toMillis};
