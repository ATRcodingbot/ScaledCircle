'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-lead-assistance-policy'},'lead-assistance-policy'),db=app.firestore();
const {createAssistanceAuthority}=require('../functions-business-email/lead_assistance_authority');
const clock=Date.parse('2026-09-21T15:00:00Z'),service=createAssistanceAuthority({db,now:()=>clock});
const actor=id=>({businessId:id,actorUid:id,beta:{canManageConnection:true,sendEnabled:true,certificationOnly:false,
 leadAssistanceGrant:{id:'grant-'+id,businessId:id,product:'lead_email_assistance_pilot',mailbox:id+'@example.test',grantedBy:'founder',grantedAt:clock-1,reason:'Controlled fixture',expiresAt:clock+86400000}}});
const policy=()=>({autonomyMode:'bounded_managed',replyMode:'approval_required',timeZone:'America/New_York',expiresAt:clock+3600000,
 audiences:['requested'],services:['Approved service'],voice:'Clear',claims:['Approved facts'],destinations:['https://example.test'],
 limits:{initialPerDay:1,followupsPerContact:0,followupIntervalHours:120},sendingDays:[1,2,3,4,5],opensMinute:540,closesMinute:1020,
 modelAssistance:false,modelDataConsent:false,bookingEnabled:false,introductionsEnabled:true,followupsEnabled:false});
const prepare=(requestId='prepare_1')=>({action:'prepare',expectedVersion:0,requestId,policy:policy()});
beforeEach(async()=>{
 for(const c of ['agentPermissions','businessMailboxes'])for(const r of await db.collection(c).listDocuments())await db.recursiveDelete(r);
 for(const id of ['scaledcircle','remodel']){
  await db.doc('businessMailboxes/'+id).set({status:'connected',email:id+'@example.test',generation:'g1',permissions:{read:true,send:true},automaticSending:false});
  await db.doc(`businessMailboxes/${id}/private/credential`).set({generation:'g1'});
  await db.doc(`agentPermissions/${id}_lead_generator`).set({maySend:false,autonomyMode:'observe'});
 }
});
after(()=>app.delete());
test('exact owner may prepare isolated immutable settings without enabling mail or broad agent actions',async()=>{
 for(const id of ['scaledcircle','remodel']){
  const result=await service.mutate(actor(id),prepare());assert.equal(result.status,'prepared');assert.equal(result.automaticSending,false);
  const view=await service.load(actor(id));assert.equal(view.policy.businessId,id);assert.equal(view.sender,id+'@example.test');
  assert.ok(view.blockers.includes('model_data_review_required'));
  assert.equal((await db.doc(`agentPermissions/${id}_lead_generator`).get()).data().maySend,false);
  assert.equal((await db.doc('businessMailboxes/'+id).get()).data().automaticSending,false);
 }
 const member={...actor('scaledcircle'),actorUid:'member'};
 await assert.rejects(service.mutate(member,prepare()),{code:'permission-denied'});
 assert.equal((await service.load(member)).canManage,false);
 const a=actor('scaledcircle');a.beta.canManageConnection=false;
 await assert.rejects(service.mutate(a,prepare()),{code:'permission-denied'});
});
test('concurrent/retried mutations preserve one audit and stale changes cannot replace the current version',async()=>{
 const results=await Promise.all([service.mutate(actor('scaledcircle'),prepare()),service.mutate(actor('scaledcircle'),prepare())]);
 assert.equal(results.filter(r=>r.reused).length,1);
 const ref=db.doc('agentPermissions/scaledcircle_lead_generator/authorizations/business_email');
 assert.equal((await ref.collection('audit').get()).size,1);
 await assert.rejects(service.mutate(actor('scaledcircle'),{...prepare(),policy:{...policy(),voice:'different'}}),{code:'already-exists'});
 await assert.rejects(service.mutate(actor('scaledcircle'),prepare('prepare_2')),{code:'aborted'});
});
test('pause/revoke persist with attribution; incomplete integration cannot activate or resume',async()=>{
 const a=actor('scaledcircle');await service.mutate(a,prepare());
 await assert.rejects(service.mutate(a,{...prepare('activate_1'),action:'activate',expectedVersion:1,confirm:true}),{code:'failed-precondition'});
 assert.equal((await service.mutate(a,{action:'pause',expectedVersion:1,requestId:'pause_one',confirm:true})).status,'paused');
 await assert.rejects(service.mutate(a,{action:'resume',expectedVersion:2,requestId:'resume_one',confirm:true}),{code:'failed-precondition'});
 await service.mutate(a,{action:'revoke',expectedVersion:2,requestId:'revoke_one',confirm:true});
 const saved=(await service.load(a)).policy;assert.equal(saved.revokedAt,clock);assert.equal(saved.updatedBy,'scaledcircle');
 assert.equal(saved.status,'revoked');assert.equal(saved.version,3);
 const audit=await db.collection('agentPermissions/scaledcircle_lead_generator/authorizations/business_email/audit').get();assert.equal(audit.size,3);
});
test('preflight exposes missing provider/budget prerequisites without accepting browser grants or cross-workspace budget',async()=>{
 const a=actor('scaledcircle');a.beta.leadAssistanceGrant=actor('remodel').beta.leadAssistanceGrant;
 await service.mutate(a,{...prepare(),policy:{...policy(),modelAssistance:true,modelDataConsent:true}});
 const view=await service.load(a);
 assert.ok(view.blockers.includes('audited_pilot_access_required'));assert.ok(view.blockers.includes('model_consent_and_separate_budget_required'));
 await assert.rejects(service.mutate(a,{...prepare('prepare_2'),expectedVersion:1,policy:{...policy(),grant:{approved:true}}}),{code:'invalid-argument'});
 await db.doc('businessMailboxes/scaledcircle').update({status:'disconnected'});
 assert.ok((await service.load(a)).blockers.includes('healthy_owned_mailbox_required'));
});
