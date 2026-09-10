'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retainedBasis}=require('./referral_business_reconciliation');
const {reward,summary,TYPES}=require('./referral_liability');
const {invoiceFixture}=require('./test_fixtures/referral_invoice');

test('Business commission is 10% collected net subscription, excludes tax, never subtracts processing fee',()=>{
  const f=invoiceFixture();assert.equal(retainedBasis(f).grossBasisCents,29900);assert.equal(reward(retainedBasis(f).currentBasisCents,1000),2990);
  f.invoice.amount_paid=21700;f.payments[0].amount_paid=21700;f.invoice.total_excluding_tax=19900;
  assert.equal(reward(retainedBasis(f).currentBasisCents,1000),1990);
  f.invoice.amount_paid=0;f.payments=[];assert.equal(retainedBasis(f).grossBasisCents,0);
});
test('credit/refund proportional adjustment has no double subtraction and restored disputes reread current status',()=>{
  const f=invoiceFixture();f.invoice.total_taxes=[];f.invoice.amount_paid=29900;f.payments[0].amount_paid=29900;
  f.refunds=[{id:'re_one',livemode:false,status:'succeeded',amount:10000}];
  assert.equal(reward(retainedBasis(f).currentBasisCents,1000),1990);
  f.creditNotes=[{id:'cn_one',livemode:false,invoice:'in_fixture',status:'issued',type:'post_payment',amount:10000,
    pre_payment_amount:0,refunds:[{refund:'re_one',amount_refunded:10000}]}];f.invoice.post_payment_credit_notes_amount=10000;
  assert.equal(reward(retainedBasis(f).currentBasisCents,1000),1990);
  f.disputes=[{id:'dp_one',livemode:false,status:'needs_response'}];assert.equal(retainedBasis(f).currentBasisCents,0);
  f.disputes[0].status='won';assert.equal(retainedBasis(f).currentBasisCents,19900);
});
test('nonrecurring/pass-through/mixed/unverified/after-cancellation/ambiguous economics fail closed',()=>{
  for(const change of [f=>f.invoice.livemode=true,f=>f.invoice.billing_reason='manual',f=>f.invoice.amount_shipping=100,
    f=>f.invoice.lines.data.push({price:'price_postage',amount:100}),f=>f.invoice.lines.has_more=true,
    f=>f.invoice.lines.data[0].proration=true,f=>f.payments[0].chargeVerified=false,
    f=>f.subscription.canceled_at=89,f=>f.invoice.amount_paid_off_stripe=29900,
    f=>f.refunds.push({id:'re_pending',status:'pending',livemode:false,amount:100})]){
    const f=invoiceFixture();change(f);assert.throws(()=>retainedBasis(f));
  }
  const f=invoiceFixture();f.subscription.canceled_at=101;assert.equal(retainedBasis(f).currentBasisCents,29900);
  delete f.subscription.canceled_at;assert.equal(retainedBasis(f).currentBasisCents,29900);
});
test('approved policy periods, cashout minimum and negative adjustments stay separate from pending',()=>{
  assert.equal(TYPES.BUSINESS_SUBSCRIPTION_REFERRAL.days,30);assert.equal(TYPES.SCALER_COMPLETED_WORK_REFERRAL.days,7);
  assert.equal(reward(10000,100),100);
  assert.deepEqual(summary([{currentCents:0,paidCents:2990,reservedCents:0,released:true},
    {currentCents:1000,paidCents:0,reservedCents:0,released:true},
    {currentCents:10000,paidCents:0,reservedCents:0,released:false}]),
    {availableCents:-1990,pendingCents:10000,paidCents:2990,reservedCents:0,cashoutMinimumCents:1000});
});
module.exports={invoiceFixture};

test('webhook authentication rejects bad signatures, LIVE and wrong account scopes before ledger access',async()=>{
  const Stripe=require('stripe'),secret='whsec_offline_fixture';
  const runtime=require('./referral_runtime').createRuntime({db:{},FieldValue:{},auth:{},project:'scaledcircle-staging',environment:'staging',
    key:'sk_test_offlinefixture',invoiceKey:'sk_test_offlinefixture',planForPrice:()=>null});
  const input=(event)=>{const rawBody=Buffer.from(JSON.stringify(event));return {secret,rawBody,signature:Stripe.webhooks.generateTestHeaderString({payload:rawBody.toString(),secret})};};
  await assert.rejects(runtime.economicWebhook({secret,rawBody:Buffer.from('{}'),signature:'bad'}));
  await assert.rejects(runtime.economicWebhook(input({id:'evt_offline',type:'invoice.paid',livemode:true})),/mode/);
  await assert.rejects(runtime.economicWebhook(input({id:'evt_offline',type:'invoice.paid',livemode:false,account:'acct_other'})),/mode/);
  await assert.rejects(runtime.payoutWebhook({...input({id:'evt_offline',type:'payout.paid',livemode:false,account:'acct_other'}),endpointScope:'platform'}));
  await assert.rejects(runtime.payoutWebhook({...input({id:'evt_offline',type:'payout.paid',livemode:false}),endpointScope:'connected'}));
  assert.deepEqual(await runtime.economicWebhook(input({id:'evt_offline',type:'unsupported',livemode:false})),{ignored:true});
  assert.throws(()=>require('./referral_runtime').createRuntime({project:'scaled-circle',environment:'production'}),/staging/);
});

test('only the verified payout.paid event can authorize a paid ledger movement',()=>{
 const {signedPaidProof}=require('./referral_runtime');const e={id:'evt_paid',account:'acct_referrer',type:'payout.paid',data:{object:{id:'po_one',status:'paid'}}};
 assert.deepEqual(signedPaidProof(e),{eventId:'evt_paid',accountId:'acct_referrer',payoutId:'po_one'});
 for(const type of ['payout.created','payout.updated','payout.failed','transfer.created'])assert.equal(signedPaidProof({...e,type}),null);
 assert.equal(signedPaidProof({...e,data:{object:{id:'po_one',status:'pending'}}}),null);
});
