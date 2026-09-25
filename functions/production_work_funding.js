'use strict';

// Work-start authority reads the current campaign source, not checkout redirects
// or a historical funded flag. This is separate from provider cash protection.
function fail(reason) {
  const error = new Error('Campaign funding needs review before work can begin.');
  error.code = 'failed-precondition';
  error.reason = reason;
  throw error;
}
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid_funding_amount');
  return value;
}
function validate({campaign, zone, contract, payment, paymentId}) {
  if (!campaign || !zone || !contract || !payment || !paymentId ||
      campaign.fundingPaymentId !== paymentId || zone.fundingPaymentId !== paymentId ||
      payment.campaignId !== zone.campaignId || payment.businessId !== campaign.businessId ||
      zone.businessId !== campaign.businessId || contract.campaignId !== zone.campaignId ||
      contract.zoneId !== zone.id || contract.businessId !== campaign.businessId ||
      contract.scalerId !== zone.assignedScalerId || contract.immutable !== true) {
    fail('campaign_funding_binding_invalid');
  }
  if (campaign.fundingStatus !== 'funded' || campaign.status !== 'open' ||
      payment.status !== 'paid' || payment.stripeMode !== 'live' || !payment.paidAt ||
      !/^pi_[A-Za-z0-9]+$/.test(payment.stripePaymentIntentId || '') ||
      payment.currency !== 'usd') fail('signed_campaign_funding_required');
  for (const record of [campaign, zone, payment]) {
    if (record.settlementFrozen || record.disputeOpen || record.fundingReviewRequired ||
        record.refundRequestedAt || record.cancellationRequestedAt || record.settlementBlocked) {
      fail('campaign_funding_unusable');
    }
  }
  const maximum = cents(contract.baseAmountCents) + cents(contract.bonusAmountCents || 0);
  const worker = cents(payment.workerAmountCents);
  if (!Number.isSafeInteger(maximum) || maximum <= 0 ||
      cents(payment.businessChargeCents) !== worker + cents(payment.platformFeeCents)) {
    fail('campaign_funding_totals_invalid');
  }
  const used = ['transferredWorkerAmountCents', 'reservedWorkerAmountCents',
    'refundedWorkerAmountCents', 'refundReservedWorkerAmountCents']
    .reduce((total, key) => total + cents(payment[key] || 0), 0);
  if (!Number.isSafeInteger(used) || used + maximum > worker) fail('campaign_worker_funding_insufficient');
  // Accepted canvassing terms already bind each unique zone to the fully funded
  // offer; preserve that authority rather than creating another compensation plan.
  const policy = require('./production_work_settlement_policy');
  policy.contract(zone.id, zone, contract);
  policy.payment(payment, contract);
  if (payment.acceptedOffer.workerReserveCents !== worker ||
      campaign.acceptedOffer?.offerDigest !== contract.offerDigest) {
    fail('campaign_offer_funding_mismatch');
  }
  return {paymentId, maximumWorkerCents: maximum};
}
module.exports = {validate};
