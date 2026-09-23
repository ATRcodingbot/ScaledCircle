"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const beta = require("./internal_beta_entitlements");
const entitlements = require("./subscription_entitlements");

const NOW = Date.parse("2026-08-14T12:00:00Z");
const EXPIRY = Date.parse("2026-11-12T12:00:00Z");
const SERVER_TIMESTAMP = Object.freeze({serverTimestamp: true});
const Timestamp = {fromMillis: (value) => ({toMillis: () => value})};
const FieldValue = {serverTimestamp: () => SERVER_TIMESTAMP};

function fakeEnvironment({profileRole = "business", authEmail = "owner@example.test",
  emailVerified = true, disabled = false, now = () => NOW,
  existingSubscription = null} = {}) {
  const documents = new Map();
  documents.set("users/business-one", {role: profileRole});
  if (existingSubscription) documents.set("businessSubscriptions/business-one", existingSubscription);
  const writes = [];
  const snapshot = (path) => ({exists: documents.has(path), data: () => documents.get(path)});
  const reference = (collection, id) => ({path: `${collection}/${id}`});
  const db = {
    collection(name) { return {doc: (id) => reference(name, id)}; },
    async runTransaction(callback) {
      const transaction = {
        get: async (ref) => snapshot(ref.path),
        set(ref, value, options) {
          const next = options?.merge ? {...(documents.get(ref.path) || {}), ...value} : value;
          documents.set(ref.path, next); writes.push({operation: "set", path: ref.path, value});
        },
        update(ref, value) {
          documents.set(ref.path, {...(documents.get(ref.path) || {}), ...value});
          writes.push({operation: "update", path: ref.path, value});
        },
        create(ref, value) {
          if (documents.has(ref.path)) throw new Error("already_exists");
          documents.set(ref.path, value); writes.push({operation: "create", path: ref.path, value});
        },
      };
      return callback(transaction);
    },
  };
  // Profile reads happen outside the transaction.
  db.collection = (name) => ({doc: (id) => ({...reference(name, id), get: async () => snapshot(`${name}/${id}`)})});
  const authUser = {uid: "business-one", email: authEmail, emailVerified, disabled};
  const auth = {
    async getUser(uid) { if (uid !== authUser.uid) throw new Error("missing"); return authUser; },
    async getUserByEmail(email) { if (email !== authEmail) throw new Error("missing"); return authUser; },
  };
  const service = beta.createInternalBetaEntitlementService({db, auth, FieldValue, Timestamp,
    now});
  return {service, documents, writes};
}

const grantInput = (target = {businessUid: "business-one"}) => ({...target,
  plan: "managed_growth", reason: "Managed Growth founding beta",
  expiresAt: new Date(EXPIRY).toISOString()});

const reviewInput = () => ({businessUid: "business-one", plan: "starter", source: "internal_qa",
  purpose: "store_review", durationDays: 30, reason: "Founder-approved isolated store review"});

const durableReview = (expectedExpiresAtMillis) => ({businessUid:'business-one',plan:'scale',source:'internal_qa',
  purpose:'store_review',accessTerm:'until_revoked',expectedExpiresAtMillis,reason:'Founder-approved durable Core review'});

