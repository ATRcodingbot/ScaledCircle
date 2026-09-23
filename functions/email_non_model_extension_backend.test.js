'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-term-extension'},'term-extension'),db=app.firestore();
const {create,ENDINGS,EVENT}=require('../functions-business-email/non_model_term_extension'),{GRANT}=require('../functions-business-email/pilot_enrollment');
const at=Date.parse('2026-09-23T12:00:00Z'),workspaces=['first','second'],actor={businessId:'first',actorUid:'first',beta:{kind:'internal',canManageConnection:true}};
let service,input;
const policy=b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email`),access=b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email_pilot_grant`),shared=()=>db.doc('emailAssistanceOperatingGrants/'+GRANT);
beforeEach(async()=>{
 for(const c of ['agentPermissions','businessMailboxes','emailAssistanceOperatingGrants'])await db.recursiveDelete(db.collection(c));
 service=create({db,now:()=>at,workspaces});input={confirm:true,expected:workspaces.map(b=>({businessId:b,version:4,digest:'digest-'+b}))};
 await shared().set({status:'prepared',startsAt:null,expiresAt:null,businessIds:workspaces,maximumCostMicros:1000000,maximumRequests:100});
 for(const [i,b]of workspaces.entries()){
  await policy(b).set({businessId:b,approvedBy:b,approvedAt:at-1000,intakeStartsAt:at-1000,activatedAt:at-1000,status:'active',version:4,digest:'digest-'+b,grantId:GRANT,sender:b+'@example.test',connectionGeneration:'g',modelAuthorizationPending:true,policy:{expiresAt:ENDINGS[i],limits:{initialPerDay:[10,20][i]},followupsEnabled:false,modelAssistance:true,modelDataConsent:true,mailboxMode:i?'labels':'inbox',inquiryLabel:i?'Controlled':'',notifications:{email:true,push:true,quietStartMinute:1260,quietEndMinute:480},schedulingRules:{bufferMinutes:5},availabilityRevision:2}});
  await access(b).set({id:GRANT,product:'lead_email_assistance_pilot',businessId:b,status:'active',expiresAt:ENDINGS[i],startsAt:at-1000,mailbox:b+'@example.test'});
  await db.doc('businessMailboxes/'+b).set({status:'connected',email:b+'@example.test',generation:'g'});
 }
});
after(()=>app.delete());
test('exact two terms advance once under concurrency; preferences, start boundaries, inference and mailbox bytes remain unchanged',async()=>{
 const old=await Promise.all(workspaces.map(async b=>({p:(await policy(b).get()).data(),g:(await access(b).get()).data(),m:(await db.doc('businessMailboxes/'+b).get()).data()}))),budget=(await shared().get()).data();
 const results=await Promise.all([service.apply(actor,input),service.apply(actor,input)]);assert.equal(results.filter(r=>r.reused).length,1);
 for(const [i,b]of workspaces.entries()){
  const p=(await policy(b).get()).data(),g=(await access(b).get()).data();assert.equal(p.policy.expiresAt,ENDINGS[i]+7*86400000);assert.equal(g.expiresAt,p.policy.expiresAt);
  assert.deepEqual({...p.policy,expiresAt:old[i].p.policy.expiresAt},old[i].p.policy);for(const k of ['approvedAt','intakeStartsAt','activatedAt','modelAuthorizationPending','status'])assert.deepEqual(p[k],old[i].p[k]);
  assert.deepEqual({...g,expiresAt:old[i].g.expiresAt},old[i].g);assert.deepEqual((await db.doc('businessMailboxes/'+b).get()).data(),old[i].m);
  assert.equal((await policy(b).collection('audit').get()).size,1);assert.equal((await access(b).collection('audit').doc(EVENT).get()).exists,true);
 }
 assert.deepEqual((await shared().get()).data(),budget);assert.equal((await shared().collection('usage').get()).size,0);
});
test('newer owner changes, revoked/expired access, changed sender or approved expiry abort the entire transaction',async()=>{
 await policy('second').update({version:5});await assert.rejects(service.apply(actor,input),{code:'aborted'});assert.equal((await policy('first').get()).data().version,4);
 await policy('second').update({version:4,revokedAt:at-1});await assert.rejects(service.apply(actor,input),{code:'failed-precondition'});
 await policy('second').update({revokedAt:admin.firestore.FieldValue.delete()});await access('second').update({status:'revoked'});await assert.rejects(service.apply(actor,input));
 await access('second').update({status:'active'});await db.doc('businessMailboxes/second').update({generation:'changed'});await assert.rejects(service.apply(actor,input));
 await db.doc('businessMailboxes/second').update({generation:'g'});await policy('second').update({'policy.expiresAt':ENDINGS[1]-1});await assert.rejects(service.apply(actor,input));
 assert.equal((await shared().collection('audit').get()).size,0);
});
test('pause remains paused; no revive, arbitrary scope/end, owner impersonation or future automatic renewal',async()=>{
 await policy('second').update({status:'paused'});await assert.rejects(service.apply({...actor,actorUid:'member'},input),{code:'permission-denied'});
 await assert.rejects(service.apply(actor,{...input,expiresAt:ENDINGS[0]+99*86400000}),{code:'invalid-argument'});
 await assert.rejects(service.apply(actor,{...input,expected:[input.expected[0],{...input.expected[1],businessId:'other'}]}),{code:'invalid-argument'});
 const r=await service.apply(actor,input);assert.equal(r.policies[1].status,'paused');
 await assert.rejects(service.apply(actor,{...input,expected:input.expected.map(e=>({...e,version:5}))}),{code:'already-exists'});
});
test('model activation or expiry before extension blocks without changing any allowance',async()=>{
 await shared().update({status:'active',startsAt:at,expiresAt:at+7*86400000});await assert.rejects(service.apply(actor,input));assert.equal((await policy('first').get()).data().version,4);
 await shared().update({status:'prepared',startsAt:null,expiresAt:null});await assert.rejects(create({db,now:()=>ENDINGS[0]+1,workspaces}).apply(actor,input));
});
