"use strict";

const SCALE_PLAN_ID = "scale";
const MANAGED_GROWTH_PLAN_ID = "managed_growth";
const PROPERTY_INTELLIGENCE_FEATURE = "property_intelligence";
const PAID_BUSINESS_PLANS = new Set(["starter", "growth", "scale", MANAGED_GROWTH_PLAN_ID]);

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
  const expiresAtMillis = timestampMillis(record.expiresAt);
  return [SCALE_PLAN_ID, MANAGED_GROWTH_PLAN_ID].includes(plan) && status === "active" &&
    Number.isFinite(expiresAtMillis) && expiresAtMillis > nowMillis;
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
  const expiresAtMillis = timestampMillis(record.expiresAt);
  return PAID_BUSINESS_PLANS.has(plan) && status === "active" &&
    Number.isFinite(expiresAtMillis) && expiresAtMillis > nowMillis;
}

module.exports = {
  SCALE_PLAN_ID,
  MANAGED_GROWTH_PLAN_ID,
  PROPERTY_INTELLIGENCE_FEATURE,
  PAID_BUSINESS_PLANS,
  hasActiveScaleEntitlement,
  hasActiveManagedGrowthEntitlement,
  hasActivePaidBusinessEntitlement,
};
