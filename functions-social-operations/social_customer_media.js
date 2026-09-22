'use strict';
const crypto=require('node:crypto');
const {validate}=require('./social_customer_editor');
const social=require('./social_operations');
const meta=require('./social_meta_candidate');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function sourceRights(revision,uid){return revision?.rightsAttestation===true||
  revision?.origin==='generated_service_concept'&&revision.createdBy==='creative-media-core'&&
  revision.generatedContentAcknowledged===true&&revision.approvedBy===uid&&revision.moderationStatus==='passed'&&
  revision.moderation?.status==='passed'&&Array.isArray(revision.moderation.flags)&&revision.moderation.flags.length===0&&
  /^visual_job_[a-f0-9]+$/.test(revision.generationJobId||'')&&typeof revision.truthfulnessDisclosure==='string'&&revision.truthfulnessDisclosure.length>20;}
function assertSource({uid,asset,revision,assetId,revisionId}) {
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(assetId||'')||!/^[A-Za-z0-9_-]{1,160}$/.test(revisionId||'')||
    asset?.businessUid!==uid||asset.removed===true||asset.approvedRevisionId!==revisionId||
    revision?.businessUid!==uid||revision.status!=='ready'||revision.approvalStatus!=='approved'||!sourceRights(revision,uid)||
    !revision.altText?.trim()||!revision.privateOriginalPath?.startsWith(`business_media_private/${uid}/${assetId}/${revisionId}/`)||
    !/^[a-f0-9]{64}$/.test(revision.contentHash||'')||!revision.storageGeneration)throw Error('Choose a current approved Business image.');
}
async function derivative(bytes,sharp=require('sharp'),provider='facebook') {
  if(!['facebook','instagram'].includes(provider))throw Error('Choose a supported Social channel.');
  const source=await sharp(bytes,{failOn:'error',limitInputPixels:40000000}).rotate().toBuffer({resolveWithObject:true});
  const {width:sw,height:sh}=source.info;
  if(Math.min(sw,sh)<640)throw Error('Use a full-quality original at least 640 pixels on its shorter side.');
  const ratio=sw/sh;
  const target=provider==='instagram'?(ratio>=1?1:0.8):ratio;
  const retained=Math.min(ratio/target,target/ratio);
  if(retained<0.66)throw Error('This image needs a different composition to preserve its subject.');
  const width=provider==='instagram'?Math.min(1080,sw,Math.floor(sh*target)):1080;
  const height=provider==='instagram'?Math.round(width/target):1080;
  const result=await sharp(source.data).resize(width,height,
    {fit:provider==='instagram'?'cover':'inside',position:'centre',withoutEnlargement:true})
    .flatten({background:'#ffffff'}).toColourspace('srgb')
    .jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer({resolveWithObject:true});
  if(result.data.length>8*1024*1024)throw Error('Choose a smaller image.');
  const quality=await inspectOutput(result.data,sharp);
  return {bytes:result.data,width:result.info.width,height:result.info.height,sha256:hash(result.data),mime:'image/jpeg',
    preparation:{policy:MEDIA_POLICY,sourceWidth:sw,sourceHeight:sh,cropFraction:1-retained,jpegQuality:92,...quality}};
}
const MEDIA_POLICY='SocialFeedCreativeV2';
async function inspectOutput(bytes,sharp=require('sharp')) {
  const {data,info}=await sharp(bytes).resize(128,128,{fit:'inside'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>{const n=(y*info.width+x)*info.channels;return [data[n],data[n+1],data[n+2]];};
  const uniform=line=>line.every(p=>p.every(v=>v>=245))||line.every(p=>p.every(v=>v<=10));
  const edges=[Array.from({length:info.height},(_,y)=>Array.from({length:info.width},(_,x)=>pixel(x,y))),
    Array.from({length:info.width},(_,x)=>Array.from({length:info.height},(_,y)=>pixel(x,y)))];
  for(const axis of edges)for(const rows of [axis,[...axis].reverse()]) {
    let band=0;for(const row of rows){if(!uniform(row))break;band++;}
    if(band>=Math.max(2,Math.ceil(rows.length*.02)))throw Error('Creative has blank borders. Prepare a clean image before review.');
  }
  const stats=await sharp(bytes).stats();
  if(stats.channels.slice(0,3).every(c=>c.stdev<3))throw Error('Creative is blank or lacks a usable subject.');
  return {pixelCheck:'passed',checkedSha256:hash(bytes),subjectReview:'owner_preview_required'};
}
async function assertDeliveryAuthority({db,read=ref=>ref.get(),uid,revision}) {
  if(!revision?.customerDeliveryId)return;
  const id=revision.customerDeliveryId;
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('Image approval needs review.');
  const record=(await read(db.doc('customerSocialMedia/'+id))).data();
  if(record?.businessUid!==uid||record.status!=='approved_for_social'||record.assetId!==revision.assetId||
    record.path!==`customer_social_delivery/${id}.jpg`||!record.generation||
    record.sha256!==revision.images?.[0]?.sha256||record.bytes!==revision.images?.[0]?.bytes||
    !/^[A-Za-z0-9_-]{1,160}$/.test(record.revisionId||''))throw Error('Image approval needs review.');
  const ar=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${record.assetId}`);
  const [asset,source]=await Promise.all([read(ar),read(ar.collection('revisions').doc(record.revisionId))]);
  if(asset.data()?.businessUid!==uid||asset.data()?.removed===true||asset.data()?.approvedRevisionId!==record.revisionId||
    source.data()?.businessUid!==uid||source.data()?.status!=='ready'||source.data()?.approvalStatus!=='approved'||
    !sourceRights(source.data(),uid))throw Error('Image approval needs review.');
}
function createMedia({db,bucket,project,now=Date.now,enabledUids=[],planEntitled=false,prepareImage=derivative,subjectCheck}) {
  if(!['scaled-circle','scaledcircle-staging'].includes(project))throw Error('Media environment unavailable.');
  const origin=`https://us-east1-${project}.cloudfunctions.net`;
  const storage=()=>typeof bucket==='function'?bucket():bucket;
  const enabled=(uid,read)=>planEntitled?require('./social_customer_enrollment').authorized({db,uid,read,now:now()}):Promise.resolve(enabledUids.includes(uid));
  return {
    async prepareCandidate(uid,input,recommendation){
      validate(input);
      if(!await enabled(uid))throw Error('Creative preparation is unavailable.');
      const jobId='visual_job_'+hash(uid+'\n'+recommendation.requestId).slice(0,40);
      const job=(await db.doc('visualGenerationJobs/'+jobId).get()).data();
      if(!job)return null;
      if(job.businessUid!==uid||job.status!=='review_required')return null;
      const assetId=job.candidateAssetId,revisionId=job.candidateRevisionId;
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(assetId||'')||!/^[A-Za-z0-9_-]{1,160}$/.test(revisionId||''))throw Error('Creative identity needs review.');
      const ar=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${assetId}`),rr=ar.collection('revisions').doc(revisionId);
      const [a,r]=await Promise.all([ar.get(),rr.get()]);const revision=r.data(),asset=a.data();
      const prefix=`business_media_private/${uid}/${assetId}/${revisionId}/`;
      if(asset?.businessUid!==uid||asset.removed||asset.currentRevisionId!==revisionId||asset.approvedRevisionId||
        revision?.businessUid!==uid||revision.status!=='ready'||revision.approvalStatus!=='pending'||
        revision.origin!=='generated_service_concept'||revision.createdBy!=='creative-media-core'||revision.generationJobId!==jobId||
        revision.moderationStatus!=='passed'||revision.moderation?.status!=='passed'||revision.moderation.flags?.length!==0||
        !revision.privateOriginalPath?.startsWith(prefix)||!revision.storageGeneration||!revision.truthfulnessDisclosure||
        !/^[a-f0-9]{64}$/.test(revision.contentHash||''))throw Error('Creative requires a valid private source.');
      // Never recycle another idea's source, including pending concepts.
      const library=await db.collection(`businessMediaLibraries/${uid}/mediaAssets`).limit(51).get();
      if(library.size>50)throw Error('Creative history needs review.');
      for(const other of library.docs){if(other.id===assetId)continue;const data=other.data();
        const rid=data.currentRevisionId||data.approvedRevisionId;if(!rid)continue;
        const rev=(await other.ref.collection('revisions').doc(rid).get()).data();
        if(rev?.contentHash===revision.contentHash)throw Error('This concept repeats an existing image. Review creative before continuing.');}
      const [bytes]=await storage().file(revision.privateOriginalPath,{generation:revision.storageGeneration}).download();
      if(bytes.length>20*1024*1024||hash(bytes)!==revision.contentHash)throw Error('Creative integrity failed.');
      const image=await prepareImage(bytes,undefined,input.provider);
      if(subjectCheck){
        const subjectQuality=await subjectCheck({uid,bytes:image.bytes,sha256:image.sha256,service:revision.serviceLabel||recommendation.service});
        image.preparation={...image.preparation,subjectQuality};
      }
      const path=prefix+`renditions/social-review-${input.provider}-${image.sha256}.jpg`;
      await storage().file(path).save(image.bytes,{resumable:false,contentType:'image/jpeg',metadata:{cacheControl:'private,no-store'},preconditionOpts:{ifGenerationMatch:0}})
        .catch(e=>{if(e.code!==412)throw e;});
      const [stored]=await storage().file(path).getMetadata();
      const [readback]=await storage().file(path,{generation:String(stored.generation)}).download();
      if(hash(readback)!==image.sha256)throw Error('Creative derivative integrity failed.');
      return {assetId,revisionId,jobId,sourceSha256:revision.contentHash,storagePath:path,generation:String(stored.generation),
        sha256:image.sha256,width:image.width,height:image.height,bytes:image.bytes.length,preparation:image.preparation||null,
        disclosure:revision.truthfulnessDisclosure,status:'pending_owner_review',approved:false};
    },
    async attach(uid,input){
      validate(input);
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.assetId||'')||!/^[A-Za-z0-9_-]{1,160}$/.test(input.revisionId||''))throw Error('Choose an approved image.');
      if(!await enabled(uid)||input.confirmPublicUse!==true)throw Error('Confirm this approved image may be used for public Social content.');
      const assetRef=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${input.assetId}`);
      const revisionRef=assetRef.collection('revisions').doc(input.revisionId);
      const [a,r]=await Promise.all([assetRef.get(),revisionRef.get()]);
      const source={uid,asset:a.data(),revision:r.data(),assetId:input.assetId,revisionId:input.revisionId};
      assertSource(source);
      const [bytes]=await storage().file(source.revision.privateOriginalPath,{generation:source.revision.storageGeneration}).download();
      if(bytes.length>20*1024*1024||hash(bytes)!==source.revision.contentHash)throw Error('The image could not be verified.');
      const image=await prepareImage(bytes,undefined,input.provider);
      if(source.revision.authorizationSource==='approved_strategy'){
        if(!subjectCheck)throw Error('Managed creative subject verification is unavailable.');
        const subjectQuality=await subjectCheck({uid,bytes:image.bytes,sha256:image.sha256,service:source.revision.serviceLabel});
        if(subjectQuality?.status!=='passed'||subjectQuality.checkedSha256!==image.sha256||subjectQuality.reasons?.length!==0)
          throw Error('Managed creative needs attention before scheduling.');
        image.preparation={...image.preparation,subjectQuality};
      }
      const deliveryId=hash(JSON.stringify({uid,assetId:input.assetId,revisionId:input.revisionId,sha256:image.sha256}));
      const path=`customer_social_delivery/${deliveryId}.jpg`;
      await storage().file(path).save(image.bytes,{resumable:false,contentType:'image/jpeg',preconditionOpts:{ifGenerationMatch:0}})
        .catch(e=>{if(e.code!==412)throw e;});
      const [stored]=await storage().file(path).getMetadata();
      const prepared=meta.mediaRevision({businessUid:uid,assetId:input.assetId,provider:input.provider,
        productionOrigin:origin,customerDeliveryId:deliveryId,images:[{sha256:image.sha256,bytes:image.bytes.length,
          width:image.width,height:image.height,mime:image.mime,url:`${origin}/serveCustomerSocialMediaV1/${deliveryId}.jpg`}]});
      prepared.preparation=image.preparation||null;
      prepared.sourceOrigin=source.revision.origin||'business_owned';
      prepared.truthfulnessDisclosure=source.revision.origin==='generated_service_concept'?source.revision.truthfulnessDisclosure:null;
      prepared.sourceRevisionId=input.revisionId;
      prepared.sourceSha256=source.revision.contentHash;
      return db.runTransaction(async tx=>{
        if(!await enabled(uid,ref=>tx.get(ref)))throw Error('An active Managed Growth subscription is required.');
        const itemRef=db.doc('socialContentItems/'+input.itemId);
        const [item,latestAsset,latestRevision,delivery,existingMedia]=await Promise.all([
          tx.get(itemRef),tx.get(assetRef),tx.get(revisionRef),tx.get(db.doc('customerSocialMedia/'+deliveryId)),
          tx.get(db.doc(`socialMediaLibraries/${uid}/items/${prepared.id}`))]);
        assertSource({...source,asset:latestAsset.data(),revision:latestRevision.data()});
        if(latestRevision.data().contentHash!==source.revision.contentHash||latestRevision.data().storageGeneration!==source.revision.storageGeneration)
          throw Error('The image changed. Choose it again.');
        if(item.data()?.businessUid!==uid||(item.data()?.platformVersions?.[input.provider]??item.data()?.currentVersion)!==input.version)throw Error('The post changed. Reload it.');
        const current=(await tx.get(db.doc(`${'socialContentVersions'}/${input.itemId}_v${input.version}`))).data();
        if(current?.businessUid!==uid||!current.variants?.some(v=>v.provider===input.provider))throw Error('Post unavailable.');
        const preparationRef=db.doc('socialCreativePreparation/'+require('./social_creative_diversity').leaseId(uid,input));
        const preparation=(await tx.get(preparationRef)).data();
        const jobs=await tx.get(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
        if(jobs.size>100||jobs.docs.some(d=>d.data().provider===input.provider&&d.data().versionId?.startsWith(input.itemId+'_v')&&d.data().status!=='canceled'))
          throw Error('Review the existing scheduled post before replacing its image.');
        const next=social.contentItemVersion({businessUid:uid,planId:current.planId,previousVersion:item.data().currentVersion,now:now(),item:{...current,
          scheduledFor:new Date(current.scheduledFor?.toMillis?current.scheduledFor.toMillis():current.scheduledFor).toISOString(),
          variants:current.variants.map(v=>v.provider===input.provider?{...v,mediaAssetId:input.assetId,mediaRevisionId:prepared.id,
            mediaRequirement:'approved_image',format:'feed',altText:source.revision.altText,
            copy:v.copy}:v)}});
        if(delivery.exists&&(delivery.data().businessUid!==uid||delivery.data().sha256!==image.sha256))throw Error('Image identity conflict.');
        if(!delivery.exists)tx.create(db.doc('customerSocialMedia/'+deliveryId),{businessUid:uid,status:'approved_for_social',
          path,generation:String(stored.generation),sha256:image.sha256,bytes:image.bytes.length,
          assetId:input.assetId,revisionId:input.revisionId,approvedByUid:uid,approvedAt:now()});
        if(!existingMedia.exists)tx.create(db.doc(`socialMediaLibraries/${uid}/items/${prepared.id}`),prepared);
        tx.create(db.doc(`socialContentVersions/${input.itemId}_v${next.version}`),next);
        tx.update(itemRef,{currentVersion:next.version,platformVersions:require('./social_customer_editor').platformVersions(item.data(),current,input.provider,next.version),updatedAt:now()});
        const candidate=preparation?.reviewCandidate;
        if(preparation?.businessUid===uid&&preparation.itemId===input.itemId&&preparation.provider===input.provider&&
          preparation.version===input.version&&preparation.state==='creative_review'&&
          candidate?.assetId===input.assetId&&candidate.revisionId===input.revisionId&&
          candidate.sourceSha256===source.revision.contentHash&&candidate.sha256===image.sha256&&
          candidate.preparation?.subjectQuality?.status==='passed'&&candidate.preparation.subjectQuality.checkedSha256===image.sha256){
          // Retain the assessment and source evidence; attachment completes this
          // exact preparation in the same transaction as its immutable revision.
          tx.update(preparationRef,{state:'prepared',version:next.version,attachedFromVersion:input.version,
            attachedMediaRevisionId:prepared.id,attachedAt:now(),leaseUntil:0});
        }
        return {status:'ready_for_review',version:next.version,contentHash:next.contentHash,approved:false,scheduled:false};
      });
    },
    async delivery(id){
      if(!/^[a-f0-9]{64}$/.test(id))return null;
      const record=(await db.doc('customerSocialMedia/'+id).get()).data();
      if(record?.status!=='approved_for_social'||record.path!==`customer_social_delivery/${id}.jpg`||!record.generation)return null;
      if(!await enabled(record.businessUid))return null;
      const asset=(await db.doc(`businessMediaLibraries/${record.businessUid}/mediaAssets/${record.assetId}`).get()).data();
      const revision=(await db.doc(`businessMediaLibraries/${record.businessUid}/mediaAssets/${record.assetId}/revisions/${record.revisionId}`).get()).data();
      if(asset?.removed===true||asset?.businessUid!==record.businessUid||asset?.approvedRevisionId!==record.revisionId||revision?.businessUid!==record.businessUid||revision?.status!=='ready'||revision?.approvalStatus!=='approved'||!sourceRights(revision,record.businessUid))return null;
      const [bytes]=await storage().file(record.path,{generation:record.generation}).download();
      if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error('Image integrity failed.');
      return bytes;
    },
  };
}
module.exports={assertSource,derivative,createMedia,assertDeliveryAuthority,sourceRights,inspectOutput,MEDIA_POLICY};
