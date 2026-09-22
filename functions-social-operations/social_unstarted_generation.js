'use strict';
// Recover only an already-created, never-attempted initial job whose request
// failed before its binding was saved. No replacement, paid retry or new job.
async function resume({db,tx,ref,old,uid,policy,input,now}){
 if(old?.status!=='needs_attention'||old.jobId||old.unstartedJobRecoveryAt||old.businessUid!==uid||old.policyId!==policy.id||
  !/^social_mix_/.test(old.input?.requestId||'')||old.input.requestId!==input.requestId)return false;
 const p=old.input.socialPost,n=input.socialPost;
 if(!p||!n||p.itemId!==n.itemId||p.provider!==n.provider||!policy.providers.includes(n.provider))return false;
 const id='visual_job_'+require('crypto').createHash('sha256').update(uid+'\n'+input.requestId).digest('hex').slice(0,40);
 const [jobSnap,reservation,itemSnap,priorSnap,currentSnap]=await Promise.all([
  tx.get(db.doc('visualGenerationJobs/'+id)),tx.get(db.doc('visualGenerationReservations/'+id)),tx.get(db.doc('socialContentItems/'+n.itemId)),
  tx.get(db.doc('socialContentVersions/'+p.itemId+'_v'+p.version)),tx.get(db.doc('socialContentVersions/'+n.itemId+'_v'+n.version))]);
 const job=jobSnap.data(),item=itemSnap.data(),prior=priorSnap.data(),current=currentSnap.data();
 if(!job||job.businessUid!==uid||job.managedPolicyId!==policy.id||job.authorizationSource!=='approved_strategy'||job.requestId!==input.requestId||
  job.status!=='queued'||job.attemptCount!==0||job.candidateAssetId||job.providerUsage||job.actualCostMicros!=null||reservation.exists||
  item?.businessUid!==uid||item.planId!==policy.planId||item.managedHolds?.[n.provider]||(item.platformVersions?.[n.provider]??item.currentVersion)!==n.version||
  prior?.businessUid!==uid||current?.businessUid!==uid||prior.planId!==policy.planId||current.planId!==policy.planId||
  job.safeBrief?.socialCreativeContext?.post?.contentHash!==prior.contentHash||prior.goal!==current.goal||prior.pillar!==current.pillar||
  JSON.stringify(prior.variants?.find(v=>v.provider===p.provider))!==JSON.stringify(current.variants?.find(v=>v.provider===n.provider)))return false;
 tx.update(ref,{status:'pending',jobId:id,input:{...old.input,socialPost:{...p,version:n.version}},unstartedJobRecoveryAt:now,
  unstartedJobRecovery:{reason:'Same initial source and unchanged content; prior job was never attempted or reserved.',previousInput:old.input,previousState:old.status,previousReason:old.reason||null}});
 return true;
}
module.exports={resume};
