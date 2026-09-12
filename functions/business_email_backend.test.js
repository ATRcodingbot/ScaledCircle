'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const admin=require('firebase-admin'),fs=require('node:fs');
const app=admin.initializeApp({projectId:'demo-business-email'},'mailbox-tests'),db=app.firestore();
const {createService,hash}=require('../functions-business-email/service'),gmail=require('../functions-business-email/gmail');
const {createAuthority}=require('../functions-business-email/authority');
const key=crypto.randomBytes(32).toString('base64');
let service,provider,clock,sends,beta;
const call=(operation,input={},uid='owner',businessId='owner')=>service.execute({auth:{uid},data:{businessId,operation,input}});
async function credential(permissions={read:true,send:true}) {
  await db.doc('businessMailboxes/owner').set({businessId:'owner',status:'connected',email:'owner@example.test',permissions,generation:'gen',automaticSending:false});
  await db.doc('businessMailboxes/owner/private/credential').set({generation:'gen',sealed:gmail.seal({refreshToken:'private-test-token'},key,'BusinessMailboxV1/owner')});
}
async function draft(extra={}) {return call('saveDraft',{prospectId:'prospect',subject:'An exact question',body:'A complete, owner-reviewed message.',expectedVersion:0,...extra});}
async function send(d) {return call('send',{prospectId:d.prospectId,version:d.version,operationId:d.operationId,confirm:true});}
beforeEach(async()=>{
  for(const c of ['businessMailboxes','businessEmailCallbackStates','agentProspects','agentCommunicationPreferences','salesLeads','users','businessWorkspaces','businessSubscriptions','legalConsents'])
    for(const ref of await db.collection(c).listDocuments())await db.recursiveDelete(ref);
  clock=Date.parse('2026-09-12T15:00:00Z');sends=0;
  beta={mailbox:'owner@example.test',certificationRecipient:'recipient@example.test',certificationOnly:true,configured:true};
  provider={authorize:({state})=>'https://accounts.google.com/o/oauth2/v2/auth?state='+state,
    exchange:async()=>({email:'owner@example.test',subject:'google-owner',refreshToken:'provider-refresh',permissions:{read:true,send:true}}),
    send:async()=>{sends++;return {id:'google-message',threadId:'google-thread'};},reconcileSent:async()=>null,thread:async()=>({messages:[]})};
  service=createService({db,key,now:()=>clock,provider,authority:async(request)=>{
    if(request.auth?.uid!=='owner'||request.data?.businessId!=='owner'){const e=Error('denied');e.code='permission-denied';throw e;}
    return {actorUid:'owner',businessId:'owner',beta,preferenceEnabled:require('../functions-agentic-growth/growth_opportunity_preferences').enabled};
  }});
  await credential();await db.doc('agentProspects/prospect').set({businessUid:'owner',email:'recipient@example.test',qualified:true,
    provenanceImmutable:true,sourceAvailable:true,sourceUrl:'https://example.test/contact',lastCheckedAt:clock,doNotContact:false,opportunityType:'business_account'});
});
after(async()=>{await db.terminate();await app.delete();});
test('owner isolation and read-only mailbox cannot send',async()=>{
  await assert.rejects(call('load',{},'other','owner'));await assert.rejects(call('load',{},'owner','other'));
  await credential({read:true,send:false});await assert.rejects(draft(),/Enable Send/);assert.equal(sends,0);
});
test('deployment sending hold prevents provider calls despite a granted Send scope',async()=>{
 beta.sendEnabled=false;const d=await draft();await assert.rejects(send(d),/Sending is held/);assert.equal(sends,0);assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,0);
});

test('certification exception permits one explicit test only and cannot release ordinary sending',async()=>{
 beta.sendEnabled=false;beta.certificationSendEnabled=true;
 const ordinary=await draft();await assert.rejects(send(ordinary),/Sending is held/);
 const d=await draft({certification:true});assert.equal(sends,0);
 await assert.rejects(call('send',{prospectId:d.prospectId,version:d.version,operationId:d.operationId,confirm:false}),/Review the exact/);
 await Promise.all([send(d),send(d)]);assert.equal(sends,1);
 assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,1);
 await assert.rejects(draft({certification:true,expectedVersion:d.version}),/already has a send record/);
 await assert.rejects(send(ordinary),/Sending is held/);assert.equal(sends,1);
});

