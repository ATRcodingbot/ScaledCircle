"use strict";
const {hash,jobs}=require("./social_growth_cycle");
const {isDeepStrictEqual}=require("node:util");

// Publication attribution is separate from account baselines: account-wide
// daily views must never become a post's lifetime or 28-day performance.
function binding(job,receipt,approval) {
 if(!["facebook","instagram"].includes(job?.provider)||job.status!=="published"||
   approval?.id!==job.approvalId||approval?.businessUid!==job.businessUid||approval?.approvedByUid!==job.businessUid||
   !jobs(approval).some(x=>x.id===job.id&&x.bindingHash===job.bindingHash&&isDeepStrictEqual(x.binding,job.binding))||
   receipt?.provider!==job.provider||receipt?.contentHash!==job.binding.contentHash||
   receipt?.providerPostId!==job.providerPostId||!/^\d+(?:_\d+)?$/.test(receipt.providerPostId)||
   !Number.isFinite(receipt.observedAt))throw Error("meta_measurement_receipt_mismatch");
 return {businessUid:job.businessUid,provider:job.provider,providerAccountId:approval.providerAccounts[job.provider].providerUserId,
  publicationJobId:job.id,contentVersionId:job.versionId,contentHash:job.binding.contentHash,
  bindingHash:job.bindingHash,approvalId:job.approvalId,providerPostId:receipt.providerPostId};
}
function plan(job,receipt,approval) {
 const attribution=binding(job,receipt,approval);
 return [24,168].map(hours=>({id:`meta_measurement_${hash({publicationJobId:job.id,hours})}`,
  schemaVersion:"MetaPublicationMeasurementJobV1",...attribution,
  scheduledFor:new Date(receipt.observedAt+hours*3600000).toISOString(),hoursAfterPublication:hours,status:"pending"}));
}
function observation({job,receipt,approval,evidence,observedAt}) {
 const attribution=binding(job,receipt,approval);
 if(evidence?.provider!==attribution.provider||evidence.providerAccountId!==attribution.providerAccountId||
   evidence.providerPostId!==attribution.providerPostId||evidence.scope!=="post"||
   !Number.isFinite(Date.parse(observedAt))||!Array.isArray(evidence.metrics))throw Error("meta_measurement_evidence_mismatch");
 const metrics=evidence.metrics.map(metric=>{
  if(!/^[a-z_]{1,80}$/.test(metric.name||"")||!["OBSERVED","NO_DATA","UNAVAILABLE","ERROR"].includes(metric.status)||
    (metric.status==="OBSERVED"? !Number.isSafeInteger(metric.value)||metric.value<0:metric.value!==null)||
    !["day","lifetime","total_value"].includes(metric.period)||
    (metric.period==="day"&&(!Number.isFinite(Date.parse(metric.providerEndTime))||typeof metric.complete!=="boolean")))throw Error("meta_measurement_metric_invalid");
  return {name:metric.name,status:metric.status,value:metric.value,period:metric.period,
    providerEndTime:metric.providerEndTime||null,complete:metric.complete===true};
 });
 return {schemaVersion:"MetaPublicationObservationV1",...attribution,observedAt,source:"meta_graph_read_only",
  scope:"post",experiment:"INITIAL_EXPERIMENT",metrics,cadenceDecision:"HOLD_PENDING_REVIEW"};
}
// Provider-specific readers supply post-scoped evidence; this collector never
// substitutes an existing account baseline when a post metric is unavailable.
function createCollector({db,readEvidence,now=Date.now}) {
 return async id=>{
  const ref=db.doc(`socialMetaMeasurementJobs/${id}`);
  const claim=await db.runTransaction(async tx=>{
   const item=(await tx.get(ref)).data();
   if(!item||item.status==="completed"||item.status==="failed"||Date.parse(item.scheduledFor)>now()||item.leaseUntil>now()||item.nextAttemptAt>now())return null;
   if((item.attempts||0)>=2){tx.update(ref,{status:"failed"});return null;}
   const next={...item,status:"reading",attempts:(item.attempts||0)+1,leaseUntil:now()+120000};tx.set(ref,next);return next;
  });
  if(!claim)return;
  try {
   const job=(await db.doc(`socialGrowthJobs/${claim.publicationJobId}`).get()).data();
   const receipt=(await db.doc(`socialGrowthJobs/${claim.publicationJobId}/receipts/publication`).get()).data();
   const approval=(await db.doc(`socialGrowthApprovals/${claim.approvalId}`).get()).data();
   const expected=plan(job,receipt,approval).find(x=>x.id===id);
   if(!expected||Object.keys(expected).some(key=>key!=="status"&&!isDeepStrictEqual(expected[key],claim[key])))throw Error("meta_measurement_job_changed");
   const evidence=await readEvidence(job,receipt,approval);
   const result=observation({job,receipt,approval,evidence,observedAt:new Date(now()).toISOString()});
   await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(current?.status!=="reading"||current.attempts!==claim.attempts)throw Error("meta_measurement_stale");
    tx.create(db.doc(`socialMetaMeasurementSnapshots/${id}`),result);
    tx.update(ref,{status:"completed",leaseUntil:0,completedAt:now()});
   });
  }catch(_){
   await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();
    if(current?.status!=="reading"||current.attempts!==claim.attempts)return;
    tx.update(ref,{status:claim.attempts>=2?"failed":"pending",leaseUntil:0,nextAttemptAt:now()+1800000,lastFailure:"post_measurement_unavailable"});});
  }
 };
}
module.exports={binding,plan,observation,createCollector};
