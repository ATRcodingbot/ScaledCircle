'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-new-inquiry'},'email-new-inquiry'),db=app.firestore();
const {createInquiries,messages}=require('../functions-business-email/inquiries');
const at=Date.parse('2026-09-21T15:00:00Z');let alerts,reads,reader,rows,queries;
const actor={businessId:'owner'};
const mail={status:'connected',provider:'google',generation:'g1',email:'owner@example.test',permissions:{read:true}};
const msg=(id,extra={})=>({id,threadId:'thread',labelIds:['INBOX','Label_Inquiries'],internalDate:String(at-100),payload:{mimeType:'text/plain',body:{data:Buffer.from('Can we discuss the service?').toString('base64url')},headers:[{name:'From',value:'person@example.test'},{name:'To',value:mail.email},{name:'Subject',value:'A genuine inquiry'}]},...extra});
beforeEach(async()=>{
 for(const col of ['agentPermissions','businessMailboxes','businessOperations','notifications','mobileNotificationSignalReceipts'])for(const ref of await db.collection(col).listDocuments())await db.recursiveDelete(ref);
 alerts=0;reads=0;queries=[];rows=[msg('m1')];
 await db.doc('businessMailboxes/owner').set(mail);
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').set({businessId:'owner',digest:'policy',status:'active',approvedAt:at-1000,connectionGeneration:'g1',policy:{expiresAt:at+86400000,newInquiriesEnabled:true,inquiryRoutingConfirmed:true,inquiryFilterDescription:'Founder-created automatic Gmail filter for the inquiry alias',inquiryLabel:'ScaledCircle-Inquiries'}});
 reader=createInquiries({db,now:()=>at,current:async()=>({c:(await db.doc('businessMailboxes/owner').get()).data(),secret:{}}),credentialAccess:()=>({credentials:{}}),adapter:()=>({history:async(_,input)=>{queries.push(input);return {threads:[{id:'thread'}]};},thread:async()=>{reads++;return {id:'thread',messages:rows};}}),alerts:{enqueue:async()=>alerts++}});
});
after(()=>app.delete());
test('new inquiries remain inside explicit label/authorization window; deduped into existing CRM identity',async()=>{
 await db.doc('businessOperations/owner/customers/existing').set({businessId:'owner',email:'person@example.test',name:'Existing contact',stage:'estimate_given',version:3});
 await Promise.all([reader(actor),reader(actor)]);await reader(actor);
 assert.ok(queries.every(q=>q.q.includes('label:ScaledCircle-Inquiries after:')&&q.maxResults===3));
 const ops=await db.collection('businessMailboxes/owner/operations').get();assert.equal(ops.size,1);assert.equal(ops.docs[0].data().state,'received');assert.equal(ops.docs[0].data().crmCustomerId,'existing');
 assert.equal((await db.collection('businessMailboxes/owner/replies').get()).size,1);assert.equal(alerts,1);
 assert.equal((await db.doc('businessOperations/owner/customers/existing').get()).data().stage,'estimate_given');
});
test('old, other-recipient, automated and attachment-only content cannot create an actionable inquiry',async()=>{
 const automated=msg('auto');automated.payload.headers.push({name:'Auto-Submitted',value:'auto-generated'});
 const wrong=msg('wrong');wrong.payload.headers[1].value='other@example.test';
 rows=[msg('old',{internalDate:String(at-5000)}),automated,wrong];await reader(actor);
 assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,0);assert.equal(alerts,0);
 assert.equal(messages({id:'thread',messages:[msg('attachment',{payload:{mimeType:'multipart/mixed',headers:[],parts:[{filename:'private.txt',mimeType:'text/plain',body:{data:Buffer.from('private').toString('base64url')}}]}})]},mail.email,at-1000).length,0);
});
test('disconnect during provider read prevents persistence and leaves recoverable readback',async()=>{
 const broken=createInquiries({db,now:()=>at,current:async()=>({c:mail,secret:{}}),credentialAccess:()=>({credentials:{}}),adapter:()=>({history:async()=>({threads:[{id:'thread'}]}),thread:async()=>{await db.doc('businessMailboxes/owner').update({status:'not_connected',generation:null});return {id:'thread',messages:rows};}}),alerts:{enqueue:async()=>alerts++}});
 assert.equal((await broken(actor)).state,'needs_review');assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,0);
 assert.equal((await db.doc('businessMailboxes/owner/private/inquirySync').get()).data().lease,null);
});

