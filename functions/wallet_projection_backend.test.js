"use strict";

const assert = require("node:assert/strict");
const {after, before, beforeEach, test} = require("node:test");
const fftFactory = require("firebase-functions-test");
const {getApps} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

process.env.GCLOUD_PROJECT ||= "demo-scaledcircle";
process.env.GOOGLE_CLOUD_PROJECT ||= "demo-scaledcircle";

const fft = fftFactory({projectId: "demo-scaledcircle"});
const functions = require("./index");
const db = getFirestore();
const promoPath = "wallets/business/promoRedemptions/development-business-10000-v1";

const invoke = (uid = "business") => fft.wrap(functions.ensureLegacyWalletProjection)({
  data: {},
  auth: uid ? {uid, token: {email_verified: true, email: `${uid}@test.invalid`}} : undefined,
});

async function clearFirestore() {
  for (const collection of await db.listCollections()) {
    for (const document of await collection.listDocuments()) await db.recursiveDelete(document);
  }
}

async function seedUser(data = {}) {
  await db.doc("users/business").set({role: "business", ...data});
}

async function seedLegacyWallet(data = {}) {
  await db.doc("wallets/business").set({
    ownerId: "business", ownerType: "business", balance: 37,
    availableCredits: 37, reservedCredits: 4, totalPaidOut: 0,
    availableBalance: 0, pendingBalance: 0, promotionalCreditsGranted: 0,
    ...data,
  });
}

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,
    "Run wallet projection tests through the Firestore emulator.");
});

beforeEach(clearFirestore);

after(async () => {
  fft.cleanup();
  for (const app of getApps()) await app.delete();
});

test("existing legacy wallet with redemption is unchanged", async () => {
  await seedUser({developmentCreditsEnabled: true});
  await seedLegacyWallet();
  await db.doc(promoPath).set({promoKey: "development-business-10000-v1"});
  const beforeWallet = (await db.doc("wallets/business").get()).data();
  await invoke();
  assert.deepEqual((await db.doc("wallets/business").get()).data(), beforeWallet);
  assert.equal((await db.collection("wallets/business/promoRedemptions").get()).size, 1);
  assert.equal((await db.collection("wallets/business/transactions").get()).size, 0);
});

test("existing wallet without optional projection fields initializes", async () => {
  await seedUser();
  await seedLegacyWallet();
  await assert.doesNotReject(invoke());
  const wallet = (await db.doc("wallets/business").get()).data();
  assert.equal(wallet.balance, 37);
  assert.equal(wallet.projectionOnly, undefined);
});

test("missing wallet creates one safe projection without promotional value", async () => {
  await seedUser();
  await invoke();
  const wallet = (await db.doc("wallets/business").get()).data();
  assert.equal(wallet.ownerId, "business");
  assert.equal(wallet.ownerType, "business");
  assert.equal(wallet.balance, 0);
  assert.equal(wallet.availableCredits, 0);
  assert.equal((await db.doc(promoPath).get()).exists, false);
  assert.equal((await db.collection("wallets/business/transactions").get()).size, 0);
});

test("trusted development promo is applied exactly once", async () => {
  await seedUser({developmentCreditsEnabled: true});
  await invoke();
  const first = (await db.doc("wallets/business").get()).data();
  assert.equal(first.availableCredits, 10000);
  assert.equal(first.promotionalCreditsGranted, 10000);
  await invoke();
  const second = (await db.doc("wallets/business").get()).data();
  assert.equal(second.availableCredits, 10000);
  assert.equal(second.promotionalCreditsGranted, 10000);
  assert.equal((await db.collection("wallets/business/promoRedemptions").get()).size, 1);
  assert.equal((await db.collection("wallets/business/transactions").get()).size, 0);
});

test("ordinary Business cannot receive development promotional value", async () => {
  await seedUser({active: true, betaAccess: "approved", accountType: "business"});
  await invoke();
  const wallet = (await db.doc("wallets/business").get()).data();
  assert.equal(wallet.availableCredits, 0);
  assert.equal(wallet.promotionalCreditsGranted, 0);
  assert.equal((await db.doc(promoPath).get()).exists, false);
});

test("concurrent retries create one projection and one promo only", async () => {
  await seedUser({developmentCreditsEnabled: true});
  await Promise.all(Array.from({length: 6}, () => invoke()));
  const wallet = (await db.doc("wallets/business").get()).data();
  assert.equal(wallet.availableCredits, 10000);
  assert.equal(wallet.promotionalCreditsGranted, 10000);
  assert.equal((await db.collection("wallets/business/promoRedemptions").get()).size, 1);
  assert.equal((await db.collection("wallets/business/transactions").get()).size, 0);
});

test("authentication owns the target and no caller-supplied UID is honored", async () => {
  await assert.rejects(invoke(null), (error) => error.code === "unauthenticated");
  await seedUser();
  await db.doc("users/other").set({role: "business"});
  await fft.wrap(functions.ensureLegacyWalletProjection)({
    data: {userId: "other", businessId: "other"},
    auth: {uid: "business", token: {email_verified: true}},
  });
  assert.equal((await db.doc("wallets/business").get()).exists, true);
  assert.equal((await db.doc("wallets/other").get()).exists, false);
});

test("wallet projection callable has no Stripe or payment operation", () => {
  const source = require("node:fs").readFileSync(require.resolve("./index"), "utf8");
  const start = source.indexOf("exports.ensureLegacyWalletProjection");
  const end = source.indexOf("function stripeClient", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const declaration = source.slice(start, end);
  assert.doesNotMatch(declaration, /stripe|checkout|paymentIntent|campaignFunding/i);
  assert.doesNotMatch(declaration, /secrets\s*:/);
});
