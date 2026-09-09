'use strict';

// Resolve only explicit references. Never search for a payment by amount or owner.
const {HttpsError} = require('firebase-functions/v2/https');
const fail = () => { throw new HttpsError('failed-precondition',
  'The assignment funding binding requires authoritative review.'); };
function reference(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail();
  return value;
}
function resolve({campaignId, campaign, zone}) {
  if (!campaign || !reference(campaignId) || zone.campaignId !== campaignId ||
      !zone.businessId || campaign.businessId !== zone.businessId) fail();
  const canonical = reference(campaign.fundingPaymentId);
  const legacy = reference(zone.fundingPaymentId);
  if ((!canonical && !legacy) || (canonical && legacy && canonical !== legacy)) fail();
  return {paymentId: canonical || legacy, shape: canonical ?
    (legacy ? 'campaign_and_zone_reference_v1' : 'campaign_reference_v1') : 'legacy_zone_reference_v1'};
}
function validate({paymentId, payment, campaignId, campaign, zoneId, zone, contract, completion}) {
  if (resolve({campaignId,campaign,zone}).paymentId !== paymentId || !payment ||
      payment.campaignId !== campaignId || payment.businessId !== zone.businessId ||
      (payment.businessUid && payment.businessUid !== zone.businessId) ||
      !contract || contract.immutable !== true || contract.zoneId !== zoneId ||
      contract.campaignId !== campaignId || contract.businessId !== zone.businessId ||
      contract.scalerId !== zone.assignedScalerId || !completion ||
      completion.zoneId !== zoneId || completion.campaignId !== campaignId ||
      completion.scalerId !== zone.assignedScalerId ||
      (completion.businessId && completion.businessId !== zone.businessId)) fail();
  for (const record of [zone, contract, completion]) {
    const pointer = reference(record.fundingPaymentId);
    if (pointer && pointer !== paymentId) fail();
  }
  const versions = [campaign, zone, contract, completion, payment]
    .map(record => record.fundingVersion).filter(v => v !== undefined && v !== null);
  if (versions.some(v => !Number.isSafeInteger(v) || v < 1 || v !== versions[0])) fail();
  // An explicit version on an authority must also exist on the payment itself.
  if (versions.length && payment.fundingVersion === undefined) fail();
}
module.exports = {resolve, validate};