test('controlled review binds exact mailbox, recipient, generation and actor without sending',async()=>{
 beta.sendEnabled=false;beta.certificationSendEnabled=true;const d=await draft({certification:true});
 beta.certificationRecipient='changed@example.test';await assert.rejects(send(d),/Sending is held|recipient changed/);
 beta.certificationRecipient='recipient@example.test';await db.doc('businessMailboxes/owner').update({generation:'changed'});await assert.rejects(send(d),/mailbox or draft changed/);
 await assert.rejects(call('send',{prospectId:d.prospectId,version:d.version,operationId:d.operationId,confirm:true},'other','owner'));
 assert.equal(sends,0);assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,0);
});

test('certification send exception is staging-only and never activates ordinary sending',async()=>{
 const legal=require('./legal_consent');
 await db.doc('users/owner').set({role:'business',active:true});
 await db.doc('businessSubscriptions/owner').set({plan:'starter',status:'active',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+86400000)});
 for(const type of ['terms','privacy'])await db.doc(`legalConsents/owner_${type}_${legal.AGREEMENTS[type]}`).set({uid:'owner',agreementType:type,agreementVersion:legal.AGREEMENTS[type]});
 for(const project of ['scaledcircle-staging','scaled-circle']){
  const a=createAuthority({db,auth:{getUser:async uid=>({uid,email:'owner@example.test',emailVerified:true,disabled:false})},FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,project,beta:{owner:{ownerUid:'owner',mailbox:'owner@example.test',certificationSendEnabled:true,certificationOnly:true,certificationRecipient:'recipient@example.test'}},configured:true});
  const actual=await a({auth:{uid:'owner'},data:{businessId:'owner'}},'send');
  assert.equal(actual.beta.certificationSendEnabled,project==='scaledcircle-staging');assert.equal(actual.beta.sendEnabled,false);
 }
 assert.equal(sends,0);
});
test('same draft concurrent approval has exactly one provider attempt; never claims delivered',async()=>{
  const d=await draft(),outcomes=await Promise.all([send(d),send(d),send(d)]);
  assert.equal(sends,1);assert.ok(outcomes.some(r=>r.state==='sent'));
  assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,1);
  assert.equal((await db.doc('businessMailboxes/owner/operations/'+d.operationId).get()).data().delivered,false);
  assert.equal((await db.collection('businessMailboxes/owner/crm').get()).size,1);
  await send(d);assert.equal(sends,1);await assert.rejects(draft({expectedVersion:1}),/already has a send record/);
});
test('ambiguous provider outcome is held; retry cannot send again or create a new version',async()=>{
  provider.send=async()=>{sends++;throw Error('timeout after remote acceptance');};
  const d=await draft();assert.equal((await send(d)).state,'needs_reconciliation');
  await send(d);assert.equal(sends,1);assert.equal((await call('reconcile',{operationId:d.operationId})).retryAllowed,false);
  provider.reconcileSent=async()=>({id:'accepted-message',threadId:'accepted-thread'});
  assert.equal((await call('reconcile',{operationId:d.operationId})).state,'sent');assert.equal(sends,1);
});
test('exact recipient, version, sender generation, source freshness and preferences are rechecked',async()=>{
  const d=await draft();await assert.rejects(send({...d,version:7}));
  await db.doc('agentProspects/prospect').update({email:'changed@example.test'});await assert.rejects(send(d));
  await db.doc('agentProspects/prospect').update({email:'recipient@example.test',lastCheckedAt:clock-8*86400000});await assert.rejects(send(d));
  await db.doc('agentProspects/prospect').update({lastCheckedAt:clock});await db.doc('agentCommunicationPreferences/owner').set({opportunities:{commercial:false}});await assert.rejects(send(d));
  await db.doc('agentCommunicationPreferences/owner').delete();await db.doc('businessMailboxes/owner').update({generation:'other'});await assert.rejects(send(d));assert.equal(sends,0);
});
test('recipient-wide suppression blocks a newly discovered record for the same email',async()=>{
  const d=await draft();await call('suppress',{prospectId:'prospect',reason:'do_not_contact'});await assert.rejects(send(d),/Do not contact/);
  const p=(await db.doc('agentProspects/prospect').get()).data();await db.doc('agentProspects/copy').set({...p,doNotContact:false,lifecycleState:'drafted'});
  await assert.rejects(draft({prospectId:'copy'}),/Do not contact/);assert.equal(sends,0);
});
test('certification cannot contact arbitrary prospects; no caller controlled sender or recipient',async()=>{
  await db.doc('agentProspects/prospect').update({email:'real-prospect@example.test'});await assert.rejects(draft(),/controlled recipient/);
  await assert.rejects(draft({from:'support@scaledcircle.com'}));await assert.rejects(draft({recipient:'other@example.test'}));
  const d=await draft({certification:true,prospectId:null});assert.equal(d.recipient,'recipient@example.test');assert.equal(d.from,'owner@example.test');assert.equal(sends,0);
});
test('OAuth attempt reuse, exact mailbox identity, single-use callback and partial permissions',async()=>{
  const first=await call('connect',{read:true,send:false}),again=await call('connect',{read:true,send:false});assert.equal(first.url,again.url);
  const state=new URL(first.url).searchParams.get('state');await service.callback({state,code:'valid-code'});
  const c=(await call('load')).connection;assert.equal(c.read,true);assert.equal(c.send,false);assert.equal(c.automaticSending,false);
  await assert.rejects(service.callback({state,code:'same-code'}));
  const wrong=await call('connect',{read:false,send:true});provider.exchange=async()=>({email:'wrong@example.test',refreshToken:'wrong',permissions:{send:true}});
  await assert.rejects(service.callback({state:new URL(wrong.url).searchParams.get('state'),code:'code'}),/approved Business mailbox/);
  assert.equal((await call('load')).connection.email,'owner@example.test');
});
test('canceled/expired attempts leave recoverable state, forged callback rejected, disconnect removes local authority',async()=>{
  await call('disconnect');const a=await call('connect',{read:true,send:true});clock+=600001;
  assert.equal((await call('load')).connection.status,'not_connected');
  await assert.rejects(service.callback({state:new URL(a.url).searchParams.get('state'),code:'late'}));
  await assert.rejects(service.callback({state:'forged'}));await call('disconnect');
  assert.equal((await db.doc('businessMailboxes/owner/private/credential').get()).exists,false);
});
test('send-only grant cannot read replies and plaintext credentials are never returned',async()=>{
  await credential({read:false,send:true});const d=await draft();await send(d);
  await assert.rejects(call('reconcile',{operationId:d.operationId}),/Enable Read leads/);
  const output=JSON.stringify(await call('load'));assert.ok(!output.includes('private-test-token'));assert.ok(!output.includes('refreshToken'));assert.ok(!output.includes('sealed'));
});
test('replies need exact provider conversation, recipient and reference; duplicate reconciliation is harmless',async()=>{
  const d=await draft();await send(d);const op=(await db.doc('businessMailboxes/owner/operations/'+d.operationId).get()).data();
  provider.thread=async()=>({messages:[{id:'google-message',payload:{headers:[{name:'Message-ID',value:'<'+op.messageId+'>'}]}},
    {id:'reply-one',internalDate:String(clock+1000),payload:{mimeType:'text/plain',body:{data:Buffer.from('Controlled reply').toString('base64url')},headers:[{name:'From',value:'Recipient <recipient@example.test>'},{name:'In-Reply-To',value:'<'+op.messageId+'>'}]}},
    {id:'unrelated',internalDate:String(clock+1000),payload:{headers:[{name:'From',value:'another@example.test'}]}}]});
  await call('reconcile',{operationId:d.operationId});await call('reconcile',{operationId:d.operationId});
  assert.equal((await db.doc('businessMailboxes/owner/operations/'+d.operationId).get()).data().replyCount,1);
  assert.equal((await call('load')).replies.length,1);assert.equal((await call('load')).learning.replied,1);
  assert.equal((await call('load')).learning.patterns.length,0);
});
test('landing responses require an owned inbound lead, explicit sender preference and exact test recipient',async()=>{
  const leadId='landing_'+'a'.repeat(40);await db.doc('salesLeads/'+leadId).set({ownerUid:'owner',leadType:'landing_page_inquiry',createdBy:'public_landing_page',contactEmail:'recipient@example.test'});
  await assert.rejects(draft({prospectId:leadId}),/Choose Business email responses/);
  await call('preferences',{landingSender:'connected_business_email'});const d=await draft({prospectId:leadId});assert.equal(d.recipient,'recipient@example.test');assert.equal(sends,0);
  await db.doc('salesLeads/'+leadId).update({ownerUid:'other'});await assert.rejects(send(d));assert.equal(sends,0);
});
test('real workspace authority rejects nonowner, wrong tenant, disabled users and missing invite',async()=>{
  const authority=createAuthority({db,auth:{getUser:async uid=>({uid,email:uid+'@example.test',emailVerified:true,disabled:uid==='disabled'})},FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,project:'demo-business-email',beta:{owner:{ownerUid:'owner',mailbox:'owner@example.test'}},configured:true});
  for(const request of [{},{auth:{uid:'outsider'},data:{businessId:'owner'}},{auth:{uid:'owner'},data:{businessId:'other'}},{auth:{uid:'disabled'},data:{businessId:'owner'}}])await assert.rejects(authority(request,'send'));
});
test('customer consent and entitlement are rechecked; internal registry never converts Admin into a Business',async()=>{
  const legal=require('./legal_consent');
  const authority=createAuthority({db,auth:{getUser:async uid=>({uid,email:uid+'@example.test',emailVerified:true,disabled:false})},FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,project:'demo-business-email',beta:{owner:{ownerUid:'owner',mailbox:'owner@example.test'},internal:{ownerUid:'internal',kind:'internal',mailbox:'internal@example.test'}},configured:true});
  const request={auth:{uid:'owner'},data:{businessId:'owner'}};
  await db.doc('users/owner').set({role:'business',active:true});await db.doc('businessSubscriptions/owner').set({planId:'managed_growth',status:'active',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+86400000)});
  await assert.rejects(authority(request,'send'));
  for(const type of ['terms','privacy'])await db.doc(`legalConsents/owner_${type}_${legal.AGREEMENTS[type]}`).set({uid:'owner',agreementType:type,agreementVersion:legal.AGREEMENTS[type]});
  assert.equal((await authority(request,'send')).businessId,'owner');await db.doc('businessSubscriptions/owner').update({status:'expired'});await assert.rejects(authority(request,'send'));
  await db.doc('users/internal').set({role:'admin',active:true});await db.doc('internalGrowthWorkspaces/internal').set({kind:'internal_admin_dogfood',namespace:'internal',ownerUid:'internal'});
  assert.equal((await authority({auth:{uid:'internal'},data:{businessId:'internal'}},'load')).businessId,'internal');
  assert.equal((await db.doc('businessSubscriptions/internal').get()).exists,false);await db.doc('internalGrowthWorkspaces/internal').delete();
});
test('follow-up requires a confirmed prior send and five-day window or actual reply; no automatic follow-up',async()=>{
  const d=await draft();await send(d);await assert.rejects(draft({expectedVersion:1,followupTo:d.operationId}));
  clock+=5*86400000;const f=await draft({expectedVersion:1,followupTo:d.operationId,subject:'Follow-up question'});
  assert.equal(f.parentThreadId,'google-thread');assert.equal(sends,1);await Promise.all([send(f),send(f)]);assert.equal(sends,2);
});
test('intentional DNC reversal preserves audit; unsubscribe/bounce cannot be casually cleared',async()=>{
  await call('suppress',{prospectId:'prospect',reason:'do_not_contact'});
  await assert.rejects(call('restoreContact',{prospectId:'prospect',reason:'New owner review'}));
  await call('restoreContact',{prospectId:'prospect',confirm:true,reason:'Owner intentionally reviewed and restored this contact.'});
  assert.equal((await db.collection('businessMailboxes/owner/contactHistory').get()).size,1);assert.equal(sends,0);
  await call('suppress',{prospectId:'prospect',reason:'unsubscribed'});
  await assert.rejects(call('restoreContact',{prospectId:'prospect',confirm:true,reason:'Attempted ordinary reversal'}),/verified opt-in/);
});
test('bounded automatic reply checks require READ and never send; concurrent polling does not duplicate records',async()=>{
  const d=await draft();await send(d);let reads=0;provider.thread=async()=>{reads++;throw Error('temporarily unavailable');};
  await Promise.all([service.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}}),service.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}})]);
  assert.equal(reads,1);assert.equal(sends,1);await db.doc('businessMailboxes/owner').update({'permissions.read':false});clock+=300001;
  assert.equal((await service.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}})).checked,0);assert.equal(reads,1);
});
test('existing Rules deny mailbox records, tokens, attempts, replies and operations to clients including Admin',async()=>{
  const rules=require('@firebase/rules-unit-testing');const env=await rules.initializeTestEnvironment({projectId:'demo-mailbox-rules',firestore:{rules:fs.readFileSync(require('node:path').join(__dirname,'../firestore.rules'),'utf8')}});
  try {
    await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('users/admin').set({role:'admin',active:true});await ctx.firestore().doc('users/owner').set({role:'business',active:true});});
    for(const actor of ['owner','admin','stranger',null])for(const path of ['businessMailboxes/owner','businessMailboxes/owner/private/credential','businessMailboxes/owner/operations/operation','businessMailboxes/owner/replies/reply','businessEmailCallbackStates/nonce']){
      const client=actor?env.authenticatedContext(actor).firestore():env.unauthenticatedContext().firestore();
      await rules.assertFails(client.doc(path).get());await rules.assertFails(client.doc(path).set({status:'connected'}));
    }
  }finally{await env.cleanup();}
});
