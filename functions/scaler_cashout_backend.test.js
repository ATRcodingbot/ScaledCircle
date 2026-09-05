"use strict";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some((x) => x && x !== "demo-scaledcircle")) {
  throw new Error("cashout_tests_require_local_demo_emulator");
}
const assert = require("node:assert/strict");
const {test, beforeEach, after} = require("node:test");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const Stripe = require("stripe");
const core = require("./scaler_cashout");
const {createStripeProvider, handleWebhook} = require("./scaler_cashout_stripe");
const {createEndpoints} = require("./scaler_cashout_endpoints");
const {runtime, mockStripe} = require("./test_fixtures/cashout");
const app = initializeApp({projectId: "demo-scaledcircle"}, "cashout-tests");
const db = getFirestore(app);
const uid = "cashout-scaler";
const request = {requestId: "fixture_request_0001", amountCents: 500};
let store; let mock; let service; let provider;
let clock;
const record = () => ({scalerId: uid, mode: "test", stripeAccountId: "acct_fixture"});
const balance = async () => (await db.doc(`scalerCashoutBalances/${uid}`).get()).data();
beforeEach(async () => {
  for (const name of ["financialOperations", "scalerCashoutBalances", "scalerCashoutTestFunding", "scalerCashoutEvents", "wallets", "stripeConnectedAccounts", "users"]) {
    for (const ref of await db.collection(name).listDocuments()) await db.recursiveDelete(ref);
  }
  clock = Date.now();
  store = core.createStore(db, () => clock); mock = mockStripe();
  provider = createStripeProvider({stripe: mock.stripe, runtime});
  service = core.createService({store, provider, runtime, now: () => clock});
  await db.doc(`users/${uid}`).set({role: "scaler"});
  await db.doc(`stripeConnectedAccounts/${uid}`).set(record());
  await db.doc(`wallets/${uid}`).set({ownerId: uid, ownerType: "scaler", availableBalance: 123});
  await db.doc(`scalerCashoutBalances/${uid}`).set({ownerId: uid, mode: "test", currency: "usd",
    source: "bounded_test_fixture", fundedCents: 1000, availableCents: 1000, pendingCents: 0, paidCents: 0, settlementFrozen: false});
});
after(async () => { await db.terminate(); await deleteApp(app); });

test("concurrent duplicate cash-outs reserve once, transfer once, and settle one Wallet operation", async () => {
  const responses = await Promise.all(Array.from({length: 6}, () => service.request(uid, request, record())));
  const key = responses[0].operationId;
  assert.ok(responses.every((x) => x.operationId === key));
  assert.equal((await db.collection("financialOperations").get()).size, 1);
  assert.equal(mock.transfers.size, 1); assert.equal(mock.payouts.size, 1);
  assert.equal((await balance()).availableCents, 500);
  assert.equal((await balance()).pendingCents, 500);
  [...mock.payouts.values()][0].status = "paid";
  await service.run(key, uid, {readOnly: true});
  await service.run(key, uid, {readOnly: true});
  assert.equal((await balance()).pendingCents, 0); assert.equal((await balance()).paidCents, 500);
  const wallet = (await db.doc(`wallets/${uid}`).get()).data();
  assert.equal(wallet.availableBalance, 123); // Production earning projection never funds TEST cash-out.
  assert.equal(wallet.cashoutAvailableCents, 500);
  assert.equal((await db.collection(`wallets/${uid}/transactions`).get()).size, 1);
  assert.ok((await db.collection(`financialOperations/${key}/audit`).get()).size > 3);
});

test("different concurrent requests cannot reserve or spend the same funds", async () => {
  const results = await Promise.allSettled([service.request(uid, {...request, amountCents: 800}, record()),
    service.request(uid, {...request, requestId: "fixture_request_0002", amountCents: 800}, record())]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await balance()).availableCents, 200);
  assert.equal(mock.transfers.size, 1);
});

