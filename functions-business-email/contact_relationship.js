'use strict';
// Shared identity is the Business OS customer, not a new mailbox-only customer.
// Every outbound channel must claim this same contact authority before it sends.
const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
async function reserve({db,tx,businessId,opId,recipient,name,relationshipType,source,replyTo,campaignId,objective,now}){
  const root=db.doc('businessOperations/'+businessId),meta=await tx.get(root);
  const matches=await tx.get(root.collection('customers').where('email','==',recipient).limit(3));
  if(matches.size>1)fail('Multiple CRM contacts match this address. Resolve the identity before contacting them.');
  const customer=matches.docs[0],customerId=customer?.id||'email_'+hash(recipient);
  const contact=root.collection('contactAuthority').doc(hash(recipient)),previous=(await tx.get(contact)).data();
  if(previous?.suppressed===true||customer?.data()?.doNotContact===true)fail('Do not contact this CRM relationship.');
  if(previous?.pendingOperationId&&previous.pendingOperationId!==opId)fail('Another channel has a pending contact operation. Reconcile it first.');
  const replied=replyTo?(await tx.get(db.doc('businessMailboxes/'+businessId+'/operations/'+replyTo))).data():null;
  const answering=replied?.businessId===businessId&&replied.recipient===recipient&&replied.state==='sent'&&replied.replyCount>0;
  if(previous?.lastOperationId!==opId&&previous?.cooldownUntil>now&&!answering)fail('This contact is in a cooldown after earlier outreach. Review the shared conversation before sending again.');
  return {customerId,apply(){
    if(!customer)tx.create(root.collection('customers').doc(customerId),{businessId,name:name||recipient,company:'',phone:'',email:recipient,location:'',source:'Business-reviewed inquiry',
      stage:'new_lead',relationshipType:relationshipType||'prospect',notes:'',assignedPeople:[],version:1,createdAtMs:now,updatedAtMs:now,
      sourceRef:{kind:'reviewed_email_source',provenance:source||null},emailOperationIds:[]});
    if(campaignId)tx.set(root.collection('customers').doc(customerId),{campaignMembership:{...(customer?.data()?.campaignMembership||{}),[campaignId]:{objective:objective||null,operationId:opId,approvedAt:now}}},{merge:true});
    tx.set(root,{businessId,revision:(meta.data()?.revision||0)+1,updatedAtMs:now},{merge:true});
    tx.set(contact,{businessId,customerId,recipient,pendingOperationId:opId,lastClaimedAt:now},{merge:true});
  }};
}
async function sent({db,tx,businessId,opId,op,now}){
  if(!op.crmCustomerId)return ()=>{};
  const root=db.doc('businessOperations/'+businessId),contact=root.collection('contactAuthority').doc(hash(op.recipient)),customer=root.collection('customers').doc(op.crmCustomerId);
  const [c,person,meta]=await Promise.all([tx.get(contact),tx.get(customer),tx.get(root)]);
  if(c.data()?.pendingOperationId!==opId||!person.exists||person.data().email!==op.recipient)fail('The shared CRM identity needs reconciliation.');
  const ids=[...new Set([...(person.data().emailOperationIds||[]),opId])];if(ids.length>50)fail('The contact conversation inventory needs review.');
  return ()=>{
    // Preserve the actual lifecycle stage. A send is an event, not an estimate,
    // appointment, customer win or proof of revenue.
    tx.update(customer,{emailOperationIds:ids,lastOutboundAt:now,version:(person.data().version||0)+1,updatedAtMs:now});
    tx.set(root,{revision:(meta.data()?.revision||0)+1,updatedAtMs:now},{merge:true});
    tx.set(contact,{pendingOperationId:null,lastOperationId:opId,lastOutboundAt:now,cooldownUntil:now+5*86400000},{merge:true});
    // The maintained Business OS timeline projects these exact operation IDs.
    // Do not also create a second "sent" timeline row for the same event.
  };
}
// Only release a claim when the provider has definitively not been called.
// Ambiguous sending operations must keep their lease for reconciliation.
async function suppressUnsent({db,ref,businessId,reason,now}){
  await db.runTransaction(async tx=>{
    const op=(await tx.get(ref)).data();if(op?.state!=='sending')return;
    const contact=db.doc('businessOperations/'+businessId+'/contactAuthority/'+hash(op.recipient));
    const held=(await tx.get(contact)).data();
    tx.update(ref,{state:'suppressed',suppressionReason:reason,lastCheckedAt:now,providerAttempted:false});
    if(held?.pendingOperationId===ref.id)tx.update(contact,{pendingOperationId:null});
  });
}
module.exports={reserve,sent,suppressUnsent};
