"use strict";

const SCALE_PLAN_ID = "scale";
const MANAGED_GROWTH_PLAN_ID = "managed_growth";
const PROPERTY_INTELLIGENCE_FEATURE = "property_intelligence";
const PAID_BUSINESS_PLANS = new Set(["starter", "growth", "scale", MANAGED_GROWTH_PLAN_ID]);
const CORE_PLANS = new Set(["starter", "growth", "scale"]);

function hasNonExpiringComplimentaryTerm(record) {
  return !!record && CORE_PLANS.has(record.planId || record.plan) &&
    record.comped === true && record.billingStatus === "comped" &&
    record.source === "internal_qa" && record.purpose === "store_review" &&
    record.paidProviderUsageAllowed === false &&
    record.accessTerm === "until_revoked" && record.expiresAt == null && record.revokedAt == null;
}

function hasCurrentMembershipTerm(record, nowMillis) {
  if (hasNonExpiringComplimentaryTerm(record)) return true;
  const expiry = timestampMillis(record?.expiresAt);
  return Number.isFinite(expiry) && expiry > nowMillis;
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Number.NaN;
}

function hasActiveScaleEntitlement(record, {nowMillis = Date.now()} = {}) {
  if (!record || typeof record !== "object") return false;
  const plan = String(record.planId || record.plan || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  return [SCALE_PLAN_ID, MANAGED_GROWTH_PLAN_ID].includes(plan) && status === "active" &&
    hasCurrentMembershipTerm(record, nowMillis);
}

function hasActiveManagedGrowthEntitlement(record, options = {}) {
  if (!record || typeof record !== "object") return false;
  const plan = String(record.planId || record.plan || "").trim().toLowerCase();
  return plan === MANAGED_GROWTH_PLAN_ID && hasActiveScaleEntitlement(record, options);
}

function hasActivePaidBusinessEntitlement(record, {nowMillis = Date.now()} = {}) {
  if (!record || typeof record !== "object") return false;
  const plan = String(record.planId || record.plan || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  return PAID_BUSINESS_PLANS.has(plan) && status === "active" &&
    hasCurrentMembershipTerm(record, nowMillis);
}

function hasActiveProductEntitlement(record, product, options = {}) {
  if(!['business_assistant','lead_generation_research'].includes(product))return false;
  return hasActivePaidBusinessEntitlement(record,options) && record.source==='stripe' &&
    Array.isArray(record.addons) && record.addons.includes(product) &&
    Array.isArray(record.productEntitlements) && record.productEntitlements.includes(product);
}

module.exports = {
  SCALE_PLAN_ID,
  MANAGED_GROWTH_PLAN_ID,
  PROPERTY_INTELLIGENCE_FEATURE,
  PAID_BUSINESS_PLANS,
  hasActiveScaleEntitlement,
  hasActiveManagedGrowthEntitlement,
  hasActivePaidBusinessEntitlement,
  hasActiveProductEntitlement,
  hasNonExpiringComplimentaryTerm,
  hasCurrentMembershipTerm,
};
