"use strict";

// Prospective production policy core. No export is a callable or writes data.
// Promotion must bind an authoritative mapped route, funded offer and accepted
// application in the assignment transaction before this policy can be used.
const {hash, validateRoute} = require('./route_progress');
const coveragePolicy = require('./canvassing_completion');
const VERSION = 'CanvassingRoute80_95V1';
const ROUTE_AUTHORITY_VERSION = 'ProductionServiceableRouteV1';

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw Error(`${label}_invalid`);
  }
  return value;
}
function cents(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw Error(`${label}_invalid`);
  }
  return value;
}
function routeBinding(zone, authority) {
  validateRoute(zone.executionRoute, zone.serviceArea);
  if (authority?.version !== ROUTE_AUTHORITY_VERSION ||
      authority.zoneId !== zone.id || authority.campaignId !== zone.campaignId ||
      authority.routeHash !== zone.executionRoute.routeHash ||
      authority.corridorHash !== zone.executionRoute.corridorHash ||
      !/^[a-f0-9]{64}$/.test(authority.sourceSnapshotDigest || '') ||
      authority.accessReviewed !== true || authority.state !== 'approved') {
    throw Error('authoritative_serviceable_route_required');
  }
  return {routeHash: zone.executionRoute.routeHash,
    corridorHash: zone.executionRoute.corridorHash,
    plannedWalkingMeters: zone.executionRoute.denominatorMeters,
    sourceSnapshotDigest: authority.sourceSnapshotDigest,
    authorityVersion: authority.version};
}

function prepareOffer({project, campaign, zones, routeAuthorities, baseAmountCents,
  bonusAmountCents = 0, effectiveFromMs, createdAtMs}) {
  if (project !== 'scaled-circle') throw Error('production_only');
  if (!coveragePolicy.isCanvassing(campaign.campaignType) || campaign.status !== 'draft') {
    throw Error('new_draft_canvassing_required');
  }
  if (!Number.isSafeInteger(effectiveFromMs) || effectiveFromMs <= 0 ||
      !Number.isSafeInteger(createdAtMs) || createdAtMs < effectiveFromMs ||
      campaign.createdAtMs !== createdAtMs) throw Error('prospective_campaign_required');
  const campaignId = requireId(campaign.id, 'campaign');
  const businessId = requireId(campaign.businessId, 'business');
  cents(baseAmountCents, 'base', true); cents(bonusAmountCents, 'bonus');
  if (!Array.isArray(zones) || zones.length < 1 || zones.length > 32 ||
      new Set(zones.map(z => z.id)).size !== zones.length) throw Error('zones_invalid');
  const bindings = zones.map(zone => {
    requireId(zone.id, 'zone');
    if (zone.campaignId !== campaignId || zone.businessId !== businessId ||
        zone.assignedScalerId || zone.status !== 'unassigned') throw Error('new_unassigned_zone_required');
    return {zoneId: zone.id, ...routeBinding(zone, routeAuthorities[zone.id])};
  }).sort((a, b) => a.zoneId.localeCompare(b.zoneId));
  const workerReserveCents = cents((baseAmountCents + bonusAmountCents) * zones.length, 'reserve', true);
  const body = {version: VERSION, campaignId, businessId, currency: 'usd',
    baseAmountCents, bonusAmountCents, workerReserveCents, bindings,
    baseThresholdBasisPoints: 8000, bonusThresholdBasisPoints: 9500,
    coverageBasis: 'unique_assigned_route_estimate', effectiveFromMs, createdAtMs};
  return Object.freeze({...body, offerDigest: hash(body)});
}

function validateOffer(offer) {
  if (offer?.version !== VERSION) throw Error('unsupported_compensation_policy');
  const {offerDigest, ...body} = offer;
  if (hash(body) !== offerDigest || offer.baseThresholdBasisPoints !== 8000 ||
      offer.bonusThresholdBasisPoints !== 9500 ||
      offer.coverageBasis !== 'unique_assigned_route_estimate') throw Error('offer_integrity_mismatch');
  cents(offer.baseAmountCents, 'base', true); cents(offer.bonusAmountCents, 'bonus');
}

