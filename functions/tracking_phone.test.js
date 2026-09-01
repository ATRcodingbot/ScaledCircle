"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const phone = require("./tracking_phone");

function fakeFirestore(seed = {}) {
  const records = new Map(Object.entries(seed));
  const snapshot = (pathName) => ({id: pathName.split("/").at(-1), exists: records.has(pathName),
    data: () => records.get(pathName)});
  const collectionDocs = (name, field, value, limit = 100) => [...records.entries()]
    .filter(([pathName, data]) => pathName.startsWith(`${name}/`) &&
      pathName.split("/").length === 2 && (!field || data[field] === value))
    .slice(0, limit).map(([pathName]) => snapshot(pathName));
  return {records, collection(name) {
    const query = (field = null, value = null) => ({
      limit: (limit) => ({get: async () => ({docs: collectionDocs(name, field, value, limit)})}),
      get: async () => ({docs: collectionDocs(name, field, value)}),
    });
    return {...query(), doc: (id) => ({id, path: `${name}/${id}`,
      get: async () => snapshot(`${name}/${id}`)}),
    where: (field, operator, value) => {
      assert.equal(operator, "=="); return query(field, value);
    }};
  }};
}

const business = {uid: "business-a", role: "business", emailVerified: true, user: {active: true}};
const admin = {uid: "admin-a", role: "admin", isAdmin: true, emailVerified: true};

test("V1 plan architecture is 1/3/6/12 numbers and 100/300/750/1500 minutes", () => {
  assert.deepEqual(phone.PLAN_ALLOWANCES, {
    starter: {activeNumbers: 1, includedMinutes: 100},
    growth: {activeNumbers: 3, includedMinutes: 300},
    scale: {activeNumbers: 6, includedMinutes: 750},
    managed_growth: {activeNumbers: 12, includedMinutes: 1500},
  });
  assert.throws(() => phone.planAllowance("free"), /plan_ineligible/);
});

test("E.164 normalization and masking reject malformed destinations", () => {
  assert.equal(phone.normalizeE164("+1 (667) 555-0074"), "+16675550074");
  assert.equal(phone.maskPhone("+16675550074"), "(667) ***-0074");
  assert.throws(() => phone.normalizeE164("667-555-0074"), /e164_invalid/);
});

test("caller identity uses a keyed HMAC and never a plain phone digest", () => {
  const key = "a-secure-test-only-key-that-is-over-32-bytes";
  const hashed = phone.callerIdentityHmac("+14105550100", key);
  assert.match(hashed, /^[a-f0-9]{64}$/);
  assert.notEqual(hashed, phone.digest("+14105550100"));
  assert.throws(() => phone.callerIdentityHmac("+14105550100", "short"), /hmac_unavailable/);
});

test("destination starts unverified and verified forwarding versions are immutable", () => {
  const destination = phone.destinationRecord({businessUid: "business-a", e164: "+16675550074"});
  assert.equal(destination.state, "UNVERIFIED");
  assert.throws(() => phone.forwardingVersion({destinationId: "destination-a", destination,
    effectiveFrom: 1000}), /destination_unverified/);
  const verified = {...destination, state: "VERIFIED", verificationVersion: 2};
  const version = phone.forwardingVersion({destinationId: "destination-a", destination: verified,
    effectiveFrom: 1000});
  assert.equal(version.version, 2); assert.equal(version.immutable, true);
  assert.equal(version.maskedDisplay, "(667) ***-0074");
});

test("campaign binding is default and future material scope requires immutable material identity", () => {
  const campaign = phone.bindingRecord({businessUid: "business-a", trackingPhoneAssetId: "phone-a",
    campaignId: "campaign-a", effectiveFrom: 1000});
  assert.equal(campaign.scope, "campaign"); assert.equal(campaign.materialId, null);
  assert.throws(() => phone.bindingRecord({businessUid: "business-a",
    trackingPhoneAssetId: "phone-a", campaignId: "campaign-a", scope: "material"}),
  /binding_invalid/);
});

