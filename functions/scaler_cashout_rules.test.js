"use strict";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) {
  throw new Error("cashout_rules_tests_require_local_emulator");
}
const {test, before, after} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc} = require("firebase/firestore");
let env;
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({projectId: "demo-scaledcircle", firestore: {host, port: Number(port),
    rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")}});
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/cashout-rules-scaler"), {role: "scaler", approved: true, status: "approved"});
  });
});
after(async () => env?.cleanup());
test("Scaler client cannot fund or mutate balances, operation receipts, accounts or replay claims", async () => {
  const db = env.authenticatedContext("cashout-rules-scaler", {email_verified: true}).firestore();
  for (const target of ["wallets/cashout-rules-scaler", "scalerCashoutBalances/cashout-rules-scaler",
    "scalerCashoutTestFunding/fixture", "financialOperations/cashout_fixture",
    "financialOperations/cashout_fixture/audit/1", "stripeConnectedAccounts/cashout-rules-scaler",
    "scalerCashoutEvents/evt_fixture"]) {
    await assertFails(setDoc(doc(db, target), {ownerId: "cashout-rules-scaler", mode: "test", availableCents: 10000}));
  }
  await assertFails(getDoc(doc(db, "scalerCashoutBalances/cashout-rules-scaler")));
});
