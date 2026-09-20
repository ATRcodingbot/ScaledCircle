'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-inference-budget'},'email-budget'),db=app.firestore();
const b=require('../functions-business-email/inference_budget');let clock,store;
const grant=db.doc('emailAssistanceOperatingGrants/fixture');
beforeEach(async()=>{await db.recursiveDelete(grant);clock=Date.parse('2026-09-21T15:00:00Z');store=b.createStore({db,grantId:'fixture',now:()=>clock,allowedWorkspaces:['one','two']});
 await grant.set({purpose:'lead_email_assistance',status:'active',authorizedBy:'fixture-founder',authorizationReference:'fixture',provider:'openai',model:'gpt-4.1-mini',
 maximumCostMicros:b.LIMIT,maximumRequests:100,renewal:false,topUp:false,businessIds:['one','two'],startsAt:clock,expiresAt:clock+b.TERM});});
after(()=>app.delete());
const reserve=(businessId='one',requestId='request1')=>store.reserve({businessId,requestId,inputDigest:'exact_input'});
test('shared cap serializes concurrent workspaces, keeps unknown cost and does not reset on day changes',async()=>{
 await grant.collection('usage').doc('shared').set({requests:0,outstandingCostMicros:995200,actualCostMicros:0});
 const attempts=await Promise.allSettled([reserve('one'),reserve('two')]);assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 const r=attempts.find(x=>x.status==='fulfilled').value;await store.claim(r);await store.settle(r,null);
 assert.equal((await grant.collection('usage').doc('shared').get()).data().outstandingCostMicros,1000000);
 clock+=86400000;await assert.rejects(reserve('one','another'),/budget_exhausted/);
 await store.settle(r,{input_tokens:1000,output_tokens:100});await store.settle(r,{input_tokens:1000,output_tokens:100});
 const usage=(await grant.collection('usage').doc('shared').get()).data();assert.equal(usage.actualCostMicros,560);assert.equal(usage.outstandingCostMicros,995200);
});
test('one provider claim per request; cross-workspace, changed input, total request cap and exact expiry enforced',async()=>{
 const r=await reserve();assert.equal((await reserve()).reused,true);assert.deepEqual(await Promise.all([store.claim(r),store.claim(r)]).then(x=>x.sort()),[false,true]);
 await assert.rejects(store.reserve({businessId:'one',requestId:'request1',inputDigest:'changed'}),/request_changed/);
 await assert.rejects(reserve('other'),/binding_invalid/);
 await grant.collection('usage').doc('shared').update({requests:100});await assert.rejects(reserve('two'),/request_limit/);
 clock+=b.TERM;await assert.rejects(reserve(),/not_authorized/);
});
test('unactivated grant has no clock; over-bound provider usage remains reserved rather than optimistically released',async()=>{
 await grant.update({status:'prepared',startsAt:null,expiresAt:null});await assert.rejects(reserve(),/not_authorized/);
 await grant.update({status:'active',startsAt:clock,expiresAt:clock+b.TERM});const r=await reserve();await store.claim(r);
 assert.equal((await store.settle(r,{input_tokens:8001,output_tokens:100})).status,'unknown_provider_outcome');
 assert.equal((await grant.collection('usage').doc('shared').get()).data().outstandingCostMicros,4800);
});
