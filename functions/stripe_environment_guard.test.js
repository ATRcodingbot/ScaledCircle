"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

for (const directory of ["functions"]) {
  test(`${directory}: payout account ownership and mode must match before reuse`, () => {
    const source = fs.readFileSync(path.join(__dirname, "..", directory, "index.js"), "utf8");
    const start = source.indexOf("function assertScalerAccountBinding(");
    const end = source.indexOf("async function retrieveScalerAccount", start);
    for (const environment of ["local", "staging", "production"]) {
      const context = {scaledCircleEnvironment: () => environment, HttpsError: class extends Error {}};
      vm.createContext(context);
      vm.runInContext(source.slice(start, end), context);
      const good = {scalerId: "owner", mode: environment === "production" ? "live" : "test",
        stripeAccountId: "acct_fixture"};
      context.assertScalerAccountBinding(good, "owner");
      for (const record of [null, {...good, scalerId: "other"}, {...good, mode: undefined},
        {...good, mode: good.mode === "test" ? "live" : "test"}, {...good, stripeAccountId: ""}]) {
        assert.throws(() => context.assertScalerAccountBinding(record, "owner"));
      }
    }
  });
  test(`${directory}: onboarding return origin remains in the selected environment`, () => {
    const source = fs.readFileSync(path.join(__dirname, "..", directory, "index.js"), "utf8");
    const start = source.indexOf("function publicAppBaseUrl() {");
    const end = source.indexOf("\nfunction stripePriceForPlan", start);
    for (const [environment, expected] of Object.entries({local: "http://127.0.0.1:5000",
      staging: "https://scaledcircle-staging.web.app", production: "https://scaledcircle.com"})) {
      const context = {scaledCircleEnvironment: () => environment, process: {env: {}}};
      vm.createContext(context);
      vm.runInContext(source.slice(start, end), context);
      assert.equal(context.publicAppBaseUrl(), expected);
    }
  });
  test(`${directory}: Stripe credential mode fails closed before SDK construction`, () => {
    const source = fs.readFileSync(path.join(__dirname, "..", directory, "index.js"), "utf8");
    const start = source.indexOf("function stripeClient() {");
    const end = source.indexOf("\nfunction scaledCircleEnvironment()", start);
    assert.ok(start >= 0 && end > start);
    for (const environment of ["local", "staging", "production", "typo"]) {
      for (const key of ["", "garbage", "pk_test_fake", "sk_test_fake", "sk_live_fake"]) {
        let constructions = 0;
        const context = {STRIPE_SECRET_KEY: {value: () => key},
          process: {env: {SCALEDCIRCLE_ENV: environment}},
          HttpsError: class extends Error {},
          Stripe: class {constructor() { constructions += 1; }}};
        vm.createContext(context);
        vm.runInContext(source.slice(start, end), context);
        const valid = environment === "production" ? key === "sk_live_fake" :
          ["local", "staging"].includes(environment) && key === "sk_test_fake";
        if (valid) context.stripeClient();
        else assert.throws(() => context.stripeClient());
        assert.equal(constructions, valid ? 1 : 0);
      }
    }
  });
}
