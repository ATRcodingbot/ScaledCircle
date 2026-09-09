'use strict';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const VERSION = 'logistics_privacy_v1';
const ACTIVE_LOCATION = new Set(['assigned', 'in_progress']);
const ACTIVE_ZONE = new Set(['assigned', 'accepted', 'in_progress', 'paused', 'paused_work_window', 'paused_out_of_window', 'ready']);

// This is a positive public-field contract. Private free-text, contacts,
// addresses, exact coordinates and assignment records are never copied.
function projection(id, source) {
  if (!source) return {document: null, reason: 'source_absent'};
  const title = source.campaignName || source.title || source.name;
  const type = source.campaignType || source.type;
  if (!ID.test(id) || !ID.test(source.businessId || '') ||
      typeof title !== 'string' || !title.trim() || typeof type !== 'string' || !type.trim() ||
      typeof source.status !== 'string') return {document: null, reason: 'required_public_identity_missing'};
  const doc = {campaignId: id, businessId: source.businessId,
    campaignName: title.trim().slice(0, 200), campaignType: type,
    status: source.status, schemaVersion: 2, privacyVersion: VERSION};
  if(source.completionPolicyVersion==='CanvassingRoute80_95V1') {
    const o=source.acceptedOffer;
    if(!o||o.version!==source.completionPolicyVersion||!/^[a-f0-9]{64}$/.test(o.offerDigest||'')||
      !Number.isSafeInteger(o.baseAmountCents)||o.baseAmountCents<=0||
      !Number.isSafeInteger(o.bonusAmountCents)||o.bonusAmountCents<0||o.currency!=='usd') {
      return {document:null,reason:'accepted_compensation_offer_missing'};
    }
    doc.completionPolicyVersion=o.version;
    doc.compensationOffer={offerDigest:o.offerDigest,baseAmountCents:o.baseAmountCents,
      bonusAmountCents:o.bonusAmountCents,currency:o.currency,baseThresholdBasisPoints:8000,
      bonusThresholdBasisPoints:9500,coverageBasis:'unique_assigned_route_estimate'};
  }
  for (const key of ['basePay', 'bonus', 'workerPoolCents', 'scheduledShareCents',
    'requiredScalerCount', 'requestedScalerCount', 'assignedScalerCount',
    'estimatedMinutes', 'preliminaryEstimatedMinutes']) {
    if (Number.isFinite(source[key]) && source[key] >= 0) doc[key] = source[key];
  }
  for (const key of ['createdAt', 'updatedAt', 'deadline']) {
    if (source[key] instanceof Date || typeof source[key]?.toDate === 'function') doc[key] = source[key];
  }
  const allowedFulfillment = ['no_materials_required', 'scaler_pickup_business',
    'business_delivery', 'scaler_pickup_print_shop'];
  const fulfillment = allowedFulfillment.includes(source.materialFulfillmentType) ? source.materialFulfillmentType : null;
  const coarse = source.publicLogistics || {};
  doc.materialLogistics = {
    materialsRequired: typeof source.materialsRequired === 'boolean' ? source.materialsRequired : null,
    fulfillmentType: fulfillment,
    postalCode: /^\d{5}$/.test(coarse.postalCode || '') ? coarse.postalCode : null,
    approximateDistanceMiles: Number.isFinite(coarse.approximateDistanceMiles) && coarse.approximateDistanceMiles >= 0 ? coarse.approximateDistanceMiles : null,
    estimatedTravelMinutes: Number.isFinite(coarse.estimatedTravelMinutes) && coarse.estimatedTravelMinutes >= 0 ? coarse.estimatedTravelMinutes : null,
    accessStatus: ['public', 'restricted_or_uncertain', 'business_authorized_access', 'excluded'].includes(coarse.accessStatus) ? coarse.accessStatus : 'unknown',
    exactDetailsAfterAssignment: true,
  };
  if (fulfillment) doc.materialFulfillmentType = fulfillment;
  if (typeof source.materialsRequired === 'boolean') doc.materialsRequired = source.materialsRequired;
  doc.verification = {};
  doc.tracking = {};
  for (const key of ['beforePhotoRequired', 'afterPhotoRequired', 'businessApprovalRequired']) {
    if (typeof source.verification?.[key] === 'boolean') doc.verification[key] = source.verification[key];
  }
  for (const key of ['gpsRequired', 'locationRequired']) {
    if (typeof source.tracking?.[key] === 'boolean') doc.tracking[key] = source.tracking[key];
  }
  return {document: doc, reason: source.status === 'open' ? 'discoverable' : 'closed_coarse_history'};
}

function locationAllowed(uid, location, campaign) {
  return location?.assignedScalerId === uid && ACTIVE_LOCATION.has(location.status) &&
    ID.test(location.campaignId || '') && ID.test(location.businessId || '') &&
    campaign?.businessId === location.businessId &&
    !['cancelled', 'canceled', 'archived', 'completed', 'rejected'].includes(campaign.status);
}

module.exports = {ID, VERSION, ACTIVE_ZONE, projection, locationAllowed};
