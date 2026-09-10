"use strict";

const crypto = require("node:crypto");

const TERMS_VERSION = "scaler-affiliate-v1-2026-08-20";
const LAUNCH_TERMS_VERSION = "referral-launch-v2-2026-09-10";
const ATTRIBUTION_WINDOW_DAYS = 30;
const DEFAULT_RATE_BPS = 1000;
const MIN_RATE_BPS = 1000;
// Launch changes are capped at the Founder-approved 10%. Existing records are
// retained for review; no automatic progression or monetary posting is enabled.
const MAX_RATE_BPS = 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanText(value, maxLength = 160) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function normalizeReferralCode(value) {
  const code = cleanText(value, 20).toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6,16}$/.test(code) ? code : "";
}

function generateReferralCode(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(10);
  let code = "";
  for (let index = 0; index < 10; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return code;
}

function assertRateBps(value) {
  const rate = Number(value);
  if (!Number.isInteger(rate) || rate < MIN_RATE_BPS || rate > MAX_RATE_BPS || rate % 100 !== 0) {
    throw new Error("affiliate_rate_invalid");
  }
  return rate;
}

function isApprovedScaler(user) {
  return user?.disabled !== true && !['rejected','revoked','suspended','disabled'].includes(user?.betaAccess) &&
    cleanText(user?.role, 24).toLowerCase() === "scaler" &&
    (user?.active === true || user?.betaAccess === "approved");
}

function attributionIsFresh(capturedAtMillis, nowMillis = Date.now()) {
  const captured = Number(capturedAtMillis);
  if (!Number.isFinite(captured) || captured > nowMillis + 5 * 60 * 1000) return false;
  return captured >= nowMillis - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function createAffiliateService({db, FieldValue, Timestamp, randomBytes = crypto.randomBytes}) {
  async function join({uid, user, acceptedTermsVersion, businessOwnerVerified = false}) {
    if (!isApprovedScaler(user) && !(businessOwnerVerified === true && user?.role === 'business' &&
        user.disabled !== true && (user.active === true || user.betaAccess === 'approved'))) throw new Error("approved_scaler_required");
    if (![TERMS_VERSION, LAUNCH_TERMS_VERSION].includes(acceptedTermsVersion)) throw new Error("affiliate_terms_required");

    const profileRef = db.collection("scalerAffiliateProfiles").doc(uid);
    const existing = await profileRef.get();
    if (existing.exists) return existing.data();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateReferralCode(randomBytes);
      const codeRef = db.collection("scalerAffiliateCodes").doc(code);
      try {
        await db.runTransaction(async (transaction) => {
          const [currentProfile, currentCode] = await Promise.all([
            transaction.get(profileRef),
            transaction.get(codeRef),
          ]);
          if (currentProfile.exists) return;
          if (currentCode.exists) throw new Error("affiliate_code_collision");
          const timestamp = FieldValue.serverTimestamp();
          transaction.create(codeRef, {
            affiliateUid: uid,
            status: "active",
            createdAt: timestamp,
          });
          transaction.create(profileRef, {
            affiliateUid: uid,
            status: "active",
            referralCode: code,
            commissionRateBps: DEFAULT_RATE_BPS,
            termsVersion: acceptedTermsVersion,
            referrerRole: user.role,
            termsAcceptedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
        return (await profileRef.get()).data();
      } catch (error) {
        if (error?.message !== "affiliate_code_collision") throw error;
      }
    }
    throw new Error("affiliate_code_generation_failed");
  }

  async function dashboard(uid, {financialLifecycle = false} = {}) {
    const profile = await db.collection("scalerAffiliateProfiles").doc(uid).get();
    if (!profile.exists) return {joined: false, termsVersion: TERMS_VERSION};
    const referrals = await db.collection("affiliateBusinessReferrals")
      .where("affiliateUid", "==", uid).limit(100).get();
    const scalerReferrals = await db.collection("affiliateScalerReferrals")
      .where("affiliateUid", "==", uid).limit(100).get();
    const rewards = await db.collection('referralRewards').where('affiliateUid','==',uid).limit(1001).get();
    if (rewards.docs.length > 1000) throw new Error('referral_history_requires_review');
    const liabilityRows=financialLifecycle?await db.collection('referralLiabilities').where('beneficiaryUid','==',uid).limit(401).get():null;
    if(liabilityRows?.size>400)throw new Error('referral_history_requires_review');
    const items = [...referrals.docs.map(doc => ({doc, role:"business"})),
      ...scalerReferrals.docs.map(doc => ({doc, role:"scaler"}))].map(({doc,role}, index) => {
      const value = doc.data() || {};
      const qualifying = rewards.docs.map(r=>r.data()).filter(r=>role==='scaler' &&
        r.referredScalerUid===doc.id && r.status==='EARNED');
      const economic=liabilityRows?.docs.map(d=>d.data()).filter(e=>e.referredId===doc.id &&
        e.type===(role==='scaler'?'SCALER_COMPLETED_WORK_REFERRAL':'BUSINESS_SUBSCRIPTION_REFERRAL')) || [];
      const totals=economic.reduce((s,e)=>({earned:s.earned+e.currentCents,paid:s.paid+e.paidCents,
        available:s.available+(e.released?e.currentCents-e.paidCents-e.reservedCents:Math.min(0,e.currentCents-e.paidCents-e.reservedCents))}),{earned:0,paid:0,available:0});
      return {
        displayId: `Referral ${index + 1}`,
        referredRole: role,
        status: financialLifecycle?(economic.length?(totals.paid>0&&totals.paid>=totals.earned?'PAID':totals.available>0?'AVAILABLE':'EARNING'):'SIGNED_UP'):qualifying.length ? "EARNING" : "SIGNED_UP",
        qualifyingJobCount: financialLifecycle?economic.filter(e=>role==='scaler'&&e.currentCents>0).length:qualifying.length,
        earnedCents: financialLifecycle?totals.earned:qualifying.reduce((sum,r)=>sum+r.amountCents,0),
        availableCents: financialLifecycle?totals.available:0,
        paidCents: financialLifecycle?totals.paid:0,
        subscriptionStatus: role === "business" ? cleanText(value.subscriptionStatus, 32) || "awaiting_subscription" : "not_applicable",
        attributedAtMillis: value.attributedAt?.toMillis?.() || null,
      };
    });
    const value = profile.data() || {};
    return {
      joined: true,
      status: value.status,
      referralCode: value.referralCode,
      commissionRateBps: value.commissionRateBps,
      launchBusinessRateBps: DEFAULT_RATE_BPS,
      rateReviewRequired: value.commissionRateBps !== DEFAULT_RATE_BPS,
      scalerRewardRule: {version:'ScalerReferralOnePercentV1',rateBps:100,basis:'final_approved_scaler_compensation',fundingSource:'platform_economics',singleLevel:true},
      requiresPolicyAcceptance: value.acceptedLaunchPolicyVersion !== LAUNCH_TERMS_VERSION,
      scalerRewardAccountingAvailable: true,
      referralPayoutAvailable: financialLifecycle,
      termsVersion: value.termsVersion,
      referrals: items,
      commissionAccountingAvailable: financialLifecycle,
      commissionSummary: financialLifecycle ? {
        ...require('./referral_liability').summary(liabilityRows.docs.map(d=>d.data())),
        earnedCents: liabilityRows.docs.reduce((sum,d)=>sum+d.data().currentCents,0),currency:'usd',
      } : {pendingCents: 0, earnedCents: 0, paidCents: 0, currency: "usd"},
    };
  }

  async function attribute({uid, user, role, code, capturedAtMillis}) {
    if (cleanText(user?.role, 24).toLowerCase() !== role) {
      throw new Error(role === "business" ? "business_required" : "scaler_required");
    }
    if(role==='business' && (user.signupPurpose==='team_invitation' ||
      (user.activeBusinessId && user.activeBusinessId!==uid))) throw new Error('business_workspace_owner_required');
    const canonicalCode = normalizeReferralCode(code);
    if (!canonicalCode || !attributionIsFresh(capturedAtMillis)) {
      throw new Error("referral_invalid_or_expired");
    }
    const codeRef = db.collection("scalerAffiliateCodes").doc(canonicalCode);
    const attributionRef = db.collection(role === "business" ? "businessReferralAttributions" : "scalerReferralAttributions").doc(uid);
    const referralRef = db.collection(role === "business" ? "affiliateBusinessReferrals" : "affiliateScalerReferrals").doc(uid);
    await db.runTransaction(async (transaction) => {
      const [codeSnapshot, existingAttribution] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(attributionRef),
      ]);
      if(role==='business'){
        const workspace=await transaction.get(db.collection('businessWorkspaces').doc(uid));
        if(workspace.exists && workspace.data()?.ownerId && workspace.data().ownerId!==uid)
          throw new Error('business_workspace_owner_required');
      }
      if (existingAttribution.exists) return;
      if (!codeSnapshot.exists || codeSnapshot.data()?.status !== "active") {
        throw new Error("referral_code_not_found");
      }
      const affiliateUid = cleanText(codeSnapshot.data()?.affiliateUid, 160);
      if (!affiliateUid || affiliateUid === uid) throw new Error("self_referral_denied");
      const affiliate = await transaction.get(db.collection("scalerAffiliateProfiles").doc(affiliateUid));
      if (!affiliate.exists || affiliate.data()?.status !== "active") {
        throw new Error("affiliate_not_active");
      }
      const timestamp = FieldValue.serverTimestamp();
      transaction.create(attributionRef, {
        ...(role === "business" ? {businessUid:uid} : {scalerUid:uid}),
        affiliateUid,
        referralCode: canonicalCode,
        attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
        capturedAt: Timestamp.fromMillis(Number(capturedAtMillis)),
        attributedAt: timestamp,
        authorityVersion: "affiliate-attribution-v1",
        ...(role === 'scaler' ? {policyVersion:'ScalerReferralOnePercentV1'} : {}),
      });
      transaction.create(referralRef, {
        ...(role === "business" ? {businessUid:uid} : {scalerUid:uid}),
        affiliateUid,
        status: "attributed",
        ...(role === "business" ? {subscriptionStatus:"awaiting_subscription"} : {rewardStatus:"awaiting_qualifying_work"}),
        attributedAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.create(db.collection("notifications").doc(`referral_signup_${role}_${uid}`), {
        userId: affiliateUid, type: "referral_signed_up", title: "New referral",
        message: `A new ${role === "business" ? "Business" : "Scaler"} joined ScaledCircle using your referral link. Signup does not create a monetary reward.`,
        referralState: "SIGNED_UP", deepLink:{destination:'referrals'}, read: false, createdAt: timestamp,
      });
    });
    return {attributed: true};
  }

  const attributeBusiness = ({businessUid,businessUser,...input}) =>
    attribute({uid:businessUid,user:businessUser,role:"business",...input});
  const attributeScaler = ({scalerUid,scalerUser,...input}) =>
    attribute({uid:scalerUid,user:scalerUser,role:"scaler",...input});

  async function setRate({adminUid, affiliateUid, rateBps, reason}) {
    const rate = assertRateBps(rateBps);
    const safeReason = cleanText(reason, 300);
    if (!safeReason) throw new Error("affiliate_rate_reason_required");
    const profileRef = db.collection("scalerAffiliateProfiles").doc(affiliateUid);
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(profileRef);
      if (!current.exists) throw new Error("affiliate_not_found");
      const oldRateBps = Number(current.data()?.commissionRateBps || DEFAULT_RATE_BPS);
      transaction.update(profileRef, {commissionRateBps: rate, updatedAt: FieldValue.serverTimestamp()});
      transaction.create(db.collection("affiliateAdminAuditEvents").doc(), {
        eventType: "affiliate_rate_changed",
        affiliateUid,
        oldRateBps,
        newRateBps: rate,
        adminUid,
        reason: safeReason,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return {affiliateUid, commissionRateBps: rate};
  }

  async function adminOverview() {
    const profiles = await db.collection("scalerAffiliateProfiles").limit(200).get();
    const referrals = await db.collection("affiliateBusinessReferrals").limit(500).get();
    const counts = new Map();
    for (const snapshot of referrals.docs) {
      const uid = cleanText(snapshot.data()?.affiliateUid, 160);
      counts.set(uid, (counts.get(uid) || 0) + 1);
    }
    return profiles.docs.map((snapshot) => {
      const value = snapshot.data() || {};
      return {
        affiliateUid: snapshot.id,
        status: cleanText(value.status, 24),
        commissionRateBps: Number(value.commissionRateBps || DEFAULT_RATE_BPS),
        referralCount: counts.get(snapshot.id) || 0,
        commissionAccountingAvailable: false,
      };
    });
  }

  return {join, dashboard, attributeBusiness, attributeScaler, setRate, adminOverview};
}

module.exports = {
  LAUNCH_TERMS_VERSION,
  TERMS_VERSION,
  ATTRIBUTION_WINDOW_DAYS,
  DEFAULT_RATE_BPS,
  MIN_RATE_BPS,
  MAX_RATE_BPS,
  normalizeReferralCode,
  generateReferralCode,
  assertRateBps,
  isApprovedScaler,
  attributionIsFresh,
  createAffiliateService,
};
