'use strict';
const crypto=require('node:crypto'),{digest}=require('./lead_assistance_policy');
// One bounded visit inside the existing reply worker. No new scheduler, model
// call, retry loop or independent contact authority.
function createDispatch({db,now=Date.now,pilot,prepare,send,prepareContent=null}){
 const select=require('./adaptive_outreach').createSelector({db,now,prepareContent});
 return async a=>{
  const root=db.doc('businessMailboxes/'+a.businessId),state=root.collection('private').doc('assistanceDispatch');
  const policy=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`).get()).data();
  if(policy?.status!=='active'||policy.revokedAt||policy.policy.expiresAt<=now()||!a.beta.leadAssistanceGrant)return {state:'not_authorized'};
  const lease=crypto.randomUUID(),claimed=await db.runTransaction(async tx=>{
   const old=(await tx.get(state)).data()||{};if(old.leaseUntil>now())return null;
   tx.set(state,{lease,leaseUntil:now()+150000},{merge:true});return old;
  });
  if(!claimed)return {state:'processing'};
  let cursor=claimed.cursor||null,outcome='no_eligible_recipient';
  try{
   let query=db.collection(`businessOperations/${a.businessId}/customers`).orderBy('__name__').limit(25);
   if(cursor)query=query.startAfter(cursor);
   const rows=await query.get();
   for(const row of rows.docs){
    cursor=row.id;const customer=row.data();if(customer.businessId!==a.businessId)continue;
    const draftRef=root.collection('drafts').doc('crm_'+row.id),old=(await draftRef.get()).data();
    const previous=old?.operationId?(await root.collection('operations').doc(old.operationId).get()).data():null;
    if(previous&&previous.state!=='sent')continue; // Unknown/suppressed outcomes never become another send.
    const kind=previous?'followup':'introduction';
    try{
     const context=await pilot.resolve(a,row.id,kind),settings=context.saved.policy;
     const history=await root.collection('operations').where('recipient','==',customer.email).limit(101).get();
     if(history.size>100)continue;
     if(kind==='introduction'&&!history.empty)continue;
     if(kind==='followup'&&(previous.replyCount>0||now()-previous.requestedAt<settings.limits.followupIntervalHours*3600000||
       history.docs.filter(d=>d.data().assistance?.kind==='followup').length>=settings.limits.followupsPerContact))continue;
     const selection=kind==='introduction'?await select(a,context,row.id):null;
     const template=selection?.template||(selection?.variant==='alternative'?settings.adaptiveOutreach.alternative:settings.templates?.[kind]);
     const copyIssue=require('./outreach_preparation').validateCopy(template,settings);if(copyIssue){outcome=copyIssue;continue;}
     if(!template?.subject||!template?.body||!settings.mailingAddress){outcome='approved_message_template_required';continue;}
     // Exact owner-approved copy. Do not invent personalization or free-form
     // instructions from a contact record or an inbound message.
     const linkRef=root.collection('optoutLinks').doc(digest(customer.email));
     const token=await db.runTransaction(async tx=>{
      const prior=await tx.get(linkRef);if(prior.exists)return prior.data().token;
      const value=crypto.randomBytes(32).toString('base64url');
      tx.create(linkRef,{token:value,businessId:a.businessId,recipient:customer.email,createdAt:now()});
      tx.create(db.doc('businessEmailUnsubscribeLinks/'+digest(value)),{businessId:a.businessId,recipient:customer.email,createdAt:now()});return value;
     });
     const body=template.body+'\n\n'+settings.mailingAddress+'\nUnsubscribe from these marketing emails: https://us-east1-scaled-circle.cloudfunctions.net/businessEmailUnsubscribeV1?token='+token;
     // An interrupted visit reuses the saved immutable draft rather than
     // preparing another operation with a new version.
     let draft=old;
     if(!old||previous){draft=await prepare(a,{customerId:row.id,assistanceKind:kind,subject:template.subject,body,
       expectedVersion:old?.version||0,...(previous?{followupTo:old.operationId}:{}),...(selection?{outreachAssignmentId:digest([selection.strategyId,selection.identity])}:{}),messageAngle:kind==='followup'?'followup':'introduction',cta:'reply'});}
     if(draft.automatic!==true||draft.assistance?.policyDigest!==context.saved.digest||draft.subject!==template.subject||draft.body!==body)continue;
     const result=await send(a,{prospectId:draft.prospectId,operationId:draft.operationId,version:draft.version,confirm:true});
     outcome=result.state;break;
    }catch(e){outcome=['failed-precondition','resource-exhausted','aborted'].includes(e.code)?'eligibility_held':'needs_review';}
   }
   if(rows.size<25)cursor=null;
   return {state:outcome};
  }finally{
   await db.runTransaction(async tx=>{const current=(await tx.get(state)).data();if(current?.lease===lease)
    tx.update(state,{lease:null,leaseUntil:0,cursor,lastVisitedAt:now(),outcome});});
  }
 };
}
module.exports={createDispatch};
