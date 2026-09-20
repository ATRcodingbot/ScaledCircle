'use strict';
const m=require('./model');
function settings(value){
 m.strict(value,['timeZone','days','opensMinute','closesMinute','durationMinutes','bufferMinutes','assignedPeople','locationRequired']);
 try{if(!value.timeZone?.includes('/'))throw Error();new Intl.DateTimeFormat('en-US',{timeZone:value.timeZone}).format(0);}catch(_){m.fail('invalid-argument','Choose your scheduling time zone.');}
 if(!Array.isArray(value.days)||!value.days.length||value.days.length>7||value.days.some(d=>!Number.isInteger(d)||d<1||d>7)||
  !Number.isInteger(value.opensMinute)||!Number.isInteger(value.closesMinute)||value.opensMinute<0||value.closesMinute>1440||value.opensMinute>=value.closesMinute||
  !Number.isInteger(value.durationMinutes)||value.durationMinutes<5||value.durationMinutes>480||!Number.isInteger(value.bufferMinutes)||value.bufferMinutes<0||value.bufferMinutes>120||
  typeof value.locationRequired!=='boolean')m.fail('invalid-argument','Complete working hours, duration and buffers.');
 const assignedPeople=m.people(value.assignedPeople);if(!assignedPeople.length)m.fail('invalid-argument','Choose the people available for appointments.');
 return {...value,assignedPeople,days:[...new Set(value.days)].sort()};
}
function checkSlot(item,availability,now){
 if(!availability)m.fail('failed-precondition','Set your scheduling hours and time zone before offering appointments.');
 const s=settings(availability.settings);
 if(item.startMs<=now||item.timeZone!==s.timeZone||item.durationMinutes!==s.durationMinutes||
  !item.assignedPeople.length||item.assignedPeople.some(p=>!s.assignedPeople.includes(p))||s.locationRequired&&!item.location?.trim())
  m.fail('failed-precondition','The appointment is outside your approved availability or needs location details.');
 const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:s.timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t).map(x=>[x.type,x.value]));
 const from=parts(item.startMs-s.bufferMinutes*60000),to=parts(item.endMs+s.bufferMinutes*60000);
 const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(from.weekday)+1;
 const minute=p=>Number(p.hour)*60+Number(p.minute);
 if(!s.days.includes(day)||['year','month','day'].some(k=>from[k]!==to[k])||minute(from)<s.opensMinute||minute(to)>s.closesMinute)
  m.fail('failed-precondition','Choose an appointment within your working hours, including its buffer.');
 return {...item,startMs:item.startMs-s.bufferMinutes*60000,endMs:item.endMs+s.bufferMinutes*60000};
}
function inboundDigest(rows){return m.hash(rows.sort((a,b)=>a.id.localeCompare(b.id)).map(r=>[r.id,r.providerMessageId,r.receivedAt,r.body,r.classification||'substantive']));}
async function binding({db,tx,businessId,input,item,current,availability,now,automaticAcceptance=null}){
 m.strict(input,['operationId','inboundDigest','availabilityVersion','acceptanceReplyId','ownerConfirmsAcceptance','authorizeAcceptedSlot']);
 const operationId=m.id(input.operationId),[opDoc,mail,replies]=await Promise.all([
  tx.get(db.doc(`businessMailboxes/${businessId}/operations/${operationId}`)),tx.get(db.doc('businessMailboxes/'+businessId)),
  tx.get(db.collection(`businessMailboxes/${businessId}/replies`).where('operationId','==',operationId).limit(101))]);
 const op=opDoc.data();
 if(mail.data()?.status!=='connected'||mail.data()?.permissions?.read!==true||op?.businessId!==businessId||!['sent','received'].includes(op.state)||op.crmCustomerId!==item.customerId)
  m.fail('permission-denied','Choose this customer’s connected Business conversation.');
 if(replies.size>100)m.fail('failed-precondition','This conversation needs a bounded review.');
 const rows=(await require('../shared/email_conversation_context').read({db,businessId,operationId,tx})).rows;
 if(rows.some(r=>r.businessId!==businessId)||inboundDigest(rows)!==input.inboundDigest)m.fail('aborted','The conversation changed. Review the latest reply.');
 if(availability?.version!==input.availabilityVersion)m.fail('aborted','Availability changed. Check the offered time again.');
 if(current?.emailLink&&current.emailLink.operationId!==operationId)m.fail('failed-precondition','Keep this appointment linked to its original conversation.');
 const policy=(await tx.get(db.doc(`agentPermissions/${businessId}_lead_generator/authorizations/business_email`))).data();
 const bounded=policy?.businessId===businessId&&policy.status==='active'&&!policy.revokedAt&&policy.policy.expiresAt>now&&policy.policy.bookingEnabled===true&&policy.policy.availabilityRevision===availability?.version&&policy.connectionGeneration===mail.data()?.generation;
 if(input.authorizeAcceptedSlot===true&&!bounded)m.fail('failed-precondition','Authorize bounded booking against the current Schedule availability first.');
 if(item.status==='scheduled'){
  const reply=rows.find(r=>r.id===input.acceptanceReplyId);
  const exact=automaticAcceptance&&bounded&&current?.status==='tentative'&&current.emailLink?.acceptanceCode===automaticAcceptance.code&&current.version===automaticAcceptance.version&&reply?.body?.trim()===`Please book ${automaticAcceptance.code}`&&rows.filter(r=>r.classification==='substantive').sort((a,b)=>b.receivedAt-a.receivedAt)[0]?.id===reply?.id;
  if((input.ownerConfirmsAcceptance!==true&&!exact)||!reply||reply.classification&&reply.classification!=='substantive'||reply.from!==op.recipient)
   m.fail('failed-precondition','Review the customer’s acceptance of this exact time before confirming.');
 }
 const expanded=checkSlot(item,availability,now);
 return {expanded,link:{operationId,recipient:op.recipient,inboundDigest:input.inboundDigest,availabilityVersion:availability.version,
  acceptanceReplyId:item.status==='scheduled'?input.acceptanceReplyId:null,bufferMinutes:availability.settings.bufferMinutes,confirmationEmailState:'not_requested',
  ...(input.authorizeAcceptedSlot===true?{acceptanceCode:m.hash([businessId,operationId,item.startMs,item.assignedPeople,availability.version,now]).slice(0,16)}:{}),
  approvalSource:item.status==='scheduled'?(automaticAcceptance?'owner_authorized_exact_slot_acceptance':'owner_reviewed_customer_acceptance'):'owner_offered_tentative_slot'}};
}
module.exports={settings,checkSlot,binding,inboundDigest};
