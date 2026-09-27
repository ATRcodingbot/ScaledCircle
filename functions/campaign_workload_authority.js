'use strict';

const planning = require('./smart_zone_planning');
const {zoneGeometryDigest} = require('./operational_layer');
const {simpleRing} = require('./smart_zone_geography');
const VERSION = 'CampaignWorkloadV1';
function fail(message, code = 'failed-precondition') {
  const error = Error(message); error.code = code; throw error;
}
function hours(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < .5)
    fail('Minimum campaign workload is 30 minutes.', 'invalid-argument');
  if (value > planning.MAX_CAMPAIGN_MINUTES / 60)
    fail('Campaign workload cannot exceed 192 hours.', 'invalid-argument');
  return value;
}
function requirement(value) {
  const requestedHours = hours(value), requiredZoneCount = Math.ceil(requestedHours / 6);
  return {version: VERSION, requestedHours, requiredZoneCount,
    requestedMinutes: requestedHours * 60,
    targetMinutesPerZone: requestedHours * 60 / requiredZoneCount};
}
function validEvidence(zone) {
  const points = zone?.serviceArea || zone?.geometry;
  if (!Array.isArray(points) || !planning.validateGeometry(points).valid) return false;
  const first=points[0],last=points.at(-1);
  const closed=first.latitude===last.latitude&&first.longitude===last.longitude?points:[...points,first];
  if(!simpleRing(closed))return false;
  const digest = zoneGeometryDigest(points), e = zone.zoneIntelligence;
  // Counts/estimatedHomes and requested allocations never substitute for
  // current geometry-bound factual evidence.
  return e?.version === 'ZoneIntelligenceV1' && e.geometryDigest === digest &&
    ['available', 'partial'].includes(e.status) &&
    Number.isFinite(e.workload?.minutes) && e.workload.minutes > 0 &&
    e.workload.minutes <= planning.SINGLE_SCALER_MAX_MINUTES &&
    e.workload.oneScaler === true &&
    (zone.serverZoneGeometryDigest == null || zone.serverZoneGeometryDigest === digest);
}
function summary(campaign, zones) {
  let required;
  try {
    required = requirement(campaign.campaignWorkload?.requestedHours);
    if (campaign.campaignWorkload?.version !== VERSION ||
        campaign.campaignWorkload.requiredZoneCount !== required.requiredZoneCount)
      throw Error('untrusted_workload');
  } catch (_) {
    return {ready: false, reason: 'Set the requested campaign workload before review.',
      requiredZoneCount: null, validZoneCount: 0, supportedMinutes: null};
  }
  const seen = new Set(), valid = [], invalid = [];
  for (const zone of zones) {
    const digest = Array.isArray(zone.serviceArea) ? zoneGeometryDigest(zone.serviceArea) : null;
    const binding = zone.id && zone.businessId === campaign.businessId &&
      (!campaign.id || zone.campaignId === campaign.id);
    const assignable = !zone.assignedScalerId && !zone.mapLocked &&
      ['', 'unassigned'].includes(zone.status || '');
    if (!binding || !assignable || !validEvidence(zone) || seen.has(digest)) invalid.push(zone.id);
    else { seen.add(digest); valid.push(zone); }
  }
  const missing = required.requiredZoneCount - valid.length;
  const ready = missing === 0 && invalid.length === 0 && zones.length === required.requiredZoneCount;
  return {...required, ready, validZoneCount: valid.length, zoneCount: zones.length,
    supportedMinutes: valid.length ? valid.reduce((n,z) => n + z.zoneIntelligence.workload.minutes, 0) : null,
    invalidZoneIds: invalid,
    reason: ready ? null : invalid.length ? 'Review current evidence and assignment eligibility for every Zone.'
      : missing > 0 ? `Add ${missing} more Zone${missing === 1 ? '' : 's'} for this campaign.`
      : 'Remove extra Zones or change the requested campaign workload before review.'};
}
function assertComplete(campaign, zones, ErrorType) {
  const result = summary(campaign, zones);
  if (!result.ready) {
    if (ErrorType) throw new ErrorType('failed-precondition', result.reason, {...result, reason:'CAMPAIGN_ZONES_INCOMPLETE'});
    fail(result.reason);
  }
  return result;
}
// Historical readback is informational only. It never creates workload authority
// or changes the saved hours, polygons, assignments or approval state.
function legacySummary(campaign, zones, run) {
  if (campaign.campaignWorkload || run?.businessId !== campaign.businessId ||
      run?.campaignId !== campaign.id || run?.status !== 'complete') return summary(campaign, zones);
  let required;
  try { required = requirement(run.searchEvidence?.requestedHours); }
  catch (_) { return summary(campaign, zones); }
  const facts = summary({...campaign, campaignWorkload: required}, zones);
  return {...facts, ready: false, legacyAdjustmentRequired: true,
    requestedWorkloadSource: 'saved_recommendation',
    reason: `This saved ${required.requestedHours}-hour recommendation has ${zones.length} areas. ` +
      `The current plan requires ${required.requiredZoneCount} Scaler Zone${required.requiredZoneCount === 1 ? '' : 's'}. ` +
      (zones.length > required.requiredZoneCount ? 'Choose which area to keep or explicitly revise the requested workload. ' : '') +
      'Confirm the requested workload before review. Your saved areas remain unchanged.'};
}
module.exports = {VERSION, hours, requirement, validEvidence, summary, assertComplete, legacySummary};
