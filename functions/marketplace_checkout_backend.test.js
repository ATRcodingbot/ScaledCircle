"use strict";

const assert = require("node:assert/strict");
const {after, beforeEach, test} = require("node:test");
const fftFactory = require("firebase-functions-test");
const {getFirestore} = require("firebase-admin/firestore");
const marketplace = require("./marketplace_finance");
const {runFinancialOperation} = require("./marketplace_operations");

process.env.GCLOUD_PROJECT ||= "demo-scaledcircle";
process.env.GOOGLE_CLOUD_PROJECT ||= "demo-scaledcircle";

const fft = fftFactory({projectId: "demo-scaledcircle"});
const functions = require("./index");
const db = getFirestore();
const campaignId = "checkout-backend-campaign";
const businessId = "checkout-backend-business";
const fundingVersion = 1;
const operationId = marketplace.operationId("campaign-checkout", campaignId, fundingVersion);
const paymentId = marketplace.operationId("campaign-payment", campaignId, fundingVersion);
const campaignRef = db.collection("campaigns").doc(campaignId);
const paymentRef = db.collection("campaignPayments").doc(paymentId);
const quote = marketplace.quoteCampaignFunding(10000);

function store() {
  return functions._marketplaceTest.campaignCheckoutOperationStore({
    campaignRef, paymentRef, businessId, fundingVersion, operationId, quote,
  });
}

function trustedInput() {
  return {campaignId, businessId, fundingVersion, businessChargeCents: 12000};
}

beforeEach(async () => {
  const collections = await Promise.all([
    db.collection("campaigns").get(),
    db.collection("campaignPayments").get(),
    db.collection("financialOperations").get(),
  ]);
  const batch = db.batch();
  for (const snapshots of collections) {
    for (const document of snapshots.docs) batch.delete(document.ref);
  }
  await batch.commit();
  await campaignRef.set({
    businessId, status: "draft", fundingStatus: "unfunded", fundingVersion: 0,
    workerAmountCents: 10000,
  });
});

after(() => fft.cleanup());

test("transactional claim permits one same-version payment under concurrency", async () => {
  let executions = 0;
  const invoke = () => runFinancialOperation({
    store: store(), operationId, kind: "campaign_checkout_creation",
    trustedInput: trustedInput(),
    execute: async () => {
      executions += 1;
      await paymentRef.set({id: paymentId, businessId, campaignId, fundingVersion,
        status: "payment_pending", stripeCheckoutSessionId: "cs_test_one",
        stripeCheckoutUrl: "https://checkout.stripe.test/one", ...quote});
      return {sessionId: "cs_test_one", url: "https://checkout.stripe.test/one"};
    },
  });
  const results = await Promise.all([invoke(), invoke()]);
  assert.equal(executions, 1);
  assert.deepEqual(results.map((item) => item.sessionId), ["cs_test_one", "cs_test_one"]);
  assert.equal((await db.collection("financialOperations").get()).size, 1);
  assert.equal((await db.collection("campaignPayments").get()).size, 1);
  const campaign = (await campaignRef.get()).data();
  assert.equal(campaign.fundingStatus, "payment_pending");
  assert.equal(campaign.fundingCheckoutOperationId, operationId);
});

test("existing same-version pending Checkout is recovered without execution", async () => {
  await campaignRef.update({fundingStatus: "payment_pending",
    fundingCheckoutVersion: 1, fundingCheckoutOperationId: operationId});
  await paymentRef.set({id: paymentId, businessId, campaignId, fundingVersion,
    status: "payment_pending", stripeCheckoutSessionId: "cs_test_existing",
    stripeCheckoutUrl: "https://checkout.stripe.test/existing", ...quote});
  let executions = 0;
  const result = await runFinancialOperation({
    store: store(), operationId, kind: "campaign_checkout_creation",
    trustedInput: trustedInput(), execute: async () => { executions += 1; },
  });
  assert.equal(executions, 0);
  assert.equal(result.sessionId, "cs_test_existing");
  assert.equal(result.recovered, true);
});

test("campaign becoming funded before claim is rejected atomically", async () => {
  await campaignRef.update({fundingStatus: "funded", fundingVersion: 1});
  await assert.rejects(runFinancialOperation({
    store: store(), operationId, kind: "campaign_checkout_creation",
    trustedInput: trustedInput(), execute: async () => ({sessionId: "should-not-run"}),
  }), /eligible for funding Checkout/);
  assert.equal((await db.collection("financialOperations").get()).size, 0);
  assert.equal((await db.collection("campaignPayments").get()).size, 0);
});

test("operation claim atomically creates only a pending unfunded payment record", async () => {
  const claim = await store().claim({operationId, kind: "campaign_checkout_creation",
    inputDigest: "digest-one", trustedInput: trustedInput()});
  assert.equal(claim.execute, true);
  const paymentRecord = (await paymentRef.get()).data();
  assert.equal(paymentRecord.status, "payment_pending");
  assert.equal(paymentRecord.workerAmountCents, 10000);
  assert.equal(paymentRecord.platformFeeCents, 2000);
  assert.equal(paymentRecord.businessChargeCents, 12000);
  assert.equal(paymentRecord.stripeCheckoutSessionId, undefined);
  const campaignRecord = (await campaignRef.get()).data();
  assert.equal(campaignRecord.fundingStatus, "payment_pending");
  assert.notEqual(campaignRecord.fundingStatus, "funded");
});
