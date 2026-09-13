'use strict';

// A short-lived, immutable single-job authorization; no production identity is
// hardcoded into source and the ordinary paid-work hold remains unchanged.
const {
  id,
  fail
} = require('./scaler_cashout_shared');
const VERSION = 'FounderAuthorizedPhysicalWorkV1';
function config(raw, now = Date.now(), {
  allowExpired = false
} = {}) {
  let c;
  try {
    c = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    fail('cashout_certification_unavailable');
  }
  if (!c || c.version !== VERSION || c.enabled !== true || c.project !== 'scaled-circle' || c.appEnv !== 'production' || !Number.isSafeInteger(c.expiresAt) || !allowExpired && c.expiresAt <= now || c.expiresAt - now > 14 * 86400000 || !Number.isSafeInteger(c.issuedAt) || c.expiresAt - c.issuedAt > 14 * 86400000 || c.issuedAt > now || c.baseCents !== 300 || c.bonusCents !== 0 || c.maximumChargeCents !== 360) fail('cashout_certification_unavailable');
  for (const k of ['permitId', 'businessUid', 'scalerUid', 'campaignId', 'zoneId']) if (!/^[A-Za-z0-9_-]{16,128}$/.test(c[k] || '')) fail('cashout_certification_unavailable');
  if (c.businessUid === c.scalerUid || c.campaignId === c.zoneId) fail('cashout_certification_unavailable');
  return c;
}
function binding(c) {
  return id(VERSION, c.permitId, c.businessUid, c.scalerUid, c.campaignId, c.zoneId, c.baseCents, c.bonusCents, c.maximumChargeCents, c.issuedAt, c.expiresAt);
}
function funding({
  raw,
  campaignId,
  campaign,
  actorUid,
  now
}) {
  const c = config(raw, now);
  if (actorUid !== c.businessUid || campaignId !== c.campaignId || campaign?.businessId !== c.businessUid || campaign.intendedScalerId !== c.scalerUid || campaign.liveWorkCertificationDigest !== binding(c) || campaign.liveWorkCertificationId !== c.permitId || campaign.basePay !== 3 || campaign.bonus !== 0 || campaign.workerAmountCents !== 300 || campaign.fundingVersion !== 0 || campaign.campaignType !== 'yardCleanup' || campaign.certificationFixture !== true || campaign.marketplaceVisible !== false || campaign.trackingEnabled !== false) fail('cashout_certification_binding_mismatch');
  return c;
}
function contract(c, zoneId, zone, accepted) {
  const value = {
    policyVersion: VERSION,
    permitDigest: binding(c),
    zoneId: c.zoneId,
    campaignId: c.campaignId,
    businessId: c.businessUid,
    scalerId: c.scalerUid,
    baseAmountCents: 300,
    bonusAmountCents: 0,
    currency: 'usd'
  };
  if (zoneId !== c.zoneId || zone?.campaignId !== c.campaignId || zone.businessId !== c.businessUid || zone.assignedScalerId !== c.scalerUid || accepted?.immutable !== true || !accepted.acceptedAtMs || accepted.contractDigest !== id(value) || Object.entries(value).some(([k, v]) => accepted[k] !== v)) fail('cashout_certification_contract_mismatch');
}
module.exports = {
  VERSION,
  config,
  binding,
  funding,
  contract
};
