'use strict';
// Owner-designated provider evidence, not a sender allowlist or message-text command.
const {digest}=require('./lead_assistance_policy');
const fail=message=>{const e=Error(message);e.code='failed-precondition';throw e;};
const designationId=(generation,messageId)=>digest([generation,messageId]);
function matches(d,{businessId,mailbox,generation,messageId,threadId}) {
 return d?.controlledTest===true&&d.businessId===businessId&&d.mailbox===mailbox&&d.connectionGeneration===generation&&d.providerMessageId===messageId&&d.providerThreadId===threadId;
}
function create({db,now=Date.now}) {
 async function designate(a,input,evidence) {
  if(a.actorUid!==a.businessId||a.beta.canManageConnection!==true){const e=Error('The workspace owner must designate controlled traffic.');e.code='permission-denied';throw e;}
  if(!input.reason?.trim()||input.reason.length>1000||input.confirm!==true)fail('Confirm the exact controlled message and reason.');
  const {mailbox,generation,messageId,threadId,receivedAt}=evidence;
  const root=db.doc('businessMailboxes/'+a.businessId),key=designationId(generation,messageId),ref=root.collection('controlledTests').doc(key);
  return db.runTransaction(async tx=>{
   const connection=(await tx.get(root)).data(),prior=(await tx.get(ref)).data();
   if(connection?.status!=='connected'||connection.email!==mailbox||connection.generation!==generation)fail('The connected mailbox changed.');
   const binding={businessId:a.businessId,mailbox,generation,messageId,threadId};
   if(prior&&!matches(prior,binding))fail('The saved test designation does not match.');
   const ops=await tx.get(root.collection('operations').where('providerThreadId','==',threadId).limit(101));
   if(ops.size>100)fail('Conversation history needs bounded review.');
   const targets=ops.docs.filter(d=>d.data().providerMessageId===messageId&&d.data().connectionGeneration===generation&&d.data().from===mailbox);
   const updates=[];
   for(const op of targets){
    const replies=await tx.get(root.collection('replies').where('operationId','==',op.id).limit(101));
    const outcomes=await tx.get(root.collection('outcomes').where('operationId','==',op.id).limit(101));
    if(replies.size>100||outcomes.size>100)fail('Conversation history needs bounded review.');
    let customer=null,other=[];
    if(op.data().crmCustomerId){customer=await tx.get(db.doc(`businessOperations/${a.businessId}/customers/${op.data().crmCustomerId}`));
     const linked=customer.data()?.emailOperationIds||[];if(linked.length>50)fail('Contact history needs bounded review.');
     other=await Promise.all(linked.filter(id=>id!==op.id).map(id=>tx.get(root.collection('operations').doc(id))));}
    updates.push({op,replies,outcomes,customer,other});
   }
   if(!prior)tx.create(ref,{controlledTest:true,businessId:a.businessId,mailbox,connectionGeneration:generation,provider:'google',providerMessageId:messageId,providerThreadId:threadId,receivedAt,reason:input.reason.trim(),actorUid:a.actorUid,recordedAt:now(),source:'authenticated_owner_exact_message',ownerAlertAllowed:true});
   for(const {op,replies,outcomes,customer,other} of updates){
    tx.update(op.ref,{controlledTest:true,controlledTestDesignation:key});
    for(const r of replies.docs)if(r.data().providerMessageId===messageId)tx.update(r.ref,{controlledTest:true,controlledTestDesignation:key});
    for(const o of outcomes.docs)tx.update(o.ref,{controlledTest:true,controlledTestDesignation:key});
    if(customer?.exists&&customer.data().source==='Authorized new email inquiry')tx.update(customer.ref,{controlledTest:other.every(x=>x.exists&&x.data().controlledTest===true),controlledTestOperationIds:[...new Set([...(customer.data().controlledTestOperationIds||[]),op.id])]});
    tx.set(root.collection('crm').doc(op.data().prospectId),{businessId:a.businessId,operationId:op.id,controlledTest:true,controlledTestDesignation:key},{merge:true});
   }
   return {saved:true,designationId:key,correctedOperations:targets.map(d=>d.id),duplicate:!!prior};
  });
 }
 return {designate};
}
module.exports={create,designationId,matches};
