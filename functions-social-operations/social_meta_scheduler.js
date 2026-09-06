"use strict";

// Shares canonical growth jobs with X, but never reads or changes X allowances.
// Certification discovers/evaluates real jobs without creating synthetic approvals.
async function run({db, publisher, businessUid, now=Date.now()}) {
  const results=[];
  for (const provider of ["facebook","instagram"]) {
    const snapshots=await db.collection("socialGrowthJobs").where("provider","==",provider).limit(100).get();
    for (const snapshot of snapshots.docs) {
      const job=snapshot.data();
      if(job.businessUid!==businessUid || job.id!==snapshot.id ||
          ["published","canceled"].includes(job.status))continue;
      try {
        const inspection=await publisher.inspect(job.id);
        if (!inspection.deploymentAllowsCreates || !inspection.allowanceEnabled) {
          results.push({...inspection,status:"gated"}); continue;
        }
        if(Date.parse(job.scheduledFor)>now) {results.push({jobId:job.id,status:"scheduled"});continue;}
        // Hold ambiguous prior attempts for deliberate reconciliation rather
        // than spending provider quota every minute or guessing a retry.
        const prior=await snapshot.ref.collection("providerSteps").limit(20).get();
        const records=prior.docs.map(item=>item.data());
        if(records.some(step=>!step.receipt && (!step.observedProviderId || step.generation>=3))) {
          results.push({jobId:job.id,status:"reconciliation_required"});continue;
        }
        if(records.some(step=>!step.receipt && step.leaseUntil>now)) {
          results.push({jobId:job.id,status:"waiting_for_readiness"});continue;
        }
        // Known IDs are reconciled by executeStep before any subsequent step.
        // Three durable generations bound polling; unknown IDs never resend.
        const result=await publisher.execute(job.id);
        results.push({jobId:job.id,status:result.status});
      } catch (_) {
        results.push({jobId:job.id,status:"authority_review_required"});
      }
    }
  }
  return {schemaVersion:"MetaSchedulerInspectionV1",results};
}
module.exports={run};
