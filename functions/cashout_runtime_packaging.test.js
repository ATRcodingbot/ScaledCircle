"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const script = path.join(__dirname, "scripts/build_cashout_runtime.js");
const entry = path.join(root, ".firebase/cashout-runtime/index.js");

test("cash-out deployment selects only TEST dependencies and exact four/six exports", () => {
  for (const webhooks of [true, false]) {
    const args = [script, ...(webhooks ? ["--with-webhooks"] : [])];
    execFileSync(process.execPath, args);
    const first = fs.readFileSync(entry, "utf8");
    execFileSync(process.execPath, args);
    assert.equal(fs.readFileSync(entry, "utf8"), first);
    assert.equal([...first.matchAll(/exports\.\w+\s*=/g)].length, webhooks ? 6 : 4);
    const secrets = [...first.matchAll(/defineSecret\("([A-Z_]+)"\)/g)].map(m => m[1]).sort();
    assert.deepEqual(secrets, (webhooks ? ["STRIPE_TEST_SECRET_KEY", "STRIPE_CASHOUT_TEST_WEBHOOK_SECRET",
      "STRIPE_CASHOUT_TEST_CONNECT_WEBHOOK_SECRET"] : ["STRIPE_TEST_SECRET_KEY"]).sort());
    assert.match(first, /context.role !== "scaler"/);
    assert.match(first, /context.user\?\.disabled === true/);
    assert.doesNotMatch(first, /exports\.(stripeWebhook|createScalerConnectedAccount|executeQueuedScalerTransfers)/);
  }
  assert.match(fs.readFileSync(path.join(root, ".firebase/cashout-runtime/.env.scaledcircle-staging"), "utf8"),
    /SCALEDCIRCLE_CASHOUT_TEST_ENABLED=false/);
});

test("deployed callable authority denies admin, disabled, wrong mode and unauthenticated before provider construction", async () => {
  execFileSync(process.execPath, [script]);
  for (const scenario of ["admin", "disabled", "business", "unverified", "unauthenticated", "live", "off"]) {
    let providerConstructed = 0;
    class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
    const exported = {};
    const fakeRequire = (name) => {
      if (name === "firebase-functions/v2") return {setGlobalOptions() {}};
      if (name === "firebase-functions/v2/https") return {onCall: (_, handler) => handler, HttpsError};
      if (name === "firebase-functions/params") return {defineSecret: () => ({value: () => scenario === "live" ? "sk_live_fixture" : "sk_test_fixture"})};
      if (name === "firebase-admin/app") return {initializeApp() {}};
      if (name === "firebase-admin/firestore") return {getFirestore: () => ({collection: () => ({doc: () => ({get: async () => ({data: () => ({
        role: ["admin", "business"].includes(scenario) ? scenario : "scaler", disabled: scenario === "disabled"})})})})})};
      if (name === "stripe") return class {constructor() { providerConstructed++; throw new Error("Unexpected provider construction"); }};
      if (name === "./scaler_cashout") return require("./scaler_cashout");
      if (name === "./scaler_cashout_stripe") return {};
      throw new Error("Unexpected dependency " + name);
    };
    vm.runInNewContext(fs.readFileSync(entry, "utf8"), {exports: exported, require: fakeRequire,
      process: {env: {SCALEDCIRCLE_ENV: "staging", GCLOUD_PROJECT: "scaledcircle-staging",
        SCALEDCIRCLE_CASHOUT_TEST_ENABLED: scenario === "off" ? "false" : "true"}}});
    const request = scenario === "unauthenticated" ? {} : {auth: {uid: "fixture", token: {email_verified: scenario !== "unverified"}}};
    for (const callable of Object.values(exported)) await assert.rejects(callable(request), error =>
      ["permission-denied", "unauthenticated", "failed-precondition"].includes(error.code));
    assert.equal(providerConstructed, 0);
  }
});
