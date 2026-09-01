"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = "TrackingPhoneFoundationV1";
const PROVIDER = "twilio";
const PROVIDER_MODE = "provider_free";
const NUMBER_LIFECYCLES = new Set([
  "REQUESTED", "PROVISIONING", "ACTIVE", "SUSPENDED", "GRACE",
  "RELEASING", "RELEASED", "FAILED", "UNKNOWN_PROVIDER_OUTCOME",
]);
const DESTINATION_STATES = new Set(["UNVERIFIED", "VERIFYING", "VERIFIED", "REVOKED", "FAILED"]);
const CALL_STATES = new Set([
  "RINGING", "ANSWERED", "COMPLETED", "BUSY", "NO_ANSWER", "FAILED", "CANCELED", "UNKNOWN",
]);
const PLAN_ALLOWANCES = Object.freeze({
  starter: Object.freeze({activeNumbers: 1, includedMinutes: 100}),
  growth: Object.freeze({activeNumbers: 3, includedMinutes: 300}),
  scale: Object.freeze({activeNumbers: 6, includedMinutes: 750}),
  managed_growth: Object.freeze({activeNumbers: 12, includedMinutes: 1500}),
});
const DEFAULT_POLICY = Object.freeze({
  physicalGraceDays: 180,
  digitalGraceDays: 60,
  rawCallerRetentionDays: 90,
  normalizedEventRetentionMonths: 24,
  maximumCallDurationMinutes: 60,
  internationalForwardingEnabled: false,
  recordingEnabled: false,
  transcriptionEnabled: false,
  outboundCallingEnabled: false,
  marketingSmsEnabled: false,
});

function text(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(value)) return Number(value);
  return null;
}

function digest(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(source).digest("hex");
}

function normalizeE164(value) {
  const number = text(value, 32).replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(number)) throw new Error("tracking_phone_e164_invalid");
  return number;
}

function maskPhone(value) {
  const e164 = normalizeE164(value);
  if (/^\+1\d{10}$/.test(e164)) return `(${e164.slice(2, 5)}) ***-${e164.slice(-4)}`;
  return `${e164.slice(0, Math.max(2, e164.length - 4)).replace(/\d/g, "*")}${e164.slice(-4)}`;
}

function callerIdentityHmac(e164, key) {
  const secret = text(key, 512);
  if (secret.length < 32) throw new Error("tracking_phone_hmac_unavailable");
  return crypto.createHmac("sha256", secret).update(normalizeE164(e164)).digest("hex");
}

function planAllowance(planId) {
  const plan = text(planId, 40).toLowerCase();
  const allowance = PLAN_ALLOWANCES[plan];
  if (!allowance) throw new Error("tracking_phone_plan_ineligible");
  return {...allowance, planId: plan};
}

function normalizeLifecycle(value) {
  const lifecycle = text(value, 40).toUpperCase();
  return NUMBER_LIFECYCLES.has(lifecycle) ? lifecycle : "FAILED";
}

function normalizeDestinationState(value) {
  const state = text(value, 40).toUpperCase();
  return DESTINATION_STATES.has(state) ? state : "FAILED";
}

function normalizeCallState(value) {
  const state = text(value, 60).toLowerCase().replace(/[\s-]+/g, "_");
  const map = {
    initiated: "RINGING", queued: "RINGING", ringing: "RINGING",
    in_progress: "ANSWERED", answered: "ANSWERED",
    completed: "COMPLETED", busy: "BUSY", no_answer: "NO_ANSWER",
    failed: "FAILED", canceled: "CANCELED", cancelled: "CANCELED",
  };
  return CALL_STATES.has(text(value, 40).toUpperCase()) ? text(value, 40).toUpperCase() :
    (map[state] || "UNKNOWN");
}

function graceDays({hasPhysicalDistribution = false} = {}) {
  return hasPhysicalDistribution ? DEFAULT_POLICY.physicalGraceDays : DEFAULT_POLICY.digitalGraceDays;
}

function graceUntil({endedAt, hasPhysicalDistribution = false}) {
  const start = millis(endedAt);
  if (start === null) throw new Error("tracking_phone_campaign_end_required");
  return start + graceDays({hasPhysicalDistribution}) * 24 * 60 * 60 * 1000;
}

