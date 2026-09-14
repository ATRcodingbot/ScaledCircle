"use strict";
const {createHash}=require('node:crypto');
// Only the execution worker calls this after its authoritative inspection.
// This does not approve, schedule, retry or publish any post.
async function record({db,FieldValue,businessUid,results}) {
 let count=0;
 for(const result of results) {
  if(!['needs_attention','authority_review_required','reconciliation_required'].includes(result.status)||!result.jobId)continue;
  const digest=createHash('sha256').update([businessUid,result.jobId,'publishing_attention'].join(':')).digest('hex');
  await db.runTransaction(async tx=>{
   const ref=db.doc('notifications/social_attention_'+digest);
   const [old,snapshot]=await Promise.all([tx.get(ref),tx.get(db.doc('socialGrowthJobs/'+result.jobId))]);
   const job=snapshot.data();
   if(old.exists||job?.businessUid!==businessUid||job.customerApproval!==true||['published','canceled'].includes(job.status))return;
   tx.create(ref,{userId:businessUid,businessId:businessUid,type:'social_publishing_failed',
    title:'Social publishing needs attention',message:'An approved post needs checking. Review its current status in Social Manager.',
    deepLink:{destination:'social_review'},source:{kind:'authoritative_scheduler_attention',jobId:result.jobId},
    read:false,createdAt:FieldValue.serverTimestamp()});count++;
  });
 }
 return {count};
}
module.exports={record};
