"use strict";

const crypto = require("node:crypto");

const TERMS_VERSION = "scaler-affiliate-v1-2026-08-20";
const ATTRIBUTION_WINDOW_DAYS = 30;
const DEFAULT_RATE_BPS = 1000;
const MIN_RATE_BPS = 1000;
const MAX_RATE_BPS = 3000;
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
  return cleanText(user?.role, 24).toLowerCase() === "scaler" &&
    (user?.active === true || user?.betaAccess === "approved");
}

function attributionIsFresh(capturedAtMillis, nowMillis = Date.now()) {
  const captured = Number(capturedAtMillis);
  if (!Number.isFinite(captured) || captured > nowMillis + 5 * 60 * 1000) return false;
  return captured >= nowMillis - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function createAffiliateService({db, FieldValue, Timestamp, randomBytes = crypto.randomBytes}) {
  async function join({uid, user, acceptedTermsVersion}) {
    if (!isApprovedScaler(user)) throw new Error("approved_scaler_required");
    if (acceptedTermsVersion !== TERMS_VERSION) throw new Error("affiliate_terms_required");

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
            termsVersion: TERMS_VERSION,
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

  async function dashboard(uid) {
    const profile = await db.collection("scalerAffiliateProfiles").doc(uid).get();
    if (!profile.exists) return {joined: false, termsVersion: TERMS_VERSION};
    const referrals = await db.collection("affiliateBusinessReferrals")
      .where("affiliateUid", "==", uid).limit(100).get();
    const items = referrals.docs.map((doc, index) => {
      const value = doc.data() || {};
      return {
        displayId: `Referral ${index + 1}`,
        status: cleanText(value.status, 32) || "attributed",
        subscriptionStatus: cleanText(value.subscriptionStatus, 32) || "awaiting_subscription",
        attributedAtMillis: value.attributedAt?.toMillis?.() || null,
      };
    });
    const value = profile.data() || {};
    return {
      joined: true,
      status: value.status,
      referralCode: value.referralCode,
      commissionRateBps: value.commissionRateBps,
      termsVersion: value.termsVersion,
      referrals: items,
      commissionAccountingAvailable: false,
      commissionSummary: {pendingCents: 0, earnedCents: 0, paidCents: 0, currency: "usd"},
    };
  }

  async function attributeBusiness({businessUid, businessUser, code, capturedAtMillis}) {
    if (cleanText(businessUser?.role, 24).toLowerCase() !== "business") {
      throw new Error("business_required");
    }
    const canonicalCode = normalizeReferralCode(code);
    if (!canonicalCode || !attributionIsFresh(capturedAtMillis)) {
      throw new Error("referral_invalid_or_expired");
    }
    const codeRef = db.collection("scalerAffiliateCodes").doc(canonicalCode);
    const attributionRef = db.collection("businessReferralAttributions").doc(businessUid);
    const referralRef = db.collection("affiliateBusinessReferrals").doc(businessUid);
    await db.runTransaction(async (transaction) => {
      const [codeSnapshot, existingAttribution] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(attributionRef),
      ]);
      if (existingAttribution.exists) return;
      if (!codeSnapshot.exists || codeSnapshot.data()?.status !== "active") {
        throw new Error("referral_code_not_found");
      }
      const affiliateUid = cleanText(codeSnapshot.data()?.affiliateUid, 160);
      if (!affiliateUid || affiliateUid === businessUid) throw new Error("self_referral_denied");
      const affiliate = await transaction.get(db.collection("scalerAffiliateProfiles").doc(affiliateUid));
      if (!affiliate.exists || affiliate.data()?.status !== "active") {
        throw new Error("affiliate_not_active");
      }
      const timestamp = FieldValue.serverTimestamp();
      transaction.create(attributionRef, {
        businessUid,
        affiliateUid,
        referralCode: canonicalCode,
        attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
        capturedAt: Timestamp.fromMillis(Number(capturedAtMillis)),
        attributedAt: timestamp,
        authorityVersion: "affiliate-attribution-v1",
      });
      transaction.create(referralRef, {
        businessUid,
        affiliateUid,
        status: "attributed",
        subscriptionStatus: "awaiting_subscription",
        attributedAt: timestamp,
        updatedAt: timestamp,
      });
    });
    return {attributed: true};
  }

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

  return {join, dashboard, attributeBusiness, setRate, adminOverview};
}

module.exports = {
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