function assertActor(actor, requestedBusinessUid) {
  if (!actor?.uid || actor.emailVerified !== true) throw new Error("tracking_phone_actor_required");
  if (actor.role === "business") {
    if (requestedBusinessUid && requestedBusinessUid !== actor.uid) {
      throw new Error("tracking_phone_cross_tenant_forbidden");
    }
    return actor.uid;
  }
  if (actor.role === "admin" && actor.isAdmin === true) {
    const requested = text(requestedBusinessUid, 160);
    return requested || null;
  }
  throw new Error("tracking_phone_actor_required");
}

function destinationRecord({businessUid, e164, verificationMethod = null, state = "UNVERIFIED", version = 1}) {
  const normalized = normalizeE164(e164);
  return {schemaVersion: SCHEMA_VERSION, businessUid, normalizedE164: normalized,
    maskedDisplay: maskPhone(normalized), state: normalizeDestinationState(state),
    verificationMethod: text(verificationMethod, 40).toLowerCase() || null,
    verificationVersion: version, providerVerificationReference: null};
}

function forwardingVersion({destinationId, destination, effectiveFrom}) {
  if (normalizeDestinationState(destination?.state) !== "VERIFIED") {
    throw new Error("tracking_phone_destination_unverified");
  }
  const version = Number(destination.verificationVersion || 1);
  return {schemaVersion: SCHEMA_VERSION,
    forwardingVersionId: `forwarding_${digest(`${destinationId}:${version}:${destination.normalizedE164}`).slice(0, 40)}`,
    destinationId, businessUid: destination.businessUid, version,
    normalizedE164: destination.normalizedE164, maskedDisplay: destination.maskedDisplay,
    effectiveFrom: millis(effectiveFrom), immutable: true};
}

function bindingRecord(input = {}) {
  const scope = text(input.scope, 30).toLowerCase() || "campaign";
  if (!input.businessUid || !input.trackingPhoneAssetId || !input.campaignId ||
      !["campaign", "material", "channel"].includes(scope)) {
    throw new Error("tracking_phone_binding_invalid");
  }
  if (scope === "material" && (!input.materialId || !input.materialVersionId)) {
    throw new Error("tracking_phone_binding_invalid");
  }
  const snapshot = {schemaVersion: SCHEMA_VERSION, businessUid: input.businessUid,
    trackingPhoneAssetId: input.trackingPhoneAssetId, campaignId: input.campaignId,
    scope, materialId: text(input.materialId, 160) || null,
    materialVersionId: text(input.materialVersionId, 160) || null,
    landingPageId: text(input.landingPageId, 160) || null,
    responseAssetId: text(input.responseAssetId, 160) || null,
    effectiveFrom: millis(input.effectiveFrom), effectiveUntil: millis(input.effectiveUntil),
    bindingVersion: Number(input.bindingVersion || 1), immutable: true};
  return {...snapshot, bindingId: `phone_binding_${digest(snapshot).slice(0, 40)}`};
}

function callAttributionSnapshot({asset, binding, callSessionId}) {
  if (!asset?.businessUid || !binding?.campaignId || asset.businessUid !== binding.businessUid) {
    throw new Error("tracking_phone_attribution_invalid");
  }
  return {schemaVersion: SCHEMA_VERSION, businessUid: asset.businessUid,
    trackingPhoneAssetId: asset.trackingPhoneAssetId,
    bindingId: binding.bindingId, bindingVersion: binding.bindingVersion,
    campaignId: binding.campaignId, materialId: binding.materialId,
    materialVersionId: binding.materialVersionId, landingPageId: binding.landingPageId,
    responseAssetId: binding.responseAssetId, source: "phone", interactionId: callSessionId,
    immutable: true};
}

