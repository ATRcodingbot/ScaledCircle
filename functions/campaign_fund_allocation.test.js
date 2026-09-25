'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const f=require('./campaign_fund_allocation');
function fixture(){
 const p={campaignId:'campaign',businessId:'business',currency:'usd',status:'paid',paidAt:1,stripeMode:'live',
 stripePaymentIntentId:'pi_fixture',businessChargeCents:12000,workerAmountCents:10000,platformFeeCents:2000};
 p.fundingAllocation=f.create('payment',p);
 const c={immutable:true,contractDigest:'digest',campaignId:'campaign',businessId:'business',zoneId:'zone',scalerId:'scaler',currency:'usd',baseAmountCents:8000,bonusAmountCents:2000};
 p.fundingProtection={version:f.VERSION,paymentIntentId:p.stripePaymentIntentId,withdrawalControl:'committed_funds_retained',
 sourceAvailable:true,providerBalanceTransactionId:'txn_fixture',verifiedAtMs:Date.now(),netAvailableCents:11600};
 return {p,c};
}
test('payment -> exact reserve -> start -> earning -> paid remains same obligation',()=>{
 const {p,c}=fixture();p.fundingAllocation=f.reserve('payment',p,c);p.fundingAllocation=f.start('payment',p,c);
 p.fundingAllocation=f.earn('payment',p,c,8000);assert.equal(f.view('payment',p).workerEarnedCents,8000);
 p.fundingAllocation=f.paid('payment',p,c,{operationId:'cashout',amountCents:8000});
 assert.equal(f.view('payment',p).workerPaidCents,8000);
 assert.deepEqual(f.paid('payment',p,c,{operationId:'cashout',amountCents:8000}),p.fundingAllocation);
 assert.throws(()=>f.paid('payment',p,c,{operationId:'second',amountCents:1}),/already_paid/);
});
test('source/contract mismatch, missing allocation, double allocation and insufficient cash deny',()=>{
 const {p,c}=fixture();assert.throws(()=>f.assertStart('payment',p,c),/reserve_required/);
 p.fundingAllocation=f.reserve('payment',p,c);
 assert.throws(()=>f.reserve('payment',p,{...c,zoneId:'second'}),/exhausted/);
 assert.throws(()=>f.reserve('payment',p,{...c,scalerId:'other'}),/reserve_required/);
 assert.throws(()=>f.reserve('otherPayment',p,c),/allocation_required/);
 for(const status of ['payment_pending','payment_failed','canceled','refunded','disputed'])assert.throws(()=>f.assertStart('payment',{...p,status},c));
 assert.throws(()=>f.assertStart('payment',{...p,fundingProtection:null},c),/cash_protection_required/);
 assert.throws(()=>f.assertStart('payment',{...p,fundingAllocation:null},c),/allocation_required/);
 assert.throws(()=>f.assertStart('payment',{...p,fundingProtection:{...p.fundingProtection,netAvailableCents:9999}},c));
});
test('unstarted refunded reserve is released, but started and earned obligations survive source loss',()=>{
 const a=fixture();a.p.fundingAllocation=f.reserve('payment',a.p,a.c);
 a.p.fundingAllocation=f.sourceState('payment',a.p,'refunded');a.p.status='refunded';
 assert.equal(f.view('payment',a.p).workerReserveCents,0);assert.equal(a.p.fundingAllocation.refundedWorkerCents,10000);
 const {p,c}=fixture();p.fundingAllocation=f.reserve('payment',p,c);p.fundingAllocation=f.start('payment',p,c);
 p.fundingAllocation=f.sourceState('payment',p,'disputed');p.status='disputed';
 p.fundingAllocation=f.earn('payment',p,c,10000);assert.equal(f.view('payment',p).workerEarnedCents,10000);
 assert.equal(f.view('payment',p).fundingState,'disputed');assert.equal(f.view('payment',p).replacementFundingRequired,true);
 p.fundingAllocation=f.paid('payment',p,c,{operationId:'cashout',amountCents:10000,replacementFundingId:'verified_recovery'});
 assert.throws(()=>f.paid('payment',p,c,{operationId:'duplicateRecovery',amountCents:10000,replacementFundingId:'another'}));
 p.fundingAllocation=f.reopen('payment',p,c,'cashout');assert.equal(f.view('payment',p).workerPaidCents,0);
 p.fundingAllocation=f.paid('payment',p,c,{operationId:'cashout',amountCents:10000,replacementFundingId:'verified_recovery'});
 assert.equal(f.view('payment',p).workerPaidCents,10000);
});
test('withdrawal excludes all worker money, unearned fees, other commitments and unknown provider fees',()=>{
 const {p,c}=fixture();let a=p.fundingAllocation;
 assert.equal(f.withdrawal({availableCents:12000,allocations:[a],providerControlVerified:true}),0);
 a.providerFeeCents=400;a.providerAvailableCents=11600;
 assert.equal(f.withdrawal({availableCents:11600,allocations:[a],providerControlVerified:true}),0);
 p.fundingAllocation=f.reserve('payment',p,c);p.fundingAllocation=f.start('payment',p,c);p.fundingAllocation=f.earn('payment',p,c,10000);
 a=p.fundingAllocation;
 assert.equal(f.withdrawal({availableCents:11600,allocations:[a],providerControlVerified:true}),1600);
 assert.equal(f.withdrawal({availableCents:10000,allocations:[a],providerControlVerified:true}),0);
 assert.equal(f.withdrawal({availableCents:11600,allocations:[a],otherCommittedCents:500,providerControlVerified:true}),1100);
 assert.equal(f.withdrawal({availableCents:11600,allocations:[a]}),0);
});
test('unused-work refunds are idempotent and cannot consume an earned obligation',()=>{
 const {p,c}=fixture();p.fundingAllocation=f.reserve('payment',p,c);p.fundingAllocation=f.start('payment',p,c);
 p.fundingAllocation=f.earn('payment',p,c,8000);
 const request={operationId:'unused',workerCents:2000,feeCents:400};
 p.fundingAllocation=f.refund('payment',p,request);
 assert.deepEqual(f.refund('payment',p,request),p.fundingAllocation);
 assert.equal(f.view('payment',p).workerEarnedCents,8000);
 assert.throws(()=>f.refund('payment',p,{operationId:'excess',workerCents:1,feeCents:0}));
 p.fundingAllocation=f.refund('payment',p,{...request,reversed:true});
 assert.equal(p.fundingAllocation.releasedWorkerCents,2000);assert.equal(p.fundingAllocation.refundedWorkerCents,0);
});
module.exports={fixture};
