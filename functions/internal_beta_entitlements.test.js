"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const beta = require("./internal_beta_entitlements");
const entitlements = require("./subscription_entitlements");

const NOW = Date.parse("2026-08-14T12:00:00Z");
const EXPIRY = Date.parse("2026-11-12T12:00:00Z");
const SERVER_TIMESTAMP = Object.freeze({serverTimestamp: true});
const Timestamp = {fromMillis: (value) => ({toMillis: () => value})};
const FieldValue = {serverTimestamp: () => SERVER_TIMESTAMP};

function fakeEnvironment({profileRole = "business", authEmail = "owner@example.test",
  emailVerified = true,
  existingSubscription = null} = {}) {
  const documents = new Map();
  documents.set("users/business-one", {role: profileRole});
  if (existingSubscription) documents.set("businessSubscriptions/business-one", existingSubscription);
  const writes = [];
  const snapshot = (path) => ({exists: documents.has(path), data: () => documents.get(path)});
  const reference = (collection, id) => ({path: `${collection}/${id}`});
  const db = {
    collection(name) { return {doc: (id) => reference(name, id)}; },
    async runTransaction(callback) {
      const transaction = {
        get: async (ref) => snapshot(ref.path),
        set(ref, value, options) {
          const next = options?.merge ? {...(documents.get(ref.path) || {}), ...value} : value;
          documents.set(ref.path, next); writes.push({operation: "set", path: ref.path, value});
        },
        update(ref, value) {
          documents.set(ref.path, {...(documents.get(ref.path) || {}), ...value});
          writes.push({operation: "update", path: ref.path, value});
        },
        create(ref, value) {
          if (documents.has(ref.path)) throw new Error("already_exists");
          documents.set(ref.path, value); writes.push({operation: "create", path: ref.path, value});
        },
      };
      return callback(transaction);
    },
  };
  // Profile reads happen outside the transaction.
  db.collection = (name) => ({doc: (id) => ({...reference(name, id), get: async () => snapshot(`${name}/${id}`)})});
  const authUser = {uid: "business-one", email: authEmail, emailVerified};
  const auth = {
    async getUser(uid) { if (uid !== authUser.uid) throw new Error("missing"); return authUser; },
    async getUserByEmail(email) { if (email !== authEmail) throw new Error("missing"); return authUser; },
  };
  const service = beta.createInternalBetaEntitlementService({db, auth, FieldValue, Timestamp,
    now: () => NOW});
  return {service, documents, writes};
}

const grantInput = (target = {businessUid: "business-one"}) => ({...target,
  plan: "managed_growth", reason: "Managed Growth founding beta",
  expiresAt: new Date(EXPIRY).toISOString()});

test("only a verified trusted admin actor is accepted", () => {
  assert.throws(() => beta.assertTrustedAdminActor(null), /trusted_beta_admin_required/);
  for (const actor of [
    {uid: "business", role: "business", emailVerified: true, isAdmin: false},
    {uid: "scaler", role: "scaler", emailVerified: true, isAdmin: false},
    {uid: "admin", role: "admin", emailVerified: false, isAdmin: true},
    {uid: "other", role: "support", emailVerified: true, isAdmin: false},
  ]) assert.throws(() => beta.assertTrustedAdminActor(actor), /trusted_beta_admin_required/);
  assert.equal(beta.assertTrustedAdminActor({uid: "admin", role: "admin",
    emailVerified: true, isAdmin: true}).uid, "admin");
});

test("grant validation requires one target, reason, supported plan, and finite bounded expiry", () => {
  assert.throws(() => beta.validateGrantInput({}, NOW), /exactly_one_beta_target_required/);
  assert.throws(() => beta.validateGrantInput(grantInput({businessUid: "business-one",
    businessEmail: "owner@example.test"}), NOW), /exactly_one_beta_target_required/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), reason: ""}, NOW),
    /internal_beta_reason_required/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), plan: "scale"}, NOW),
    /unsupported_internal_beta_plan/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), expiresAt: "2099-01-01"}, NOW),
    /finite_internal_beta_expiry_required/);
});

