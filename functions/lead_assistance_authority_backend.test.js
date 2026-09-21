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
  assert.ok(!view.blockers.includes('model_data_review_required'));
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
 await db.doc('agentPermissions/scaledcircle_lead_generator/authorizations/business_email').update({status:'active',approvedBy:'scaledcircle',approvedAt:clock-1000});
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
test('relative prepared policy persists no expiry, clock, consent or execution; saved context is workspace scoped',async()=>{
 const a=actor('remodel');a.beta.leadAssistanceGrant.status='prepared';a.beta.leadAssistanceGrant.inferenceGrantId='shared';
 await db.doc('emailAssistanceOperatingGrants/shared').set({status:'prepared',termMs:7*86400000,startsAt:null,expiresAt:null});
 await db.doc('businessGrowthProfiles/remodel').set({businessUid:'remodel',businessName:'Fixture',servicesOffered:['Decks'],brandVoice:'Clear',differentiators:['Profile fact']});
 const draft={...policy(),termMode:'shared_pilot',expiresAt:null,modelDataConsent:false,introductionsEnabled:false};
 const result=await service.mutate(a,{...prepare(),policy:draft});assert.equal(result.status,'prepared');
 const view=await service.load(a);assert.equal(view.policy.policy.expiresAt,null);assert.equal(view.pilotTerm.startsAt,null);assert.equal(view.proposal.values.voice,'Clear');
 assert.ok(!view.blockers.includes('valid_policy_term_required'));assert.ok(!view.blockers.includes('model_data_review_required'));
 assert.equal((await db.doc('emailAssistanceOperatingGrants/shared').get()).data().startsAt,null);
 await assert.rejects(service.mutate(a,{...prepare('bad_term'),expectedVersion:1,policy:{...draft,expiresAt:clock+86400000}}),{code:'invalid-argument'});
});


test('preparing a broader mode retains prior authorized coverage separately, never activates it',async()=>{
 const a=actor('remodel'),ref=db.doc('agentPermissions/remodel_lead_generator/authorizations/business_email');
 await ref.set({businessId:'remodel',status:'active',version:1,approvedAt:clock-10000,connectionGeneration:'g1',intakeStartsAt:clock-10000,policy:{...policy(),mailboxMode:'labels',inquiryLabel:'Scoped',newInquiriesEnabled:true},digest:'old'});
 const result=await service.mutate(a,{...prepare(),expectedVersion:1,policy:{...policy(),mailboxMode:'inbox',historyMode:'future',inquiryLabel:'',newInquiriesEnabled:true}});
 const saved=(await ref.get()).data();assert.equal(result.status,'prepared');assert.equal(saved.policy.mailboxMode,'inbox');assert.equal(saved.authorizedIntake.mode,'labels');assert.equal(saved.authorizedIntake.label,'Scoped');assert.equal(saved.authorizedIntake.startsAt,clock-10000);
});

test('activation cannot authorize unsaved selections and review remains available with AI blocked',async()=>{
 const a=actor('remodel');await service.mutate(a,{...prepare(),policy:{...policy(),claims:[],modelAssistance:true,modelDataConsent:true}});
 const view=await service.load(a);assert.equal(view.authorizationReview.version,1);assert.equal(view.authorizationReview.canRevoke,false);
 assert.ok(view.authorizationReview.fullBlockers.includes('model_data_review_required'));
 assert.ok(!view.blockers.includes('business_content_boundaries_required'));
 await assert.rejects(service.mutate(a,{action:'activate',expectedVersion:1,requestId:'unsaved_change',confirm:true,policy:policy()}),{code:'aborted'});
 await assert.rejects(service.mutate(a,{action:'activate',expectedVersion:0,requestId:'stale_review',confirm:true}),{code:'aborted'});
 assert.equal((await service.load(a)).policy.status,'prepared');
 await assert.rejects(service.mutate(a,{action:'resume',expectedVersion:1,requestId:'resume_prepared',confirm:true}),{code:'failed-precondition'});
 await assert.rejects(service.mutate(a,{action:'pause',expectedVersion:1,requestId:'pause_prepared',confirm:true}),{code:'failed-precondition'});
});

test('explicit available-only authorization preserves AI and OFF choices without starting inference, with safe replay',async()=>{
 const {WORKSPACES}=require('../functions-business-email/inference_budget'),{createEnrollment,GRANT}=require('../functions-business-email/pilot_enrollment');
 const boxes=['support@scaledcircle.com','attractiveremodel@gmail.com'];
 for(let i=0;i<2;i++){
  await db.doc('businessMailboxes/'+WORKSPACES[i]).set({status:'connected',email:boxes[i],generation:'g1',permissions:{read:true,send:true}});
  await db.doc(`businessMailboxes/${WORKSPACES[i]}/private/credential`).set({generation:'g1'});
 }
 await db.recursiveDelete(db.doc('emailAssistanceOperatingGrants/'+GRANT));
 const a={businessId:WORKSPACES[0],actorUid:WORKSPACES[0],beta:{kind:'internal',canManageConnection:true}};
 await createEnrollment({db,now:()=>clock}).prepare(a,{confirm:true});
 a.beta.leadAssistanceGrant=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email_pilot_grant`).get()).data();
 const desired={...policy(),termMode:'shared_pilot',expiresAt:null,claims:[],modelAssistance:true,modelDataConsent:true,introductionsEnabled:false,followupsEnabled:false,newInquiriesEnabled:false,mailboxMode:'inbox',historyMode:'future'};
 await service.mutate(a,{...prepare(),policy:desired});const view=await service.load(a);assert.equal(view.authorizationReview.partialAvailable,true);
 const input={action:'activate',expectedVersion:1,requestId:'partial_confirm',confirm:true,availableOnly:true};
 const results=await Promise.all([service.mutate(a,input),service.mutate(a,input)]);assert.equal(results.filter(r=>r.reused).length,1);
 let saved=(await service.load(a)).policy;assert.equal(saved.status,'active');assert.equal(saved.modelAuthorizationPending,true);assert.equal(saved.policy.modelAssistance,true);assert.equal(saved.policy.newInquiriesEnabled,false);assert.equal(saved.policy.introductionsEnabled,false);
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().startsAt,null);
 await service.mutate(a,{action:'pause',expectedVersion:2,requestId:'pause_partial',confirm:true});assert.equal((await service.load(a)).policy.modelAuthorizationPending,true);
 a.beta.leadAssistanceGrant=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email_pilot_grant`).get()).data();
 await service.mutate(a,{action:'resume',expectedVersion:3,requestId:'resume_partial',confirm:true});saved=(await service.load(a)).policy;assert.equal(saved.modelAuthorizationPending,true);assert.equal(saved.policy.modelDataConsent,true);
 await service.mutate(a,{...prepare('change_saved'),expectedVersion:4,policy:desired});
 await assert.rejects(service.mutate(a,{action:'resume',expectedVersion:5,requestId:'resume_new_saved',confirm:true}),{code:'failed-precondition'});
 await db.doc(`businessMailboxes/${a.businessId}/private/credential`).delete();
 await assert.rejects(service.mutate(a,{action:'activate',availableOnly:true,expectedVersion:5,requestId:'no_sender_partial',confirm:true}),/mailbox_credentials_unavailable/);
});