function callSessionRecord({providerCallId, callerE164, calledE164, asset, binding,
  state, hmacKey, occurredAt, destinationVersion = null}) {
  const callSessionId = `call_${digest(`${PROVIDER}:${providerCallId}`).slice(0, 40)}`;
  const attribution = callAttributionSnapshot({asset, binding, callSessionId});
  const at = millis(occurredAt);
  return {schemaVersion: SCHEMA_VERSION, callSessionId, businessUid: asset.businessUid,
    provider: PROVIDER, providerCallReference: text(providerCallId, 160),
    trackingPhoneAssetId: asset.trackingPhoneAssetId,
    callerIdentityHash: callerIdentityHmac(callerE164, hmacKey),
    callerMaskedDisplay: maskPhone(callerE164), rawCallerE164: normalizeE164(callerE164),
    rawCallerExpiresAt: at + DEFAULT_POLICY.rawCallerRetentionDays * 86400000,
    calledE164: normalizeE164(calledE164), state: normalizeCallState(state),
    forwardingVersionId: destinationVersion?.forwardingVersionId || null,
    destinationMaskedDisplay: destinationVersion?.maskedDisplay || null,
    attribution, startedAt: at, answeredAt: null, completedAt: null,
    inboundDurationSeconds: 0, forwardedDurationSeconds: 0,
    qualifiedLead: false, conversionId: null, immutableAttribution: true};
}

function reconcileCall(current, event = {}) {
  const nextState = normalizeCallState(event.state);
  const eventAt = millis(event.occurredAt);
  const terminal = new Set(["COMPLETED", "BUSY", "NO_ANSWER", "FAILED", "CANCELED"]);
  const stateOrder = {UNKNOWN: 0, RINGING: 1, ANSWERED: 2, BUSY: 3, NO_ANSWER: 3,
    FAILED: 3, CANCELED: 3, COMPLETED: 4};
  const currentState = normalizeCallState(current.state);
  const acceptedState = stateOrder[nextState] >= stateOrder[currentState] ? nextState : currentState;
  return {...current, state: acceptedState,
    answeredAt: ["ANSWERED", "COMPLETED"].includes(acceptedState) ?
      (millis(current.answeredAt) || eventAt) : millis(current.answeredAt),
    completedAt: terminal.has(acceptedState) ? (millis(current.completedAt) || eventAt) : null,
    inboundDurationSeconds: Math.max(Number(current.inboundDurationSeconds || 0),
      Number(event.inboundDurationSeconds || 0)),
    forwardedDurationSeconds: Math.max(Number(current.forwardedDurationSeconds || 0),
      Number(event.forwardedDurationSeconds || 0)),
    providerStatusUpdatedAt: eventAt};
}

function providerCostEntry(input = {}) {
  const amountMicros = Number(input.amountMicros);
  if (!Number.isInteger(amountMicros) || amountMicros < 0) {
    throw new Error("tracking_phone_cost_invalid");
  }
  const type = text(input.type, 40).toLowerCase();
  if (!["number_rental", "inbound_minutes", "forwarded_minutes", "verification"].includes(type)) {
    throw new Error("tracking_phone_cost_invalid");
  }
  return {schemaVersion: SCHEMA_VERSION, businessUid: text(input.businessUid, 160),
    trackingPhoneAssetId: text(input.trackingPhoneAssetId, 160) || null,
    callSessionId: text(input.callSessionId, 160) || null, provider: PROVIDER, type,
    quantity: Number(input.quantity || 0), amountMicros, currency: "USD",
    providerInvoiceReference: text(input.providerInvoiceReference, 160) || null,
    immutable: true};
}