test("call snapshot freezes campaign attribution and keeps call distinct from lead/conversion", () => {
  const asset = {businessUid: "business-a", trackingPhoneAssetId: "phone-a"};
  const binding = phone.bindingRecord({businessUid: "business-a", trackingPhoneAssetId: "phone-a",
    campaignId: "campaign-a", materialId: "material-a", materialVersionId: "version-a",
    scope: "material", effectiveFrom: 1000});
  const call = phone.callSessionRecord({providerCallId: "provider-call-a", callerE164: "+14105550101",
    calledE164: "+14105550199", asset, binding, state: "ringing",
    hmacKey: "a-secure-test-only-key-that-is-over-32-bytes", occurredAt: 2000});
  assert.equal(call.attribution.campaignId, "campaign-a");
  assert.equal(call.attribution.materialVersionId, "version-a");
  assert.equal(call.qualifiedLead, false); assert.equal(call.conversionId, null);
  assert.equal(call.rawCallerExpiresAt, 2000 + 90 * 86400000);
});

test("call reconciliation is replay-safe and rejects late state regression", () => {
  const base = {state: "RINGING", startedAt: 1000, answeredAt: null, completedAt: null,
    inboundDurationSeconds: 0, forwardedDurationSeconds: 0};
  const answered = phone.reconcileCall(base, {state: "answered", occurredAt: 2000});
  const completed = phone.reconcileCall(answered, {state: "completed", occurredAt: 5000,
    inboundDurationSeconds: 4, forwardedDurationSeconds: 3});
  const late = phone.reconcileCall(completed, {state: "ringing", occurredAt: 1500});
  assert.equal(late.state, "COMPLETED"); assert.equal(late.answeredAt, 2000);
  assert.equal(late.completedAt, 5000); assert.equal(late.forwardedDurationSeconds, 3);
});

test("provider state names normalize without leaking provider terminology", () => {
  assert.equal(phone.normalizeCallState("in-progress"), "ANSWERED");
  assert.equal(phone.normalizeCallState("no-answer"), "NO_ANSWER");
  assert.equal(phone.normalizeCallState("made_up"), "UNKNOWN");
});

test("duplicate mock provisioning request returns the same number without another identity", async () => {
  const provider = phone.createMockProvider();
  const first = await provider.provision({requestIdentity: "request-a", locality: "Columbia", region: "MD"});
  const replay = await provider.provision({requestIdentity: "request-a", locality: "Columbia", region: "MD"});
  assert.equal(first.e164, replay.e164); assert.equal(replay.idempotentReplay, true);
});

test("mock webhook signature abstraction rejects invalid signatures", () => {
  const provider = phone.createMockProvider();
  assert.equal(provider.verifyWebhook({signature: "valid-mock-signature"}), true);
  assert.equal(provider.verifyWebhook({signature: "forged"}), false);
  assert.equal(phone.createDisabledProvider().verifyWebhook({signature: "anything"}), false);
});

test("pre-dispatch failure never becomes provider accepted", () => {
  const failed = phone.provisioningTransition({status: "REQUESTED"},
    {kind: "pre_dispatch_failure", category: "provider_disabled"});
  assert.equal(failed.status, "FAILED"); assert.equal(failed.providerAccepted, false);
  assert.equal(failed.providerCostMicros, 0);
});

test("unknown provisioning outcome is held for reconciliation without blind retry", () => {
  const dispatch = phone.provisioningTransition({status: "REQUESTED"},
    {kind: "provider_dispatch_started", requestIdentity: "request-a"});
  const unknown = phone.provisioningTransition(dispatch, {kind: "unknown_provider_outcome"});
  assert.equal(unknown.status, "UNKNOWN_PROVIDER_OUTCOME");
  assert.equal(unknown.reconciliationRequired, true); assert.equal(unknown.automaticRetryAllowed, false);
});

test("known provider success is idempotent", () => {
  const dispatch = phone.provisioningTransition({status: "REQUESTED"},
    {kind: "provider_dispatch_started", requestIdentity: "request-a"});
  const active = phone.provisioningTransition(dispatch, {kind: "provider_success",
    providerReference: "provider-a", e164: "+14105550199"});
  const replay = phone.provisioningTransition(active, {kind: "provider_success",
    providerReference: "provider-a", e164: "+14105550199"});
  assert.equal(active.status, "ACTIVE"); assert.equal(replay.idempotentReplay, true);
});

test("physical and digital campaigns receive 180/60 day grace", () => {
  assert.equal(phone.graceDays({hasPhysicalDistribution: true}), 180);
  assert.equal(phone.graceDays({hasPhysicalDistribution: false}), 60);
  const physical = phone.releaseTransition({status: "ACTIVE"}, {kind: "campaign_ended",
    endedAt: 1000, hasPhysicalDistribution: true});
  assert.equal(physical.graceUntil, 1000 + 180 * 86400000);
});

