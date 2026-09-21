'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-pilot-execution'},'email-pilot-execution'),db=app.firestore();
const {createService,hash}=require('../functions-business-email/service'),gmail=require('../functions-business-email/gmail');
const {digest}=require('../functions-business-email/lead_assistance_policy');
let at=Date.parse('2026-09-21T15:00:00Z'),sends,svc,actor,provider;
const key=Buffer.alloc(32,3).toString('base64'),policyRef=()=>db.doc('agentPermissions/owner_lead_generator/authorizations/business_email');
const call=(operation,input={})=>svc.execute({auth:{uid:'owner'},data:{businessId:'owner',operation,input}});
beforeEach(async()=>{
 for(const c of ['agentPermissions','businessMailboxes','businessOperations','businessEmailUnsubscribeLinks'])for(const ref of await db.collection(c).listDocuments())await db.recursiveDelete(ref);
 sends=0;actor={businessId:'owner',actorUid:'owner',beta:{canManageConnection:true,mailbox:'owner@example.test',sendEnabled:false,certificationOnly:true,leadAssistanceGrant:{status:'active',id:'pilot',businessId:'owner',product:'lead_email_assistance_pilot',grantedBy:'Founder',reason:'fixture',mailbox:'owner@example.test',expiresAt:at+86400000}}};
 provider={configured:true,send:async()=>{sends++;return {id:'sent_'+sends,threadId:'thread_'+sends};}};
 svc=createService({db,key,provider,project:'demo-email-pilot-execution',now:()=>at,authority:async request=>{if(request.auth.uid!=='owner'||request.data.businessId!=='owner')throw Error('unauthorized');return actor;}});
 await db.doc('businessMailboxes/owner').set({businessId:'owner',status:'connected',provider:'google',email:actor.beta.mailbox,generation:'g1',permissions:{read:true,send:true}});
 await db.doc('businessMailboxes/owner/private/credential').set({generation:'g1',sealed:gmail.seal({refreshToken:'fixture'},key,'BusinessMailboxV1/owner')});
 const policy={expiresAt:at+86400000,introductionsEnabled:true,followupsEnabled:true,timeZone:'America/New_York',sendingDays:[1,2,3,4,5],opensMinute:540,closesMinute:1020,
  limits:{initialPerDay:1,followupsPerContact:1,followupIntervalHours:120},templates:{introduction:{subject:'Requested details',body:'Here are the details you requested.'}},mailingAddress:'Fixture address'};
 const saved={businessId:'owner',status:'active',approvedBy:'owner',approvedAt:at-1000,connectionGeneration:'g1',sender:actor.beta.mailbox,policy};saved.digest=digest(saved);await policyRef().set(saved);
 await db.doc('businessOperations/owner/customers/contact').set({businessId:'owner',name:'Consenting fixture',email:'recipient@example.test',stage:'new_lead',version:1,
  emailPermission:{businessId:'owner',recipient:'recipient@example.test',status:'requested',purposes:['introduction','followup'],evidenceRef:'fixture-request',recordedBy:'owner',recordedAt:at-1000}});
});
after(()=>app.delete());
const draft=()=>call('saveDraft',{assistanceKind:'introduction',customerId:'contact',subject:'Requested information',body:'The exact reviewed reply.',expectedVersion:0});
const send=d=>call('send',{prospectId:d.prospectId,version:d.version,operationId:d.operationId,confirm:true});
test('exact pilot grants scoped sending while ordinary internal hold remains; concurrent send is once',async()=>{
 const d=await draft();const results=await Promise.all([send(d),send(d)]);assert.equal(sends,1);assert.ok(results.some(r=>r.state==='sent'));
 assert.equal(actor.beta.sendEnabled,false);assert.equal(actor.beta.certificationOnly,true);
 assert.equal((await db.doc('businessOperations/owner/customers/contact').get()).data().stage,'contacted');
 await assert.rejects(call('saveDraft',{prospectId:'unapproved',subject:'x',body:'x',expectedVersion:0}));
});
test('no consent, another workspace, paused policy and changed mailbox cannot dispatch',async()=>{
 const c=db.doc('businessOperations/owner/customers/contact');await c.update({emailPermission:null});await assert.rejects(draft(),/permission/);
 await c.update({businessId:'other'});await assert.rejects(draft(),/eligible/);assert.equal(sends,0);
});
test('pause between review and provider, or recipient opt-out, keeps provider uncalled',async()=>{
 const d=await draft();await policyRef().update({status:'paused'});await assert.rejects(send(d),/not active/);assert.equal(sends,0);
 await policyRef().update({status:'active'});await db.doc('businessMailboxes/owner/suppression/'+hash(d.recipient)).set({active:true});await assert.rejects(send(d));assert.equal(sends,0);
});
test('recurring dispatch consumes exact template and reuses outbox without defeating certification hold',async()=>{
 await Promise.all([svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}}),svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}})]);
 assert.equal(sends,1);const ops=await db.collection('businessMailboxes/owner/operations').get();assert.equal(ops.size,1);
 const op=ops.docs[0].data();assert.equal(op.automatic,true);assert.equal(op.approvalSource,'owner_email_policy');assert.match(op.body,/Unsubscribe/);
 await svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends,1);
});

