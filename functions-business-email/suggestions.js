'use strict';
const {digest}=require('./lead_assistance_policy');
function createSuggestions({db,now=Date.now,runInference,inboundContext,mayPrepare=()=>true}){
 return async(a,operationId)=>{
  const root=db.doc('businessMailboxes/'+a.businessId),opRef=root.collection('operations').doc(operationId);
  const policyRef=db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`);
  const read=async()=>{
   const [op,mail,saved,replies]=await Promise.all([opRef.get(),root.get(),policyRef.get(),root.collection('replies').where('operationId','==',operationId).limit(101).get()]);
   const s=saved.data(),m=mail.data(),o=op.data();
   if(a.actorUid!==a.businessId||!a.beta.canManageConnection||!['active','paused'].includes(s?.status)||s.revokedAt||s.policy.expiresAt<=now()||!s.policy.modelAssistance||!s.policy.modelDataConsent||
    m?.status!=='connected'||!m.permissions?.read||m.generation!==s.connectionGeneration||o?.businessId!==a.businessId||!['sent','received'].includes(o.state)||o.certification||!o.crmCustomerId||replies.size>100)throw Error('suggestion_authority_required');
   const rows=(await require('./shared/email_conversation_context').read({db,businessId:a.businessId,operationId})).rows;
   if(rows.some(r=>r.businessId!==a.businessId||r.from!==o.recipient))throw Error('suggestion_workspace_mismatch');
   const messages=rows.filter(r=>r.classification==='substantive').sort((x,y)=>x.receivedAt-y.receivedAt).slice(-10);
   if(!messages.length)throw Error('suggestion_inbound_required');
   return {op:o,policy:s,messages,inboundDigest:await inboundContext(a,operationId)};
  };
  const initial=await read(),requestId=digest([operationId,initial.inboundDigest,initial.policy.digest]),ref=root.collection('replySuggestions').doc(requestId);
  const old=await ref.get();if(old.exists)return {id:ref.id,...old.data()};
  if(!mayPrepare())return {state:'awaiting_next_preparation',manualReplyAvailable:true};
  if(!runInference)return {state:'model_processing_not_enabled',manualReplyAvailable:true};
  const recheck=async()=>{const fresh=await read();if(fresh.inboundDigest!==initial.inboundDigest||fresh.policy.digest!==initial.policy.digest)throw Error('suggestion_context_changed');};
  const claimed=await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists)return false;tx.create(ref,{businessId:a.businessId,operationId,createdAt:now(),state:'processing',sent:false});return true;});
  if(!claimed)return {id:ref.id,...(await ref.get()).data()};
  let result;
  try{result=await runInference({a,requestId,recheck,context:{businessId:a.businessId,name:initial.policy.policy.businessName,
   services:initial.policy.policy.services,voice:initial.policy.policy.voice,claims:initial.policy.policy.claims,destinations:initial.policy.policy.destinations},
   conversation:{businessId:a.businessId,messages:[...(initial.op.state==='sent'?[{direction:'outbound',subject:initial.op.subject,body:initial.op.body}]:[]),...initial.messages.map(m=>({direction:'inbound',subject:m.subject,body:m.body}))]}});}catch(_){result={state:'model_processing_held'};}
  const saved={businessId:a.businessId,operationId,customerId:initial.op.crmCustomerId,recipient:initial.op.recipient,inboundDigest:initial.inboundDigest,policyDigest:initial.policy.digest,
   createdAt:now(),state:result.state,reservationId:result.reservationId||null,...(result.suggestion?{suggestion:result.suggestion}:{}),sent:false};
  try{await recheck();}catch(_){saved.state='stale';}
  await ref.set(saved);return {id:ref.id,...saved};
 };
}
module.exports={createSuggestions};