function provisioningTransition(current = {}, event = {}) {
  const status = normalizeLifecycle(current.status || "REQUESTED");
  const kind = text(event.kind, 60).toLowerCase();
  if (["ACTIVE", "RELEASED"].includes(status)) return {...current, idempotentReplay: true};
  if (kind === "provider_dispatch_started") {
    if (!["REQUESTED", "PROVISIONING"].includes(status)) {
      throw new Error("tracking_phone_provisioning_transition_invalid");
    }
    return {...current, status: "PROVISIONING", providerDispatchStarted: true,
      providerDispatchIdentity: text(event.requestIdentity, 160) || current.providerDispatchIdentity};
  }
  if (kind === "pre_dispatch_failure") {
    if (current.providerDispatchStarted === true) {
      throw new Error("tracking_phone_provisioning_transition_invalid");
    }
    return {...current, status: "FAILED", providerAccepted: false, providerCostMicros: 0,
      terminalCategory: text(event.category, 80) || "pre_dispatch_failure"};
  }
  if (kind === "unknown_provider_outcome") {
    if (current.providerDispatchStarted !== true) {
      throw new Error("tracking_phone_provisioning_transition_invalid");
    }
    return {...current, status: "UNKNOWN_PROVIDER_OUTCOME", providerAccepted: null,
      reconciliationRequired: true, automaticRetryAllowed: false};
  }
  if (kind === "provider_success") {
    if (current.providerDispatchStarted !== true) {
      throw new Error("tracking_phone_provisioning_transition_invalid");
    }
    return {...current, status: "ACTIVE", providerAccepted: true,
      providerReference: text(event.providerReference, 160), e164: normalizeE164(event.e164),
      reconciliationRequired: false, automaticRetryAllowed: false};
  }
  throw new Error("tracking_phone_provisioning_transition_invalid");
}

function releaseTransition(current = {}, event = {}) {
  const status = normalizeLifecycle(current.status);
  const kind = text(event.kind, 60).toLowerCase();
  if (status === "RELEASED") return {...current, idempotentReplay: true};
  if (kind === "campaign_ended") {
    if (!["ACTIVE", "SUSPENDED", "GRACE"].includes(status)) {
      throw new Error("tracking_phone_release_transition_invalid");
    }
    return {...current, status: "GRACE", graceUntil: graceUntil({endedAt: event.endedAt,
      hasPhysicalDistribution: event.hasPhysicalDistribution === true})};
  }
  if (kind === "release_started") {
    if (!["GRACE", "SUSPENDED", "RELEASING"].includes(status)) {
      throw new Error("tracking_phone_release_transition_invalid");
    }
    return {...current, status: "RELEASING", releaseRequestIdentity:
      text(event.requestIdentity, 160) || current.releaseRequestIdentity};
  }
  if (kind === "unknown_provider_outcome") {
    if (status !== "RELEASING") throw new Error("tracking_phone_release_transition_invalid");
    return {...current, status: "UNKNOWN_PROVIDER_OUTCOME", reconciliationRequired: true,
      automaticRetryAllowed: false};
  }
  if (kind === "release_confirmed") {
    if (!["RELEASING", "UNKNOWN_PROVIDER_OUTCOME"].includes(status)) {
      throw new Error("tracking_phone_release_transition_invalid");
    }
    return {...current, status: "RELEASED", releasedAt: millis(event.occurredAt),
      reconciliationRequired: false, deliberatelyReacquirable: false};
  }
  throw new Error("tracking_phone_release_transition_invalid");
}

function canAcquireNumber(e164, releasedFingerprints = new Set()) {
  return !releasedFingerprints.has(digest(normalizeE164(e164)));
}

function planChangeProjection({currentPlan, nextPlan, activeNumbers, includedMinutesUsed}) {
  const current = planAllowance(currentPlan); const next = planAllowance(nextPlan);
  const active = Math.max(0, Number(activeNumbers || 0));
  const used = Math.max(0, Number(includedMinutesUsed || 0));
  return {current, next, activeNumbers: active, includedMinutesUsed: used,
    provisioningAvailable: active < next.activeNumbers,
    excessNumbersEnterGrace: Math.max(0, active - next.activeNumbers),
    remainingIncludedMinutes: Math.max(0, next.includedMinutes - used),
    releaseExistingImmediately: false};
}