test("release unknown outcome is not redispatched and confirmed release is terminal", () => {
  const releasing = phone.releaseTransition({status: "GRACE"},
    {kind: "release_started", requestIdentity: "release-a"});
  const unknown = phone.releaseTransition(releasing, {kind: "unknown_provider_outcome"});
  const released = phone.releaseTransition(unknown, {kind: "release_confirmed", occurredAt: 5000});
  assert.equal(unknown.automaticRetryAllowed, false); assert.equal(released.status, "RELEASED");
  assert.equal(phone.releaseTransition(released, {kind: "release_confirmed"}).idempotentReplay, true);
});

test("historically distributed number tombstone prevents deliberate reacquisition", () => {
  const number = "+14105550199"; const tombstones = new Set([phone.digest(number)]);
  assert.equal(phone.canAcquireNumber(number, tombstones), false);
  assert.equal(phone.canAcquireNumber("+14105550198", tombstones), true);
});

test("downgrade preserves usage and moves excess numbers to grace instead of releasing", () => {
  const value = phone.planChangeProjection({currentPlan: "scale", nextPlan: "starter",
    activeNumbers: 5, includedMinutesUsed: 120});
  assert.equal(value.excessNumbersEnterGrace, 4); assert.equal(value.releaseExistingImmediately, false);
  assert.equal(value.remainingIncludedMinutes, 0);
});

test("provider-cost ledger keeps provider expense distinct and immutable", () => {
  const entry = phone.providerCostEntry({businessUid: "business-a", type: "forwarded_minutes",
    quantity: 10, amountMicros: 140000});
  assert.equal(entry.amountMicros, 140000); assert.equal(entry.currency, "USD");
  assert.equal(entry.immutable, true);
  assert.throws(() => phone.providerCostEntry({type: "marketing_sms", amountMicros: 1}), /cost_invalid/);
});

test("tenant authority rejects spoofing and ordinary Admin exposure stays bounded", async () => {
  assert.equal(phone.assertActor(business), "business-a");
  assert.throws(() => phone.assertActor(business, "business-b"), /cross_tenant/);
  const db = fakeFirestore({
    "businessSubscriptions/business-a": {planId: "managed_growth", status: "active"},
    "phoneForwardingDestinations/destination-a": {businessUid: "business-a", maskedDisplay: "********0074",
      normalizedE164: "+16675550074", state: "VERIFIED"},
    "trackingPhoneAssets/phone-a": {businessUid: "business-a", status: "ACTIVE", e164: "+14105550199",
      campaignId: "campaign-a", campaignName: "Howard County Deck Campaign"},
    "callSessions/call-a": {businessUid: "business-a", trackingPhoneAssetId: "phone-a",
      callerMaskedDisplay: "********0101", rawCallerE164: "+14105550101", state: "NO_ANSWER",
      attribution: {campaignId: "campaign-a"}, startedAt: 1000},
    "phoneUsageLedger/use-a": {businessUid: "business-a", type: "forwarded_minutes", quantity: 27,
      amountMicros: 378000},
  });
  const service = phone.createTrackingPhoneService({db, FieldValue: {serverTimestamp: () => 1}});
  const workspace = await service.workspace({}, business);
  assert.equal(workspace.setupAvailable, false); assert.equal(workspace.providerConfigured, false);
  assert.equal(workspace.usage.allowance.activeNumbers, 12);
  assert.equal(workspace.recentCalls[0].caller, "********0101");
  assert.equal("rawCallerE164" in workspace.recentCalls[0], false);
  const operations = await service.operations({}, admin);
  assert.equal(operations.rawCallerNumbersExposed, false);
  assert.equal(operations.forwardingDestinationsExposed, false);
  assert.equal(operations.providerTraffic, 0);
});

test("tracking-phone safety policy keeps recording, transcription, outbound, SMS and international off", () => {
  assert.deepEqual({recording: phone.DEFAULT_POLICY.recordingEnabled,
    transcription: phone.DEFAULT_POLICY.transcriptionEnabled,
    outbound: phone.DEFAULT_POLICY.outboundCallingEnabled,
    sms: phone.DEFAULT_POLICY.marketingSmsEnabled,
    international: phone.DEFAULT_POLICY.internationalForwardingEnabled},
  {recording: false, transcription: false, outbound: false, sms: false, international: false});
  assert.equal(phone.DEFAULT_POLICY.maximumCallDurationMinutes, 60);
});
