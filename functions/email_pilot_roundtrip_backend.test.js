'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-pilot-roundtrip'},'pilot-roundtrip'),db=app.firestore();
const {createService}=require('../functions-business-email/service'),gmail=require('../functions-business-email/gmail');
const {digest}=require('../functions-business-email/lead_assistance_policy');
after(()=>app.delete());
test('eligible introduction → classified reply → alerts → suggested/exact approved reply → accepted slot → one Schedule event',async()=>{
 for(const c of ['agentPermissions','businessMailboxes','businessOperations','users','notifications','mobileNotificationSignalReceipts','outboundEmailJobs','emailAssistanceOperatingGrants'])for(const ref of await db.collection(c).listDocuments())await db.recursiveDelete(ref);
 let at=Date.parse('2026-09-21T15:00:00Z'),sends=0,modelCalls=0;const messages=[];
 const key=Buffer.alloc(32,6).toString('base64');
 const actor={businessId:'owner',actorUid:'owner',beta:{mailbox:'owner@example.test',canManageConnection:true,sendEnabled:false,certificationOnly:true,
  leadAssistanceGrant:{status:'active',id:'fixture-pilot',product:'lead_email_assistance_pilot',businessId:'owner',mailbox:'owner@example.test',expiresAt:at+86400000,grantedBy:'Fixture Founder',reason:'Isolated emulator test'}}};
 const ops=require('../functions-business-operations/service').createService({db,FieldValue:admin.firestore.FieldValue,now:()=>at,
  authority:async request=>{assert.equal(request.auth.uid,'owner');assert.equal(request.data.businessId,'owner');return {businessId:'owner',actorUid:'owner',ownerUid:'owner',isOwner:true,permissions:[],activePaid:true,capacity:1,actorName:'Fixture owner'};}});
 await db.doc('users/owner').set({name:'Fixture Business'});
 await ops.execute({auth:{uid:'owner'},data:{businessId:'owner',operation:'saveSchedulingAvailability',requestId:'fixture_availability',input:{expectedVersion:0,settings:{timeZone:'America/New_York',days:[1,2,3,4,5],opensMinute:540,closesMinute:1020,durationMinutes:30,bufferMinutes:15,assignedPeople:['user:owner'],locationRequired:false}}}});
 const policy={expiresAt:at+86400000,introductionsEnabled:true,followupsEnabled:true,modelAssistance:true,modelDataConsent:true,bookingEnabled:true,availabilityRevision:1,
  businessName:'Fixture Business',services:['Fixture consultation'],voice:'Clear',claims:['Owner-maintained fixture service'],destinations:['https://example.test'],
  timeZone:'America/New_York',sendingDays:[1,2,3,4,5],opensMinute:540,closesMinute:1020,notifications:{email:true,push:true,quietStartMinute:1260,quietEndMinute:480},
  limits:{initialPerDay:1,followupsPerContact:1,followupIntervalHours:120},templates:{introduction:{subject:'Your requested information',body:'Here is the information you requested. Please reply with your questions.'}},mailingAddress:'Fixture-only public address'};
 const saved={businessId:'owner',status:'active',approvedBy:'owner',approvedAt:at-1000,connectionGeneration:'g1',sender:actor.beta.mailbox,policy};saved.digest=digest(saved);
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').set(saved);
 await db.doc('businessMailboxes/owner').set({businessId:'owner',provider:'google',status:'connected',email:actor.beta.mailbox,generation:'g1',permissions:{read:true,send:true}});
 await db.doc('businessMailboxes/owner/private/credential').set({generation:'g1',sealed:gmail.seal({refreshToken:'fixture'},key,'BusinessMailboxV1/owner')});
 await db.doc('businessOperations/owner/customers/contact').set({businessId:'owner',name:'Consenting fixture',email:'recipient@example.test',stage:'new_lead',version:1,
  emailPermission:{businessId:'owner',recipient:'recipient@example.test',status:'requested',purposes:['introduction','followup'],evidenceRef:'fixture-request',recordedBy:'owner',recordedAt:at-1000}});
 const mail=(id,from,to,subject,body,reference,sent=false)=>({id,threadId:'thread',internalDate:String(at),labelIds:sent?['SENT']:['INBOX'],payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')},headers:[{name:'From',value:from},{name:'To',value:to},{name:'Subject',value:subject},{name:sent?'Message-ID':'In-Reply-To',value:reference}]}});
 const provider={configured:true,send:async op=>{sends++;const id='sent_'+sends;messages.push(mail(id,op.from,op.to,op.subject,op.body,'<'+op.messageId+'>',true));return {id,threadId:'thread'};},thread:async()=>({id:'thread',messages})};
 const store=require('../functions-business-email/inference_budget').createStore({db,grantId:'fixture',now:()=>at,allowedWorkspaces:['owner','other']});
 await db.doc('emailAssistanceOperatingGrants/fixture').set({purpose:'lead_email_assistance',status:'active',authorizedBy:'fixture',authorizationReference:'fixture-only',provider:'openai',model:'gpt-4.1-mini',maximumCostMicros:1000000,maximumRequests:100,renewal:false,topUp:false,startsAt:at-1000,expiresAt:at-1000+7*86400000,businessIds:['owner','other']});
 const svc=createService({db,key,project:'demo-email-pilot-roundtrip',provider,scheduleService:ops,now:()=>at,authority:async request=>{assert.equal(request.auth.uid,'owner');assert.equal(request.data.businessId,'owner');return actor;},getOwner:async()=>({email:'owner@example.test',emailVerified:true}),
  runInference:async input=>require('../functions-business-email/inference').createInference({store,apiKey:'fixture-key',dataReview:{status:'verified',organization:'fixture-org',project:'fixture-project',evidenceRef:'fixture-review',trainingSharingDisabled:true,gmailProcessingPermitted:true,loggingMode:'per_call_store_false'},recheck:input.recheck,
   fetchImpl:async(_url,options)=>{modelCalls++;const request=JSON.parse(options.body);assert.equal(request.store,false);assert.equal(request.tools,undefined);return new Response(JSON.stringify({id:'fixture-response',status:'completed',usage:{input_tokens:500,output_tokens:80},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({summary:'The customer asks for a consultation.',subject:'Your consultation',body:'Thank you. We can review a suitable appointment time together.',requiresSchedulingReview:true})}]}]}));}})({businessId:'owner',requestId:input.requestId,context:input.context,conversation:input.conversation})});
 const req={auth:{uid:'owner'},data:{businessId:'owner'}};
 const call=(operation,input={})=>svc.execute({...req,data:{...req.data,operation,input}});
 await svc.syncReplies(req);assert.equal(sends,1);
 let first=(await db.collection('businessMailboxes/owner/operations').get()).docs[0];assert.equal(first.data().approvalSource,'owner_email_policy');
 at+=300001;messages.push(mail('inbound_1','recipient@example.test',actor.beta.mailbox,first.data().subject,'Could we arrange a consultation?','<'+first.data().messageId+'>'));
 await svc.syncReplies(req);assert.equal(modelCalls,1);
 const reply=(await db.doc('businessMailboxes/owner/replies/inbound_1').get()).data();assert.equal(reply.classification,'substantive');
 await require('../functions-mobile-notifications/signals').recordEmailReply({db,FieldValue:admin.firestore.FieldValue,businessId:'owner',replyId:'inbound_1',reply,now:()=>at});
 assert.equal((await db.collection('notifications').get()).size,1);
 at+=300001;await svc.syncReplies(req);assert.equal(modelCalls,1);assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
 const suggestion=await call('suggestReply',{operationId:first.id});assert.equal(suggestion.state,'needs_owner_review');assert.equal(sends,1);
 const context=await call('loadConversation',{operationId:first.id});
 const offered=await ops.execute({...req,data:{businessId:'owner',operation:'saveItem',requestId:'fixture_slot_offer',input:{expectedVersion:0,item:{title:'Fixture consultation',type:'meeting',customerId:'contact',startMs:at+3600000,durationMinutes:30,timeZone:'America/New_York',assignedPeople:['user:owner'],status:'tentative'},emailConversation:{operationId:first.id,inboundDigest:context.inboundDigest,availabilityVersion:1,authorizeAcceptedSlot:true}}}});
 const exactReply=suggestion.suggestion.body+'\nTo accept the reviewed time, reply with only:\nPlease book '+offered.acceptanceCode;
 const draft=await call('saveDraft',{assistanceKind:'reply',customerId:'contact',followupTo:first.id,subject:suggestion.suggestion.subject,body:exactReply,expectedVersion:context.draft.version,expectedInboundDigest:context.inboundDigest});
 await call('send',{prospectId:draft.prospectId,version:draft.version,operationId:draft.operationId,confirm:true});assert.equal(sends,2);
 at+=300001;messages.push(mail('acceptance','recipient@example.test',actor.beta.mailbox,draft.subject,'Please book '+offered.acceptanceCode,'<'+draft.operationId+'@mail.scaledcircle.com>'));
 await svc.syncReplies(req);await svc.syncReplies(req);
 const item=(await db.doc('businessOperations/owner/items/'+offered.itemId).get()).data();assert.equal(item.status,'scheduled');assert.equal(item.version,2);assert.equal(item.emailLink.confirmationEmailState,'not_requested');
 assert.equal((await db.collection('businessOperations/owner/items').get()).size,1);assert.equal(sends,2);
 assert.equal(item.emailLink.approvalSource,'owner_authorized_exact_slot_acceptance');
 assert.equal((await db.doc('businessOperations/owner/contactAuthority/'+digest('recipient@example.test')).get()).data().awaitingReply,false);
 assert.ok((await db.doc('emailAssistanceOperatingGrants/fixture/usage/shared').get()).data().requests<=3);
});
