'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('./production_work_funding');
const routes=require('./canvassing_route_authority');
const contracts=require('./production_canvassing_contract');
function fixture(){
  const a={latitude:40,longitude:-75},b={latitude:40.001,longitude:-75};
  const corridor=[{latitude:39.9999,longitude:-75.0001},{latitude:40.0011,longitude:-75.0001},
    {latitude:40.0011,longitude:-74.9999},{latitude:39.9999,longitude:-74.9999}];
  const route=routes.derive({campaignId:'campaign',zoneId:'zone',corridor,accessAcknowledged:true,
    snapshot:{source:'openstreetmap_bounded_snapshot_v1',routeWays:[{id:'road',geometry:[a,b],highway:'residential'}],exclusionPolygons:[]}});
  const zone={id:'zone',campaignId:'campaign',businessId:'business',status:'unassigned',serviceArea:corridor,...route};
  const offer=contracts.prepareOffer({project:'scaled-circle',campaign:{id:'campaign',businessId:'business',campaignType:'neighborhoodCanvassing',status:'draft',createdAtMs:2000},
    zones:[zone],routeAuthorities:{zone:zone.coverageAuthority},baseAmountCents:1000,bonusAmountCents:200,effectiveFromMs:1000,createdAtMs:2000});
  const contract=contracts.acceptOffer({offer,zone,routeAuthority:zone.coverageAuthority,serverAcceptedAtMs:3000,
    application:{campaignId:'campaign',zoneId:'zone',scalerId:'scaler',status:'pending',acceptedOfferDigest:offer.offerDigest},
    payment:{campaignId:'campaign',businessId:'business',status:'funded',currency:'usd',offerDigest:offer.offerDigest,workerAmountCents:1200}});
  return {paymentId:'payment',zone:{...zone,assignedScalerId:'scaler',fundingPaymentId:'payment'},contract:{...contract},
    campaign:{businessId:'business',status:'open',fundingStatus:'funded',fundingPaymentId:'payment',acceptedOffer:offer},
    payment:{campaignId:'campaign',businessId:'business',status:'paid',paidAt:123,stripeMode:'live',stripePaymentIntentId:'pi_fixture',currency:'usd',
      workerAmountCents:1200,platformFeeCents:240,businessChargeCents:1440,offerDigest:offer.offerDigest,acceptedOffer:offer}};
}
test('signed current campaign source and immutable route terms permit start without mutations',()=>{
  const f=fixture(),before=JSON.stringify(f);assert.deepEqual(validate(f),{paymentId:'payment',maximumWorkerCents:1200});assert.equal(JSON.stringify(f),before);
});
for(const status of ['created','payment_pending','payment_failed','checkout_expired','refund_pending','refunded','disputed','canceled']){
  test('denies current payment state '+status,()=>{const f=fixture();f.payment.status=status;assert.throws(()=>validate(f),{reason:'signed_campaign_funding_required'});});
}
test('rejects stale campaign flags and source without signed reconciliation',()=>{
  for(const change of [f=>f.payment=null,f=>delete f.payment.paidAt,f=>f.payment.stripeMode='test',f=>f.campaign.fundingStatus='payment_pending']){
    const f=fixture();change(f);assert.throws(()=>validate(f));
  }
});
test('refund, dispute, cancellation and reserved amounts prevent a new start',()=>{
  for(const key of ['settlementFrozen','disputeOpen','fundingReviewRequired','refundRequestedAt','cancellationRequestedAt']){
    const f=fixture();f.payment[key]=true;assert.throws(()=>validate(f),{reason:'campaign_funding_unusable'});
  }
  for(const key of ['transferredWorkerAmountCents','reservedWorkerAmountCents','refundedWorkerAmountCents','refundReservedWorkerAmountCents']){
    const f=fixture();f.payment[key]=1;assert.throws(()=>validate(f),{reason:'campaign_worker_funding_insufficient'});
  }
});
test('other campaign funds, changed terms and damaged totals cannot authorize this assignment',()=>{
  for(const change of [f=>f.payment.campaignId='other',f=>f.zone.fundingPaymentId='other',f=>f.contract.scalerId='other',
    f=>f.contract.baseAmountCents++,f=>f.payment.businessChargeCents++,f=>f.payment.workerAmountCents=-1]){
    const f=fixture();change(f);assert.throws(()=>validate(f));
  }
});