test('durable Core conversion preserves original audit, is revocable and never starts billing or providers', async()=>{
  let current=NOW;
  const env=fakeEnvironment({now:()=>current});
  const finite=await env.service.grant(reviewInput(),{uid:'admin-one'});
  const oldAudit=env.writes.find(w=>w.path.startsWith('entitlementAuditEvents/'));
  await env.service.grant(durableReview(finite.expiresAtMillis),{uid:'admin-one'});
  const record=env.documents.get('businessSubscriptions/business-one');
  assert.equal(record.plan,'scale');assert.equal(record.expiresAt,null);
  assert.equal(record.accessTerm,'until_revoked');assert.equal(record.paidProviderUsageAllowed,false);
  assert.equal(record.automaticRenewal,false);
  assert.equal(env.documents.get(oldAudit.path),oldAudit.value);
  current=Date.parse('2050-01-01T00:00:00Z');
  assert.equal(entitlements.hasActiveScaleEntitlement(record,{nowMillis:current}),true);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record,{nowMillis:current}),false);
  for(const product of ['business_assistant','lead_generation_research']) assert.equal(entitlements.hasActiveProductEntitlement(record,product,{nowMillis:current}),false);
  assert.equal(require('./business_workspace').seats(record,current),5);
  const count=env.writes.length;
  assert.equal((await env.service.grant(durableReview(finite.expiresAtMillis),{uid:'admin-two'})).idempotentReplay,true);
  assert.equal(env.writes.length,count);
  const wallet=env.documents.get('wallets/business-one');assert.equal(wallet.subscriptionExpiresAt,null);
  assert.equal(wallet.subscriptionAccessTerm,'until_revoked');assert.equal(wallet.subscriptionPaidProviderUsageAllowed,false);
  for(const field of ['stripeSubscriptionId','stripeCustomerId','balance','availableCredits','earnings','addons','productEntitlements']){
    assert.equal(Object.hasOwn(record,field),false);assert.equal(Object.hasOwn(wallet,field),false);
  }
  await env.service.revoke({businessUid:'business-one',reason:'Administrative review access revocation'},{uid:'admin-one'});
  assert.equal(entitlements.hasActiveScaleEntitlement(env.documents.get('businessSubscriptions/business-one'),{nowMillis:current}),false);
  const revokedCount=env.writes.length;
  assert.equal((await env.service.grant(durableReview(finite.expiresAtMillis),{uid:'admin-two'})).granted,false);
  assert.equal(env.writes.length,revokedCount);
});

test('durable conversion is Core-only, conditional on exact prior term and preserves unrelated entitlements',async()=>{
  for(const patch of [{plan:'managed_growth'},{plan:'growth_department'},{durationDays:30},{expiresAt:new Date(EXPIRY).toISOString()},{source:'stripe'}])
    assert.throws(()=>beta.validateGrantInput({...durableReview(),...patch},NOW));
  const env=fakeEnvironment();const first=await env.service.grant(reviewInput(),{uid:'admin-one'});
  await assert.rejects(env.service.grant(durableReview(first.expiresAtMillis+1),{uid:'admin-one'}),/existing_entitlement_preserved/);
  assert.equal(env.writes.length,3);
  await env.service.revoke({businessUid:'business-one',reason:'Owner revoked'},{uid:'admin-one'});
  await assert.rejects(env.service.grant(durableReview(first.expiresAtMillis),{uid:'admin-one'}),/existing_entitlement_preserved/);
  for(const prior of [{plan:'managed_growth',source:'internal_qa',status:'active'},
    {plan:'scale',source:'stripe',status:'active',stripeSubscriptionId:'sub_existing'}]){
    const f=fakeEnvironment({existingSubscription:prior});
    if(prior.source==='stripe')assert.equal((await f.service.grant(durableReview(),{uid:'admin-one'})).preservedPaidEntitlement,true);
    else await assert.rejects(f.service.grant(durableReview(),{uid:'admin-one'}),/existing_entitlement_preserved/);
    assert.equal(f.writes.length,0);
  }
});

