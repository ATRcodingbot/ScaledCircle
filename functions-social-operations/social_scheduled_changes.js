'use strict';
function createChanges({db,now=Date.now}){
 return {async cancel(uid,actorUid,input){
  if(actorUid!==uid||!['cancel','edit'].includes(input.action)||!/^social_growth_job_[a-f0-9]{64}$/.test(input.jobId||''))throw Error('Only the owner can change this scheduled post.');
  return db.runTransaction(async tx=>{
   const ref=db.doc('socialGrowthJobs/'+input.jobId),job=(await tx.get(ref)).data();
   if(job?.businessUid!==uid||job.customerApproval!==true)throw Error('This post is not available in your Business.');
   if(job.status==='canceled')return {status:'canceled',reused:true};
   const steps=await tx.get(ref.collection('providerSteps').limit(1));
   if(!['scheduled','approved'].includes(job.status)||job.sendStarted||!steps.empty||Date.parse(job.scheduledFor)<now()+5*60000)
    throw Error('Publication is already starting or too close to its scheduled time to change safely.');
   const itemId=job.versionId.replace(/_v\d+$/,''),itemRef=db.doc('socialContentItems/'+itemId);
   const item=(await tx.get(itemRef)).data();
   if(item?.businessUid!==uid)throw Error('Post identity needs reconciliation.');
   tx.update(ref,{status:'canceled',canceledAt:now(),canceledByUid:actorUid,cancellationReason:input.action==='edit'?'owner_edit':'owner_cancel'});
   tx.update(itemRef,{['managedHolds.'+job.provider]:{status:input.action==='edit'?'editing':'canceled',at:now(),actorUid},
    ['platformApprovals.'+job.provider+'.status']:'canceled'});
   tx.create(db.collection('socialScheduleChangeAudit').doc(),{businessUid:uid,actorUid,action:input.action,jobId:job.id,versionId:job.versionId,at:now()});
   return {status:'canceled',itemId,provider:job.provider};
  });
 }};
}
module.exports={createChanges};