test('opt-out-only inquiry suppresses contact without creating a lead or alert',async()=>{
 rows=[msg('stop')];rows[0].payload.body.data=Buffer.from('Please unsubscribe me').toString('base64url');
 await reader(actor);await reader(actor);
 const suppression=await db.collection('businessMailboxes/owner/suppression').get();assert.equal(suppression.size,1);assert.equal(suppression.docs[0].data().active,true);
 assert.equal((await db.collection('businessOperations/owner/customers').get()).size,0);assert.equal(alerts,0);
});
test('unconfirmed routing and disabled intake never expand to a whole-mailbox query',async()=>{
 const p=db.doc('agentPermissions/owner_lead_generator/authorizations/business_email');
 await p.update({'policy.inquiryRoutingConfirmed':false});await reader(actor);assert.equal(queries.length,0);
 await p.update({'policy.newInquiriesEnabled':false});await reader(actor);assert.equal(queries.length,0);
});

test('linked inquiry replies stay monitored after the Gmail label is removed, with the real service and notification entrypoint',async()=>{
 await reader(actor);
 const original=(await db.collection('businessMailboxes/owner/operations').get()).docs[0];
 const key=Buffer.alloc(32,9).toString('base64'),gmail=require('../functions-business-email/gmail');
 await db.doc('businessMailboxes/owner/private/credential').set({generation:'g1',sealed:gmail.seal({refreshToken:'fixture'},key,'BusinessMailboxV1/owner')});
 const a={businessId:'owner',actorUid:'owner',beta:{mailbox:mail.email,canManageConnection:true,sendEnabled:false}};
 rows=[msg('m1',{labelIds:['INBOX']}),msg('m2',{labelIds:['INBOX'],internalDate:String(at+300000)})];
 let threadReads=0;
 const service=require('../functions-business-email/service').createService({db,key,project:'demo-email-new-inquiry',now:()=>at+300001,authority:async()=>a,provider:{configured:true,history:async()=>({threads:[]}),thread:async()=>{threadReads++;return {id:'thread',messages:rows};}}});
 await service.syncReplies({auth:{uid:'owner'},data:{businessId:'owner'}});
 assert.equal(threadReads,1);const reply=(await db.doc('businessMailboxes/owner/replies/m2').get()).data();assert.equal(reply.operationId,original.id);assert.equal(reply.classification,'substantive');
 const signals=require('../functions-mobile-notifications/signals');
 const result=await signals.recordEmailReply({db,FieldValue:admin.firestore.FieldValue,businessId:'owner',replyId:'m2',reply,now:()=>at+300001});assert.equal(result.created,true);
 const duplicate=await signals.recordEmailReply({db,FieldValue:admin.firestore.FieldValue,businessId:'owner',replyId:'m2',reply,now:()=>at+300001});assert.equal(duplicate.created,false);
});