test("review grant uses the existing Core resolver, finite term and audit without premium or money", async () => {
  const env = fakeEnvironment();
  await env.service.grant(reviewInput(), {uid: "admin-one"});
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.equal(record.plan, "starter");
  assert.equal(record.source, "internal_qa");
  assert.equal(record.startsAt.toMillis(), NOW);
  assert.equal(record.expiresAt.toMillis(), NOW + 30 * 86400000);
  assert.equal(record.automaticRenewal, false);
  assert.equal(entitlements.hasActivePaidBusinessEntitlement(record, {nowMillis: NOW}), true);
  assert.equal(entitlements.hasActiveScaleEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveProductEntitlement(record, "business_assistant", {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveProductEntitlement(record, "lead_generation_research", {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActivePaidBusinessEntitlement(record, {nowMillis: NOW + 30 * 86400000}), false);
  const wallet = env.documents.get("wallets/business-one");
  assert.equal(wallet.subscriptionPrice, 99);
  for (const field of ["balance", "availableBalance", "earnings", "stripeCustomerId", "stripeSubscriptionId",
    "paymentIntentId", "addons", "productEntitlements"]) {
    assert.equal(Object.hasOwn(record, field), false);
    assert.equal(Object.hasOwn(wallet, field), false);
  }
  assert.equal(env.writes.length, 3);
  assert.equal(env.writes.filter(w => w.path.startsWith("entitlementAuditEvents/"))[0].value.additionalSpendingUsd, 0);
});

test("review retries preserve one term after delay, expiry and revocation", async () => {
  let current = NOW;
  const env = fakeEnvironment({now: () => current});
  await env.service.grant(reviewInput(), {uid: "admin-one"});
  const original = env.documents.get("businessSubscriptions/business-one");
  current += 86400000;
  const retry = await env.service.grant({...reviewInput(), reason: "Retry after browser restart"}, {uid: "admin-two"});
  assert.equal(retry.idempotentReplay, true);
  assert.equal(retry.expiresAtMillis, NOW + 30 * 86400000);
  assert.equal(env.writes.length, 3);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), original);
  await env.service.revoke({businessUid: "business-one", reason: "Review completed"}, {uid: "admin-one"});
  const count = env.writes.length;
  assert.equal((await env.service.grant(reviewInput(), {uid: "admin-one"})).granted, false);
  current = NOW + 31 * 86400000;
  assert.equal((await env.service.grant(reviewInput(), {uid: "admin-one"})).granted, false);
  assert.equal(env.writes.length, count);
});

test("review purpose cannot expand plans, terms, source or replace existing entitlements", async () => {
  for (const patch of [{plan: "managed_growth"}, {plan: "scale"}, {source: "internal_beta"},
    {durationDays: 31}, {durationDays: 0}, {expiresAt: new Date(EXPIRY).toISOString()},
    {purpose: "other"}]) {
    assert.throws(() => beta.validateGrantInput({...reviewInput(), ...patch}, NOW));
  }
  assert.throws(() => beta.validateGrantInput({...grantInput(), plan: "starter"}, NOW));
  const prior = {plan: "managed_growth", status: "active", source: "internal_qa"};
  const env = fakeEnvironment({existingSubscription: prior});
  await assert.rejects(env.service.grant(reviewInput(), {uid: "admin-one"}), /existing_entitlement_preserved/);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), prior);
  assert.equal(env.writes.length, 0);
  for (const options of [{disabled: true}, {emailVerified: false}, {profileRole: "scaler"}]) {
    const denied = fakeEnvironment(options);
    await assert.rejects(denied.service.grant(reviewInput(), {uid: "admin-one"}));
    assert.equal(denied.writes.length, 0);
  }
});

test("only a verified trusted admin actor is accepted", () => {
  assert.throws(() => beta.assertTrustedAdminActor(null), /trusted_beta_admin_required/);
  for (const actor of [
    {uid: "business", role: "business", emailVerified: true, isAdmin: false},
    {uid: "scaler", role: "scaler", emailVerified: true, isAdmin: false},
    {uid: "admin", role: "admin", emailVerified: false, isAdmin: true},
    {uid: "other", role: "support", emailVerified: true, isAdmin: false},
  ]) assert.throws(() => beta.assertTrustedAdminActor(actor), /trusted_beta_admin_required/);
  assert.equal(beta.assertTrustedAdminActor({uid: "admin", role: "admin",
    emailVerified: true, isAdmin: true}).uid, "admin");
});