function createMockProvider({configured = true} = {}) {
  const provisions = new Map();
  const verifications = new Map();
  return {
    key: "mock",
    configured,
    externalCalls: 0,
    verifyWebhook({signature}) { return signature === "valid-mock-signature"; },
    async startVerification({destinationId, method}) {
      if (!configured) throw new Error("tracking_phone_provider_unavailable");
      const reference = `verify_${digest(`${destinationId}:${method}`).slice(0, 20)}`;
      verifications.set(reference, "pending");
      return {providerVerificationReference: reference, knownOutcome: true};
    },
    async confirmVerification({providerVerificationReference, code}) {
      if (!configured) throw new Error("tracking_phone_provider_unavailable");
      const verified = verifications.has(providerVerificationReference) && code === "123456";
      if (verified) verifications.set(providerVerificationReference, "approved");
      return {verified, knownOutcome: true};
    },
    async provision({requestIdentity, locality, region}) {
      if (!configured) throw new Error("tracking_phone_provider_unavailable");
      if (provisions.has(requestIdentity)) return {...provisions.get(requestIdentity), idempotentReplay: true};
      const result = {knownOutcome: true, providerReference: `mock_${digest(requestIdentity).slice(0, 20)}`,
        e164: "+14105550199", locality: text(locality, 80) || "Columbia",
        region: text(region, 20) || "MD", capabilities: {voice: true, sms: false}};
      provisions.set(requestIdentity, result);
      return {...result, idempotentReplay: false};
    },
    async release({providerReference}) {
      if (!configured) throw new Error("tracking_phone_provider_unavailable");
      return {knownOutcome: true, released: Boolean(text(providerReference, 160))};
    },
  };
}

function createDisabledProvider() {
  const unavailable = async () => { throw new Error("tracking_phone_provider_unavailable"); };
  return {key: PROVIDER, configured: false, verifyWebhook: () => false,
    startVerification: unavailable, confirmVerification: unavailable,
    provision: unavailable, release: unavailable};
}

function safeDestination(id, data) {
  return {destinationId: id, maskedDisplay: text(data.maskedDisplay, 40),
    state: normalizeDestinationState(data.state), verificationMethod: text(data.verificationMethod, 40) || null,
    verifiedAt: millis(data.verifiedAt), verificationVersion: Number(data.verificationVersion || 1)};
}

function safeAsset(id, data) {
  return {trackingPhoneAssetId: id, displayNumber: text(data.displayNumber, 40) ||
      (data.e164 ? maskPhone(data.e164) : null), numberType: text(data.numberType, 20) || "local",
    locality: text(data.locality, 80) || null, region: text(data.region, 20) || null,
    status: normalizeLifecycle(data.status), campaignId: text(data.campaignId, 160) || null,
    campaignName: text(data.campaignName, 120) || "Campaign",
    destinationMaskedDisplay: text(data.destinationMaskedDisplay, 40) || null,
    activatedAt: millis(data.activatedAt), graceUntil: millis(data.graceUntil)};
}

function safeCall(id, data) {
  return {callSessionId: id, trackingPhoneAssetId: text(data.trackingPhoneAssetId, 160),
    caller: text(data.callerMaskedDisplay, 40) || "Private caller", state: normalizeCallState(data.state),
    campaignId: text(data.attribution?.campaignId, 160) || null,
    startedAt: millis(data.startedAt), answeredAt: millis(data.answeredAt),
    completedAt: millis(data.completedAt), durationSeconds: Number(data.forwardedDurationSeconds || 0),
    qualifiedLead: data.qualifiedLead === true, conversion: Boolean(data.conversionId)};
}

