"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "InternalBetaEntitlementV1";
const SOURCE = "internal_beta";
const QA_SOURCE = "internal_qa";
const BILLING_STATUS = "comped";
const ALLOWED_PLANS = new Set(["managed_growth"]);
const MAXIMUM_GRANT_DAYS = 365;
const MANAGED_GROWTH_LIST_PRICE = 999;

function cleanText(value, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function millis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return Number.NaN;
}

function entitlementSummary(record = {}) {
  return {
    plan: cleanText(record.planId || record.plan, 40) || null,
    status: cleanText(record.status, 40) || null,
    source: cleanText(record.source, 60) || null,
    billingStatus: cleanText(record.billingStatus, 40) || null,
    expiresAtMillis: Number.isFinite(millis(record.expiresAt)) ? millis(record.expiresAt) : null,
  };
}

function eventId(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function isActiveStripeEntitlement(record, nowMillis) {
  return record?.source === "stripe" &&
    ["active", "trialing", "past_due"].includes(cleanText(record.status, 40).toLowerCase()) &&
    Number.isFinite(millis(record.expiresAt)) && millis(record.expiresAt) > nowMillis;
}

function assertTrustedAdminActor(actor) {
  if (!actor || actor.emailVerified !== true || actor.isAdmin !== true || actor.role !== "admin") {
    throw new Error("trusted_beta_admin_required");
  }
  return actor;
}

function validateGrantInput(input, nowMillis) {
  const businessUid = cleanText(input?.businessUid, 160);
  const businessEmail = normalizeEmail(input?.businessEmail);
  if ((businessUid ? 1 : 0) + (businessEmail ? 1 : 0) !== 1) {
    throw new Error("exactly_one_beta_target_required");
  }
  const plan = cleanText(input?.plan, 40).toLowerCase();
  if (!ALLOWED_PLANS.has(plan)) throw new Error("unsupported_internal_beta_plan");
  const reason = cleanText(input?.reason, 500);
  if (!reason) throw new Error("internal_beta_reason_required");
  const expiresAtMillis = millis(input?.expiresAt);
  const maximum = nowMillis + MAXIMUM_GRANT_DAYS * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(expiresAtMillis) || expiresAtMillis <= nowMillis || expiresAtMillis > maximum) {
    throw new Error("finite_internal_beta_expiry_required");
  }
  const source = cleanText(input?.source, 60).toLowerCase() || SOURCE;
  if (![SOURCE, QA_SOURCE].includes(source)) {
    throw new Error("unsupported_internal_entitlement_source");
  }
  return {businessUid, businessEmail, plan, reason, expiresAtMillis, source};
}

function validateRevokeInput(input) {
  const businessUid = cleanText(input?.businessUid, 160);
  const businessEmail = normalizeEmail(input?.businessEmail);
  if ((businessUid ? 1 : 0) + (businessEmail ? 1 : 0) !== 1) {
    throw new Error("exactly_one_beta_target_required");
  }
  const reason = cleanText(input?.reason, 500);
  if (!reason) throw new Error("internal_beta_reason_required");
  return {businessUid, businessEmail, reason};
}