test("grant validation requires one target, reason, supported plan, and finite bounded expiry", () => {
  assert.throws(() => beta.validateGrantInput({}, NOW), /exactly_one_beta_target_required/);
  assert.throws(() => beta.validateGrantInput(grantInput({businessUid: "business-one",
    businessEmail: "owner@example.test"}), NOW), /exactly_one_beta_target_required/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), reason: ""}, NOW),
    /internal_beta_reason_required/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), plan: "scale"}, NOW),
    /unsupported_internal_beta_plan/);
  assert.throws(() => beta.validateGrantInput({...grantInput(), expiresAt: "2099-01-01"}, NOW),
    /finite_internal_beta_expiry_required/);
});

test("trusted service grants by UID with authoritative comped record, wallet, and audit", async () => {
  const env = fakeEnvironment();
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.granted, true);
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.deepEqual({plan: record.plan, planId: record.planId, status: record.status,
    source: record.source, billingStatus: record.billingStatus, comped: record.comped},
  {plan: "managed_growth", planId: "managed_growth", status: "active",
    source: "internal_beta", billingStatus: "comped", comped: true});
  assert.equal(record.grantedAt, SERVER_TIMESTAMP);
  assert.equal(record.updatedAt, SERVER_TIMESTAMP);
  assert.equal(record.expiresAt.toMillis(), EXPIRY);
  for (const forbidden of ["stripeCustomerId", "stripeSubscriptionId", "checkoutSessionId",
    "paymentIntentId"]) assert.equal(Object.hasOwn(record, forbidden), false);
  const wallet = env.documents.get("wallets/business-one");
  assert.equal(wallet.subscriptionPlan, "managed_growth");
  assert.equal(wallet.subscriptionPrice, 999);
  assert.equal(wallet.subscriptionSource, "internal_beta");
  assert.equal(wallet.subscriptionBillingStatus, "comped");
  const audits = [...env.documents.entries()].filter(([path]) => path.startsWith("entitlementAuditEvents/"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].eventType, "internal_beta_granted");
  assert.equal(audits[0][1].occurredAt, SERVER_TIMESTAMP);
});

test("internal QA Managed Growth is comped, finite, and has no fabricated payment state", async () => {
  const env = fakeEnvironment();
  await env.service.grant({...grantInput(), source: "internal_qa"}, {uid: "admin-one"});
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.equal(record.source, "internal_qa");
  assert.equal(record.plan, "managed_growth");
  assert.equal(record.billingStatus, "comped");
  assert.equal(record.comped, true);
  assert.equal(record.expiresAt.toMillis(), EXPIRY);
  for (const field of ["stripeCustomerId", "stripeSubscriptionId", "checkoutSessionId",
    "invoiceId", "paymentIntentId"]) assert.equal(Object.hasOwn(record, field), false);
});

test("internal QA uses existing bounded AI authority and does not waive variable costs", () => {
  const intelligence = fs.readFileSync(require.resolve("./scaled_circle_intelligence"), "utf8");
  assert.match(intelligence, /RATE_LIMIT_POLICY_VERSION/);
  assert.match(intelligence, /MAX_REQUESTS_PER_DAY\s*=\s*60/);
  const entitlement = {plan: "managed_growth", status: "active", source: "internal_qa",
    expiresAt: Timestamp.fromMillis(EXPIRY)};
  assert.equal(entitlements.hasActiveScaleEntitlement(entitlement, {nowMillis: NOW}), true);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(entitlement, {nowMillis: NOW}), true);
  for (const field of ["campaignFunding", "workerPay", "adSpend", "printing", "postage",
    "directMailFulfillment"]) assert.equal(Object.hasOwn(entitlement, field), false);
});