test("wrong owner, mode, destination, insufficient balance and incomplete onboarding fail closed", async () => {
  await assert.rejects(service.request(uid, {...request, accountId: "acct_other"}, record()));
  await assert.rejects(service.request(uid, request, {...record(), scalerId: "other"}));
  await assert.rejects(service.request(uid, request, {...record(), mode: "live"}));
  await assert.rejects(service.request(uid, {...request, amountCents: 1001}, record()));
  mock.controls.account.payouts_enabled = false;
  await assert.rejects(service.request(uid, request, record()));
  mock.controls.account.payouts_enabled = true;
  await db.doc(`wallets/${uid}`).update({ownerId: "other"});
  await assert.rejects(service.request(uid, request, record()));
  assert.equal(mock.calls.length, 0); assert.equal((await balance()).availableCents, 1000);
});

test("definitive transfer failure releases once; retry does not invent another operation", async () => {
  mock.controls.transferFailure = "hard";
  const result = await service.request(uid, request, record());
  assert.equal(result.status, "failed");
  await service.request(uid, request, record());
  assert.equal((await balance()).availableCents, 1000); assert.equal((await balance()).pendingCents, 0);
  assert.equal(mock.calls.filter((x) => x.type === "transfer").length, 1);
  assert.equal((await db.collection("financialOperations").get()).size, 1);
});

test("ambiguous transfer and payout recover by receipt before retry", async () => {
  mock.controls.transferFailure = "lost";
  const result = await service.request(uid, request, record());
  assert.equal(result.status, "needs_attention"); assert.equal((await balance()).pendingCents, 500);
  mock.controls.payoutFailure = "lost";
  await service.run(result.operationId, uid);
  await service.run(result.operationId, uid);
  assert.equal(mock.calls.filter((x) => x.type === "transfer").length, 1);
  assert.equal(mock.calls.filter((x) => x.type === "payout").length, 1);
  assert.equal((await balance()).availableCents, 500);
});

test("failed payout retry creates only a new payout attempt; no second transfer or deduction", async () => {
  mock.controls.payoutStatus = "failed";
  const result = await service.request(uid, request, record());
  assert.equal(result.status, "needs_attention"); assert.equal((await balance()).pendingCents, 500);
  mock.controls.payoutStatus = "paid";
  await service.run(result.operationId, uid, {retryPayout: true});
  assert.equal(mock.transfers.size, 1); assert.equal(mock.payouts.size, 2);
  assert.equal((await balance()).paidCents, 500); assert.equal((await balance()).availableCents, 500);
  assert.equal((await db.collection("financialOperations").get()).size, 1);
});

test("full verified reversal releases held funds once; partial reversal stays held", async () => {
  mock.controls.payoutStatus = "failed";
  const result = await service.request(uid, request, record());
  const transfer = [...mock.transfers.values()][0]; transfer.amount_reversed = 200;
  await service.run(result.operationId, uid, {readOnly: true});
  assert.equal((await balance()).pendingCents, 500);
  transfer.amount_reversed = 500;
  await service.run(result.operationId, uid, {readOnly: true});
  await service.run(result.operationId, uid, {readOnly: true});
  assert.equal((await balance()).availableCents, 1000); assert.equal((await balance()).pendingCents, 0);
});

test("refund/dispute hold blocks new requests and execution, while read-only reconciliation remains allowed", async () => {
  mock.controls.transferFailure = "lost";
  const result = await service.request(uid, request, record());
  await db.doc(`scalerCashoutBalances/${uid}`).update({settlementFrozen: true});
  await assert.rejects(service.run(result.operationId, uid));
  await assert.rejects(service.request(uid, {...request, requestId: "fixture_request_0002"}, record()));
  await service.run(result.operationId, uid, {readOnly: true});
  assert.equal(mock.payouts.size, 0); assert.equal((await balance()).pendingCents, 500);
});

test("credential/mode changes and stale claims cannot overwrite the current operation", async () => {
  const initial = await store.request(uid, request.requestId, 500, "acct_fixture");
  const first = await store.claim(initial.id, uid);
  clock += 130000;
  const second = await store.claim(initial.id, uid);
  await assert.rejects(store.save(first, {state: "failed"}, "release"), /stale_claim/);
  const saved = await store.save(second, {mode: "live", accountId: "acct_other", currency: "eur"});
  assert.equal(saved.currency, "usd");
  assert.equal(saved.mode, "test"); assert.equal(saved.accountId, "acct_fixture");
  await db.doc(`stripeConnectedAccounts/${uid}`).update({mode: "live"});
  await assert.rejects(service.run(initial.id, uid));
  assert.equal(mock.calls.length, 0);
});

