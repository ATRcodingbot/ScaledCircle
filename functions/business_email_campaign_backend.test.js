'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-business-email'},'campaigns'),db=app.firestore();
const {createService,hash}=require('../functions-business-email/service'),gmail=require('../functions-business-email/gmail');
const {messages}=require('../functions-business-email/campaigns'),{createUnsubscribe}=require('../functions-business-email/unsubscribe');
const key=crypto.randomBytes(32).toString('base64');let beta,service,provider,reads,sends,clock,threads;
const call=(operation,input={},uid='owner')=>service.execute({auth:{uid},data:{businessId:'owner',operation,input}});
const contact=(name='One',email='one@example.test')=>({name,email,inquiryDate:'2025-06-01',context:'Owner-supplied estimate inquiry'});
const msg=(from,to,body,extra={})=>({id:'m1',threadId:'t1',internalDate:'1789214400000',payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')},headers:Object.entries({From:from,To:to,Subject:'Project inquiry',...extra}).map(([name,value])=>({name,value}))}});
const importRows=(contacts=[contact()])=>call('importCampaignWorkbook',{sourceName:'Founder workbook.xlsx',sourceSha256:'a'.repeat(64),contacts});
const draft=(extra={})=>call('saveCampaignDraft',{campaignId:'review',expectedVersion:0,title:'Past inquiry',subject:'Following up',body:'Do you still need help?',recipientIds:[hash('one@example.test')],mailingAddress:null,proposedSendAt:null,...extra});
beforeEach(async()=>{
 for(const c of ['businessMailboxes','businessEmailUnsubscribeLinks'])for(const d of await db.collection(c).listDocuments())await db.recursiveDelete(d);
 clock=1789214400000;reads=0;sends=0;threads={t1:{id:'t1',messages:[msg('one@example.test','owner@example.test','Can you quote my deck?')]}};
 beta={mailbox:'owner@example.test',configured:true,sendEnabled:false,certificationSendEnabled:false,campaignReadEnabled:true};
 provider={history:async()=>{reads++;return {threads:[{id:'t1'}]};},thread:async(_,id)=>threads[id],send:async()=>{sends++;throw Error('Send forbidden');}};
 service=createService({db,key,project:'demo-business-email',now:()=>clock,provider,authority:async r=>{if(r.auth?.uid!=='owner')throw Object.assign(Error('Owner required'),{code:'permission-denied'});return {businessId:'owner',actorUid:'owner',beta,preferenceEnabled:()=>true};}});
 await db.doc('businessMailboxes/owner').set({businessId:'owner',status:'connected',provider:'google',email:'owner@example.test',permissions:{read:true,send:false},generation:'g',automaticSending:false});
 await db.doc('businessMailboxes/owner/private/credential').set({generation:'g',sealed:gmail.seal({refreshToken:'test-only'},key,'BusinessMailboxV1/owner')});
});
after(async()=>{await db.terminate();await app.delete();});
test('private owner gate rejects uninvited and internal workspaces without provider reads',async()=>{
 await assert.rejects(call('loadCampaigns',{},'other'));beta.campaignReadEnabled=false;await assert.rejects(call('loadCampaigns'));beta.campaignReadEnabled=true;beta.kind='internal';await assert.rejects(call('discoverCampaignHistory',{kind:'optouts'}));assert.equal(reads,0);
});
test('workbook exact email dedup preserves provenance without consent or customer-outcome inference',async()=>{
 await importRows();await importRows();const d=(await call('loadCampaigns')).candidates[0];assert.equal(d.sources.length,1);assert.equal(d.sources[0].sha256,'a'.repeat(64));assert.equal(d.reviewedForSend,false);assert.equal(d.roleReviewRequired,true);
 await assert.rejects(importRows([contact(),contact()]));await assert.rejects(importRows(Array.from({length:26},(_,i)=>contact('Person','p'+i+'@example.test'))));assert.equal(sends,0);
});
test('Gmail history binds the exact connected owner, merges evidence and never sends or qualifies',async()=>{
 await importRows();await call('discoverCampaignHistory',{kind:'contact',candidateId:hash('one@example.test')});await call('discoverCampaignHistory',{kind:'contact',candidateId:hash('one@example.test')});
 const d=(await call('loadCampaigns')).candidates[0];assert.equal(d.sources.length,2);assert.equal(d.evidence.length,1);assert.equal(d.status,'needs_review');assert.equal(d.reviewedForSend,false);assert.equal(sends,0);
 await db.doc('businessMailboxes/owner').update({email:'support@example.test'});await assert.rejects(call('discoverCampaignHistory',{kind:'optouts'}));assert.equal(reads,2);
});
test('exact recipient parsing ignores a substring identity and quoted/automated opt-outs',()=>{
 assert.equal(messages({id:'t1',messages:[msg('one@example.test','notowner@example.test','Please unsubscribe me')]},'owner@example.test').length,0);
 const quoted=messages({id:'t1',messages:[msg('one@example.test','owner@example.test','Thanks!\nOn Monday wrote:\nPlease unsubscribe me')]},'owner@example.test');assert.equal(quoted[0].optout,false);
 const auto=messages({id:'t1',messages:[msg('news@example.test','owner@example.test','Please unsubscribe me',{'List-Unsubscribe':'<https://example.test>'})]},'owner@example.test');assert.equal(auto[0].optout,false);assert.equal(auto[0].automated,true);
});
test('known workbook email in a form is indirect provenance, not the form sender as a customer or inferred consent',async()=>{
 await importRows();threads.t1.messages=[msg('forms@example.test','owner@example.test','Customer email: one@example.test\nDeck estimate requested. Please unsubscribe me',{'Auto-Submitted':'auto-generated'})];
 await call('discoverCampaignHistory',{kind:'contact',candidateId:hash('one@example.test')});const d=(await call('loadCampaigns')).candidates;
 assert.equal(d.length,1);assert.equal(d[0].email,'one@example.test');assert.equal(d[0].status,'needs_review');assert.equal(d[0].evidence[0].indirectEvidence,true);assert.equal(d[0].evidence[0].optout,false);assert.equal(d[0].reviewedForSend,false);
});
test('reliable inbound opt-out suppresses once and blocks proposed audience',async()=>{
 await importRows();threads.t1.messages=[msg('one@example.test','owner@example.test','Please unsubscribe me from these messages.')];
 await call('discoverCampaignHistory',{kind:'optouts'});await call('discoverCampaignHistory',{kind:'optouts'});const result=await call('loadCampaigns');assert.equal(result.suppression.length,1);assert.equal(result.suppression[0].reason,'unsubscribed');assert.equal((await db.collection('businessMailboxes/owner/contactHistory').get()).size,1);await assert.rejects(draft(),/excluded|restricted/);assert.equal(sends,0);
});
test('pagination and read errors remain incomplete rather than claiming no prior opt-outs',async()=>{
 provider.history=async()=>({threads:[{id:'missing'}],nextPageToken:'next'});service=createService({db,key,project:'demo-business-email',provider,authority:async()=>({businessId:'owner',actorUid:'owner',beta,preferenceEnabled:()=>true})});
 const d=await call('discoverCampaignHistory',{kind:'optouts'});assert.equal(d.complete,false);assert.equal(d.errors,1);assert.equal((await call('loadCampaigns')).history.complete,false);
});
test('connection changes during read prevent storing provider evidence',async()=>{
 provider.history=async()=>{await db.doc('businessMailboxes/owner').update({generation:'changed'});return {threads:[{id:'t1'}]};};service=createService({db,key,project:'demo-business-email',provider,authority:async()=>({businessId:'owner',actorUid:'owner',beta,preferenceEnabled:()=>true})});
 await assert.rejects(call('discoverCampaignHistory',{kind:'optouts'}));assert.equal((await call('loadCampaigns')).candidates.length,0);
});
test('all maintained restriction reasons block audience and retain actor audit',async()=>{
 for(const reason of ['unsubscribed','do_not_contact','bounced','invalid','suppressed']){await importRows();await call('restrictCampaignContact',{candidateId:hash('one@example.test'),reason});await assert.rejects(draft());}
 assert.equal((await db.collection('businessMailboxes/owner/contactHistory').get()).size,5);assert.equal(sends,0);
});
test('draft cannot send, schedule, claim delivery, or proceed without address; optimistic version checked',async()=>{
 await importRows();const d=await draft();assert.equal(d.status,'needs_mailing_address');assert.equal(d.approved,false);assert.equal(d.scheduled,false);assert.equal(d.results.delivered,null);assert.equal(d.audience[0].reviewRequired,true);
 await assert.rejects(draft());await assert.rejects(call('sendCampaign'));await assert.rejects(call('scheduleCampaign'));assert.equal(sends,0);
 assert.equal((await db.collection('businessMailboxes/owner/contactHistory').get()).size,1);
});
test('unsubscribe link GET is read-only; confirmation is idempotent, tenant-bound and no-login',async()=>{
 await importRows();const d=await draft(),token=new URL(d.audience[0].unsubscribeUrl).searchParams.get('token'),unsubscribe=createUnsubscribe({db,now:()=>clock});
 assert.deepEqual(await unsubscribe(token),{valid:true,unsubscribed:false});assert.equal((await call('loadCampaigns')).suppression.length,0);
 await Promise.all([unsubscribe(token,{confirm:true}),unsubscribe(token,{confirm:true})]);assert.equal((await call('loadCampaigns')).suppression.length,1);
 assert.equal((await db.collection('businessMailboxes/owner/contactHistory').where('action','==','unsubscribed').get()).size,1);
 await assert.rejects(unsubscribe('bad'));await assert.rejects(unsubscribe('b'.repeat(43)));await assert.rejects(draft({expectedVersion:1}));assert.equal(sends,0);
});