function createInternalBetaEntitlementService({db, auth, FieldValue, Timestamp, now = () => Date.now()}) {
  async function resolveBusiness(input) {
    let authUser;
    try {
      authUser = input.businessEmail ? await auth.getUserByEmail(input.businessEmail) :
        await auth.getUser(input.businessUid);
    } catch (_) {
      throw new Error("internal_beta_business_not_found");
    }
    const profileSnapshot = await db.collection("users").doc(authUser.uid).get();
    const profile = profileSnapshot.data() || {};
    if (!profileSnapshot.exists || cleanText(profile.role, 40).toLowerCase() !== "business") {
      throw new Error("internal_beta_target_not_business");
    }
    if (authUser.emailVerified !== true) {
      throw new Error("internal_beta_target_email_unverified");
    }
    return {uid: authUser.uid, email: normalizeEmail(authUser.email || input.businessEmail)};
  }

  async function grant(input, actor) {
    const nowMillis = now();
    const valid = validateGrantInput(input, nowMillis);
    const business = await resolveBusiness(valid);
    const expiresAt = Timestamp.fromMillis(valid.expiresAtMillis);
    const subscriptionRef = db.collection("businessSubscriptions").doc(business.uid);
    const walletRef = db.collection("wallets").doc(business.uid);
    const auditId = eventId(["grant", business.uid, valid.plan, valid.reason,
      valid.expiresAtMillis, actor.uid, SCHEMA_VERSION]);
    const auditRef = db.collection("entitlementAuditEvents").doc(auditId);
    return db.runTransaction(async (transaction) => {
      const [subscriptionSnapshot, auditSnapshot] = await Promise.all([
        transaction.get(subscriptionRef), transaction.get(auditRef),
      ]);
      const previous = subscriptionSnapshot.data() || {};
      // Stripe-owned records are never replaced, including inactive historical
      // records. A future overlay must be modeled separately from billing state.
      if (previous.source === "stripe") {
        return {granted: false, preservedPaidEntitlement: true,
          businessUid: business.uid, plan: previous.planId || previous.plan};
      }
      if (auditSnapshot.exists) {
        return {granted: true, idempotentReplay: true, businessUid: business.uid,
          plan: valid.plan, expiresAtMillis: valid.expiresAtMillis};
      }
      const serverTimestamp = FieldValue.serverTimestamp();
      const authoritative = {
        businessId: business.uid, plan: valid.plan, planId: valid.plan, status: "active",
        source: valid.source, billingStatus: BILLING_STATUS, comped: true, reason: valid.reason,
        grantedBy: actor.uid, grantedAt: serverTimestamp, expiresAt,
        revokedAt: null, revokedBy: null, revocationReason: null, updatedAt: serverTimestamp,
      };
      transaction.set(subscriptionRef, authoritative, {merge: false});
      transaction.set(walletRef, {
        ownerId: business.uid, ownerType: "business", subscriptionPlan: valid.plan,
        subscriptionPrice: MANAGED_GROWTH_LIST_PRICE,
        subscriptionStatus: "active", subscriptionComped: true,
        subscriptionSource: valid.source, subscriptionBillingStatus: BILLING_STATUS,
        subscriptionExpiresAt: expiresAt, subscriptionUpdatedAt: serverTimestamp,
        updatedAt: serverTimestamp,
      }, {merge: true});
      transaction.create(auditRef, {
        schemaVersion: SCHEMA_VERSION, eventType: "internal_beta_granted",
        businessUid: business.uid, businessEmail: business.email || null, plan: valid.plan,
        source: valid.source, billingStatus: BILLING_STATUS, reason: valid.reason,
        expiresAt, grantedBy: actor.uid, occurredAt: serverTimestamp,
        previousEntitlement: entitlementSummary(previous),
        newEntitlement: entitlementSummary({...authoritative, expiresAt}),
      });
      return {granted: true, idempotentReplay: false, businessUid: business.uid,
        plan: valid.plan, expiresAtMillis: valid.expiresAtMillis};
    });
  }

  async function revoke(input, actor) {
    const valid = validateRevokeInput(input);
    const business = await resolveBusiness(valid);
    const subscriptionRef = db.collection("businessSubscriptions").doc(business.uid);
    const walletRef = db.collection("wallets").doc(business.uid);
    return db.runTransaction(async (transaction) => {
      const subscriptionSnapshot = await transaction.get(subscriptionRef);
      const previous = subscriptionSnapshot.data() || {};
      if (![SOURCE, QA_SOURCE].includes(previous.source)) {
        throw new Error("internal_beta_entitlement_not_found");
      }
      if (previous.status === "revoked") {
        return {revoked: true, idempotentReplay: true, businessUid: business.uid};
      }
      const auditId = eventId(["revoke", business.uid, valid.reason, actor.uid,
        entitlementSummary(previous), SCHEMA_VERSION]);
      const auditRef = db.collection("entitlementAuditEvents").doc(auditId);
      const auditSnapshot = await transaction.get(auditRef);
      if (auditSnapshot.exists) {
        return {revoked: true, idempotentReplay: true, businessUid: business.uid};
      }
      const serverTimestamp = FieldValue.serverTimestamp();
      transaction.update(subscriptionRef, {status: "revoked", revokedAt: serverTimestamp,
        revokedBy: actor.uid, revocationReason: valid.reason, updatedAt: serverTimestamp});
      transaction.set(walletRef, {subscriptionStatus: "revoked", subscriptionComped: true,
        subscriptionSource: previous.source, subscriptionBillingStatus: BILLING_STATUS,
        subscriptionRevokedAt: serverTimestamp, subscriptionUpdatedAt: serverTimestamp,
        updatedAt: serverTimestamp}, {merge: true});
      transaction.create(auditRef, {
        schemaVersion: SCHEMA_VERSION, eventType: "internal_beta_revoked",
        businessUid: business.uid, plan: previous.planId || previous.plan,
        source: previous.source, reason: valid.reason, revokedBy: actor.uid,
        occurredAt: serverTimestamp, previousEntitlement: entitlementSummary(previous),
        newEntitlement: entitlementSummary({...previous, status: "revoked"}),
      });
      return {revoked: true, idempotentReplay: false, businessUid: business.uid};
    });
  }

  return {grant, revoke, resolveBusiness};
}

module.exports = {SCHEMA_VERSION, SOURCE, QA_SOURCE, BILLING_STATUS, ALLOWED_PLANS,
  MAXIMUM_GRANT_DAYS, MANAGED_GROWTH_LIST_PRICE, normalizeEmail, millis, entitlementSummary,
  isActiveStripeEntitlement, validateGrantInput, validateRevokeInput,
  assertTrustedAdminActor, createInternalBetaEntitlementService};