test('whole Inbox requires no label/filter; a fresh request enters CRM and unrelated mail does not',async()=>{
 const ref=db.doc('agentPermissions/owner_lead_generator/authorizations/business_email');
 await ref.update({'policy.mailboxMode':'inbox','policy.inquiryLabel':'','policy.inquiryRoutingConfirmed':false,'policy.historyMode':'future'});
 await reader(actor);assert.ok(queries[0].q.startsWith('in:inbox after:'));
 assert.equal((await db.collection('businessMailboxes/owner/operations').get()).size,1);
 assert.equal((await db.doc('businessMailboxes/owner/private/inquirySync').get()).data().coverage,'inbox');
});
test('whole Inbox skips receipts, security codes and unrelated text without retaining CRM/body records',async()=>{
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').update({'policy.mailboxMode':'inbox'});
 rows=[msg('receipt'),msg('random')];rows[0].payload.headers[2].value='Payment receipt';rows[1].payload.body.data=Buffer.from('The weather is lovely today').toString('base64url');rows[1].payload.headers[2].value='Hello';
 const result=await reader(actor);assert.equal(result.unclassified,1);assert.equal(alerts,0);
 assert.equal((await db.collection('businessOperations/owner/customers').get()).size,0);assert.equal((await db.collection('businessMailboxes/owner/replies').get()).size,0);
});
test('paused, conversation-only and wrong mailbox generation do not begin intake',async()=>{
 const ref=db.doc('agentPermissions/owner_lead_generator/authorizations/business_email');
 await ref.update({status:'paused'});await reader(actor);assert.equal(reads,0);
 await ref.update({status:'active','policy.mailboxMode':'conversations'});await reader(actor);assert.equal(reads,0);
 await ref.update({'policy.mailboxMode':'inbox',connectionGeneration:'old'});await reader(actor);assert.equal(reads,0);
});
test('Inbox archives and pre-authorization history remain excluded',async()=>{
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').update({'policy.mailboxMode':'inbox'});
 rows=[msg('archive',{labelIds:[]}),msg('history',{internalDate:String(at-5000)})];await reader(actor);
 assert.equal((await db.collection('businessOperations/owner/customers').get()).size,0);
});
test('bounded fixed query window keeps pagination stable while new mail arrives',async()=>{
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').update({'policy.mailboxMode':'inbox'});
 let time=at,n=0;const q=[];
 const r=createInquiries({db,now:()=>time,current:async()=>({c:mail,secret:{}}),credentialAccess:()=>({credentials:{}}),adapter:()=>({history:async(_,input)=>{q.push(input);return n++===0?{threads:[],nextPageToken:'next'}:{threads:[]};}}),alerts:{enqueue:async()=>{}}});
 await r(actor);time+=300000;await r(actor);assert.equal(q[0].q,q[1].q);assert.equal(q[1].pageToken,'next');
 await r(actor);assert.notEqual(q[2].q,q[1].q);assert.ok(q[2].q.includes('after:'+Math.floor((at-1000)/1000)));
});


test('metadata adapter screens automated notices without fetching bodies; late-indexed inquiry remains eligible',async()=>{
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').update({'policy.mailboxMode':'inbox'});
 let time=at,full=0,kind='receipt';
 const registry=require('../functions-business-email/providers').createRegistry({google:{configured:true,
 history:async()=>({threads:[{id:'thread'}]}),
 threadMetadata:async(token)=>{assert.equal(token,'fixture');const m=msg('late');m.payload.body={};m.payload.headers[2].value=kind==='receipt'?'Payment receipt':'A genuine inquiry';return {id:'thread',messages:[m]};},
 thread:async()=>{full++;return {id:'thread',messages:[msg('late')]};}}});
 const r=createInquiries({db,now:()=>time,current:async()=>({c:mail,secret:{}}),credentialAccess:()=>({credentials:{refreshToken:'fixture'}}),adapter:()=>registry.get('google'),alerts:{enqueue:async()=>alerts++}});
 await r(actor);assert.equal(full,0);kind='inquiry';time+=300000;await r(actor);await r(actor);
 assert.equal((await db.collection('businessMailboxes/owner/replies').get()).size,1);assert.equal(alerts,1);
});

test('wrong workspace and revoked pilot access prevent provider reads',async()=>{
 await reader({businessId:'other'});assert.equal(reads,0);
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email').update({grantId:'grant'});
 await db.doc('agentPermissions/owner_lead_generator/authorizations/business_email_pilot_grant').set({id:'grant',businessId:'owner',status:'active',expiresAt:at+10000,revokedAt:at-1});
 await reader(actor);assert.equal(reads,0);
});
