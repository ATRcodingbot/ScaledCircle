'use strict';
const {createHash} = require('node:crypto');
const VERSION = 'SmartZoneIntelligenceCacheV6';
const TTL_MS = 15 * 60 * 1000, LEASE_MS = 180000, COOLDOWN_MS = 60000, MAX_BYTES = 500 * 1024;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code, message) => {throw Object.assign(Error(message), {code});};
const id = value => {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/.test(value)) fail('invalid-argument', 'Choose a valid campaign recommendation.');
  return value;
};
function selectedAreaDigest(selectedArea) {
  const geometry = selectedArea?.geometry;
  if (!Array.isArray(geometry)) fail('failed-precondition', 'Refresh the selected recommendation area.');
  return geometry.length >= 3 ? require('./operational_layer').zoneGeometryDigest(geometry) :
    hash({unresolvedResultId: selectedArea.resultId, center: selectedArea.center});
}
function assertFirestoreValue(value, insideArray = false) {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    fail('failed-precondition', 'The retained recommendation contains unsupported evidence.');
  }
  if (Array.isArray(value)) {
    if (insideArray) fail('failed-precondition', 'The retained recommendation contains unsupported nested geometry.');
    for (const item of value) assertFirestoreValue(item, true);
  } else if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail('failed-precondition', 'The retained recommendation contains unsupported evidence.');
    for (const item of Object.values(value)) assertFirestoreValue(item);
  } else if (value !== null && !['string', 'boolean', 'number'].includes(typeof value)) {
    fail('failed-precondition', 'The retained recommendation contains unsupported evidence.');
  }
}
async function loadMarketingHistory({db, businessId, transaction = null, now = Date.now}) {
  id(businessId);
  const checkedAtMs = now(), date = new Date(checkedAtMs), year = date.getUTCFullYear() - 1;
  const cutoff = new Date(Date.UTC(year, date.getUTCMonth(), Math.min(date.getUTCDate(),
    new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate()),
  date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const unknown = {status: 'unknown', records: [], inventoryComplete: false,
    checkedAtMs, windowStartMs: cutoff.getTime()};
  try {
    const query = db.collection(`businessOperations/${businessId}/marketingHistory`).limit(201);
    const snapshot = transaction ? await transaction.get(query) : await query.get();
    if (snapshot.docs.length > 200) return unknown;
    const records = [];
    for (const document of snapshot.docs) {
      const row = document.data();
      if (row.businessId !== businessId || row.workspaceId !== businessId ||
          row.schemaVersion !== 'BusinessMarketingHistoryV1' || row.immutable !== true ||
          !['business_reported', 'authoritative_zone_review'].includes(row.completionEvidenceSource) ||
          !Number.isSafeInteger(row.completedAtMs) || row.completedAtMs > checkedAtMs ||
          row.completedAtMs < Date.UTC(2000, 0, 1) || !Array.isArray(row.geometryParts)) return unknown;
      const geometryParts = row.geometryParts.map(part => ({points: part.points?.map(point =>
        ({latitude: point.latitude, longitude: point.longitude}))}));
      assertFirestoreValue(geometryParts);
      // Validate the same maintained multi-part representation before passing
      // history to advisory scoring; this does not create or backfill records.
      require('./property_service_area_geometry').normalizeAreas({areas: [{id: 'history', name: 'History',
        geometryParts, geometryEncoding: 'map-parts-v1'}]});
      records.push({geometryParts, completedAtMs: row.completedAtMs,
        completionEvidenceSource: row.completionEvidenceSource});
    }
    records.sort((a,b) => a.completedAtMs - b.completedAtMs || JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {...unknown, status: 'available', records, inventoryComplete: true};
  } catch (_) { return unknown; }
}
function requestFingerprint({campaignId, campaign, data, desiredHours, objective}) {
  // Routing/business/plan labels supplied by the client never grant authority.
  const scope=require('./smart_zone_entry_contract').recommendationScope(data);
  const location = scope.boundary ? {previewGeometryDigest:require('./operational_layer').zoneGeometryDigest(scope.boundary)} :
    data.areaSelection ? {areaSelection: data.areaSelection} :
      {savedCampaignArea: campaign.serviceArea || []};
  return hash({version:VERSION,modelVersion:require('./smart_zone_intelligence').VERSION,
    serviceScoreVersion:require('./property_service_area_analysis').MARKETING_SCORE_VERSION,
    propertySourceVersion:require('./property_intelligence').DATA_SOURCE_BUNDLE_VERSION,campaignId,
    campaignType: campaign.campaignType || campaign.type || 'field_distribution',
    scope:scope.scope,location,desiredHours,objective,executionMode:campaign.executionMode||null,
    teamCapacity:campaign.executionMode==='own_team'?require('./own_team_capacity').requirement(data.teamCapacity||campaign.campaignWorkload):null});
}
function recommendationRunId(input) {
  return hash([VERSION, input.businessId, input.actorUid, input.campaignId,
    input.contextVersion, input.requestFingerprint]);
}
function createRuntime({db, now = Date.now}) {
  const root = businessId => db.collection('propertyRecommendationWorkspaces').doc(id(businessId));
  const reference = input => root(input.businessId).collection('mappingRuns').doc(id(input.runId));
  function validate(record, input) {
    if (!record || record.version !== VERSION || record.status !== 'complete' ||
        !Number.isSafeInteger(record.expiresAtMs) || record.expiresAtMs <= now() || !record.searchEvidence) {
      fail('failed-precondition', 'Refresh the intelligent area recommendation before continuing.');
    }
    if (record.businessId !== input.businessId || record.actorUid !== input.actorUid || record.campaignId !== input.campaignId) {
      fail('permission-denied', 'Choose a recommendation in your Business workspace.');
    }
    if (record.contextVersion !== input.contextVersion || record.requestFingerprint !== input.requestFingerprint) {
      fail('failed-precondition', 'Your goal, campaign or Business settings changed. Request a new recommendation.');
    }
    if (record.sourceAreaDigest !== selectedAreaDigest(record.selectedArea) ||
        record.searchEvidence.sourceAreaDigest !== record.sourceAreaDigest ||
        record.searchEvidence.contextVersion !== record.contextVersion) {
      fail('failed-precondition', 'The retained recommendation evidence needs to be refreshed.');
    }
    return record;
  }
  async function load(input, transaction = null) {
    const ref = reference(input), snapshot = transaction ? await transaction.get(ref) : await ref.get();
    return {...validate(snapshot.data(), input), runId: input.runId, cached: true};
  }
  async function obtain(input, produce) {
    id(input.businessId); id(input.actorUid); id(input.campaignId);
    const runId = recommendationRunId(input);
    const ref = reference({...input, runId});
    const control = root(input.businessId).collection('mappingControls').doc(id(input.actorUid));
    const businessLease = root(input.businessId).collection('mappingLeases').doc('search');
    const claim = await db.runTransaction(async transaction => {
      const [existing, state, lease] = await Promise.all([transaction.get(ref), transaction.get(control), transaction.get(businessLease)]);
      const record = existing.data(), previous = state.data() || {}, active = lease.data() || {};
      if (record?.status === 'complete' && record.expiresAtMs > now()) return {record: validate(record, input)};
      if (active.leaseUntilMs > now()) fail('aborted', 'An intelligent area search is already running for this Business.');
      if (previous.cooldownUntilMs > now()) fail('resource-exhausted', 'Wait briefly before starting another intelligent area search.');
      const leaseToken = hash([runId, now(), previous.attempt || 0]);
      transaction.set(control, {businessId: input.businessId, actorUid: input.actorUid, runId,
        leaseToken, leaseUntilMs: now() + LEASE_MS, attempt: (previous.attempt || 0) + 1}, {merge: true});
      transaction.set(businessLease, {actorUid: input.actorUid, leaseToken, leaseUntilMs: now() + LEASE_MS});
      transaction.set(ref, {version: VERSION, status: 'searching', businessId: input.businessId,
        actorUid: input.actorUid, campaignId: input.campaignId, contextVersion: input.contextVersion,
        requestFingerprint: input.requestFingerprint, startedAtMs: now(), leaseToken});
      return {leaseToken};
    });
    if (claim.record) return {...claim.record, runId, cached: true};
    try {
      const searchEvidence = await produce();
      if (!searchEvidence || typeof searchEvidence !== 'object' || Array.isArray(searchEvidence)) {
        fail('failed-precondition', 'The intelligent area search did not return reliable evidence.');
      }
      const record = {version: VERSION, status: 'complete', businessId: input.businessId, actorUid: input.actorUid,
        campaignId: input.campaignId, contextVersion: input.contextVersion, requestFingerprint: input.requestFingerprint,
        selectedArea: input.selectedArea, sourceAreaDigest: input.sourceAreaDigest, searchEvidence,
        createdAtMs: now(), expiresAtMs: now() + TTL_MS};
      assertFirestoreValue(record);
      let serialized;
      try {serialized = JSON.stringify(record);} catch (_) {fail('resource-exhausted', 'This recommendation could not be retained safely. Draw your own area or choose another location.');}
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) fail('resource-exhausted', 'This recommendation contains more evidence than can be retained safely. Draw your own area or choose another location.');
      const stored = JSON.parse(serialized);
      validate(stored, input);
      await db.runTransaction(async transaction => {
        const state = (await transaction.get(businessLease)).data();
        if (state?.leaseToken !== claim.leaseToken || state.leaseUntilMs <= now()) {
          fail('aborted', 'The intelligent area search expired. Request a new recommendation.');
        }
        transaction.set(ref, stored);
        transaction.set(businessLease, {leaseUntilMs: 0, leaseToken: null});
        transaction.set(control, {leaseUntilMs: 0, leaseToken: null, cooldownUntilMs: now() + COOLDOWN_MS}, {merge: true});
      });
      return {...stored, runId, cached: false};
    } catch (error) {
      await db.runTransaction(async transaction => {
        const state = (await transaction.get(businessLease)).data();
        if (state?.leaseToken === claim.leaseToken) {
          transaction.set(ref, {status: 'failed', failedAtMs: now()}, {merge: true});
          transaction.set(businessLease, {leaseUntilMs: 0, leaseToken: null});
          transaction.set(control, {leaseUntilMs: 0, leaseToken: null, cooldownUntilMs: now() + COOLDOWN_MS}, {merge: true});
        }
      });
      throw error;
    }
  }
  return {load, obtain};
}
module.exports = {VERSION, TTL_MS, LEASE_MS, COOLDOWN_MS, MAX_BYTES, selectedAreaDigest,
  assertFirestoreValue, loadMarketingHistory, recommendationRunId, requestFingerprint, createRuntime};
