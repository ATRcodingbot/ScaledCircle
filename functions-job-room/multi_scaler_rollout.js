"use strict";

const POLICY_VERSION = "MultiScalerRolloutPolicyV1";
const PRODUCTION_MAXIMUM_SCALER_COUNT = 1;
const LOCAL_MAXIMUM_SCALER_COUNT = 12;

function isIsolatedLocalDemoEnvironment(environment = process.env) {
  const projectId = environment.GCLOUD_PROJECT || environment.GOOGLE_CLOUD_PROJECT;
  return environment.FUNCTIONS_EMULATOR === "true" &&
    projectId === "demo-scaledcircle" &&
    environment.APP_ENV !== "production";
}

function policyForEnvironment(environment = process.env) {
  const local = isIsolatedLocalDemoEnvironment(environment);
  return {
    version: POLICY_VERSION,
    localDemo: local,
    enabledForNormalBusinesses: local,
    maximumScalerCount: local ? LOCAL_MAXIMUM_SCALER_COUNT :
      PRODUCTION_MAXIMUM_SCALER_COUNT,
  };
}

function assertAllowedScalerCount(value, environment = process.env) {
  const count = Number(value ?? 1);
  const policy = policyForEnvironment(environment);
  if (!Number.isSafeInteger(count) || count < 1 || count > policy.maximumScalerCount) {
    const error = new Error("multi_scaler_production_rollout_locked");
    error.code = "multi_scaler_production_rollout_locked";
    error.policy = policy;
    throw error;
  }
  return {count, policy};
}

function campaignScalerCount(campaign = {}) {
  return Number(campaign.requiredScalerCount ?? campaign.requestedScalerCount ?? 1);
}

module.exports = {
  POLICY_VERSION,
  PRODUCTION_MAXIMUM_SCALER_COUNT,
  LOCAL_MAXIMUM_SCALER_COUNT,
  isIsolatedLocalDemoEnvironment,
  policyForEnvironment,
  assertAllowedScalerCount,
  campaignScalerCount,
};
