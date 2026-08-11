"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const LOCAL_PROJECT_ID = "demo-scaledcircle";
const PRODUCTION_PROJECT_ID = "scaled-circle";
const projectId = process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT || LOCAL_PROJECT_ID;

function requireLocalEmulators() {
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error("ABORT: local seed refuses production project scaled-circle.");
  }
  if (projectId !== LOCAL_PROJECT_ID) {
    throw new Error(`ABORT: expected ${LOCAL_PROJECT_ID}, received ${projectId}.`);
  }
  for (const name of [
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
  ]) {
    if (!process.env[name]) {
      throw new Error(`ABORT: ${name} is required; no cloud fallback is allowed.`);
    }
  }
}

requireLocalEmulators();
initializeApp({projectId, storageBucket: `${projectId}.appspot.com`});
const auth = getAuth();
const db = getFirestore();

const ids = Object.freeze({
  business: "local-business", scaler: "local-scaler", admin: "local-admin",
  campaign: "local-campaign", zone: "local-zone",
  contract: "local-contract", payment: "local-payment",
});

async function ensureUser(uid, email, role, displayName) {
  try {
    await auth.getUser(uid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser({uid, email, password: "LocalTest123!", displayName});
  }
  await db.collection("users").doc(uid).set({
    email, displayName, role, active: true, localSynthetic: true,
    updatedAt: Timestamp.now(),
  }, {merge: true});
}

async function seed() {
  await ensureUser(ids.business, "business@local.scaledcircle.test", "business", "Local Business");
  await ensureUser(ids.scaler, "scaler@local.scaledcircle.test", "scaler", "Local Scaler");
  await ensureUser(ids.admin, "admin@local.scaledcircle.test", "admin", "Local Admin");
  const now = Timestamp.now();
  await db.collection("campaigns").doc(ids.campaign).set({
    businessId: ids.business, name: "Local Emulator Campaign",
    description: "Synthetic local-only canvassing campaign", status: "funded",
    currency: "usd", localSynthetic: true, createdAt: now, updatedAt: now,
  });
  await db.collection("campaignZones").doc(ids.zone).set({
    campaignId: ids.campaign, businessId: ids.business,
    assignedScalerId: ids.scaler, status: "assigned", estimatedHomes: 25,
    localSynthetic: true, createdAt: now, updatedAt: now,
  });
  await db.collection("assignmentCompensationContracts").doc(ids.contract).set({
    campaignId: ids.campaign, zoneId: ids.zone, businessId: ids.business,
    scalerId: ids.scaler, workerAmountCents: 10000, platformFeeCents: 2000,
    businessChargeCents: 12000, currency: "usd", status: "accepted",
    localSynthetic: true, createdAt: now,
  });
  await db.collection("campaignPayments").doc(ids.payment).set({
    campaignId: ids.campaign, businessId: ids.business,
    workerFundedCents: 10000, platformFeeFundedCents: 2000,
    capturedAmountCents: 12000, currency: "usd",
    status: "funded_local_synthetic", stripeMode: "not_called",
    localSynthetic: true, createdAt: now, updatedAt: now,
  });
  console.log("Seeded demo-scaledcircle with synthetic local-only records.");
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
