'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-business-email'},'campaign-delivery'),db=app.firestore();
const {createService,hash}=require('../functions-business-email/service'),gmail=require('../functions-business-email/gmail');
const {sourceHash}=require('../functions-business-email/campaign_delivery');
const key=crypto.randomBytes(32).toString('base64');let service,beta,clock,sends,provider,threads;
const root=()=>db.doc('businessMailboxes/owner');
const call=(operation,input={},uid='owner')=>service.execute({auth:{uid},data:{businessId:'owner',operation,input}});
const msg=(id,from,to,body,subject='Deck inquiry',extra={})=>({id,threadId:'t'+id,internalDate:String(clock-86400000),payload:{mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')},headers:Object.entries({From:from,To:to,Subject:subject,...extra}).map(([name,value])=>({name,value}))}});
beforeEach(async()=>{
 for(const col of ['businessMailboxes','businessEmailUnsubscribeLinks','businessOperations'])for(const d of await db.collection(col).listDocuments())await db.recursiveDelete(d);
 clock=Date.parse('2026-09-13T15:00:00Z');sends=[];threads={};
 beta={mailbox:'owner@example.test',kind:'customer',campaignReadEnabled:true,campaignSendEnabled:true,sendEnabled:false,certificationOnly:true};
 provider={history:async(_,{q})=>{const email=q.match(/from:([^ ]+)/)?.[1];return {threads:email?[{id:email}]:[]};},
   thread:async(_,email)=>threads[email]||{id:email,messages:[msg(email,email,'owner@example.test','Please quote my deck.')]},
   send:async op=>{sends.push(op);return {id:'sent'+sends.length,threadId:'thread'+sends.length};},reconcileSent:async()=>null};
 service=createService({db,key,project:'demo-business-email',now:()=>clock,provider,authority:async r=>{
   if(r.auth?.uid!=='owner'||r.data?.businessId!=='owner')throw Object.assign(Error('Owner required'),{code:'permission-denied'});
   return {businessId:'owner',actorUid:'owner',beta,preferenceEnabled:()=>true};}});
 await root().set({businessId:'owner',status:'connected',provider:'google',email:'owner@example.test',subject:'google-owner',permissions:{read:true,send:true},generation:'gen',health:'connected',automaticSending:false});
 await root().collection('private').doc('credential').set({generation:'gen',sealed:gmail.seal({refreshToken:'private-emulator-token'},key,'BusinessMailboxV1/owner')});
});
after(async()=>{await db.terminate();await app.delete();});
async function prepare(count=1){
 const contacts=Array.from({length:count},(_,i)=>({name:'Person '+i,email:'p'+i+'@example.test',inquiryDate:'2025-06-01',context:'Requested a deck estimate'}));
 await call('importCampaignWorkbook',{sourceName:'Reviewed workbook.xlsx',sourceSha256:'a'.repeat(64),contacts});
 for(const c of contacts)await call('discoverCampaignHistory',{kind:'contact',candidateId:hash(c.email)});
 const candidates=(await call('loadCampaigns')).candidates;
 await call('saveCampaignDraft',{campaignId:'review',expectedVersion:0,title:'Prior inquiry',subject:'Your project',body:'Hi {{FirstName}},\nDo you still need help with {{ProjectType}}?',mailingAddress:'Business\n100 Business Way, Example, MD 21000',proposedSendAt:null,
   recipientIds:contacts.map(c=>hash(c.email)),recipientDetails:contacts.map((c,i)=>({candidateId:hash(c.email),sourceHash:sourceHash(candidates.find(p=>p.email===c.email)),firstName:'Person',projectType:'your deck'}))});
 return call('reviewCampaign',{campaignId:'review',refresh:true});
}
const approval=(d,sendAt=null)=>({campaignId:d.campaignId,version:d.version,reviewDigest:d.reviewDigest,sendAt,confirm:true});
test('review, edit and discovery never send; final explicit approval freezes subject and each body',async()=>{
 const d=await prepare();assert.equal(sends.length,0);assert.match(d.audience[0].body,/Hi Person/);assert.match(d.audience[0].body,/your deck/);assert.match(d.audience[0].body,/Unsubscribe/);
 await assert.rejects(call('approveCampaign',{...approval(d),confirm:false}));assert.equal(sends.length,0);
 await call('approveCampaign',approval(d));assert.equal(sends.length,1);
 await assert.rejects(call('saveCampaignDraft',{campaignId:'review',expectedVersion:1,title:'Changed',subject:'Changed',body:'Changed',mailingAddress:d.mailingAddress,recipientIds:d.audience.map(r=>r.candidateId),proposedSendAt:null}),/immutable/);
});
test('owner and invitation isolation, stale content and incomplete history fail closed',async()=>{
 const d=await prepare();await assert.rejects(call('approveCampaign',approval(d),'other'));
 beta.campaignSendEnabled=false;await assert.rejects(call('approveCampaign',approval(d)));beta.campaignSendEnabled=true;
 await assert.rejects(call('approveCampaign',{...approval(d),reviewDigest:'wrong'}));
 await root().collection('campaignControl').doc('optouts').update({complete:false});await assert.rejects(call('approveCampaign',approval(d)));assert.equal(sends.length,0);
});
test('repeated final taps and overlapping workers create one operation and provider attempt per recipient',async()=>{
 const d=await prepare(3);await Promise.all([call('approveCampaign',approval(d)),call('approveCampaign',approval(d))]);
 await Promise.all([service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}}),service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}})]);
 assert.equal(sends.length,3);assert.equal(new Set(sends.map(s=>s.to)).size,3);
 assert.equal((await root().collection('operations').get()).size,3);assert.equal((await root().collection('campaignVersions').get()).size,1);
});
test('suppression after review reduces audience and suppression discovered just before send skips it',async()=>{
 const d=await prepare(3);await root().collection('suppression').doc(hash('p0@example.test')).set({active:true,reason:'unsubscribed'});
 const result=await call('approveCampaign',approval(d,clock+60000));assert.equal(result.eligibleCount,2);assert.equal(sends.length,0);
 threads['p1@example.test']={id:'p1@example.test',messages:[msg('p1@example.test','p1@example.test','owner@example.test','Please unsubscribe me')]};
 clock+=60001;await service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}});
 assert.deepEqual(sends.map(s=>s.to),['p2@example.test']);const view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.status,'partially_sent');assert.equal(view.results.suppressed,2);
});
test('hour and day limits are shared; scheduled approval cannot execute early or expand its saved audience',async()=>{
 const d=await prepare(7);await call('approveCampaign',approval(d,clock+60000));assert.equal(sends.length,0);
 clock+=60001;for(let i=0;i<4;i++)await service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends.length,5);
 let view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.status,'partially_sent');assert.equal(view.results.sent,5);
 clock+=3600000;await service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends.length,7);
 view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.status,'sent');assert.equal(view.results.delivered,null);assert.equal(view.results.opens,null);
});
test('uncertain provider result stays reconciliation-only across approval and worker retries',async()=>{
 const d=await prepare(2);provider.send=async op=>{sends.push(op);throw Error('timeout after submission');};
 await call('approveCampaign',approval(d));await call('approveCampaign',approval(d));await service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}});
 assert.equal(sends.length,1);const view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.status,'needs_attention');assert.equal(view.results.sent,0);
});
test('sent mail binds existing CRM identity, preserves lifecycle and serializes contact cooldown',async()=>{
 await db.doc('businessOperations/owner/customers/existing').set({businessId:'owner',email:'p0@example.test',name:'Actual Customer',stage:'estimate_scheduled',version:2,emailOperationIds:[]});
 const d=await prepare();await call('approveCampaign',approval(d));
 const customer=(await db.doc('businessOperations/owner/customers/existing').get()).data();assert.equal(customer.stage,'estimate_scheduled');assert.equal(customer.emailOperationIds.length,1);
 assert.equal((await db.collection('businessOperations/owner/customers').get()).size,1);
 assert.equal(customer.campaignMembership.review.objective,'historical_inquiry → estimate_scheduled');
 assert((await db.collection('businessOperations/owner/contactAuthority').get()).docs[0].data().cooldownUntil>clock);
 const view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.results.appointments,0);assert.equal(view.results.won,0);
});
test('a held pre-provider operation needs explicit continuation; uncertain attempts cannot resume',async()=>{
 const d=await prepare();await db.doc('businessOperations/owner/contactAuthority/'+hash('p0@example.test')).set({cooldownUntil:clock+60000});
 await call('approveCampaign',approval(d));assert.equal(sends.length,0);
 await assert.rejects(call('resumeCampaign',{campaignId:'review',confirm:false}));
 clock+=60001;await call('resumeCampaign',{campaignId:'review',confirm:true});
 await service.syncCampaigns({auth:{uid:'owner'},data:{businessId:'owner'}});assert.equal(sends.length,1);
 const op=(await root().collection('operations').get()).docs[0];await op.ref.update({state:'needs_reconciliation'});
 await assert.rejects(call('resumeCampaign',{campaignId:'review',confirm:true}),/uncertain/);assert.equal(sends.length,1);
});
test('shared relationship readback distinguishes stages, unknown history and another channel cooldown',async()=>{
 const d=await prepare();assert.equal(d.audience[0].lifecycleStage,'unknown');
 await db.doc('businessOperations/owner/customers/known').set({email:'p0@example.test',stage:'estimate_scheduled',relationshipType:'past_customer',lastInboundAt:clock-1000});
 await db.doc('businessOperations/owner/contactAuthority/'+hash('p0@example.test')).set({cooldownUntil:clock+60000});
 const view=await call('reviewCampaign',{campaignId:'review'});assert.equal(view.audience[0].lifecycleStage,'estimate_scheduled');assert.equal(view.audience[0].relationshipType,'past_customer');
 assert.equal(view.eligibleCount,0);assert.match(view.audience[0].exclusion,/cooldown/);assert.equal(sends.length,0);
});
test('ambiguous CRM identity prevents the provider send without silently merging customers',async()=>{
 for(const id of ['a','b'])await db.doc('businessOperations/owner/customers/'+id).set({email:'p0@example.test',stage:'new_lead'});
 const d=await prepare();await call('approveCampaign',approval(d));assert.equal(sends.length,0);assert.equal((await call('reviewCampaign',{campaignId:'review'})).status,'needs_attention');
});
