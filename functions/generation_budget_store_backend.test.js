'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-generation-budget'},'generation-budget'),db=app.firestore();
const {createStore}=require('./generation_budget_store');
let clock,store;
const actor={uid:'owner'},expires=Date.parse('2026-10-20T00:00:00Z');
beforeEach(async()=>{
 for(const name of ['visualGenerationReservations','visualGenerationUsage','visualGenerationGrants','socialManagedPolicies','providerConfigurations','businessSubscriptions'])await db.recursiveDelete(db.collection(name));
 clock=Date.parse('2026-09-20T12:00:00Z');
 await db.doc('providerConfigurations/generated-service-visuals').set({providerGenerationEnabled:true,paidPreparationAccountingVersion:"combined_v1",authorizedBusinessUids:['owner','other'],businessDailyMaximum:60,globalDailyMaximum:100,globalMonthlyMaximum:300,maximumCostMicros:1000000,globalDailyCostMicros:100000000,globalMonthlyCostMicros:100000000});
 await db.doc('socialManagedPolicies/owner').set({id:'policy',businessUid:'owner',status:'active',startsAt:clock-1,endsAt:expires});
 await db.doc('visualGenerationGrants/owner').set({id:'grant',businessUid:'owner',policyId:'policy',status:'active',startsAt:clock-1,expiresAt:expires,source:'internal_operating_grant',product:'social_creative_generation',maximumCostMicros:15000000,maximumConcepts:60});
 store=createStore({db,now:()=>clock,resolveBusiness:()=>({eligible:false,monthlyAllowance:0})});
});
after(()=>app.delete());
const reserve=(id,cost=1000000,operation='generation')=>store.reserve({actor,jobId:id,maximumCostMicros:cost,operation});
const settle=(r,cost,success=true)=>store.reconcile({reservation:r,status:'settled',providerAccepted:true,customerConsumed:success,cost:{actualCostMicros:cost}});
test('concurrent reservations cannot spend the same lifetime balance',async()=>{
 const results=await Promise.allSettled(Array.from({length:5},(_,i)=>reserve('job'+i,5000000)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 assert.equal((await db.doc('visualGenerationUsage/grant_owner_grant').get()).data().outstandingCostMicros,15000000);
});
test('generation review and rejected retry share budget; duplicate reconciliation is harmless',async()=>{
 const first=await reserve('first',6000000);await settle(first,6000000,false);await settle(first,6000000,false);
 const review=await reserve('review',5000000,'review');await settle(review,5000000,false);
 await reserve('retry',4000000);await assert.rejects(reserve('extra',1),/budget_exhausted/);
 const state=(await db.doc('visualGenerationUsage/grant_owner_grant').get()).data();
 assert.equal(state.actualCostMicros,11000000);assert.equal(state.customerConsumedUnits,0);
});
test('rollover never replenishes grant; expiry and revocation reject calls but permit settlement',async()=>{
 const r=await reserve('september',14000000);await settle(r,14000000);
 clock=Date.parse('2026-10-01T12:00:00Z');await assert.rejects(reserve('october',2000000),/budget_exhausted/);
 const pending=await reserve('last',1000000);clock=expires;
 await assert.rejects(reserve('expired',1),/grant_inactive/);await settle(pending,800000);
 clock=expires-1;await db.doc('visualGenerationGrants/owner').update({revokedAt:clock});
 await assert.rejects(reserve('revoked',1),/grant_inactive/);
});
test('crash and uncertain outcome retain reservation; replay cannot claim a new attempt',async()=>{
 const r=await reserve('attempt',15000000);
 assert.equal((await reserve('attempt',15000000)).idempotentReplay,true);
 assert.equal(await store.claim({reservation:r}),true);
 assert.equal(await store.claim({reservation:r}),false);
 await store.reconcile({reservation:r,status:'unknown_provider_outcome'});
 await assert.rejects(store.reconcile({reservation:r,status:'released'}),/unresolved/);
 await assert.rejects(settle(r,null),/unresolved/);
 await assert.rejects(reserve('another',1),/budget_exhausted/);
});
test('concept slots are atomic; review is not another source and workspace cannot borrow a grant',async()=>{
 await db.doc('visualGenerationGrants/owner').update({maximumConcepts:1});
 const results=await Promise.allSettled([reserve('a'),reserve('b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const r=results.find(r=>r.status==='fulfilled').value;await settle(r,1000);
 const review=await reserve('review',1000,'review');await settle(review,1000,false);
 assert.equal((await db.doc('visualGenerationUsage/grant_owner_grant').get()).data().customerConsumedUnits,1);
 await assert.rejects(store.reserve({actor:{uid:'other'},jobId:r.jobId}),/access_denied/);
 await assert.rejects(store.reserve({actor:{uid:'other'},jobId:'other'}),/business_ineligible/);
});

test('ordinary eligible plan mode remains supported without inheriting another workspace grant',async()=>{
 await db.doc('providerConfigurations/generated-service-visuals').update({rolloutMode:'plan_entitled',authorizedBusinessUids:[]});
 const paid=createStore({db,now:()=>clock,resolveBusiness:()=>({eligible:true,plan:'managed_growth',monthlyAllowance:60})});
 const r=await paid.reserve({actor:{uid:'paid'},jobId:'paid'});
 assert.equal(r.grantId,null);assert.equal(r.usageIds.length,4);
 await db.doc('providerConfigurations/generated-service-visuals').update({globalDailyCostMicros:1000000});
 await assert.rejects(paid.reserve({actor:{uid:'paid'},jobId:'paid2'}),/global_budget_exhausted/);
});

test('revocation between reserve and dispatch blocks provider claim',async()=>{
 const r=await reserve('before-revoke');await db.doc('visualGenerationGrants/owner').update({revokedAt:clock});
 await assert.rejects(store.claim({reservation:r}),/grant_inactive/);
 assert.equal((await db.doc('visualGenerationReservations/before-revoke').get()).data().dispatchStartedAt,undefined);
});

test('legacy paid preparation fails closed without resetting entitlement or historical usage',async()=>{
 await db.doc('providerConfigurations/generated-service-visuals').update({paidPreparationAccountingVersion:admin.firestore.FieldValue.delete()});
 const paid=createStore({db,now:()=>clock,resolveBusiness:()=>({eligible:true,plan:'managed_growth',monthlyAllowance:60})});
 await db.doc('visualGenerationUsage/business_other_2026-09').set({actualCostMicros:321,customerConsumedUnits:4});
 await assert.rejects(paid.reserve({actor:{uid:'other'},jobId:'hold'}),/historical_preparation_accounting_required/);
 assert.equal((await db.doc('visualGenerationUsage/business_other_2026-09').get()).data().actualCostMicros,321);
});
