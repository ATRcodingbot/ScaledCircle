'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-generation-paid-path'},'paid-path'),db=app.firestore();
const bounds=require('./generation_paid_bounds'),image=require('./openai_image_adapter');
const {createSubjectCheck}=require('../functions-social-operations/social_creative_subject');
let calls,config,bytes,sha,check;
const result={subjectVisible:true,relevantToService:true,backgroundDominant:false,severeCrop:false,blankBands:false,logoOrWatermark:false,subjectFraction:.6,confidence:.9};
beforeEach(async()=>{
 for(const c of ['visualGenerationGrants','visualGenerationUsage','visualGenerationReservations','socialManagedPolicies','providerConfigurations','socialCreativeVisualAssessments','socialVisualCheckUsage'])await db.recursiveDelete(db.collection(c));
 config={providerGenerationEnabled:true,rolloutMode:'beta_cohort',betaCohortBusinessUids:['owner'],modelSnapshot:'gpt-image-2-2026-04-21',size:'1536x1024',quality:'medium',businessDailyMaximum:3,globalDailyMaximum:50,globalMonthlyMaximum:300,globalDailyCostMicros:10000000,globalMonthlyCostMicros:100000000};
 await db.doc('providerConfigurations/generated-service-visuals').set(config);
 const expires=Date.now()+86400000;
 await db.doc('socialManagedPolicies/owner').set({id:'policy',businessUid:'owner',status:'active',startsAt:1,endsAt:expires});
 await db.doc('visualGenerationGrants/owner').set({id:'grant',businessUid:'owner',policyId:'policy',status:'active',startsAt:1,expiresAt:expires,source:'internal_operating_grant',product:'social_creative_generation',maximumCostMicros:15000000,maximumConcepts:60});
 bytes=await require('sharp')({create:{width:100,height:100,channels:3,background:'#336688'}}).jpeg().toBuffer();sha=crypto.createHash('sha256').update(bytes).digest('hex');calls=0;
 check=client=>createSubjectCheck({db,clientFactory:async()=>({models:{list:async()=>({data:[{id:'gpt-4.1-mini'}]})},responses:{create:async(...args)=>{calls++;return client(...args);}}})});
});
after(()=>app.delete());
test('real review entry point reserves, settles rejected output and deduplicates delivery',async()=>{
 const subject=check(async request=>{assert.equal(request.max_output_tokens,1200);return {id:'response',usage:{input_tokens:1000,output_tokens:100},output_text:JSON.stringify({...result,blankBands:true})};});
 const input={uid:'owner',bytes,sha256:sha,service:'Product explanation'};
 assert.equal((await subject(input)).status,'blocked');await subject(input);assert.equal(calls,1);
 const usage=(await db.doc('visualGenerationUsage/grant_owner_grant').get()).data();assert.equal(usage.actualCostMicros,560);assert.equal(usage.outstandingCostMicros,0);assert.equal(usage.customerConsumedUnits,0);
});
test('review timeout retains money and cannot silently retry',async()=>{
 const subject=check(async()=>{throw Object.assign(Error('timeout'),{name:'AbortError'});}),input={uid:'owner',bytes,sha256:sha,service:'Product explanation'};
 await assert.rejects(subject(input));await assert.rejects(subject(input));assert.equal(calls,1);
 assert.equal((await db.doc('visualGenerationUsage/grant_owner_grant').get()).data().outstandingCostMicros,bounds.REVIEW_RESERVE);
});
test('review cannot dispatch without room in combined grant or during workspace hold',async()=>{
 const subject=check(async()=>{throw Error('must not call');}),input={uid:'owner',bytes,sha256:sha,service:'Product explanation'};
 await db.doc('visualGenerationGrants/owner').update({maximumCostMicros:1});await assert.rejects(subject(input),/budget_exhausted/);assert.equal(calls,0);
 await db.doc('providerConfigurations/generated-service-visuals').update({paidPreparationHolds:{owner:'reconcile_history'}});await assert.rejects(subject(input),/paid_preparation_held/);assert.equal(calls,0);
});
test('bounded image caller never retries billable uncertainty or 429 behind one reservation',async()=>{
 for(const status of [429,500]){let count=0;const adapter=image.createOpenAIImageAdapter({boundedAccounting:true,configProvider:async()=>config,clientFactory:async()=>({images:{generate:async()=>{count++;throw {status};}}})});await assert.rejects(adapter.generateServiceConcept({jobId:'image',brief:{serviceCategory:'Decks'}}));assert.equal(count,1);}
});
test('bounded image request rejects configuration drift and missing usage; charges moderation failure',async()=>{
 let count=0;
 const make=(cfg,response)=>image.createOpenAIImageAdapter({boundedAccounting:true,configProvider:async()=>cfg,clientFactory:async()=>({images:{generate:async()=>{count++;return response;}},moderations:{create:async()=>{throw Error('moderation failed');}}})});
 await assert.rejects(make({...config,size:'auto'},{}).generateServiceConcept({jobId:'image',brief:{}}),/outside_cost_bound/);assert.equal(count,0);
 await assert.rejects(make(config,{}).generateServiceConcept({jobId:'image',brief:{}}),e=>e.outcome==='unknown_provider_outcome');
 await assert.rejects(make(config,{data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens_details:{text_tokens:100,image_tokens:0},output_tokens:1372}}).generateServiceConcept({jobId:'image',brief:{}}),e=>e.providerAccepted&&e.cost.actualCostMicros===41660);
});

test('catalog authentication failure is explicitly pre-charge and does not reserve or call a paid model',async()=>{
 const subject=createSubjectCheck({db,clientFactory:async()=>({models:{list:async()=>{throw Error('secret provider response')}},responses:{create:async()=>{calls++;}}})});
 await assert.rejects(subject({uid:'owner',bytes,sha256:sha,service:'Product explanation'}),e=>e.preparationStage==='model_catalog'&&!e.message.includes('secret'));
 assert.equal(calls,0);assert.equal((await db.collection('visualGenerationReservations').get()).size,0);
});