test("trusted service grants by UID with authoritative comped record, wallet, and audit", async () => {
  const env = fakeEnvironment();
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.granted, true);
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.deepEqual({plan: record.plan, planId: record.planId, status: record.status,
    source: record.source, billingStatus: record.billingStatus, comped: record.comped},
  {plan: "managed_growth", planId: "managed_growth", status: "active",
    source: "internal_beta", billingStatus: "comped", comped: true});
  assert.equal(record.grantedAt, SERVER_TIMESTAMP);
  assert.equal(record.updatedAt, SERVER_TIMESTAMP);
  assert.equal(record.expiresAt.toMillis(), EXPIRY);
  for (const forbidden of ["stripeCustomerId", "stripeSubscriptionId", "checkoutSessionId",
    "paymentIntentId"]) assert.equal(Object.hasOwn(record, forbidden), false);
  const wallet = env.documents.get("wallets/business-one");
  assert.equal(wallet.subscriptionPlan, "managed_growth");
  assert.equal(wallet.subscriptionPrice, 999);
  assert.equal(wallet.subscriptionSource, "internal_beta");
  assert.equal(wallet.subscriptionBillingStatus, "comped");
  const audits = [...env.documents.entries()].filter(([path]) => path.startsWith("entitlementAuditEvents/"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].eventType, "internal_beta_granted");
  assert.equal(audits[0][1].occurredAt, SERVER_TIMESTAMP);
});

test("target by normalized email works and invalid/non-Business targets fail", async () => {
  const env = fakeEnvironment();
  const result = await env.service.grant(grantInput({businessEmail: "OWNER@example.test"}),
    {uid: "admin-one"});
  assert.equal(result.businessUid, "business-one");
  await assert.rejects(env.service.grant(grantInput({businessEmail: "missing@example.test"}),
    {uid: "admin-one"}), /internal_beta_business_not_found/);
  const scaler = fakeEnvironment({profileRole: "scaler"});
  await assert.rejects(scaler.service.grant(grantInput(), {uid: "admin-one"}),
    /internal_beta_target_not_business/);
});

test("unverified target Business is rejected", async () => {
  const env = fakeEnvironment({emailVerified: false});
  await assert.rejects(env.service.grant(grantInput(), {uid: "admin-one"}),
    /internal_beta_target_email_unverified/);
});

test("active Stripe entitlement is preserved without beta or audit writes", async () => {
  const paid = {plan: "scale", planId: "scale", status: "active", source: "stripe",
    expiresAt: Timestamp.fromMillis(EXPIRY), stripeSubscriptionId: "sub_existing"};
  const env = fakeEnvironment({existingSubscription: paid});
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.preservedPaidEntitlement, true);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), paid);
  assert.equal(env.writes.length, 0);
});

test("inactive Stripe billing history is preserved for a future overlay design", async () => {
  const paid = {plan: "scale", status: "cancelled", source: "stripe",
    expiresAt: Timestamp.fromMillis(NOW - 1), stripeSubscriptionId: "sub_historical"};
  const env = fakeEnvironment({existingSubscription: paid});
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.preservedPaidEntitlement, true);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), paid);
  assert.equal(env.writes.length, 0);
});

test("grant retries and revocation are idempotent and revocation relocks entitlement", async () => {
  const env = fakeEnvironment();
  await env.service.grant(grantInput(), {uid: "admin-one"});
  const replay = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(replay.idempotentReplay, true);
  const revoked = await env.service.revoke({businessUid: "business-one", reason: "Beta complete"},
    {uid: "admin-one"});
  assert.equal(revoked.revoked, true);
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.equal(record.status, "revoked");
  assert.equal(record.revokedAt, SERVER_TIMESTAMP);
  assert.equal(entitlements.hasActiveScaleEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record, {nowMillis: NOW}), false);
  const replayRevoke = await env.service.revoke({businessUid: "business-one", reason: "Beta complete"},
    {uid: "admin-one"});
  assert.equal(replayRevoke.idempotentReplay, true);
  const auditTypes = [...env.documents.entries()].filter(([path]) =>
    path.startsWith("entitlementAuditEvents/")).map(([, value]) => value.eventType).sort();
  assert.deepEqual(auditTypes, ["internal_beta_granted", "internal_beta_revoked"]);
});

test("expiry disables both Scale and Managed Growth without cleanup", () => {
  const record = {plan: "managed_growth", status: "active", source: "internal_beta",
    expiresAt: Timestamp.fromMillis(NOW - 1)};
  assert.equal(entitlements.hasActiveScaleEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record, {nowMillis: NOW}), false);
});

test("callables require verified trusted admin and expose no client grant shortcut", () => {
  const source = fs.readFileSync(require.resolve("./index"), "utf8");
  assert.match(source, /function requireTrustedBetaAdmin[\s\S]*?assertTrustedAdminActor\(context\)/);
  for (const name of ["grantInternalBetaEntitlement", "revokeInternalBetaEntitlement"]) {
    const start = source.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    assert.match(source.slice(start, start + 700), /requireTrustedBetaAdmin\(request\)/);
  }
  assert.doesNotMatch(source, /request\.data\?.*(grantedBy|source|billingStatus|comped)/i);
});
