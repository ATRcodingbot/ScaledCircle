'use strict';
const {hash,id}=require('./policy');
// Only newly persisted server events enter the same Notifications collection.
// No mailbox send, payment, plan approval or business status is created here.
function signal(kind,key,before,after){
 if(!after||after.certification===true)return null;
 // An authoritative autonomy decision removes the human-review signal.
 if(['social','email_draft'].includes(kind)&&after.humanReviewRequired===false)return null;
 let uid,type,link,message;
 if(kind==='reply'&&id(after.businessId)&&id(after.operationId)&&after.providerMessageId){uid=after.businessId;type='business_email_reply';link={destination:'business_email',operationId:after.operationId};message='A customer replied to your Business email. Open the conversation to review it.';}
 if(kind==='social'&&after.readyToPublish===true&&before?.readyToPublish!==true&&id(after.businessUid)&&id(after.contentItemId)&&['facebook','instagram'].includes(after.provider)){uid=after.businessUid;type='social_drafts_ready';link={destination:'social_draft',itemId:after.contentItemId,provider:after.provider};message='A Social draft is ready for your review. Nothing has been approved or scheduled.';}
 if(kind==='published'&&['needs_attention','authority_review_required','reconciliation_required'].includes(after.status)&&before?.status!==after.status&&after.customerApproval===true&&id(after.businessUid)){uid=after.businessUid;type='social_publishing_failed';link={destination:'social_review'};message='An approved Social post needs attention. Review its current publishing status.';}
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
 const sourceKey=kind==='social'?[after.businessUid,after.contentItemId,after.provider,after.contentVersion||after.versionId||after.version||after.contentHash||'ready'].join(':'):key;
 const identity='event_'+hash([kind,sourceKey,kind==='email_draft'?after.version:kind==='payout'||kind==='billing'||kind==='published'?after.state||after.status:'created'].join(':'));
 return {identity,userId:uid,businessId:['reply','social','published','email_draft','billing'].includes(kind)?uid:null,type,title:type==='social_publishing_failed'?'Social publishing needs attention':{reply:'Customer reply received',social:'Social review ready',published:'Social post published',email_draft:'Email campaign review ready',payout:'Cash-out update',billing:'Membership needs attention'}[kind],message,deepLink:link,source:{kind,key},read:false};
}
async function record({db,FieldValue,kind,key,before,after,now=Date.now}){const data=signal(kind,key,before,after);if(!data)return {created:false};
 const grouped=['social','email_draft','reply'].includes(kind);
 const at=now(),windowMs=300000,window=Math.floor(at/windowMs);
 const notificationId=grouped?'summary_'+hash([data.userId,data.businessId,kind,kind==='reply'?after.operationId:'review',window].join(':')):data.identity;
 const ref=db.doc('notifications/'+notificationId),receipt=db.doc('mobileNotificationSignalReceipts/'+data.identity);
 return db.runTransaction(async tx=>{
  const [seen,old,legacy]=await Promise.all([tx.get(receipt),tx.get(ref),grouped?tx.get(db.doc('notifications/'+data.identity)):Promise.resolve(null)]);
  if(seen.exists||legacy?.exists||(!grouped&&old.exists))return {created:false};
  const count=(old.data()?.aggregateCount||0)+1;
  const title=kind==='social'?`${count} Social post${count===1?'':'s'} ready for your review`:kind==='reply'?`${count} customer repl${count===1?'y':'ies'} received`:kind==='email_draft'?`${count} email campaign${count===1?'':'s'} ready for review`:data.title;
  const value={...data,identity:notificationId,title,aggregateCount:count,
   ...(grouped?{aggregateWindowEndMs:(window+1)*windowMs,aggregationKind:kind}:{}),
   ...(kind==='social'?{deepLink:{destination:'social_review'},message:'Review the prepared posts. Nothing has been approved or scheduled.'}:{}),
   ...(kind==='email_draft'?{deepLink:{destination:'business_email_campaign'},message:'Review your prepared campaigns before sending.'}:{}),
   createdAt:old.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  // Updating a window never resets delivery receipts or silently marks it unread.
  if(old.exists){delete value.read;tx.set(ref,value,{merge:true});}else tx.create(ref,value);
  tx.create(receipt,{notificationId,userId:data.userId,createdAt:FieldValue.serverTimestamp()});
  return {created:!old.exists,aggregated:grouped,count};
 });}

module.exports={signal,record};
