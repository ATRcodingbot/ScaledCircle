'use strict';
const {WORKSPACES,TERM,LIMIT,REQUESTS,valid}=require('./inference_budget'),{digest}=require('./lead_assistance_policy');
const GRANT='founder_email_assistance_20260920';
const MAILBOXES=['support@scaledcircle.com','attractiveremodel@gmail.com'];
const REFERENCE='Founder conditional Email-to-appointment pilot authorization, 2026-09-20';
const fail=message=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
function createEnrollment({db,now=Date.now,workspaces=WORKSPACES,mailboxes=MAILBOXES}){
 const grantRef=db.doc('emailAssistanceOperatingGrants/'+GRANT);
 const access=b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email_pilot_grant`);
 async function prepare(a,input){
  if(a.businessId!==workspaces[0]||a.actorUid!==workspaces[0]||a.beta.kind!=='internal'||!a.beta.canManageConnection||input?.confirm!==true||Object.keys(input).some(k=>k!=='confirm'))fail('Use the verified ScaledCircle Admin to prepare the exact approved pilot.');
  return db.runTransaction(async tx=>{
   const old=await tx.get(grantRef);if(old.exists)return {prepared:true,status:old.data().status,startsAt:old.data().startsAt||null,expiresAt:old.data().expiresAt||null,reused:true};
   const boxes=await Promise.all(workspaces.map(b=>tx.get(db.doc('businessMailboxes/'+b))));
   if(boxes.some((d,i)=>d.data()?.status!=='connected'||d.data()?.email!==mailboxes[i]))fail('The two exact approved mailboxes must remain connected.');
   const grant={purpose:'lead_email_assistance',status:'prepared',businessIds:workspaces,provider:'openai',model:'gpt-4.1-mini',maximumCostMicros:LIMIT,maximumRequests:REQUESTS,
    renewal:false,topUp:false,startsAt:null,expiresAt:null,termMs:TERM,authorizedBy:a.actorUid,authorizationReference:REFERENCE,preparedAt:now()};
   tx.create(grantRef,grant);
   workspaces.forEach((b,i)=>tx.create(access(b),{id:GRANT,product:'lead_email_assistance_pilot',businessId:b,mailbox:mailboxes[i],inferenceGrantId:GRANT,status:'prepared',
    grantedBy:a.actorUid,grantedAt:now(),reason:REFERENCE,startsAt:null,expiresAt:null,maximumTermMs:TERM}));
   tx.create(grantRef.collection('audit').doc('prepared'),{actorUid:a.actorUid,action:'prepared_without_activation',at:now(),authorizationReference:REFERENCE,budget:grant});
   return {prepared:true,status:'prepared',startsAt:null,expiresAt:null};
  });
 }
 async function recordDataReview(a,input){
  if(a.businessId!==workspaces[0]||a.actorUid!==workspaces[0]||a.beta.kind!=='internal'||!a.beta.canManageConnection)fail('Use the verified production ScaledCircle Admin.');
  if(input?.confirm!==true||Object.keys(input).some(k=>!['confirm','sourceSha','amendmentReference'].includes(k))||!(/^[a-f0-9]{40}$/.test(input.sourceSha||''))||typeof input.amendmentReference!=='string'||input.amendmentReference.trim().length<12||input.amendmentReference.length>1000)fail('Record the actual implementation and sent Google-review amendment reference. This is not Google approval.');
  const {ORGANIZATION,PROJECT}=require('./provider_review');
  const value={status:'verified',organization:ORGANIZATION,project:PROJECT,implementationVersion:'email_pilot_v1',implementationSource:input.sourceSha,
   approvedBy:a.actorUid,reviewedAt:now(),evidenceRef:'docs/email-pilot-data-review-20260920.md',amendmentReference:input.amendmentReference.trim(),
   trainingSharingDisabled:true,gmailProcessingPermitted:true,loggingMode:'per_call_store_false',zeroDataRetentionVerified:false,
   retention:'Default abuse-monitoring retention, up to 30 days subject to documented legal/security exceptions.',
   googleReviewDisposition:'processing_permitted',googleVerificationStatus:'under_review',securityAssessmentStatus:'open',
   assessment:'Application policy assessment for disclosed, consented CRM reply suggestions; not Google verification approval.'};
  const ref=db.doc('emailAssistanceProviderReviews/openai_gmail_v1');
  return db.runTransaction(async tx=>{const grant=(await tx.get(grantRef)).data(),old=(await tx.get(ref)).data();
   if(grant?.status==='active')fail('Do not change the model-data assessment during an active pilot.');
   if(old?.implementationSource===input.sourceSha&&old?.amendmentReference===value.amendmentReference)return {recorded:true,reused:true};
   tx.set(ref,value);tx.create(ref.collection('audit').doc(digest(value)),value);return {recorded:true,googleApproval:false};});
 }
 // Caller performs all reads before its policy/audit writes. Both exact owners
 // must have independently confirmed; no clock starts on preference saving.
 async function activation(tx,a,saved,readiness){
  if(!workspaces.includes(a.businessId)||readiness.length)fail('Complete every displayed prerequisite before authorization.');
  const grant=(await tx.get(grantRef)).data(),review=(await tx.get(db.doc('emailAssistanceProviderReviews/openai_gmail_v1'))).data();
  if(!grant||!['prepared','active'].includes(grant.status)||!require('./provider_review').validReview(review))fail('The prepared grant and model-data review must be ready.');
  if(grant.status==='active'){if(!valid(grant,a.businessId,now(),workspaces)||grant.dataReviewDigest!==digest(review))fail('The pilot authority expired or its reviewed configuration changed.');return {activate:true,startsAt:grant.startsAt,expiresAt:grant.expiresAt,apply(){}};}
  if(grant.maximumCostMicros!==LIMIT||grant.maximumRequests!==REQUESTS||grant.provider!=='openai'||grant.model!=='gpt-4.1-mini'||grant.renewal!==false||grant.topUp!==false||grant.businessIds?.length!==2||workspaces.some(b=>!grant.businessIds.includes(b))||grant.revokedAt)fail('The exact approved pilot grant changed.');
  const refs=workspaces.map(b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email`));
  const records=await Promise.all(refs.map(r=>tx.get(r))),grants=await Promise.all(workspaces.map(b=>tx.get(access(b)))),boxes=await Promise.all(workspaces.map(b=>tx.get(db.doc('businessMailboxes/'+b))));
  const schedules=await Promise.all(workspaces.map(b=>tx.get(db.doc(`businessOperations/${b}/settings/scheduling`))));
  const policies=records.map((d,i)=>workspaces[i]===a.businessId?saved:d.data());
  const ready=policies.every((p,i)=>p?.approvedBy===workspaces[i]&&['awaiting_pilot_activation','active'].includes(p.status)&&!p.revokedAt&&require('./assistance_term').resolveTerm(p.policy,grant,now()).expiresAt>now()&&
    boxes[i].data()?.status==='connected'&&boxes[i].data()?.generation===p.connectionGeneration&&boxes[i].data()?.email===mailboxes[i]&&grants[i].data()?.id===GRANT&&(!p.policy.bookingEnabled||(schedules[i].data()?.version===p.policy.availabilityRevision&&digest(schedules[i].data()?.settings)===digest(p.policy.schedulingRules))));
  if(!ready)return {activate:false};
  if(grant.status==='active'&&grant.expiresAt<=now())fail('The pilot has expired. No automatic renewal is permitted.');
  const startsAt=grant.startsAt||now(),expiresAt=grant.expiresAt||startsAt+TERM;
  return {activate:true,startsAt,expiresAt,apply(){
   if(grant.status==='prepared'){
    tx.update(grantRef,{status:'active',startsAt,expiresAt,dataReviewDigest:digest(review)});
    tx.create(grantRef.collection('audit').doc('activated'),{actorUid:a.actorUid,action:'both_owners_authorized',startsAt,expiresAt,policyDigests:policies.map(p=>p.digest),dataReviewDigest:digest(review)});
   }
   workspaces.forEach((b,i)=>{tx.update(access(b),{status:'active',startsAt,expiresAt});if(b!==a.businessId){const p={...policies[i],status:'active',policy:{...policies[i].policy,expiresAt:Math.min(require('./assistance_term').resolveTerm(policies[i].policy,{...grant,status:'active',expiresAt},now()).expiresAt,expiresAt)},activatedAt:startsAt};p.digest=digest(p);tx.set(refs[i],p);}});
  }};
 }
 return {prepare,activation,recordDataReview};
}
module.exports={createEnrollment,GRANT};
