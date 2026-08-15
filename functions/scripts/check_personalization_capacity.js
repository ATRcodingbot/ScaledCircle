#!/usr/bin/env node
"use strict";

const {initializeApp, applicationDefault} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {SUPPORTED_POPULATION, POLICY_VERSION} = require("../scaler_notification_capacity");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const projectId = argument("--project");
  if (projectId !== "scaled-circle") {
    throw new Error("Explicit --project scaled-circle is required.");
  }
  initializeApp({credential: applicationDefault(), projectId});
  const db = getFirestore();
  const [scalers, preferences] = await Promise.all([
    db.collection("users").where("role", "==", "scaler").select("active", "betaAccess").get(),
    db.collection("discoveryPreferences").where("role", "==", "scaler").count().get(),
  ]);
  const approvedScalerProfiles = scalers.docs.filter((snapshot) => {
    const profile = snapshot.data();
    return profile.active === true && String(profile.betaAccess || "").toLowerCase() === "approved";
  }).length;
  const savedScalerPreferences = preferences.data().count;
  console.log(JSON.stringify({projectId, policyVersion: POLICY_VERSION,
    approvedScalerProfiles, savedScalerPreferences, supportedPopulation: SUPPORTED_POPULATION,
    deploymentReview: savedScalerPreferences < SUPPORTED_POPULATION ? "ACCEPTABLE" : "STOP_PARTITION_REQUIRED"}, null, 2));
  if (savedScalerPreferences >= SUPPORTED_POPULATION) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
