"use strict";
const {createHash}=require('node:crypto');
function summary(before,after){
 if(!after?.approved||after.certification===true||before?.status===after.status)return null;
 if(after.status==='needs_attention')return {type:'email_campaign_attention',title:'Email campaign needs attention',message:'Review the held recipients or mailbox connection. No automatic resend was requested.'};
 if(['sent','partially_sent','suppressed'].includes(after.status))return {type:'email_campaign_completed',title:'Email campaign sending complete',message:`${after.results.sent} sent to the provider; ${after.results.suppressed} excluded. Review campaign results and replies. Sending does not establish delivery or interest.`};
 return null;
}
async function record({db,businessId,before,after,now=Date.now}){
 const event=summary(before,after);if(!event||after.businessId!==businessId)return;
 const id=createHash('sha256').update([businessId,after.campaignId,after.reviewDigest,event.type].join(':')).digest('hex');
 const ref=db.doc('notifications/email_campaign_'+id);
 await db.runTransaction(async tx=>{if((await tx.get(ref)).exists)return;tx.create(ref,{...event,userId:businessId,businessId,read:false,
 deepLink:{destination:'business_email_campaign',campaignId:after.campaignId},source:{kind:'campaign_provider_reconciliation',campaignId:after.campaignId},
 createdAt:new Date(now())});});
}
module.exports={summary,record};
