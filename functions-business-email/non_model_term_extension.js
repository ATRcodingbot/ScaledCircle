'use strict';
// One explicitly authorized extension of the existing enrollment and policy.
// The model grant, original start times and all capability choices are untouched.
const {WORKSPACES,TERM}=require('./inference_budget');
const {GRANT}=require('./pilot_enrollment');
const {digest}=require('./lead_assistance_policy');
const REFERENCE='Founder exact non-model Email term extension, 2026-09-23; no additional spending or automatic renewal';
const ENDINGS=[Date.parse('2026-09-28T11:33:16.002Z'),Date.parse('2026-09-28T11:32:01.242Z')];
const EVENT='founder_non_model_extension_20260923';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function create({db,now=Date.now,workspaces=WORKSPACES}){
 async function apply(a,input){
  if(a.businessId!==workspaces[0]||a.actorUid!==workspaces[0]||a.beta.kind!=='internal'||a.beta.canManageConnection!==true)fail('permission-denied','Use the authenticated production ScaledCircle enrollment administrator.');
  if(input?.confirm!==true||Object.keys(input).some(k=>!['confirm','expected'].includes(k))||!Array.isArray(input.expected)||input.expected.length!==2||input.expected.some((v,i)=>v.businessId!==workspaces[i]||!Number.isInteger(v.version)||typeof v.digest!=='string'||Object.keys(v).some(k=>!['businessId','version','digest'].includes(k))))fail('invalid-argument','Review both exact saved policies before extending their terms.');
  const fingerprint=digest(input),grantRef=db.doc('emailAssistanceOperatingGrants/'+GRANT),eventRef=grantRef.collection('audit').doc(EVENT);
  return db.runTransaction(async tx=>{
   const previous=await tx.get(eventRef);
   if(previous.exists){if(previous.data().fingerprint!==fingerprint)fail('already-exists','This exact extension has already been applied.');return {...previous.data().result,reused:true};}
   const shared=(await tx.get(grantRef)).data();
   if(shared?.status!=='prepared'||shared.startsAt||shared.expiresAt||shared.revokedAt||shared.businessIds?.length!==2||workspaces.some(b=>!shared.businessIds.includes(b)))fail('failed-precondition','The inference grant changed. This action cannot activate, restart or extend it.');
   const rows=[];
   for(const [i,businessId] of workspaces.entries()){
    const root=`agentPermissions/${businessId}_lead_generator/authorizations/`,policyRef=db.doc(root+'business_email'),accessRef=db.doc(root+'business_email_pilot_grant');
    const [ps,gs,ms]=await Promise.all([tx.get(policyRef),tx.get(accessRef),tx.get(db.doc('businessMailboxes/'+businessId))]);
    const p=ps.data(),g=gs.data(),m=ms.data(),expected=input.expected[i];
    if(p?.version!==expected.version||p?.digest!==expected.digest)fail('aborted','A saved owner policy changed. Reload it; nothing was renewed.');
    if(p.businessId!==businessId||p.approvedBy!==businessId||!['active','paused'].includes(p.status)||p.revokedAt||p.modelAuthorizationPending!==true||p.policy.followupsEnabled!==false||p.policy.expiresAt!==ENDINGS[i]||p.policy.expiresAt<=now()||p.policy.limits?.initialPerDay!==[10,20][i]||p.policy.ownerStopLocal)fail('failed-precondition','The reviewed non-model authorization or exact approved term changed.');
    if(g?.id!==GRANT||g.businessId!==businessId||g.product!=='lead_email_assistance_pilot'||g.status!=='active'||g.revokedAt||g.expiresAt!==ENDINGS[i]||p.grantId!==GRANT||m?.status!=='connected'||m.email!==p.sender||m.email!==g.mailbox||m.generation!==p.connectionGeneration)fail('failed-precondition','The scoped enrollment or owned mailbox changed.');
    rows.push({businessId,p,g,policyRef,accessRef,endsAt:ENDINGS[i]+TERM});
   }
   const at=now(),result={applied:true,inferenceActivated:false,additionalSpending:0,policies:rows.map(r=>({businessId:r.businessId,version:r.p.version+1,status:r.p.status,expiresAt:r.endsAt}))};
   for(const r of rows){
    const next={...r.p,policy:{...r.p.policy,expiresAt:r.endsAt},version:r.p.version+1,configurationRevision:(r.p.configurationRevision||r.p.version)+1,updatedAt:at,updatedBy:a.actorUid};
    next.digest=digest({...next,digest:null});
    const audit={action:'explicit_non_model_term_extension',actorUid:a.actorUid,businessId:r.businessId,at,authorizationReference:REFERENCE,previousExpiresAt:r.p.policy.expiresAt,expiresAt:r.endsAt,previousVersion:r.p.version,previousDigest:r.p.digest,policySnapshot:r.p,result:result.policies.find(x=>x.businessId===r.businessId),inferenceActivated:false,additionalSpending:0};
    tx.set(r.policyRef,next);tx.update(r.accessRef,{expiresAt:r.endsAt});
    tx.create(r.policyRef.collection('audit').doc(EVENT),audit);tx.create(r.accessRef.collection('audit').doc(EVENT),{...audit,previousAccess:r.g});
   }
   tx.create(eventRef,{action:'non_model_terms_extended_only',actorUid:a.actorUid,at,authorizationReference:REFERENCE,fingerprint,result});return result;
  });
 }
 return {apply};
}
module.exports={create,ENDINGS,EVENT};
