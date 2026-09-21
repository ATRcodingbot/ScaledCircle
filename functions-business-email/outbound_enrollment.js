'use strict';
// Purpose extension of the existing shared grant, not another grant or ledger.
const b=require('./inference_budget'),{digest}=require('./lead_assistance_policy');
const PURPOSE='outbound_business_context',REVIEW='openai_business_context_v1';
const REFERENCE='Founder outbound purpose extension approval, September 21, 2026; attachment 9bb31fb0-2738-47e2-8dad-466a2fc8d7e9';
const fail=m=>{throw Object.assign(Error(m),{code:'failed-precondition'});};
function shape(g,workspaces=b.WORKSPACES){return g?.purpose==='lead_email_assistance'&&['prepared','active'].includes(g.status)&&!g.revokedAt&&g.maximumCostMicros===b.LIMIT&&g.maximumRequests===b.REQUESTS&&g.provider==='openai'&&g.model==='gpt-4.1-mini'&&g.renewal===false&&g.topUp===false&&g.businessIds?.length===2&&new Set(g.businessIds).size===2&&workspaces.every(x=>g.businessIds.includes(x));}
function reviewValid(r){const p=require('./provider_review');return r?.status==='verified'&&r.organization===p.ORGANIZATION&&r.project===p.PROJECT&&r.outboundBusinessContextPermitted===true&&r.gmailProcessingPermitted===false&&r.trainingSharingDisabled===true&&r.loggingMode==='per_call_store_false'&&!!r.approvedBy&&!!r.evidenceRef&&!!r.outboundEvidenceRef;}
function create({db,now=Date.now,workspaces=b.WORKSPACES}){
 const grantRef=db.doc('emailAssistanceOperatingGrants/'+require('./pilot_enrollment').GRANT),reviewRef=db.doc('emailAssistanceProviderReviews/'+REVIEW);
 async function enroll(a,input){
  if(a.businessId!==workspaces[0]||a.actorUid!==workspaces[0]||a.beta.kind!=='internal'||a.beta.canManageConnection!==true)fail('Use the authenticated ScaledCircle internal owner.');
  if(input?.confirm!==true||Object.keys(input).some(k=>!['confirm','sourceSha'].includes(k))||!(/^[a-f0-9]{40}$/.test(input.sourceSha||'')))fail('Review the exact outbound purpose and implementation source.');
  return db.runTransaction(async tx=>{
   const g=(await tx.get(grantRef)).data(),old=(await tx.get(reviewRef)).data();
   if(!shape(g,workspaces))fail('The existing shared grant must retain its exact approved limits.');
   if(g.allowedPurposes?.includes(PURPOSE)&&reviewValid(old))return {recorded:true,reused:true,status:g.status,startsAt:g.startsAt,expiresAt:g.expiresAt};
   if(g.status!=='prepared'||g.startsAt||g.expiresAt)fail('Do not extend purpose or assessment during an active or expired pilot.');
   const p=require('./provider_review'),review={status:'verified',organization:p.ORGANIZATION,project:p.PROJECT,approvedBy:a.actorUid,reviewedAt:now(),implementationSource:input.sourceSha,evidenceRef:'docs/email-outbound-purpose-20260921.md',outboundEvidenceRef:REFERENCE,outboundBusinessContextPermitted:true,gmailProcessingPermitted:false,trainingSharingDisabled:true,loggingMode:'per_call_store_false',zeroDataRetentionVerified:false,retention:'Default abuse-monitoring retention up to 30 days, subject to documented exceptions.',scope:'Reviewed Business context and existing templates only; no Gmail bodies or prospect identity; local outcome evaluation.'};
   const authorization={authorizedBy:a.actorUid,authorizedAt:now(),reference:REFERENCE,sourceSha:input.sourceSha};
   tx.update(grantRef,{allowedPurposes:[...new Set([...(g.allowedPurposes||[]),PURPOSE])],['purposeAuthorization.'+PURPOSE]:authorization});
   tx.set(reviewRef,review);tx.create(reviewRef.collection('audit').doc(digest(review)),review);
   tx.create(grantRef.collection('audit').doc('outbound_purpose_enrolled'),{action:'purpose_extended_without_activation',...authorization,purpose:PURPOSE,maximumCostMicros:b.LIMIT,maximumRequests:b.REQUESTS,startsAt:null,expiresAt:null});
   return {recorded:true,status:g.status,startsAt:null,expiresAt:null};
  });
 }
 async function readiness(tx,a){
  const get=r=>tx?tx.get(r):r.get();
  const [gs,rs,us]=await Promise.all([get(grantRef),get(reviewRef),get(grantRef.collection('usage').doc('shared'))]);const g=gs.data(),r=rs.data(),u=us.data()||{};
  let limitation=null;
  if(!shape(g,workspaces)||!workspaces.includes(a.businessId)||!g.allowedPurposes?.includes(PURPOSE)||!g.purposeAuthorization?.[PURPOSE]?.authorizedBy)limitation='outbound_purpose_extension_required';
  else if(!reviewValid(r))limitation='outbound_provider_data_assessment_required';
  else if(g.status==='active'&&!b.valid(g,a.businessId,now(),workspaces))limitation='outbound_allowance_inactive_or_exhausted';
  else if(g.status==='prepared'&&(g.startsAt||g.expiresAt))limitation='outbound_allowance_inactive_or_exhausted';
  else if((u.requests||0)>=b.REQUESTS||(u.actualCostMicros||0)+(u.outstandingCostMicros||0)+b.RESERVE>b.LIMIT)limitation='outbound_allowance_inactive_or_exhausted';
  return {ready:!limitation,limitation,grant:g,review:r,usage:u,binding:digest({status:g?.status||null,start:g?.startsAt||null,end:g?.expiresAt||null,authorization:g?.purposeAuthorization?.[PURPOSE]||null,review:r||null})};
 }
 async function ownerActivation(tx,a,saved){
  const r=await readiness(tx,a),p=saved.policy,own=(await tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email_pilot_grant`))).data();
  if(!r.ready||a.actorUid!==a.businessId||saved.businessId!==a.businessId||saved.approvedBy!==a.businessId||saved.status!=='active'||saved.revokedAt||p.expiresAt<=now()||!p.messagePreparation?.enabled||!p.messagePreparation.contextReviewed||!p.adaptiveOutreach?.enabled||!p.adaptiveOutreach.explorationEnabled||own?.status!=='active'||own.revokedAt||own.expiresAt<=now()||own.inferenceGrantId!==grantRef.id)fail('Review current owner strategy and outbound preparation readiness.');
  const startsAt=r.grant.status==='active'?r.grant.startsAt:now(),expiresAt=r.grant.status==='active'?r.grant.expiresAt:startsAt+b.TERM;
  return {startsAt,expiresAt,apply(){
   tx.update(grantRef,{status:'active',startsAt,expiresAt,['purposeReviewDigests.'+PURPOSE]:digest(r.review)});
   tx.create(grantRef.collection('audit').doc(digest([a.businessId,saved.digest,'outbound_activation'])),{action:'owner_authorized_outbound_preparation',businessId:a.businessId,actorUid:a.actorUid,policyDigest:saved.digest,startsAt,expiresAt,at:now(),replyAuthorityChanged:false});
  }};
 }
 return {enroll,readiness,ownerActivation};
}
module.exports={create,shape,reviewValid,PURPOSE,REVIEW,REFERENCE};
