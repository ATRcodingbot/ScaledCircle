'use strict';
const coverage=require('./mailbox_coverage');
const {digest,classifyInbound}=require('./lead_assistance_policy');
const address=v=>{const m=String(v||'').trim().match(/^(?:[^<>@\r\n]*<([^<>\s,]+@[^<>\s,]+)>|([^<>\s,]+@[^<>\s,]+))$/);return (m?.[1]||m?.[2]||'').toLowerCase();};
const body=p=>p?.mimeType==='text/plain'&&p.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):(p?.parts||[]).filter(x=>!x.filename).map(body).join('\n');
function messages(thread,mailbox,since){
 if(!Array.isArray(thread.messages)||thread.messages.length>50)throw Error('inquiry_thread_limit');
 return thread.messages.flatMap(m=>{
  const headers=Object.fromEntries((m.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
  const from=address(headers.from),to=address(headers.to),receivedAt=Number(m.internalDate),text=body(m.payload);
  if(!from||from===mailbox||to!==mailbox||!Number.isSafeInteger(receivedAt)||receivedAt<since||m.threadId!==thread.id||m.labelIds?.some(x=>['SPAM','TRASH','SENT','DRAFT'].includes(x)))return [];
  return [{providerMessageId:m.id,providerThreadId:thread.id,from,to,receivedAt,subject:String(headers.subject||'').slice(0,250),body:text.slice(0,8000),
   classification:classifyInbound({headers,from,subject:headers.subject,body:text}),inReplyTo:headers['in-reply-to']||null}];
 });
}
function createInquiries({db,now=Date.now,current,adapter,credentialAccess,alerts,onInbound}){
 return async a=>{
  const policy=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`).get()).data();
  // Pausing stops new inquiry discovery. Linked reply monitoring is a separate
  // maintained path; neither pause nor revocation deletes saved history.
  if(policy?.businessId!==a.businessId||policy?.status!=='active'||policy.revokedAt||policy.policy.expiresAt<=now()||!policy.policy.newInquiriesEnabled)return {state:'not_enabled'};
  if(policy.grantId){const grant=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email_pilot_grant`).get()).data();if(grant?.id!==policy.grantId||grant.businessId!==a.businessId||grant.status!=='active'||grant.revokedAt||grant.expiresAt<=now())return {state:'pilot_access_inactive'};}
  const mode=coverage.mode(policy.policy);if(mode==='conversations')return {state:'not_enabled'};
  const invalid=coverage.validate(policy.policy);if(invalid)return {state:invalid};
  const {c,secret}=await current(a);if(c.provider!=='google'||!c.permissions?.read||c.generation!==policy.connectionGeneration)return {state:'mailbox_changed'};
  const root=db.doc('businessMailboxes/'+a.businessId),state=root.collection('private').doc('inquirySync');
  const lease=require('node:crypto').randomUUID();
  const prior=await db.runTransaction(async tx=>{const s=(await tx.get(state)).data()||{};if(s.leaseUntil>now())return null;tx.set(state,{lease,leaseUntil:now()+150000},{merge:true});return s;});
  if(!prior)return {state:'processing'};
  const boundary=policy.intakeStartsAt||policy.approvedAt;
  if(!Number.isSafeInteger(boundary)||boundary<=0){await state.set({lease:null,leaseUntil:0,state:'authorization_start_missing'},{merge:true});return {state:'authorization_start_missing'};}
  const binding=digest([mode,policy.policy.inquiryLabel||null,boundary,c.generation]);
  const same=prior.coverageBinding===binding;
  let cursor=same?prior.cursor:null,result='checked',unclassified=0,considered=0;
  const from=same?Math.max(boundary,prior.from||boundary):boundary,through=same&&prior.through?prior.through:now();
  let complete=false;
  try{
   const provider=adapter(a,'google'),access=credentialAccess(a,c,secret);
   // Never import pre-authorization history. Gmail's seconds boundary is
   // narrowed again against exact milliseconds for every returned message.
   const page=await provider.history(access.credentials,{q:coverage.query(policy.policy,from,through),pageToken:cursor||undefined,maxResults:3});
   for(const entry of page.threads||[]){
    const latestPolicy=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`).get()).data(), latestMailbox=(await root.get()).data();
    if(latestPolicy?.status!=='active'||latestPolicy.digest!==policy.digest||latestPolicy.revokedAt||latestMailbox?.status!=='connected'||latestMailbox.generation!==c.generation||!latestMailbox.permissions?.read)throw Error('inquiry_authority_changed');
    if(mode==='inbox'&&provider.threadMetadata){const metadata=await provider.threadMetadata(access.credentials,entry.id);const candidates=messages(metadata,c.email,from).filter(m=>m.receivedAt<through);if(!candidates.some(m=>['inquiry','unclassified','opt_out'].includes(coverage.screen(m,policy.policy.services)))){considered+=candidates.length;continue;}}
    const thread=await provider.thread(access.credentials,entry.id),rows=messages(thread,c.email,from).filter(m=>m.receivedAt<through&&(mode!=='inbox'||thread.messages.find(x=>x.id===m.providerMessageId)?.labelIds?.includes('INBOX')));
    considered+=rows.length;
    if(mode==='inbox') {for(const m of rows){if(m.classification==='substantive'){const classification=coverage.screen(m,policy.policy.services);if(classification==='unclassified')unclassified++;if(classification!=='inquiry')m.classification=classification;}}}
    // Honor opt-outs even if the selected thread contains no new inquiry.
    // This does not create a CRM lead or classify the sender as interested.
    const optouts=rows.filter(m=>m.classification==='opt_out');
    if(optouts.length)await db.runTransaction(async tx=>{
     const [latest,auth]=await Promise.all([tx.get(root),tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`))]);
     if(latest.data()?.generation!==c.generation||latest.data()?.status!=='connected'||!latest.data()?.permissions?.read||auth.data()?.digest!==policy.digest||auth.data()?.status!=='active'||auth.data()?.revokedAt||auth.data()?.policy?.expiresAt<=now())throw Error('inquiry_authority_changed');
     for(const m of optouts)tx.set(root.collection('suppression').doc(digest(m.from)),{businessId:a.businessId,recipient:m.from,active:true,reason:'unsubscribed',source:'matched_provider_inquiry',providerMessageId:m.providerMessageId,updatedAt:now()},{merge:true});
    });
    const useful=rows.filter(m=>m.classification==='substantive'&&m.body.trim());if(!useful.length)continue;
    const senders=[...new Set(useful.map(m=>m.from))];if(senders.length!==1)continue;
    const operationId='inquiry_'+digest([c.generation,thread.id]),opRef=root.collection('operations').doc(operationId);
    const changed=await db.runTransaction(async tx=>{
     const [saved,latest,auth,existingSent]=await Promise.all([tx.get(opRef),tx.get(root),tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`)),tx.get(root.collection('operations').where('providerThreadId','==',thread.id).limit(2))]);
     if(existingSent.docs.some(d=>d.id!==operationId))return false;
     if(latest.data()?.generation!==c.generation||latest.data()?.status!=='connected'||!latest.data()?.permissions?.read||auth.data()?.digest!==policy.digest||auth.data()?.status!=='active'||auth.data()?.revokedAt||auth.data()?.policy?.expiresAt<=now())throw Error('inquiry_authority_changed');
     const ops=db.doc('businessOperations/'+a.businessId),meta=(await tx.get(ops)).data();
     const matches=await tx.get(ops.collection('customers').where('email','==',senders[0]).limit(2));if(matches.size>1)throw Error('inquiry_identity_ambiguous');
     const customer=matches.docs[0],customerId=customer?.id||'email_'+digest(senders[0]);
     const old=await Promise.all(rows.map(m=>tx.get(root.collection('replies').doc(m.providerMessageId))));
     if(old.some(d=>d.exists&&d.data().operationId!==operationId))throw Error('inquiry_identity_ambiguous');
     const fresh=rows.filter((m,i)=>!old[i].exists&&['substantive','opt_out'].includes(m.classification)),substantive=fresh.filter(m=>m.classification==='substantive');if(!fresh.length)return false;
     const receivedAt=Math.max(...useful.map(m=>m.receivedAt));
     if(!saved.exists)tx.create(opRef,{businessId:a.businessId,operationId,prospectId:'crm_'+customerId,crmCustomerId:customerId,state:'received',
      provider:'google',providerThreadId:thread.id,providerMessageId:useful[0].providerMessageId,connectionGeneration:c.generation,from:c.email,recipient:senders[0],
      subject:useful[0].subject,body:'',requestedAt:policy.approvedAt,receivedAt,certification:false,replyCount:substantive.length,source:mode==='inbox'?'authorized_inbox_inquiry':'authorized_inquiry_label',lastCheckedAt:now()});
     else tx.update(opRef,{replyCount:(saved.data().replyCount||0)+substantive.length,lastCheckedAt:now(),receivedAt});
     for(const m of fresh)tx.create(root.collection('replies').doc(m.providerMessageId),{...m,businessId:a.businessId,operationId,prospectId:'crm_'+customerId,certification:false,conversationId:digest([a.businessId,operationId]),state:'replied'});
     if(!customer)tx.create(ops.collection('customers').doc(customerId),{businessId:a.businessId,name:senders[0],email:senders[0],phone:'',company:'',location:'',stage:'new_lead',relationshipType:'inquiry',notes:'',assignedPeople:[],version:1,createdAtMs:now(),updatedAtMs:now(),lastInboundAt:receivedAt,emailOperationIds:[operationId],source:'Authorized new email inquiry'});
     else if(substantive.length)tx.update(customer.ref,{lastInboundAt:receivedAt,awaitingReply:false,version:(customer.data().version||0)+1,updatedAtMs:now(),emailOperationIds:[...new Set([...(customer.data().emailOperationIds||[]),operationId])].slice(-50)});
     tx.set(ops,{businessId:a.businessId,revision:(meta?.revision||0)+1,updatedAtMs:now()},{merge:true});
     tx.set(ops.collection('contactAuthority').doc(digest(senders[0])),{businessId:a.businessId,customerId,recipient:senders[0],lastInboundAt:receivedAt,awaitingReply:false,genericFollowupBlocked:true},{merge:true});
     for(const m of fresh.filter(m=>m.classification==='opt_out'))tx.set(root.collection('suppression').doc(digest(m.from)),{businessId:a.businessId,recipient:m.from,active:true,reason:'unsubscribed',source:'matched_provider_inquiry',providerMessageId:m.providerMessageId,updatedAt:now()},{merge:true});
     return true;
    });
    if(changed){await alerts.enqueue(a.businessId,operationId);if(onInbound){try{await onInbound(a,operationId);}catch(_){/* Model limits never block saved inbound. */}}}
   }
   cursor=page.nextPageToken||null;complete=!cursor;return {state:result,considered,unclassified,coverage:mode};
  }catch(_){result='needs_review';return {state:result};}
  finally{await db.runTransaction(async tx=>{if((await tx.get(state)).data()?.lease===lease)tx.update(state,{lease:null,leaseUntil:0,cursor:cursor||null,policyDigest:policy.digest,coverageBinding:binding,from:complete?boundary:from,through:complete?null:through,considered,unclassified,coverage:mode,lastVisitedAt:now(),state:result});});}
 };
}
module.exports={createInquiries,messages};
