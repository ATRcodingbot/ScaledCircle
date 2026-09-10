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

test("affiliate V1 defaults to 10 percent and holds launch rates at 10 percent", () => {
  assert.equal(affiliate.DEFAULT_RATE_BPS, 1000);
  assert.equal(affiliate.assertRateBps(1000), 1000);
  assert.throws(() => affiliate.assertRateBps(3000), /affiliate_rate_invalid/);
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
  assert.match(dashboard, /Referral Program — Coming Soon/);
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
    rateBps: 1000, reason: "Maintain launch policy"});
  assert.equal(env.documents.get("scalerAffiliateProfiles/scaler-one").commissionRateBps, 1000);
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
test('Scaler signup attribution is immutable, private and non-economic with one signup notification',async()=>{
 const e=fakeEnvironment(),p=await e.service.join({uid:'referrer',user:{role:'scaler',active:true},acceptedTermsVersion:affiliate.TERMS_VERSION});
 const input={scalerUid:'new-scaler',scalerUser:{role:'scaler'},code:p.referralCode,capturedAtMillis:Date.now()};
 await e.service.attributeScaler(input);await e.service.attributeScaler(input);
 assert.equal(e.documents.get('scalerReferralAttributions/new-scaler').affiliateUid,'referrer');
 assert.equal([...e.documents.keys()].filter(k=>k.startsWith('notifications/')).length,1);
 const n=e.documents.get('notifications/referral_signup_scaler_new-scaler');assert.equal(n.referralState,'SIGNED_UP');assert.doesNotMatch(n.message,/earned|paid/i);
 const d=await e.service.dashboard('referrer');assert.equal(d.scalerRewardRule.rateBps,100);assert.equal(d.referrals[0].referredRole,'scaler');assert.equal(d.referrals[0].status,'SIGNED_UP');assert.equal(d.commissionAccountingAvailable,false);
 assert.equal('scalerUid' in d.referrals[0],false);assert.equal('email' in d.referrals[0],false);
 assert.deepEqual([...e.documents.keys()].filter(k=>/earning|wallet|payment|commissionLedger/i.test(k)),[]);
 await assert.rejects(()=>e.service.attributeScaler({...input,scalerUid:'referrer'}),/self_referral_denied/);
 await assert.rejects(()=>e.service.attributeScaler({...input,scalerUid:'business',scalerUser:{role:'business'}}),/scaler_required/);
});
test('historical rate above launch cap is retained and flagged, never raised automatically',async()=>{
 const e=fakeEnvironment(),p=await e.service.join({uid:'referrer',user:{role:'scaler',active:true},acceptedTermsVersion:affiliate.TERMS_VERSION});
 e.documents.set('scalerAffiliateProfiles/referrer',{...p,commissionRateBps:1500});
 const d=await e.service.dashboard('referrer');assert.equal(d.commissionRateBps,1500);assert.equal(d.launchBusinessRateBps,1000);assert.equal(d.rateReviewRequired,true);
 await assert.rejects(()=>e.service.setRate({adminUid:'admin',affiliateUid:'referrer',rateBps:1500,reason:'Not authorized'}),/affiliate_rate_invalid/);
 assert.equal(e.documents.get('scalerAffiliateProfiles/referrer').commissionRateBps,1500);
});

test('Business owner enrollment requires independently verified workspace ownership',async()=>{
 const env=fakeEnvironment(),business={role:'business',active:true};
 await assert.rejects(()=>env.service.join({uid:'business-owner',user:business,acceptedTermsVersion:affiliate.LAUNCH_TERMS_VERSION}),/approved_scaler_required/);
 const p=await env.service.join({uid:'business-owner',user:business,businessOwnerVerified:true,acceptedTermsVersion:affiliate.LAUNCH_TERMS_VERSION});
 assert.equal(p.referrerRole,'business');assert.equal(p.commissionRateBps,1000);
 await assert.rejects(()=>env.service.join({uid:'disabled',user:{...business,disabled:true},businessOwnerVerified:true,acceptedTermsVersion:affiliate.LAUNCH_TERMS_VERSION}),/approved_scaler_required/);
});

test('team invitations and cross-workspace identities cannot create duplicate Business referrals',async()=>{
 const env=fakeEnvironment(),profile=await env.service.join({uid:'referrer',user:{role:'scaler',active:true},acceptedTermsVersion:affiliate.LAUNCH_TERMS_VERSION});
 for(const user of [{role:'business',signupPurpose:'team_invitation'},{role:'business',activeBusinessId:'other-workspace'}])
   await assert.rejects(env.service.attributeBusiness({businessUid:'team-user',businessUser:user,code:profile.referralCode,capturedAtMillis:Date.now()}),/workspace_owner/);
 env.documents.set('businessWorkspaces/team-user',{ownerId:'other-owner'});
 await assert.rejects(env.service.attributeBusiness({businessUid:'team-user',businessUser:{role:'business'},code:profile.referralCode,capturedAtMillis:Date.now()}),/workspace_owner/);
 assert.equal([...env.documents.keys()].filter(p=>p.startsWith('businessReferralAttributions/')).length,0);
});
