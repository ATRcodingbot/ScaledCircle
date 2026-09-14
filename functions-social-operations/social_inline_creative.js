'use strict';
// One explicit customer confirmation; three separately recorded approvals.
// Preview is read-only. Only commit() makes the private image publicly usable.
const crypto=require('node:crypto');
const social=require('./social_operations'),meta=require('./social_meta_candidate');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const POLICY='SocialInlineCreativeApprovalV1';
const validId=v=>/^[A-Za-z0-9_-]{1,160}$/.test(v||'');
async function proposal({db,ctx,read=ref=>ref.get()}) {
  const c=ctx.creativePreparation?.state==='creative_review'&&ctx.creativePreparation.version===ctx.version?.version?
    ctx.creativePreparation.reviewCandidate:null;
  if(!c)return null;
  const subject=c.preparation?.subjectQuality;
  if(subject?.policy!==require('./social_creative_subject').POLICY||subject.checkedSha256!==c.sha256||subject.status!=='passed')
    throw Error(subject?.reasons?.join(' ')||ctx.creativePreparation?.failureReason||'Preparing the image subject check before approval.');
  const {uid,provider}=ctx,prefix=`business_media_private/${uid}/${c.assetId}/${c.revisionId}/`;
  if(!validId(c.assetId)||!validId(c.revisionId)||!validId(c.jobId)||c.status!=='pending_owner_review'||c.approved!==false||
    c.storagePath!==prefix+`renditions/social-review-${provider}-${c.sha256}.jpg`||!c.generation||
    !/^[a-f0-9]{64}$/.test(c.sha256||'')||c.preparation?.pixelCheck!=='passed'||c.preparation.checkedSha256!==c.sha256||
    c.preparation.policy!==require('./social_customer_media').MEDIA_POLICY)throw Error('Image needs changes. Prepare a verified preview.');
  const ar=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${c.assetId}`),rr=ar.collection('revisions').doc(c.revisionId),jr=db.doc('visualGenerationJobs/'+c.jobId);
  const [a,r,j]=await Promise.all([read(ar),read(rr),read(jr)]),asset=a.data(),source=r.data(),job=j.data();
  if(asset?.businessUid!==uid||asset.removed||asset.currentRevisionId!==c.revisionId||
    (asset.approvedRevisionId&&asset.approvedRevisionId!==c.revisionId)||source?.businessUid!==uid||source.status!=='ready'||
    !['pending','approved'].includes(source.approvalStatus)||source.origin!=='generated_service_concept'||source.createdBy!=='creative-media-core'||
    source.generationJobId!==c.jobId||source.moderationStatus!=='passed'||source.moderation?.status!=='passed'||source.moderation.flags?.length!==0||
    source.contentHash!==c.sourceSha256||source.truthfulnessDisclosure!==c.disclosure||!source.altText?.trim()||
    source.privateOriginalPath!==prefix+'original'||!source.storageGeneration||
    job?.businessUid!==uid||!['review_required','approved'].includes(job.status)||job.candidateAssetId!==c.assetId||job.candidateRevisionId!==c.revisionId)
      throw Error('This image changed or failed its safety checks. Review a new preview.');
  if(source.approvalStatus==='approved'&&(asset.approvedRevisionId!==c.revisionId||!require('./social_customer_media').sourceRights(source,uid))||
    source.approvalStatus==='pending'&&(asset.approvedRevisionId!=null||job.status!=='review_required'))throw Error('Image approval state needs reconciliation.');
  const deliveryId=hash(JSON.stringify({uid,assetId:c.assetId,revisionId:c.revisionId,sha256:c.sha256}));
  const project=ctx.environment==='production'?'scaled-circle':ctx.environment==='staging'?'scaledcircle-staging':null;
  if(!project)throw Error('Media environment unavailable.');
  const origin=`https://us-east1-${project}.cloudfunctions.net`;
  const media=meta.mediaRevision({businessUid:uid,assetId:c.assetId,provider,productionOrigin:origin,customerDeliveryId:deliveryId,
    images:[{sha256:c.sha256,bytes:c.bytes,width:c.width,height:c.height,mime:'image/jpeg',url:`${origin}/serveCustomerSocialMediaV1/${deliveryId}.jpg`}]});
  Object.assign(media,{preparation:c.preparation,sourceOrigin:source.origin,truthfulnessDisclosure:c.disclosure,sourceRevisionId:c.revisionId,sourceSha256:c.sourceSha256});
  const version=social.contentItemVersion({businessUid:uid,planId:ctx.version.planId,previousVersion:ctx.item.currentVersion,now:ctx.version.createdAt,
    item:{...ctx.version,variants:ctx.version.variants.map(v=>v.provider===provider?{...v,mediaAssetId:c.assetId,mediaRevisionId:media.id,
      mediaRequirement:'approved_image',format:'feed',altText:source.altText,copy:v.copy}:v)}});
  const recent=await read(db.collection('socialContentVersions').where('businessUid','==',uid).limit(101));
  if(recent.size>100)throw Error('Content history needs review.');
  const checks=require('./social_customer_quality').reviewChecks({variant:version.variants.find(v=>v.provider===provider),revision:media,mediaAuthorityValid:true,
    recentVariants:recent.docs.filter(d=>!d.id.startsWith(ctx.itemRef.id+'_v')).flatMap(d=>d.data().variants||[])});
  const quality={businessUid:uid,immutableSourceHash:version.contentHash,readyToPublish:checks.passed,reviewChecks:checks,provider};
  const binding={policy:POLICY,businessUid:uid,itemId:ctx.itemRef.id,provider,draftVersion:ctx.version.version,draftHash:ctx.version.contentHash,
    nextVersion:version.version,nextHash:version.contentHash,candidate:c,sourceGeneration:source.storageGeneration};
  return {candidate:c,source,asset,job,ar,rr,jr,media,deliveryId,version,quality,digest:hash(JSON.stringify(binding)),
    ctx:{...ctx,version,versionId:ctx.itemRef.id+'_v'+version.version,item:{...ctx.item,platformVersions:{...ctx.item.platformVersions,[provider]:version.version}},
      revision:media,quality,mediaAuthorityValid:true,creativePreparation:{...ctx.creativePreparation,state:'prepared'}}};
}
async function stage({bucket,proposal:p}) {
  const storage=typeof bucket==='function'?bucket():bucket,c=p.candidate;
  if(!storage)throw Error('Image verification unavailable.');
  const [original]=await storage.file(p.source.privateOriginalPath,{generation:p.source.storageGeneration}).download();
  const [bytes]=await storage.file(c.storagePath,{generation:c.generation}).download();
  if(hash(original)!==c.sourceSha256||hash(bytes)!==c.sha256||bytes.length!==c.bytes)throw Error('Image changed. Reload the preview.');
  await require('./social_customer_media').inspectOutput(bytes);
  const info=await require('sharp')(bytes).metadata();
  if(info.width!==c.width||info.height!==c.height)throw Error('Image dimensions changed.');
  const path=`customer_social_delivery/${p.deliveryId}.jpg`;
  // Unaddressable until the transaction creates the approved delivery record.
  await storage.file(path).save(bytes,{resumable:false,contentType:'image/jpeg',preconditionOpts:{ifGenerationMatch:0}}).catch(e=>{if(e.code!==412)throw e;});
  const [metadata]=await storage.file(path).getMetadata(),generation=String(metadata.generation);
  const [stored]=await storage.file(path,{generation}).download();
  if(hash(stored)!==c.sha256)throw Error('Image delivery integrity failed.');
  return {path,generation,sha256:c.sha256};
}
async function readCommitTargets({db,tx,uid,p}) {
  const refs={delivery:db.doc('customerSocialMedia/'+p.deliveryId),media:db.doc(`socialMediaLibraries/${uid}/items/${p.media.id}`),
    next:db.doc('socialContentVersions/'+p.ctx.versionId),audit:db.doc('socialCreativeApprovals/'+p.digest)};
  const values=await Promise.all(Object.values(refs).map(r=>tx.get(r)));
  if(values[2].exists||values[3].exists)throw Error('This preview has already changed. Reload its saved state.');
  if(values[0].exists&&(values[0].data().businessUid!==uid||values[0].data().sha256!==p.candidate.sha256))throw Error('Image delivery identity conflict.');
  if(values[1].exists&&JSON.stringify(values[1].data().images)!==JSON.stringify(p.media.images))throw Error('Image identity conflict.');
  return {refs,values,qualityRef:db.doc('socialContentQualityAssessments/'+p.ctx.versionId+'_'+p.ctx.provider),
    leaseRef:db.doc('socialCreativePreparation/'+require('./social_creative_diversity').leaseId(uid,{itemId:p.ctx.itemRef.id,provider:p.ctx.provider}))};
}
function commit({tx,uid,actorUid,p,staged,targets,now,approvalId,jobId}) {
  const {refs,values}=targets,c=p.candidate;
  const audit={schemaVersion:POLICY,businessUid:uid,actorUid,approvedAt:now,itemId:p.ctx.itemRef.id,provider:p.ctx.provider,
    creative:{assetId:c.assetId,revisionId:c.revisionId,sourceSha256:c.sourceSha256,derivativeSha256:c.sha256,generatedContentAcknowledged:true},
    post:{version:p.version.version,contentHash:p.version.contentHash,approvalId},schedule:{jobId,scheduledFor:p.version.scheduledFor},reviewDigest:p.digest};
  tx.create(refs.audit,audit);
  if(p.source.approvalStatus!=='approved'){
    tx.update(p.rr,{approvalStatus:'approved',generatedContentAcknowledged:true,approvedBy:actorUid,approvedByUid:actorUid,approvedAt:now,updatedAt:now});
    tx.update(p.ar,{approvedRevisionId:c.revisionId,updatedAt:now});
  }
  if(p.job.status!=='approved')tx.update(p.jr,{status:'approved',reviewedAt:now,reviewedBy:actorUid,generatedContentAcknowledged:true,updatedAt:now});
  if(!values[0].exists)tx.create(refs.delivery,{businessUid:uid,status:'approved_for_social',path:staged.path,generation:staged.generation,
    sha256:c.sha256,bytes:c.bytes,assetId:c.assetId,revisionId:c.revisionId,approvedByUid:actorUid,approvedAt:now});
  if(!values[1].exists)tx.create(refs.media,p.media);
  tx.create(refs.next,p.version);
  tx.set(targets.qualityRef,p.quality);
  tx.update(targets.leaseRef,{state:'prepared',version:p.version.version,reviewCandidate:null,inlineApprovalDigest:p.digest});
  tx.update(p.ctx.itemRef,{currentVersion:p.version.version,platformVersions:require('./social_customer_editor').platformVersions(p.ctx.item,p.version,p.ctx.provider,p.version.version),updatedAt:now});
}
module.exports={POLICY,proposal,stage,readCommitTargets,commit};
