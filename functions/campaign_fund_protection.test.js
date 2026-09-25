'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const funds=require('./campaign_fund_allocation'),{inspect}=require('./campaign_fund_protection');
function fixture(){
 const payment={campaignId:'campaign',businessId:'business',status:'paid',paidAt:1,stripeMode:'live',currency:'usd',
   stripePaymentIntentId:'pi_fixture',businessChargeCents:12000,workerAmountCents:10000,platformFeeCents:2000};
 payment.fundingAllocation=funds.create('payment',payment);
 return {payment,account:{id:'acct_1U328bI9d5xWNArH'},balanceSettings:{payments:{payouts:{schedule:{interval:'manual'}}}},nowMs:Date.now(),
   balance:{livemode:true,available:[{currency:'usd',amount:11600}]},records:[{id:'payment',data:payment}],
   intent:{id:'pi_fixture',livemode:true,status:'succeeded',currency:'usd',amount_received:12000,
     latest_charge:{id:'ch_fixture',paid:true,livemode:true,disputed:false,refunded:false,amount_refunded:0,
       payment_intent:'pi_fixture',amount:12000,currency:'usd',
       balance_transaction:{id:'txn_fixture',source:'ch_fixture',currency:'usd',amount:12000,net:11600,fee:400,status:'available'}}}};
}
test('only actual source availability plus retained aggregate commitments supplies work-start proof',()=>{
 const x=fixture();assert.equal(inspect(x).netAvailableCents,11600);
 for(const change of [x=>x.balanceSettings.payments.payouts.schedule.interval='weekly',x=>x.intent.latest_charge.balance_transaction.status='pending',
   x=>x.intent.latest_charge.disputed=true,x=>x.intent.latest_charge.payment_intent='pi_other',
   x=>x.intent.livemode=false,x=>x.balance.available[0].amount=9999,
   x=>x.intent.latest_charge.balance_transaction.fee=500,x=>x.records.push({id:'legacy',data:{status:'paid'}})]) {
   const y=fixture();change(y);assert.throws(()=>inspect(y));
 }
});
test('other campaign obligations cannot be funded by this campaign surplus',()=>{
 const x=fixture(),other={...x.payment,campaignId:'other',stripePaymentIntentId:'pi_other'};
 other.fundingAllocation=funds.create('other',other);x.records.push({id:'other',data:other});
 assert.throws(()=>inspect(x),/committed_funds_shortfall/);
});
