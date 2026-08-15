"use strict";

const SCALE_PLAN_ID = "scale";
const MANAGED_GROWTH_PLAN_ID = "managed_growth";
const PROPERTY_INTELLIGENCE_FEATURE = "property_intelligence";

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

module.exports = {
  SCALE_PLAN_ID,
  MANAGED_GROWTH_PLAN_ID,
  PROPERTY_INTELLIGENCE_FEATURE,
  hasActiveScaleEntitlement,
  hasActiveManagedGrowthEntitlement,
};
