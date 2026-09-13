'use strict';

const policy = require('./live_work_certification_policy');
const {
  assertNewPaidWork
} = require('./paid_work_launch_gate');
const {
  id,
  fail
} = require('./scaler_cashout_shared');
const {
  CONFIG,
  statusFor,
  requireActiveBusiness
} = require('./market_rollout');
function assertRecord(c, t, campaign) {
  if (t?.version !== policy.VERSION || t.permitDigest !== policy.binding(c) || t.businessId !== c.businessUid || t.scalerId !== c.scalerUid || t.campaignId !== c.campaignId || t.zoneId !== c.zoneId || t.locationDigest !== id(t.location) || campaign.taskLocationDigest !== t.locationDigest || campaign.location?.latitude !== t.location.latitude || campaign.location?.longitude !== t.location.longitude || campaign.name !== 'Yard Cleanup Check' || campaign.status !== 'draft' || campaign.fundingVersion !== 0 || t.status !== 'created') fail('cashout_certification_binding_mismatch');
}
async function assertFunding({
  db,
  input,
  project,
  quoteForCampaign,
  raw = process.env.LIVE_WORK_CERTIFICATION_JSON,
  enabled = process.env.LIVE_PAID_WORK_ACTIVATION_ENABLED,
  now = Date.now()
}) {
  if (project !== 'scaled-circle' || enabled === 'true') return assertNewPaidWork({
    project,
    enabled
  });
  if (!input.campaign?.liveWorkCertificationId) return assertNewPaidWork({
    project,
    enabled
  });
  const c = policy.funding({
    raw,
    campaignId: input.campaignId,
    campaign: input.campaign,
    actorUid: input.actorUid,
    now
  });
  const t = (await db.doc('liveWorkCertifications/' + c.permitId).get()).data();
  assertRecord(c, t, input.campaign);
  if (typeof quoteForCampaign !== 'function' || id(quoteForCampaign(input.campaign)) !== id(t.quote) || t.quote?.totalChargeCents !== 360) fail('cashout_certification_quote_changed');
  const zones = await db.collection('campaignZones').where('campaignId', '==', c.campaignId).limit(2).get();
  const zone = zones.docs[0]?.data();
  if (zones.size !== 1 || zones.docs[0].id !== c.zoneId || zone?.businessId !== c.businessUid || zone.mapped !== true || id(zone.location) !== id(t.location) || zone.trackingEnabled !== false) fail('cashout_certification_binding_mismatch');
  await requireActiveBusiness(db, c.businessUid);
  const market = (await db.doc(CONFIG).get()).data();
  if (statusFor(market, t.location.stateId) !== 'ACTIVE') fail('cashout_certification_market_unavailable');
  return {
    certified: true,
    permitId: c.permitId
  };
}
async function requireWorkArea({
  db,
  input,
  project,
  quoteForCampaign,
  raw = process.env.LIVE_WORK_CERTIFICATION_JSON
}) {
  if (project === 'scaled-circle' && input.campaign?.liveWorkCertificationId) {
    await assertFunding({
      db,
      input,
      project,
      quoteForCampaign,
      raw
    });
    return;
  }
  return require('./market_work_geography').requireCampaign(db, input.campaign);
}
module.exports = {
  assertFunding,
  requireWorkArea,
  assertRecord
};
