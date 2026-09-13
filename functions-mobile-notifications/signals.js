'use strict';
const {hash,id}=require('./policy');
// Only newly persisted server events enter the same Notifications collection.
// No mailbox send, payment, plan approval or business status is created here.
function signal(kind,key,before,after){
 if(!after||after.certification===true)return null;
 let uid,type,link,message;
 if(kind==='reply'&&id(after.businessId)&&id(after.operationId)&&after.providerMessageId){uid=after.businessId;type='business_email_reply';link={destination:'business_email',operationId:after.operationId};message='A customer replied to your Business email. Open the conversation to review it.';}
 if(kind==='social'&&after.readyToPublish===true&&before?.readyToPublish!==true&&id(after.businessUid)&&id(after.contentItemId)&&['facebook','instagram'].includes(after.provider)){uid=after.businessUid;type='social_drafts_ready';link={destination:'social_draft',itemId:after.contentItemId,provider:after.provider};message='A Social draft is ready for your review. Nothing has been approved or scheduled.';}
 if(kind==='published'&&after.status==='published'&&before?.status!=='published'&&after.customerApproval===true&&after.providerPostId&&id(after.businessUid)){uid=after.businessUid;type='social_post_published';link={destination:'social_published',jobId:key};message='Your approved Social post was published. Open Social Manager for the provider-confirmed result.';}
 if(kind==='email_draft'&&after.status==='needs_founder_review'&&before?.version!==after.version&&id(after.businessId)){uid=after.businessId;type='email_campaign_review_ready';link={destination:'business_email_campaign',campaignId:key.split('/').pop()};message='An email campaign is ready for your review. It has not been approved or sent.';}
 if(kind==='payout'&&after.kind==='scaler_cashout_v1'&&after.authorityVersion==='ProductionApprovedEarningCashoutV1'&&after.mode==='live'&&id(after.ownerId)&&before?.state!==after.state){
  uid=after.ownerId;
  if(after.state==='completed'&&after.settled===true&&after.fundingTransferRecorded===true)type='payout_paid';
  else if(['payout_pending','transfer_pending','balance_pending','platform_balance_pending'].includes(after.state))type='payout_processing';
  else if(['payout_failed','failed','attention','reversed'].includes(after.state))type='payout_needs_attention';
  link={destination:'earnings',operationId:key};message=type==='payout_paid'?'Your payout has completed.':type==='payout_processing'?'Your cash-out is processing.':'Your cash-out needs attention. Open Earnings for the current status.';
 }
 if(kind==='billing'&&id(key)&&['past_due','unpaid'].includes(after.status)&&before?.status!==after.status&&after.stripeSubscriptionId){uid=key;type='billing_payment_failed';link={destination:'billing'};message='Your membership payment needs attention. Review Billing for the current status.';}
 if(!type||!uid)return null;
 const identity='event_'+hash([kind,key,kind==='email_draft'?after.version:kind==='payout'||kind==='billing'?after.state||after.status:'created'].join(':'));
 return {identity,userId:uid,businessId:['reply','social','published','email_draft','billing'].includes(kind)?uid:null,type,title:{reply:'Customer reply received',social:'Social review ready',published:'Social post published',email_draft:'Email campaign review ready',payout:'Cash-out update',billing:'Membership needs attention'}[kind],message,deepLink:link,source:{kind,key},read:false};
}
async function record({db,FieldValue,kind,key,before,after}){const data=signal(kind,key,before,after);if(!data)return {created:false};const ref=db.doc('notifications/'+data.identity);return db.runTransaction(async tx=>{if((await tx.get(ref)).exists)return {created:false};tx.create(ref,{...data,createdAt:FieldValue.serverTimestamp()});return {created:true};});}
module.exports={signal,record};
