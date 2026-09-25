'use strict';
// Read-only provider verification. Never creates a Stripe resource or changes settings.
const funds=require('./campaign_fund_allocation');
function fail(reason){const e=Error(reason);e.code='failed-precondition';throw e;}
function cents(n){if(!Number.isSafeInteger(n)||n<0)fail('provider_amount_invalid');return n;}
function inspect({payment,account,balanceSettings,intent,balance,records,nowMs}) {
  if(account?.id!=='acct_1U328bI9d5xWNArH'||balance?.livemode!==true)fail('platform_identity_invalid');
  if(balanceSettings?.payments?.payouts?.schedule?.interval!=='manual')fail('platform_payout_retention_required');
  const charge=intent?.latest_charge, transaction=charge?.balance_transaction;
  if(intent?.id!==payment.stripePaymentIntentId||intent.livemode!==true||intent.status!=='succeeded'||
     intent.currency!=='usd'||intent.amount_received!==payment.businessChargeCents||
     charge?.paid!==true||charge.livemode!==true||charge.disputed||charge.refunded||charge.amount_refunded!==(payment.refundedTotalCents||0)||
     charge.payment_intent!==intent.id||charge.amount!==payment.businessChargeCents||charge.currency!=='usd'||
     transaction?.currency!=='usd'||transaction.amount!==payment.businessChargeCents||
     !transaction.id||transaction.source!==charge.id)fail('campaign_provider_source_unverified');
  if(transaction.status!=='available')fail('campaign_funds_pending');
  const fee=cents(transaction.fee);
  const net=cents(transaction.net)-cents(charge.amount_refunded)-cents(payment.transferredWorkerAmountCents||0);
  const remainingWorker=payment.workerAmountCents-cents(payment.refundedWorkerAmountCents||0)-cents(payment.transferredWorkerAmountCents||0);
  if(transaction.net+fee!==payment.businessChargeCents||net<remainingWorker)fail('campaign_net_funding_insufficient');
  const available=balance?.available?.find(x=>x.currency==='usd')?.amount;
  if(!Number.isSafeInteger(available))fail('platform_available_balance_unknown');
  let required=0;
  for(const record of records){
    const p=record.data, a=p.fundingAllocation;
    if(!a){
      if(['paid','funded','disputed','refund_pending','refund_review_required'].includes(p.status))fail('legacy_campaign_allocation_review_required');
      continue;
    }
    const summary=funds.view(record.id,p);
    required+=summary.unresolvedHeldCents+cents(p.platformFeeRefundReservedCents||0);
  }
  if(!Number.isSafeInteger(required)||available<required)fail('platform_committed_funds_shortfall');
  return {version:funds.VERSION,paymentIntentId:intent.id,withdrawalControl:'committed_funds_retained',
    sourceAvailable:true,providerBalanceTransactionId:transaction.id,verifiedAtMs:nowMs,
    netAvailableCents:net,providerFeeCents:fee};
}
function assertRefundCapacity({paymentId,amountCents,balance,records,workerReleaseCents=0,feeReleaseCents=0}) {
  cents(workerReleaseCents);cents(feeReleaseCents);
  cents(amountCents);const available=balance?.available?.find(x=>x.currency==='usd')?.amount;
  if(balance?.livemode!==true||!Number.isSafeInteger(available))fail('refund_available_funds_unknown');
  let committed=0;
  for(const record of records) {
    const p=record.data;
    if(!p.fundingAllocation){if(['paid','funded','disputed','refund_pending','refund_review_required'].includes(p.status))fail('legacy_campaign_allocation_review_required');continue;}
    const view=funds.view(record.id,p);
    if(record.id===paymentId&&workerReleaseCents>view.uncommittedWorkerCents)fail('earned_funds_not_refundable');
    committed+=view.unresolvedHeldCents-(record.id===paymentId?workerReleaseCents:0);
    committed+=Math.max(0,cents(p.platformFeeRefundReservedCents||0)-(record.id===paymentId?feeReleaseCents:0));
  }
  if(available-committed<amountCents)fail('refund_would_use_committed_funds');
}
async function refresh({db,stripe,paymentId,now=Date.now}) {
  const ref=db.doc('campaignPayments/'+paymentId),initial=(await ref.get()).data();
  funds.checked(paymentId,initial);
  const [account,balanceSettings,intent,balance]=await Promise.all([stripe.accounts.retrieve(),stripe.balanceSettings.retrieve(),
    stripe.paymentIntents.retrieve(initial.stripePaymentIntentId,{expand:['latest_charge.balance_transaction']}),stripe.balance.retrieve()]);
  return db.runTransaction(async tx=>{
    const [current,all]=await Promise.all([tx.get(ref),tx.get(db.collection('campaignPayments').limit(501))]);
    if(all.size>500)fail('campaign_allocation_inventory_review_required');
    const p=current.data();funds.checked(paymentId,p);
    const proof=inspect({payment:p,account,balanceSettings,intent,balance,records:all.docs.map(d=>({id:d.id,data:d.data()})),nowMs:now()});
    const next={...p.fundingAllocation,providerFeeCents:proof.providerFeeCents,providerAvailableCents:proof.netAvailableCents,
      revision:p.fundingAllocation.revision+1};
    funds.persist(tx,ref,p.fundingAllocation,next,'provider_funds_verified',now());
    tx.update(ref,{fundingProtection:proof});return proof;
  });
}
module.exports={inspect,refresh,assertRefundCapacity};
