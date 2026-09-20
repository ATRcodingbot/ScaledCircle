'use strict';
// A scoped extension of the maintained lead-generator permission record. It
// does not grant a product, release the send hold, or write mailbox credentials.
const p=require('./lead_assistance_policy');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const keys=['autonomyMode','replyMode','timeZone','expiresAt','audiences','services','voice','claims','destinations','limits',
 'sendingDays','opensMinute','closesMinute','modelAssistance','modelDataConsent','bookingEnabled','availabilityRevision',
 'schedulingRules','introductionsEnabled','followupsEnabled','notifications'];
function cleanPolicy(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||JSON.stringify(value).length>12000)
  fail('invalid-argument','Review the supported assistance settings.');
 for(const k of ['services','claims','destinations','audiences'])if(!Array.isArray(value[k])||value[k].length>40||
   value[k].some(s=>typeof s!=='string'||!s.trim()||s.length>500))fail('invalid-argument','Enter the Business content boundaries.');
 if(typeof value.voice!=='string'||!value.voice.trim()||value.voice.length>500)fail('invalid-argument','Enter the Business voice.');
 if(value.destinations.some(s=>{try{return new URL(s).protocol!=='https:';}catch(_){return true;}}))fail('invalid-argument','Use valid secure destinations.');
 for(const k of ['modelAssistance','modelDataConsent','bookingEnabled','introductionsEnabled','followupsEnabled'])
  if(typeof value[k]!=='boolean')fail('invalid-argument','Review each assistance capability.');
 return JSON.parse(JSON.stringify(value));
}
function createAssistanceAuthority({db,now=Date.now}){
 const ref=a=>db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`);
 const owner=a=>{if(a.beta.canManageConnection!==true||a.actorUid!==a.businessId)fail('permission-denied','The Business owner must manage email assistance.');};
 async function state(a,tx,policy){
  const read=r=>tx?tx.get(r):r.get();
  const [mail,privateCredential,saved]=await Promise.all([read(db.doc('businessMailboxes/'+a.businessId)),
   read(db.doc(`businessMailboxes/${a.businessId}/private/credential`)),read(ref(a))]);
  const mailbox=mail.data(),grant=a.beta.leadAssistanceGrant;
  // Budget is a server-authoritative prerequisite, not a value supplied by the
  // browser. Until the separately authorized inference integration is complete,
  // no budget is projected and model-assisted activation fails closed.
  const selected=policy||saved.data()?.policy;
  const blockers=p.policyPreflight({businessId:a.businessId,actorUid:a.actorUid,isOwner:a.beta.canManageConnection===true,
   mailbox,grant,policy:selected,budget:null,now:now()});
  if(!privateCredential.exists||privateCredential.data().generation!==mailbox?.generation)blockers.push('mailbox_credentials_unavailable');
  if(a.beta.sendEnabled!==true||a.beta.certificationOnly!==false)blockers.push('ordinary_send_authority_required');
  // Deliberately not a configurable true flag: the end-to-end execution
  // integration is unfinished, so persisting this source cannot enable sends.
  blockers.push('assistance_execution_integration_pending');
  return {saved:saved.data()||null,mailbox,grant,blockers:[...new Set(blockers)]};
 }
 async function load(a){
  const s=await state(a,null);
  return {policy:s.saved||null,canManage:a.beta.canManageConnection===true&&a.actorUid===a.businessId,
   sender:s.mailbox?.email||null,blockers:s.blockers,automaticSending:false};
 }
 async function mutate(a,input){
  owner(a);
  if(!input||Object.keys(input).some(k=>!['action','expectedVersion','requestId','policy','confirm'].includes(k))||
    !['prepare','activate','pause','revoke','resume'].includes(input.action)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))fail('invalid-argument','Review the assistance action.');
  const action=input.action;
  if(action!=='prepare'&&input.confirm!==true)fail('failed-precondition','Confirm the exact assistance action.');
  if(!['prepare','activate'].includes(action)&&input.policy)fail('invalid-argument','Change preferences before confirming a new policy.');
  const policy=['prepare','activate'].includes(action)?cleanPolicy(input.policy):null;
  return db.runTransaction(async tx=>{
   const s=await state(a,tx,policy),old=s.saved;
   const event=ref(a).collection('audit').doc(input.requestId),prior=await tx.get(event);
   const fingerprint=p.digest({actor:a.actorUid,business:a.businessId,input});
   if(prior.exists){if(prior.data().fingerprint!==fingerprint)fail('already-exists','This action identifier was already used.');return {...prior.data().result,reused:true};}
   if((old?.version||0)!==input.expectedVersion)fail('aborted','Email settings changed. Reload the saved assistance policy.');
   if(['activate','resume'].includes(action)&&s.blockers.length)fail('failed-precondition','Email assistance cannot activate: '+s.blockers.join(', '));
   if(['pause','revoke','resume'].includes(action)&&!old)fail('failed-precondition','No saved email assistance policy exists.');
   if(action==='resume'&&old.status==='revoked')fail('failed-precondition','Review and authorize a new policy after revocation.');
   const version=(old?.version||0)+1,status=action==='prepare'?'prepared':action==='pause'?'paused':action==='revoke'?'revoked':'active';
   const saved={businessId:a.businessId,agentType:'lead_generator',capability:'business_email',version,status,
    policy:policy||old.policy,updatedBy:a.actorUid,updatedAt:now(),sender:s.mailbox?.email||null,
    connectionGeneration:s.mailbox?.generation||null,grantId:s.grant?.id||null,
    ...(old?.approvedBy?{approvedBy:old.approvedBy,approvedAt:old.approvedAt}:{}),
    ...(['activate','resume'].includes(action)?{approvedBy:a.actorUid,approvedAt:now()}:{}),
    ...(status==='revoked'?{revokedAt:now()}: {})};
   saved.digest=p.digest(saved);
   const result={saved:true,version,status,automaticSending:false,blockers:s.blockers};
   tx.set(ref(a),saved);
   tx.create(event,{businessId:a.businessId,actorUid:a.actorUid,action,at:now(),fingerprint,policySnapshot:saved,result});
   return result;
  });
 }
 return {load,mutate};
}
module.exports={createAssistanceAuthority,cleanPolicy};
