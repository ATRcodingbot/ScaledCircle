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