test('ordinary owner replies survive model-pilot expiry but cannot release an internal sender hold',async()=>{
 await policyRef().update({'policy.expiresAt':at-1});actor.beta.leadAssistanceGrant.expiresAt=at-1;
 await db.doc('businessMailboxes/owner/operations/inquiry').set({businessId:'owner',state:'received',crmCustomerId:'contact',recipient:'recipient@example.test',from:actor.beta.mailbox,replyCount:1,providerThreadId:'thread'});
 await db.doc('businessMailboxes/owner/replies/inbound').set({businessId:'owner',operationId:'inquiry',from:'recipient@example.test',to:actor.beta.mailbox,providerThreadId:'thread',providerMessageId:'inbound',receivedAt:at,body:'Please answer my question.',classification:'substantive'});
 const context=await call('loadConversation',{operationId:'inquiry'});
 const input={assistanceKind:'reply',customerId:'contact',followupTo:'inquiry',expectedInboundDigest:context.inboundDigest,expectedVersion:0,subject:'Your question',body:'Owner-reviewed answer.'};
 await assert.rejects(call('saveDraft',input),/not active/);
 actor.beta.sendEnabled=true;actor.beta.certificationOnly=false;
 const d=await call('saveDraft',input);await send(d);assert.equal(sends,1);assert.equal(d.assistance.grantId,'ordinary_owner_reviewed_reply');
});

test('revoked scoped grant cannot authorize automatic or reviewed pilot sending',async()=>{
 const d=await draft();actor.beta.leadAssistanceGrant.status='revoked';await assert.rejects(send(d),/not active/);assert.equal(sends,0);
});

test('adaptive dispatcher freezes the actual assignment and exact variant without widening send authority',async()=>{
 const saved=(await policyRef().get()).data();saved.policy.adaptiveOutreach={enabled:true,objective:'qualified_conversation',alternative:{subject:'Which detail would help?',body:'Please reply with the question you want answered first.'}};saved.digest=digest(saved);await policyRef().set(saved);
 await Promise.all([svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}}),svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}})]);
 assert.equal(sends,1);
 const ops=await db.collection('businessMailboxes/owner/operations').get(),op=ops.docs[0].data();
 assert.ok(op.outreach.strategyId);assert.equal(op.outreach.objective,'qualified_conversation');assert.equal(op.approvalSource,'owner_email_policy');
 const approved=op.outreach.variant==='alternative'?saved.policy.adaptiveOutreach.alternative:saved.policy.templates.introduction;
 assert.equal(op.subject,approved.subject);assert.ok(op.body.startsWith(approved.body+'\n\n'));
 assert.equal((await db.collection('businessMailboxes/owner/outreachAssignments').get()).size,1);
 assert.equal((await db.collection('businessMailboxes/owner/outreachDecisions').get()).docs[0].data().decision,'HOLD');
 await assert.rejects(call('saveDraft',{assistanceKind:'introduction',customerId:'contact',subject:'Injected',body:'Injected',expectedVersion:1,outreachAssignmentId:'fabricated'}),/maintained dispatcher/);
 await svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends,1);
});

test('mature qualified evidence changes a future real dispatcher assignment, without changing its caps',async()=>{
 const adaptive=require('../functions-business-email/adaptive_outreach');
 const saved=(await policyRef().get()).data();saved.policy.adaptiveOutreach={enabled:true,objective:'qualified_conversation',alternative:{subject:'A useful next detail',body:'Which requested detail should we explain first?'}};saved.digest=digest(saved);await policyRef().set(saved);
 const strategyId=adaptive.strategy(saved.policy),cRef=db.doc('businessOperations/owner/customers/contact'),customer=(await cRef.get()).data();
 let accountId;for(let i=0;i<10000;i++){const candidate='future-account-'+i,identity=digest(candidate);if(adaptive.choose(identity,strategyId,'HOLD')==='baseline'&&adaptive.choose(identity,strategyId,'PREFER_ALTERNATIVE')==='alternative'){accountId=candidate;break;}}
 assert.ok(accountId);await cRef.update({accountId});const segmentId=adaptive.segment(customer),batch=db.batch();
 for(const variant of ['baseline','alternative'])for(let i=0;i<40;i++){
  const id=variant+i;batch.set(db.doc('businessMailboxes/owner/operations/'+id),{businessId:'owner',state:'sent',requestedAt:at-10*86400000,providerAcceptedAt:at-10*86400000,recipient:id+'@example.test',assistance:{kind:'introduction'},outreach:{strategyId,segmentId,variant,identity:id}});
  if(variant==='alternative')batch.set(db.doc('businessMailboxes/owner/outcomes/'+id),{businessId:'owner',operationId:id,outcome:'relevant_question',recordedAt:at-86400000});
 }await batch.commit();
 await svc.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends,1);
 const ops=await db.collection('businessMailboxes/owner/operations').get(),sent=ops.docs.map(d=>d.data()).find(o=>o.automatic);
 assert.equal(sent.outreach.variant,'alternative');assert.equal(sent.subject,saved.policy.adaptiveOutreach.alternative.subject);
 assert.equal((await policyRef().get()).data().policy.limits.initialPerDay,1);
 assert.equal((await db.collection('businessMailboxes/owner/outreachDecisions').get()).docs[0].data().decision,'PREFER_ALTERNATIVE');
});