function createTrackingPhoneService({db, FieldValue, provider = createDisabledProvider(), now = () => Date.now()}) {
  async function listFor(collectionName, businessUid, limit = 100) {
    const collection = db.collection(collectionName);
    const query = businessUid ? collection.where("businessUid", "==", businessUid) : collection;
    const snapshot = await (typeof query.limit === "function" ? query.limit(limit).get() : query.get());
    return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data() || {}}));
  }

  async function workspace(input, actor) {
    const businessUid = assertActor(actor, input?.businessUid);
    if (!businessUid) throw new Error("tracking_phone_business_required");
    const [destinations, assets, calls, bindings, usage, subscription] = await Promise.all([
      listFor("phoneForwardingDestinations", businessUid), listFor("trackingPhoneAssets", businessUid),
      listFor("callSessions", businessUid), listFor("trackingPhoneBindings", businessUid),
      listFor("phoneUsageLedger", businessUid), db.collection("businessSubscriptions").doc(businessUid).get(),
    ]);
    const sub = subscription.data() || {};
    let allowance = null;
    try { allowance = planAllowance(sub.planId || sub.plan || sub.subscriptionPlan); } catch (_) { allowance = null; }
    const minutes = usage.filter((entry) => ["inbound_minutes", "forwarded_minutes"].includes(entry.data.type))
      .reduce((sum, entry) => sum + Number(entry.data.quantity || 0), 0);
    return {schemaVersion: SCHEMA_VERSION, featureStatus: "BETA", provider: PROVIDER,
      providerConfigured: provider.configured === true, setupAvailable: false,
      message: "Tracking Numbers are in Beta. Setup is not available yet.",
      destinations: destinations.map((entry) => safeDestination(entry.id, entry.data)),
      numbers: assets.map((entry) => safeAsset(entry.id, entry.data)),
      recentCalls: calls.map((entry) => safeCall(entry.id, entry.data)).slice(0, 50),
      bindings: bindings.map((entry) => ({bindingId: entry.id,
        trackingPhoneAssetId: entry.data.trackingPhoneAssetId,
        campaignId: entry.data.campaignId, scope: entry.data.scope,
        effectiveFrom: millis(entry.data.effectiveFrom), effectiveUntil: millis(entry.data.effectiveUntil)})),
      usage: {minutes, activeNumbers: assets.filter((entry) => entry.data.status === "ACTIVE").length,
        allowance, overageBillingEnabled: false}, policy: DEFAULT_POLICY};
  }

  async function operations(input, actor) {
    assertActor(actor, input?.businessUid);
    if (actor.role !== "admin" || actor.isAdmin !== true) throw new Error("tracking_phone_admin_required");
    const [assets, destinations, jobs, calls, events, ledger] = await Promise.all([
      listFor("trackingPhoneAssets", null), listFor("phoneForwardingDestinations", null),
      listFor("phoneProvisioningJobs", null), listFor("callSessions", null),
      listFor("callWebhookEvents", null), listFor("phoneUsageLedger", null),
    ]);
    const count = (records, predicate) => records.filter((entry) => predicate(entry.data)).length;
    return {schemaVersion: SCHEMA_VERSION, environment: PROVIDER_MODE, provider: PROVIDER,
      providerConfigured: provider.configured === true, providerTraffic: 0,
      numberInventory: assets.length, activeNumbers: count(assets, (data) => data.status === "ACTIVE"),
      graceNumbers: count(assets, (data) => data.status === "GRACE"),
      failedProvisioning: count(jobs, (data) => data.status === "FAILED"),
      unknownOutcomes: count(jobs, (data) => data.status === "UNKNOWN_PROVIDER_OUTCOME"),
      verifiedDestinations: count(destinations, (data) => data.state === "VERIFIED"),
      callSessions: calls.length, answeredCalls: count(calls, (data) =>
        ["ANSWERED", "COMPLETED"].includes(normalizeCallState(data.state))),
      missedCalls: count(calls, (data) => ["BUSY", "NO_ANSWER", "FAILED"].includes(normalizeCallState(data.state))),
      duplicateWebhookReceipts: events.reduce((sum, entry) => sum + Number(entry.data.duplicateCount || 0), 0),
      providerCostMicros: ledger.reduce((sum, entry) => sum + Number(entry.data.amountMicros || 0), 0),
      rawCallerNumbersExposed: false, forwardingDestinationsExposed: false,
      recordingEnabled: false, transcriptionEnabled: false, outboundCallingEnabled: false,
      planAllowances: PLAN_ALLOWANCES, policy: DEFAULT_POLICY};
  }

  return {workspace, operations};
}

module.exports = {SCHEMA_VERSION, PROVIDER, PROVIDER_MODE, NUMBER_LIFECYCLES,
  DESTINATION_STATES, CALL_STATES, PLAN_ALLOWANCES, DEFAULT_POLICY, text, millis, digest,
  normalizeE164, maskPhone, callerIdentityHmac, planAllowance, normalizeLifecycle,
  normalizeDestinationState, normalizeCallState, graceDays, graceUntil, assertActor,
  destinationRecord, forwardingVersion, bindingRecord, callAttributionSnapshot,
  callSessionRecord, reconcileCall, providerCostEntry, createMockProvider,
  provisioningTransition, releaseTransition, canAcquireNumber, planChangeProjection,
  createDisabledProvider, safeDestination, safeAsset, safeCall, createTrackingPhoneService};