test("target by normalized email works and invalid/non-Business targets fail", async () => {
  const env = fakeEnvironment();
  const result = await env.service.grant(grantInput({businessEmail: "OWNER@example.test"}),
    {uid: "admin-one"});
  assert.equal(result.businessUid, "business-one");
  await assert.rejects(env.service.grant(grantInput({businessEmail: "missing@example.test"}),
    {uid: "admin-one"}), /internal_beta_business_not_found/);
  const scaler = fakeEnvironment({profileRole: "scaler"});
  await assert.rejects(scaler.service.grant(grantInput(), {uid: "admin-one"}),
    /internal_beta_target_not_business/);
});

test("unverified target Business is rejected", async () => {
  const env = fakeEnvironment({emailVerified: false});
  await assert.rejects(env.service.grant(grantInput(), {uid: "admin-one"}),
    /internal_beta_target_email_unverified/);
});

test("active Stripe entitlement is preserved without beta or audit writes", async () => {
  const paid = {plan: "scale", planId: "scale", status: "active", source: "stripe",
    expiresAt: Timestamp.fromMillis(EXPIRY), stripeSubscriptionId: "sub_existing"};
  const env = fakeEnvironment({existingSubscription: paid});
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.preservedPaidEntitlement, true);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), paid);
  assert.equal(env.writes.length, 0);
});

test("inactive Stripe billing history is preserved for a future overlay design", async () => {
  const paid = {plan: "scale", status: "cancelled", source: "stripe",
    expiresAt: Timestamp.fromMillis(NOW - 1), stripeSubscriptionId: "sub_historical"};
  const env = fakeEnvironment({existingSubscription: paid});
  const result = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(result.preservedPaidEntitlement, true);
  assert.equal(env.documents.get("businessSubscriptions/business-one"), paid);
  assert.equal(env.writes.length, 0);
});

test("grant retries and revocation are idempotent and revocation relocks entitlement", async () => {
  const env = fakeEnvironment();
  await env.service.grant(grantInput(), {uid: "admin-one"});
  const replay = await env.service.grant(grantInput(), {uid: "admin-one"});
  assert.equal(replay.idempotentReplay, true);
  const revoked = await env.service.revoke({businessUid: "business-one", reason: "Beta complete"},
    {uid: "admin-one"});
  assert.equal(revoked.revoked, true);
  const record = env.documents.get("businessSubscriptions/business-one");
  assert.equal(record.status, "revoked");
  assert.equal(record.revokedAt, SERVER_TIMESTAMP);
  assert.equal(entitlements.hasActiveScaleEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record, {nowMillis: NOW}), false);
  const replayRevoke = await env.service.revoke({businessUid: "business-one", reason: "Beta complete"},
    {uid: "admin-one"});
  assert.equal(replayRevoke.idempotentReplay, true);
  const auditTypes = [...env.documents.entries()].filter(([path]) =>
    path.startsWith("entitlementAuditEvents/")).map(([, value]) => value.eventType).sort();
  assert.deepEqual(auditTypes, ["internal_beta_granted", "internal_beta_revoked"]);
});

test("expiry disables both Scale and Managed Growth without cleanup", () => {
  const record = {plan: "managed_growth", status: "active", source: "internal_beta",
    expiresAt: Timestamp.fromMillis(NOW - 1)};
  assert.equal(entitlements.hasActiveScaleEntitlement(record, {nowMillis: NOW}), false);
  assert.equal(entitlements.hasActiveManagedGrowthEntitlement(record, {nowMillis: NOW}), false);
});

test("callables require verified trusted admin and expose no client grant shortcut", () => {
  const source = fs.readFileSync(require.resolve("./index"), "utf8");
  assert.match(source, /function requireTrustedBetaAdmin[\s\S]*?assertTrustedAdminActor\(context\)/);
  for (const name of ["grantInternalBetaEntitlement", "revokeInternalBetaEntitlement"]) {
    const start = source.indexOf(`exports.${name}`);
    assert.notEqual(start, -1);
    assert.match(source.slice(start, start + 700), /requireTrustedBetaAdmin\(request\)/);
  }
  assert.doesNotMatch(source, /request\.data\?.*(grantedBy|source|billingStatus|comped)/i);
});
