'use strict';

// Preserve the valid-zone filtering contract deployed in production. The
// stricter all-zones staging contract is intentionally a separate policy.
function productionMappedZoneIsValid(zone, campaignId, businessId) {
  if (!zone || zone.campaignId !== campaignId) return false;
  if (zone.businessId && zone.businessId !== businessId) return false;
  const points = Number(zone.serviceAreaPointCount || zone.pointCount || 0);
  return zone.mapped === true || points >= 3;
}

function productionValidZones(documents, campaignId, uid) {
  return documents.filter(doc => productionMappedZoneIsValid(doc.data(), campaignId, uid));
}

module.exports = {productionValidZones, productionMappedZoneIsValid};
