'use strict';

// Presentation only: reconcile recorded components with the posted total.
// Never derive approved compensation from coverage or an offered contract.
function read({earning, zone, completion, zoneId}) {
  const empty = {baseAmountCents:null, bonusAmountCents:null};
  const cents = value => Number.isSafeInteger(value) && value >= 0;
  if (!earning || earning.type !== 'scaler_earnings' || !cents(earning.amountCents) ||
      earning.zoneId !== zoneId || completion.zoneId !== zoneId ||
      earning.campaignId !== completion.campaignId || zone.campaignId !== completion.campaignId ||
      earning.scalerId !== completion.scalerId || zone.assignedScalerId !== completion.scalerId ||
      earning.businessId !== zone.businessId) return empty;
  if (cents(earning.baseAmountCents) && cents(earning.bonusAmountCents)) {
    return earning.baseAmountCents + earning.bonusAmountCents === earning.amountCents
      ? {baseAmountCents:earning.baseAmountCents,bonusAmountCents:earning.bonusAmountCents} : empty;
  }
  if (zone.reviewStatus !== 'approved' ||
      (completion.reviewStatus !== 'approved' && completion.status !== 'approved') ||
      zone.approvedTransferAmountCents !== earning.amountCents ||
      !cents(zone.approvedBaseAmountCents) || !cents(zone.approvedBonusAmountCents) ||
      zone.approvedBaseAmountCents + zone.approvedBonusAmountCents !== earning.amountCents) return empty;
  return {baseAmountCents:zone.approvedBaseAmountCents,bonusAmountCents:zone.approvedBonusAmountCents};
}
module.exports={read};