test("signed webhook replay reconciles exactly once without provider mutation", async () => {
  const result = await service.request(uid, request, record());
  [...mock.payouts.values()][0].status = "paid";
  const sdk = new Stripe("sk_test_offlinefixture");
  const secret = "whsec_offlinefixture";
  const payload = JSON.stringify({id: "evt_fixture", type: "payout.paid", livemode: false,
    account: "acct_fixture", data: {object: {metadata: {cashoutId: result.operationId}}}});
  const signature = sdk.webhooks.generateTestHeaderString({payload, secret});
  const call = () => handleWebhook({stripe: sdk, store, service, runtime, secret, rawBody: Buffer.from(payload), signature});
  const count = mock.calls.length;
  await call(); assert.equal((await call()).duplicate, true);
  assert.equal(mock.calls.length, count); assert.equal((await balance()).paidCents, 500);
});

test("onboarding reuses bound account, fails wrong mode and returns a hosted URL only", async () => {
  const endpoints = createEndpoints({db, stripe: mock.stripe, provider, service, runtime});
  assert.equal((await endpoints.status(uid)).ready, true);
  const result = await endpoints.setup(uid, "scaler@example.invalid");
  assert.equal(result.url, "https://connect.stripe.com/setup/fixture");
  assert.equal(result.stripeAccountId, undefined);
  assert.equal(mock.calls.filter((x) => x.type === "account").length, 0);
  await db.doc(`stripeConnectedAccounts/${uid}`).update({mode: "live"});
  await assert.rejects(endpoints.setup(uid, "scaler@example.invalid"));
});

test("unresolved operation outside idempotency window remains reserved without a new provider request", async () => {
  mock.controls.transferFailure = "before";
  const result = await service.request(uid, request, record());
  const count = mock.calls.length;
  clock += 21 * 60 * 60 * 1000;
  await service.run(result.operationId, uid);
  assert.equal(mock.calls.length, count); assert.equal((await balance()).pendingCents, 500);
  assert.equal(mock.transfers.size, 0);
});

test("TEST funding fixture is bounded and cannot reset a previously funded Wallet", async () => {
  const {seed} = require("./scripts/seed_cashout_test_balance");
  await db.doc(`scalerCashoutBalances/${uid}`).delete();
  await assert.rejects(seed({db, uid, amountCents: 1000, projectId: "scaled-circle"}));
  await seed({db, uid, amountCents: 1000, projectId: "demo-scaledcircle"});
  await assert.rejects(seed({db, uid, amountCents: 1000, projectId: "demo-scaledcircle"}));
  assert.equal((await balance()).fundedCents, 1000);
});

test("Wallet-level settlement hold blocks retry without preventing read-only receipt reconciliation", async () => {
  mock.controls.transferFailure = "lost";
  const result = await service.request(uid, request, record());
  await db.doc(`wallets/${uid}`).update({settlementFrozen: true});
  await assert.rejects(service.run(result.operationId, uid), /settlement_held/);
  await service.run(result.operationId, uid, {readOnly: true});
  assert.equal(mock.payouts.size, 0);
});

test("new onboarding binds only provider-verified TEST account and reuses it on the next setup", async () => {
  await db.doc(`stripeConnectedAccounts/${uid}`).delete();
  const endpoints = createEndpoints({db, stripe: mock.stripe, provider, service, runtime});
  assert.equal((await endpoints.status(uid)).status, "not_setup");
  await endpoints.setup(uid, "scaler@example.invalid");
  await endpoints.setup(uid, "scaler@example.invalid");
  const bound = (await db.doc(`stripeConnectedAccounts/${uid}`).get()).data();
  assert.equal(bound.scalerId, uid); assert.equal(bound.mode, "test");
  assert.equal(bound.stripeAccountId, "acct_fixture");
  const creates = mock.calls.filter((call) => call.type === "account");
  assert.equal(creates.length, 1);
  assert.equal(creates[0].data.settings.payouts.schedule.interval, "manual");
  assert.match(creates[0].options.idempotencyKey, /^cashout-test-account:/);
  assert.equal(bound.external_accounts, undefined);
});