function acceptOffer({offer, zone, routeAuthority, application, payment,
  serverAcceptedAtMs, existingContract = null}) {
  // Never reinterpret an existing accepted contract, even when a caller supplies
  // newer terms. The maintained assignment authority must handle its own replay.
  if (existingContract !== null) throw Error('existing_contract_preserved');
  validateOffer(offer);
  if (!Number.isSafeInteger(serverAcceptedAtMs) || serverAcceptedAtMs < offer.createdAtMs ||
      application.campaignId !== offer.campaignId || application.zoneId !== zone.id ||
      application.acceptedOfferDigest !== offer.offerDigest ||
      application.status !== 'pending') throw Error('explicit_current_offer_acceptance_required');
  const scalerId = requireId(application.scalerId, 'scaler');
  const binding = offer.bindings.find(b => b.zoneId === zone.id);
  if (!binding || zone.campaignId !== offer.campaignId || zone.businessId !== offer.businessId ||
      zone.assignedScalerId || zone.status !== 'unassigned' ||
      hash({...routeBinding(zone, routeAuthority), zoneId: zone.id}) !== hash(binding)) {
    throw Error('accepted_geometry_mismatch');
  }
  if (payment.campaignId !== offer.campaignId || payment.businessId !== offer.businessId ||
      payment.status !== 'funded' || payment.currency !== offer.currency ||
      payment.offerDigest !== offer.offerDigest ||
      cents(payment.workerAmountCents, 'funded_worker_reserve') < offer.workerReserveCents) {
    throw Error('accepted_offer_not_funded');
  }
  const body = {completionPolicyVersion: VERSION, campaignId: offer.campaignId,
    businessId: offer.businessId, zoneId: zone.id, scalerId, currency: offer.currency,
    baseAmountCents: offer.baseAmountCents, bonusAmountCents: offer.bonusAmountCents,
    offerDigest: offer.offerDigest, routeBinding: binding,
    acceptedAtMs: serverAcceptedAtMs, immutable: true};
  return Object.freeze({...body, contractDigest: hash(body)});
}

function evaluate({contract, zone, routeAuthority, session, chunks, route,
  accessIssue = false}) {
  if (!contract?.completionPolicyVersion) return {disposition: 'legacy_contract_preserved'};
  if (contract.completionPolicyVersion !== VERSION) throw Error('unsupported_compensation_policy');
  const {contractDigest, ...body} = contract;
  if (contract.immutable !== true || hash(body) !== contractDigest ||
      zone.id !== contract.zoneId || zone.campaignId !== contract.campaignId ||
      zone.businessId !== contract.businessId || zone.assignedScalerId !== contract.scalerId) {
    throw Error('immutable_assignment_mismatch');
  }
  let bindingValid = false;
  try {
    bindingValid = hash({zoneId:zone.id, ...routeBinding(zone, routeAuthority)}) === hash(contract.routeBinding);
  } catch (_) { /* Missing geometry is a technical hold, never a fabricated 0%. */ }
  const assessment = coveragePolicy.assess(zone, session, chunks, route);
  const technicalIssue = bindingValid ? assessment.technicalIssue : 'accepted_route_binding_unreliable';
  const policy = coveragePolicy.decision({coverage:assessment.estimate,
    baseAmountCents:contract.baseAmountCents, bonusAmountCents:contract.bonusAmountCents,
    authorityValid:assessment.sessionValid, finalized:assessment.finalized,
    technicalIssue, technicalReviewSupported:assessment.technicalReviewSupported, accessIssue});
  return {...policy, policyVersion:VERSION, contractDigest,
    offerDigest:contract.offerDigest, evidenceDigest:assessment.evidenceDigest,
    acceptedEvidenceHash:assessment.acceptedEvidenceHash, coverage:assessment.estimate,
    disposition:policy.ordinarySubmissionAllowed ? 'eligible_for_business_review' : 'hold',
    householdCoverage:null};
}

module.exports = {VERSION, ROUTE_AUTHORITY_VERSION, prepareOffer, acceptOffer, evaluate};
