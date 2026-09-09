'use strict';
// Integrated by the pinned production packager. Uses the maintained Smart Zone
// provider and completion policy; never provides an alternate mapping/payment API.
const contracts=require('./production_canvassing_contract');
const routes=require('./canvassing_route_authority');
const {hash}=require('./route_progress');
const {isCanvassing}=require('./canvassing_completion');
const version=contracts.VERSION;
const applies=campaign=>campaign.completionPolicyVersion===version;
const timestampMs=value=>typeof value?.toMillis==='function'?value.toMillis():null;

function effectiveFrom() {
  const value=Number(process.env.CANVASSING_POLICY_EFFECTIVE_FROM_MS);
  if(!Number.isSafeInteger(value)||value<=0)throw Error('new_canvassing_contracts_not_enabled');
  return value;
}
function prospective(campaign) {
  if(!isCanvassing(campaign.campaignType||campaign.type))return false;
  if(process.env.CANVASSING_NEW_CONTRACTS_ENABLED!=='true')throw Error('new_canvassing_contracts_not_enabled');
  const createdAtMs=timestampMs(campaign.createdAt);
  if(createdAtMs===null||createdAtMs<effectiveFrom())throw Error('create_new_campaign_and_regenerate_route');
  return true;
}
function planWithRoutes(input,plan,snapshot) {
  if(!prospective(input.campaign))return plan;
  const zones=plan.zones.map((zone,index)=>({...zone,...routes.derive({campaignId:input.campaignId,
    zoneId:`preview_${index}`,corridor:zone.geometry,snapshot})}));
  const routeReviewDigest=hash(zones.map(z=>({route:z.executionRoute,
    source:z.coverageAuthority.sourceSnapshotDigest})));
  return {...plan,zones,routeReviewDigest,completionPolicyVersion:version,
    planId:hash({plannerPlanId:plan.planId,routeReviewDigest})};
}
function mappedZone(input,zone,zoneId,reviewDigest,plan) {
  if(!isCanvassing(input.campaign.campaignType||input.campaign.type))return {};
  if(reviewDigest!==plan.routeReviewDigest||!zone.executionRoute||!zone.coverageAuthority)throw Error('explicit_route_review_required');
  return {executionRoute:zone.executionRoute,coverageAuthority:{...zone.coverageAuthority,
    zoneId,campaignId:input.campaignId,state:'approved',accessReviewed:true,
    reviewedBy:input.context.uid,reviewDigest},completionPolicyVersion:version};
}
function offerFor(campaignId,campaign,zones) {
  if(!applies(campaign)) {
    if(isCanvassing(campaign.campaignType||campaign.type))throw Error('regenerate_route_before_funding');
    return null;
  }
  const createdAtMs=timestampMs(campaign.createdAt);
  for(const zone of zones)routes.assertReady(zone,campaign);
  return contracts.prepareOffer({project:'scaled-circle',campaign:{...campaign,id:campaignId,status:'draft',createdAtMs},
    zones:zones.map(z=>({...z,status:'unassigned',assignedScalerId:null})),
    routeAuthorities:Object.fromEntries(zones.map(z=>[z.id,z.coverageAuthority])),
    baseAmountCents:Math.round(Number(campaign.basePay)*100),bonusAmountCents:Math.round(Number(campaign.bonus||0)*100),
    effectiveFromMs:effectiveFrom(),createdAtMs});
}
function quote(lifecycle,campaignId,campaign,zones) {
  if(applies(campaign)&&process.env.CANVASSING_NEW_CONTRACTS_ENABLED!=='true')throw Error('new_canvassing_contracts_not_enabled');
  const offer=offerFor(campaignId,campaign,zones);
  if(!offer)return lifecycle.quoteForCampaign(campaign);
  if(zones.some(z=>z.assignedScalerId||z.status!=='unassigned'))throw Error('unworked_zones_required');
  const base=settlementQuote(lifecycle,offer);
  return {...base,completionPolicyVersion:version,offerDigest:offer.offerDigest,acceptedOffer:offer,
    quoteDigest:hash({pricingDigest:base.quoteDigest,offerDigest:offer.offerDigest})};
}
function settlementQuote(lifecycle,offer){
  contracts.validateOffer(offer);
  const base=lifecycle.quoteForCampaign({workerCompensationCents:offer.workerReserveCents});
  // Funding and settlement must round at the same boundary. Each accepted Zone
  // is settled separately; rounding the aggregate can strand a cent or prevent
  // the last Scaler's otherwise valid base payment.
  const platformFeeCents=require('./campaign_funding_quote').feeForWorkerAmount(
    offer.baseAmountCents+offer.bonusAmountCents,base.platformFeeRateBasisPoints)*offer.bindings.length;
  const result={...base,platformFeeCents,totalChargeCents:base.workerAmountCents+platformFeeCents,
    businessChargeCents:base.workerAmountCents+platformFeeCents,settlementFeeBasis:'per_assignment_half_up'};
  return {...result,quoteDigest:lifecycle.quoteDigest(result)};
}
function assertFundedOffer(campaignId,campaign,zones,payment) {
  const offer=offerFor(campaignId,campaign,zones);
  if(!offer)return;
  if(payment?.status!=='paid'||payment.stripeMode!=='live'||campaign.fundingStatus!=='funded'||
      payment.campaignId!==campaignId||payment.businessId!==campaign.businessId||payment.currency!=='usd'||
      payment.offerDigest!==offer.offerDigest||payment.acceptedOffer?.offerDigest!==offer.offerDigest||
      payment.workerAmountCents!==offer.workerReserveCents||payment.settlementFrozen===true)throw Error('accepted_route_offer_not_funded');
  contracts.validateOffer(payment.acceptedOffer);
  return offer;
}
function applicationFields(campaign,request) {
  if(!applies(campaign)) {
    if(isCanvassing(campaign.campaignType||campaign.type))throw Error('campaign_route_requires_regeneration');
    return {};
  }
  contracts.validateOffer(campaign.acceptedOffer);
  if(request.acceptedOfferDigest!==campaign.acceptedOffer.offerDigest)throw Error('review_current_80_95_offer_before_applying');
  return {acceptedOfferDigest:campaign.acceptedOffer.offerDigest,completionPolicyVersion:version};
}
function assignment(campaignId,campaign,zone,application,payment,acceptedAtMs) {
  if(!applies(campaign)) {
    if(isCanvassing(campaign.campaignType||campaign.type))throw Error('campaign_route_requires_regeneration');
    return null;
  }
  if(application.counterofferAmountCents!=null)throw Error('counteroffer_requires_new_funded_accepted_offer');
  if(payment?.status!=='paid'||payment.stripeMode!=='live'||payment.settlementFrozen===true||
     campaign.fundingStatus!=='funded'||campaign.acceptedOffer?.offerDigest!==payment.offerDigest)throw Error('signed_funding_required');
  return contracts.acceptOffer({offer:campaign.acceptedOffer,zone,routeAuthority:zone.coverageAuthority,
    application:{...application,campaignId,zoneId:zone.id},
    payment:{...payment,status:'funded'},serverAcceptedAtMs:acceptedAtMs});
}
function publicOffer(campaign) {
  if(!applies(campaign)||!campaign.acceptedOffer)return {};
  const o=campaign.acceptedOffer;contracts.validateOffer(o);
  return {completionPolicyVersion:version,compensationOffer:{offerDigest:o.offerDigest,
    baseAmountCents:o.baseAmountCents,bonusAmountCents:o.bonusAmountCents,currency:o.currency,
    baseThresholdBasisPoints:8000,bonusThresholdBasisPoints:9500,coverageBasis:o.coverageBasis}};
}
module.exports={version,applies,prospective,planWithRoutes,mappedZone,quote,offerFor,
  assertFundedOffer,applicationFields,assignment,publicOffer,settlementQuote};
