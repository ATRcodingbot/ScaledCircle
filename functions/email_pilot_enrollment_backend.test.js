'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after,beforeEach}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-enrollment'},'email-enrollment'),db=app.firestore();
const {createEnrollment,GRANT}=require('../functions-business-email/pilot_enrollment');
let now=Date.parse('2026-09-21T15:00:00Z'),svc;
const actor=b=>({businessId:b,actorUid:b,beta:{kind:'internal',canManageConnection:true}});
const policy=b=>({businessId:b,status:'awaiting_pilot_activation',approvedBy:b,approvedAt:now,connectionGeneration:'g1',digest:'fixture-'+b,policy:{modelAssistance:true,modelDataConsent:true,expiresAt:now+7*86400000}});
beforeEach(async()=>{for(const col of ['agentPermissions','emailAssistanceOperatingGrants','emailAssistanceProviderReviews','businessMailboxes'])for(const r of await db.collection(col).listDocuments())await db.recursiveDelete(r);
 svc=createEnrollment({db,now:()=>now,workspaces:['first','second'],mailboxes:['first@example.test','second@example.test']});
 for(const b of ['first','second'])await db.doc('businessMailboxes/'+b).set({status:'connected',email:b+'@example.test',generation:'g1'});
});
after(()=>app.delete());
test('preparing and waiting for the second owner never starts the shared clock; second approval activates once',async()=>{
 const prepared=await svc.prepare(actor('first'),{confirm:true});assert.equal(prepared.startsAt,null);assert.equal(prepared.expiresAt,null);
 await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').set({status:'verified',googleReviewDisposition:'processing_permitted',implementationVersion:'email_pilot_v1',organization:require('../functions-business-email/provider_review').ORGANIZATION,project:require('../functions-business-email/provider_review').PROJECT,approvedBy:'fixture',evidenceRef:'fixture',trainingSharingDisabled:true,gmailProcessingPermitted:true,loggingMode:'per_call_store_false'});
 const confirm=async b=>db.runTransaction(async tx=>{const saved=policy(b),result=await svc.activation(tx,actor(b),saved,[]);if(result.activate)result.apply();tx.set(db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email`),{...saved,status:result.activate?'active':saved.status});return result;});
 assert.equal((await confirm('first')).activate,false);assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().startsAt,null);
 now+=86400000;const result=await confirm('second');assert.equal(result.startsAt,now);assert.equal(result.expiresAt,now+7*86400000);
 now+=1000;await confirm('first');const grant=(await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data();assert.equal(grant.startsAt,result.startsAt);assert.equal(grant.expiresAt,result.expiresAt);assert.equal(grant.maximumCostMicros,1000000);assert.equal(grant.maximumRequests,100);
 assert.equal((await db.doc(`agentPermissions/first_lead_generator/authorizations/business_email_pilot_grant`).get()).data().expiresAt,result.expiresAt);
});
test('unreviewed data handling, incomplete prerequisites and other actors cannot activate or enroll',async()=>{
 await assert.rejects(svc.prepare(actor('second'),{confirm:true}));await svc.prepare(actor('first'),{confirm:true});
 await assert.rejects(db.runTransaction(tx=>svc.activation(tx,actor('first'),policy('first'),[])),/data review/);
 await assert.rejects(db.runTransaction(tx=>svc.activation(tx,actor('first'),policy('first'),['mailbox_missing'])),/prerequisite/);
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().status,'prepared');
});

test('data assessment is audited by the exact Admin, requires a real amendment reference, and cannot overwrite active-pilot review',async()=>{
 const input={confirm:true,sourceSha:'a'.repeat(40),amendmentReference:'fixture-only review thread evidence'};
 await assert.rejects(svc.recordDataReview(actor('second'),input));await assert.rejects(svc.recordDataReview(actor('first'),{...input,amendmentReference:''}));
 await svc.prepare(actor('first'),{confirm:true});assert.equal((await svc.recordDataReview(actor('first'),input)).googleApproval,false);
 const doc=(await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').get()).data();assert.equal(doc.zeroDataRetentionVerified,false);assert.equal(doc.securityAssessmentStatus,'open');
 await db.doc('emailAssistanceOperatingGrants/'+GRANT).update({status:'active'});await assert.rejects(svc.recordDataReview(actor('first'),input),/active pilot/);
});
test('relative owner terms share one activation expiry even when second owner confirms later',async()=>{
 await svc.prepare(actor('first'),{confirm:true});
 await svc.recordDataReview(actor('first'),{confirm:true,sourceSha:'b'.repeat(40),amendmentReference:'fixture-only amendment evidence'});
 const relative=b=>({...policy(b),policy:{modelAssistance:true,modelDataConsent:true,termMode:'shared_pilot',expiresAt:null,timeZone:'America/New_York',ownerStopLocal:null}});
 const first=relative('first');
 await db.runTransaction(async tx=>{const r=await svc.activation(tx,actor('first'),first,[]);assert.equal(r.activate,false);tx.set(db.doc('agentPermissions/first_lead_generator/authorizations/business_email'),first);});
 now+=3*86400000;
 const result=await db.runTransaction(async tx=>{const r=await svc.activation(tx,actor('second'),relative('second'),[]);assert.equal(r.activate,true);r.apply();return r;});
 assert.equal(result.startsAt,now);assert.equal(result.expiresAt,now+7*86400000);
 const saved=(await db.doc('agentPermissions/first_lead_generator/authorizations/business_email').get()).data();
 assert.equal(saved.policy.expiresAt,result.expiresAt);assert.equal(saved.status,'active');
 const later=await db.runTransaction(tx=>svc.activation(tx,actor('second'),relative('second'),[]));
 assert.equal(later.expiresAt,result.expiresAt);
});

test('non-model owner authorization does not require model review or start inference clock and cannot renew access',async()=>{
 await svc.prepare(actor('first'),{confirm:true});const saved={...policy('first'),policy:{...policy('first').policy,modelAssistance:false}};
 let result;await db.runTransaction(async tx=>{result=await svc.activation(tx,actor('first'),saved,[]);assert.equal(result.activate,true);result.apply();});
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().status,'prepared');
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().startsAt,null);
 now+=1000;const again=await db.runTransaction(tx=>svc.activation(tx,actor('first'),saved,[]));assert.equal(again.expiresAt,result.expiresAt);
 now=result.expiresAt+1;await assert.rejects(db.runTransaction(tx=>svc.activation(tx,actor('first'),saved,[])),/expired/);
});


test('non-model approval cannot stand in for the other owner model consent or start the inference clock',async()=>{
 await svc.prepare(actor('first'),{confirm:true});
 await svc.recordDataReview(actor('first'),{confirm:true,sourceSha:'c'.repeat(40),amendmentReference:'fixture-only review evidence'});
 const plain={...policy('first'),status:'active',policy:{...policy('first').policy,modelAssistance:false,modelDataConsent:false}};
 await db.doc('agentPermissions/first_lead_generator/authorizations/business_email').set(plain);
 const r=await db.runTransaction(tx=>svc.activation(tx,actor('second'),policy('second'),[]));assert.equal(r.activate,false);
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().startsAt,null);
});

test('a partial authorization retaining desired AI never satisfies the other workspace model approval',async()=>{
 await svc.prepare(actor('first'),{confirm:true});await svc.recordDataReview(actor('first'),{confirm:true,sourceSha:'d'.repeat(40),amendmentReference:'fixture-only delivered amendment'});
 await db.doc('agentPermissions/first_lead_generator/authorizations/business_email').set({...policy('first'),status:'active',modelAuthorizationPending:true});
 const r=await db.runTransaction(tx=>svc.activation(tx,actor('second'),policy('second'),[]));assert.equal(r.activate,false);
 assert.equal((await db.doc('emailAssistanceOperatingGrants/'+GRANT).get()).data().startsAt,null);
});
