'use strict';
const p=require('./lead_assistance_policy');
const fail=(reason)=>{throw Object.assign(Error(reason),{code:'failed-precondition'});};
const hash=v=>require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex');
function createPilot({db,now=Date.now}){
 const policyRef=b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email`);
 async function resolve(a,customerId,kind,tx,{ownOperationId=null}={}){
  if(a.actorUid!==a.businessId||a.beta.canManageConnection!==true)fail('Only the Business owner may use this pilot.');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(customerId)||!['introduction','followup','reply'].includes(kind))fail('Choose a saved customer and message purpose.');
  const get=r=>tx?tx.get(r):r.get(),grant=a.beta.leadAssistanceGrant;
  const [saved,customer,mail]=await Promise.all([get(policyRef(a.businessId)),get(db.doc(`businessOperations/${a.businessId}/customers/${customerId}`)),get(db.doc('businessMailboxes/'+a.businessId))]);
  const s=saved.data(),c=customer.data(),m=mail.data();
  // Ordinary owner-reviewed replies keep their existing send authority when
  // model preparation is unavailable or its separate pilot term has ended.
  // This never releases the internal certification-only sender hold.
  if(kind==='reply'&&a.beta.sendEnabled===true&&a.beta.certificationOnly===false){
   if(m?.status!=='connected'||m.permissions?.read!==true||m.permissions?.send!==true||m.email!==a.beta.mailbox||c?.businessId!==a.businessId||!c.email||c.doNotContact)fail('Choose this customer’s healthy connected mailbox.');
   const [restriction,contact]=await Promise.all([get(db.doc(`businessMailboxes/${a.businessId}/suppression/${hash(c.email)}`)),get(db.doc(`businessOperations/${a.businessId}/contactAuthority/${hash(c.email)}`))]);
   if(restriction.data()?.active||contact.data()?.suppressed)fail('Do not contact this recipient.');
   const policyDigest=p.digest(['ordinary_owner_reviewed_reply',a.businessId,m.generation]);
   return {saved:{digest:policyDigest},customer:c,mailbox:m,contact:contact.data(),binding:{kind,customerId,policyDigest,connectionGeneration:m.generation,consentDigest:c.emailPermission?p.digest(c.emailPermission):null,grantId:'ordinary_owner_reviewed_reply'}};
  }

  if(!s||s.businessId!==a.businessId||!(kind==='reply'?['active','paused']:['active']).includes(s.status)||s.revokedAt||s.policy.expiresAt<=now()||s.approvedBy!==a.businessId||
    !grant||grant.status!=='active'||grant.revokedAt||grant.product!=='lead_email_assistance_pilot'||grant.businessId!==a.businessId||grant.expiresAt<=now()||!grant.id||!grant.grantedBy||!grant.reason||grant.mailbox!==m?.email)
   fail('The owner’s email assistance policy is not active.');
  if(m?.status!=='connected'||m.permissions?.send!==true||m.generation!==s.connectionGeneration||m.email!==s.sender)fail('The approved sender connection changed.');
  if(c?.businessId!==a.businessId||!c.email||c.doNotContact)fail('Choose an eligible customer in this Business.');
  if(kind==='introduction'&&!s.policy.introductionsEnabled||kind==='followup'&&!s.policy.followupsEnabled)fail('This message purpose is not enabled.');
  const [restriction,contact]=await Promise.all([get(db.doc(`businessMailboxes/${a.businessId}/suppression/${hash(c.email)}`)),get(db.doc(`businessOperations/${a.businessId}/contactAuthority/${hash(c.email)}`))]);
  const permission=c.emailPermission;
  const contactState=contact.data();
  const eligibilityContact=ownOperationId&&contactState?.pendingOperationId===ownOperationId?{...contactState,pendingOperationId:null}:contactState;
  if(kind!=='reply'){
   const reason=p.recipientEligibility({businessId:a.businessId,recipient:c.email,consent:permission,restriction:restriction.data(),contact:eligibilityContact,purpose:kind,now:now()});
   if(reason)fail('Email recipient is not eligible: '+reason);
  }else if(restriction.data()?.active||contact.data()?.suppressed)fail('Do not contact this recipient.');
  return {saved:s,customer:c,mailbox:m,contact:contact.data(),binding:{kind,customerId,policyDigest:s.digest,connectionGeneration:m.generation,
   consentDigest:permission?p.digest(permission):null,grantId:grant.id}};
 }
 async function check(a,draft,tx,{claimed=false}={}){
  const binding=draft?.assistance;if(!binding)return false;
  // The outbox itself may own the contact claim. Other channels remain blocked.
  const context=await resolve(a,binding.customerId,binding.kind,tx,{ownOperationId:claimed?draft.operationId:null});
  if(context.saved.digest!==binding.policyDigest||context.binding.consentDigest!==binding.consentDigest||context.customer.email!==draft.recipient||draft.from!==context.mailbox.email||draft.connectionGeneration!==context.mailbox.generation)
   fail('The approved policy, contact or mailbox changed.');
  if(context.binding.grantId!==binding.grantId)fail('The pilot grant changed.');
  if(binding.kind==='reply'&&!draft.followupTo)fail('Choose the actual inbound conversation to answer.');
  if(draft.automatic===true){
   const reason=p.dispatchEligibility({policy:{...context.saved.policy,...context.saved,expiresAt:context.saved.policy.expiresAt,timeZone:context.saved.policy.timeZone,sendingDays:context.saved.policy.sendingDays,opensMinute:context.saved.policy.opensMinute,closesMinute:context.saved.policy.closesMinute},expectedPolicyDigest:binding.policyDigest,
    mailbox:context.mailbox,operation:{...draft,policyDigest:binding.policyDigest,purpose:binding.kind},businessId:a.businessId,
    consent:context.customer.emailPermission,contact:claimed&&context.contact?.pendingOperationId===draft.operationId?{...context.contact,pendingOperationId:null}:context.contact,now:now()});
   if(reason)fail('Automatic dispatch held: '+reason);
   if(binding.kind==='reply')fail('Replies require exact owner approval.');
  }
  return context;
 }
 async function recordPermission(a,input){
  if(a.actorUid!==a.businessId||a.beta.canManageConnection!==true||!a.beta.leadAssistanceGrant)fail('The enrolled Business owner must record recipient permission.');
  if(!input||Object.keys(input).some(k=>!['customerId','expectedVersion','status','purposes','evidence','confirm'].includes(k))||input.confirm!==true||
   !['consented','requested','revoked'].includes(input.status)||!Array.isArray(input.purposes)||input.purposes.some(x=>!['introduction','followup'].includes(x))||
   typeof input.evidence!=='string'||input.evidence.trim().length<20||input.evidence.length>2000||!/^[A-Za-z0-9_-]{1,128}$/.test(input.customerId))fail('Record the actual recipient permission and its evidence. A public listing is not consent.');
  return db.runTransaction(async tx=>{
   const r=db.doc(`businessOperations/${a.businessId}/customers/${input.customerId}`),c=(await tx.get(r)).data();
   if(c?.businessId!==a.businessId||c.version!==input.expectedVersion||!c.email)fail('Reload the exact CRM contact.');
   const metaRef=db.doc('businessOperations/'+a.businessId),meta=(await tx.get(metaRef)).data();
   const audit=r.collection('permissionHistory').doc(String(c.version+1));
   const value={businessId:a.businessId,recipient:c.email,status:input.status,purposes:input.purposes,evidenceRef:audit.path,recordedBy:a.actorUid,recordedAt:now()};
   tx.create(audit,{...value,evidence:input.evidence.trim(),authority:'owner_recorded_recipient_permission'});
   tx.set(metaRef,{revision:(meta?.revision||0)+1,updatedAtMs:now()},{merge:true});
   tx.update(r,{emailPermission:value,version:c.version+1,updatedAtMs:now()});return {saved:true,status:value.status};
  });
 }
 return {resolve,check,recordPermission};
}
module.exports={createPilot};
