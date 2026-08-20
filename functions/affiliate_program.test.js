"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const affiliate = require("./affiliate_program");

function fakeEnvironment() {
  const documents = new Map();
  let autoId = 0;
  const snapshot = (path) => ({exists: documents.has(path), id: path.split("/").pop(),
    data: () => documents.get(path)});
  const doc = (path) => ({path, id: path.split("/").pop(), get: async () => snapshot(path)});
  const collection = (name) => ({
    doc: (id) => doc(`${name}/${id || `auto-${++autoId}`}`),
    where: (field, _operator, value) => ({limit: () => ({get: async () => ({docs: [...documents]
      .filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value)
      .map(([key]) => snapshot(key))})})}),
    limit: (count) => ({get: async () => ({docs: [...documents].filter(([key]) =>
      key.startsWith(`${name}/`)).slice(0, count).map(([key]) => snapshot(key))})}),
  });
  const db = {collection, runTransaction: async (handler) => handler({
    get: async (reference) => snapshot(reference.path),
    create: (reference, value) => {
      if (documents.has(reference.path)) throw new Error("already_exists");
      documents.set(reference.path, value);
    },
    update: (reference, value) => documents.set(reference.path, {
      ...(documents.get(reference.path) || {}), ...value,
    }),
  })};
  const clock = {serverTimestamp: () => ({server: true})};
  const Timestamp = {fromMillis: (value) => ({toMillis: () => value})};
  return {documents, service: affiliate.createAffiliateService({db, FieldValue: clock,
    Timestamp, randomBytes: () => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])})};
}

test("affiliate V1 defaults to 10 percent and caps admin rates at 30 percent", () => {
  assert.equal(affiliate.DEFAULT_RATE_BPS, 1000);
  assert.equal(affiliate.assertRateBps(1000), 1000);
  assert.equal(affiliate.assertRateBps(3000), 3000);
  assert.throws(() => affiliate.assertRateBps(3100), /affiliate_rate_invalid/);
  assert.throws(() => affiliate.assertRateBps(1501), /affiliate_rate_invalid/);
});

test("opaque referral codes exclude identity and ambiguous characters", () => {
  const code = affiliate.generateReferralCode(() => Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(affiliate.normalizeReferralCode(` ${code.toLowerCase()} `), code);
  assert.equal(affiliate.normalizeReferralCode("user@example.com"), "");
});

test("approved Scaler eligibility excludes pending and Business accounts", () => {
  assert.equal(affiliate.isApprovedScaler({role: "scaler", betaAccess: "approved"}), true);
  assert.equal(affiliate.isApprovedScaler({role: "scaler", active: true}), true);
  assert.equal(affiliate.isApprovedScaler({role: "scaler", betaAccess: "pending"}), false);
  assert.equal(affiliate.isApprovedScaler({role: "business", active: true}), false);
});

test("attribution window is 30 days and future timestamps fail closed", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");
  assert.equal(affiliate.attributionIsFresh(now - 29 * 86400000, now), true);
  assert.equal(affiliate.attributionIsFresh(now - 31 * 86400000, now), false);
  assert.equal(affiliate.attributionIsFresh(now + 10 * 60000, now), false);
});

test("Phase 1 never fabricates subscription commission or changes Business pricing", () => {
  const source = fs.readFileSync(path.join(__dirname, "affiliate_program.js"), "utf8");
  assert.doesNotMatch(source, /stripe|wallet|campaignPayments|workerAmount|platformFee/i);
  assert.match(source, /commissionAccountingAvailable: false/);
  assert.match(source, /awaiting_subscription/);
  const businessFunnel = fs.readFileSync(path.join(__dirname, "../apps/mobile/lib/screens/public/business_funnel_screen.dart"), "utf8");
  assert.doesNotMatch(businessFunnel, /affiliate|commission|referral discount/i);
});

test("affiliate UI is Scaler-only and attribution is server-mediated", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "../apps/mobile/lib/screens/scaler/dashboard/scaler_dashboard_screen.dart"), "utf8");
  const register = fs.readFileSync(path.join(__dirname, "../apps/mobile/lib/services/auth/auth_service.dart"), "utf8");
  assert.match(dashboard, /Earn with Referrals/);
  assert.match(register, /recordBusinessAttribution/);
  assert.doesNotMatch(register, /businessReferralAttributions.*\.set/s);
});

test("subscription webhook lacks authoritative invoice commission and refund reversal accounting", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(source, /invoice\.paid.*affiliate|affiliate.*invoice\.paid/s);
  assert.doesNotMatch(source, /refund.*affiliateCommission|affiliateCommission.*refund/s);
});

test("join, first-touch attribution, dashboard privacy, and admin rate authority work together", async () => {
  const env = fakeEnvironment();
  const profile = await env.service.join({uid: "scaler-one",
    user: {role: "scaler", active: true}, acceptedTermsVersion: affiliate.TERMS_VERSION});
  assert.equal(profile.commissionRateBps, 1000);
  assert.doesNotMatch(profile.referralCode, /scaler|@/i);

  await env.service.attributeBusiness({businessUid: "business-one", businessUser: {role: "business"},
    code: profile.referralCode, capturedAtMillis: Date.now()});
  const first = env.documents.get("businessReferralAttributions/business-one");
  assert.equal(first.affiliateUid, "scaler-one");

  env.documents.set("scalerAffiliateCodes/ZZZZZZ", {affiliateUid: "scaler-two", status: "active"});
  await env.service.attributeBusiness({businessUid: "business-one", businessUser: {role: "business"},
    code: "ZZZZZZ", capturedAtMillis: Date.now()});
  assert.equal(env.documents.get("businessReferralAttributions/business-one").affiliateUid, "scaler-one");

  const dashboard = await env.service.dashboard("scaler-one");
  assert.equal(dashboard.referrals.length, 1);
  assert.equal(Object.hasOwn(dashboard.referrals[0], "businessUid"), false);
  assert.equal(dashboard.commissionAccountingAvailable, false);

  await env.service.setRate({adminUid: "admin-one", affiliateUid: "scaler-one",
    rateBps: 1500, reason: "Reviewed tier adjustment"});
  assert.equal(env.documents.get("scalerAffiliateProfiles/scaler-one").commissionRateBps, 1500);
  assert.equal([...env.documents.keys()].filter((key) =>
    key.startsWith("affiliateAdminAuditEvents/")).length, 1);
});

test("self-referral and non-Business attribution fail closed", async () => {
  const env = fakeEnvironment();
  const profile = await env.service.join({uid: "same-user",
    user: {role: "scaler", betaAccess: "approved"},
    acceptedTermsVersion: affiliate.TERMS_VERSION});
  await assert.rejects(() => env.service.attributeBusiness({businessUid: "same-user",
    businessUser: {role: "business"}, code: profile.referralCode,
    capturedAtMillis: Date.now()}), /self_referral_denied/);
  await assert.rejects(() => env.service.attributeBusiness({businessUid: "scaler-two",
    businessUser: {role: "scaler"}, code: profile.referralCode,
    capturedAtMillis: Date.now()}), /business_required/);
});
