"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const sales = require("./sales_funnel");

test("trusted Sales authority is the verified active Admin contract", () => {
  assert.equal(sales.assertTrustedSalesActor({uid: "admin", role: "admin",
    emailVerified: true, user: {active: true}}).uid, "admin");
  for (const role of ["business", "scaler", "sales", undefined]) {
    assert.throws(() => sales.assertTrustedSalesActor({uid: "user", role,
      emailVerified: true, user: {active: true}}), /trusted_sales_actor_required/);
  }
  assert.throws(() => sales.assertTrustedSalesActor({uid: "admin", role: "admin",
    emailVerified: false, user: {active: true}}), /trusted_sales_actor_required/);
});

test("lead creation minimizes and validates contact/source fields", () => {
  const value = sales.sanitizeCreate({businessName: " QA Roofing ", source: "FOUNDER",
    priority: "HIGH", contactEmail: "OWNER@EXAMPLE.COM", ignoredSecret: "no"});
  assert.equal(value.businessName, "QA Roofing");
  assert.equal(value.source, "founder");
  assert.equal(value.contactEmail, "owner@example.com");
  assert.equal(value.priority, "high");
  assert.equal(Object.hasOwn(value, "ignoredSecret"), false);
  assert.throws(() => sales.sanitizeCreate({source: "sales"}), /business_name_required/);
});

test("paid and retained states are derived, never accepted as manual stages", () => {
  const lead = {stage: "interested", convertedBusinessUid: "business"};
  assert.equal(sales.derivedStage(lead, null, 0), "interested");
  assert.equal(sales.derivedStage(lead, {onboardingComplete: false}, 0), "signed_up");
  assert.equal(sales.derivedStage(lead, {onboardingComplete: true}, 0), "activated");
  assert.equal(sales.derivedStage(lead, {}, 1), "paid");
  assert.equal(sales.derivedStage(lead, {}, 2), "retained");
  assert.equal(sales.MANUAL_STAGES.has("paid"), false);
  assert.equal(sales.MANUAL_STAGES.has("retained"), false);
});

test("suppression produces explicit mayContact false and due buckets remain separate", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  const suppressed = sales.safeLead("one", {businessName: "One", stage: "qualified",
    suppressionStatus: "opted_out", nextFollowUpAt: now - 1}, null, 0, now);
  assert.equal(suppressed.mayContact, false);
  assert.equal(suppressed.followUpBucket, "overdue");
  const summary = sales.summarize([suppressed]);
  assert.equal(summary.overdueFollowUps, 0);
});

test("Sales callables use trusted server authority and have no provider secrets", () => {
  const index = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  for (const name of ["getSalesPipeline", "mutateSalesLead", "recordSalesActivity"]) {
    const start = index.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    assert.match(index.slice(start, start + 520), /requireTrustedSalesActor\(request\)/);
  }
  const source = fs.readFileSync(path.join(__dirname, "sales_funnel.js"), "utf8");
  assert.doesNotMatch(source, /STRIPE_|SMTP_PASSWORD|OPENAI_API_KEY|CENSUS_API_KEY|nodemailer/);
  assert.doesNotMatch(source, /sendMail|createTransfer|createPayout/);
});
