'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const rewards = require('./scaler_referral_rewards');
const time = n => ({toMillis: () => n});
function fixture() {
  return {
    zoneId:'job', mode:'test',
    attribution:{scalerUid:'worker',affiliateUid:'referrer',policyVersion:rewards.VERSION,attributedAt:time(1)},
    affiliate:{affiliateUid:'referrer',status:'active',acceptedLaunchPolicyVersion:'referral-launch-v2-2026-09-10'},
    settlement:{policyVersion:'EarnedWorkReserveReturnV1',source:'ordinary_review',zoneId:'job',campaignId:'campaign',
      businessId:'business',scalerId:'worker',paymentId:'payment',earnedWorkerCents:10000,earnedFeeCents:2000,createdAt:time(2)},
    zone:{status:'completed',reviewStatus:'approved',campaignId:'campaign',businessId:'business',assignedScalerId:'worker',
      approvedTransferAmountCents:10000,approvedBaseAmountCents:9000,approvedBonusAmountCents:1000},
    payment:{status:'paid',paidAt:time(1),stripeMode:'test',currency:'usd',stripePaymentIntentId:'pi_test',
      campaignId:'campaign',businessId:'business',platformFeeRecognizedCents:2000},
    transfer:{status:'transfer_pending',zoneId:'job',scalerId:'worker',paymentId:'payment',campaignId:'campaign',businessId:'business',
      amountCents:10000,baseAmountCents:9000,bonusAmountCents:1000},
    contract:{immutable:true,zoneId:'job',scalerId:'worker',businessId:'business',campaignId:'campaign',baseAmountCents:9000,bonusAmountCents:1000},
  };
}
test('$100 final approved compensation earns a separate $1 from platform economics',()=>{
  const f=fixture(), before=JSON.stringify(f);
  assert.deepEqual(rewards.qualify(f),{qualifies:true,basisCents:10000,amountCents:100,reason:'approved_settled_work'});
  assert.equal(JSON.stringify(f),before);
  assert.equal(rewards.rewardAmount(1500),15);assert.equal(rewards.rewardAmount(1800),18);
  assert.throws(()=>rewards.rewardAmount(100.5));
});
test('signup, assignment, submitted, canceled, refunded, disputed and reversed work never qualify',()=>{
  for(const status of ['assigned','submitted','canceled','in_progress']){const f=fixture();f.zone.status=status;assert.equal(rewards.qualify(f).qualifies,false);}
  for(const mutate of [f=>delete f.settlement,f=>f.payment.status='refunded',f=>f.payment.settlementFrozen=true,
    f=>f.payment.disputedAmountCents=1,f=>f.transfer.status='reversed',f=>f.transfer.reversedAmountCents=1,
    f=>f.settlement.source='partial_settlement',f=>f.payment.stripeMode='live',f=>f.attribution.attributedAt=time(3),
    f=>f.attribution.affiliateUid='worker',f=>delete f.affiliate.acceptedLaunchPolicyVersion]){
    const f=fixture();mutate(f);assert.equal(rewards.qualify(f).qualifies,false);
  }
});
test('any attempted worker-pay reduction, bonus reduction or contract rewrite fails closed',()=>{
  for(const mutate of [f=>f.zone.approvedBaseAmountCents-=100,f=>f.zone.approvedBonusAmountCents-=100,
    f=>f.transfer.amountCents-=100,f=>f.transfer.bonusAmountCents-=100,f=>f.contract.baseAmountCents-=100,
    f=>f.contract.immutable=false,f=>f.settlement.earnedWorkerCents-=100,f=>f.payment.platformFeeRecognizedCents=0,
    f=>f.settlement.earnedFeeCents=99]){const f=fixture();mutate(f);assert.equal(rewards.qualify(f).qualifies,false);}
});
test('unearned reserve refund is allowed only when the exact return is reconciled',()=>{
  const f=fixture();Object.assign(f.settlement,{businessReturnCents:360,unusedWorkerCents:300,unusedFeeCents:60,returnStatus:'refunded'});
  f.payment.refundedTotalCents=360;f.refund={type:'unused_work_reserve_refund',status:'processed',paymentId:'payment',zoneId:'job',amountCents:360,workerRefundCents:300,platformFeeRefundCents:60};
  assert.equal(rewards.qualify(f).qualifies,true);f.payment.refundedTotalCents=361;assert.equal(rewards.qualify(f).qualifies,false);
});
test('reward reconciler is unavailable in production and has no payout or worker-money mutation authority',async()=>{
  const service=rewards.createService({db:{},FieldValue:{},project:'scaled-circle'});
  await assert.rejects(()=>service.reconcile('job'),/staging_only/);
  assert.equal(service.pay,undefined);assert.equal(service.makeAvailable,undefined);
  const source=require('node:fs').readFileSync(__filename.replace('.test.js','.js'),'utf8');
  assert.doesNotMatch(source,/\.transfers\.create|\.payouts\.create|\.charges\.create|tx\.(update|set)\(.*(?:wallet|contract|zone|payment|transfer)/i);
});
module.exports={fixture};
