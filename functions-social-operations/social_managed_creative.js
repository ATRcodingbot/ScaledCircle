'use strict';
// Private recurring-worker authority. No callable accepts this operation.
const bounded=require('./social_bounded_authority');
async function authorize({db,uid,input,policyId,candidate,now=Date.now()}) {
  const prepId=require('./social_creative_diversity').leaseId(uid,input);
  return db.runTransaction(async tx=>{
    const read=ref=>tx.get(ref);
    const policy=(await read(db.doc('socialManagedPolicies/'+uid))).data();
    const plan=policy?.planId?(await read(db.doc('socialContentPlans/'+policy.planId))).data():null;
    bounded.assertRuntimePolicy({uid,policy,plan,approval:{businessUid:uid,planId:policy?.planId,managedPolicyId:policyId,managedStrategyDigest:policy?.strategyDigest},now});
    if(!policy.providers.includes(input.provider)||!await require('./social_customer_enrollment').authorized({db,uid,read,now}))throw Error('managed_creative_authority');
    const item=(await read(db.doc('socialContentItems/'+input.itemId))).data();
    const prep=(await read(db.doc('socialCreativePreparation/'+prepId))).data();
    const health=(await read(db.doc('agentHealth/'+uid))).data();
    const saved=prep?.reviewCandidate,quality=saved?.preparation?.subjectQuality;
    if(health?.killSwitchActive===true||item?.businessUid!==uid||item.planId!==policy.planId||
      (item.platformVersions?.[input.provider]??item.currentVersion)!==input.version||prep?.businessUid!==uid||prep.itemId!==input.itemId||prep.provider!==input.provider||prep.version!==input.version||
      !saved||saved.sha256!==candidate?.sha256||saved.sourceSha256!==candidate.sourceSha256||
      saved.assetId!==candidate.assetId||saved.revisionId!==candidate.revisionId||
      saved.preparation?.pixelCheck!=='passed'||saved.preparation.checkedSha256!==saved.sha256||
      quality?.status!=='passed'||quality.checkedSha256!==saved.sha256||quality.reasons?.length!==0)
      throw Error('managed_creative_quality_or_revision');
    const version=(await read(db.doc('socialContentVersions/'+input.itemId+'_v'+input.version))).data();
    const variant=version?.variants?.find(v=>v.provider===input.provider);
    const context=[version?.goal,version?.pillar,variant?.copy].join(' ').toLowerCase();
    if(!policy.services.some(s=>context.includes(s))||bounded.internalCopy.test(variant?.copy||'')||bounded.unsupportedClaim.test(variant?.copy||'')||!policy.destinations.includes(variant?.destinationUrl))throw Error('managed_creative_scope');
    const ar=db.doc(`businessMediaLibraries/${uid}/mediaAssets/${saved.assetId}`),rr=ar.collection('revisions').doc(saved.revisionId);
    const asset=(await read(ar)).data(),revision=(await read(rr)).data();
    const job=(await read(db.doc('visualGenerationJobs/'+saved.jobId))).data();
    if(asset?.businessUid!==uid||asset.removed||asset.currentRevisionId!==saved.revisionId||
      revision?.businessUid!==uid||revision.origin!=='generated_service_concept'||revision.createdBy!=='creative-media-core'||
      revision.status!=='ready'||revision.contentHash!==saved.sourceSha256||revision.generationJobId!==saved.jobId||
      job?.businessUid!==uid||job.candidateAssetId!==saved.assetId||job.candidateRevisionId!==saved.revisionId||
      revision.moderationStatus!=='passed'||revision.moderation?.status!=='passed'||revision.moderation.flags?.length!==0||
      !revision.truthfulnessDisclosure||!revision.altText)throw Error('managed_creative_source');
    if(revision.approvalStatus==='approved'&&asset.approvedRevisionId===saved.revisionId)return {reused:true};
    if(revision.approvalStatus!=='pending'||asset.approvedRevisionId)throw Error('managed_creative_conflict');
    const audit=db.doc('socialManagedCreativeAudit/'+prepId+'_'+saved.sha256);
    if((await read(audit)).exists)throw Error('managed_creative_audit_conflict');
    const authority={authorizationSource:'approved_strategy',managedPolicyId:policy.id,managedStrategyDigest:policy.strategyDigest,executionActor:'recurring_preparation',strategyAuthorizedByUid:policy.approvedByUid};
    tx.update(rr,{approvalStatus:'approved',generatedContentAcknowledged:true,approvedBy:uid,approvedAt:now,updatedAt:now,...authority});
    tx.update(ar,{approvedRevisionId:saved.revisionId,updatedAt:now});
    tx.create(audit,{businessUid:uid,itemId:input.itemId,provider:input.provider,version:input.version,assetId:saved.assetId,revisionId:saved.revisionId,sourceSha256:saved.sourceSha256,derivativeSha256:saved.sha256,at:now,...authority});
    return {reused:false};
  });
}
module.exports={authorize};
