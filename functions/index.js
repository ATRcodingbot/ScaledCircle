const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp, getApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getStorage} = require("firebase-admin/storage");
const {
  getFirestore,
  FieldPath,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const nodemailer = require("nodemailer");
const scalerJobAlertEmail = require("./scaler_job_alert_email");
const Stripe = require("stripe");
const {
  LIMITS: TRACKING_LIMITS,
  assertAllowedKeys,
  canonicalChunkId,
  compatibilityRoutePoints,
  digestRawPoints,
  normalizeChunk,
  normalizePoint,
  serializedBytes,
} = require("./tracking_security");
const marketplace = require("./marketplace_finance");
const campaignFundingQuote = require("./campaign_funding_quote");
const discoveryPreferences = require("./discovery_preferences");
const marketplaceWorkTypes = require("./marketplace_work_types");
const serviceAreaGeometryCodec = require("./service_area_geometry_codec");
const serviceAreaResolution = require("./service_area_resolution");
const smartZoneEntryContract = require("./smart_zone_entry_contract");
const {scalerOpportunityDecision} = require("./opportunity_notification_policy");
const scalerCapacity = require("./scaler_notification_capacity");
const {evaluateFundingCheckout, nextFundingVersion} = require("./marketplace_checkout");
const {
  parseSnapshotEvent,
  parseThinEvent,
  stripeAccountIdFromThinEvent,
} = require("./marketplace_webhook");
const {runFinancialOperation} = require("./marketplace_operations");
const operations = require("./operational_layer");
const smartZonePlanning = require("./smart_zone_planning");
const smartZoneGeography = require("./smart_zone_geography");
const signupNotifications = require("./signup_notifications");
const transactionalEmail = require("./transactional_email");
const propertyIntelligence = require("./property_intelligence");
const scaledCircleIntelligence = require("./scaled_circle_intelligence");
const groupAssignment = require("./group_assignment");
const multiScalerRollout = require("./multi_scaler_rollout");
const subscriptionEntitlements = require("./subscription_entitlements");
const managedGrowth = require("./managed_growth");
const managedGrowthProfile = require("./managed_growth_profile");
const managedGrowthDelivery = require("./managed_growth_delivery");
const socialWorkflow = require("./social_workflow");
const creativeMedia = require("./creative_media");
const generationFoundation = require("./generation_foundation");
const openAIImageAdapter = require("./openai_image_adapter");
const generationBudget = require("./generation_budget");
const internalBetaEntitlements = require("./internal_beta_entitlements");
const adminOperations = require("./admin_operations");
const adminOpsReadModel = require("./admin_ops_read_model");
const scalerProfile = require("./scaler_profile");
const legalConsent = require("./legal_consent");

initializeApp();

function assertProductionScalerCount(value) {
  try {
    return multiScalerRollout.assertAllowedScalerCount(value).count;
  } catch (_) {
    throw new HttpsError(
      "failed-precondition",
      "Multi-Scaler crews are currently limited to the private beta.",
    );
  }
}

const db = getFirestore();
const internalBetaEntitlementService = internalBetaEntitlements
  .createInternalBetaEntitlementService({
    db,
    auth: getAuth(),
    FieldValue,
    Timestamp,
  });
const adminOperationsService = adminOperations.createAdminOperationsService({
  db,
  auth: getAuth(),
  FieldValue,
});
const adminOpsReadService = adminOpsReadModel.createAdminOpsReadService({
  db,
  FieldValue,
});
const scalerProfileService = scalerProfile.createScalerProfileService({
  db,
  FieldValue,
});
const legalConsentService = legalConsent.createLegalConsentService({db, FieldValue});
const creativeMediaService = creativeMedia.createCreativeMediaService({
  db,
  bucket: () => getStorage().bucket(),
  FieldValue,
  FieldPath,
  Timestamp,
});
const generationProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT || "";
const generationIsLocal = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && /^demo-|^local-/.test(generationProjectId);
const generationFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7hG3sAAAAASUVORK5CYII=",
  "base64",
);
async function generationProviderConfig() {
  const snapshot = await db.collection("providerConfigurations").doc("generated-service-visuals").get();
  return snapshot.exists ? snapshot.data() : {providerGenerationEnabled: false};
}
async function generationBusinessBudget(actor) {
  const [config, entitlementSnapshot] = await Promise.all([generationProviderConfig(),
    db.collection("businessSubscriptions").doc(actor.uid).get()]);
  const entitlement = entitlementSnapshot.data() || {};
  const plan = String(entitlement.planId || entitlement.plan || "").trim().toLowerCase();
  return {config, entitlement, plan, eligible: subscriptionEntitlements.hasActivePaidBusinessEntitlement(entitlement),
    monthlyAllowance: Number(config.planMonthlyAllowances?.[plan] || 0)};
}
const generationBudgetAuthority = generationBudget.createBudgetAuthority({
  readState: async ({actor, jobId}) => {
    const business = await generationBusinessBudget(actor); const keys = generationBudget.periodKeys();
    const [reservation, businessMonth, globalDay, globalMonth] = await Promise.all([
      db.collection("visualGenerationReservations").doc(jobId).get(),
      db.collection("visualGenerationUsage").doc(`business_${actor.uid}_${keys.month}`).get(),
      db.collection("visualGenerationUsage").doc(`global_day_${keys.day}`).get(),
      db.collection("visualGenerationUsage").doc(`global_month_${keys.month}`).get(),
    ]);
    return {config: business.config, business: {eligible: business.eligible, monthlyAllowance: business.monthlyAllowance},
      usage: {businessRollingDay: 0, businessMonth: Number(businessMonth.data()?.reservedUnits || 0),
        globalDay: Number(globalDay.data()?.reservedUnits || 0), globalMonth: Number(globalMonth.data()?.reservedUnits || 0),
        globalDayCostMicros: Number(globalDay.data()?.reservedCostMicros || 0),
        globalMonthCostMicros: Number(globalMonth.data()?.reservedCostMicros || 0)},
      existingReservation: reservation.exists ? reservation.data() : null};
  },
  writeReservation: async (value) => {
    const jobId = value.jobId || value.reservation?.jobId; const ref = db.collection("visualGenerationReservations").doc(jobId);
    if (value.status === "reserved") {
      return db.runTransaction(async (tx) => {
        const current = await tx.get(ref); if (current.exists) return {...current.data(), idempotentReplay: true};
        const keys = value.keys || generationBudget.periodKeys();
        const usageRefs = [db.collection("visualGenerationUsage").doc(`business_${value.actor.uid}_${keys.month}`),
          db.collection("visualGenerationUsage").doc(`global_day_${keys.day}`),
          db.collection("visualGenerationUsage").doc(`global_month_${keys.month}`)];
        const reservation = {jobId, businessUid: value.actor.uid, status: "reserved", keys,
          reservedUnits: value.reservationUnits, reservedCostMicros: value.reservationCostMicros,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()};
        tx.create(ref, reservation);
        for (const usageRef of usageRefs) tx.set(usageRef, {reservedUnits: FieldValue.increment(1),
          reservedCostMicros: FieldValue.increment(value.reservationCostMicros), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return reservation;
      });
    }
    await ref.set({status: value.status, usage: value.usage || null, cost: value.cost || null,
      updatedAt: FieldValue.serverTimestamp()}, {merge: true}); return {...value, jobId};
  },
});
const generationAdapter = generationIsLocal ? generationFoundation.deterministicTestAdapter({
  fixture: generationFixture,
  environment: {projectId: generationProjectId, emulator: true, nodeEnv: "test"},
}) : openAIImageAdapter.createOpenAIImageAdapter({
  configProvider: generationProviderConfig,
  clientFactory: async (config) => {
    if (config.providerGenerationEnabled !== true) throw new Error("generation_disabled");
    const OpenAI = require("openai").default;
    if (config.authenticationMode !== "gcp_workload_identity") throw new Error("provider_unavailable");
    return openAIImageAdapter.createOpenAIWifClient({config, OpenAI});
  },
});
async function generationProviderAuthPreflight() {
  const config = await generationProviderConfig();
  if (config.authenticationMode !== "gcp_workload_identity") {
    return {metadataToken: "FAIL", claimsMatch: "FAIL", openAIExchange: "FAIL",
      failureCategory: "wif_config_missing", claims: null};
  }
  try {
    const {WorkloadIdentityAuth} = require("openai/auth/workload-identity-auth");
    const result = await openAIImageAdapter.runOpenAIWifPreflight({config,
      exchangeToken: async ({identityProviderId, serviceAccountId, subjectToken}) => {
        const auth = new WorkloadIdentityAuth({identityProviderId, serviceAccountId,
          provider: {tokenType: "jwt", getToken: async () => subjectToken}});
        return auth.getToken();
      }});
    console.info("generated_visual_wif_preflight", {status: "pass", subject: result.claims.subject,
      audience: result.claims.audience, issuer: result.claims.issuer});
    return result;
  } catch (error) {
    const failureCategory = error?.category || "openai_wif_exchange_failed";
    console.error("generated_visual_wif_preflight", {status: "fail", failureCategory});
    return {metadataToken: ["google_metadata_unavailable", "google_subject_token_invalid"].includes(failureCategory) ?
      "FAIL" : "PASS", claimsMatch: failureCategory === "google_claim_mismatch" ? "FAIL" :
      ["google_metadata_unavailable", "google_subject_token_invalid"].includes(failureCategory) ? "NOT_RUN" : "PASS",
    openAIExchange: "FAIL", failureCategory, claims: null};
  }
}
const generationService = generationFoundation.createGenerationService({
  db, FieldValue, Timestamp, FieldPath, adapter: generationAdapter,
  capability: async () => {
    if (generationIsLocal) return "test_only";
    const config = await generationProviderConfig();
    return config.providerGenerationEnabled === true ? "enabled" : "disabled";
  },
  budgetEnabled: async (actor) => generationIsLocal || (await generationBusinessBudget(actor)).monthlyAllowance > 0,
  budgetAuthority: generationIsLocal ? null : generationBudgetAuthority,
  approvedServices: async (actor) => {
    const profile = await db.collection("businessBrandProfiles").doc(actor.uid).get();
    return Array.isArray(profile.data()?.approvedServiceCategories) ? profile.data().approvedServiceCategories : [];
  },
  brandProfile: async (actor) => {
    const profile = await db.collection("businessBrandProfiles").doc(actor.uid).get();
    return profile.exists ? profile.data() : {};
  },
  ingestCandidate: (input) => creativeMediaService.ingestGeneratedCandidate(input),
  approveCandidate: (input) => creativeMediaService.approveGeneratedCandidate(input),
  rejectCandidate: (input) => creativeMediaService.rejectGeneratedCandidate(input),
  providerAuthPreflight: generationProviderAuthPreflight,
  reportOperationalFailure: (evidence) => console.error("generated_visual_operation_failed", evidence),
});

function legalConsentError(error, message) {
  if (error?.message !== "legal_consent_required") return null;
  return new HttpsError(
    "failed-precondition",
    message || "Review and accept the current ScaledCircle agreements to continue.",
    {
      reason: "LEGAL_CONSENT_REQUIRED",
      missing: Array.isArray(error.missing) ? error.missing : [],
    },
  );
}

async function requireCurrentLegalConsents(
  uid,
  agreementTypes,
  transaction = null,
  message = null,
) {
  try {
    return await legalConsentService.requireCurrent({uid, agreementTypes, transaction});
  } catch (error) {
    throw legalConsentError(error, message) || error;
  }
}

setGlobalOptions({
  maxInstances: 10,
  region: "us-east1",
});

const OVERPASS_URL =
  "https://overpass-api.de/api/interpreter";

const DEVELOPMENT_HOMES_PER_ACRE = 2.5;

const PROPERTY_INTELLIGENCE_CACHE_COLLECTION = "propertyIntelligenceCache";

const ADMIN_WALLET_ID = "scaled_circle_admin";

const SUPPORT_EMAIL = operations.SUPPORT_EMAIL;
// SMTP transport identity is deliberately separate from the public support
// address. Existing Gmail transport can remain until a ScaledCircle mailbox
// is configured, while all user-facing replies go to support@scaledcircle.com.
const EMAIL_TRANSPORT_ACCOUNT = "attractiveremodel@gmail.com";
const SIGNUP_NOTIFICATION_EMAIL = EMAIL_TRANSPORT_ACCOUNT;
const SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD = defineSecret(
  "SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD",
);
const SUPPORT_EMAIL_SMTP_PASSWORD = defineSecret("SUPPORT_EMAIL_SMTP_PASSWORD");
const CENSUS_API_KEY = defineSecret("CENSUS_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_THIN_WEBHOOK_SECRET = defineSecret("STRIPE_THIN_WEBHOOK_SECRET");
const STRIPE_STARTER_PRICE_ID = defineSecret("STRIPE_STARTER_PRICE_ID");
const STRIPE_GROWTH_PRICE_ID = defineSecret("STRIPE_GROWTH_PRICE_ID");
const STRIPE_SCALE_PRICE_ID = defineSecret("STRIPE_SCALE_PRICE_ID");


const SUBSCRIPTION_PRICES = {
  starter: 99,
  growth: 299,
  scale: 499,
};

const SUBSCRIPTION_RANKS = {
  starter: 1,
  growth: 2,
  scale: 3,
};

const MINIMUM_PAYABLE_COMPLETION_PERCENTAGE = 10;
const AUTOMATIC_BONUS_COMPLETION_PERCENTAGE = 95;
const ADMIN_COMPED_SUBSCRIPTION_EXPIRATION = Timestamp.fromDate(
  new Date("2099-12-31T23:59:59.000Z"),
);

async function authenticatedUserContext(request, message) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", message);
  }

  const userReference = db.collection("users").doc(request.auth.uid);
  const userSnapshot = await userReference.get();
  const user = userSnapshot.data() || {};
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "";

  return {
    uid: request.auth.uid,
    user,
    role,
    isAdmin: role === "admin",
    emailVerified: request.auth.token.email_verified === true,
  };
}

async function requireVerifiedUser(request, message) {
  const context = await authenticatedUserContext(request, message);
  if (!context.isAdmin && !context.emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Verify your email address before using billing or receiving payments.",
    );
  }
  return context;
}

async function requirePendingScaler(request) {
  const context = await requireVerifiedUser(request, "Verify your email to set up work preferences.");
  if (context.role !== "scaler" || context.user.active === true ||
      context.user.betaAccess === "approved") {
    throw new HttpsError("permission-denied", "Pending Scaler setup is not available for this account.");
  }
  return context;
}

function affiliateError(error) {
  const code = error?.message || "affiliate_operation_failed";
  const invalid = new Set([
    "affiliate_terms_required", "affiliate_rate_invalid",
    "affiliate_rate_reason_required", "referral_invalid_or_expired",
  ]);
  const denied = new Set([
    "approved_scaler_required", "business_required", "self_referral_denied",
  ]);
  const missing = new Set(["referral_code_not_found", "affiliate_not_found"]);
  if (invalid.has(code)) return new HttpsError("invalid-argument", code.replaceAll("_", " "));
  if (denied.has(code)) return new HttpsError("permission-denied", code.replaceAll("_", " "));
  if (missing.has(code)) return new HttpsError("not-found", code.replaceAll("_", " "));
  if (code === "affiliate_not_active") return new HttpsError("failed-precondition", "This referral program account is not active.");
  return new HttpsError("internal", "The referral program is temporarily unavailable.");
}

exports.joinScalerAffiliateProgram = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const affiliateProgram = require("./affiliate_program");
    const affiliateProgramService = affiliateProgram.createAffiliateService({db, FieldValue, Timestamp});
    const context = await requireVerifiedUser(request, "Verify your email before joining the referral program.");
    try {
      const profile = await affiliateProgramService.join({
        uid: context.uid,
        user: context.user,
        acceptedTermsVersion: request.data?.termsVersion,
      });
      return {
        joined: true,
        referralCode: profile.referralCode,
        commissionRateBps: profile.commissionRateBps,
        termsVersion: profile.termsVersion,
      };
    } catch (error) {
      throw affiliateError(error);
    }
  },
);

exports.getScalerAffiliateDashboard = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const affiliateProgram = require("./affiliate_program");
    const affiliateProgramService = affiliateProgram.createAffiliateService({db, FieldValue, Timestamp});
    const context = await requireVerifiedUser(request, "Verify your email to view referrals.");
    if (!affiliateProgram.isApprovedScaler(context.user)) {
      throw new HttpsError("permission-denied", "The referral program is available to approved Scalers.");
    }
    return affiliateProgramService.dashboard(context.uid);
  },
);

exports.recordBusinessReferralAttribution = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const affiliateProgram = require("./affiliate_program");
    const affiliateProgramService = affiliateProgram.createAffiliateService({db, FieldValue, Timestamp});
    const context = await authenticatedUserContext(request, "Log in to record a referral.");
    try {
      return await affiliateProgramService.attributeBusiness({
        businessUid: context.uid,
        businessUser: context.user,
        code: request.data?.referralCode,
        capturedAtMillis: request.data?.capturedAtMillis,
      });
    } catch (error) {
      throw affiliateError(error);
    }
  },
);

exports.adminSetScalerAffiliateRate = onCall(
  {enforceAppCheck: false, maxInstances: 5},
  async (request) => {
    const affiliateProgram = require("./affiliate_program");
    const affiliateProgramService = affiliateProgram.createAffiliateService({db, FieldValue, Timestamp});
    const context = await requireVerifiedUser(request, "Log in as an administrator.");
    if (!context.isAdmin) throw new HttpsError("permission-denied", "Administrator access is required.");
    try {
      return await affiliateProgramService.setRate({
        adminUid: context.uid,
        affiliateUid: cleanId(request.data?.affiliateUid),
        rateBps: request.data?.rateBps,
        reason: request.data?.reason,
      });
    } catch (error) {
      throw affiliateError(error);
    }
  },
);

exports.adminGetScalerAffiliateOverview = onCall(
  {enforceAppCheck: false, maxInstances: 5},
  async (request) => {
    const affiliateProgramService = require("./affiliate_program")
      .createAffiliateService({db, FieldValue, Timestamp});
    const context = await requireVerifiedUser(request, "Log in as an administrator.");
    if (!context.isAdmin) throw new HttpsError("permission-denied", "Administrator access is required.");
    return {affiliates: await affiliateProgramService.adminOverview()};
  },
);

exports.updateScalerProfile = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "Verify your email before editing your Scaler profile.",
    );
    if (context.role !== "scaler") {
      throw new HttpsError("permission-denied", "A Scaler account is required.");
    }
    try {
      return await scalerProfileService.update({
        uid: context.uid,
        input: request.data,
      });
    } catch (error) {
      const invalid = new Set([
        "profile_payload_invalid",
        "profile_text_invalid",
        "display_name_required",
        "profile_text_too_long",
        "profile_field_not_allowed",
      ]);
      if (invalid.has(error?.message)) {
        throw new HttpsError("invalid-argument", "Check your profile details and try again.");
      }
      if (error?.message === "scaler_role_required") {
        throw new HttpsError("permission-denied", "A Scaler account is required.");
      }
      throw new HttpsError("internal", "We couldn't update your profile right now.");
    }
  },
);

async function grantAdminScaleSubscription(adminId) {
  const walletReference = db.collection("wallets").doc(adminId);
  const subscriptionReference = db
    .collection("businessSubscriptions")
    .doc(adminId);
  const serverTimestamp = FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    transaction.set(walletReference, {
      ownerId: adminId,
      ownerType: "business",
      subscriptionPlan: "scale",
      subscriptionPrice: SUBSCRIPTION_PRICES.scale,
      subscriptionStatus: "active",
      subscriptionComped: true,
      subscriptionSource: "admin_comp",
      subscriptionExpiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION,
      updatedAt: serverTimestamp,
    }, {merge: true});

    transaction.set(subscriptionReference, {
      businessId: adminId,
      plan: "scale",
      planId: "scale",
      price: SUBSCRIPTION_PRICES.scale,
      status: "active",
      comped: true,
      source: "admin_comp",
      expiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION,
      updatedAt: serverTimestamp,
    }, {merge: true});
  });

  return {
    plan: "scale",
    chargedCredits: 0,
    comped: true,
    expiresAt: ADMIN_COMPED_SUBSCRIPTION_EXPIRATION.toMillis(),
  };
}

const TRACKING_CHANNELS = new Set([
  "web",
  "qr",
  "print",
  "phone",
  "email",
]);

const DISCOVERY_SOURCES = new Set([
  "personal_referral",
  "search_engine",
  "social_media",
  "online_ad",
  "event_or_group",
  "other",
]);

/**
 * Provision the web attribution layer for a campaign.
 *
 * The public tracking code is separate from the Firestore campaign id. It can
 * be printed safely, can later move behind go.scaledcircle.com, and can be
 * deactivated without deleting the campaign.
 */
exports.provisionCampaignTracking = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to configure campaign tracking.",
      );
    }

    const campaignId = readText(request.data?.campaignId, 160);
    const destinationType = request.data?.destinationType ===
      "scaled_circle_landing"
      ? "scaled_circle_landing"
      : "existing_website";
    const destinationUrl = normalizeExternalUrl(
      request.data?.destinationUrl,
    );
    const requestedChannels = Array.isArray(request.data?.channels)
      ? request.data.channels
        .map((value) => readText(value, 24))
        .filter((value) => TRACKING_CHANNELS.has(value))
      : ["web", "qr", "print"];

    if (!campaignId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaign is required.",
      );
    }

    if (!destinationUrl) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a complete https:// website destination.",
      );
    }

    const campaignReference = db.collection("campaigns").doc(campaignId);
    const businessId = request.auth.uid;

    return db.runTransaction(async (transaction) => {
      const campaignSnapshot = await transaction.get(campaignReference);

      if (!campaignSnapshot.exists) {
        throw new HttpsError("not-found", "The campaign does not exist.");
      }

      const campaign = campaignSnapshot.data() || {};

      if (campaign.businessId !== businessId) {
        throw new HttpsError(
          "permission-denied",
          "Only the campaign owner can configure tracking.",
        );
      }

      const existingCode = readText(campaign.trackingCode, 64);
      const trackingCode = /^[a-f0-9]{24}$/.test(existingCode)
        ? existingCode
        : crypto.randomBytes(12).toString("hex");
      const trackingReference = db
        .collection("campaignTrackingCodes")
        .doc(trackingCode);
      const trackingUrl = publicTrackingUrl(trackingCode);
      const qrTrackingUrl = `${trackingUrl}&source=qr`;
      const timestamp = FieldValue.serverTimestamp();
      const config = {
        destinationType,
        destinationUrl,
        landingPageHeadline: readText(
          request.data?.landingPageHeadline,
          120,
        ),
        landingPageBody: readText(request.data?.landingPageBody, 600),
        callToActionLabel: readText(
          request.data?.callToActionLabel,
          50,
        ) || "Learn More",
        channels: [...new Set(requestedChannels)],
        forwardingPhoneNumber: readText(
          request.data?.forwardingPhoneNumber,
          40,
        ),
        forwardingEmail: readText(request.data?.forwardingEmail, 200),
      };

      transaction.set(trackingReference, {
        active: true,
        trackingCode,
        campaignId,
        businessId,
        campaignName: readText(campaign.campaignName, 160),
        campaignDescription: readText(campaign.description, 1200),
        ...config,
        trackingUrl,
        qrTrackingUrl,
        createdAt: campaign.trackingCode ? campaign.trackingCreatedAt ||
          timestamp : timestamp,
        updatedAt: timestamp,
      }, {merge: true});

      transaction.update(campaignReference, {
        trackingEnabled: true,
        trackingStatus: "active",
        trackingCode,
        trackingUrl,
        qrCodeUrl: qrTrackingUrl,
        trackingDestinationType: destinationType,
        trackingDestinationUrl: destinationUrl,
        landingPageUrl: destinationType === "scaled_circle_landing"
          ? trackingUrl : null,
        landingPageHeadline: config.landingPageHeadline,
        landingPageBody: config.landingPageBody,
        trackingCallToActionLabel: config.callToActionLabel,
        trackingChannels: config.channels,
        forwardingPhoneNumber: config.forwardingPhoneNumber || null,
        forwardingEmail: config.forwardingEmail || null,
        phoneTrackingStatus: config.channels.includes("phone")
          ? "provider_connection_required" : "not_requested",
        emailTrackingStatus: config.channels.includes("email")
          ? "provider_connection_required" : "not_requested",
        trackingCreatedAt: campaign.trackingCreatedAt || timestamp,
        trackingUpdatedAt: timestamp,
        updatedAt: timestamp,
      });

      return {
        trackingCode,
        trackingUrl,
        qrTrackingUrl,
        landingPageUrl: destinationType === "scaled_circle_landing"
          ? trackingUrl : null,
        phoneTrackingStatus: config.channels.includes("phone")
          ? "provider_connection_required" : "not_requested",
        emailTrackingStatus: config.channels.includes("email")
          ? "provider_connection_required" : "not_requested",
      };
    });
  },
);

/**
 * Public campaign link used by QR codes, printable assets, Squarespace links,
 * and Scaled Circle landing pages.
 */
exports.campaignTracking = onRequest(
  {
    cors: false,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store, max-age=0");
    response.set("Referrer-Policy", "strict-origin-when-cross-origin");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).send("Method not allowed.");
      return;
    }

    const trackingCode = readText(request.query.t, 64);

    if (!/^[a-f0-9]{24}$/.test(trackingCode)) {
      response.status(404).send("Tracking link not found.");
      return;
    }

    try {
      const trackingReference = db
        .collection("campaignTrackingCodes")
        .doc(trackingCode);
      const trackingSnapshot = await trackingReference.get();
      const tracking = trackingSnapshot.data() || {};

      if (!trackingSnapshot.exists || tracking.active !== true) {
        response.status(404).send("Tracking link is no longer active.");
        return;
      }

      const destinationUrl = normalizeExternalUrl(tracking.destinationUrl);

      if (!destinationUrl) {
        response.status(503).send("Campaign destination is unavailable.");
        return;
      }

      const source = readText(request.query.source, 24) === "qr"
        ? "qr" : "web";
      const action = readText(request.query.action, 24);

      if (action === "cta") {
        await recordTrackingEvent({
          tracking,
          trackingCode,
          eventType: "cta_click",
          source,
          request,
          metrics: ["ctaClicks"],
        });
        response.redirect(302, destinationUrl);
        return;
      }

      const destinationType = tracking.destinationType ===
        "scaled_circle_landing"
        ? "scaled_circle_landing"
        : "existing_website";
      const metrics = source === "qr" ? ["qrScans"] : ["webVisits"];

      if (destinationType === "existing_website") {
        await recordTrackingEvent({
          tracking,
          trackingCode,
          eventType: "destination_redirect",
          source,
          request,
          metrics,
        });
        response.redirect(302, destinationUrl);
        return;
      }

      await recordTrackingEvent({
        tracking,
        trackingCode,
        eventType: "landing_page_view",
        source,
        request,
        metrics: [...metrics, "landingPageViews"],
      });

      response.status(200).type("html").send(renderCampaignLandingPage({
        tracking,
        destinationUrl,
        source,
      }));
    } catch (error) {
      logger.error("Campaign tracking request failed.", {
        trackingCode,
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(500).send("Unable to open this campaign right now.");
    }
  },
);

/**
 * Public pre-launch waitlist shared by the Flutter web entry point and the
 * Squarespace embed. This creates no authenticated account and grants no
 * marketplace access.
 */
exports.joinWaitlist = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store, max-age=0");

    if (request.method !== "POST") {
      response.status(405).json({error: "Method not allowed."});
      return;
    }

    const body = request.body && typeof request.body === "object"
      ? request.body : {};

    // Quietly accept bot-filled forms so the honeypot does not teach bots how
    // to bypass it, while avoiding a Firestore write.
    if (readText(body.website, 200)) {
      response.status(200).json({status: "waiting"});
      return;
    }

    const email = readText(body.email, 254).toLowerCase();
    const role = body.role === "business" ? "business" :
      body.role === "scaler" ? "scaler" : "";
    const displayName = readText(body.displayName, 120);
    const companyName = readText(body.companyName, 160);
    const postalCode = readText(body.postalCode, 20);
    const contactNumber = readText(body.contactNumber, 40);
    const discoverySource = readText(body.discoverySource, 40);
    const referrerName = discoverySource === "personal_referral"
      ? readText(body.referrerName, 160) : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      response.status(400).json({error: "Enter a valid email address."});
      return;
    }

    if (!role) {
      response.status(400).json({error: "Choose Business or Scaler."});
      return;
    }

    if (!DISCOVERY_SOURCES.has(discoverySource)) {
      response.status(400).json({
        error: "Tell us how you heard about Scaled Circle.",
      });
      return;
    }

    if (discoverySource === "personal_referral" && !referrerName) {
      response.status(400).json({
        error: "Enter the name of the person who referred you.",
      });
      return;
    }

    if (body.consent !== true) {
      response.status(400).json({
        error: "Consent is required to send launch and beta invitations.",
      });
      return;
    }

    const waitlistId = crypto
      .createHash("sha256")
      .update(`${role}:${email}`)
      .digest("hex");
    const waitlistReference = db.collection("waitlist").doc(waitlistId);
    const snapshot = await waitlistReference.get();
    const timestamp = FieldValue.serverTimestamp();

    await waitlistReference.set({
      email,
      role,
      displayName,
      companyName: role === "business" ? companyName : "",
      postalCode,
      contactNumber,
      status: "waiting",
      source: readText(body.source, 80) || "scaled_circle_web",
      discoverySource,
      referrerName,
      consent: true,
      benefits: role === "business"
        ? {
          freeLaunchSubscription: true,
          platformFeeStillApplies: true,
          scalerPayStillApplies: true,
        }
        : {
          earlyHistoryPriority: true,
          earlyAccessCandidate: true,
        },
      ...(snapshot.exists ? {} : {createdAt: timestamp}),
      updatedAt: timestamp,
    }, {merge: true});

    response.status(snapshot.exists ? 200 : 201).json({
      status: "waiting",
      alreadyJoined: snapshot.exists,
      role,
      message: role === "business"
        ? "You are on the Business early-access list."
        : "You are on the Scaler early-access list.",
    });
  },
);

/**
 * Email the Scaled Circle launch administrator when a complete account profile
 * is created. The user profile is a better source than the raw Auth event
 * because it includes the selected Business/Scaler role and company details.
 */
exports.notifyAdminOnAccountSignup = onDocumentCreated(
  {
    document: "users/{userId}",
    retry: true,
    maxInstances: 5,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      return;
    }
    await signupNotifications.handleAccountProfileCreated({
      uid: event.params.userId,
      profile: data,
      auth: getAuth(),
      db,
      serverTimestamp: FieldValue.serverTimestamp(),
    });
  },
);

/**
 * Notify the administrator about public early-access signups that did not
 * create an account. Account creation also submits the waitlist form when the
 * user requests updates, so Auth is checked first to prevent duplicate email.
 */
exports.notifyAdminOnWaitlistSignup = onDocumentCreated(
  {
    document: "waitlist/{waitlistId}",
    retry: true,
    maxInstances: 5,
  },
  async (event) => {
    const data = event.data?.data();
    const email = readText(data?.email, 254).toLowerCase();
    if (!data || !email) {
      return;
    }

    await signupNotifications.handleSubscriberCreated({
      subscriber: data,
      occurredAt: event.data?.createTime?.toDate?.().toISOString() ||
        "server-recorded",
      auth: getAuth(),
      db,
      serverTimestamp: FieldValue.serverTimestamp(),
    });
  },
);

function signupEmailError(error) {
  const code = error?.message || "signup_email_failed";
  if (["signup_input_invalid", "referrer_required"].includes(code)) {
    return new HttpsError("invalid-argument", "Check the account details and try again.");
  }
  if (code === "signup_already_finalized") {
    return new HttpsError("already-exists", "This account has already been finalized.");
  }
  if (code === "already_verified") {
    return new HttpsError("failed-precondition", "Your email is already verified.");
  }
  if (code === "verification_rate_limited") {
    return new HttpsError("resource-exhausted", "Please wait a few minutes before requesting another email.");
  }
  return new HttpsError("internal", "We couldn't prepare the account email right now. Please try again.");
}

/** Atomically finalize a public account and reserve both deterministic signup emails. */
exports.finalizePublicAccountSignup = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to finish creating your account.");
    const auth = getAuth();
    const authUser = await auth.getUser(request.auth.uid);
    const service = transactionalEmail.createService({db, auth, FieldValue});
    try {
      return await service.finalize({uid: request.auth.uid, authUser, data: request.data});
    } catch (error) {
      logger.error("Public signup finalization failed.", {uid: request.auth.uid, code: error?.message});
      throw signupEmailError(error);
    }
  },
);

/** Record immutable, versioned acceptance for the authenticated profile owner. */
exports.recordLegalConsent = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const context = await authenticatedUserContext(
      request,
      "Sign in to record legal consent.",
    );
    try {
      return await legalConsentService.accept({
        uid: context.uid,
        role: context.role,
        data: request.data,
      });
    } catch (error) {
      const code = error?.message;
      if (["invalid_consent_request", "unknown_agreement"].includes(code)) {
        throw new HttpsError("invalid-argument", "Choose a current ScaledCircle agreement.");
      }
      if (["scaler_agreement_requires_scaler", "consent_actor_invalid"].includes(code)) {
        throw new HttpsError("permission-denied", "This agreement does not apply to your account role.");
      }
      logger.error("Legal consent recording failed.", {uid: context.uid, code});
      throw new HttpsError("internal", "We couldn't record acceptance. Please try again.");
    }
  },
);

/** Return bounded current-agreement status for the authenticated profile owner. */
exports.getLegalConsentStatus = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const context = await authenticatedUserContext(
      request,
      "Sign in to review your agreement status.",
    );
    const requestedContext = readText(request.data?.context, 40);
    const requirements = legalConsent.ROLE_REQUIREMENTS[requestedContext];
    if (!requirements) {
      throw new HttpsError("invalid-argument", "Choose a supported agreement context.");
    }
    if (requestedContext === "business_funding" && context.role !== "business") {
      throw new HttpsError("permission-denied", "This agreement context requires a Business account.");
    }
    if (requestedContext.startsWith("scaler_") && context.role !== "scaler") {
      throw new HttpsError("permission-denied", "This agreement context requires a Scaler account.");
    }
    return {
      context: requestedContext,
      ...await legalConsentService.status({uid: context.uid, agreementTypes: requirements}),
    };
  },
);

/** Queue a verification-only message for the authenticated account owner. */
exports.resendEmailVerification = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to request another verification email.");
    const auth = getAuth();
    const authUser = await auth.getUser(request.auth.uid);
    const service = transactionalEmail.createService({db, auth, FieldValue});
    try {
      return await service.resend({uid: request.auth.uid, authUser});
    } catch (error) {
      throw signupEmailError(error);
    }
  },
);

/**
 * Deliver deterministic server-authored signup and operational email jobs.
 * This sender fails closed unless the deployed SMTP identity is the authorized
 * support@scaledcircle.com mailbox. Clients cannot create queue records.
 */
exports.sendTransactionalEmailJob = onDocumentCreated(
  {
    document: "outboundEmailJobs/{jobId}",
    secrets: [SUPPORT_EMAIL_SMTP_PASSWORD],
    retry: false,
    maxInstances: 5,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    return transactionalEmail.processDeliveryJob({
      db, reference: snapshot.ref, jobId: event.params.jobId, FieldValue,
      createTransport: (options) => nodemailer.createTransport(options), logger,
      smtpPassword: SUPPORT_EMAIL_SMTP_PASSWORD.value(),
    });
  },
);

/** Deliver only user-requested Managed Growth artifacts from an isolated queue. */
exports.sendArtifactDeliveryEmailJob = onDocumentCreated(
  {
    document: `${managedGrowthDelivery.EMAIL_JOB_COLLECTION}/{jobId}`,
    secrets: [SUPPORT_EMAIL_SMTP_PASSWORD],
    retry: false,
    maxInstances: 3,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const jobId = event.params.jobId;
    await managedGrowthDelivery.processArtifactEmailJob({
      jobId,
      job: snapshot.data() || {},
      senderEmail: managedGrowthDelivery.SUPPORT_EMAIL,
      senderName: managedGrowthDelivery.SUPPORT_FROM_NAME,
      reject: async (errorCode) => snapshot.ref.set({
        status: "rejected",
        errorCode,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}),
      claim: async () => {
        const leaseId = crypto.randomUUID();
        return db.runTransaction(async (transaction) => {
          const current = await transaction.get(snapshot.ref);
          if (current.data()?.status !== "queued") return false;
          transaction.update(snapshot.ref, {
            status: "sending",
            leaseId,
            attempts: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      },
      sendMail: async (message) => nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: managedGrowthDelivery.SUPPORT_EMAIL,
          pass: SUPPORT_EMAIL_SMTP_PASSWORD.value(),
        },
      }).sendMail(message),
      markSent: async (messageId) => snapshot.ref.set({
        status: "sent",
        messageId: readText(messageId, 500),
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}),
      markFailed: async () => snapshot.ref.set({
        status: "failed",
        errorCode: "artifact_email_delivery_failed",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}),
      logFailure: (error) => logger.error("Artifact email delivery failed.", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      }),
    });
  },
);

/** Sends one deterministic, server-authored matching-job alert to one Scaler. */
exports.sendScalerJobAlertEmailJob = onDocumentCreated(
  {
    document: `${scalerJobAlertEmail.EMAIL_JOB_COLLECTION}/{jobId}`,
    secrets: [SUPPORT_EMAIL_SMTP_PASSWORD], retry: false, maxInstances: 3,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const queued = {...(snapshot.data() || {}), id: event.params.jobId};
    if (!scalerJobAlertEmail.validateJob(queued)) {
      await snapshot.ref.set({status: "rejected", errorCode: "invalid_job_alert_email",
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return;
    }
    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(snapshot.ref);
      if (current.data()?.status !== "queued") return false;
      transaction.update(snapshot.ref, {status: "sending", attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()});
      return true;
    });
    if (!claimed) return;
    try {
      const result = await nodemailer.createTransport({service: "gmail", auth: {
        user: scalerJobAlertEmail.SUPPORT_EMAIL, pass: SUPPORT_EMAIL_SMTP_PASSWORD.value(),
      }}).sendMail({from: `${scalerJobAlertEmail.SUPPORT_FROM_NAME} <${scalerJobAlertEmail.SUPPORT_EMAIL}>`,
        to: queued.to, replyTo: scalerJobAlertEmail.SUPPORT_EMAIL,
        subject: queued.subject, text: queued.text,
        headers: {"X-Scaled-Circle-Notification": event.params.jobId}});
      await snapshot.ref.set({status: "sent", messageId: readText(result.messageId, 500),
        sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    } catch (error) {
      logger.error("Scaler job-alert email delivery failed.", {jobId: event.params.jobId,
        error: error instanceof Error ? error.message : String(error)});
      await snapshot.ref.set({status: "failed", errorCode: "job_alert_email_failed",
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  },
);

/**
 * Public, cached NWS alert feed for the Local Opportunity Alerts website
 * module. Weather facts remain separate from Scaled Circle's experimental
 * lead-lift estimate.
 */
exports.localOpportunityAlerts = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  async (request, response) => {
    response.set("Cache-Control", "public, max-age=120");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.status(405).json({error: "Method not allowed."});
      return;
    }

    const latitude = Number(request.query.latitude);
    const longitude = Number(request.query.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      response.status(400).json({
        error: "Valid latitude and longitude are required.",
      });
      return;
    }

    try {
      const feed = await loadWeatherOpportunityFeed({latitude, longitude});
      response.status(200).json(feed);
    } catch (error) {
      logger.error("Unable to load local opportunity alerts.", {
        latitude,
        longitude,
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(503).json({
        error: "Local opportunity alerts are temporarily unavailable.",
      });
    }
  },
);

/** Send queued weather emails independently so missing email credentials never
 * stop scheduled in-app notifications from being created. */
exports.sendWeatherAlertEmail = onDocumentCreated(
  {
    document: "weatherEmailQueue/{deliveryId}",
    maxInstances: 5,
    retry: true,
    secrets: [SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const queue = snapshot.data() || {};
    if (queue.status === "sent") return;

    const deliveryId = event.params.deliveryId;
    const alert = queue.alert && typeof queue.alert === "object" ? queue.alert : {};
    const countyName = readText(queue.countyName, 120);
    const destination = readText(queue.email, 320).toLowerCase();
    if (!destination) {
      await snapshot.ref.set({
        status: "failed",
        error: "A destination email is required.",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return;
    }

    try {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: SIGNUP_NOTIFICATION_EMAIL,
          pass: SIGNUP_NOTIFICATION_GMAIL_APP_PASSWORD.value(),
        },
      });
      const eventName = readText(alert.event, 120) || "Weather alert";
      const officialDescription = readText(alert.officialDescription, 1000);
      const services = Array.isArray(alert.services) ?
        alert.services.join(", ") : "Local outreach";
      const low = Number(alert.leadLiftLowPercent) || 0;
      const high = Number(alert.leadLiftHighPercent) || 0;
      const sourceUrl = readText(alert.sourceUrl, 1000);
      const text = `${eventName} — ${countyName}\n\n` +
        `Official National Weather Service information:\n${officialDescription}\n\n` +
        `Experimental Scaled Circle planning estimate: +${low}% to +${high}% ` +
        `potential lead activity. Suggested services: ${services}.\n\n` +
        `Review signals: ${publicAppBaseUrl()}/`;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0b1725">
          <h2>${escapeHtml(eventName)} — ${escapeHtml(countyName)}</h2>
          <h3>Official National Weather Service information</h3>
          <p>${escapeHtml(officialDescription).replaceAll("\n", "<br>")}</p>
          ${sourceUrl ? `<p><a href="${escapeHtml(sourceUrl)}">View official alert</a></p>` : ""}
          <hr>
          <h3>Experimental planning estimate</h3>
          <p><strong>+${low}% to +${high}%</strong> potential lead activity.</p>
          <p>Suggested services: ${escapeHtml(services)}</p>
          <p><em>This estimate is not a guarantee of leads or work.</em></p>
          <p><a href="${escapeHtml(publicAppBaseUrl())}/">Open Scaled Circle</a></p>
        </div>`;
      const result = await transport.sendMail({
        from: `Scaled Circle Weather <${SIGNUP_NOTIFICATION_EMAIL}>`,
        to: destination,
        subject: `[Scaled Circle Weather] ${eventName} — ${countyName}`,
        text,
        html,
        headers: {"X-Scaled-Circle-Notification": `weather_${deliveryId}`},
      });
      await Promise.all([
        snapshot.ref.set({
          status: "sent",
          messageId: result.messageId || "",
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}),
        db.collection("weatherAlertDeliveries").doc(deliveryId).set({
          emailSent: true,
          emailMessageId: result.messageId || "",
          emailSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}),
      ]);
    } catch (error) {
      await snapshot.ref.set({
        status: "failed",
        error: readText(error instanceof Error ? error.message : error, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
  },
);

/**
 * Purchase or upgrade the signed-in business subscription.
 *
 * Wallet debits and platform credits must run on the trusted server because
 * clients are not permitted to write the platform administrator wallet.
 */
exports.purchaseSubscription = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await requireVerifiedUser(
      request,
      "You must be logged in to purchase a subscription.",
    );

    const requestedPlan = request.data?.plan;

    if (typeof requestedPlan !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "A valid subscription plan is required.",
      );
    }

    const newPlan = requestedPlan.trim().toLowerCase();
    const targetPrice = SUBSCRIPTION_PRICES[newPlan];

    if (!Number.isFinite(targetPrice)) {
      throw new HttpsError(
        "invalid-argument",
        "Unknown subscription plan.",
      );
    }

    const businessId = request.auth.uid;
    if (authContext.isAdmin) {
      return grantAdminScaleSubscription(businessId);
    }
    throw new HttpsError(
      "failed-precondition",
      "Paid subscriptions must be purchased through Stripe Checkout.",
    );

    // Legacy credit-based subscription logic remains below temporarily so an
    // older deployed client receives a clear migration error instead of
    // silently creating a non-renewing production subscription.
    const walletReference = db.collection("wallets").doc(businessId);
    const subscriptionReference = db
      .collection("businessSubscriptions")
      .doc(businessId);
    const adminWalletReference = db
      .collection("wallets")
      .doc(ADMIN_WALLET_ID);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const walletSnapshot = await transaction.get(walletReference);
        const adminWalletSnapshot = await transaction.get(
          adminWalletReference,
        );

        if (!walletSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Business wallet does not exist.",
          );
        }

        const wallet = walletSnapshot.data() || {};
        const availableCredits = Number(wallet.availableCredits || 0);
        const currentPlan = typeof wallet.subscriptionPlan === "string"
          ? wallet.subscriptionPlan.toLowerCase()
          : null;
        const subscriptionStatus = typeof wallet.subscriptionStatus === "string"
          ? wallet.subscriptionStatus.toLowerCase()
          : null;
        const currentExpiration = wallet.subscriptionExpiresAt;
        const active =
          subscriptionStatus === "active" &&
          currentExpiration instanceof Timestamp &&
          currentExpiration.toDate() > new Date();

        let charge = targetPrice;
        let upgrading = false;

        if (active && currentPlan) {
          const currentRank = SUBSCRIPTION_RANKS[currentPlan];
          const targetRank = SUBSCRIPTION_RANKS[newPlan];

          if (!currentRank) {
            throw new HttpsError(
              "failed-precondition",
              "The current subscription plan is invalid.",
            );
          }

          if (targetRank === currentRank) {
            throw new HttpsError(
              "already-exists",
              "This subscription plan is already active.",
            );
          }

          if (targetRank < currentRank) {
            throw new HttpsError(
              "failed-precondition",
              "Subscription downgrades are not available.",
            );
          }

          charge = targetPrice - SUBSCRIPTION_PRICES[currentPlan];
          upgrading = true;
        }

        if (!Number.isFinite(availableCredits) || availableCredits < charge) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient credits. ${charge.toFixed(0)} required.`,
          );
        }

        const expiration = active
          ? currentExpiration
          : Timestamp.fromDate(
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          );
        const remainingCredits = availableCredits - charge;
        const adminWallet = adminWalletSnapshot.data() || {};
        const adminBalance = Number(adminWallet.availableBalance || 0);
        const serverTimestamp = FieldValue.serverTimestamp();

        transaction.update(walletReference, {
          availableCredits: remainingCredits,
          balance: remainingCredits,
          subscriptionPlan: newPlan,
          subscriptionPrice: targetPrice,
          subscriptionStatus: "active",
          subscriptionExpiresAt: expiration,
          ...(upgrading
            ? {
              previousSubscriptionPlan: currentPlan,
              subscriptionUpgradedAt: serverTimestamp,
            }
            : {
              subscriptionStartedAt: serverTimestamp,
            }),
          updatedAt: serverTimestamp,
        });

        transaction.set(
          subscriptionReference,
          {
            businessId,
            plan: newPlan,
            planId: newPlan,
            price: targetPrice,
            status: "active",
            expiresAt: expiration,
            ...(upgrading ? {previousPlan: currentPlan} : {}),
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        const transactionReference = walletReference
          .collection("transactions")
          .doc();

        transaction.set(transactionReference, {
          type: upgrading
            ? "subscription_upgrade"
            : "subscription_payment",
          amount: charge,
          subscriptionPlan: newPlan,
          subscriptionFullPrice: targetPrice,
          previousSubscriptionPlan: currentPlan,
          description: upgrading
            ? "Scaled Circle subscription upgrade"
            : "Scaled Circle subscription purchase",
          createdAt: serverTimestamp,
        });

        transaction.set(
          adminWalletReference,
          {
            ownerId: ADMIN_WALLET_ID,
            ownerType: "admin",
            availableBalance: adminBalance + charge,
            balance: adminBalance + charge,
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        return {
          plan: newPlan,
          chargedCredits: charge,
          remainingCredits,
          expiresAt: expiration.toMillis(),
        };
      });

      logger.info("Business subscription updated.", {
        businessId,
        plan: result.plan,
        chargedCredits: result.chargedCredits,
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Subscription purchase failed.", {
        businessId,
        plan: newPlan,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to update the subscription right now.",
      );
    }
  },
);

/**
 * Ensures administrator accounts always receive the comped $499 Scale plan.
 * Normal businesses are read-only here and must subscribe through Stripe.
 */
exports.ensureBillingEntitlement = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await authenticatedUserContext(
      request,
      "You must be logged in to load billing access.",
    );
    if (authContext.isAdmin) {
      return grantAdminScaleSubscription(authContext.uid);
    }

    const walletSnapshot = await db.collection("wallets")
      .doc(authContext.uid)
      .get();
    const wallet = walletSnapshot.data() || {};
    return {
      plan: wallet.subscriptionPlan || null,
      status: wallet.subscriptionStatus || "inactive",
      comped: wallet.subscriptionComped === true,
    };
  },
);

/**
 * Creates the legacy wallet projection used by existing read-only screens.
 * It is not a cash ledger and cannot fund a Stripe marketplace campaign.
 * Development promotional value is granted only from trusted server state.
 */
exports.ensureLegacyWalletProjection = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const context = await authenticatedUserContext(
      request, "You must be logged in to load the wallet projection.",
    );
    const userSnapshot = await db.collection("users").doc(context.uid).get();
    const user = userSnapshot.data() || {};
    const ownerType = context.role === "scaler" ? "scaler" : "business";
    const walletRef = db.collection("wallets").doc(context.uid);
    const promoRef = walletRef.collection("promoRedemptions")
      .doc("development-business-10000-v1");
    await db.runTransaction(async (transaction) => {
      const [walletSnapshot, promoSnapshot] = await Promise.all([
        transaction.get(walletRef), transaction.get(promoRef),
      ]);
      if (!walletSnapshot.exists) {
        transaction.create(walletRef, {
          ownerId: context.uid,
          ownerType,
          balance: 0,
          availableCredits: 0,
          reservedCredits: 0,
          totalPaidOut: 0,
          availableBalance: 0,
          pendingBalance: 0,
          promotionalCreditsGranted: 0,
          projectionOnly: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (ownerType === "business" && user.developmentCreditsEnabled === true &&
          !promoSnapshot.exists) {
        const wallet = walletSnapshot.data() || {};
        const promotionalAmount = 10000;
        transaction.set(walletRef, {
          availableCredits: Number(wallet.availableCredits || 0) + promotionalAmount,
          balance: Number(wallet.availableCredits || 0) + promotionalAmount,
          promotionalCreditsGranted:
            Number(wallet.promotionalCreditsGranted || 0) + promotionalAmount,
          projectionOnly: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.create(promoRef, {
          promoKey: promoRef.id,
          amount: promotionalAmount,
          cashValue: 0,
          nonCash: true,
          nonTransferable: true,
          nonWithdrawable: true,
          developmentOnly: true,
          redeemedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return {projectionOnly: true, ownerType};
  },
);

function stripeClient() {
  const key = STRIPE_SECRET_KEY.value();
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe billing is not configured yet.",
    );
  }
  const environment = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  if (!["local", "staging", "production"].includes(environment)) {
    throw new HttpsError("failed-precondition", "Stripe environment is invalid.");
  }
  const liveKey = key.startsWith("sk_live_");
  if (environment !== "production" && liveKey) {
    throw new HttpsError(
      "failed-precondition",
      "Live Stripe credentials are disabled outside production.",
    );
  }
  if (environment === "production" && !liveKey) {
    throw new HttpsError(
      "failed-precondition",
      "Production Stripe credentials are not configured.",
    );
  }
  return new Stripe(key);
}

function scaledCircleEnvironment() {
  const value = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  if (!["local", "staging", "production"].includes(value)) {
    throw new HttpsError("failed-precondition", "Runtime environment is invalid.");
  }
  return value;
}

function publicAppBaseUrl() {
  if (scaledCircleEnvironment() === "local") {
    return String(process.env.PUBLIC_APP_BASE_URL || "http://127.0.0.1:5000")
      .replace(/\/$/, "");
  }
  return "https://scaledcircle.com";
}

function stripePriceForPlan(plan) {
  const prices = {
    starter: STRIPE_STARTER_PRICE_ID.value(),
    growth: STRIPE_GROWTH_PRICE_ID.value(),
    scale: STRIPE_SCALE_PRICE_ID.value(),
  };
  return prices[plan] || "";
}

function planForStripePrice(priceId) {
  const prices = {
    [STRIPE_STARTER_PRICE_ID.value()]: "starter",
    [STRIPE_GROWTH_PRICE_ID.value()]: "growth",
    [STRIPE_SCALE_PRICE_ID.value()]: "scale",
  };
  return prices[priceId] || null;
}

async function getOrCreateStripeCustomer(stripe, context) {
  const walletReference = db.collection("wallets").doc(context.uid);
  const walletSnapshot = await walletReference.get();
  const wallet = walletSnapshot.data() || {};
  const existingCustomerId = readText(wallet.stripeCustomerId, 120);
  if (existingCustomerId) return existingCustomerId;

  const authUser = await getAuth().getUser(context.uid);
  const customer = await stripe.customers.create({
    email: authUser.email || undefined,
    name: authUser.displayName || undefined,
    metadata: {firebaseUid: context.uid},
  });
  await walletReference.set({
    ownerId: context.uid,
    stripeCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return customer.id;
}

const STRIPE_CHECKOUT_SECRETS = [
  STRIPE_SECRET_KEY,
  STRIPE_STARTER_PRICE_ID,
  STRIPE_GROWTH_PRICE_ID,
  STRIPE_SCALE_PRICE_ID,
];

const STARTER_FREE_MONTH_PROMOTION_CODE = "SCALEDFREE99";
const STARTER_FREE_MONTH_COUPON_ID =
  "scaled_circle_starter_first_month_free_v1";

/**
 * Create the shareable first-month-free Starter promotion exactly once.
 * The coupon is restricted to the Starter product, so it cannot discount
 * wallet credits, campaign funding, platform fees, or Scaler compensation.
 */
exports.createStarterFreeMonthPromotion = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 2,
    secrets: [STRIPE_SECRET_KEY, STRIPE_STARTER_PRICE_ID],
  },
  async (request) => {
    const context = await authenticatedUserContext(
      request,
      "You must be logged in to create a promotion code.",
    );
    if (!context.isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Only a Scaled Circle administrator can create this promotion.",
      );
    }

    const starterPriceId = STRIPE_STARTER_PRICE_ID.value();
    if (!starterPriceId) {
      throw new HttpsError(
        "failed-precondition",
        "The Stripe Starter price is not configured.",
      );
    }

    const stripe = stripeClient();
    const existingCodes = await stripe.promotionCodes.list({
      code: STARTER_FREE_MONTH_PROMOTION_CODE,
      active: true,
      limit: 1,
    });
    if (existingCodes.data.length > 0) {
      return {
        code: existingCodes.data[0].code,
        promotionCodeId: existingCodes.data[0].id,
        created: false,
      };
    }

    const starterPrice = await stripe.prices.retrieve(starterPriceId);
    const starterProductId = typeof starterPrice.product === "string" ?
      starterPrice.product : starterPrice.product?.id;
    if (!starterProductId) {
      throw new HttpsError(
        "failed-precondition",
        "The Stripe Starter price is not attached to a product.",
      );
    }

    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(STARTER_FREE_MONTH_COUPON_ID);
      if (coupon.deleted) coupon = null;
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
      coupon = null;
    }
    if (!coupon) {
      coupon = await stripe.coupons.create({
        id: STARTER_FREE_MONTH_COUPON_ID,
        name: "Scaled Circle Starter - first month free",
        percent_off: 100,
        duration: "once",
        applies_to: {products: [starterProductId]},
        metadata: {
          purpose: "starter_first_month_free",
          workerPayDiscounted: "false",
        },
      });
    }

    let promotionCode;
    try {
      promotionCode = await stripe.promotionCodes.create({
        promotion: {type: "coupon", coupon: coupon.id},
        code: STARTER_FREE_MONTH_PROMOTION_CODE,
        active: true,
        restrictions: {first_time_transaction: true},
        metadata: {
          plan: "starter",
          duration: "first_month_only",
          createdBy: context.uid,
        },
      });
    } catch (error) {
      // A concurrent admin request may have created the same code first.
      const racedCodes = await stripe.promotionCodes.list({
        code: STARTER_FREE_MONTH_PROMOTION_CODE,
        active: true,
        limit: 1,
      });
      if (racedCodes.data.length === 0) throw error;
      promotionCode = racedCodes.data[0];
    }

    return {
      code: promotionCode.code,
      promotionCodeId: promotionCode.id,
      created: true,
    };
  },
);

/** Create a Stripe-hosted recurring subscription Checkout session. */
exports.createSubscriptionCheckoutSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: STRIPE_CHECKOUT_SECRETS,
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to subscribe.",
    );
    if (context.isAdmin) {
      return {...await grantAdminScaleSubscription(context.uid), url: null};
    }

    const walletSnapshot = await db.collection("wallets").doc(context.uid).get();
    const wallet = walletSnapshot.data() || {};
    const activeStripeSubscriptionId = readText(
      wallet.stripeSubscriptionId,
      120,
    );
    const subscriptionStatus = readText(
      wallet.subscriptionStatus,
      30,
    ).toLowerCase();
    if (
      activeStripeSubscriptionId &&
      ["active", "trialing", "past_due"].includes(subscriptionStatus)
    ) {
      throw new HttpsError(
        "already-exists",
        "An active Stripe subscription already exists. Use Manage Billing " +
          "to change or cancel it.",
      );
    }

    const plan = readText(request.data?.plan, 20).toLowerCase();
    if (!SUBSCRIPTION_PRICES[plan]) {
      throw new HttpsError("invalid-argument", "Choose a valid plan.");
    }
    const price = stripePriceForPlan(plan);
    if (!price) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe pricing for the ${plan} plan is not configured.`,
      );
    }

    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{price, quantity: 1}],
      allow_promotion_codes: true,
      success_url: `${publicAppBaseUrl()}/?billing=success`,
      cancel_url: `${publicAppBaseUrl()}/?billing=cancelled`,
      metadata: {firebaseUid: context.uid, purchaseType: "subscription", plan},
      subscription_data: {metadata: {firebaseUid: context.uid, plan}},
    });
    return {url: session.url, sessionId: session.id, plan, comped: false};
  },
);

/** Create a one-time Checkout session for wallet credits. */
exports.createCreditCheckoutSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to purchase credits.",
    );
    const credits = Number(request.data?.credits);
    if (!Number.isInteger(credits) || credits < 10 || credits > 10000) {
      throw new HttpsError(
        "invalid-argument",
        "Credit purchases must be a whole amount from 10 to 10,000.",
      );
    }

    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: credits * 100,
          product_data: {name: `${credits} Scaled Circle credits`},
        },
      }],
      success_url: `${publicAppBaseUrl()}/?credits=success`,
      cancel_url: `${publicAppBaseUrl()}/?credits=cancelled`,
      metadata: {
        firebaseUid: context.uid,
        purchaseType: "credits",
        credits: String(credits),
      },
    });
    return {url: session.url, sessionId: session.id, credits};
  },
);

exports.createBillingPortalSession = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const context = await requireVerifiedUser(
      request,
      "You must be logged in to manage billing.",
    );
    if (context.isAdmin) {
      return {...await grantAdminScaleSubscription(context.uid), url: null};
    }
    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, context);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${publicAppBaseUrl()}/`,
    });
    return {url: session.url};
  },
);

async function syncStripeSubscription(subscription, eventId) {
  const uid = cleanId(subscription.metadata?.firebaseUid);
  if (!uid) return;
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id || "";
  const plan = readText(subscription.metadata?.plan, 20) ||
    planForStripePrice(priceId);
  if (!plan || !SUBSCRIPTION_PRICES[plan]) return;
  const active = subscription.status === "active" ||
    subscription.status === "trialing";
  const periodEndSeconds = Number(firstItem?.current_period_end || 0);
  const expiration = periodEndSeconds > 0
    ? Timestamp.fromMillis(periodEndSeconds * 1000)
    : Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const eventReference = db.collection("stripeEvents").doc(eventId);
  const walletReference = db.collection("wallets").doc(uid);
  const subscriptionReference = db.collection("businessSubscriptions").doc(uid);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(eventReference)).exists) return;
    const values = {
      subscriptionPlan: plan,
      subscriptionPrice: SUBSCRIPTION_PRICES[plan],
      subscriptionStatus: active ? "active" : subscription.status,
      subscriptionExpiresAt: expiration,
      subscriptionComped: false,
      subscriptionSource: "stripe",
      stripeSubscriptionId: subscription.id,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(walletReference, {ownerId: uid, ...values}, {merge: true});
    transaction.set(subscriptionReference, {
      businessId: uid,
      plan,
      planId: plan,
      price: SUBSCRIPTION_PRICES[plan],
      status: active ? "active" : subscription.status,
      expiresAt: expiration,
      stripeSubscriptionId: subscription.id,
      source: "stripe",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    transaction.set(eventReference, {
      type: `customer.subscription.${subscription.status}`,
      processedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reserve worker compensation and charge the campaign platform fee.
 *
 * This operation is idempotent: retrying an already funded campaign returns
 * its existing funding values without charging the business twice.
 */
exports.fundCampaign = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    const authContext = await requireVerifiedUser(
      request,
      "You must be logged in to fund a campaign.",
    );

    const campaignId = request.data?.campaignId;

    if (typeof campaignId !== "string" || campaignId.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaignId is required.",
      );
    }

    const cleanCampaignId = campaignId.trim();
    const businessId = request.auth.uid;
    const description = typeof request.data?.description === "string"
      ? request.data.description.trim().slice(0, 240)
      : "Worker funding reserved for campaign.";
    const campaignReference = db
      .collection("campaigns")
      .doc(cleanCampaignId);
    const walletReference = db.collection("wallets").doc(businessId);
    const adminWalletReference = db
      .collection("wallets")
      .doc(ADMIN_WALLET_ID);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const campaignSnapshot = await transaction.get(campaignReference);
        const walletSnapshot = await transaction.get(walletReference);
        const adminWalletSnapshot = await transaction.get(
          adminWalletReference,
        );

        if (!campaignSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The campaign does not exist.",
          );
        }

        const campaign = campaignSnapshot.data() || {};

        if (campaign.businessId !== businessId) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this campaign.",
          );
        }

        const existingReservedBudget = Number(
          campaign.reservedWorkerBudget || 0,
        );
        const existingFundingStatus = campaign.fundingStatus;
        const workerBudget = Number(
          campaign.maximumWorkerBudget || campaign.workerBudget || 0,
        );
        const platformFee = authContext.isAdmin
          ? 0
          : Number((workerBudget * 0.10).toFixed(2));
        const totalCharge = Number(
          (workerBudget + platformFee).toFixed(2),
        );

        if (
          existingFundingStatus === "reserved" &&
          existingReservedBudget > 0
        ) {
          return {
            workerBudget: existingReservedBudget,
            platformFee: Number(campaign.platformFee || platformFee),
            totalCharge: Number(campaign.totalCampaignCost || totalCharge),
            alreadyFunded: true,
          };
        }

        if (!Number.isFinite(workerBudget) || workerBudget <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "Campaign worker budget must be greater than zero.",
          );
        }

        if (!walletSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Business wallet does not exist.",
          );
        }

        const wallet = walletSnapshot.data() || {};
        const subscriptionStatus = typeof wallet.subscriptionStatus === "string"
          ? wallet.subscriptionStatus.toLowerCase()
          : null;
        const subscriptionExpiration = wallet.subscriptionExpiresAt;
        const activeSubscription =
          subscriptionStatus === "active" &&
          subscriptionExpiration instanceof Timestamp &&
          subscriptionExpiration.toDate() > new Date();

        if (!activeSubscription) {
          throw new HttpsError(
            "failed-precondition",
            "An active subscription is required to publish campaigns.",
          );
        }

        const availableCredits = Number(wallet.availableCredits || 0);
        const reservedCredits = Number(wallet.reservedCredits || 0);

        if (!Number.isFinite(availableCredits) || availableCredits < totalCharge) {
          throw new HttpsError(
            "failed-precondition",
            "Insufficient credits. " +
              `${totalCharge.toFixed(2)} required, ` +
              `${availableCredits.toFixed(2)} available.`,
          );
        }

        const adminWallet = adminWalletSnapshot.data() || {};
        const adminBalance = Number(adminWallet.availableBalance || 0);
        const remainingCredits = availableCredits - totalCharge;
        const serverTimestamp = FieldValue.serverTimestamp();

        transaction.update(walletReference, {
          availableCredits: remainingCredits,
          reservedCredits: reservedCredits + workerBudget,
          balance: remainingCredits,
          updatedAt: serverTimestamp,
        });

        transaction.update(campaignReference, {
          fundingStatus: "reserved",
          platformFeeStatus: "charged",
          workerBudget,
          reservedWorkerBudget: workerBudget,
          platformFee,
          totalCampaignCost: totalCharge,
          fundedAt: serverTimestamp,
          updatedAt: serverTimestamp,
        });

        const transactionReference = walletReference
          .collection("transactions")
          .doc();

        transaction.set(transactionReference, {
          type: "campaign_reserve",
          amount: workerBudget,
          platformFee,
          totalCharge,
          campaignId: cleanCampaignId,
          description,
          createdAt: serverTimestamp,
        });

        transaction.set(
          adminWalletReference,
          {
            ownerId: ADMIN_WALLET_ID,
            ownerType: "admin",
            availableBalance: adminBalance + platformFee,
            balance: adminBalance + platformFee,
            updatedAt: serverTimestamp,
          },
          {merge: true},
        );

        return {
          workerBudget,
          platformFee,
          totalCharge,
          remainingCredits,
          alreadyFunded: false,
        };
      });

      logger.info("Campaign funding secured.", {
        businessId,
        campaignId: cleanCampaignId,
        workerBudget: result.workerBudget,
        platformFee: result.platformFee,
        alreadyFunded: result.alreadyFunded,
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Campaign funding failed.", {
        businessId,
        campaignId: cleanCampaignId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to fund the campaign right now.",
      );
    }
  },
);

/**
 * Permanently delete an unfunded draft and its setup records.
 * Launched or funded campaigns must be retained for payment and audit history.
 */
exports.deleteDraftCampaign = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to delete a draft campaign.",
      );
    }

    const campaignId = cleanId(request.data?.campaignId);

    if (!campaignId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaignId is required.",
      );
    }

    const campaignReference = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignReference.get();

    if (!campaignSnapshot.exists) {
      return {campaignId, alreadyDeleted: true};
    }

    const campaign = campaignSnapshot.data() || {};

    if (campaign.businessId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not own this campaign.",
      );
    }

    if (campaign.status !== "draft") {
      throw new HttpsError(
        "failed-precondition",
        "Only draft campaigns can be deleted.",
      );
    }

    if (campaign.fundingStatus === "reserved" ||
        moneyValue(campaign.reservedWorkerBudget) > 0) {
      throw new HttpsError(
        "failed-precondition",
        "This draft has reserved funding and cannot be deleted until funding is released.",
      );
    }

    const [
      zonesSnapshot,
      locationsSnapshot,
      assetsSnapshot,
      routesSnapshot,
      completionsSnapshot,
      applicationsSnapshot,
      assignedScalersSnapshot,
    ] = await Promise.all([
      db.collection("campaignZones").where("campaignId", "==", campaignId).get(),
      db.collection("campaignLocations").where("campaignId", "==", campaignId).get(),
      db.collection("marketingAssets").where("campaignId", "==", campaignId).get(),
      db.collection("campaignRoutes").where("campaignId", "==", campaignId).get(),
      db.collection("campaignCompletions").where("campaignId", "==", campaignId).get(),
      campaignReference.collection("applications").get(),
      campaignReference.collection("assignedScalers").get(),
    ]);
    const writer = db.bulkWriter();
    const relatedDocuments = [
      ...zonesSnapshot.docs,
      ...locationsSnapshot.docs,
      ...assetsSnapshot.docs,
      ...routesSnapshot.docs,
      ...completionsSnapshot.docs,
      ...applicationsSnapshot.docs,
      ...assignedScalersSnapshot.docs,
    ];

    for (const document of relatedDocuments) {
      writer.delete(document.ref);
    }

    writer.delete(campaignReference);
    await writer.close();

    return {
      campaignId,
      deletedRelatedRecords: relatedDocuments.length,
      alreadyDeleted: false,
    };
  },
);

/**
 * Create or update a verified campaign review.
 *
 * The server derives the reviewer role from campaign ownership and completed
 * assignments. Clients cannot review unrelated businesses or Scalers.
 */
exports.submitCampaignReview = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to leave a review.",
      );
    }

    const campaignId = cleanId(request.data?.campaignId);
    const targetId = cleanId(request.data?.targetId);
    const targetType = cleanId(request.data?.targetType).toLowerCase();
    const rating = Number(request.data?.rating);
    const comment = typeof request.data?.comment === "string"
      ? request.data.comment.trim().slice(0, 2000)
      : "";

    if (!campaignId || !targetId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid campaign and review target are required.",
      );
    }

    if (targetType !== "business" && targetType !== "scaler") {
      throw new HttpsError(
        "invalid-argument",
        "The review target must be a business or Scaler.",
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpsError(
        "invalid-argument",
        "Rating must be a whole number from 1 to 5.",
      );
    }

    if (!comment) {
      throw new HttpsError(
        "invalid-argument",
        "Please include a review comment.",
      );
    }

    const reviewerId = request.auth.uid;
    const campaignReference = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignReference.get();

    if (!campaignSnapshot.exists) {
      throw new HttpsError("not-found", "The campaign does not exist.");
    }

    const campaign = campaignSnapshot.data() || {};
    const businessId = cleanId(campaign.businessId);
    const [zonesSnapshot, locationsSnapshot] = await Promise.all([
      db.collection("campaignZones").where("campaignId", "==", campaignId).get(),
      db.collection("campaignLocations").where("campaignId", "==", campaignId).get(),
    ]);
    const paidAssignments = [
      ...zonesSnapshot.docs.map((document) => document.data()),
      ...locationsSnapshot.docs.map((document) => document.data()),
    ].filter((assignment) =>
      assignment.status === "completed" &&
      (assignment.paymentStatus === "paid" ||
        assignment.paidAt instanceof Timestamp),
    );
    const campaignPaymentSettled =
      campaign.fundingStatus === "settled" &&
      moneyValue(campaign.reservedWorkerBudget) <= 0;
    let reviewerType;

    if (targetType === "business") {
      const completedByReviewer = paidAssignments.some(
        (assignment) => cleanId(assignment.assignedScalerId) === reviewerId,
      ) || (campaignPaymentSettled &&
        cleanId(campaign.completedBy) === reviewerId);

      if (targetId !== businessId || !completedByReviewer) {
        throw new HttpsError(
          "permission-denied",
          "You can review the business after your campaign payment is released.",
        );
      }

      reviewerType = "scaler";
    } else {
      const completedByTarget = paidAssignments.some(
        (assignment) => cleanId(assignment.assignedScalerId) === targetId,
      ) || (campaignPaymentSettled &&
        cleanId(campaign.completedBy) === targetId);

      if (reviewerId !== businessId || !completedByTarget) {
        throw new HttpsError(
          "permission-denied",
          "You can review only a Scaler who completed your campaign work.",
        );
      }

      reviewerType = "business";
    }

    const reviewId = `${reviewerId}_${targetId}_${campaignId}`;
    const reviewReference = db.collection("reviews").doc(reviewId);
    const existingReview = await reviewReference.get();
    const timestamp = FieldValue.serverTimestamp();

    if (existingReview.exists) {
      throw new HttpsError(
        "already-exists",
        "This review has already been submitted and is permanently locked.",
      );
    }

    await reviewReference.create({
      campaignId,
      fromUserId: reviewerId,
      fromUserType: reviewerType,
      toUserId: targetId,
      toUserType: targetType,
      rating,
      comment,
      verifiedCampaignParticipant: true,
      locked: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      reviewId,
      locked: true,
    };
  },
);

/**
 * Report suspected fraud, scams, or safety concerns tied to a locked review.
 * Reports do not modify or remove the original review and must be filed within
 * 72 hours of review submission.
 */
exports.reportCampaignReview = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to report a review.",
      );
    }

    const reviewId = cleanId(request.data?.reviewId);
    const reason = cleanId(request.data?.reason).toLowerCase();
    const details = typeof request.data?.details === "string"
      ? request.data.details.trim().slice(0, 2000)
      : "";
    const allowedReasons = new Set([
      "suspected_fraud",
      "suspected_scam",
      "safety_concern",
      "other",
    ]);

    if (!reviewId || !allowedReasons.has(reason) || !details) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a report reason and include details.",
      );
    }

    const reviewReference = db.collection("reviews").doc(reviewId);
    const reviewSnapshot = await reviewReference.get();

    if (!reviewSnapshot.exists) {
      throw new HttpsError("not-found", "The review does not exist.");
    }

    const review = reviewSnapshot.data() || {};
    const reporterId = request.auth.uid;

    if (review.fromUserId !== reporterId && review.toUserId !== reporterId) {
      throw new HttpsError(
        "permission-denied",
        "Only the people involved in this review can report it.",
      );
    }

    if (!(review.createdAt instanceof Timestamp)) {
      throw new HttpsError(
        "failed-precondition",
        "The review report window is not available yet.",
      );
    }

    const reportWindowMilliseconds = 72 * 60 * 60 * 1000;
    const reportDeadline = review.createdAt.toMillis() +
      reportWindowMilliseconds;

    if (Date.now() > reportDeadline) {
      throw new HttpsError(
        "failed-precondition",
        "The 72-hour fraud and scam reporting window has closed.",
      );
    }

    const reportId = `${reviewId}_${reporterId}`;
    const reportReference = db.collection("reviewReports").doc(reportId);
    const existingReport = await reportReference.get();

    if (existingReport.exists) {
      return {reportId, alreadyReported: true};
    }

    await reportReference.create({
      reviewId,
      campaignId: review.campaignId,
      reporterId,
      reportedUserId: review.fromUserId === reporterId
        ? review.toUserId
        : review.fromUserId,
      reason,
      details,
      reviewRating: review.rating,
      reviewComment: review.comment,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
    });

    return {reportId, alreadyReported: false};
  },
);

/**
 * Submit GPS-backed zone work for business review.
 *
 * Route coverage and pending payout values are calculated on the trusted
 * server. The client supplies only the completion record identifier and notes.
 */
exports.submitZoneCompletion = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(
      request,
      "You must be logged in to submit campaign work.",
    );

    const completionId = cleanId(request.data?.completionId);
    const scalerNotes = typeof request.data?.scalerNotes === "string"
      ? request.data.scalerNotes.trim().slice(0, 2000)
      : "";

    if (!completionId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid completionId is required.",
      );
    }

    const scalerId = request.auth.uid;
    const completionReference = db
      .collection("campaignCompletions")
      .doc(completionId);

    try {
      return await db.runTransaction(async (transaction) => {
        const completionSnapshot = await transaction.get(
          completionReference,
        );

        if (!completionSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The completion record does not exist.",
          );
        }

        const completion = completionSnapshot.data() || {};

        if (completion.scalerId !== scalerId) {
          throw new HttpsError(
            "permission-denied",
            "This completion belongs to another Scaler.",
          );
        }

        if (completion.status === "submitted") {
          return {
            completionId,
            compensationContractId: completion.compensationContractId || completion.zoneId,
            calculatedTransferAmountCents:
              Number(completion.calculatedTransferAmountCents || 0),
            alreadySubmitted: true,
          };
        }

        const campaignId = cleanId(completion.campaignId);
        const businessId = cleanId(completion.businessId);
        const zoneId = cleanId(completion.zoneId);
        const routeId = cleanId(completion.routeId);

        if (!campaignId || !businessId || !zoneId || !routeId) {
          throw new HttpsError(
            "failed-precondition",
            "The completion is missing assignment or GPS information.",
          );
        }

        const campaignReference = db.collection("campaigns").doc(campaignId);
        const zoneReference = db.collection("campaignZones").doc(zoneId);
        const routeReference = db.collection("campaignRoutes").doc(routeId);
        const contractReference = db.collection("assignmentCompensations").doc(zoneId);

        const campaignSnapshot = await transaction.get(campaignReference);
        const zoneSnapshot = await transaction.get(zoneReference);
        const routeSnapshot = await transaction.get(routeReference);
        const contractSnapshot = await transaction.get(contractReference);

        if (!campaignSnapshot.exists ||
            !zoneSnapshot.exists ||
            !routeSnapshot.exists || !contractSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The campaign assignment or GPS route no longer exists.",
          );
        }

        const campaign = campaignSnapshot.data() || {};
        const zone = zoneSnapshot.data() || {};
        const route = routeSnapshot.data() || {};

        if (campaign.businessId !== businessId ||
            zone.businessId !== businessId ||
            zone.campaignId !== campaignId) {
          throw new HttpsError(
            "failed-precondition",
            "The completion does not match its campaign assignment.",
          );
        }

        if (zone.assignedScalerId !== scalerId) {
          throw new HttpsError(
            "permission-denied",
            "This zone is no longer assigned to you.",
          );
        }

        if (zone.settlementBlocked === true || zone.status === "failed_business") {
          throw new HttpsError(
            "failed-precondition",
            "This failed assignment is closed and cannot be submitted for normal payment.",
          );
        }

        if (route.scalerId !== scalerId ||
            route.campaignId !== campaignId ||
            route.zoneId !== zoneId) {
          throw new HttpsError(
            "failed-precondition",
            "The GPS route does not match this assigned zone.",
          );
        }

        if (route.tracking === true) {
          throw new HttpsError(
            "failed-precondition",
            "Stop and save GPS tracking before submitting.",
          );
        }

        const routePoints = validRoutePoints(route.points);

        if (routePoints.length < 2) {
          throw new HttpsError(
            "failed-precondition",
            "At least two saved GPS points are required.",
          );
        }

        const photoRequired = campaignRequiresPhotos(campaign.campaignType);

        if (photoRequired && !completionHasPhoto(completion)) {
          throw new HttpsError(
            "failed-precondition",
            "This field-service campaign requires photo proof.",
          );
        }

        const trackingResult = calculateRouteCompletion(zone, routePoints);
        const completionBasisPoints = Math.max(0, Math.min(
          10000, Math.round(trackingResult.completionPercentage * 100),
        ));
        const payoutResult = marketplace.payoutForCompletion(
          contractSnapshot.data() || {}, completionBasisPoints, false,
        );
        const timestamp = FieldValue.serverTimestamp();

        transaction.update(completionReference, {
          status: "submitted",
          scalerNotes,
          gpsVerified: true,
          gpsVerifiedAt: timestamp,
          proofRequirement: photoRequired
            ? "gps_and_photos"
            : "gps_route",
          assignedHomes: trackingResult.assignedHomes,
          completedHomes: trackingResult.completedHomes,
          completionPercentage: trackingResult.completionPercentage,
          eligibleForPayment: trackingResult.eligibleForPayment,
          compensationContractId: contractReference.id,
          calculatedBaseAmountCents: payoutResult.baseAmountCents,
          availableBonusAmountCents: contractSnapshot.data()?.bonusAmountCents || 0,
          calculatedBonusAmountCents: payoutResult.bonusAmountCents,
          calculatedTransferAmountCents: payoutResult.transferAmountCents,
          submittedAt: timestamp,
          updatedAt: timestamp,
        });

        transaction.update(zoneReference, {
          status: "submitted",
          verificationPassed: true,
          reviewStatus: "verification_pending",
          completionSubmittedAt: timestamp,
          submittedCompletionId: completionId,
          submittedAt: timestamp,
          submittedRoutePointCount: routePoints.length,
          submittedRouteSimulated: route.simulated === true,
          completedHomes: trackingResult.completedHomes,
          assignedHomes: trackingResult.assignedHomes,
          completionPercentage: trackingResult.completionPercentage,
          eligibleForPayment: trackingResult.eligibleForPayment,
          paymentStatus: "verification_pending",
          compensationContractId: contractReference.id,
          calculatedBaseAmountCents: payoutResult.baseAmountCents,
          availableBonusAmountCents: contractSnapshot.data()?.bonusAmountCents || 0,
          calculatedBonusAmountCents: payoutResult.bonusAmountCents,
          calculatedTransferAmountCents: payoutResult.transferAmountCents,
          gpsTracking: false,
          updatedAt: timestamp,
        });

        const notificationReference = db
          .collection("notifications")
          .doc(`zone_completion_${zoneId}`);
        const scalerLabel = request.auth.token.email || "A Scaler";

        transaction.set(notificationReference, {
          userId: businessId,
          type: "zone_completion_submitted",
          title: "Zone Completion Submitted",
          message: `${scalerLabel} submitted ${completion.zoneName || "Zone"}`,
          campaignId,
          zoneId,
          completionId,
          scalerId,
          payoutId: payoutReference.id,
          payoutAmount: payoutResult.totalPayout,
          read: false,
          createdAt: timestamp,
        }, {merge: true});

        return {
          completionId,
          payoutId: payoutReference.id,
          payoutAmount: payoutResult.totalPayout,
          completionPercentage: trackingResult.completionPercentage,
          alreadySubmitted: false,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Zone completion submission failed.", {
        completionId,
        scalerId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to submit the campaign completion right now.",
      );
    }
  },
);

/**
 * Approve a pending zone payout and move reserved business funds to the
 * Scaler's available balance.
 */
exports.approveZonePayout = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(
      request,
      "You must be logged in to approve a payout.",
    );

    const payoutId = cleanId(request.data?.payoutId);

    if (!payoutId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid payoutId is required.",
      );
    }

    const businessId = request.auth.uid;
    const releaseBonus = request.data?.releaseBonus === true;
    const payoutReference = db.collection("payouts").doc(payoutId);

    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutReference);

        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }

        const payout = payoutSnapshot.data() || {};

        if (payout.businessId !== businessId) {
          throw new HttpsError(
            "permission-denied",
            "You do not own this payout.",
          );
        }

        if (payout.status === "paid") {
          return {
            payoutId,
            amount: moneyValue(payout.totalPayout),
            alreadyPaid: true,
          };
        }

        if (payout.status !== "pending_review") {
          throw new HttpsError(
            "failed-precondition",
            "This payout is not awaiting review.",
          );
        }

        const scalerId = cleanId(payout.scalerId);
        const campaignId = cleanId(payout.campaignId);
        const zoneId = cleanId(payout.zoneId);
        const proposedPayout = moneyValue(payout.totalPayout);

        if (!scalerId || !campaignId || !zoneId) {
          throw new HttpsError(
            "failed-precondition",
            "This completion does not qualify for payment.",
          );
        }

        const businessWalletReference = db
          .collection("wallets")
          .doc(businessId);
        const scalerWalletReference = db.collection("wallets").doc(scalerId);
        const campaignReference = db.collection("campaigns").doc(campaignId);
        const zoneReference = db.collection("campaignZones").doc(zoneId);

        const businessWalletSnapshot = await transaction.get(
          businessWalletReference,
        );
        const scalerWalletSnapshot = businessId === scalerId
          ? businessWalletSnapshot
          : await transaction.get(scalerWalletReference);
        const campaignSnapshot = await transaction.get(campaignReference);
        const zoneSnapshot = await transaction.get(zoneReference);

        if (!businessWalletSnapshot.exists ||
            !campaignSnapshot.exists ||
            !zoneSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The funded campaign or wallet no longer exists.",
          );
        }

        const businessWallet = businessWalletSnapshot.data() || {};
        const scalerWallet = scalerWalletSnapshot.data() || {};
        const campaign = campaignSnapshot.data() || {};
        const zone = zoneSnapshot.data() || {};
        const completionPercentage = Math.max(
          0,
          Math.min(
            100,
            Number(
              payout.completionPercentage ?? zone.completionPercentage ?? 0,
            ),
          ),
        );
        const contractBasePay = firstMoneyValue(
          campaign.basePay,
          zone.assignedBasePay,
          zone.suggestedBasePay,
          payout.basePay,
        );
        const correctedBasePayout = calculatePayout({
          completionPercentage,
          basePay: contractBasePay,
          completionBonus: 0,
        });
        const basePayout = correctedBasePayout.basePayout;

        if (basePayout <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "This completion does not qualify for payment.",
          );
        }

        const reservedCredits = moneyValue(businessWallet.reservedCredits);
        const reservedBudget = moneyValue(campaign.reservedWorkerBudget);
        const availableBonus = moneyValue(campaign.bonus);
        const bonusEarnedAutomatically =
          completionPercentage >= AUTOMATIC_BONUS_COMPLETION_PERCENTAGE;
        const releasedBonus = bonusEarnedAutomatically || releaseBonus
          ? availableBonus
          : 0;
        const totalPayout = roundMoney(basePayout + releasedBonus);
        const fundedAmount = Math.min(reservedCredits, reservedBudget);

        if (reservedCredits < totalPayout || reservedBudget < totalPayout) {
          const fundingMessage = releaseBonus && fundedAmount >= basePayout
            ? "The base payment is funded, but the optional bonus is not. " +
              "Approve without the bonus or add campaign funding."
            : `Only $${fundedAmount.toFixed(2)} remains reserved for this ` +
              `campaign, but $${totalPayout.toFixed(2)} is required.`;

          throw new HttpsError(
            "failed-precondition",
            fundingMessage,
          );
        }

        const availableBalance = moneyValue(scalerWallet.availableBalance);
        const pendingBalance = moneyValue(scalerWallet.pendingBalance);
        const newAvailableBalance = availableBalance + totalPayout;
        const newPendingBalance = Math.max(0, pendingBalance - proposedPayout);
        const timestamp = FieldValue.serverTimestamp();

        if (businessId === scalerId) {
          transaction.set(businessWalletReference, {
            reservedCredits: Math.max(0, reservedCredits - totalPayout),
            totalPaidOut: FieldValue.increment(totalPayout),
            availableBalance: newAvailableBalance,
            pendingBalance: newPendingBalance,
            updatedAt: timestamp,
          }, {merge: true});
        } else {
          transaction.update(businessWalletReference, {
            reservedCredits: Math.max(0, reservedCredits - totalPayout),
            totalPaidOut: FieldValue.increment(totalPayout),
            updatedAt: timestamp,
          });
          transaction.set(scalerWalletReference, {
            ownerId: scalerId,
            ...(!scalerWalletSnapshot.exists ? {ownerType: "scaler"} : {}),
            availableBalance: newAvailableBalance,
            balance: newAvailableBalance,
            pendingBalance: newPendingBalance,
            ...(!scalerWalletSnapshot.exists ? {createdAt: timestamp} : {}),
            updatedAt: timestamp,
          }, {merge: true});
        }

        transaction.update(campaignReference, {
          reservedWorkerBudget: Math.max(0, reservedBudget - totalPayout),
          totalPaidOut: FieldValue.increment(totalPayout),
          fundingUpdatedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.update(payoutReference, {
          status: "paid",
          basePay: contractBasePay,
          basePayout,
          availableBonus,
          bonus: releasedBonus,
          totalPayout,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          approvedAt: timestamp,
          paidAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.update(zoneReference, {
          status: "completed",
          paymentStatus: "paid",
          basePayout,
          availableBonus,
          bonus: releasedBonus,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          payoutAmount: totalPayout,
          completedAt: timestamp,
          paidAt: timestamp,
          updatedAt: timestamp,
        });

        const completionId = cleanId(zoneSnapshot.data()?.submittedCompletionId);

        if (completionId) {
          transaction.update(
            db.collection("campaignCompletions").doc(completionId),
            {
              status: "approved",
              basePayout,
              availableBonus,
              bonus: releasedBonus,
              bonusReleased: releasedBonus > 0,
              bonusEarnedAutomatically,
              payoutAmount: totalPayout,
              approvedAt: timestamp,
              completedAt: timestamp,
              updatedAt: timestamp,
            },
          );
        }

        transaction.set(
          db.collection("walletTransactions").doc(payoutId),
          {
            type: "scaler_payment",
            payoutId,
            businessId,
            scalerId,
            campaignId,
            zoneId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            bonusReleased: releasedBonus > 0,
            bonusEarnedAutomatically,
            source: "reserved_credits",
            status: "completed",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          businessWalletReference
            .collection("transactions")
            .doc(`payout_${payoutId}_business`),
          {
            type: "reserved_payment",
            walletSide: "business",
            payoutId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            campaignId,
            zoneId,
            scalerId,
            description: "Scaler payment released from reserved campaign funds.",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          scalerWalletReference
            .collection("transactions")
            .doc(`payout_${payoutId}_scaler`),
          {
            type: "scaler_earnings",
            walletSide: "scaler",
            payoutId,
            amount: totalPayout,
            basePayout,
            bonus: releasedBonus,
            campaignId,
            zoneId,
            businessId,
            description: "Scaler earnings received from completed campaign work.",
            createdAt: timestamp,
          },
          {merge: true},
        );
        transaction.set(
          db.collection("notifications").doc(`payout_paid_${payoutId}`),
          {
            userId: scalerId,
            type: "payout_approved",
            title: "Campaign Payment Approved",
            message: `Your campaign payment of $${totalPayout.toFixed(2)} was approved.`,
            campaignId,
            zoneId,
            payoutId,
            amount: totalPayout,
            read: false,
            createdAt: timestamp,
          },
          {merge: true},
        );

        return {
          payoutId,
          amount: totalPayout,
          basePayout,
          bonus: releasedBonus,
          bonusReleased: releasedBonus > 0,
          bonusEarnedAutomatically,
          alreadyPaid: false,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error("Zone payout approval failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new HttpsError(
        "internal",
        "Unable to approve this payout right now.",
      );
    }
  },
);

/**
 * Return a pending zone completion to the assigned Scaler for correction.
 * Payment and campaign-zone workflow fields are server-controlled.
 */
exports.requestZoneRedo = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(request, "You must be logged in to review a payout.");
    const payoutId = cleanId(request.data?.payoutId);
    const feedback = String(request.data?.feedback || "").trim().slice(0, 2000);
    if (!payoutId || !feedback) {
      throw new HttpsError("invalid-argument", "Payout and review feedback are required.");
    }
    const businessId = request.auth.uid;
    const payoutRef = db.collection("payouts").doc(payoutId);
    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutRef);
        const payout = payoutSnapshot.data() || {};
        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }
        if (payout.businessId !== businessId) {
          throw new HttpsError("permission-denied", "You do not own this payout.");
        }
        if (payout.status === "redo_requested") {
          return {payoutId, status: "redo_requested", alreadyProcessed: true};
        }
        if (payout.status !== "pending_review") {
          throw new HttpsError("failed-precondition", "This payout cannot be returned for redo.");
        }
        const zoneId = cleanId(payout.zoneId);
        const scalerId = cleanId(payout.scalerId);
        if (!zoneId || !scalerId) {
          throw new HttpsError("failed-precondition", "The payout assignment is incomplete.");
        }
        const zoneRef = db.collection("campaignZones").doc(zoneId);
        const walletRef = db.collection("wallets").doc(scalerId);
        const [zoneSnapshot, walletSnapshot] = await Promise.all([
          transaction.get(zoneRef),
          transaction.get(walletRef),
        ]);
        if (!zoneSnapshot.exists || zoneSnapshot.data()?.businessId !== businessId ||
            zoneSnapshot.data()?.assignedScalerId !== scalerId) {
          throw new HttpsError("failed-precondition", "The zone assignment has changed.");
        }
        const pending = moneyValue(walletSnapshot.data()?.pendingBalance);
        const total = moneyValue(payout.totalPayout);
        const timestamp = FieldValue.serverTimestamp();
        transaction.set(walletRef, {
          pendingBalance: Math.max(0, pending - total),
          updatedAt: timestamp,
        }, {merge: true});
        transaction.update(payoutRef, {
          status: "redo_requested",
          reviewFeedback: feedback,
          updatedAt: timestamp,
        });
        transaction.update(zoneRef, {
          status: "in_progress",
          reviewFeedback: feedback,
          paymentStatus: "redo_requested",
          updatedAt: timestamp,
        });
        return {payoutId, status: "redo_requested", alreadyProcessed: false};
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Zone redo request failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "Unable to request changes right now.");
    }
  },
);

/**
 * Remove a Scaler from an unpaid zone. This transition is intentionally
 * unavailable to clients because it changes assignment and payout state.
 */
exports.dropZoneScaler = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    await requireVerifiedUser(request, "You must be logged in to review a payout.");
    const payoutId = cleanId(request.data?.payoutId);
    if (!payoutId) throw new HttpsError("invalid-argument", "A valid payout is required.");
    const businessId = request.auth.uid;
    const payoutRef = db.collection("payouts").doc(payoutId);
    try {
      return await db.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutRef);
        const payout = payoutSnapshot.data() || {};
        if (!payoutSnapshot.exists) {
          throw new HttpsError("not-found", "The payout does not exist.");
        }
        if (payout.businessId !== businessId) {
          throw new HttpsError("permission-denied", "You do not own this payout.");
        }
        if (payout.status === "scaler_dropped") {
          return {payoutId, status: "scaler_dropped", alreadyProcessed: true};
        }
        if (!['pending_review', 'redo_requested'].includes(String(payout.status))) {
          throw new HttpsError("failed-precondition", "This Scaler cannot be dropped now.");
        }
        const zoneId = cleanId(payout.zoneId);
        const scalerId = cleanId(payout.scalerId);
        if (!zoneId || !scalerId) {
          throw new HttpsError("failed-precondition", "The payout assignment is incomplete.");
        }
        const zoneRef = db.collection("campaignZones").doc(zoneId);
        const walletRef = db.collection("wallets").doc(scalerId);
        const [zoneSnapshot, walletSnapshot] = await Promise.all([
          transaction.get(zoneRef),
          transaction.get(walletRef),
        ]);
        if (!zoneSnapshot.exists || zoneSnapshot.data()?.businessId !== businessId ||
            zoneSnapshot.data()?.assignedScalerId !== scalerId) {
          throw new HttpsError("failed-precondition", "The zone assignment has changed.");
        }
        const pending = moneyValue(walletSnapshot.data()?.pendingBalance);
        const total = payout.status === "pending_review" ? moneyValue(payout.totalPayout) : 0;
        const timestamp = FieldValue.serverTimestamp();
        transaction.set(walletRef, {
          pendingBalance: Math.max(0, pending - total),
          updatedAt: timestamp,
        }, {merge: true});
        transaction.update(payoutRef, {
          status: "scaler_dropped",
          updatedAt: timestamp,
        });
        transaction.update(zoneRef, {
          status: "unassigned",
          assignedScalerId: FieldValue.delete(),
          assignedScalerEmail: FieldValue.delete(),
          assignedApplicationId: FieldValue.delete(),
          reviewFeedback: FieldValue.delete(),
          paymentStatus: "scaler_dropped",
          updatedAt: timestamp,
        });
        return {payoutId, status: "scaler_dropped", alreadyProcessed: false};
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Drop zone Scaler failed.", {
        payoutId,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "Unable to remove this Scaler right now.");
    }
  },
);

/**
 * Analyze a mapped campaign zone.
 *
 * Strategy:
 * 1. Read saved geometry.
 * 2. Query OpenStreetMap through Overpass.
 * 3. Prefer residential address count.
 * 4. Fall back to residential building count.
 * 5. Fall back to area-density estimate if OSM data is sparse.
 */
exports.analyzeCampaignZone = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to analyze a campaign zone.",
      );
    }

    const zoneId = request.data?.zoneId;

    if (
      typeof zoneId !== "string" ||
      zoneId.trim().length === 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid zoneId is required.",
      );
    }

    const cleanZoneId = zoneId.trim();

    const zoneReference = db
      .collection("campaignZones")
      .doc(cleanZoneId);

    try {
      const zoneSnapshot =
        await zoneReference.get();

      if (!zoneSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The requested campaign zone does not exist.",
        );
      }

      const zoneData =
        zoneSnapshot.data() || {};

      const businessId =
        typeof zoneData.businessId === "string"
          ? zoneData.businessId
          : "";

      if (
        businessId.length === 0 ||
        businessId !== request.auth.uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to analyze this zone.",
        );
      }

      const serviceArea = Array.isArray(
        zoneData.serviceArea,
      )
        ? zoneData.serviceArea
        : [];

      const validPoints = serviceArea.filter(
        (point) =>
          point &&
          typeof point === "object" &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude),
      );

      if (validPoints.length < 3) {
        throw new HttpsError(
          "failed-precondition",
          "The zone must contain at least three valid map points.",
        );
      }

      const serverWalkingEstimate =
        operations.calculateGeometryWalkingEstimate(validPoints);

      const areaSquareMeters =
        serverWalkingEstimate.areaSquareMeters;

      const areaAcres =
        areaSquareMeters / 4046.8564224;

      const areaSquareMiles =
        areaSquareMeters / 2589988.110336;

      const perimeterMeters =
        serverWalkingEstimate.perimeterMeters;

      const estimatedWalkingMiles = readNumber(
        zoneData.estimatedWalkingMiles,
      );

      const estimatedMinutes = readInteger(
        zoneData.estimatedMinutes,
      );

      // Zones are intentionally bounded for one Scaler. Parallel staffing is
      // optional, so the neutral server recommendation remains one unless a
      // future version has a separately reviewed scheduling policy.
      const recommendedScalerCount = 1;
      const suggestedBasePay = groupAssignment.recommendedWorkerPoolForMinutes(
        serverWalkingEstimate.estimatedWalkingMinutes,
      ) / 100;
      const serverZoneGeometryDigest =
        operations.zoneGeometryDigest(validPoints);

      await zoneReference.update({
        analysisStatus: "analyzing",
        homeCountStatus: "analyzing",
        homeCountError: FieldValue.delete(),
        analysisRequestedBy: request.auth.uid,
        analysisRequestedAt:
          FieldValue.serverTimestamp(),
        analysisUpdatedAt:
          FieldValue.serverTimestamp(),
      });

      let geographicResult;

      try {
        geographicResult =
          await analyzeResidentialGeography(
            validPoints,
          );
      } catch (error) {
        logger.warn(
          "Geographic housing lookup failed; using fallback estimate.",
          {
            zoneId: cleanZoneId,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );

        geographicResult = {
          addressCount: 0,
          residentialBuildingCount: 0,
          totalBuildingCount: 0,
          source: "overpass_failed",
        };
      }

      const homeEstimate =
        determineHomeEstimate({
          geographicResult,
          areaAcres,
        });

      await zoneReference.update({
        estimatedHomes:
          homeEstimate.estimatedHomes,

        homeCountStatus:
          homeEstimate.estimatedHomes > 0
            ? "estimated"
            : "unavailable",

        homeCountMethod:
          homeEstimate.method,

        homeCountConfidence:
          homeEstimate.confidence,

        homeCountConfidenceScore:
          homeEstimate.confidenceScore,

        geographicAddressCount:
          geographicResult.addressCount,

        geographicResidentialBuildingCount:
          geographicResult
            .residentialBuildingCount,

        geographicTotalBuildingCount:
          geographicResult.totalBuildingCount,

        geographicDataSource:
          geographicResult.source,

        homeCountError:
          FieldValue.delete(),

        analysisStatus:
          "complete",

        serverEstimatedWalkingMinutes:
          serverWalkingEstimate.estimatedWalkingMinutes,

        estimatedMinutes:
          serverWalkingEstimate.estimatedWalkingMinutes,

        estimatedWalkingMeters:
          serverWalkingEstimate.estimatedWalkingMeters,

        serverZoneMetricsVersion:
          serverWalkingEstimate.version,

        serverZoneGeometryDigest,

        analysisUpdatedAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      const response = {
        success: true,

        zoneId:
          cleanZoneId,

        analysisStatus:
          "complete",

        geometry: {
          pointCount:
            validPoints.length,

          shapeType:
            zoneData.serviceAreaType ||
            zoneData.shapeType ||
            "polygon",

          areaSquareMeters,
          areaAcres,
          areaSquareMiles,
          perimeterMeters,
        },

        workload: {
          estimatedWalkingMiles,
          estimatedMinutes: serverWalkingEstimate.estimatedWalkingMinutes,
          recommendedScalerCount,
          suggestedBasePay,
        },

        homes: {
          status:
            homeEstimate.estimatedHomes > 0
              ? "estimated"
              : "unavailable",

          estimatedHomes:
            homeEstimate.estimatedHomes,

          method:
            homeEstimate.method,

          confidence:
            homeEstimate.confidence,

          confidenceScore:
            homeEstimate.confidenceScore,

          addressCount:
            geographicResult.addressCount,

          residentialBuildingCount:
            geographicResult
              .residentialBuildingCount,

          totalBuildingCount:
            geographicResult.totalBuildingCount,

          source:
            geographicResult.source,
        },
      };

      logger.info(
        "Campaign zone geographic analysis completed.",
        {
          zoneId:
            cleanZoneId,

          businessId,

          pointCount:
            validPoints.length,

          areaAcres,

          addressCount:
            geographicResult.addressCount,

          residentialBuildingCount:
            geographicResult
              .residentialBuildingCount,

          estimatedHomes:
            homeEstimate.estimatedHomes,

          method:
            homeEstimate.method,

          confidence:
            homeEstimate.confidence,
        },
      );

      return response;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        "Campaign zone analysis failed.",
        {
          zoneId:
            cleanZoneId,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );

      try {
        await zoneReference.update({
          analysisStatus:
            "failed",

          homeCountStatus:
            "failed",

          homeCountError:
            error instanceof Error
              ? error.message
              : String(error),

          analysisUpdatedAt:
            FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        logger.error(
          "Unable to store zone analysis failure.",
          {
            zoneId:
              cleanZoneId,

            error:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
          },
        );
      }

      throw new HttpsError(
        "internal",
        "Unable to analyze the campaign zone.",
      );
    }
  },
);

function smartZoneAnchor(campaign = {}) {
  const points = Array.isArray(campaign.serviceArea) ? campaign.serviceArea.filter((item) =>
    Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)) : [];
  if (points.length < 3) return null;
  return {
    latitude: points.reduce((sum, item) => sum + item.latitude, 0) / points.length,
    longitude: points.reduce((sum, item) => sum + item.longitude, 0) / points.length,
  };
}

async function smartZoneSelectedArea(request, campaign) {
  let selection;
  try { selection = smartZoneEntryContract.normalizeAreaSelection(request.data?.areaSelection); }
  catch (_) { throw new HttpsError("invalid-argument", "Choose a valid campaign area."); }
  if (!selection) {
    const geometry = Array.isArray(campaign.serviceArea) ? campaign.serviceArea.filter((item) =>
      Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)) : [];
    if (geometry.length < 3) {
      throw new HttpsError("failed-precondition",
        "Search for a neighborhood, address, ZIP, or choose a saved Service Area.");
    }
    return {geometry,
      name: readText(campaign.serviceAreaTemplateName, 240) || "Selected campaign area",
      source: "saved_campaign_area", resultId: "", resolutionVersion: ""};
  }
  let resolution;
  try {
    resolution = await serviceAreaResolution.resolvePlace({query: selection.query, db,
      baseUrl: process.env.NOMINATIM_BASE_URL, tigerBase: process.env.TIGERWEB_BASE_URL,
      onCacheWriteError: (error) => logger.info("Campaign area cache write skipped.", {
        errorCode: String(error?.message || error).slice(0, 80),
    })});
    const selected = smartZoneEntryContract.selectResolvedArea(selection, resolution);
    if (selected.geometry.length >= 3) {
      return {...selected, source: "explicit_server_resolved_area",
        boundaryKind: "mapped_place_boundary"};
    }
    const desiredHours = Math.max(1, Math.min(192, Number(request.data?.desiredHours || 5)));
    const spanMeters = Math.max(450, Math.min(5000, 600 * Math.sqrt(desiredHours / 5)));
    return {...selected,
      geometry: smartZonePlanning.rectangleAround(selected.center, spanMeters, spanMeters),
      source: "explicit_server_resolved_address", boundaryKind: "around_address"};
  } catch (error) {
    if (["invalid_area_selection", "area_boundary_unavailable"].includes(error?.message)) {
      throw new HttpsError("failed-precondition",
        "That place does not have a usable mapped boundary. Choose another area or use Advanced Edit.");
    }
    if (error?.message === "rate_limited") {
      throw new HttpsError("resource-exhausted", "Map search is busy. Try again in a moment.");
    }
    throw new HttpsError("unavailable", "We couldn't map that area automatically.");
  }
}

async function smartZoneCampaign(request) {
  const context = await authenticatedUserContext(
    request, "Sign in as a Business to plan campaign Zones.");
  if (context.role !== "business") {
    throw new HttpsError("permission-denied", "Business access is required.");
  }
  const campaignId = readText(request.data?.campaignId, 160);
  if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
  const reference = db.collection("campaigns").doc(campaignId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
  const campaign = snapshot.data() || {};
  if (campaign.businessId !== context.uid) {
    throw new HttpsError("permission-denied", "This campaign does not belong to you.");
  }
  const entitlement = (await db.collection("businessSubscriptions")
    .doc(context.uid).get()).data();
  if (!subscriptionEntitlements.hasActivePaidBusinessEntitlement(entitlement)) {
    throw new HttpsError("permission-denied",
      "Smart Zone planning requires an active paid Business plan.");
  }
  if (String(campaign.status || "draft") !== "draft") {
    throw new HttpsError("failed-precondition", "Smart Zone planning is available before funding.");
  }
  const selectedArea = await smartZoneSelectedArea(request, campaign);
  const anchor = smartZoneAnchor({serviceArea: selectedArea.geometry});
  return {context, campaignId, reference, campaign, anchor, selectedArea,
    selectedBoundary: selectedArea.geometry,
    sourceAreaDigest: operations.zoneGeometryDigest(selectedArea.geometry)};
}

function smartZonePlanArguments(input, desiredHours, geographicSnapshot) {
  return {
    anchor: input.anchor,
    selectedBoundary: input.selectedBoundary,
    geographicSnapshot,
    desiredHours: desiredHours ?? 5,
    workType: readText(input.campaign.campaignType || input.campaign.type, 80) ||
      "field_distribution",
    totalWorkerPayCents: Math.round((Number(input.campaign.basePay || 0) +
      Number(input.campaign.bonus || 0)) * 100),
    label: readText(input.selectedArea?.name, 120) || "Recommended Area",
    sourceAreaDigest: input.sourceAreaDigest,
  };
}

async function generateSmartZonePlan(input, desiredHours) {
  const planningBoundary = smartZonePlanning.workloadBoundary({anchor: input.anchor,
    selectedBoundary: input.selectedBoundary, desiredHours: desiredHours ?? 5});
  const geographicSnapshot = await smartZoneGeography.fetchSnapshot({
    selectedBoundary: planningBoundary, endpoint: OVERPASS_URL});
  return {plan: smartZonePlanning.generatePlan(
    smartZonePlanArguments(input, desiredHours, geographicSnapshot)), geographicSnapshot};
}

exports.getSmartZonePlan = onCall(
  {enforceAppCheck: false, maxInstances: 10},
  async (request) => {
    const input = await smartZoneCampaign(request);
    try {
      return (await generateSmartZonePlan(input, request.data?.desiredHours)).plan;
    } catch (_) {
      throw new HttpsError("invalid-argument", "Choose a supported campaign workload.");
    }
  },
);

exports.applySmartZonePlan = onCall(
  {enforceAppCheck: false, maxInstances: 5},
  async (request) => {
    const input = await smartZoneCampaign(request);
    let plan;
    let geographicSnapshot;
    try {
      ({plan, geographicSnapshot} = await generateSmartZonePlan(input, request.data?.desiredHours));
    } catch (_) {
      throw new HttpsError("invalid-argument", "Choose a supported campaign workload.");
    }
    if (request.data?.planId !== plan.planId) {
      throw new HttpsError("failed-precondition", "The recommendation changed. Review it again.");
    }
    let preparedZones;
    try {
      preparedZones = plan.zones.map((zone) => {
        const geometryEstimate = operations.calculateGeometryWalkingEstimate(zone.geometry);
        operations.assertZoneDuration(geometryEstimate.estimatedWalkingMinutes);
        return {zone, geometryEstimate, reference: db.collection("campaignZones").doc()};
      });
    } catch (error) {
      logger.error("Smart Zone plan failed authoritative geometry validation.", {
        campaignId: input.campaignId,
        planId: plan.planId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("failed-precondition",
        "We couldn't apply this Smart Zone plan. Refresh the recommendation and try again.");
    }
    const result = await db.runTransaction(async (transaction) => {
      const currentCampaignSnapshot = await transaction.get(input.reference);
      const currentCampaign = currentCampaignSnapshot.data() || {};
      if (!currentCampaignSnapshot.exists || String(currentCampaign.status || "draft") !== "draft" ||
          currentCampaign.businessId !== input.context.uid) {
        throw new HttpsError("failed-precondition", "The campaign changed. Review the plan again.");
      }
      const currentInput = {...input, campaign: currentCampaign};
      const currentPlan = smartZonePlanning.generatePlan(
        smartZonePlanArguments(currentInput, request.data?.desiredHours, geographicSnapshot));
      if (currentPlan.planId !== plan.planId) {
        throw new HttpsError("failed-precondition", "The recommendation changed. Review it again.");
      }
      const existing = await transaction.get(db.collection("campaignZones")
        .where("campaignId", "==", input.campaignId));
      if (existing.docs.length && existing.docs.every((doc) =>
        doc.data()?.smartZonePlanId === plan.planId)) {
        return {success: true, campaignId: input.campaignId, planId: plan.planId,
          zoneCount: existing.docs.length, replay: true};
      }
      if (existing.docs.some((doc) => {
        const zone = doc.data() || {};
        return zone.assignedScalerId || !["", "unassigned"].includes(String(zone.status || ""));
      })) {
        throw new HttpsError("failed-precondition",
          "Existing assigned or active Zones cannot be replaced by a recommendation.");
      }
      for (const document of existing.docs) transaction.delete(document.ref);
      for (const {zone, geometryEstimate, reference} of preparedZones) transaction.set(reference, {
        campaignId: input.campaignId,
        businessId: currentCampaign.businessId,
        zoneName: zone.name,
        status: "unassigned",
        assignedScalerId: null,
        mapped: true,
        serviceArea: zone.geometry,
        serviceAreaType: zone.serviceability === "serviceable_geography" ?
          "serviceable_territory" : "basic_area_estimate",
        serviceAreaPointCount: zone.geometry.length,
        estimatedHomes: zone.workload.estimatedProperties,
        homeCountStatus: "estimated",
        homeCountMethod: "smart_zone_conservative_density_v1",
        homeCountConfidence: zone.workload.confidence,
        analysisStatus: "complete",
        estimatedWorkMinutes: zone.workload.estimatedMinutes,
        estimatedWorkHours: zone.workload.estimatedHours,
        workloadConfidence: zone.workload.confidence,
        workability: zone.workability,
        smartZonePlanId: plan.planId,
        smartZonePolicyVersion: plan.policyVersion,
        smartZoneGeometryVersion: plan.geometryVersion,
        smartZoneServiceabilityMode: plan.serviceabilityMode,
        serverEstimatedWalkingMinutes: geometryEstimate.estimatedWalkingMinutes,
        estimatedMinutes: geometryEstimate.estimatedWalkingMinutes,
        estimatedWalkingMeters: geometryEstimate.estimatedWalkingMeters,
        serverZoneMetricsVersion: geometryEstimate.version,
        serverZoneGeometryDigest: operations.zoneGeometryDigest(zone.geometry),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(input.reference, {
      serviceArea: input.selectedBoundary,
      serviceAreaPointCount: input.selectedBoundary.length,
      serviceAreaType: input.selectedArea.boundaryKind === "around_address" ?
        "server_resolved_address_area" : "server_resolved_campaign_area",
      serviceAreaTemplateName: input.selectedArea.name,
      serviceAreaResolutionSource: input.selectedArea.resolutionSource || input.selectedArea.source,
      serviceAreaResolutionVersion: input.selectedArea.resolutionVersion || null,
      serviceAreaResultId: input.selectedArea.resultId || null,
      estimatedHomes: plan.totalEstimatedProperties,
      smartZonePlanId: plan.planId,
      smartZonePolicyVersion: plan.policyVersion,
      recommendedScalerCount: plan.recommendedScalerCount,
      updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {success: true, campaignId: input.campaignId, planId: plan.planId,
        zoneCount: plan.zones.length, replay: false};
    });
    return result;
  },
);

/** Server-authoritative, industry-neutral property/housing-stock analysis. */
exports.analyzePropertyIntelligence = onCall(
  {enforceAppCheck: false, maxInstances: 4, timeoutSeconds: 60, memory: "512MiB", secrets: [CENSUS_API_KEY]},
  async (request) => {
    const context = await authenticatedUserContext(request,
      "You must be logged in to use Property Intelligence.");
    try { propertyIntelligence.assertBusinessAccess({uid: context.uid, role: context.role,
      isAdmin: context.isAdmin, businessId: context.uid}); }
    catch (_) { throw new HttpsError("permission-denied", "Property Intelligence is available to Business accounts."); }
    // businessSubscriptions is the trusted billing entitlement. The wallet is
    // only a client-readable projection and request payload fields are never
    // consulted. This check intentionally precedes zone/cache/provider work.
    const entitlementSnapshot = await db.collection("businessSubscriptions")
      .doc(context.uid).get();
    if (!subscriptionEntitlements.hasActiveScaleEntitlement(
      entitlementSnapshot.data(),
    )) {
      throw new HttpsError(
        "permission-denied",
        "Property Intelligence requires an active Scale subscription.",
      );
    }
    const zoneId = readText(request.data?.zoneId, 160);
    const exploratoryGeometry = request.data?.geometry;
    if (!zoneId && !Array.isArray(exploratoryGeometry)) {
      throw new HttpsError("invalid-argument", "A valid zone or exploratory analysis area is required.");
    }
    let zoneReference = null;
    let geometry;
    if (zoneId) {
      zoneReference = db.collection("campaignZones").doc(zoneId);
      const zoneSnapshot = await zoneReference.get();
      if (!zoneSnapshot.exists) throw new HttpsError("not-found", "The campaign zone does not exist.");
      const zone = zoneSnapshot.data() || {};
      try { propertyIntelligence.assertBusinessAccess({uid: context.uid, role: context.role,
        isAdmin: context.isAdmin, businessId: zone.businessId}); }
      catch (_) { throw new HttpsError("permission-denied", "You do not own this campaign zone."); }
      try { geometry = propertyIntelligence.validateGeometry(zone.serviceArea); }
      catch (_) { throw new HttpsError("failed-precondition", "Save a valid campaign area before requesting Property Intelligence."); }
    } else {
      try { geometry = propertyIntelligence.validateGeometry(exploratoryGeometry); }
      catch (_) { throw new HttpsError("invalid-argument", "Draw a valid analysis area before requesting Property Intelligence."); }
    }
    const digest = propertyIntelligence.geometryDigest(geometry);
    const addPhysicalChannelSuitability = (value) => {
      const walking = operations.calculateGeometryWalkingEstimate(geometry);
      const homes = Number(value?.residentialStructureCount || value?.propertyCount || 0);
      const areaSquareKm = walking.areaSquareMeters / 1000000;
      const logisticsSignals = {
        homesPerSquareKm: homes > 0 && areaSquareKm > 0 ? homes / areaSquareKm : null,
        averagePropertySpacingMeters: homes > 0 ? Math.sqrt(walking.areaSquareMeters / homes) : null,
        walkingMinutesPerReachableAddress: homes > 0 ? walking.estimatedWalkingMinutes / homes : null,
        // Lot size and access are deliberately unavailable until an authoritative source supplies them.
        accessStatus: "unknown",
      };
      return {...value, physicalLogisticsVersion: "PropertyPhysicalLogisticsV1",
        physicalLogistics: logisticsSignals,
        physicalChannelSuitability: managedGrowth.evaluatePhysicalChannelSuitability(logisticsSignals)};
    };
    const cacheId = crypto.createHash("sha256").update(`${propertyIntelligence.ANALYSIS_VERSION}:${propertyIntelligence.DATA_SOURCE_BUNDLE_VERSION}:${digest}`).digest("hex");
    const cacheReference = db.collection(PROPERTY_INTELLIGENCE_CACHE_COLLECTION).doc(cacheId);
    const cacheSnapshot = await cacheReference.get();
    const cached = cacheSnapshot.data() || {};
    if (propertyIntelligence.cacheIsReusable(cached, {digest})) {
      if (zoneReference) {
        await zoneReference.update({propertyIntelligenceCacheId: cacheId,
          propertyIntelligenceGeometryDigest: digest, propertyIntelligenceStatus: "complete",
          propertyIntelligenceSummary: cached.analysis,
          propertyIntelligenceUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      }
      const cachedAnalysis = addPhysicalChannelSuitability(cached.analysis);
      return {success: true, zoneId: zoneId || null, analysisScope: zoneId ? "campaign_zone" : "exploratory",
        cached: true, analysis: cachedAnalysis,
        aiContext: propertyIntelligence.aiGrounding(cachedAnalysis, request.data?.objective)};
    }
    const providers = [new propertyIntelligence.MarylandPropertyProvider(),
      new propertyIntelligence.CensusPropertyProvider({apiKey: CENSUS_API_KEY.value() || ""})];
    const analysis = await propertyIntelligence.analyzeWithFallback({geometry, providers});
    const sanitized = addPhysicalChannelSuitability({...analysis, analysisId: cacheId,
      geometryDigest: digest, generatedAt: new Date().toISOString()});
    delete sanitized.providerFailures;
    await cacheReference.set({analysisVersion: propertyIntelligence.ANALYSIS_VERSION,
      dataSourceBundleVersion: propertyIntelligence.DATA_SOURCE_BUNDLE_VERSION,
      geometryDigest: digest, source: sanitized.source, sourceVersion: sanitized.sourceVersion,
      generatedAt: FieldValue.serverTimestamp(), analysis: sanitized});
    if (zoneReference) {
      await zoneReference.update({propertyIntelligenceCacheId: cacheId,
        propertyIntelligenceGeometryDigest: digest, propertyIntelligenceStatus: sanitized.confidence === "INSUFFICIENT" ? "unavailable" : "complete",
        propertyIntelligenceSummary: sanitized, propertyIntelligenceUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    }
    return {success: true, zoneId: zoneId || null, analysisScope: zoneId ? "campaign_zone" : "exploratory",
      cached: false, analysis: sanitized,
      aiContext: propertyIntelligence.aiGrounding(sanitized, request.data?.objective)};
  },
);

async function requireTrustedBetaAdmin(request) {
  const context = await authenticatedUserContext(
    request,
    "You must be logged in to manage beta entitlements.",
  );
  try {
    internalBetaEntitlements.assertTrustedAdminActor(context);
  } catch (_) {
    throw new HttpsError(
      "permission-denied",
      "Trusted administrator access is required.",
    );
  }
  return context;
}

function internalBetaHttpsError(error) {
  const code = String(error?.message || "");
  if (["exactly_one_beta_target_required", "unsupported_internal_beta_plan",
    "unsupported_internal_entitlement_source", "internal_beta_reason_required",
    "finite_internal_beta_expiry_required"].includes(code)) {
    return new HttpsError("invalid-argument", code.replaceAll("_", " "));
  }
  if (code === "internal_beta_business_not_found") {
    return new HttpsError("not-found", "The requested Business account was not found.");
  }
  if (code === "internal_beta_target_not_business" ||
      code === "internal_beta_target_email_unverified" ||
      code === "internal_beta_entitlement_not_found") {
    return new HttpsError("failed-precondition", code.replaceAll("_", " "));
  }
  return new HttpsError("internal", "Unable to update the beta entitlement.");
}

/** Grants a finite, auditable, non-paid beta entitlement to a real Business. */
exports.grantInternalBetaEntitlement = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const adminContext = await requireTrustedBetaAdmin(request);
    try {
      return await internalBetaEntitlementService.grant(request.data, adminContext);
    } catch (error) {
      throw internalBetaHttpsError(error);
    }
  },
);

/** Revokes internal-beta authority without touching Stripe-paid authority. */
exports.revokeInternalBetaEntitlement = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const adminContext = await requireTrustedBetaAdmin(request);
    try {
      return await internalBetaEntitlementService.revoke(request.data, adminContext);
    } catch (error) {
      throw internalBetaHttpsError(error);
    }
  },
);

function adminOperationsHttpsError(error) {
  const code = String(error?.message || "");
  if (code === "trusted_admin_required") {
    return new HttpsError("permission-denied", "Verified administrator authority is required.");
  }
  if (["exactly_one_admin_target_required", "invalid_admin_role_action",
    "admin_role_reason_required", "invalid_admin_issue"].includes(code)) {
    return new HttpsError("invalid-argument", code.replaceAll("_", " "));
  }
  if (["target_email_unverified", "last_admin_demotion_forbidden",
    "verified_replacement_admin_required"].includes(code)) {
    return new HttpsError("failed-precondition", code.replaceAll("_", " "));
  }
  if (["target_auth_user_not_found", "target_profile_not_found"].includes(code)) {
    return new HttpsError("not-found", "The requested application account was not found.");
  }
  return new HttpsError("internal", "Unable to complete the administrator operation.");
}

async function requireTrustedAdmin(request) {
  const context = await authenticatedUserContext(
    request,
    "You must be logged in to use administrator operations.",
  );
  try {
    return adminOperations.assertTrustedAdmin(context);
  } catch (error) {
    throw adminOperationsHttpsError(error);
  }
}

/** Promotes or demotes an application administrator with last-admin protection. */
exports.setApplicationAdminRole = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const actor = await requireTrustedAdmin(request);
    try {
      return await adminOperationsService.setAdminRole(request.data, actor);
    } catch (error) {
      throw adminOperationsHttpsError(error);
    }
  },
);

/** Records evidence that a replacement administrator reached the Admin Dashboard. */
exports.confirmAdminLoginReadiness = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const actor = await requireTrustedAdmin(request);
    try {
      return await adminOperationsService.confirmAdminLogin(actor);
    } catch (error) {
      throw adminOperationsHttpsError(error);
    }
  },
);

/** Creates a deduplicated administrator issue and, when actionable, a queued alert. */
exports.createAdminIssue = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireTrustedAdmin(request);
    try {
      return await adminOperationsService.createIssue(request.data, actor);
    } catch (error) {
      throw adminOperationsHttpsError(error);
    }
  },
);

function adminOpsReadHttpsError(error) {
  const code = String(error?.message || "");
  if (code === "trusted_admin_required") {
    return new HttpsError("permission-denied", "Verified administrator authority is required.");
  }
  if (["campaign_id_required", "invalid_support_status_update"].includes(code)) {
    return new HttpsError("invalid-argument", "A valid operational request is required.");
  }
  if (["campaign_not_found", "support_case_not_found"].includes(code)) {
    return new HttpsError("not-found", "The requested operational record was not found.");
  }
  if (code === "invalid_support_status_transition") {
    return new HttpsError("failed-precondition", "This support-case transition is not allowed.");
  }
  return new HttpsError("internal", "Unable to load operational status. Please try again.");
}

exports.getAdminOperationsOverview = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    await requireTrustedAdmin(request);
    try {
      return await adminOpsReadService.getOverview();
    } catch (error) {
      throw adminOpsReadHttpsError(error);
    }
  },
);

exports.getAdminCampaignTimeline = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    await requireTrustedAdmin(request);
    try {
      return await adminOpsReadService.getCampaignTimeline(request.data?.campaignId);
    } catch (error) {
      throw adminOpsReadHttpsError(error);
    }
  },
);

exports.updateAdminSupportCaseStatus = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const actor = await requireTrustedAdmin(request);
    try {
      return await adminOpsReadService.updateSupportCaseStatus(request.data, actor);
    } catch (error) {
      throw adminOpsReadHttpsError(error);
    }
  },
);

function isLocalScaleIntelligenceEmulator() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  return process.env.FUNCTIONS_EMULATOR === "true" &&
    process.env.APP_ENV === "local" && projectId === "demo-scaledcircle" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099" &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
    process.env.FUNCTIONS_EMULATOR_HOST === "127.0.0.1:5001" &&
    process.env.FIREBASE_STORAGE_EMULATOR_HOST === "127.0.0.1:9199";
}

function localIntelligenceTrace() {
  const enabled = isLocalScaleIntelligenceEmulator();
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  const milestones = [];
  return {
    mark(milestone) {
      if (!enabled) return;
      const entry = {correlationId, milestone, elapsedMs: Date.now() - startedAt};
      milestones.push(entry);
      logger.info("Scale Intelligence local milestone.", entry);
    },
    diagnostics() {
      return enabled ? {correlationId, milestones: [...milestones]} : undefined;
    },
  };
}

async function requireScaleIntelligenceBusiness(request, trace) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to use Scale Intelligence.");
  }
  trace.mark("AUTH_VERIFIED");
  const context = await authenticatedUserContext(
    request,
    "You must be logged in to use Scale Intelligence.",
  );
  trace.mark("BUSINESS_ID_RESOLVED");
  if (context.role !== "business" && !context.isAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Scale Intelligence is available to Business accounts.",
    );
  }
  trace.mark("SCALE_ENTITLEMENT_READ_START");
  const entitlementSnapshot = await db.collection("businessSubscriptions")
    .doc(context.uid).get();
  trace.mark("SCALE_ENTITLEMENT_READ_END");
  const entitlement = entitlementSnapshot.data();
  if (entitlement?.source === "local_staging_synthetic" &&
      !isLocalScaleIntelligenceEmulator()) {
    throw new HttpsError(
      "permission-denied",
      "Synthetic staging entitlements are local-only.",
    );
  }
  if (!subscriptionEntitlements.hasActiveScaleEntitlement(
    entitlement,
  )) {
    throw new HttpsError(
      "permission-denied",
      "AI Intelligence requires an active Scale subscription.",
    );
  }
  trace.mark("SCALE_ENTITLEMENT_VERIFIED");
  return context;
}

function assertScaleIntelligenceRuntimeIsolation() {
  if (process.env.FUNCTIONS_EMULATOR !== "true") return;
  if (!isLocalScaleIntelligenceEmulator()) {
    throw new HttpsError(
      "failed-precondition",
      "Local Scale Intelligence requires the isolated demo Firebase emulators.",
    );
  }
}

function intelligenceRateLimitReferences(uid, nowMillis = Date.now()) {
  const windows = scaledCircleIntelligence.rateLimitWindows(nowMillis);
  const uidHash = crypto.createHash("sha256").update(uid).digest("hex").slice(0, 32);
  return {
    windows,
    uidHash,
    tenMinuteReference: db.collection("intelligenceRateLimits")
      .doc(`${uidHash}_ten_${windows.tenMinute}`),
    dayReference: db.collection("intelligenceRateLimits")
      .doc(`${uidHash}_day_${windows.day}`),
  };
}

function assertIntelligenceRateLimitCounts(tenMinuteCount, dayCount) {
  if (tenMinuteCount >= scaledCircleIntelligence.MAX_REQUESTS_PER_TEN_MINUTES ||
      dayCount >= scaledCircleIntelligence.MAX_REQUESTS_PER_DAY) {
    throw new HttpsError(
      "resource-exhausted",
      "The Scale Intelligence request limit was reached. Try again later.",
    );
  }
}

async function validateIntelligenceRateLimit(uid, nowMillis = Date.now()) {
  const {tenMinuteReference, dayReference} = intelligenceRateLimitReferences(uid, nowMillis);
  const [tenMinuteSnapshot, daySnapshot] = await Promise.all([
    tenMinuteReference.get(), dayReference.get(),
  ]);
  assertIntelligenceRateLimitCounts(
    Number(tenMinuteSnapshot.data()?.count || 0),
    Number(daySnapshot.data()?.count || 0),
  );
}

async function consumeIntelligenceRateLimit(uid, nowMillis = Date.now()) {
  const {windows, uidHash, tenMinuteReference, dayReference} =
    intelligenceRateLimitReferences(uid, nowMillis);
  await db.runTransaction(async (transaction) => {
    const [tenMinuteSnapshot, daySnapshot] = await Promise.all([
      transaction.get(tenMinuteReference), transaction.get(dayReference),
    ]);
    const tenMinuteCount = Number(tenMinuteSnapshot.data()?.count || 0);
    const dayCount = Number(daySnapshot.data()?.count || 0);
    assertIntelligenceRateLimitCounts(tenMinuteCount, dayCount);
    const metadata = {
      policyVersion: scaledCircleIntelligence.RATE_LIMIT_POLICY_VERSION,
      uidHash,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(tenMinuteReference, {...metadata, count: tenMinuteCount + 1,
      expiresAt: Timestamp.fromMillis((windows.tenMinute + 2) * 10 * 60 * 1000)}, {merge: true});
    transaction.set(dayReference, {...metadata, count: dayCount + 1,
      expiresAt: Timestamp.fromMillis((windows.day + 2) * 24 * 60 * 60 * 1000)}, {merge: true});
  });
}

async function loadAuthoritativePropertyIntelligence(analysisId, geometryDigest) {
  if (!/^[a-f0-9]{64}$/i.test(analysisId)) {
    throw new HttpsError("invalid-argument", "A valid Property Intelligence analysis is required.");
  }
  const snapshot = await db.collection(PROPERTY_INTELLIGENCE_CACHE_COLLECTION)
    .doc(analysisId).get();
  const cached = snapshot.data() || {};
  if (!snapshot.exists || !cached.analysis) {
    throw new HttpsError("not-found", "The Property Intelligence analysis was not found.");
  }
  if (geometryDigest && cached.geometryDigest !== geometryDigest) {
    throw new HttpsError("failed-precondition", "The Property Intelligence geometry has changed.");
  }
  return propertyIntelligence.aiGrounding(cached.analysis).knownData;
}

/**
 * Shared Scale-plan AI interpretation for authoritative Property and Weather
 * Intelligence. The model is advisory and cannot mutate campaigns or finance.
 */
exports.analyzeScaleIntelligence = onCall(
  {enforceAppCheck: false, maxInstances: 4, timeoutSeconds: 30, memory: "512MiB",
    secrets: [OPENAI_API_KEY]},
  async (request) => {
    const trace = localIntelligenceTrace();
    trace.mark("CALLABLE_ENTRY");
    assertScaleIntelligenceRuntimeIsolation();
    trace.mark("LOCAL_ENV_GUARD_PASSED");
    const business = await requireScaleIntelligenceBusiness(request, trace);
    const mode = readText(request.data?.mode, 40).toLowerCase();
    if (!["property", "weather", "combined"].includes(mode)) {
      throw new HttpsError("invalid-argument", "Choose Property, Weather, or Combined intelligence.");
    }
    trace.mark("REQUEST_MODE_VALIDATED");

    let propertyFacts = null;
    let weatherFacts = null;
    if (mode === "property" || mode === "combined") {
      trace.mark("PROPERTY_ANALYSIS_LOOKUP_START");
      propertyFacts = await loadAuthoritativePropertyIntelligence(
        readText(request.data?.analysisId, 80),
        readText(request.data?.geometryDigest, 80),
      );
      trace.mark("PROPERTY_ANALYSIS_LOOKUP_END");
    }
    if (mode === "weather" || mode === "combined") {
      trace.mark("WEATHER_CONTEXT_BUILD_START");
      const latitude = Number(request.data?.latitude);
      const longitude = Number(request.data?.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new HttpsError("invalid-argument", "A valid Weather Intelligence location is required.");
      }
      weatherFacts = propertyIntelligence.sanitizeWeatherIntelligence(
        await loadWeatherOpportunityFeed({latitude, longitude}),
      );
      trace.mark("WEATHER_CONTEXT_BUILD_END");
    }

    let intelligenceContext;
    try {
      trace.mark("PROPERTY_CONTEXT_BUILD_START");
      intelligenceContext = scaledCircleIntelligence.buildContext({
        mode,
        objective: request.data?.businessObjective,
        question: request.data?.question,
        propertyIntelligence: propertyFacts,
        weatherIntelligence: weatherFacts,
      });
      trace.mark("PROPERTY_CONTEXT_BUILD_END");
    } catch (error) {
      throw new HttpsError("invalid-argument", "The Scale Intelligence request is malformed.");
    }
    const cacheId = scaledCircleIntelligence.cacheIdentity(intelligenceContext);
    const cacheReference = db.collection("intelligenceAnalysisCache").doc(cacheId);
    trace.mark("CACHE_LOOKUP_START");
    const cacheSnapshot = await cacheReference.get();
    trace.mark("CACHE_LOOKUP_END");
    const cache = cacheSnapshot.data() || {};
    const generatedAtMillis = cache.generatedAt instanceof Timestamp ?
      cache.generatedAt.toMillis() : 0;
    if (cache.result && Date.now() - generatedAtMillis >= 0 &&
        Date.now() - generatedAtMillis < 7 * 24 * 60 * 60 * 1000) {
      trace.mark("CALLABLE_RETURN");
      return {...cache.result, cached: true,
        localDiagnostics: trace.diagnostics()};
    }

    if (request.data?.localPreflight === true) {
      if (!isLocalScaleIntelligenceEmulator()) {
        throw new HttpsError("permission-denied", "Local preflight is unavailable.");
      }
      trace.mark("RATE_LIMIT_START");
      await validateIntelligenceRateLimit(business.uid);
      trace.mark("RATE_LIMIT_END");
      trace.mark("CALLABLE_RETURN");
      return {
        readyForProvider: true,
        mode,
        propertyContextReady: propertyFacts !== null,
        entitlementVerified: true,
        environmentVerified: true,
        localDiagnostics: trace.diagnostics(),
      };
    }

    trace.mark("RATE_LIMIT_START");
    await consumeIntelligenceRateLimit(business.uid);
    trace.mark("RATE_LIMIT_END");
    const apiKey = OPENAI_API_KEY.value();
    trace.mark("SECRET_BINDING_READY");
    if (!apiKey) {
      return {status: "temporarily_unavailable", cached: false,
        message: "AI analysis is temporarily unavailable.",
        knownData: intelligenceContext.componentSignals};
    }

    try {
      trace.mark("OPENAI_CLIENT_CREATE_START");
      const transport = scaledCircleIntelligence.createOpenAITransport({apiKey});
      trace.mark("OPENAI_CLIENT_CREATE_END");
      trace.mark("OPENAI_REQUEST_START");
      const result = await scaledCircleIntelligence.analyzeSafely(
        intelligenceContext,
        {transport: async (context) => transport(context, {
          onMilestone: (milestone) => trace.mark(milestone),
        })},
      );
      if (result.status !== "complete") return {...result, cached: false};
      const storedResult = {...result, cacheId};
      trace.mark("CACHE_WRITE_START");
      await cacheReference.set({
        businessId: business.uid,
        mode,
        model: result.model,
        modelSnapshot: result.modelSnapshot,
        modelConfigVersion: result.modelConfigVersion,
        promptVersion: result.promptVersion,
        contextVersion: result.contextVersion,
        responseSchemaVersion: result.responseSchemaVersion,
        usage: result.usage,
        generatedAt: FieldValue.serverTimestamp(),
        result: storedResult,
      });
      trace.mark("CACHE_WRITE_END");
      trace.mark("CALLABLE_RETURN");
      return {...storedResult, cached: false,
        localDiagnostics: trace.diagnostics()};
    } catch (error) {
      logger.warn("Scale Intelligence provider unavailable.", {
        uid: business.uid,
        mode,
        cacheId,
        errorCode: error instanceof Error ? error.message.slice(0, 120) : "provider_error",
      });
      return {status: "temporarily_unavailable", cached: false,
        message: "AI analysis is temporarily unavailable.",
        knownData: intelligenceContext.componentSignals};
    }
  },
);

async function requireManagedGrowthBusiness(request) {
  const context = await requireVerifiedUser(
    request,
    "You must be logged in to use Managed Growth.",
  );
  if (!context.isAdmin && context.role !== "business") {
    throw new HttpsError("permission-denied", "Managed Growth is available to Business accounts.");
  }
  const entitlement = (await db.collection("businessSubscriptions").doc(context.uid).get()).data();
  if (!subscriptionEntitlements.hasActiveManagedGrowthEntitlement(entitlement)) {
    throw new HttpsError("permission-denied", "An active Managed Growth entitlement is required.");
  }
  return {...context, entitlement};
}

/** Saves a versioned, reusable Business-supplied grounding profile. */
exports.saveBusinessGrowthProfile = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    let profile;
    try { profile = managedGrowthProfile.sanitizeProfile(request.data?.profile); }
    catch (_) { throw new HttpsError("invalid-argument", "The Business Growth Profile contains an unsupported value."); }
    const reference = db.collection("businessGrowthProfiles").doc(business.uid);
    let profileVersion;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      profileVersion = Number(existing.data()?.profileVersion || 0) + 1;
      transaction.set(reference, {...profile,
        businessUid: business.uid,
        schemaVersion: managedGrowthProfile.PROFILE_SCHEMA_VERSION,
        profileVersion,
        updatedBy: business.uid,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
      });
    });
    return {profile: {...profile, businessUid: business.uid,
      schemaVersion: managedGrowthProfile.PROFILE_SCHEMA_VERSION, profileVersion}, profileVersion};
  },
);

/** Reads a public website and returns suggestions that the Business must confirm. */
exports.suggestBusinessGrowthProfileFromWebsite = onCall(
  {enforceAppCheck: false, maxInstances: 2, timeoutSeconds: 10, memory: "256MiB"},
  async (request) => {
    await requireManagedGrowthBusiness(request);
    let website;
    try { website = managedGrowthProfile.validatePublicWebsite(request.data?.website); }
    catch (_) { throw new HttpsError("invalid-argument", "Enter a public HTTPS business website."); }
    try {
      const addresses = await dns.lookup(website.hostname, {all: true, verbatim: true});
      if (!addresses.length || addresses.some(({address}) => managedGrowthProfile.isPrivateAddress(address))) {
        throw new Error("private_website_address");
      }
    } catch (_) {
      throw new HttpsError("invalid-argument", "Enter a reachable public business website.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(website, {redirect: "error", signal: controller.signal,
        headers: {"user-agent": "ScaledCircle-Business-Profile/1.0"}});
      if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
        throw new Error("website_not_readable");
      }
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > 512000) throw new Error("website_too_large");
      const html = (await response.text()).slice(0, 300000);
      return managedGrowthProfile.extractWebsiteSuggestions(html, website.toString());
    } catch (error) {
      logger.info("Business website suggestions unavailable.", {
        businessUid: request.auth.uid, errorCode: String(error?.message || error).slice(0, 80),
      });
      throw new HttpsError("unavailable", "We could not read that website. You can continue without it.");
    } finally { clearTimeout(timeout); }
  },
);

/** Saves owner preferences without changing identity, entitlement, or search authority. */
exports.saveDiscoveryPreferences = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const context = await requireVerifiedUser(request, "Sign in to save Areas & Preferences.");
    if (!["business", "scaler"].includes(context.role)) {
      throw new HttpsError("permission-denied", "A Business or Scaler account is required.");
    }
    let value;
    try { value = discoveryPreferences.sanitizePreferences(request.data?.preferences, context.role); }
    catch (_) { throw new HttpsError("invalid-argument", "Check the saved areas and preferences."); }
    const reference = db.collection("discoveryPreferences").doc(context.uid);
    let preferenceVersion;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      preferenceVersion = Number(existing.data()?.preferenceVersion || 0) + 1;
      const storedValue = serviceAreaGeometryCodec.encodeDiscoveryPreferencesForFirestore(value);
      if (serviceAreaGeometryCodec.containsDirectNestedArray(storedValue)) {
        throw new Error("invalid_nested_array_storage");
      }
      const initialSetupCompletedAt = existing.data()?.initialSetupCompletedAt ||
        (request.data?.initialSetupCompleted === true ? FieldValue.serverTimestamp() : null);
      transaction.set(reference, {...storedValue, userUid: context.uid, preferenceVersion,
        initialSetupCompletedAt,
        updatedBy: context.uid, updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp()});
    });
    const savedSnapshot = await reference.get();
    const authoritative = discoveryPreferences.sanitizePreferences(savedSnapshot.data(), context.role);
    if (context.role === "scaler" && request.data?.initialSetupCompleted === true) {
      const authUser = await getAuth().getUser(context.uid);
      await require("./scaler_profile_notifications").queueScalerProfileCompletion({
        db, serverTimestamp: FieldValue.serverTimestamp(), uid: context.uid,
        authUser, profile: context.user, preferences: authoritative,
        occurredAt: new Date().toISOString(),
      });
    }
    return {preferences: {...authoritative, userUid: context.uid, preferenceVersion,
      initialSetupCompleted: savedSnapshot.data()?.initialSetupCompletedAt != null}};
  },
);

/** Returns the one server-authored taxonomy projection used by Scaler setup. */
exports.getMarketplaceWorkTypes = onCall(
  {enforceAppCheck: false, maxInstances: 8},
  async (request) => {
    await requireVerifiedUser(request, "Sign in to view work preferences.");
    return marketplaceWorkTypes.publicProjection();
  },
);

/** Owner-only safe projection for verified Scalers who remain pending. */
exports.getPendingScalerPreferences = onCall(
  {enforceAppCheck: false, maxInstances: 8},
  async (request) => {
    const context = await requirePendingScaler(request);
    const snapshot = await db.collection("discoveryPreferences").doc(context.uid).get();
    return {preferences: snapshot.exists ?
      {...discoveryPreferences.sanitizePreferences(snapshot.data(), "scaler"),
        initialSetupCompleted: snapshot.data()?.initialSetupCompletedAt != null} : null};
  },
);

/** Saves only the pending Scaler's sanitized preference document; grants no access. */
exports.savePendingScalerPreferences = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const context = await requirePendingScaler(request);
    let value;
    try { value = discoveryPreferences.sanitizePreferences(request.data?.preferences, "scaler"); }
    catch (_) { throw new HttpsError("invalid-argument", "Check the saved work preferences."); }
    const reference = db.collection("discoveryPreferences").doc(context.uid);
    let preferenceVersion;
    let initialSetupCompleted = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      preferenceVersion = Number(existing.data()?.preferenceVersion || 0) + 1;
      const storedValue = serviceAreaGeometryCodec.encodeDiscoveryPreferencesForFirestore(value);
      if (serviceAreaGeometryCodec.containsDirectNestedArray(storedValue)) {
        throw new Error("invalid_nested_array_storage");
      }
      initialSetupCompleted = existing.data()?.initialSetupCompletedAt != null ||
        request.data?.initialSetupCompleted === true;
      transaction.set(reference, {...storedValue, userUid: context.uid, preferenceVersion,
        initialSetupCompletedAt: existing.data()?.initialSetupCompletedAt ||
          (request.data?.initialSetupCompleted === true ? FieldValue.serverTimestamp() : null),
        updatedBy: context.uid, updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp()});
    });
    if (request.data?.initialSetupCompleted === true) {
      const authUser = await getAuth().getUser(context.uid);
      await require("./scaler_profile_notifications").queueScalerProfileCompletion({
        db, serverTimestamp: FieldValue.serverTimestamp(), uid: context.uid,
        authUser, profile: context.user, preferences: value,
        occurredAt: new Date().toISOString(),
      });
    }
    return {preferences: {...value, userUid: context.uid, preferenceVersion,
      initialSetupCompleted}};
  },
);

/** Resolves user-submitted places through a cached, globally throttled provider boundary. */
exports.resolveServiceAreaPlace = onCall(
  {enforceAppCheck: false, maxInstances: 4, timeoutSeconds: 15},
  async (request) => {
    await requireVerifiedUser(request, "Sign in to find a service area.");
    try {
      return await serviceAreaResolution.resolvePlace({
        query: request.data?.query,
        db,
        baseUrl: process.env.NOMINATIM_BASE_URL,
        tigerBase: process.env.TIGERWEB_BASE_URL,
        onCacheWriteError: (error) => logger.info("Service area cache write skipped.", {
          errorCode: String(error?.message || error).slice(0, 80),
          cacheVersion: serviceAreaResolution.CACHE_VERSION,
        }),
      });
    } catch (error) {
      if (error?.message === "invalid_query") {
        throw new HttpsError("invalid-argument", "Enter a city, county, or ZIP.");
      }
      if (error?.message === "rate_limited") {
        throw new HttpsError("resource-exhausted", "Map search is busy. Try again in a moment.");
      }
      logger.info("Service area resolution unavailable.", {
        errorCode: String(error?.message || error).slice(0, 80),
      });
      throw new HttpsError("unavailable", "We couldn't map that area automatically.");
    }
  },
);

/** Returns deterministic, explainable relevance; manual search always remains open. */
exports.evaluateOpportunityMatch = onCall(
  {enforceAppCheck: false, maxInstances: 8},
  async (request) => {
    const context = await requireVerifiedUser(request, "Sign in to personalize discovery.");
    const snapshot = await db.collection("discoveryPreferences").doc(context.uid).get();
    if (!snapshot.exists) return {version: discoveryPreferences.MATCH_VERSION,
      matched: request.data?.scope === "manual", matchScore: null, distance: null,
      serviceAreaMatch: null, serviceMatch: null, travelMatch: null,
      reasons: [request.data?.scope === "manual" ? "Manual search shows all available results." :
        "Set Areas & Preferences to personalize notifications."]};
    let value;
    try {
      const preferences = discoveryPreferences.sanitizePreferences(snapshot.data(), context.role);
      value = discoveryPreferences.matchOpportunity(preferences, request.data?.opportunity || {},
        request.data?.scope === "manual" ? "manual" : "push");
    } catch (_) { throw new HttpsError("invalid-argument", "The opportunity could not be matched."); }
    return value;
  },
);

async function consumeManagedGrowthRateLimit(business, artifactType, now = Date.now()) {
  const windows = managedGrowthProfile.rateLimitWindows(now);
  const caps = managedGrowthProfile.rateCaps(business.entitlement?.source);
  const day = db.collection("managedGrowthRateLimits")
    .doc(`${business.uid}_${windows.day}`);
  const month = db.collection("managedGrowthRateLimits")
    .doc(`${business.uid}_${windows.month}`);
  await db.runTransaction(async (transaction) => {
    const [daySnapshot, monthSnapshot] = await Promise.all([transaction.get(day), transaction.get(month)]);
    const dayCount = Number(daySnapshot.data()?.count || 0);
    const monthCount = Number(monthSnapshot.data()?.count || 0);
    if (dayCount >= caps.daily || monthCount >= caps.monthly) {
      throw new HttpsError("resource-exhausted", "The Managed Growth generation limit was reached.");
    }
    const metadata = {businessUid: business.uid, policyVersion: managedGrowthProfile.RATE_POLICY_VERSION,
      entitlementSource: business.entitlement?.source || "unknown", updatedAt: FieldValue.serverTimestamp()};
    transaction.set(day, {...metadata, windowType: "day", artifactType, count: dayCount + 1}, {merge: true});
    transaction.set(month, {...metadata, windowType: "month", artifactType, count: monthCount + 1}, {merge: true});
  });
}

/** Generates and persists a draft-only Managed Growth artifact. */
exports.generateManagedGrowthArtifact = onCall(
  {enforceAppCheck: false, maxInstances: 3, timeoutSeconds: 60, memory: "512MiB",
    secrets: [OPENAI_API_KEY]},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    let generationRequest;
    try { generationRequest = managedGrowthProfile.sanitizeGenerationRequest(request.data); }
    catch (_) { throw new HttpsError("invalid-argument", "Choose a supported Managed Growth artifact."); }
    const profileSnapshot = await db.collection("businessGrowthProfiles").doc(business.uid).get();
    const profileRecord = profileSnapshot.data() || {};
    const profile = managedGrowthProfile.sanitizeProfile(profileRecord);
    if (!managedGrowthProfile.isProfileReady(profile)) {
      throw new HttpsError("failed-precondition", "Set up the Business Growth Profile before generating content.");
    }
    let property = null;
    if (generationRequest.propertyContext?.analysisId) {
      property = await loadAuthoritativePropertyIntelligence(
        generationRequest.propertyContext.analysisId,
        generationRequest.propertyContext.geometryDigest,
      );
    }
    const discoverySnapshot = await db.collection("discoveryPreferences").doc(business.uid).get();
    const discovery = discoverySnapshot.exists ?
      discoveryPreferences.sanitizePreferences(discoverySnapshot.data(), "business") : null;
    const context = managedGrowthProfile.buildGenerationContext({profile,
      profileVersion: Number(profileRecord.profileVersion || 1), request: generationRequest,
      authoritative: {property}, discovery});
    const artifactId = managedGrowthProfile.cacheIdentity(context);
    const reference = db.collection("managedGrowthArtifacts").doc(artifactId);
    const cached = await reference.get();
    if (cached.exists) return {artifactId, artifact: cached.data().artifact, cached: true,
      usage: cached.data().usage || null};
    await consumeManagedGrowthRateLimit(business, generationRequest.artifactType);
    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) throw new HttpsError("unavailable", "Managed Growth generation is temporarily unavailable.");
    try {
      const OpenAI = require("openai");
      const client = new OpenAI({apiKey, timeout: 45000, maxRetries: 0});
      const response = await client.responses.create({
        model: managedGrowthProfile.MODEL, store: false, reasoning: {effort: "low"},
        instructions: [
          "Create only the requested Managed Growth draft from the supplied structured context.",
          "Business profile values are claims supplied by the Business; never invent missing licenses, years, awards, ratings, projects, testimonials, guarantees, certifications, locations, or customer intent.",
          "Property and weather data are authoritative only when supplied in the authoritative object.",
          "Distinguish traditional website/local SEO from social discovery; make no ranking, demand, or performance guarantees.",
          "Do not claim to publish, send, order, fund, spend, launch, or execute anything.",
          "For advertising, label budget as planned and actual provider spend as Not connected.",
          "For direct mail, separate printing, postage, vendor cost, and the 20 percent management fee; do not recommend redundant physical channels without evidence.",
          "Include useful creative briefs but do not generate images.",
        ].join(" "),
        input: JSON.stringify(context), max_output_tokens: 5000,
        text: {format: {type: "json_schema", name: "managed_growth_artifact", strict: true,
          schema: managedGrowthProfile.RESPONSE_SCHEMA}},
      }, {idempotencyKey: artifactId, timeout: 45000, maxRetries: 0});
      const artifact = managedGrowthProfile.validateArtifact(JSON.parse(response.output_text));
      const usage = scaledCircleIntelligence.sanitizeUsage(response.usage);
      await reference.set({businessUid: business.uid, artifactType: generationRequest.artifactType,
        title: artifact.title, status: "draft", schemaVersion: managedGrowthProfile.ARTIFACT_SCHEMA_VERSION,
        promptVersion: managedGrowthProfile.PROMPT_VERSION, profileVersion: context.profileVersion,
        model: response.model || managedGrowthProfile.MODEL, usage, sourceContextIds: {
          propertyAnalysisId: generationRequest.propertyContext?.analysisId || null},
        executionAuthority: "none", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        artifact});
      return {artifactId, artifact, cached: false, usage};
    } catch (error) {
      logger.warn("Managed Growth provider unavailable.", {businessUid: business.uid,
        artifactType: generationRequest.artifactType, error: String(error?.message || error).slice(0, 120)});
      throw new HttpsError("unavailable", "Managed Growth generation is temporarily unavailable.");
    }
  },
);

/** Saves a dedicated generated-file recipient without changing Auth or billing email. */
exports.saveArtifactDeliveryPreference = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    let preference;
    try {
      preference = managedGrowthDelivery.deliveryPreference(
        business.uid, request.data?.artifactDeliveryEmail,
      );
    } catch (_) {
      throw new HttpsError("invalid-argument", "Enter a valid file-delivery email address.");
    }
    await db.collection("artifactDeliveryPreferences").doc(business.uid).set({
      ...preference,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: business.uid,
    }, {merge: true});
    return {artifactDeliveryEmail: preference.artifactDeliveryEmail,
      schemaVersion: managedGrowthDelivery.DELIVERY_PREFERENCE_VERSION};
  },
);

/** Queues one owner-authorized artifact email; it never sends a marketing campaign. */
exports.deliverManagedGrowthArtifact = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const artifactId = readText(request.data?.artifactId, 128);
    if (!artifactId) throw new HttpsError("invalid-argument", "Choose a generated file to send.");
    const [artifactSnapshot, profileSnapshot] = await Promise.all([
      db.collection("managedGrowthArtifacts").doc(artifactId).get(),
      db.collection("businessGrowthProfiles").doc(business.uid).get(),
    ]);
    let delivery;
    try {
      delivery = managedGrowthDelivery.prepareDelivery({uid: business.uid,
        recipient: request.data?.recipient || request.auth.token.email,
        artifactId, artifactDocument: artifactSnapshot.exists ? artifactSnapshot.data() : null,
        businessName: profileSnapshot.data()?.businessName, now: Date.now()});
    } catch (error) {
      const code = String(error?.message || error);
      if (code === "artifact_not_owned_or_missing") {
        throw new HttpsError("permission-denied", "That generated file is not available to this Business.");
      }
      throw new HttpsError("invalid-argument", "Enter a valid file-delivery email address.");
    }
    const jobRef = db.collection(managedGrowthDelivery.EMAIL_JOB_COLLECTION).doc(delivery.jobId);
    let alreadyQueued = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(jobRef);
      if (existing.exists) { alreadyQueued = true; return; }
      transaction.create(jobRef, {...delivery.job,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    });
    if (request.data?.remember === true) {
      const preference = managedGrowthDelivery.deliveryPreference(business.uid, delivery.recipient);
      await db.collection("artifactDeliveryPreferences").doc(business.uid).set({
        ...preference, updatedAt: FieldValue.serverTimestamp(), updatedBy: business.uid,
      }, {merge: true});
    }
    return {status: alreadyQueued ? "already_queued" : "queued",
      artifactDeliveryEmail: delivery.recipient, attachmentIncluded: false};
  },
);

/** Returns capability-driven provider availability without credentials. */
exports.getSocialProviderAvailability = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    await requireManagedGrowthBusiness(request);
    return {schemaVersion: socialWorkflow.PROVIDER_POLICY_VERSION,
      providers: socialWorkflow.providerAvailability()};
  },
);

/** Creates reviewable platform-specific posts from an owned generated artifact. */
exports.createSocialPostDraft = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const artifactId = readText(request.data?.artifactId, 160);
    const artifactSnapshot = await db.collection("managedGrowthArtifacts").doc(artifactId).get();
    if (!artifactSnapshot.exists || artifactSnapshot.data()?.businessUid !== business.uid ||
        artifactSnapshot.data()?.artifactType !== "social_package") {
      throw new HttpsError("permission-denied", "That Social draft is not available.");
    }
    let draft;
    try {
      draft = socialWorkflow.createDraft({uid: business.uid, artifactId,
        title: artifactSnapshot.data()?.title, posts: request.data?.posts, now: Date.now()});
    } catch (_) {
      throw new HttpsError("invalid-argument", "Review the Social post content and try again.");
    }
    await db.collection("socialPostDrafts").doc(draft.id).set({
      ...draft.record, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    return {draftId: draft.id, status: draft.record.status,
      contentVersion: draft.record.contentVersion};
  },
);

/** Saves edits and invalidates any earlier approval. */
exports.updateSocialPostDraft = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const draftId = readText(request.data?.draftId, 160);
    const ref = db.collection("socialPostDrafts").doc(draftId);
    let updated;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      try { updated = socialWorkflow.editDraft({uid: business.uid, record: snapshot.data(),
        posts: request.data?.posts, now: Date.now()}); } catch (error) {
        const code = String(error?.message || error);
        throw new HttpsError(code.includes("not_owned") ? "permission-denied" : "failed-precondition",
          "This Social draft cannot be edited.");
      }
      transaction.set(ref, {...updated, createdAt: snapshot.data().createdAt,
        updatedAt: FieldValue.serverTimestamp()});
    });
    return {draftId, status: updated.status, contentVersion: updated.contentVersion};
  },
);

/** Records explicit Business approval of one exact content version. */
exports.approveSocialPostDraft = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const draftId = readText(request.data?.draftId, 160);
    const ref = db.collection("socialPostDrafts").doc(draftId);
    let approved;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      try { approved = socialWorkflow.approveDraft({uid: business.uid, record: snapshot.data(),
        contentVersion: request.data?.contentVersion, now: Date.now()}); } catch (error) {
        const code = String(error?.message || error);
        throw new HttpsError(code.includes("not_owned") ? "permission-denied" : "failed-precondition",
          "Review the latest version before approving.");
      }
      transaction.set(ref, {...approved, createdAt: snapshot.data().createdAt,
        approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    });
    return {draftId, status: approved.status,
      approvedContentVersion: approved.approvedContentVersion};
  },
);

/** Schedules an approved version; unavailable provider connections fail closed. */
exports.scheduleSocialPostDraft = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const draftId = readText(request.data?.draftId, 160);
    const draftSnapshot = await db.collection("socialPostDrafts").doc(draftId).get();
    if (!draftSnapshot.exists || draftSnapshot.data()?.businessUid !== business.uid) {
      throw new HttpsError("permission-denied", "That Social draft is not available.");
    }
    const draft = {...draftSnapshot.data(), id: draftId};
    const jobs = [];
    for (let index = 0; index < (draft.posts || []).length; index += 1) {
      const provider = draft.posts[index]?.provider;
      const connectionSnapshot = await db.collection("socialConnections").doc(business.uid)
        .collection("providers").doc(provider).get();
      try { jobs.push(socialWorkflow.publishingJob({uid: business.uid, draft, postIndex: index,
        connection: connectionSnapshot.data(), scheduledFor: request.data?.scheduledFor,
        now: Date.now()})); } catch (error) {
        if (String(error?.message || error).includes("connection")) {
          throw new HttpsError("failed-precondition", "This social account needs to be connected before scheduling.");
        }
        throw new HttpsError("failed-precondition", "Approve the latest version before scheduling.");
      }
    }
    const batch = db.batch();
    for (const job of jobs) batch.set(db.collection("socialPublishingJobs").doc(job.id), {
      ...job.record, scheduledFor: Timestamp.fromDate(new Date(job.record.scheduledFor)),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    batch.update(draftSnapshot.ref, {status: "scheduled", updatedAt: FieldValue.serverTimestamp()});
    await batch.commit();
    return {draftId, status: "scheduled", jobCount: jobs.length};
  },
);

/** Registers one owner-scoped image after direct Storage upload. */
exports.registerSocialMediaItem = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    let media;
    try { media = socialWorkflow.mediaRecord({uid: business.uid,
      mediaId: request.data?.mediaId, storagePath: request.data?.storagePath,
      filename: request.data?.filename, category: request.data?.category,
      description: request.data?.description, now: Date.now()}); } catch (_) {
      throw new HttpsError("invalid-argument", "Choose a valid Business photo.");
    }
    await db.collection("socialMediaLibraries").doc(business.uid).collection("items")
      .doc(media.mediaId).set({...media, createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
    return {mediaId: media.mediaId, status: media.status};
  },
);

/**
 * Query OpenStreetMap via Overpass.
 */
async function analyzeResidentialGeography(
  points,
) {
  const polygon = points
    .map(
      (point) =>
        `${point.latitude} ${point.longitude}`,
    )
    .join(" ");

  const query = `
[out:json][timeout:25];

(
  nwr["addr:housenumber"](poly:"${polygon}");

  nwr["building"](poly:"${polygon}");
);

out tags center;
`;

  const body =
    new URLSearchParams();

  body.set(
    "data",
    query,
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      20000,
    );

  try {
    const response =
      await fetch(
        OVERPASS_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",

            "User-Agent":
              "ScaledCircle-Development/1.0",
          },

          body:
            body.toString(),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `Overpass returned HTTP ${response.status}.`,
      );
    }

    const payload =
      await response.json();

    const elements =
      Array.isArray(payload.elements)
        ? payload.elements
        : [];

    const addressKeys =
      new Set();

    const residentialBuildings =
      new Set();

    const totalBuildings =
      new Set();

    for (const element of elements) {
      const tags =
        element.tags || {};

      const elementKey =
        `${element.type}:${element.id}`;

      if (
        typeof tags["addr:housenumber"] ===
          "string" &&
        tags["addr:housenumber"].trim()
          .length > 0
      ) {
        const houseNumber =
          tags["addr:housenumber"].trim();

        const street =
          typeof tags["addr:street"] ===
          "string"
            ? tags["addr:street"].trim()
            : "";

        const postcode =
          typeof tags["addr:postcode"] ===
          "string"
            ? tags["addr:postcode"].trim()
            : "";

        addressKeys.add(
          `${houseNumber}|${street}|${postcode}|${elementKey}`,
        );
      }

      const building =
        tags.building;

      if (
        typeof building === "string" &&
        building.length > 0 &&
        building !== "no"
      ) {
        totalBuildings.add(
          elementKey,
        );

        if (
          isResidentialBuildingType(
            building,
          )
        ) {
          residentialBuildings.add(
            elementKey,
          );
        }
      }
    }

    return {
      addressCount:
        addressKeys.size,

      residentialBuildingCount:
        residentialBuildings.size,

      totalBuildingCount:
        totalBuildings.size,

      source:
        "openstreetmap_overpass",
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function isResidentialBuildingType(
  building,
) {
  const residentialTypes =
    new Set([
      "apartments",
      "bungalow",
      "cabin",
      "detached",
      "dormitory",
      "farm",
      "house",
      "residential",
      "semidetached_house",
      "static_caravan",
      "terrace",
    ]);

  return residentialTypes.has(
    building,
  );
}

function determineHomeEstimate({
  geographicResult,
  areaAcres,
}) {
  const addressCount =
    geographicResult.addressCount;

  const residentialBuildingCount =
    geographicResult
      .residentialBuildingCount;

  if (addressCount >= 5) {
    return {
      estimatedHomes:
        addressCount,

      method:
        "osm_address_points_v1",

      confidence:
        "high",

      confidenceScore:
        0.85,
    };
  }

  if (
    residentialBuildingCount >= 3
  ) {
    return {
      estimatedHomes:
        residentialBuildingCount,

      method:
        "osm_residential_buildings_v1",

      confidence:
        "medium",

      confidenceScore:
        0.65,
    };
  }

  const fallbackHomes =
    calculateDevelopmentHomeEstimate({
      areaAcres,
    });

  return {
    estimatedHomes:
      fallbackHomes,

    method:
      "development_area_density_fallback_v1",

    confidence:
      "low",

    confidenceScore:
      fallbackHomes > 0
        ? 0.35
        : 0.0,
  };
}

function calculateDevelopmentHomeEstimate({
  areaAcres,
}) {
  if (
    !Number.isFinite(areaAcres) ||
    areaAcres <= 0
  ) {
    return 0;
  }

  return Math.max(
    1,
    Math.round(
      areaAcres *
        DEVELOPMENT_HOMES_PER_ACRE,
    ),
  );
}

function cleanId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function moneyValue(value) {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? number : 0;
}

function firstMoneyValue(...values) {
  for (const value of values) {
    const number = moneyValue(value);

    if (number > 0) {
      return number;
    }
  }

  return 0;
}

function normalizedCampaignType(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function campaignRequiresPhotos(campaignType) {
  return new Set([
    "yardsigninstallation",
    "yardcleanup",
    "dumprun",
    "junkremoval",
  ]).has(normalizedCampaignType(campaignType));
}

function completionHasPhoto(completion) {
  const proofs = Array.isArray(completion.proofs) ? completion.proofs : [];

  return proofs.some((proof) => {
    if (!proof || typeof proof !== "object") {
      return false;
    }

    const fileUrl = typeof proof.fileUrl === "string"
      ? proof.fileUrl.trim()
      : "";
    const proofType = normalizedCampaignType(proof.type);

    return fileUrl.length > 0 && proofType !== "gpsroute";
  });
}

function validRoutePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) {
    return [];
  }

  return rawPoints
    .filter((point) =>
      point &&
      typeof point === "object" &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
    )
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
}

function calculateRouteCompletion(zone, routePoints) {
  const assignedHomes = Math.round(
    firstMoneyValue(zone.assignedHomes, zone.estimatedHomes),
  );

  if (assignedHomes <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not have a valid assigned home count.",
    );
  }

  const serviceArea = validRoutePoints(zone.serviceArea);

  if (serviceArea.length < 3) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not contain a valid mapped service area.",
    );
  }

  let expectedWalkingMeters = moneyValue(zone.estimatedWalkingMeters);

  if (expectedWalkingMeters <= 0) {
    expectedWalkingMeters = moneyValue(zone.estimatedWalkingMiles) * 1609.344;
  }

  if (expectedWalkingMeters <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "The zone does not have a valid expected walking distance.",
    );
  }

  let totalRouteMeters = 0;
  let insideZoneMeters = 0;

  for (let index = 1; index < routePoints.length; index++) {
    const previous = routePoints[index - 1];
    const current = routePoints[index];
    const segmentMeters = distanceMeters(previous, current);

    if (segmentMeters < 2 || segmentMeters > 250) {
      continue;
    }

    totalRouteMeters += segmentMeters;

    const midpoint = {
      latitude: (previous.latitude + current.latitude) / 2,
      longitude: (previous.longitude + current.longitude) / 2,
    };

    if (pointInsidePolygon(midpoint, serviceArea)) {
      insideZoneMeters += segmentMeters;
    }
  }

  const completionRatio = Math.max(
    0,
    Math.min(1, insideZoneMeters / expectedWalkingMeters),
  );
  const completionPercentage = completionRatio * 100;
  const completedHomes = Math.max(
    0,
    Math.min(assignedHomes, Math.round(assignedHomes * completionRatio)),
  );

  return {
    assignedHomes,
    completedHomes,
    completionPercentage,
    eligibleForPayment:
      completionPercentage >= MINIMUM_PAYABLE_COMPLETION_PERCENTAGE,
    routeDistanceMeters: totalRouteMeters,
    insideZoneDistanceMeters: insideZoneMeters,
  };
}

function distanceMeters(start, end) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(1 - haversine),
  );
}

function pointInsidePolygon(point, polygon) {
  let inside = false;
  let previousIndex = polygon.length - 1;

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      (current.latitude > point.latitude) !==
        (previous.latitude > point.latitude) &&
      point.longitude <
        (previous.longitude - current.longitude) *
          (point.latitude - current.latitude) /
          (previous.latitude - current.latitude) +
        current.longitude;

    if (intersects) {
      inside = !inside;
    }

    previousIndex = index;
  }

  return inside;
}

function calculatePayout({
  completionPercentage,
  basePay,
  completionBonus,
}) {
  const safeCompletion = Math.max(0, Math.min(100, completionPercentage));
  const safeBasePay = Math.max(0, basePay);
  const safeBonus = Math.max(0, completionBonus);

  if (safeCompletion < MINIMUM_PAYABLE_COMPLETION_PERCENTAGE) {
    return {
      basePayout: 0,
      bonus: 0,
      totalPayout: 0,
      status: "redo_required",
    };
  }

  if (safeCompletion >= AUTOMATIC_BONUS_COMPLETION_PERCENTAGE) {
    const basePayout = roundMoney(safeBasePay);
    const bonus = roundMoney(safeBonus);

    return {
      basePayout,
      bonus,
      totalPayout: roundMoney(basePayout + bonus),
      status: "completed_with_bonus",
    };
  }

  const basePayout = roundMoney(safeBasePay * safeCompletion / 100);

  return {
    basePayout,
    bonus: 0,
    totalPayout: basePayout,
    status: "partial_completion",
  };
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function readText(value, maximumLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}

function normalizeExternalUrl(value) {
  const text = readText(value, 2000);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch (_) {
    return null;
  }
}

function publicTrackingUrl(trackingCode) {
  const projectId = process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    (scaledCircleEnvironment() === "local" ? "demo-scaledcircle" : "scaled-circle");

  if (scaledCircleEnvironment() === "local" && projectId === "scaled-circle") {
    throw new HttpsError(
      "failed-precondition",
      "Local runtime refuses the production Firebase project.",
    );
  }

  const baseUrl = scaledCircleEnvironment() === "local" ?
    `http://${process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001"}/` +
      `${projectId}/us-east1` :
    `https://us-east1-${projectId}.cloudfunctions.net`;
  return `${baseUrl}/` +
    `campaignTracking?t=${encodeURIComponent(trackingCode)}`;
}

async function loadWeatherOpportunityFeed({
  latitude,
  longitude,
  maximumCacheAgeMs = 5 * 60 * 1000,
}) {
  const roundedLatitude = Math.round(latitude * 100) / 100;
  const roundedLongitude = Math.round(longitude * 100) / 100;
  const cacheId = `${roundedLatitude}_${roundedLongitude}`
    .replaceAll(".", "_")
    .replaceAll("-", "m");
  const cacheReference = db.collection("weatherOpportunityCache").doc(cacheId);
  const cacheSnapshot = await cacheReference.get();
  const cache = cacheSnapshot.data() || {};
  const fetchedAt = cache.fetchedAt instanceof Timestamp ?
    cache.fetchedAt.toMillis() : 0;

  if (maximumCacheAgeMs > 0 &&
      Date.now() - fetchedAt < maximumCacheAgeMs &&
      Array.isArray(cache.alerts)) {
    const cachedAlerts = cache.alerts.filter((alert) =>
      !/\b(test message|required weekly test|practice\/demo)\b/i.test(
        `${readText(alert?.event, 120)} ${readText(alert?.headline, 240)}`,
      ));
    return {
      source: "National Weather Service",
      experimentalOpportunityModel: true,
      cached: true,
      alerts: cachedAlerts,
    };
  }

  try {
    const endpoint = new URL("https://api.weather.gov/alerts/active");
    endpoint.searchParams.set("point", `${roundedLatitude},${roundedLongitude}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let nwsResponse;
    try {
      nwsResponse = await fetch(endpoint, {
        headers: {
          "Accept": "application/geo+json",
          "User-Agent": "ScaledCircle/1.0 (https://scaledcircle.com)",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!nwsResponse.ok) {
      throw new Error(`NWS returned ${nwsResponse.status}.`);
    }

    const payload = await nwsResponse.json();
    const features = Array.isArray(payload.features) ? payload.features : [];
    const alerts = features
      .map((feature) => weatherOpportunityFromFeature(feature))
      .filter(Boolean)
      .slice(0, 12);

    await cacheReference.set({
      latitude: roundedLatitude,
      longitude: roundedLongitude,
      source: "National Weather Service",
      alerts,
      fetchedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      source: "National Weather Service",
      experimentalOpportunityModel: true,
      cached: false,
      alerts,
    };
  } catch (error) {
    if (Array.isArray(cache.alerts)) {
      const cachedAlerts = cache.alerts.filter((alert) =>
        !/\b(test message|required weekly test|practice\/demo)\b/i.test(
          `${readText(alert?.event, 120)} ${readText(alert?.headline, 240)}`,
        ));
      return {
        source: "National Weather Service",
        experimentalOpportunityModel: true,
        cached: true,
        stale: true,
        alerts: cachedAlerts,
      };
    }
    throw error;
  }
}

function weatherOpportunityFromFeature(feature) {
  if (!feature || typeof feature !== "object") {
    return null;
  }

  const properties = feature.properties &&
    typeof feature.properties === "object" ? feature.properties : {};
  const event = readText(properties.event, 120);
  const headline = readText(properties.headline, 240) || event;
  const status = readText(properties.status, 40).toLowerCase();
  const messageType = readText(properties.messageType, 40).toLowerCase();
  const responseType = readText(properties.response, 40).toLowerCase();
  const combinedText = `${event} ${headline} ${
    readText(properties.description, 1800)
  }`.toLowerCase();

  if (!event && !headline) {
    return null;
  }

  const testProduct = /\b(test message|required weekly test|practice\/demo)\b/i;
  if (status === "test" || status === "exercise" ||
      messageType === "test" || messageType === "cancel" ||
      responseType === "test" || testProduct.test(`${event} ${headline}`) ||
      event.toLowerCase() === "administrative message") {
    return null;
  }

  let services = ["Local outreach"];
  let leadLiftRange = {lowPercent: 0, highPercent: 8};
  let rationale = "Active weather can change near-term local service demand.";
  let confidence = "experimental_low";

  if (combinedText.includes("hail")) {
    services = ["Roofing", "Siding", "Windows", "Exterior inspection"];
    leadLiftRange = {lowPercent: 10, highPercent: 30};
    rationale = "Hail alerts may increase demand for exterior inspections and repairs.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("tornado") ||
      combinedText.includes("severe thunderstorm") ||
      combinedText.includes("damaging wind") ||
      combinedText.includes("high wind")) {
    services = ["Roofing", "Siding", "Tree service", "Storm cleanup"];
    leadLiftRange = {lowPercent: 8, highPercent: 25};
    rationale = "Severe wind alerts may increase demand for exterior and debris services.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("flood")) {
    services = ["Water mitigation", "Basement cleanup", "Mold inspection"];
    leadLiftRange = {lowPercent: 8, highPercent: 24};
    rationale = "Flood alerts may increase demand for water and property restoration services.";
    confidence = "experimental_medium";
  } else if (combinedText.includes("snow") ||
      combinedText.includes("ice") ||
      combinedText.includes("winter storm")) {
    services = ["Snow removal", "Ice management", "Emergency property service"];
    leadLiftRange = {lowPercent: 5, highPercent: 18};
    rationale = "Winter weather alerts may increase demand for removal and emergency services.";
  } else if (combinedText.includes("heat")) {
    services = ["HVAC", "Cooling service", "Energy efficiency"];
    leadLiftRange = {lowPercent: 4, highPercent: 15};
    rationale = "Heat alerts may increase demand for cooling and HVAC services.";
  }

  return {
    id: readText(feature.id, 500) || readText(properties.id, 500),
    event,
    headline,
    severity: readText(properties.severity, 40) || "Unknown",
    urgency: readText(properties.urgency, 40) || "Unknown",
    certainty: readText(properties.certainty, 40) || "Unknown",
    areaDescription: readText(properties.areaDesc, 500),
    sent: readText(properties.sent, 80),
    onset: readText(properties.onset, 80),
    expires: readText(properties.expires, 80),
    officialDescription: readText(properties.description, 1000),
    sourceUrl: readText(feature.id, 1000),
    opportunity: {
      services,
      estimatedLeadLiftLowPercent: leadLiftRange.lowPercent,
      estimatedLeadLiftHighPercent: leadLiftRange.highPercent,
      confidence,
      rationale,
      experimental: true,
      modelVersion: "weather-opportunity-v1",
    },
  };
}

async function recordTrackingEvent({
  tracking,
  trackingCode,
  eventType,
  source,
  request,
  metrics,
}) {
  const campaignId = readText(tracking.campaignId, 160);

  if (!campaignId) {
    return;
  }

  const eventReference = db
    .collection("campaignTrackingCodes")
    .doc(trackingCode)
    .collection("events")
    .doc();
  const event = {
    campaignId,
    businessId: readText(tracking.businessId, 160),
    trackingCode,
    eventType,
    source,
    referrer: readText(request.get("referer"), 500),
    userAgent: readText(request.get("user-agent"), 500),
    createdAt: FieldValue.serverTimestamp(),
  };
  const metricUpdates = {
    trackingLastEventAt: FieldValue.serverTimestamp(),
    trackingEventCount: FieldValue.increment(1),
  };

  for (const metric of [...new Set(metrics || [])]) {
    metricUpdates[`trackingMetrics.${metric}`] = FieldValue.increment(1);
  }

  await Promise.all([
    eventReference.set(event),
    db.collection("campaigns").doc(campaignId).update(metricUpdates),
  ]);
}

function renderCampaignLandingPage({tracking, source}) {
  const campaignName = readText(tracking.campaignName, 160) ||
    "Local offer";
  const headline = readText(tracking.landingPageHeadline, 120) ||
    campaignName;
  const body = readText(tracking.landingPageBody, 600) ||
    readText(tracking.campaignDescription, 600) ||
    "Learn more about this local campaign.";
  const callToActionLabel = readText(tracking.callToActionLabel, 50) ||
    "Learn More";
  const trackingUrl = readText(tracking.trackingUrl, 2000);
  const separator = trackingUrl.includes("?") ? "&" : "?";
  const callToActionUrl = `${trackingUrl}${separator}` +
    `action=cta&source=${encodeURIComponent(source)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(headline)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      padding: 28px; color: #f5fbff; background:
        radial-gradient(circle at 75% 15%, #053e63 0, transparent 35%),
        radial-gradient(circle at 15% 80%, #043c2e 0, transparent 38%),
        #020914; font: 16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif;
    }
    main {
      width: min(720px, 100%); padding: clamp(28px, 7vw, 68px);
      border: 1px solid #153452; border-radius: 28px;
      background: rgba(5, 17, 31, .92); box-shadow: 0 28px 90px #0009;
    }
    .eyebrow { color: #15e39a; font-weight: 800; letter-spacing: .12em;
      text-transform: uppercase; font-size: .78rem; }
    h1 { margin: .4rem 0 1rem; font-size: clamp(2.2rem, 8vw, 4.6rem);
      line-height: .98; letter-spacing: -.055em; }
    p { color: #b8c9d8; font-size: clamp(1rem, 2.6vw, 1.22rem); }
    a { display: inline-flex; margin-top: 22px; padding: 15px 24px;
      border-radius: 12px; color: #00150e; background: #15e39a;
      font-weight: 850; text-decoration: none; }
    footer { margin-top: 34px; color: #6f879a; font-size: .8rem; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">A Scaled Circle local campaign</div>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(body)}</p>
    <a href="${escapeHtml(callToActionUrl)}">${escapeHtml(callToActionLabel)}</a>
    <footer>Campaign attribution and verified local delivery by Scaled Circle.</footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readNumber(
  value,
  fallback = 0,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return fallback;
}

function readInteger(
  value,
  fallback = 0,
) {
  const number = readNumber(
    value,
    fallback,
  );

  return Math.round(
    number,
  );
}

// Native active-job tracking -------------------------------------------------
const TRACKING_CALLABLE_OPTIONS = {
  memory: "512MiB",
  timeoutSeconds: 120,
  maxInstances: 20,
  concurrency: 40,
};

const TRACKING_SESSION_STATES = new Set([
  "active", "paused", "finalizing", "completed", "cancelled",
]);

function trackingSegmentId(index) {
  return `segment_${String(index).padStart(4, "0")}`;
}

function trackingCallable(name, handler) {
  return onCall(TRACKING_CALLABLE_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Unexpected ${name} failure`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        uid: request.auth?.uid || null,
      });
      throw new HttpsError("internal", "The tracking request could not be completed.");
    }
  });
}

function trackingTimestampMs(value, fallback) {
  return value instanceof Timestamp ? value.toMillis() : fallback;
}

function firestoreTrackingPoint(point) {
  return {...point, recordedAt: Timestamp.fromMillis(point.timestampMs)};
}

function assertTrackingPayload(data, allowed, maximumBytes) {
  try {
    assertAllowedKeys(data || {}, allowed, "Tracking request");
  } catch (error) {
    throw new HttpsError("invalid-argument", "The tracking request is malformed.");
  }
  if (serializedBytes(data) > maximumBytes) {
    throw new HttpsError("invalid-argument", "The tracking request is too large.");
  }
}

// RETIRED compatibility implementation retained only to audit historical
// legacy_browser_v1 records and its former contract. The codebase generator
// excludes this export from every deployable Functions package. Production
// clients do not call it; active jobs use the tracking-session/chunk pipeline.
exports.saveLegacyTrackingRoute = trackingCallable(
  "saveLegacyTrackingRoute",
  async (request) => {
    assertTrackingPayload(
      request.data,
      new Set([
        "campaignId", "zoneId", "routeId", "operation", "points",
        "tracking", "lastAccuracyMeters",
      ]),
      393216,
    );
    const context = await requireVerifiedUser(request, "Sign in before saving GPS evidence.");
    if (context.role !== "scaler" && !context.isAdmin) {
      throw new HttpsError("permission-denied", "Only the assigned Scaler can save this route.");
    }
    const campaignId = String(request.data?.campaignId || "").trim();
    const zoneId = String(request.data?.zoneId || "").trim();
    const routeId = String(request.data?.routeId || "").trim();
    const operation = String(request.data?.operation || "save");
    if (!campaignId || !zoneId || !routeId || !["save", "clear"].includes(operation)) {
      throw new HttpsError("invalid-argument", "The legacy route request is malformed.");
    }
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(routeId)) {
      throw new HttpsError("invalid-argument", "The route identifier is invalid.");
    }
    const rawPoints = request.data?.points ?? [];
    if (!Array.isArray(rawPoints) || rawPoints.length > 6000) {
      throw new HttpsError("resource-exhausted", "The legacy route contains too many points.");
    }
    const points = rawPoints.map((point) => {
      try {
        assertAllowedKeys(point || {}, new Set(["latitude", "longitude"]), "Legacy point");
      } catch (_) {
        throw new HttpsError("invalid-argument", "A legacy route point is malformed.");
      }
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new HttpsError("invalid-argument", "A legacy route coordinate is invalid.");
      }
      return {latitude, longitude};
    });
    const zoneRef = db.collection("campaignZones").doc(zoneId);
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const routeRef = db.collection("campaignRoutes").doc(routeId);
    await db.runTransaction(async (transaction) => {
      const [zoneSnapshot, campaignSnapshot, routeSnapshot] = await Promise.all([
        transaction.get(zoneRef), transaction.get(campaignRef), transaction.get(routeRef),
      ]);
      if (!zoneSnapshot.exists || !campaignSnapshot.exists) {
        throw new HttpsError("not-found", "The assigned job was not found.");
      }
      const zone = zoneSnapshot.data();
      if (zone.campaignId !== campaignId ||
          (!context.isAdmin && zone.assignedScalerId !== context.uid)) {
        throw new HttpsError("permission-denied", "This zone is not assigned to you.");
      }
      const existing = routeSnapshot.data();
      if (existing && existing.source !== "legacy_browser_v1") {
        throw new HttpsError("failed-precondition", "Native GPS evidence cannot be changed.");
      }
      if (existing && existing.scalerId !== context.uid && !context.isAdmin) {
        throw new HttpsError("permission-denied", "This route belongs to another Scaler.");
      }
      if (operation === "clear") {
        if (routeSnapshot.exists) transaction.delete(routeRef);
        transaction.update(zoneRef, {
          routeId: FieldValue.delete(),
          gpsTracking: false,
          gpsRoutePointCount: 0,
          gpsRouteSimulated: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      const tracking = request.data?.tracking === true;
      // Preserve the provenance of any historical development route. The
      // client cannot create or clear this marker, so an old simulated route
      // can never be laundered into production GPS evidence by a later save.
      const historicallySimulated = existing?.simulated === true;
      transaction.set(routeRef, {
        source: "legacy_browser_v1",
        schemaVersion: 1,
        campaignId,
        zoneId,
        zoneName: zone.zoneName || "Zone",
        scalerId: context.uid,
        scalerEmail: context.email || null,
        points,
        pointCount: points.length,
        tracking,
        simulated: historicallySimulated,
        lastAccuracyMeters: Number.isFinite(Number(request.data?.lastAccuracyMeters)) ?
          Math.max(0, Number(request.data.lastAccuracyMeters)) : null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
      }, {merge: false});
      transaction.update(zoneRef, {
        routeId,
        gpsTracking: tracking,
        gpsRoutePointCount: points.length,
        gpsRouteSimulated: historicallySimulated,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {routeId, pointCount: points.length, cleared: operation === "clear"};
  },
);

function campaignWorkPolicy(campaign = {}) {
  const propertyType = String(campaign.propertyType || campaign.serviceAreaType || "residential")
    .toLowerCase().includes("commercial") ? "commercial" : "residential";
  return {
    propertyType,
    timeZone: String(campaign.timeZone || "America/New_York"),
    start: campaign.workWindowStart || null,
    end: campaign.workWindowEnd || null,
  };
}

function materialRequiredForCampaign(campaign = {}) {
  const rawType = String(campaign.materialFulfillmentType ||
    campaign.materialHandoffMethod || "");
  if (rawType === "no_materials_required") return false;
  try {
    return operations.normalizeFulfillmentType(rawType) !== "no_materials_required";
  } catch (_) {
    return campaign.materialsRequired === true;
  }
}

function operationalCallable(name, handler) {
  return onCall(TRACKING_CALLABLE_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`Unexpected ${name} failure`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid || null,
      });
      throw new HttpsError("internal", "The operational request could not be completed.");
    }
  });
}

function assertOperationalPayload(data, allowed, maximumBytes) {
  try {
    assertAllowedKeys(data || {}, allowed, "Operational request");
  } catch (_) {
    throw new HttpsError("invalid-argument", "The operational request is malformed.");
  }
  if (serializedBytes(data) > maximumBytes) {
    throw new HttpsError("invalid-argument", "The operational request is too large.");
  }
}

function inAppNotification({id, userId, type, title, message, campaignId = null,
  zoneId = null, entityId = null, deepLink = null, priority = "normal",
  metadata = {}}) {
  return {
    id, userId, type, title, message, campaignId, zoneId, entityId,
    deepLink: deepLink || (zoneId ? {destination: "job_room", zoneId} : null),
    priority, metadata, read: false, channel: "in_app",
    emailRequested: false, pushRequested: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 2,
  };
}

function setInAppNotification(transaction, notification) {
  const ref = db.collection("notifications").doc(notification.id);
  transaction.set(ref, notification, {merge: true});
}

async function writeInAppNotification(notification) {
  await db.collection("notifications").doc(notification.id)
    .set(notification, {merge: true});
}

exports.notifyOnCampaignApplicationCreated = onDocumentCreated({
  document: "campaigns/{campaignId}/applications/{applicationId}",
  region: "us-east1", retry: false,
}, async (event) => {
  const application = event.data?.data() || {};
  const campaignId = event.params.campaignId;
  const scalerId = String(application.scalerId || event.params.applicationId || "");
  const businessId = String(application.businessId || "");
  if (!scalerId || !businessId) return;
  await writeInAppNotification(inAppNotification({
    id: `application-received_${campaignId}_${scalerId}`, userId: businessId,
    type: "application_received", title: "New Scaler application",
    message: "A Scaler applied for your campaign.", campaignId,
    entityId: event.params.applicationId,
    deepLink: {destination: "campaign_applicants", campaignId},
  }));
});

exports.notifyOnCampaignApplicationUpdated = onDocumentUpdated({
  document: "campaigns/{campaignId}/applications/{applicationId}",
  region: "us-east1", retry: false,
}, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  if (before.status === after.status) return;
  const scalerId = String(after.scalerId || event.params.applicationId || "");
  if (!scalerId || !["accepted", "rejected"].includes(String(after.status))) return;
  const campaignId = event.params.campaignId;
  const zoneId = String(after.assignedZoneId || "");
  const accepted = after.status === "accepted";
  await writeInAppNotification(inAppNotification({
    id: accepted && zoneId ? `assignment_${zoneId}_${scalerId}` :
      `application-${after.status}_${campaignId}_${scalerId}`,
    userId: scalerId, type: accepted ? "job_assignment" : "application_rejected",
    title: accepted ? "You're assigned to a job" : "Application update",
    message: accepted ? "Review your scheduled pay, material plan, and Job Room." :
      "Your application was not selected.",
    campaignId, zoneId: zoneId || null, entityId: event.params.applicationId,
    deepLink: accepted && zoneId ? {destination: "job_room", zoneId} :
      {destination: "campaign", campaignId},
    priority: accepted ? "high" : "normal",
  }));
});

exports.notifyOnCampaignZoneUpdated = onDocumentUpdated({
  document: "campaignZones/{zoneId}", region: "us-east1", retry: false,
}, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  const becameSubmitted = before.status !== after.status &&
    ["submitted", "verification_pending"].includes(String(after.status));
  const becamePaused = before.status !== "paused_work_window" &&
    after.status === "paused_work_window";
  if (!becameSubmitted && !becamePaused) return;
  const recipient = becameSubmitted ? after.businessId : after.assignedScalerId;
  if (!recipient) return;
  const zoneId = event.params.zoneId;
  await writeInAppNotification(inAppNotification({
    id: `${becameSubmitted ? "completion-submitted" : "work-cutoff"}_${zoneId}`,
    userId: recipient,
    type: becameSubmitted ? "zone_completion_submitted" : "work_cutoff_paused",
    title: becameSubmitted ? "Zone completion submitted" : "Work paused at cutoff",
    message: becameSubmitted ? "Verified work is ready for Business review." :
      "Route evidence was preserved. Resume during the next allowed work window.",
    campaignId: after.campaignId, zoneId, entityId: after.submittedCompletionId || zoneId,
    deepLink: {destination: becameSubmitted ? "campaign_review" : "job_room", zoneId,
      campaignId: after.campaignId}, priority: "high",
  }));
});

exports.notifyScalersOnCampaignOpened = onDocumentUpdated({
  document: "campaigns/{campaignId}", region: "us-east1", retry: false,
}, async (event) => {
  const before = event.data?.before.data() || {};
  const campaign = event.data?.after.data() || {};
  if (before.status === "open" || campaign.status !== "open") return;
  // A bounded candidate query prevents one Firestore query per Scaler. Detailed
  // geometry and travel policy are evaluated deterministically in memory.
  const candidateQuery = db.collection("discoveryPreferences").where("role", "==", "scaler");
  const populationSnapshot = await candidateQuery.count().get();
  const population = populationSnapshot.data().count;
  const capacity = scalerCapacity.capacityAssessment(population);
  if (capacity) {
    const issueId = scalerCapacity.issueIdentity(capacity.level);
    const issueRef = db.collection("adminIssues").doc(issueId);
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(issueRef)).exists) return;
      transaction.create(issueRef, {
        schemaVersion: scalerCapacity.POLICY_VERSION,
        issueId,
        type: "scaler_notification_matching_capacity",
        severity: capacity.severity,
        status: "open",
        entityType: "discoveryPreferences",
        entityId: null,
        summary: capacity.summary,
        dashboardDeepLink: "/#/admin",
        dedupeKey: `scaler-notification-capacity:${capacity.level}`,
        metadata: {savedScalerPreferenceCount: population,
          supportedPopulation: scalerCapacity.SUPPORTED_POPULATION},
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      });
    });
  }
  const candidates = await candidateQuery.limit(scalerCapacity.SUPPORTED_POPULATION).get();
  if (candidates.empty) return;
  const batch = db.batch();
  let writes = 0;
  for (const candidate of candidates.docs) {
    let decision;
    try { decision = scalerOpportunityDecision(candidate.data(), campaign); } catch (_) { continue; }
    if (!decision.matched) continue;
    const travel = decision.travelMatch && !decision.serviceAreaMatch;
    const id = `job-opportunity_${event.params.campaignId}_${candidate.id}`;
    if (candidate.data().alertDelivery?.inApp !== false) batch.set(db.collection("notifications").doc(id), {
      id, userId: candidate.id, type: travel ? "travel_job_opportunity" : "job_opportunity",
      title: travel ? "Travel Opportunity" : "New job in your area",
      message: travel ? "You're seeing this because you enabled higher-paying travel opportunities." :
        "A new job matches your saved work preferences.",
      campaignId: event.params.campaignId, relevanceReasons: decision.reasons,
      distanceMiles: decision.distance, read: false, createdAt: FieldValue.serverTimestamp(),
      schemaVersion: "OpportunityNotificationV1",
    }, {merge: false});
    if (candidate.data().alertDelivery?.inApp !== false) writes += 1;
    if (candidate.data().alertDelivery?.email === true) {
      const user = await db.collection("users").doc(candidate.id).get();
      const recipient = user.data()?.email;
      try {
        const emailJob = scalerJobAlertEmail.createJob({campaignId: event.params.campaignId,
          scalerUid: candidate.id, recipient, campaignName: campaign.name,
          jobType: campaign.jobType || campaign.campaignType,
          areaLabel: campaign.areaLabel || campaign.locationName,
          reasons: decision.reasons});
        const jobRef = db.collection(scalerJobAlertEmail.EMAIL_JOB_COLLECTION).doc(emailJob.id);
        const policyNow = new Date();
        const limitRef = db.collection("scalerJobAlertEmailRateLimits")
          .doc(scalerJobAlertEmail.rateLimitId(candidate.id, policyNow));
        await db.runTransaction(async (transaction) => {
          const [existingJob, limit] = await Promise.all([
            transaction.get(jobRef), transaction.get(limitRef),
          ]);
          // A preference change cannot replay old campaigns: this producer runs
          // only when a campaign newly transitions to open, and an existing
          // campaign+Scaler job is never recreated.
          const sentOrQueued = Number(limit.data()?.count || 0);
          if (!scalerJobAlertEmail.canQueue({jobExists: existingJob.exists,
            dailyCount: sentOrQueued})) return;
          transaction.create(jobRef, {...emailJob, createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()});
          transaction.set(limitRef, {schemaVersion: scalerJobAlertEmail.POLICY_VERSION,
            scalerUid: candidate.id, day: scalerJobAlertEmail.utcDay(policyNow),
            count: sentOrQueued + 1, limit: scalerJobAlertEmail.DAILY_LIMIT,
            updatedAt: FieldValue.serverTimestamp()}, {merge: false});
        });
      } catch (_) { /* Missing/invalid authoritative account email fails closed. */ }
    }
  }
  if (writes) await batch.commit();
});


function appendJobEvent(transaction, {campaignId, zoneId, businessId, scalerId, type, actorId, metadata = {}}) {
  const ref = db.collection("jobEvents").doc();
  transaction.create(ref, {
    campaignId,
    zoneId,
    businessId,
    scalerId,
    type,
    actorId,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
  return ref.id;
}

async function assertOperationalStart(transaction, {campaign, zone, context, participant = null}) {
  const deadlineValue = zone.deadline || campaign.deadline || null;
  const deadline = deadlineValue instanceof Timestamp ? deadlineValue.toDate() :
    deadlineValue instanceof Date ? deadlineValue :
      (deadlineValue ? new Date(deadlineValue) : null);
  if (deadline && (!Number.isFinite(deadline.getTime()) || deadline.getTime() < Date.now())) {
    throw new HttpsError("failed-precondition", "This campaign deadline has passed.");
  }
  const workWindow = operations.evaluateWorkWindow({
    ...campaignWorkPolicy(campaign),
    date: new Date(),
  });
  const materialRequired = materialRequiredForCampaign(campaign);
  let handoffStatus = "not_required";
  if (materialRequired) {
    const handoffId = participant?.materialHandoffId || zone.id;
    const handoffSnapshot = await transaction.get(db.collection("materialHandoffs").doc(handoffId));
    handoffStatus = String(handoffSnapshot.data()?.status || "scheduled");
  }
  const eligibility = operations.evaluateJobStart({materialRequired, handoffStatus, workWindow});
  // Operational safety gates apply to every actor, including support/admin.
  // Admins may repair the underlying handoff/window state through trusted
  // support actions, but may not bypass the material or work-hour gate.
  if (!eligibility.allowed) {
    throw new HttpsError("failed-precondition",
      eligibility.reason === "material_not_received" ?
        "Confirm material receipt before starting this job." :
        `This job may only run between ${workWindow.start} and ${workWindow.end} ${workWindow.timeZone}.`);
  }
  return {workWindow, materialRequired, handoffStatus};
}

exports.startAssignedZone = trackingCallable("startAssignedZone", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId", "zoneId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in before starting this job.");
  if (context.role !== "scaler" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only the assigned Scaler can start this job.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const participantRef = db.collection("zoneScalerParticipations")
    .doc(groupAssignment.participantId(zoneId, context.uid));
  await db.runTransaction(async (transaction) => {
    const [zoneSnapshot, campaignSnapshot, participantSnapshot] = await Promise.all([
      transaction.get(zoneRef), transaction.get(campaignRef), transaction.get(participantRef),
    ]);
    if (!zoneSnapshot.exists || !campaignSnapshot.exists) {
      throw new HttpsError("not-found", "The assigned zone was not found.");
    }
    const zone = zoneSnapshot.data();
    const campaign = campaignSnapshot.data();
    const participant = participantSnapshot.data() || null;
    const groupAuthorized = participantSnapshot.exists && participant?.scalerUid === context.uid &&
      ["accepted", "started", "participating", "paused_work_window"].includes(String(participant.status));
    if (zone.campaignId !== campaignId ||
        (!context.isAdmin && zone.assignedScalerId !== context.uid && !groupAuthorized)) {
      throw new HttpsError("permission-denied", "This zone is not assigned to you.");
    }
    const status = String(zone.status || "assigned");
    // Another group participant may already have placed the shared zone in
    // progress. Each participant still has to pass their own material/window
    // gate and establish their own attendance/tracking authority.
    if (status === "in_progress" && !participant) return;
    if (!["assigned", "accepted", "paused_work_window"].includes(status)) {
      throw new HttpsError("failed-precondition", "This job cannot be started in its current state.");
    }
    const gate = await assertOperationalStart(transaction, {
      campaign, zone: {...zone, id: zoneId}, context, participant,
    });
    transaction.update(zoneRef, {
      status: "in_progress",
      startedAt: FieldValue.serverTimestamp(),
      workWindowEnd: gate.workWindow.end,
      workTimeZone: gate.workWindow.timeZone,
      workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
      workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (participant) transaction.update(participantRef, {
      status: "started", attendanceStatus: "started",
      startedAt: participant.startedAt || FieldValue.serverTimestamp(),
      workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendJobEvent(transaction, {
      campaignId, zoneId, businessId: campaign.businessId,
      scalerId: participant?.scalerUid || zone.assignedScalerId,
      participantId: participant?.participantId || null,
      actorId: context.uid, type: "job.start_authorized",
    });
    appendJobEvent(transaction, {
      campaignId, zoneId, businessId: campaign.businessId,
      scalerId: zone.assignedScalerId, actorId: context.uid, type: "job.started",
    });
  });
  return {status: "in_progress"};
});

// Operational safety net. This never marks work complete and never deletes route
// evidence. It only closes the active native collection session at the trusted
// work-window cutoff and leaves the zone resumable on a later allowed day.
async function enforceOperationalWorkCutoffsHandler() {
    const snapshot = await db.collection("campaignZones")
      .where("status", "==", "in_progress").limit(250).get();
    const result = {scanned: snapshot.size, warned: 0, paused: 0, skipped: 0};
    for (const zoneDoc of snapshot.docs) {
      await db.runTransaction(async (transaction) => {
        const zoneRef = zoneDoc.ref;
        const freshZoneSnapshot = await transaction.get(zoneRef);
        if (!freshZoneSnapshot.exists) { result.skipped += 1; return; }
        const zone = freshZoneSnapshot.data() || {};
        if (zone.groupAssignmentId) { result.skipped += 1; return; }
        if (String(zone.status) !== "in_progress") {
          result.skipped += 1; return;
        }
        const action = operations.classifyCutoffAction({
          status: zone.status,
          now: new Date(),
          warningAt: zone.workWindowWarningAt,
          cutoffAt: zone.workWindowCutoffAt,
        });
        if (action === "none") { result.skipped += 1; return; }

        let sessionRef = null;
        let sessionSnapshot = null;
        let pointerRef = null;
        let pointerSnapshot = null;
        if (action === "pause" && zone.activeTrackingSessionId) {
          sessionRef = db.collection("trackingSessions").doc(String(zone.activeTrackingSessionId));
          pointerRef = db.collection("activeTrackingSessions").doc(String(zone.assignedScalerId || ""));
          [sessionSnapshot, pointerSnapshot] = await Promise.all([
            transaction.get(sessionRef), transaction.get(pointerRef),
          ]);
        }

        if (action === "warn") {
          if (zone.cutoffWarningIssuedAt) return;
          transaction.update(zoneRef, {cutoffWarningIssuedAt: FieldValue.serverTimestamp()});
          appendJobEvent(transaction, {
            campaignId: zone.campaignId, zoneId: zoneDoc.id,
            businessId: zone.businessId, scalerId: zone.assignedScalerId,
            actorId: "system", type: "job.cutoff_warning",
          });
          result.warned += 1;
          return;
        }

        transaction.update(zoneRef, {
          status: "paused_work_window", gpsTracking: false,
          workWindowPausedAt: FieldValue.serverTimestamp(),
          activeTrackingSessionId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (sessionSnapshot?.exists && String(sessionSnapshot.data()?.status) === "active") {
          const session = sessionSnapshot.data() || {};
          const segmentId = String(session.currentSegmentId || "");
          transaction.update(sessionRef, {
            status: "paused", syncStatus: "paused_work_window",
            pauseReason: "work_window_cutoff", pausedAt: FieldValue.serverTimestamp(),
            currentSegmentId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
          });
          if (segmentId) transaction.set(sessionRef.collection("segments").doc(segmentId), {
            status: "closed_cutoff", closeReason: "work_window_cutoff",
            endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          transaction.update(zoneRef, {resumableTrackingSessionId: sessionRef.id});
        }
        if (pointerSnapshot?.exists &&
            String(pointerSnapshot.data()?.sessionId) === String(zone.activeTrackingSessionId)) {
          transaction.delete(pointerRef);
        }
        appendJobEvent(transaction, {
          campaignId: zone.campaignId, zoneId: zoneDoc.id,
          businessId: zone.businessId, scalerId: zone.assignedScalerId,
          actorId: "system", type: "job.cutoff_paused",
        });
        result.paused += 1;
      });
    }
    const participants = await db.collection("zoneScalerParticipations")
      .where("gpsTracking", "==", true).limit(250).get();
    result.groupParticipantsScanned = participants.size;
    for (const participantDoc of participants.docs) {
      await db.runTransaction(async (transaction) => {
        const participantRef = participantDoc.ref;
        const participantSnapshot = await transaction.get(participantRef);
        const participant = participantSnapshot.data() || {};
        const action = operations.classifyCutoffAction({status: participant.gpsTracking ? "in_progress" : participant.status,
          now: new Date(), warningAt: participant.workWindowWarningAt, cutoffAt: participant.workWindowCutoffAt});
        if (action === "none") return;
        if (action === "warn") {
          if (!participant.cutoffWarningIssuedAt) transaction.update(participantRef, {cutoffWarningIssuedAt: FieldValue.serverTimestamp()});
          return;
        }
        const sessionId = String(participant.activeTrackingSessionId || "");
        if (!sessionId) return;
        const sessionRef = db.collection("trackingSessions").doc(sessionId);
        const pointerRef = db.collection("activeTrackingSessions").doc(String(participant.scalerUid || ""));
        const [sessionSnapshot, pointerSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(pointerRef)]);
        const session = sessionSnapshot.data() || {}; const segmentId = String(session.currentSegmentId || "");
        if (session.status === "active") {
          transaction.update(sessionRef, {status: "paused", syncStatus: "paused_work_window",
            pauseReason: "work_window_cutoff", pausedAt: FieldValue.serverTimestamp(),
            currentSegmentId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()});
          if (segmentId) transaction.set(sessionRef.collection("segments").doc(segmentId), {status: "closed_cutoff",
            closeReason: "work_window_cutoff", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        }
        transaction.update(participantRef, {status: "paused_work_window", gpsTracking: false,
          activeTrackingSessionId: FieldValue.delete(), resumableTrackingSessionId: sessionId,
          workWindowPausedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
        if (pointerSnapshot.exists && pointerSnapshot.data()?.sessionId === sessionId) transaction.delete(pointerRef);
        appendJobEvent(transaction, {campaignId: participant.campaignId, zoneId: participant.zoneId,
          businessId: participant.businessId, scalerId: participant.scalerUid,
          actorId: "system", type: "job.cutoff_paused", metadata: {participantId: participantDoc.id}});
      });
    }
    return result;
}

exports.enforceOperationalWorkCutoffs = onSchedule(
  {schedule: "every 5 minutes", timeZone: "UTC", retryCount: 0, region: "us-east1"},
  enforceOperationalWorkCutoffsHandler,
);
// A property on the scheduled export (not a separate deployable Function) lets
// emulator regression tests exercise the identical trusted cutoff handler.
exports.enforceOperationalWorkCutoffs.__testRun = enforceOperationalWorkCutoffsHandler;

exports.assignScalerToZone = trackingCallable("assignScalerToZone", async (request) => {
  assertTrackingPayload(
    request.data,
    new Set(["campaignId", "zoneId", "applicationId"]),
    4096,
  );
  const context = await requireVerifiedUser(request, "Sign in before assigning a Scaler.");
  if (context.role !== "business" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only the campaign business can assign this zone.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  const applicationId = String(request.data?.applicationId || "").trim();
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const applicationRef = campaignRef.collection("applications").doc(applicationId);
  let result = {};
  await db.runTransaction(async (transaction) => {
    const [campaignSnapshot, zoneSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(campaignRef), transaction.get(zoneRef), transaction.get(applicationRef),
    ]);
    if (!campaignSnapshot.exists || !zoneSnapshot.exists || !applicationSnapshot.exists) {
      throw new HttpsError("not-found", "The campaign assignment is no longer available.");
    }
    const campaign = campaignSnapshot.data();
    const zone = zoneSnapshot.data();
    const application = applicationSnapshot.data();
    const materialLogistics = operations.materialLogisticsFromCampaign(campaign);
    const materialLogisticsDigest = operations.materialLogisticsDigest(materialLogistics);
    const materialLogisticsVersion = Number(campaign.materialLogisticsVersion || 1);
    if (campaign.materialLogisticsLockedAt && campaign.materialLogisticsDigest &&
        campaign.materialLogisticsDigest !== materialLogisticsDigest) {
      throw new HttpsError("failed-precondition",
        "The locked material plan requires trusted support reconciliation.");
    }
    if (!context.isAdmin && campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "This campaign does not belong to you.");
    }
    if (String(campaign.status || "") !== "open") {
      throw new HttpsError("failed-precondition", "This campaign is no longer accepting Scaler assignments.");
    }
    if (zone.campaignId !== campaignId || zone.businessId !== campaign.businessId) {
      throw new HttpsError("failed-precondition", "The zone does not belong to this campaign.");
    }
    if (application.status !== "pending" ||
        (application.campaignId && application.campaignId !== campaignId)) {
      throw new HttpsError("failed-precondition", "This application has already been processed.");
    }
    if (zone.assignedScalerId) {
      throw new HttpsError("failed-precondition", "This zone has already been assigned.");
    }
    if (zone.analysisStatus !== "complete" ||
        zone.serverZoneMetricsVersion !== "geometry_v1_server") {
      throw new HttpsError(
        "failed-precondition",
        "Analyze this zone with the current server estimator before assigning it.",
      );
    }
    try {
      const currentEstimate = operations.calculateGeometryWalkingEstimate(zone.serviceArea);
      const currentDigest = operations.zoneGeometryDigest(zone.serviceArea);
      if (zone.serverZoneGeometryDigest !== currentDigest ||
          Number(zone.serverEstimatedWalkingMinutes) !== currentEstimate.estimatedWalkingMinutes) {
        throw new Error("stale_zone_analysis");
      }
      operations.assertZoneDuration(currentEstimate.estimatedWalkingMinutes);
    } catch (_) {
      throw new HttpsError(
        "failed-precondition",
        "Re-analyze this zone. A one-Scaler zone cannot exceed 360 estimated walking minutes; split larger areas first.",
      );
    }
    const scalerId = String(application.scalerId || "").trim();
    const scalerEmail = String(application.scalerEmail || application.email || "").trim();
    const pointCount = Number(zone.serviceAreaPointCount || 0);
    const assignedHomes = Number(zone.estimatedHomes || 0);
    if (!scalerId || pointCount < 3 || !Number.isSafeInteger(assignedHomes) || assignedHomes <= 0) {
      throw new HttpsError("failed-precondition", "The mapped assignment is incomplete.");
    }
    await requireCurrentLegalConsents(
      scalerId,
      legalConsent.ROLE_REQUIREMENTS.scaler_work,
      transaction,
      "The Scaler must accept the current Terms and Scaler Work Terms before assignment.",
    );
    const zoneName = String(zone.zoneName || "Zone");
    const baseAmountCents = Number.isSafeInteger(zone.baseAmountCents) ?
      zone.baseAmountCents : Math.round(Number(campaign.basePay || 0) * 100);
    const bonusAmountCents = Number.isSafeInteger(zone.bonusAmountCents) ?
      zone.bonusAmountCents : Math.round(Number(campaign.bonus || 0) * 100);
    const counterofferAmountCents = Number.isSafeInteger(
      application.counterofferAmountCents,
    ) ? application.counterofferAmountCents : null;
    marketplace.assertSafeCents(baseAmountCents, "baseAmountCents");
    marketplace.assertSafeCents(bonusAmountCents, "bonusAmountCents");
    if (counterofferAmountCents !== null) {
      marketplace.assertSafeCents(
        counterofferAmountCents,
        "acceptedCounterofferAmountCents",
      );
    }
    const compensationRef = db.collection("assignmentCompensations").doc(zoneId);
    const jobRoomRef = db.collection("jobRooms").doc(zoneId);
    const handoffRef = db.collection("materialHandoffs").doc(zoneId);
    const [compensationSnapshot, roomSnapshot, handoffSnapshot] = await Promise.all([
      transaction.get(compensationRef), transaction.get(jobRoomRef), transaction.get(handoffRef),
    ]);
    if (compensationSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "This zone already has an authoritative compensation contract.",
      );
    }
    transaction.create(compensationRef, {
      campaignId,
      zoneId,
      scalerId,
      businessId: campaign.businessId,
      currency: marketplace.CURRENCY,
      baseAmountCents,
      bonusAmountCents,
      acceptedCounterofferAmountCents: counterofferAmountCents,
      compensationVersion: 1,
      acceptedMaterialLogisticsVersion: materialLogisticsVersion,
      acceptedMaterialLogisticsDigest: materialLogisticsDigest,
      acceptedMaterialLogistics: materialLogistics,
      immutable: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!roomSnapshot.exists) {
      transaction.create(jobRoomRef, {
        campaignId, zoneId, businessId: campaign.businessId, scalerId,
        materialLogistics: {...materialLogistics, version: materialLogisticsVersion},
        materialLogisticsVersion, materialLogisticsDigest,
        materialLogisticsLockedAt: FieldValue.serverTimestamp(),
        materialLogisticsLockedReason: "scaler_assignment",
        status: "open", createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1,
      });
    }
    if (!handoffSnapshot.exists) {
      const required = materialRequiredForCampaign(campaign);
      const rawType = String(campaign.materialFulfillmentType ||
        campaign.materialHandoffMethod || "");
      transaction.create(handoffRef, {
        campaignId, zoneId, businessId: campaign.businessId, scalerId,
        required,
        fulfillmentType: required ? operations.normalizeFulfillmentType(rawType) : null,
        status: required ? "scheduled" : "not_required",
        workerAmountCents: baseAmountCents,
        platformFeeCents: Number.isSafeInteger(campaign.platformFeeCents) ?
          campaign.platformFeeCents : Math.round(baseAmountCents * 0.2),
        scheduledAt: campaign.materialHandoffScheduledAt || null,
        privateLocation: campaign.materialHandoffAddress || campaign.materialPickupAddress ||
          campaign.materialDropoffAddress || null,
        instructions: campaign.materialHandoffInstructions || null,
        logisticsVersion: materialLogisticsVersion,
        logisticsDigest: materialLogisticsDigest,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
    }
    transaction.update(applicationRef, {
      status: "accepted", assignmentMode: "zone", assignedZoneId: zoneId,
      assignedZoneName: zoneName, assignedHomes,
      acceptedMaterialLogisticsVersion: materialLogisticsVersion,
      acceptedMaterialLogisticsDigest: materialLogisticsDigest,
      acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, {
      assignedScalerId: scalerId, assignedScalerEmail: scalerEmail || null,
      assignedApplicationId: applicationId, assignedHomes,
      assignedHomeCountSource: "estimatedHomes",
      assignedHomeCountLockedAt: FieldValue.serverTimestamp(), status: "assigned",
      compensationContractId: compensationRef.id,
      materialLogisticsVersion, materialLogisticsDigest,
      materialLogisticsLockedAt: FieldValue.serverTimestamp(),
      materialLogisticsLockedReason: "scaler_assignment",
      assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (!campaign.materialLogisticsLockedAt) {
      transaction.update(campaignRef, {
        materialLogisticsVersion, materialLogisticsDigest,
        materialLogisticsLockedAt: FieldValue.serverTimestamp(),
        materialLogisticsLockedReason: "scaler_assignment",
        materialLogisticsLockedZoneId: zoneId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    setInAppNotification(transaction, inAppNotification({
      id: `assignment_${zoneId}_${scalerId}`, userId: scalerId,
      type: "job_assignment", title: `You're assigned to ${zoneName}`,
      message: `Review your scheduled pay, material plan, and Job Room.`,
      campaignId, zoneId, entityId: applicationId,
      deepLink: {destination: "job_room", zoneId}, priority: "high",
      metadata: {assignedHomes, materialLogisticsVersion},
    }));
    setInAppNotification(transaction, inAppNotification({
      id: `material-lock_${zoneId}_${scalerId}`, userId: scalerId,
      type: "material_logistics_locked", title: "Material plan locked",
      message: `${materialLogistics.fulfillmentType.replaceAll("_", " ")} • Review the confirmed plan in the Job Room.`,
      campaignId, zoneId, entityId: materialLogisticsDigest,
      deepLink: {destination: "job_room", zoneId}, priority: "high",
      metadata: {materialLogisticsVersion},
    }));
    appendJobEvent(transaction, {
      campaignId, zoneId, businessId: campaign.businessId, scalerId,
      actorId: context.uid, type: "assignment.accepted",
    });
    if (materialRequiredForCampaign(campaign)) {
      appendJobEvent(transaction, {
        campaignId, zoneId, businessId: campaign.businessId, scalerId,
        actorId: context.uid, type: "material.handoff_scheduled",
      });
    }
    result = {scalerId, scalerEmail, zoneName, assignedHomes};
  });
  return result;
});

exports.configureZoneGroupAssignment = trackingCallable(
  "configureZoneGroupAssignment", async (request) => {
    assertTrackingPayload(request.data, new Set(["campaignId", "zoneId", "requiredScalerCount"]), 4096);
    const context = await requireVerifiedUser(request, "Sign in before configuring group work.");
    if (context.role !== "business" && !context.isAdmin) throw new HttpsError("permission-denied", "Only the campaign Business can configure group work.");
    const campaignId = String(request.data?.campaignId || "").trim();
    const zoneId = String(request.data?.zoneId || "").trim();
    const requested = assertProductionScalerCount(
      request.data?.requiredScalerCount ?? 1,
    );
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const zoneRef = db.collection("campaignZones").doc(zoneId);
    const groupRef = db.collection("zoneGroupAssignments").doc(zoneId);
    let result;
    await db.runTransaction(async (transaction) => {
      const [campaignSnapshot, zoneSnapshot, groupSnapshot] = await Promise.all([
        transaction.get(campaignRef), transaction.get(zoneRef), transaction.get(groupRef),
      ]);
      if (!campaignSnapshot.exists || !zoneSnapshot.exists) throw new HttpsError("not-found", "Campaign zone not found.");
      const campaign = campaignSnapshot.data() || {}; const zone = zoneSnapshot.data() || {};
      if ((!context.isAdmin && campaign.businessId !== context.uid) || zone.campaignId !== campaignId) throw new HttpsError("permission-denied", "This campaign does not belong to you.");
      if (String(campaign.status || "") !== "open") throw new HttpsError("failed-precondition", "This campaign is no longer accepting Scaler assignments.");
      if (zone.assignedScalerId || groupSnapshot.exists || !["unassigned", "available"].includes(String(zone.status))) {
        throw new HttpsError("failed-precondition", "Group size is locked after assignment begins.");
      }
      const estimate = operations.calculateGeometryWalkingEstimate(zone.serviceArea);
      if (zone.serverZoneGeometryDigest !== operations.zoneGeometryDigest(zone.serviceArea) ||
          Number(zone.serverEstimatedWalkingMinutes) !== estimate.estimatedWalkingMinutes) {
        throw new HttpsError("failed-precondition", "Re-analyze this zone before configuring group work.");
      }
      operations.assertZoneDuration(estimate.estimatedWalkingMinutes);
      const workerPoolCents = Number.isSafeInteger(zone.workerPoolCents) ? zone.workerPoolCents :
        Number.isSafeInteger(zone.baseAmountCents) ? zone.baseAmountCents : marketplace.campaignWorkerAmountCents(campaign);
      let policy;
      try { policy = groupAssignment.validateGroupConfiguration({workerPoolCents,
        requiredScalerCount: requested,
        estimatedGroupWorkMinutes: estimate.estimatedWalkingMinutes}); }
      catch (error) { throw new HttpsError("failed-precondition", String(error.message).startsWith("participant_share_below") ?
        "Choose fewer Scalers or increase the group worker-pay pool." : "The group configuration is invalid."); }
      transaction.create(groupRef, {campaignId, zoneId, businessId: campaign.businessId,
        requestedScalerCount: policy.requiredScalerCount, requiredScalerCount: policy.requiredScalerCount,
        workerPoolCents: policy.workerPoolCents,
        recommendedWorkerPoolCents: policy.recommendedWorkerPoolCents,
        estimatedIndividualShareCents: policy.estimatedIndividualShareCents,
        minimumParticipantShareCents: policy.minimumParticipantShareCents,
        absoluteMinimumParticipantShareCents: policy.absoluteMinimumParticipantShareCents,
        workloadBasedMinimumParticipantShareCents: policy.workloadBasedMinimumParticipantShareCents,
        estimatedGroupWorkMinutes: policy.estimatedGroupWorkMinutes,
        estimatedParticipantMinutes: policy.estimatedParticipantMinutes,
        maximumScalerCountForPool: policy.maximumScalerCountForPool,
        initialSharesCents: policy.initialSharesCents, acceptedScalerCount: 0, acceptedScalerIds: [],
        platformFeeRateBasisPoints: marketplace.PLATFORM_FEE_BASIS_POINTS,
        platformFeeContractVersion: groupAssignment.PLATFORM_FEE_CONTRACT_VERSION,
        compensationVersion: 1, status: "open", policyVersion: policy.version,
        settlementPolicyVersion: groupAssignment.GROUP_SETTLEMENT_POLICY_VERSION,
        substantialCompletionThresholdBps: groupAssignment.SUBSTANTIAL_COMPLETION_THRESHOLD_BPS,
        contributionAlgorithmVersion: groupAssignment.VERIFIED_CONTRIBUTION_VERSION,
        minimumParticipantPolicyVersion: groupAssignment.MINIMUM_PARTICIPANT_POLICY_VERSION,
        businessPolicyDisclosure: groupAssignment.BUSINESS_GROUP_POLICY_DISCLOSURE,
        scalerPolicyDisclosure: groupAssignment.SCALER_GROUP_POLICY_DISCLOSURE,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      transaction.update(zoneRef, {requiredScalerCount: policy.requiredScalerCount,
        workerPoolCents: policy.workerPoolCents, groupAssignmentId: zoneId,
        groupAssignmentStatus: "open", updatedAt: FieldValue.serverTimestamp()});
      result = policy;
    });
    return result;
  });

exports.acceptZoneGroupSlot = trackingCallable("acceptZoneGroupSlot", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId", "zoneId", "applicationId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in before accepting group work.");
  if (!["scaler", "business"].includes(context.role) && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only the applicant or owning Business can fill a group slot.");
  }
  const campaignId = String(request.data?.campaignId || "").trim(); const zoneId = String(request.data?.zoneId || "").trim();
  const applicationId = String(request.data?.applicationId || "").trim(); const groupRef = db.collection("zoneGroupAssignments").doc(zoneId);
  const zoneRef = db.collection("campaignZones").doc(zoneId); const applicationRef = db.collection("campaigns").doc(campaignId).collection("applications").doc(applicationId);
  // The Scaler identity comes only from the authoritative application. The
  // caller cannot substitute a participant ID when the Business fills a slot.
  const applicationIdentity = (await applicationRef.get()).data() || {};
  const scalerUid = String(applicationIdentity.scalerId || "").trim();
  if (!scalerUid) throw new HttpsError("not-found", "The Scaler application was not found.");
  const participantRef = db.collection("zoneScalerParticipations")
    .doc(groupAssignment.participantId(zoneId, scalerUid));
  const roomRef = db.collection("jobRooms").doc(zoneId);
  let result;
  await db.runTransaction(async (transaction) => {
    const [groupSnapshot, zoneSnapshot, applicationSnapshot, existingParticipant,
      participantQuery, campaignSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(groupRef), transaction.get(zoneRef), transaction.get(applicationRef), transaction.get(participantRef),
      transaction.get(db.collection("zoneScalerParticipations").where("zoneId", "==", zoneId)),
      transaction.get(db.collection("campaigns").doc(campaignId)), transaction.get(roomRef),
    ]);
    if (!groupSnapshot.exists || !zoneSnapshot.exists || !applicationSnapshot.exists) throw new HttpsError("not-found", "Group opportunity not found.");
    const group = groupSnapshot.data() || {}; const zone = zoneSnapshot.data() || {}; const application = applicationSnapshot.data() || {};
    const ownsGroup = group.businessId === context.uid;
    const ownsApplication = application.scalerId === context.uid;
    if (zone.campaignId !== campaignId || group.campaignId !== campaignId ||
        application.scalerId !== scalerUid ||
        (!context.isAdmin && !ownsGroup && !ownsApplication)) {
      throw new HttpsError("permission-denied", "This group slot is not available to you.");
    }
    if (existingParticipant.exists) { result = existingParticipant.data(); return; }
    await requireCurrentLegalConsents(
      scalerUid,
      legalConsent.ROLE_REQUIREMENTS.scaler_work,
      transaction,
      "The Scaler must accept the current Terms and Scaler Work Terms before accepting work.",
    );
    const participants = participantQuery.docs.map((doc) => doc.data()); let slot;
    try { slot = groupAssignment.assertSlotAvailable({requiredScalerCount: group.requiredScalerCount, participants, scalerUid}); }
    catch (error) { throw new HttpsError("failed-precondition", error.message === "group_slots_full" ? "All group slots are filled." : "You already hold a slot for this zone."); }
    const share = Number(group.initialSharesCents?.[slot - 1]);
    const participant = groupAssignment.initialParticipant({zoneId, campaignId, businessId: group.businessId,
      scalerUid, slotNumber: slot, shareCents: share});
    const campaign = campaignSnapshot.data() || {}; const materialRequired = materialRequiredForCampaign(campaign);
    if (String(campaign.status || "") !== "open") {
      throw new HttpsError("failed-precondition", "This campaign is no longer accepting Scaler assignments.");
    }
    const materialLogistics = operations.materialLogisticsFromCampaign(campaign);
    const materialLogisticsDigest = operations.materialLogisticsDigest(materialLogistics);
    const materialLogisticsVersion = Number(campaign.materialLogisticsVersion || 1);
    if (campaign.materialLogisticsLockedAt && campaign.materialLogisticsDigest &&
        campaign.materialLogisticsDigest !== materialLogisticsDigest) {
      throw new HttpsError("failed-precondition",
        "The locked material plan requires trusted support reconciliation.");
    }
    const materialHandoffId = materialRequired ? `${zoneId}__${participant.participantId}` : null;
    transaction.create(participantRef, {...participant, applicationId, materialHandoffId,
      acceptedMaterialLogisticsVersion: materialLogisticsVersion,
      acceptedMaterialLogisticsDigest: materialLogisticsDigest,
      acceptedMaterialLogistics: materialLogistics,
      acceptedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    if (materialRequired) transaction.create(db.collection("materialHandoffs").doc(materialHandoffId), {
      campaignId, zoneId, groupAssignmentId: zoneId, participantId: participant.participantId,
      businessId: group.businessId, scalerId: scalerUid, required: true,
      fulfillmentType: operations.normalizeFulfillmentType(String(campaign.materialFulfillmentType || campaign.materialHandoffMethod || "")),
      status: "scheduled", workerAmountCents: share,
      scheduledAt: campaign.materialHandoffScheduledAt || null,
      windowEndAt: campaign.materialHandoffWindowEndAt || null,
      privateLocation: campaign.materialHandoffAddress ||
        campaign.materialPickupAddress || campaign.materialDropoffAddress || null,
      printingShopName: campaign.materialHandoffPrintingShopName || null,
      orderReference: campaign.materialHandoffOrderReference || null,
      instructions: campaign.materialHandoffInstructions || null,
      logisticsVersion: materialLogisticsVersion,
      logisticsDigest: materialLogisticsDigest,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), schemaVersion: 2});
    if (roomSnapshot.exists) {
      transaction.update(roomRef, {
        scalerIds: FieldValue.arrayUnion(scalerUid), groupAssignmentId: zoneId,
        materialLogistics: {...materialLogistics, version: materialLogisticsVersion},
        materialLogisticsVersion, materialLogisticsDigest,
        materialLogisticsLockedAt: roomSnapshot.data()?.materialLogisticsLockedAt || FieldValue.serverTimestamp(),
        materialLogisticsLockedReason: "scaler_assignment",
        updatedAt: FieldValue.serverTimestamp(), schemaVersion: 2,
      });
    } else {
      transaction.create(roomRef, {
        campaignId, zoneId, businessId: group.businessId, scalerIds: [scalerUid],
        materialLogistics: {...materialLogistics, version: materialLogisticsVersion},
        materialLogisticsVersion, materialLogisticsDigest,
        materialLogisticsLockedAt: FieldValue.serverTimestamp(),
        materialLogisticsLockedReason: "scaler_assignment",
        groupAssignmentId: zoneId, status: "open", createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), schemaVersion: 2,
      });
    }
    transaction.update(applicationRef, {status: "accepted", assignmentMode: "group_slot", assignedZoneId: zoneId,
      participantId: participant.participantId, scheduledShareCents: share,
      acceptedMaterialLogisticsVersion: materialLogisticsVersion,
      acceptedMaterialLogisticsDigest: materialLogisticsDigest,
      acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    transaction.update(groupRef, {acceptedScalerCount: participants.filter((item) => !["declined", "cancelled_before_window", "replaced"].includes(item.status)).length + 1,
      acceptedScalerIds: FieldValue.arrayUnion(scalerUid),
      status: participants.length + 1 >= group.requiredScalerCount ? "filled" : "open", updatedAt: FieldValue.serverTimestamp()});
    transaction.update(zoneRef, {groupAssignmentStatus: participants.length + 1 >= group.requiredScalerCount ? "filled" : "open",
      assignedScalerIds: FieldValue.arrayUnion(scalerUid),
      materialLogisticsVersion, materialLogisticsDigest,
      materialLogisticsLockedAt: zone.materialLogisticsLockedAt || FieldValue.serverTimestamp(),
      materialLogisticsLockedReason: "scaler_assignment",
      status: "assigned", updatedAt: FieldValue.serverTimestamp()});
    const assignedCount = participants.filter((item) =>
      !["declined", "cancelled_before_window", "replaced"].includes(item.status)).length + 1;
    const zoneName = String(zone.zoneName || "this group zone");
    setInAppNotification(transaction, inAppNotification({
      id: `assignment_${zoneId}_${scalerUid}`, userId: scalerUid,
      type: "job_assignment", title: `You're assigned to ${zoneName}`,
      message: `Your scheduled share is $${(share / 100).toFixed(2)}. Review the material plan and Job Room.`,
      campaignId, zoneId, entityId: participant.participantId,
      deepLink: {destination: "job_room", zoneId}, priority: "high",
      metadata: {scheduledShareCents: share, groupSize: group.requiredScalerCount},
    }));
    setInAppNotification(transaction, inAppNotification({
      id: `group-assignment_${zoneId}_${scalerUid}`, userId: group.businessId,
      type: "group_assignment_progress", title: `${assignedCount} of ${group.requiredScalerCount} Scalers assigned`,
      message: `${application.scalerName || application.scalerEmail || "A Scaler"} joined ${zoneName}.`,
      campaignId, zoneId, entityId: participant.participantId,
      deepLink: {destination: "job_room", zoneId},
      metadata: {assignedCount, requiredCount: group.requiredScalerCount},
    }));
    setInAppNotification(transaction, inAppNotification({
      id: `material-lock_${zoneId}_${scalerUid}`, userId: scalerUid,
      type: "material_logistics_locked", title: "Material plan locked",
      message: "Review the confirmed pickup or delivery plan in the Job Room.",
      campaignId, zoneId, entityId: materialLogisticsDigest,
      deepLink: {destination: "job_room", zoneId}, priority: "high",
      metadata: {materialLogisticsVersion},
    }));
    if (!campaign.materialLogisticsLockedAt) {
      transaction.update(campaignSnapshot.ref, {
        materialLogisticsVersion, materialLogisticsDigest,
        materialLogisticsLockedAt: FieldValue.serverTimestamp(),
        materialLogisticsLockedReason: "scaler_assignment",
        materialLogisticsLockedZoneId: zoneId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    result = participant;
  });
  return result;
});

exports.confirmZoneGroupParticipantNoShow = trackingCallable(
  "confirmZoneGroupParticipantNoShow", async (request) => {
    assertTrackingPayload(request.data, new Set(["zoneId", "participantId"]), 4096);
    const context = await requireVerifiedUser(request, "Sign in before reviewing attendance.");
    if (!context.isAdmin) {
      throw new HttpsError("permission-denied", "Trusted support must confirm a group no-show.");
    }
    const zoneId = String(request.data?.zoneId || "").trim();
    const participantId = String(request.data?.participantId || "").trim();
    const zoneRef = db.collection("campaignZones").doc(zoneId);
    const participantRef = db.collection("zoneScalerParticipations").doc(participantId);
    const operationRef = db.collection("financialOperations")
      .doc(marketplace.operationId("group-no-show", zoneId, participantId));
    let result;
    await db.runTransaction(async (transaction) => {
      const [zoneSnapshot, participantSnapshot, operationSnapshot,
        sessionSnapshot, routeSnapshot] = await Promise.all([
        transaction.get(zoneRef), transaction.get(participantRef), transaction.get(operationRef),
        transaction.get(db.collection("trackingSessions")
          .where("participantId", "==", participantId).limit(1)),
        transaction.get(db.collection("campaignRoutes")
          .where("participantId", "==", participantId).limit(1)),
      ]);
      if (operationSnapshot.exists) {
        result = operationSnapshot.data()?.result || {participantId, attendanceStatus: "no_show"};
        return;
      }
      if (!zoneSnapshot.exists || !participantSnapshot.exists) {
        throw new HttpsError("not-found", "The group participant was not found.");
      }
      const zone = zoneSnapshot.data() || {};
      const participant = participantSnapshot.data() || {};
      if (participant.zoneId !== zoneId || zone.groupAssignmentId !== zoneId) {
        throw new HttpsError("failed-precondition", "The participant does not belong to this group.");
      }
      const scheduledValue = participant.workWindowStartAt || zone.workWindowStartAt ||
        zone.marketingDate || zone.scheduledStartAt;
      const scheduledAt = scheduledValue instanceof Timestamp ? scheduledValue.toDate() : scheduledValue;
      const hasWorkEvidence = sessionSnapshot.size > 0 || routeSnapshot.size > 0 ||
        participant.startedAt != null || participant.evidencePointCount > 0;
      const eligibility = groupAssignment.participantNoShowEligibility({
        scheduledAt, status: participant.status, supportHold: zone.supportHold === true,
        hasAuthoritativeWorkEvidence: hasWorkEvidence,
      });
      if (!eligibility.eligible) {
        throw new HttpsError("failed-precondition",
          eligibility.reason === "grace_period_active" ?
            "The attendance grace period has not ended." :
            "This participant cannot be confirmed as a no-show.");
      }
      result = {participantId, attendanceStatus: "no_show",
        initialShareCents: participant.initialShareCents};
      transaction.update(participantRef, {
        status: "no_show", attendanceStatus: "no_show",
        noShowConfirmedBy: context.uid, noShowConfirmedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(operationRef, {
        type: "group_participant_no_show", ownerId: participant.businessId,
        campaignId: participant.campaignId, zoneId, participantId,
        status: "completed", result, createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      appendJobEvent(transaction, {
        campaignId: participant.campaignId, zoneId, businessId: participant.businessId,
        scalerId: participant.scalerUid, participantId, actorId: context.uid,
        type: "assignment.participant_no_show",
      });
    });
    return result;
  });

exports.cancelZoneGroupParticipation = trackingCallable(
  "cancelZoneGroupParticipation", async (request) => {
    assertTrackingPayload(request.data, new Set(["zoneId"]), 4096);
    const context = await requireVerifiedUser(request, "Sign in before cancelling a group slot.");
    const zoneId = String(request.data?.zoneId || "").trim();
    const participantRef = db.collection("zoneScalerParticipations")
      .doc(groupAssignment.participantId(zoneId, context.uid));
    const groupRef = db.collection("zoneGroupAssignments").doc(zoneId);
    const roomRef = db.collection("jobRooms").doc(zoneId);
    let result;
    await db.runTransaction(async (transaction) => {
      const [participantSnapshot, groupSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(participantRef), transaction.get(groupRef), transaction.get(roomRef),
      ]);
      if (!participantSnapshot.exists || !groupSnapshot.exists) {
        throw new HttpsError("not-found", "The group slot was not found.");
      }
      const participant = participantSnapshot.data() || {};
      const group = groupSnapshot.data() || {};
      if (participant.scalerUid !== context.uid) {
        throw new HttpsError("permission-denied", "This slot belongs to another Scaler.");
      }
      if (participant.status === "cancelled_before_window") {
        result = {participantId: participantSnapshot.id, status: participant.status,
          replacementNeeded: true, alreadyCancelled: true}; return;
      }
      if (!["accepted", "scheduled"].includes(String(participant.status)) ||
          participant.startedAt != null || participant.activeTrackingSessionId) {
        throw new HttpsError("failed-precondition",
          "Started group work requires trusted support cancellation.");
      }
      const activeCount = Math.max(0, Number(group.acceptedScalerCount || 0) - 1);
      transaction.update(participantRef, {
        status: "cancelled_before_window", attendanceStatus: "cancelled_before_window",
        cancelledAt: FieldValue.serverTimestamp(), settlementStatus: "not_eligible",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(groupRef, {
        acceptedScalerCount: activeCount,
        acceptedScalerIds: FieldValue.arrayRemove(context.uid),
        status: "replacement_needed", updatedAt: FieldValue.serverTimestamp(),
      });
      if (roomSnapshot.exists) transaction.update(roomRef, {
        scalerIds: FieldValue.arrayRemove(context.uid), updatedAt: FieldValue.serverTimestamp(),
      });
      result = {participantId: participantSnapshot.id,
        status: "cancelled_before_window", replacementNeeded: true, alreadyCancelled: false};
    });
    return result;
  });

exports.settleZoneGroupAssignment = trackingCallable("settleZoneGroupAssignment", async (request) => {
  assertTrackingPayload(request.data, new Set(["zoneId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in before settling group work.");
  const zoneId = String(request.data?.zoneId || "").trim();
  const groupRef = db.collection("zoneGroupAssignments").doc(zoneId);
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const operationRef = db.collection("financialOperations")
    .doc(marketplace.operationId("group-settlement", zoneId, 1));
  let result;
  await db.runTransaction(async (transaction) => {
    const [groupSnapshot, zoneSnapshot, participantsSnapshot, operationSnapshot] = await Promise.all([
      transaction.get(groupRef), transaction.get(zoneRef),
      transaction.get(db.collection("zoneScalerParticipations").where("zoneId", "==", zoneId)),
      transaction.get(operationRef),
    ]);
    if (!groupSnapshot.exists || !zoneSnapshot.exists) throw new HttpsError("not-found", "Group assignment not found.");
    if (operationSnapshot.exists && operationSnapshot.data()?.status === "reserved") {
      result = operationSnapshot.data()?.result; return;
    }
    const group = groupSnapshot.data() || {}; const zone = zoneSnapshot.data() || {};
    if (!context.isAdmin && group.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "Only the owning Business may approve group work.");
    }
    if (String(zone.reviewStatus) !== "verification_pending") {
      throw new HttpsError("failed-precondition", "Group work is not awaiting one zone-level review.");
    }
    const participants = participantsSnapshot.docs.map((doc) => ({participantId: doc.id, ...doc.data()}));
    const routeSnapshots = [];
    for (const participant of participants) {
      if (participant.routeId) routeSnapshots.push({participant, snapshot: await transaction.get(db.collection("campaignRoutes").doc(participant.routeId))});
    }
    const contributionInput = participants.map((participant) => {
      const route = routeSnapshots.find((item) => item.participant.participantId === participant.participantId)?.snapshot.data() || {};
      return {...participant, verifiedRoutePoints: Array.isArray(route.points) ? route.points : []};
    });
    const contributions = groupAssignment.calculateVerifiedContributions(contributionInput);
    const byId = new Map(contributions.map((item) => [item.participantId, item]));
    const enriched = participants.map((item) => ({...item, ...(byId.get(item.participantId) || {})}));
    const completionBps = Math.max(0, Math.min(10000, Math.round(Number(zone.completionPercentage || 0) * 100)));
    result = groupAssignment.settleGroup({workerPoolCents: group.workerPoolCents, participants: enriched,
      verifiedZoneCompletionBps: completionBps, supportHold: zone.supportHold === true || zone.disputeOpen === true,
      businessFault: zone.status === "failed_business" || zone.settlementBlocked === true,
      cancelled: ["cancelled", "canceled"].includes(String(zone.status)),
      substantialCompletionThresholdBps: Number.isSafeInteger(group.substantialCompletionThresholdBps) ?
        group.substantialCompletionThresholdBps : groupAssignment.SUBSTANTIAL_COMPLETION_THRESHOLD_BPS,
      settlementPolicyVersion: String(group.settlementPolicyVersion ||
        groupAssignment.GROUP_SETTLEMENT_POLICY_VERSION)});
    if (!result.settlementAllowed) throw new HttpsError("failed-precondition", "Group settlement requires support review or additional verified completion.");
    const paymentId = String(zone.fundingPaymentId || group.fundingPaymentId || "");
    const paymentRef = db.collection("campaignPayments").doc(paymentId || "missing");
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists || paymentSnapshot.data()?.status !== marketplace.PAYMENT_STATES.funded) {
      throw new HttpsError("failed-precondition", "Authoritative campaign funding is unavailable.");
    }
    marketplace.assertAllocationAvailable(paymentSnapshot.data(), result.finalWorkerPayCents, 0);
    const participantById = new Map(participants.map((item) => [item.participantId, item]));
    const transferReservations = [];
    for (const allocation of result.allocations) {
      const participant = participantById.get(allocation.participantId) || {};
      const transferId = marketplace.operationId("group-scaler-transfer", zoneId,
        allocation.participantId, Number(group.compensationVersion || 1));
      const transferRef = db.collection("scalerTransfers").doc(transferId);
      const [existingTransfer, connectedSnapshot] = await Promise.all([
        transaction.get(transferRef),
        transaction.get(db.collection("stripeConnectedAccounts")
          .doc(participant.scalerUid || "missing")),
      ]);
      const connected = connectedSnapshot.data() || {};
      const ready = connectedSnapshot.exists && connected.transfersStatus === "active" &&
        cleanId(connected.stripeAccountId);
      transferReservations.push({allocation, participant, transferId, transferRef,
        existingTransfer, ready});
    }
    for (const reservation of transferReservations) {
      const {allocation, participant, transferId, transferRef, existingTransfer, ready} = reservation;
      transaction.update(db.collection("zoneScalerParticipations").doc(allocation.participantId), {
        finalPayCents: allocation.finalPayCents, reallocatedPayCents: allocation.reallocatedPayCents,
        settlementStatus: ready ? marketplace.TRANSFER_STATES.pending : marketplace.TRANSFER_STATES.waitingForAccount,
        transferOperationId: transferId,
        verifiedContributionVersion: groupAssignment.VERIFIED_CONTRIBUTION_VERSION,
        settlementOperationId: operationRef.id, updatedAt: FieldValue.serverTimestamp()});
      if (!existingTransfer.exists) transaction.create(transferRef, {
        transferOperationId: transferId, groupSettlementOperationId: operationRef.id,
        paymentId, campaignId: group.campaignId, zoneId,
        participantId: allocation.participantId, businessId: group.businessId,
        scalerId: participant.scalerUid, currency: marketplace.CURRENCY,
        amountCents: allocation.finalPayCents,
        baseAmountCents: allocation.initialPayCents,
        reallocatedAmountCents: allocation.reallocatedPayCents,
        earningsVersion: 1,
        status: ready ? marketplace.TRANSFER_STATES.pending : marketplace.TRANSFER_STATES.waitingForAccount,
        bankPayoutStatus: "not_observed", createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(paymentRef, {reservedWorkerAmountCents: Number(paymentSnapshot.data()?.reservedWorkerAmountCents || 0) + result.finalWorkerPayCents,
      updatedAt: FieldValue.serverTimestamp()});
    transaction.update(groupRef, {status: "settlement_reserved", settlementOperationId: operationRef.id,
      finalWorkerPayCents: result.finalWorkerPayCents, noShowReallocationPoolCents: result.noShowReallocationPoolCents,
      verifiedZoneCompletionBps: result.verifiedZoneCompletionBps,
      completionClassification: result.completionClassification,
      workerPayAllocatedCents: result.finalWorkerPayCents,
      settlementPolicyVersion: result.policyVersion, settledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    transaction.update(zoneRef, {groupSettlementStatus: "transfer_pending", groupSettlementOperationId: operationRef.id,
      workerPayAllocatedCents: result.finalWorkerPayCents,
      groupCompletionClassification: result.completionClassification,
      reviewStatus: "approved", paymentStatus: "transfer_pending", updatedAt: FieldValue.serverTimestamp()});
    transaction.create(operationRef, {type: "group_settlement", ownerId: group.businessId, campaignId: group.campaignId,
      zoneId, paymentId, status: "reserved", result, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  });
  return result;
});

exports.submitZoneGroupCompletion = trackingCallable("submitZoneGroupCompletion", async (request) => {
  assertTrackingPayload(request.data, new Set(["zoneId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in before submitting group work.");
  const zoneId = String(request.data?.zoneId || "").trim();
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const groupRef = db.collection("zoneGroupAssignments").doc(zoneId);
  const participantRef = db.collection("zoneScalerParticipations")
    .doc(groupAssignment.participantId(zoneId, context.uid));
  const completionRef = db.collection("campaignCompletions").doc(`group_completion_${zoneId}`);
  let result;
  await db.runTransaction(async (transaction) => {
    const [zoneSnapshot, groupSnapshot, callerParticipantSnapshot,
      participantsSnapshot, completionSnapshot] = await Promise.all([
      transaction.get(zoneRef), transaction.get(groupRef), transaction.get(participantRef),
      transaction.get(db.collection("zoneScalerParticipations").where("zoneId", "==", zoneId)),
      transaction.get(completionRef),
    ]);
    if (!zoneSnapshot.exists || !groupSnapshot.exists || !callerParticipantSnapshot.exists) {
      throw new HttpsError("permission-denied", "This group completion is unavailable.");
    }
    const zone = zoneSnapshot.data() || {}; const group = groupSnapshot.data() || {};
    const caller = callerParticipantSnapshot.data() || {};
    if (caller.scalerUid !== context.uid || !["completed", "participating"].includes(caller.status)) {
      throw new HttpsError("failed-precondition", "Finish and save your tracking evidence first.");
    }
    if (zone.supportHold === true || zone.disputeOpen === true ||
        ["cancelled", "canceled", "failed_business"].includes(String(zone.status))) {
      throw new HttpsError("failed-precondition", "This group completion requires support review.");
    }
    if (completionSnapshot.exists && ["verification_pending", "approved"].includes(
      String(completionSnapshot.data()?.reviewStatus))) {
      result = {completionId: completionRef.id,
        completionPercentage: completionSnapshot.data()?.completionPercentage,
        alreadySubmitted: true}; return;
    }
    const participants = participantsSnapshot.docs.map((doc) => ({participantId: doc.id, ...doc.data()}));
    const routes = [];
    for (const participant of participants) {
      if (participant.routeId) {
        const routeSnapshot = await transaction.get(db.collection("campaignRoutes").doc(participant.routeId));
        const route = routeSnapshot.data() || {};
        if (route.zoneId === zoneId && route.scalerId === participant.scalerUid && route.tracking !== true) {
          routes.push({...participant, verifiedRoutePoints: validRoutePoints(route.points)});
        }
      }
    }
    const allPoints = routes.flatMap((item) => item.verifiedRoutePoints);
    if (allPoints.length < 2) throw new HttpsError("failed-precondition", "Verified group route evidence is incomplete.");
    const trackingResult = calculateRouteCompletion(zone, allPoints);
    const contributions = groupAssignment.calculateVerifiedContributions(routes);
    const timestamp = FieldValue.serverTimestamp();
    const data = {
      completionId: completionRef.id, campaignId: group.campaignId, zoneId,
      businessId: group.businessId, groupAssignmentId: zoneId,
      participantCount: participants.length, contributingParticipantCount: routes.length,
      status: "submitted", reviewStatus: "verification_pending", gpsVerified: true,
      completionPercentage: trackingResult.completionPercentage,
      completedHomes: trackingResult.completedHomes, assignedHomes: trackingResult.assignedHomes,
      contributionVersion: groupAssignment.VERIFIED_CONTRIBUTION_VERSION,
      participantContributions: contributions, submittedAt: timestamp, updatedAt: timestamp,
      schemaVersion: 2,
    };
    transaction.set(completionRef, {...data, createdAt: completionSnapshot.exists ?
      completionSnapshot.data()?.createdAt || timestamp : timestamp}, {merge: true});
    transaction.update(zoneRef, {
      status: "submitted", verificationPassed: true, reviewStatus: "verification_pending",
      completionSubmittedAt: timestamp, submittedCompletionId: completionRef.id,
      completionPercentage: trackingResult.completionPercentage,
      groupContributionVersion: groupAssignment.VERIFIED_CONTRIBUTION_VERSION,
      paymentStatus: "verification_pending", updatedAt: timestamp,
    });
    result = {completionId: completionRef.id,
      completionPercentage: trackingResult.completionPercentage, alreadySubmitted: false};
  });
  return result;
});

exports.getCampaignDiscovery = trackingCallable("getCampaignDiscovery", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId"]), 4096);
  await requireVerifiedUser(request, "Verify your email to browse campaigns.");
  const campaignId = String(request.data?.campaignId || "").trim();
  const snapshot = await db.collection("campaigns").doc(campaignId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
  const campaign = snapshot.data() || {};
  if (!["open", "published", "active", "available"].includes(String(campaign.status))) {
    throw new HttpsError("failed-precondition", "This campaign is not available.");
  }
  return operations.safeDiscoveryProjection({...campaign, id: campaignId});
});

exports.listCampaignDiscovery = trackingCallable("listCampaignDiscovery", async (request) => {
  assertTrackingPayload(request.data, new Set([]), 1024);
  const context = await requireVerifiedUser(request, "Verify your email to browse campaigns.");
  if (context.role !== "scaler" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only Scalers can browse available campaigns.");
  }
  const allowedStatuses = ["open", "published", "active", "available"];
  const snapshots = await Promise.all(allowedStatuses.map((status) =>
    db.collection("campaigns").where("status", "==", status).limit(50).get()));
  const unique = new Map();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      unique.set(document.id, operations.safeDiscoveryProjection({...document.data(), id: document.id}));
    }
  }
  return {campaigns: Array.from(unique.values()).slice(0, 100)};
});

exports.applyToCampaign = trackingCallable("applyToCampaign", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId"]), 2048);
  const context = await requireVerifiedUser(request, "Verify your email before applying.");
  if (context.role !== "scaler") {
    throw new HttpsError("permission-denied", "Only Scalers can apply to campaigns.");
  }
  await requireCurrentLegalConsents(
    context.uid,
    legalConsent.ROLE_REQUIREMENTS.scaler_work,
    null,
    "Review and accept the current Terms and Scaler Work Terms before applying.",
  );
  const campaignId = String(request.data?.campaignId || "").trim();
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const applicationRef = campaignRef.collection("applications").doc(context.uid);
  await db.runTransaction(async (transaction) => {
    const [campaignSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(campaignRef), transaction.get(applicationRef),
    ]);
    if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
    const campaign = campaignSnapshot.data() || {};
    if (!["open", "published", "active", "available"].includes(String(campaign.status))) {
      throw new HttpsError("failed-precondition", "This campaign is not accepting applications.");
    }
    if (applicationSnapshot.exists) {
      const status = String(applicationSnapshot.data()?.status || "pending");
      if (["pending", "accepted"].includes(status)) return;
      throw new HttpsError("already-exists", "An application already exists for this campaign.");
    }
    transaction.create(applicationRef, {
      scalerId: context.uid,
      campaignId,
      businessId: campaign.businessId,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    setInAppNotification(transaction, inAppNotification({
      id: `application-received_${campaignId}_${context.uid}`,
      userId: campaign.businessId, type: "application_received",
      title: "New Scaler application", message: "A Scaler applied for your campaign.",
      campaignId, entityId: context.uid,
      deepLink: {destination: "campaign_applicants", campaignId},
      metadata: {scalerId: context.uid},
    }));
  });
  return {status: "pending"};
});

exports.getJobRoom = trackingCallable("getJobRoom", async (request) => {
  assertTrackingPayload(request.data, new Set(["zoneId"]), 4096);
  const context = await requireVerifiedUser(request, "Verify your email to open this Job Room.");
  const zoneId = String(request.data?.zoneId || "").trim();
  const roomRef = db.collection("jobRooms").doc(zoneId);
  const roomSnapshot = await roomRef.get();
  const room = roomSnapshot.data() || {};
  const roomScalerIds = Array.isArray(room.scalerIds) ? room.scalerIds : [];
  if (!roomSnapshot.exists || !operations.isJobRoomMember({
    room, uid: context.uid, isAdmin: context.isAdmin,
  })) {
    throw new HttpsError("permission-denied", "This private Job Room is unavailable.");
  }
  const participantId = roomScalerIds.includes(context.uid) ?
    groupAssignment.participantId(zoneId, context.uid) : null;
  const participantSnapshot = participantId ?
    await db.collection("zoneScalerParticipations").doc(participantId).get() : null;
  const participant = participantSnapshot?.data() || null;
  const handoffId = participant?.materialHandoffId || zoneId;
  const [campaignSnapshot, zoneSnapshot, handoffSnapshot, compensationSnapshot,
    messagesSnapshot, eventsSnapshot, groupSnapshot, readinessSnapshot,
    proposalSnapshot] = await Promise.all([
    db.collection("campaigns").doc(room.campaignId).get(),
    db.collection("campaignZones").doc(zoneId).get(),
    db.collection("materialHandoffs").doc(handoffId).get(),
    db.collection("assignmentCompensations").doc(zoneId).get(),
    db.collection("jobMessages").where("roomId", "==", zoneId).limit(100).get(),
    db.collection("jobEvents").where("zoneId", "==", zoneId).limit(100).get(),
    db.collection("zoneGroupAssignments").doc(zoneId).get(),
    roomRef.collection("readiness").get(),
    db.collection("materialLogisticsChangeProposals")
      .where("zoneId", "==", zoneId).limit(20).get(),
  ]);
  const campaign = campaignSnapshot.data() || {};
  const zone = zoneSnapshot.data() || {};
  const campaignLogistics = operations.materialLogisticsFromCampaign(campaign);
  const authoritativeLogistics = room.materialLogistics || campaignLogistics;
  const materialsRequired = authoritativeLogistics.materialsRequired === true ||
    authoritativeLogistics.fulfillmentType !== "no_materials_required";
  const handoff = handoffSnapshot.exists ?
    {id: handoffSnapshot.id, ...handoffSnapshot.data()} :
    {id: handoffId, status: materialsRequired ? "scheduled" : "not_required",
      required: materialsRequired,
      fulfillmentType: authoritativeLogistics.fulfillmentType,
      projectionMissingAuthoritativeRecord: true};
  const workWindow = operations.evaluateWorkWindow({...campaignWorkPolicy(campaign), date: new Date()});
  const gate = operations.evaluateJobStart({
    materialRequired: handoff.required === true,
    handoffStatus: String(handoff.status || "not_required"),
    workWindow,
  });
  const byCreatedAt = (a, b) => Number(a.createdAt?.toMillis?.() || 0) - Number(b.createdAt?.toMillis?.() || 0);
  const messages = messagesSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})).sort(byCreatedAt);
  const events = eventsSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}))
    .sort((a, b) => -byCreatedAt(a, b));
  const group = groupSnapshot.data() || null;
  const proposals = proposalSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  proposals.sort((a, b) => Number(b.proposedVersion || 0) - Number(a.proposedVersion || 0));
  const materialLogisticsChange = proposals.find((item) =>
    item.status === "pending_acknowledgment") || proposals[0] || null;
  const assignedCount = roomScalerIds.length || (room.scalerId ? 1 : 0);
  const requiredCount = Number(group?.requestedScalerCount || assignedCount || 1);
  const acknowledgedCount = readinessSnapshot.docs.filter(
    (doc) => doc.data()?.readinessAcknowledged === true,
  ).length;
  const viewerReadinessDocument = readinessSnapshot.docs.find(
    (doc) => doc.id === context.uid,
  );
  const viewerReadinessAcknowledged =
    viewerReadinessDocument?.data()?.readinessAcknowledged === true ||
    participant?.readinessAcknowledged === true;
  const participantHandoffs = group ? await Promise.all(roomScalerIds.map(async (uid) => {
    const id = groupAssignment.participantId(zoneId, uid);
    const participantDoc = await db.collection("zoneScalerParticipations").doc(id).get();
    const participantData = participantDoc.data() || {};
    if (!participantData.materialHandoffId) return null;
    return db.collection("materialHandoffs").doc(participantData.materialHandoffId).get();
  })) : [];
  const receivedCount = group ? participantHandoffs.filter(
    (snapshot) => snapshot?.data()?.status === "received",
  ).length : (handoff.status === "received" ? 1 : 0);
  const groupMaterialStatuses = context.uid === room.businessId || context.isAdmin ?
    participantHandoffs.map((snapshot, index) => ({
      scalerId: roomScalerIds[index],
      handoffId: snapshot?.id || null,
      status: snapshot?.data()?.status || (materialsRequired ? "scheduled" : "not_required"),
      required: snapshot?.data()?.required === true || materialsRequired,
      fulfillmentType: snapshot?.data()?.fulfillmentType ||
        authoritativeLogistics.fulfillmentType,
      businessConfirmed: snapshot?.data()?.businessConfirmedAt != null,
      scalerConfirmed: snapshot?.data()?.scalerConfirmedAt != null,
    })) : [];
  const groupReadiness = operations.readinessStatus({
    assignedCount, requiredCount, acknowledgedCount,
    coordinationConfigured: room.coordination?.configured === true,
    materialsRequired: room.coordination?.materialsRequired === true,
    receivedCount,
  });
  return {
    viewerRole: context.isAdmin ? "admin" :
      (context.uid === room.businessId ? "business" : "scaler"),
    room: {...room, id: zoneId}, campaign: {...campaign, id: room.campaignId},
    zone: {...zone, id: zoneId}, handoff,
    compensation: participant ? {
      compensationVersion: participant.compensationVersion,
      initialShareCents: participant.initialShareCents,
      finalPayCents: participant.finalPayCents,
      reallocatedPayCents: participant.reallocatedPayCents,
      immutable: participant.immutableCompensation === true,
      groupAssignmentId: zoneId,
    } : compensationSnapshot.data() || null,
    participant, groupAssignment: group,
    groupReadiness: {...groupReadiness, assignedCount, requiredCount,
      acknowledgedCount, receivedCount},
    viewerReadiness: {
      acknowledged: viewerReadinessAcknowledged,
      acknowledgedAt: viewerReadinessDocument?.data()?.acknowledgedAt ||
        participant?.readinessAcknowledgedAt || null,
      attendanceConfirmed: false,
      materialReceiptConfirmed: false,
    },
    groupMaterialStatuses,
    materialLogisticsChange,
    messages, events,
    startEligibility: {...gate, workWindow},
  };
});

exports.sendJobMessage = operationalCallable("sendJobMessage", async (request) => {
  assertOperationalPayload(request.data, new Set(["zoneId", "text"]), 8192);
  const context = await requireVerifiedUser(request, "Verify your email before messaging.");
  const zoneId = String(request.data?.zoneId || "").trim();
  const text = String(request.data?.text || "").trim();
  if (!zoneId || !text || text.length > 2000) {
    throw new HttpsError("invalid-argument", "A message of 1-2000 characters is required.");
  }
  const roomRef = db.collection("jobRooms").doc(zoneId);
  const messageRef = db.collection("jobMessages").doc();
  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    const room = roomSnapshot.data() || {};
    const roomScalerIds = Array.isArray(room.scalerIds) ? room.scalerIds : [];
    if (!roomSnapshot.exists || !operations.isJobRoomMember({
      room, uid: context.uid, isAdmin: context.isAdmin,
    })) {
      throw new HttpsError("permission-denied", "This private Job Room is unavailable.");
    }
    if (room.status !== "open") throw new HttpsError("failed-precondition", "This Job Room is closed.");
    transaction.create(messageRef, {
      roomId: zoneId, zoneId, campaignId: room.campaignId,
      businessId: room.businessId,
      scalerId: context.role === "scaler" ? context.uid : (room.scalerId || null),
      groupAssignmentId: room.groupAssignmentId || null,
      senderId: context.uid, senderRole: context.role, text,
      createdAt: FieldValue.serverTimestamp(), schemaVersion: 1,
    });
    const recipients = [...new Set([
      room.businessId, room.scalerId,
      ...(Array.isArray(room.scalerIds) ? room.scalerIds : []),
    ].filter((uid) => uid && uid !== context.uid))];
    const preview = text.length > 140 ? `${text.slice(0, 137)}...` : text;
    for (const recipientId of recipients) {
      setInAppNotification(transaction, inAppNotification({
        id: `job-message_${messageRef.id}_${recipientId}`, userId: recipientId,
        type: "job_room_message", title: "New Job Room message",
        message: `${context.role === "business" ? "Business" : "Scaler"}: ${preview}`,
        campaignId: room.campaignId, zoneId, entityId: messageRef.id,
        deepLink: {destination: "job_room", zoneId},
      }));
    }
    transaction.update(roomRef, {updatedAt: FieldValue.serverTimestamp()});
  });
  return {messageId: messageRef.id};
});

exports.updateCampaignMaterialLogistics = operationalCallable(
  "updateCampaignMaterialLogistics", async (request) => {
    assertOperationalPayload(request.data, new Set([
      "campaignId", "fulfillmentType", "scheduledAt", "windowEndAt",
      "location", "printingShopName", "orderReference", "instructions",
      "latitude", "longitude",
    ]), 16384);
    const context = await requireVerifiedUser(
      request, "Verify your email before updating campaign logistics.",
    );
    const campaignId = String(request.data?.campaignId || "").trim();
    if (!campaignId) {
      throw new HttpsError("invalid-argument", "Campaign ID is required.");
    }
    let details;
    try {
      details = operations.normalizeMaterialLogistics(request.data || {});
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }
    const latitude = request.data?.latitude == null ? null :
      Number(request.data.latitude);
    const longitude = request.data?.longitude == null ? null :
      Number(request.data.longitude);
    if ((latitude != null && (!Number.isFinite(latitude) ||
        latitude < -90 || latitude > 90)) ||
        (longitude != null && (!Number.isFinite(longitude) ||
        longitude < -180 || longitude > 180))) {
      throw new HttpsError("invalid-argument", "Material location coordinates are invalid.");
    }

    const campaignRef = db.collection("campaigns").doc(campaignId);
    let result;
    await db.runTransaction(async (transaction) => {
      const campaignSnapshot = await transaction.get(campaignRef);
      const campaign = campaignSnapshot.data() || {};
      if (!campaignSnapshot.exists ||
          (!context.isAdmin && campaign.businessId !== context.uid)) {
        throw new HttpsError(
          "permission-denied", "Only the owning Business may update campaign logistics.",
        );
      }
      if (campaign.materialLogisticsLockedAt) {
        throw new HttpsError("failed-precondition",
          "Material logistics are locked because a Scaler accepted this job. Propose a change instead.");
      }

      const zonesSnapshot = await transaction.get(
        db.collection("campaignZones").where("campaignId", "==", campaignId),
      );
      const assignmentStarted = zonesSnapshot.docs.some((doc) => {
        const zone = doc.data() || {};
        return Boolean(zone.assignedScalerId) ||
          (Array.isArray(zone.assignedScalerIds) && zone.assignedScalerIds.length > 0);
      });
      if (assignmentStarted) {
        throw new HttpsError("failed-precondition",
          "Material logistics are locked because a Scaler accepted this job. Propose a change instead.");
      }
      const zoneIds = zonesSnapshot.docs.map((doc) => doc.id);
      const roomSnapshots = await Promise.all(zoneIds.map((zoneId) =>
        transaction.get(db.collection("jobRooms").doc(zoneId))));
      const participantSnapshotsByZone = await Promise.all(zoneIds.map((zoneId) =>
        transaction.get(db.collection("zoneScalerParticipations")
          .where("zoneId", "==", zoneId))));
      const handoffIds = participantSnapshotsByZone.flatMap((snapshot) =>
        snapshot.docs.map((doc) => doc.data().materialHandoffId).filter(Boolean));
      const handoffSnapshots = await Promise.all(handoffIds.map((handoffId) =>
        transaction.get(db.collection("materialHandoffs").doc(handoffId))));

      const timestamp = FieldValue.serverTimestamp();
      const version = Number(campaign.materialLogisticsVersion || 0) + 1;
      transaction.update(campaignRef, {
        materialsRequired: details.materialsRequired,
        materialFulfillmentType: details.fulfillmentType,
        materialHandoffMethod: details.fulfillmentType,
        materialHandoffScheduledAt: details.scheduledAt,
        materialHandoffWindowEndAt: details.windowEndAt,
        materialHandoffAddress: details.location,
        materialHandoffLatitude: details.materialsRequired ? latitude : null,
        materialHandoffLongitude: details.materialsRequired ? longitude : null,
        materialHandoffPrintingShopName: details.printingShopName,
        materialHandoffOrderReference: details.orderReference,
        materialHandoffInstructions: details.instructions,
        materialLogisticsVersion: version,
        materialHandoffUpdatedAt: timestamp,
        updatedAt: timestamp,
      });

      let updatedHandoffCount = 0;
      let lockedHandoffCount = 0;
      for (const snapshot of handoffSnapshots) {
        if (!snapshot.exists ||
            !operations.canRewriteMaterialHandoff(snapshot.data()?.status)) {
          lockedHandoffCount++;
          continue;
        }
        transaction.update(snapshot.ref, {
          required: details.materialsRequired,
          fulfillmentType: details.fulfillmentType,
          status: details.materialsRequired ?
            String(snapshot.data()?.status || "scheduled") : "not_required",
          scheduledAt: details.scheduledAt,
          windowEndAt: details.windowEndAt,
          privateLocation: details.location,
          printingShopName: details.printingShopName,
          orderReference: details.orderReference,
          instructions: details.instructions,
          logisticsVersion: version,
          logisticsUpdatedAt: timestamp,
          updatedAt: timestamp,
        });
        updatedHandoffCount++;
      }

      for (const roomSnapshot of roomSnapshots) {
        if (!roomSnapshot.exists) continue;
        const room = roomSnapshot.data() || {};
        const update = {
          materialLogistics: {
            ...details,
            configured: true,
            configuredBy: context.uid,
            configuredAt: timestamp,
            version,
          },
          coordination: {
            configured: true,
            materialsRequired: details.materialsRequired,
          },
          updatedAt: timestamp,
        };
        if (room.materialLogistics) {
          update.materialLogisticsHistory =
            FieldValue.arrayUnion(room.materialLogistics);
        }
        transaction.update(roomSnapshot.ref, update);
        const scalerIds = Array.isArray(room.scalerIds) ?
          room.scalerIds : (room.scalerId ? [room.scalerId] : []);
        for (const scalerId of scalerIds) {
          setInAppNotification(transaction, inAppNotification({
            id: `job-coordination_${roomSnapshot.id}_${scalerId}`,
            userId: scalerId, campaignId, zoneId: roomSnapshot.id,
            type: "job_coordination_updated",
            title: "Material logistics updated",
            message: "Review the current pickup or delivery plan in the Job Room.",
            deepLink: {destination: "job_room", zoneId: roomSnapshot.id},
          }));
        }
      }
      result = {
        ...details,
        version,
        updatedHandoffCount,
        lockedHandoffCount,
      };
    });
    return result;
  },
);

exports.proposeMaterialLogisticsChange = operationalCallable(
  "proposeMaterialLogisticsChange", async (request) => {
    assertOperationalPayload(request.data, new Set([
      "zoneId", "reason", "fulfillmentType", "scheduledAt", "windowEndAt",
      "location", "printingShopName", "orderReference", "instructions",
      "latitude", "longitude",
    ]), 16384);
    const context = await requireVerifiedUser(request,
      "Verify your email before proposing a logistics change.");
    const zoneId = String(request.data?.zoneId || "").trim();
    const reason = String(request.data?.reason || "").trim();
    if (!zoneId || reason.length < 3 || reason.length > 1000) {
      throw new HttpsError("invalid-argument", "A short reason for the change is required.");
    }
    let proposed;
    try { proposed = operations.normalizeMaterialLogistics(request.data || {}); }
    catch (error) { throw new HttpsError("invalid-argument", error.message); }
    const roomRef = db.collection("jobRooms").doc(zoneId);
    let result;
    await db.runTransaction(async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      const room = roomSnapshot.data() || {};
      if (!roomSnapshot.exists || (!context.isAdmin && room.businessId !== context.uid)) {
        throw new HttpsError("permission-denied", "Only the owning Business may propose this change.");
      }
      if (!room.materialLogisticsLockedAt) {
        throw new HttpsError("failed-precondition", "Edit the material plan directly before assignment.");
      }
      const participantSnapshot = await transaction.get(
        db.collection("zoneScalerParticipations").where("zoneId", "==", zoneId));
      const activeParticipants = participantSnapshot.docs.filter((doc) =>
        !["cancelled_before_window", "declined", "replaced", "no_show"].includes(String(doc.data()?.status)));
      const affected = activeParticipants.length ? activeParticipants.map((doc) => ({
        participantId: doc.id, scalerId: String(doc.data()?.scalerUid || ""),
        handoffId: doc.data()?.materialHandoffId || null,
      })) : (room.scalerId ? [{participantId: null, scalerId: room.scalerId, handoffId: zoneId}] : []);
      const handoffSnapshots = await Promise.all(affected.map((item) =>
        transaction.get(db.collection("materialHandoffs").doc(item.handoffId || zoneId))));
      const eligible = affected.filter((_, index) =>
        !handoffSnapshots[index].exists ||
        operations.canRewriteMaterialHandoff(handoffSnapshots[index].data()?.status));
      if (!eligible.length) {
        throw new HttpsError("failed-precondition",
          "Completed material handoffs cannot be rewritten. Contact support for remaining logistics.");
      }
      const currentVersion = Number(room.materialLogisticsVersion || room.materialLogistics?.version || 1);
      const proposedVersion = currentVersion + 1;
      const proposedDigest = operations.materialLogisticsDigest(proposed);
      const proposalIdentity = crypto.createHash("sha256")
        .update(`${room.materialLogisticsDigest || "initial"}:${proposedDigest}:${reason}`)
        .digest("hex").slice(0, 16);
      const proposalRef = db.collection("materialLogisticsChangeProposals")
        .doc(`${zoneId}_v${proposedVersion}_${proposalIdentity}`);
      const existing = await transaction.get(proposalRef);
      if (existing.exists && existing.data()?.status === "pending_acknowledgment") {
        result = {proposalId: proposalRef.id, ...existing.data()}; return;
      }
      const affectedScalerIds = eligible.map((item) => item.scalerId).filter(Boolean).sort();
      const proposal = {
        campaignId: room.campaignId, zoneId, businessId: room.businessId,
        currentVersion, currentDigest: room.materialLogisticsDigest,
        currentLogistics: room.materialLogistics,
        proposedVersion, proposedDigest, proposedLogistics: proposed, reason,
        affectedParticipantIds: eligible.map((item) => item.participantId).filter(Boolean),
        affectedScalerIds, acceptedScalerIds: [], declinedScalerIds: [],
        pendingScalerIds: affectedScalerIds, status: "pending_acknowledgment",
        createdBy: context.uid, createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1,
      };
      transaction.create(proposalRef, proposal);
      for (const scalerId of affectedScalerIds) {
        setInAppNotification(transaction, inAppNotification({
          id: `material-change_${proposalRef.id}_${scalerId}`, userId: scalerId,
          type: "material_change_proposed",
          title: "Material plan change requires your response",
          message: "The Business proposed a change to your material pickup or delivery plan.",
          campaignId: room.campaignId, zoneId, entityId: proposalRef.id,
          deepLink: {destination: "material_change_review", zoneId,
            proposalId: proposalRef.id}, priority: "high",
          metadata: {currentVersion, proposedVersion},
        }));
      }
      result = {proposalId: proposalRef.id, ...proposal};
    });
    return result;
  });

exports.respondToMaterialLogisticsChange = operationalCallable(
  "respondToMaterialLogisticsChange", async (request) => {
    assertOperationalPayload(request.data, new Set(["proposalId", "decision"]), 4096);
    const context = await requireVerifiedUser(request,
      "Verify your email before responding to a logistics change.");
    const proposalId = String(request.data?.proposalId || "").trim();
    const decision = String(request.data?.decision || "").trim();
    if (!proposalId || !["accept", "decline"].includes(decision)) {
      throw new HttpsError("invalid-argument", "Accept or decline the proposed logistics.");
    }
    const proposalRef = db.collection("materialLogisticsChangeProposals").doc(proposalId);
    let result;
    await db.runTransaction(async (transaction) => {
      const proposalSnapshot = await transaction.get(proposalRef);
      const proposal = proposalSnapshot.data() || {};
      if (!proposalSnapshot.exists || proposal.status !== "pending_acknowledgment") {
        throw new HttpsError("failed-precondition", "This logistics proposal is no longer pending.");
      }
      const affected = Array.isArray(proposal.affectedScalerIds) ? proposal.affectedScalerIds : [];
      if (!context.isAdmin && !affected.includes(context.uid)) {
        throw new HttpsError("permission-denied", "This proposal does not affect your assignment.");
      }
      const responder = context.isAdmin && !affected.includes(context.uid) ? null : context.uid;
      if (!responder) throw new HttpsError("failed-precondition", "Support cannot consent for an assigned Scaler.");
      const accepted = new Set(Array.isArray(proposal.acceptedScalerIds) ? proposal.acceptedScalerIds : []);
      const declined = new Set(Array.isArray(proposal.declinedScalerIds) ? proposal.declinedScalerIds : []);
      accepted.delete(responder); declined.delete(responder);
      (decision === "accept" ? accepted : declined).add(responder);
      const consent = operations.materialChangeConsentStatus({
        affectedScalerIds: affected,
        acceptedScalerIds: [...accepted], declinedScalerIds: [...declined],
      });
      const pending = consent.pendingScalerIds;
      const status = consent.status;
      const roomRef = db.collection("jobRooms").doc(proposal.zoneId);
      const campaignRef = db.collection("campaigns").doc(proposal.campaignId);
      const zoneRef = db.collection("campaignZones").doc(proposal.zoneId);
      const [roomSnapshot, campaignSnapshot, zoneSnapshot, participantsSnapshot] = await Promise.all([
        transaction.get(roomRef), transaction.get(campaignRef), transaction.get(zoneRef),
        transaction.get(db.collection("zoneScalerParticipations").where("zoneId", "==", proposal.zoneId)),
      ]);
      const participants = participantsSnapshot.docs.filter((doc) => affected.includes(doc.data()?.scalerUid));
      const handoffIds = participants.map((doc) => doc.data()?.materialHandoffId).filter(Boolean);
      if (!handoffIds.length && roomSnapshot.data()?.scalerId) handoffIds.push(proposal.zoneId);
      const handoffs = await Promise.all(handoffIds.map((id) =>
        transaction.get(db.collection("materialHandoffs").doc(id))));
      const timestamp = FieldValue.serverTimestamp();
      transaction.update(proposalRef, {
        acceptedScalerIds: [...accepted].sort(), declinedScalerIds: [...declined].sort(),
        pendingScalerIds: pending, status, updatedAt: timestamp,
        [`acknowledgments.${responder}`]: {decision, acknowledgedAt: timestamp},
      });
      setInAppNotification(transaction, inAppNotification({
        id: `material-change-response_${proposalId}_${responder}`,
        userId: proposal.businessId, type: `material_change_${decision}`,
        title: `A Scaler ${decision === "accept" ? "accepted" : "declined"} the material-plan change`,
        message: `${accepted.size} accepted • ${pending.length} pending • ${declined.size} declined.`,
        campaignId: proposal.campaignId, zoneId: proposal.zoneId,
        entityId: proposalId, deepLink: {destination: "job_room", zoneId: proposal.zoneId},
        priority: decision === "decline" ? "high" : "normal",
        metadata: {responder, decision, acceptedCount: accepted.size,
          pendingCount: pending.length, declinedCount: declined.size},
      }));
      if (status === "accepted") {
        const details = proposal.proposedLogistics;
        const update = {
          materialsRequired: details.materialsRequired,
          materialFulfillmentType: details.fulfillmentType,
          materialHandoffMethod: details.fulfillmentType,
          materialHandoffScheduledAt: details.scheduledAt,
          materialHandoffWindowEndAt: details.windowEndAt,
          materialHandoffAddress: details.location,
          materialHandoffPrintingShopName: details.printingShopName,
          materialHandoffOrderReference: details.orderReference,
          materialHandoffInstructions: details.instructions,
          materialLogisticsVersion: proposal.proposedVersion,
          materialLogisticsDigest: proposal.proposedDigest,
          updatedAt: timestamp,
        };
        transaction.update(campaignRef, update);
        transaction.update(zoneRef, {
          materialLogisticsVersion: proposal.proposedVersion,
          materialLogisticsDigest: proposal.proposedDigest, updatedAt: timestamp,
        });
        transaction.update(roomRef, {
          materialLogisticsHistory: FieldValue.arrayUnion(roomSnapshot.data()?.materialLogistics || {}),
          materialLogistics: {...details, version: proposal.proposedVersion},
          materialLogisticsVersion: proposal.proposedVersion,
          materialLogisticsDigest: proposal.proposedDigest, updatedAt: timestamp,
        });
        for (const participant of participants) transaction.update(participant.ref, {
          adoptedMaterialLogisticsVersion: proposal.proposedVersion,
          adoptedMaterialLogisticsDigest: proposal.proposedDigest, updatedAt: timestamp,
        });
        for (const handoff of handoffs) {
          if (!handoff.exists || !operations.canRewriteMaterialHandoff(handoff.data()?.status)) continue;
          transaction.update(handoff.ref, {
            required: details.materialsRequired, fulfillmentType: details.fulfillmentType,
            status: details.materialsRequired ? String(handoff.data()?.status || "scheduled") : "not_required",
            scheduledAt: details.scheduledAt, windowEndAt: details.windowEndAt,
            privateLocation: details.location, printingShopName: details.printingShopName,
            orderReference: details.orderReference, instructions: details.instructions,
            logisticsVersion: proposal.proposedVersion, logisticsUpdatedAt: timestamp,
            updatedAt: timestamp,
          });
        }
        for (const recipientId of [...new Set([proposal.businessId, ...affected])]) {
          setInAppNotification(transaction, inAppNotification({
            id: `material-change-confirmed_${proposalId}_${recipientId}`,
            userId: recipientId, type: "material_change_confirmed",
            title: "Updated material plan confirmed",
            message: "All required participants accepted the updated material plan.",
            campaignId: proposal.campaignId, zoneId: proposal.zoneId,
            entityId: proposalId,
            deepLink: {destination: "job_room", zoneId: proposal.zoneId},
            priority: "high", metadata: {materialLogisticsVersion: proposal.proposedVersion},
          }));
        }
      }
      result = {proposalId, status, acceptedScalerIds: [...accepted].sort(),
        declinedScalerIds: [...declined].sort(), pendingScalerIds: pending};
    });
    return result;
  });

exports.configureJobCoordination = operationalCallable(
  "configureJobCoordination", async (request) => {
    assertOperationalPayload(request.data, new Set([
      "zoneId", "fulfillmentType", "scheduledAt", "windowEndAt", "location",
      "printingShopName", "orderReference", "instructions",
    ]), 16384);
    const context = await requireVerifiedUser(request,
      "Verify your email before coordinating this job.");
    const zoneId = String(request.data?.zoneId || "").trim();
    const roomRef = db.collection("jobRooms").doc(zoneId);
    const timestamp = FieldValue.serverTimestamp();
    let result;
    await db.runTransaction(async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      const room = roomSnapshot.data() || {};
      if (!roomSnapshot.exists ||
          (!context.isAdmin && context.uid !== room.businessId)) {
        throw new HttpsError("permission-denied",
          "Only the owning Business may configure this Job Room.");
      }
      const campaignSnapshot = await transaction.get(db.collection("campaigns").doc(room.campaignId));
      const scalerIds = Array.isArray(room.scalerIds) ? room.scalerIds :
        (room.scalerId ? [room.scalerId] : []);
      const participantQuery = await transaction.get(
        db.collection("zoneScalerParticipations").where("zoneId", "==", zoneId),
      );
      const handoffIds = participantQuery.docs.map((doc) => doc.data().materialHandoffId)
        .filter(Boolean);
      if (!handoffIds.length && room.scalerId) handoffIds.push(zoneId);
      const handoffSnapshots = await Promise.all(handoffIds.map((id) =>
        transaction.get(db.collection("materialHandoffs").doc(id))));
      let details;
      try {
        details = operations.normalizeMaterialLogistics(request.data || {});
      } catch (error) {
        throw new HttpsError("invalid-argument", error.message);
      }
      const campaign = campaignSnapshot.data() || {};
      if (!campaignSnapshot.exists || campaign.businessId !== room.businessId) {
        throw new HttpsError("failed-precondition", "Campaign logistics are unavailable.");
      }
      if (room.materialLogisticsLockedAt || campaign.materialLogisticsLockedAt) {
        throw new HttpsError("failed-precondition",
          "Material logistics are locked because a Scaler accepted this job. Propose a change instead.");
      }
      if (room.scalerId || (Array.isArray(room.scalerIds) && room.scalerIds.length)) {
        throw new HttpsError("failed-precondition",
          "Material logistics are locked because a Scaler accepted this job. Propose a change instead.");
      }
      const version = Number(room.materialLogistics?.version || 0) + 1;
      const roomUpdate = {
        materialLogistics: {...details, configured: true, configuredBy: context.uid,
          configuredAt: timestamp, version},
        coordination: {configured: true, materialsRequired: details.materialsRequired},
        updatedAt: timestamp,
      };
      if (room.materialLogistics) {
        roomUpdate.materialLogisticsHistory = FieldValue.arrayUnion(room.materialLogistics);
      }
      transaction.update(roomRef, roomUpdate);
      transaction.update(campaignSnapshot.ref, {
        materialsRequired: details.materialsRequired,
        materialFulfillmentType: details.fulfillmentType,
        materialHandoffScheduledAt: details.scheduledAt,
        materialHandoffWindowEndAt: details.windowEndAt,
        materialHandoffAddress: details.location,
        materialHandoffInstructions: details.instructions,
        materialLogisticsVersion: version,
        updatedAt: timestamp,
      });
      for (const snapshot of handoffSnapshots) {
        if (!snapshot.exists || !operations.canRewriteMaterialHandoff(snapshot.data()?.status)) continue;
        transaction.update(snapshot.ref, {
          required: details.materialsRequired,
          fulfillmentType: details.fulfillmentType,
          status: details.materialsRequired ? String(snapshot.data()?.status || "scheduled") : "not_required",
          scheduledAt: details.scheduledAt,
          windowEndAt: details.windowEndAt,
          privateLocation: details.location,
          printingShopName: details.printingShopName,
          orderReference: details.orderReference,
          instructions: details.instructions,
          logisticsVersion: version,
          logisticsUpdatedAt: timestamp,
          updatedAt: timestamp,
        });
      }
      for (const scalerId of scalerIds) {
        setInAppNotification(transaction, inAppNotification({
          id: `job-coordination_${zoneId}_${scalerId}`,
          userId: scalerId, campaignId: room.campaignId, zoneId,
          type: "job_coordination_updated", title: "Material logistics available",
          message: "Review the pickup or delivery plan and work details for your assigned job.",
          deepLink: {destination: "job_room", zoneId},
        }));
      }
      result = details;
    });
    return result;
  });

exports.acknowledgeJobReadiness = operationalCallable(
  "acknowledgeJobReadiness", async (request) => {
    assertOperationalPayload(request.data, new Set(["zoneId"]), 4096);
    const context = await requireVerifiedUser(request,
      "Verify your email before acknowledging readiness.");
    const zoneId = String(request.data?.zoneId || "").trim();
    const roomRef = db.collection("jobRooms").doc(zoneId);
    const participantRef = db.collection("zoneScalerParticipations")
      .doc(groupAssignment.participantId(zoneId, context.uid));
    const readinessRef = roomRef.collection("readiness").doc(context.uid);
    const alreadyAcknowledged = await db.runTransaction(async (transaction) => {
      const [roomSnapshot, participantSnapshot, readinessSnapshot] = await Promise.all([
        transaction.get(roomRef), transaction.get(participantRef),
        transaction.get(readinessRef),
      ]);
      const room = roomSnapshot.data() || {};
      const groupMember = Array.isArray(room.scalerIds) && room.scalerIds.includes(context.uid);
      const singleMember = room.scalerId === context.uid;
      if (!roomSnapshot.exists || !groupMember && !singleMember) {
        throw new HttpsError("permission-denied",
          "This private Job Room is unavailable.");
      }
      if (readinessSnapshot.data()?.readinessAcknowledged === true ||
          participantSnapshot.data()?.readinessAcknowledged === true) {
        return true;
      }
      const timestamp = FieldValue.serverTimestamp();
      if (participantSnapshot.exists) {
        transaction.update(participantRef, {
          readinessAcknowledged: true, readinessAcknowledgedAt: timestamp,
          updatedAt: timestamp,
        });
      }
      transaction.set(readinessRef, {
        scalerId: context.uid, reviewedJobDetails: true,
        readinessAcknowledged: true, acknowledgedAt: timestamp,
      }, {merge: true});
      transaction.update(roomRef, {updatedAt: timestamp});
      setInAppNotification(transaction, inAppNotification({
        id: `ready_${zoneId}_${context.uid}`, userId: room.businessId,
        type: "job_readiness_acknowledged", title: "Scaler confirmed job details",
        message: "An assigned Scaler reviewed the Job Room and confirmed readiness. This is not attendance.",
        campaignId: room.campaignId, zoneId, entityId: context.uid,
        deepLink: {destination: "job_room", zoneId}, priority: "low",
        metadata: {scalerId: context.uid, attendanceConfirmed: false,
          materialReceiptConfirmed: false},
      }));
      return false;
    });
    return {readinessAcknowledged: true, alreadyAcknowledged};
  });

exports.transitionMaterialHandoff = operationalCallable("transitionMaterialHandoff", async (request) => {
  assertOperationalPayload(request.data, new Set([
    "zoneId", "handoffId", "nextStatus", "latitude", "longitude", "accuracy", "proofStoragePath",
  ]), 16384);
  const context = await requireVerifiedUser(request, "Verify your email to update material handoff.");
  const zoneId = String(request.data?.zoneId || "").trim();
  const nextStatus = String(request.data?.nextStatus || "").trim();
  const requestedHandoffId = String(request.data?.handoffId || zoneId).trim();
  let handoffRef = db.collection("materialHandoffs").doc(requestedHandoffId);
  let verifiedProof = null;
  if (nextStatus === "received" && request.data?.proofStoragePath) {
    const path = String(request.data.proofStoragePath);
    if (!path.startsWith(`material_handoffs/${context.uid}/${requestedHandoffId}/`)) {
      throw new HttpsError("invalid-argument", "The handoff proof path is not owned by this user and job.");
    }
    try {
      const [metadata] = await getStorage().bucket().file(path).getMetadata();
      const size = Number(metadata.size || 0);
      if (!String(metadata.contentType || "").match(/^image\/(jpeg|png|webp|heic|heif)$/) ||
          !Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024) {
        throw new Error("invalid image metadata");
      }
      verifiedProof = {storagePath: path, contentType: metadata.contentType, size};
    } catch (_) {
      throw new HttpsError("failed-precondition", "Upload a valid handoff photo before confirming receipt.");
    }
  }
  let resolvedStatus = nextStatus;
  await db.runTransaction(async (transaction) => {
    let snapshot = await transaction.get(handoffRef);
    if (!snapshot.exists) {
      const participantRef = db.collection("zoneScalerParticipations")
        .doc(groupAssignment.participantId(zoneId, context.uid));
      const participantSnapshot = await transaction.get(participantRef);
      const participantHandoffId = participantSnapshot.data()?.materialHandoffId;
      if (participantHandoffId) {
        handoffRef = db.collection("materialHandoffs").doc(participantHandoffId);
        snapshot = await transaction.get(handoffRef);
      }
    }
    const handoff = snapshot.data() || {};
    if (!snapshot.exists ||
        handoff.zoneId !== zoneId ||
        (!context.isAdmin && ![handoff.businessId, handoff.scalerId].includes(context.uid))) {
      throw new HttpsError("permission-denied", "This material handoff is unavailable.");
    }
    const currentStatus = String(handoff.status);
    if (nextStatus === "received" && currentStatus === "received") {
      resolvedStatus = "received";
      return;
    }
    const scalerOnly = ["scaler_en_route", "scaler_arrived"];
    if (scalerOnly.includes(nextStatus) && !context.isAdmin && context.uid !== handoff.scalerId) {
      throw new HttpsError("permission-denied", "Only the assigned Scaler may record arrival.");
    }
    const update = {updatedAt: FieldValue.serverTimestamp()};
    let confirmationRecorded = false;
    if (nextStatus === "business_arrived") {
      if (!context.isAdmin && context.uid !== handoff.businessId) {
        throw new HttpsError("permission-denied", "Only the Business may record its arrival.");
      }
      if (!["scheduled", "scaler_en_route", "scaler_arrived", "waiting_for_counterparty", "handoff_in_progress"].includes(currentStatus)) {
        throw new HttpsError("failed-precondition", "Business arrival cannot be recorded in this handoff state.");
      }
      const latitude = Number(request.data?.latitude);
      const longitude = Number(request.data?.longitude);
      const accuracy = Number(request.data?.accuracy);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 500) {
        throw new HttpsError("invalid-argument", "Valid Business arrival GPS proof is required.");
      }
      update.businessArrivalProof = {latitude, longitude, accuracy};
      update.businessArrivedAt = FieldValue.serverTimestamp();
      update.businessConfirmedAt = FieldValue.serverTimestamp();
      resolvedStatus = currentStatus === "scheduled" ? "waiting_for_counterparty" : currentStatus;
    }
    if (nextStatus === "scaler_arrived") {
      const latitude = Number(request.data?.latitude);
      const longitude = Number(request.data?.longitude);
      const accuracy = Number(request.data?.accuracy);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 500) {
        throw new HttpsError("invalid-argument", "Valid arrival GPS proof is required.");
      }
      update.arrivalProof = {latitude, longitude, accuracy};
      update.arrivedAt = FieldValue.serverTimestamp();
      if (currentStatus === "waiting_for_counterparty") {
        resolvedStatus = "handoff_in_progress";
      }
    }
    if (nextStatus === "received") {
      const confirmingBusiness = context.uid === handoff.businessId;
      const confirmingScaler = context.uid === handoff.scalerId;
      if (!confirmingBusiness && !confirmingScaler) {
        throw new HttpsError("permission-denied",
          "Only the assigned Business or Scaler may confirm this material handoff.");
      }
      const businessWasConfirmed = handoff.businessConfirmedAt != null;
      const scalerWasConfirmed = handoff.scalerConfirmedAt != null;
      if (confirmingBusiness && !businessWasConfirmed) {
        update.businessConfirmedAt = FieldValue.serverTimestamp();
        update.businessConfirmedBy = context.uid;
        confirmationRecorded = true;
      }
      if (confirmingScaler && !scalerWasConfirmed) {
        update.scalerConfirmedAt = FieldValue.serverTimestamp();
        update.scalerConfirmedBy = context.uid;
        confirmationRecorded = true;
      }
      if (verifiedProof) update.supportingProof = verifiedProof;
      const scalerConfirmed = scalerWasConfirmed || confirmingScaler;
      const businessConfirmed = businessWasConfirmed || confirmingBusiness;
      resolvedStatus = scalerConfirmed && businessConfirmed ? "received" : "handoff_in_progress";
      if (!confirmationRecorded && !verifiedProof) return;
      if (resolvedStatus === "received") update.receivedAt = FieldValue.serverTimestamp();
    } else if (nextStatus !== "business_arrived" &&
        !(nextStatus === "scaler_arrived" && currentStatus === "waiting_for_counterparty")) {
      try {
        operations.assertHandoffTransition(currentStatus, nextStatus);
      } catch (_) {
        throw new HttpsError("failed-precondition", "That handoff transition is not allowed.");
      }
    }
    update.status = resolvedStatus;
    transaction.update(handoffRef, update);
    if (confirmationRecorded && resolvedStatus !== "received") {
      const recipientId = context.uid === handoff.businessId ? handoff.scalerId : handoff.businessId;
      const businessConfirmed = context.uid === handoff.businessId;
      setInAppNotification(transaction, inAppNotification({
        id: `material-${businessConfirmed ? "business" : "scaler"}-confirmed_${handoffRef.id}`,
        userId: recipientId, type: "material_confirmation_recorded",
        title: businessConfirmed ? "Business confirmed material handoff" :
          "Scaler confirmed material receipt",
        message: businessConfirmed ?
          "The Business confirmed materials were delivered or released. Your confirmation is still required." :
          "The Scaler confirmed receipt. Your Business confirmation is still required.",
        campaignId: handoff.campaignId, zoneId, entityId: handoffRef.id,
        deepLink: {destination: "job_room", zoneId}, priority: "low",
        metadata: {scalerId: handoff.scalerId, handoffId: handoffRef.id},
      }));
    }
    if (resolvedStatus === "received") {
      setInAppNotification(transaction, inAppNotification({
        id: `material-received_${handoffRef.id}`, userId: handoff.businessId,
        type: "material_received", title: "Scaler received materials",
        message: "One assigned Scaler's material receipt is confirmed.",
        campaignId: handoff.campaignId, zoneId, entityId: handoffRef.id,
        deepLink: {destination: "job_room", zoneId},
        metadata: {scalerId: handoff.scalerId, handoffId: handoffRef.id},
      }));
    }
    appendJobEvent(transaction, {
      campaignId: handoff.campaignId, zoneId, businessId: handoff.businessId,
      scalerId: handoff.scalerId, actorId: context.uid,
      type: nextStatus === "business_arrived" ? "material.business_arrived" :
        resolvedStatus === "received" ? "material.handoff_confirmed" :
        `material.${resolvedStatus}`,
    });
  });
  return {zoneId, status: resolvedStatus};
});

exports.createSupportCase = trackingCallable("createSupportCase", async (request) => {
  assertTrackingPayload(request.data, new Set(["zoneId", "category", "summary"]), 12288);
  const context = await requireVerifiedUser(request, "Verify your email to contact support.");
  const zoneId = String(request.data?.zoneId || "").trim();
  let category;
  try {
    category = operations.normalizeSupportCategory(request.data?.category);
  } catch (_) {
    throw new HttpsError("invalid-argument", "Choose a supported case category.");
  }
  const summary = String(request.data?.summary || "").trim();
  if (!zoneId || !summary || summary.length > 3000) {
    throw new HttpsError("invalid-argument", "A valid support summary is required.");
  }
  const ref = db.collection("supportCases").doc();
  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(db.collection("jobRooms").doc(zoneId));
    const room = roomSnapshot.data() || {};
    if (!roomSnapshot.exists || !operations.isJobRoomMember({
      room, uid: context.uid, isAdmin: context.isAdmin,
    })) {
      throw new HttpsError("permission-denied", "This job is unavailable.");
    }
    transaction.create(ref, {
      zoneId, campaignId: room.campaignId, businessId: room.businessId,
      scalerId: room.scalerId, openedBy: context.uid, category, summary,
      status: "open", priority: "normal", supportEmail: SUPPORT_EMAIL,
      references: {
        jobRoomId: zoneId, materialHandoffId: null, compensationId: zoneId,
        trackingZoneId: zoneId, chatRoomId: zoneId, campaignPaymentId: null,
        transferOperationId: null, completionId: null,
      },
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    appendJobEvent(transaction, {
      campaignId: room.campaignId, zoneId, businessId: room.businessId,
      scalerId: room.scalerId, actorId: context.uid, type: "support.case_opened",
      metadata: {caseId: ref.id, category},
    });
    if (category === "material_handoff" && context.uid !== room.businessId) {
      setInAppNotification(transaction, inAppNotification({
        id: `material-issue_${ref.id}_${room.businessId}`,
        userId: room.businessId, type: "material_issue",
        title: "Material issue reported",
        message: "An assigned Scaler reported a material handoff issue.",
        campaignId: room.campaignId, zoneId, entityId: ref.id,
        deepLink: {destination: "job_room", zoneId},
        metadata: {caseId: ref.id, scalerId: context.uid},
      }));
    }
  });
  return {caseId: ref.id, status: "open"};
});

exports.reportMaterialHandoffFailure = trackingCallable(
  "reportMaterialHandoffFailure", async (request) => {
    assertTrackingPayload(request.data, new Set(["zoneId", "failureType", "summary"]), 12288);
    const context = await requireVerifiedUser(request, "Verify your email to report a handoff failure.");
    const zoneId = String(request.data?.zoneId || "").trim();
    const failureType = String(request.data?.failureType || "").trim();
    if (!["failed_scaler", "failed_business", "failed_third_party"].includes(failureType)) {
      throw new HttpsError("invalid-argument", "A supported failure type is required.");
    }
    const handoffRef = db.collection("materialHandoffs").doc(zoneId);
    const compensationRef = db.collection("assignmentCompensations").doc(zoneId);
    const zoneRef = db.collection("campaignZones").doc(zoneId);
    const roomRef = db.collection("jobRooms").doc(zoneId);
    const supportRef = db.collection("supportCases").doc();
    const reliabilityRef = db.collection("scalerReliabilityEvents").doc();
    const financeRef = db.collection("financialOperations").doc(`business-no-show_${zoneId}`);
    await db.runTransaction(async (transaction) => {
      const [snapshot, compensationSnapshot, zoneSnapshot, financeSnapshot] = await Promise.all([
        transaction.get(handoffRef), transaction.get(compensationRef),
        transaction.get(zoneRef), transaction.get(financeRef),
      ]);
      const handoff = snapshot.data() || {};
      if (!snapshot.exists ||
          (!context.isAdmin && ![handoff.businessId, handoff.scalerId].includes(context.uid))) {
        throw new HttpsError("permission-denied", "This handoff is unavailable.");
      }
      if (failureType === "failed_business" && handoff.status === "failed_business" &&
          financeSnapshot.exists) return;
      if (failureType === "failed_scaler" && !context.isAdmin && context.uid !== handoff.businessId) {
        throw new HttpsError("permission-denied", "Only the Business may report a Scaler no-show.");
      }
      if (failureType === "failed_business" && !context.isAdmin && context.uid !== handoff.scalerId) {
        throw new HttpsError("permission-denied", "Only the Scaler may report a Business no-show.");
      }
      if (!operations.graceExpired(handoff.scheduledAt)) {
        throw new HttpsError("failed-precondition", "The 15-minute handoff grace period is still active.");
      }
      if (failureType === "failed_business" &&
          (!handoff.arrivalProof || !operations.arrivalWasTimely({
            scheduledAt: handoff.scheduledAt, arrivedAt: handoff.arrivedAt,
          }))) {
        throw new HttpsError("failed-precondition", "Verified on-time Scaler arrival is required.");
      }
      try {
        operations.assertHandoffTransition(String(handoff.status), failureType);
      } catch (_) {
        throw new HttpsError("failed-precondition", "This handoff can no longer be failed.");
      }
      const finalStatus = failureType === "failed_third_party" ? "support_review" : failureType;
      let businessFailure = null;
      if (failureType === "failed_business") {
        if (!compensationSnapshot.exists) {
          throw new HttpsError("failed-precondition", "The immutable compensation contract is missing.");
        }
        const compensation = compensationSnapshot.data() || {};
        const campaignRef = db.collection("campaigns").doc(handoff.campaignId);
        const campaignSnapshot = await transaction.get(campaignRef);
        const paymentId = String(zoneSnapshot.data()?.fundingPaymentId ||
          campaignSnapshot.data()?.fundingPaymentId || "");
        if (!campaignSnapshot.exists || !paymentId) {
          throw new HttpsError("failed-precondition", "Authoritative campaign funding is missing.");
        }
        const paymentRef = db.collection("campaignPayments").doc(paymentId);
        const paymentSnapshot = await transaction.get(paymentRef);
        const funding = paymentSnapshot.data() || {};
        if (!paymentSnapshot.exists || funding.status !== marketplace.PAYMENT_STATES.funded ||
            funding.campaignId !== handoff.campaignId || funding.businessId !== handoff.businessId ||
            funding.settlementFrozen === true) {
          throw new HttpsError("failed-precondition", "Campaign funding is not eligible for allocation.");
        }
        const payment = operations.calculateBusinessNoShowAllocation({
          workerAmountCents: Number(compensation.baseAmountCents),
          // The funded payment ledger, not the handoff snapshot, is the
          // authority for the platform-fee allocation.
          platformFeeCents: Number(funding.platformFeeCents),
        });
        try {
          marketplace.assertAllocationAvailable(funding,
            payment.scalerCompensationCents, payment.workerRefundCents);
          marketplace.assertSafeCents(Number(funding.platformFeeCents), "platformFeeCents");
          const allocatedPlatform = Number(funding.platformFeeRecognizedCents || 0) +
            Number(funding.platformFeeRefundedCents || 0) + payment.platformRetainedCents;
          if (allocatedPlatform > Number(funding.platformFeeCents)) {
            throw new Error("platform_fee_allocation_exceeded");
          }
          if (Number(funding.platformFeePendingCents || 0) < payment.platformRetainedCents) {
            throw new Error("platform_fee_pending_exhausted");
          }
        } catch (_) {
          throw new HttpsError("failed-precondition", "Campaign funding allocation is exhausted.");
        }
        businessFailure = {payment, paymentId, paymentRef};
      }

      transaction.update(handoffRef, {
        status: finalStatus, failedAt: FieldValue.serverTimestamp(),
        failureReportedBy: context.uid,
        failureSummary: String(request.data?.summary || "").trim().slice(0, 1000),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (failureType === "failed_business") {
        const {payment, paymentId, paymentRef} = businessFailure;
        if (!financeSnapshot.exists) transaction.create(financeRef, {
          operationId: financeRef.id,
          type: "business_no_show_eligibility", status: "eligible_support_review",
          zoneId, campaignId: handoff.campaignId, businessId: handoff.businessId,
          scalerId: handoff.scalerId, ownerId: handoff.businessId,
          paymentId, assignmentCompensationId: compensationRef.id, ...payment,
          externalExecutionAuthorized: false,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(paymentRef, {
          reservedWorkerAmountCents: FieldValue.increment(
            payment.scalerCompensationCents + payment.workerRefundCents),
          platformFeeRecognizedCents: FieldValue.increment(payment.platformRetainedCents),
          platformFeePendingCents: FieldValue.increment(-payment.platformRetainedCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (zoneSnapshot.exists) transaction.update(zoneRef, {
          status: "failed_business", settlementBlocked: true,
          handoffFailureOperationId: financeRef.id,
          activeTrackingSessionId: FieldValue.delete(), gpsTracking: false,
          paymentStatus: "support_resolution", updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(roomRef, {status: "closed", updatedAt: FieldValue.serverTimestamp()},
          {merge: true});
        appendJobEvent(transaction, {
          campaignId: handoff.campaignId, zoneId, businessId: handoff.businessId,
          scalerId: handoff.scalerId, actorId: context.uid,
          type: "financial.handoff_compensation_eligible", metadata: payment,
        });
        appendJobEvent(transaction, {
          campaignId: handoff.campaignId, zoneId, businessId: handoff.businessId,
          scalerId: handoff.scalerId, actorId: context.uid,
          type: "financial.refund_eligible", metadata: payment,
        });
      } else if (failureType === "failed_scaler") {
        transaction.create(reliabilityRef, {
          scalerId: handoff.scalerId, businessId: handoff.businessId,
          campaignId: handoff.campaignId, zoneId, type: "material_no_show",
          compensationEligible: false, createdAt: FieldValue.serverTimestamp(),
        });
        if (zoneSnapshot.exists) transaction.update(zoneRef, {
          status: "available", assignedScalerId: FieldValue.delete(),
          assignedScalerEmail: FieldValue.delete(), assignedApplicationId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(roomRef, {status: "closed", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      } else {
        transaction.create(supportRef, {
          zoneId, campaignId: handoff.campaignId, businessId: handoff.businessId,
          scalerId: handoff.scalerId, openedBy: context.uid,
          category: "material_handoff", summary: "Third-party material handoff failed.",
          status: "open", priority: "high", supportEmail: SUPPORT_EMAIL,
          references: {jobRoomId: zoneId, materialHandoffId: zoneId, compensationId: zoneId},
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1,
        });
        appendJobEvent(transaction, {
          campaignId: handoff.campaignId, zoneId, businessId: handoff.businessId,
          scalerId: handoff.scalerId, actorId: context.uid, type: "material.support_review",
        });
      }
      setInAppNotification(transaction, inAppNotification({
        id: `material-issue_${handoffRef.id}_${failureType}`,
        userId: handoff.businessId, type: "material_issue_reported",
        title: "Material issue reported",
        message: "A participant material handoff requires attention.",
        campaignId: handoff.campaignId, zoneId, entityId: handoffRef.id,
        deepLink: {destination: "job_room", zoneId}, priority: "high",
        metadata: {scalerId: handoff.scalerId, failureType,
          supportCaseId: failureType === "failed_third_party" ? supportRef.id : null},
      }));
      appendJobEvent(transaction, {
        campaignId: handoff.campaignId, zoneId, businessId: handoff.businessId,
        scalerId: handoff.scalerId, actorId: context.uid, type: `material.${failureType}`,
      });
    });
    return {zoneId, status: failureType === "failed_third_party" ? "support_review" : failureType};
  },
);

exports.resolveSupportCase = trackingCallable("resolveSupportCase", async (request) => {
  assertTrackingPayload(request.data, new Set(["caseId", "resolution"]), 12288);
  const context = await requireVerifiedUser(request, "Sign in to resolve this case.");
  if (!context.isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  const caseId = String(request.data?.caseId || "").trim();
  const resolution = String(request.data?.resolution || "").trim();
  if (!caseId || !resolution || resolution.length > 3000) {
    throw new HttpsError("invalid-argument", "A case and resolution are required.");
  }
  const ref = db.collection("supportCases").doc(caseId);
  await ref.update({
    status: "resolved", resolution, resolvedBy: context.uid,
    resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return {caseId, status: "resolved"};
});

exports.listSupportCases = trackingCallable("listSupportCases", async (request) => {
  assertTrackingPayload(request.data, new Set(["status"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in to view support cases.");
  if (!context.isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  const status = String(request.data?.status || "open").trim();
  const snapshot = await db.collection("supportCases").where("status", "==", status).limit(100).get();
  return {cases: snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}))};
});

exports.getSupportCaseDetails = trackingCallable("getSupportCaseDetails", async (request) => {
  assertTrackingPayload(request.data, new Set(["caseId"]), 4096);
  const context = await requireVerifiedUser(request, "Sign in to view this support case.");
  if (!context.isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  const caseId = String(request.data?.caseId || "").trim();
  const caseRef = db.collection("supportCases").doc(caseId);
  const caseSnapshot = await caseRef.get();
  if (!caseSnapshot.exists) throw new HttpsError("not-found", "Support case not found.");
  const supportCase = caseSnapshot.data() || {};
  const zoneId = String(supportCase.zoneId || "");
  const campaignId = String(supportCase.campaignId || "");
  const refs = supportCase.references || {};
  const safeGet = async (collection, id) => {
    if (!id) return null;
    const snapshot = await db.collection(collection).doc(String(id)).get();
    return snapshot.exists ? {id: snapshot.id, ...snapshot.data()} : null;
  };
  const [campaign, zone, handoff, room, completion, route, payment, transfer, notes, messages, events] = await Promise.all([
    safeGet("campaigns", campaignId), safeGet("campaignZones", zoneId),
    safeGet("materialHandoffs", refs.materialHandoffId || zoneId), safeGet("jobRooms", refs.jobRoomId || zoneId),
    safeGet("campaignCompletions", refs.completionId), safeGet("campaignRoutes", refs.routeId),
    safeGet("campaignPayments", refs.campaignPaymentId), safeGet("scalerTransfers", refs.transferId),
    caseRef.collection("notes").orderBy("createdAt", "asc").limit(200).get(),
    db.collection("jobMessages").where("zoneId", "==", zoneId).limit(200).get(),
    db.collection("jobEvents").where("zoneId", "==", zoneId).limit(300).get(),
  ]);
  return {
    case: {id: caseSnapshot.id, ...supportCase}, campaign, zone, handoff, room,
    completion, route, payment, transfer,
    notes: notes.docs.map((doc) => ({id: doc.id, ...doc.data()})),
    messages: messages.docs.map((doc) => ({id: doc.id, ...doc.data()})),
    events: events.docs.map((doc) => ({id: doc.id, ...doc.data()})),
  };
});

exports.addSupportNote = trackingCallable("addSupportNote", async (request) => {
  assertTrackingPayload(request.data, new Set(["caseId", "text"]), 8192);
  const context = await requireVerifiedUser(request, "Sign in to add a support note.");
  if (!context.isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  const caseId = String(request.data?.caseId || "").trim();
  const text = String(request.data?.text || "").trim();
  if (!caseId || !text || text.length > 3000) throw new HttpsError("invalid-argument", "A valid note is required.");
  const caseRef = db.collection("supportCases").doc(caseId);
  const noteRef = caseRef.collection("notes").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(caseRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Support case not found.");
    transaction.create(noteRef, {text, authorId: context.uid, createdAt: FieldValue.serverTimestamp()});
    transaction.update(caseRef, {updatedAt: FieldValue.serverTimestamp()});
  });
  return {noteId: noteRef.id};
});

exports.performSupportAction = trackingCallable("performSupportAction", async (request) => {
  assertTrackingPayload(request.data, new Set(["caseId", "action", "scheduledAt", "deadline", "resolution"]), 16384);
  const context = await requireVerifiedUser(request, "Sign in to perform support actions.");
  if (!context.isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  let action;
  try { action = operations.assertSupportAction(request.data?.action); } catch (_) {
    throw new HttpsError("invalid-argument", "Unsupported support action.");
  }
  const caseId = String(request.data?.caseId || "").trim();
  const caseRef = db.collection("supportCases").doc(caseId);
  await db.runTransaction(async (transaction) => {
    const caseSnapshot = await transaction.get(caseRef);
    if (!caseSnapshot.exists) throw new HttpsError("not-found", "Support case not found.");
    const supportCase = caseSnapshot.data() || {};
    const zoneRef = db.collection("campaignZones").doc(supportCase.zoneId);
    const handoffRef = db.collection("materialHandoffs").doc(supportCase.zoneId);
    const [zoneSnapshot, handoffSnapshot] = await Promise.all([
      transaction.get(zoneRef), transaction.get(handoffRef),
    ]);
    const zoneUpdate = {updatedAt: FieldValue.serverTimestamp()};
    const caseUpdate = {lastAction: action, lastActionBy: context.uid, updatedAt: FieldValue.serverTimestamp()};
    if (["release_assignment", "reopen_assignment"].includes(action) && zoneSnapshot.exists) {
      Object.assign(zoneUpdate, {status: "available", assignedScalerId: FieldValue.delete(), assignedScalerEmail: FieldValue.delete(), assignedApplicationId: FieldValue.delete()});
      transaction.update(zoneRef, zoneUpdate);
    } else if (action === "reschedule_handoff") {
      if (!request.data?.scheduledAt || !handoffSnapshot.exists) throw new HttpsError("invalid-argument", "A handoff schedule is required.");
      transaction.update(handoffRef, {status: "scheduled", scheduledAt: request.data.scheduledAt, updatedAt: FieldValue.serverTimestamp()});
    } else if (action === "authorize_redo" && zoneSnapshot.exists) {
      transaction.update(zoneRef, {...zoneUpdate, status: "redo_required"});
      appendJobEvent(transaction, {campaignId: supportCase.campaignId, zoneId: supportCase.zoneId, businessId: supportCase.businessId, scalerId: supportCase.scalerId, actorId: context.uid, type: "review.redo_requested"});
    } else if (action === "extend_deadline" && zoneSnapshot.exists) {
      if (!request.data?.deadline) throw new HttpsError("invalid-argument", "A deadline is required.");
      transaction.update(zoneRef, {...zoneUpdate, deadline: request.data.deadline});
    } else if (["restrict_account", "suspend_account"].includes(action)) {
      const targetId = supportCase.scalerId || supportCase.businessId;
      transaction.set(db.collection("users").doc(targetId), {accountStatus: action === "suspend_account" ? "suspended" : "restricted", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    } else if (action === "authorize_handoff_allocation") {
      const financeRef = db.collection("financialOperations").doc(`business-no-show_${supportCase.zoneId}`);
      const financeSnapshot = await transaction.get(financeRef);
      if (!financeSnapshot.exists) throw new HttpsError("failed-precondition", "No eligible allocation exists.");
      transaction.update(financeRef, {status: "authorized_no_external_execution", authorizedBy: context.uid, externalExecutionAuthorized: false, updatedAt: FieldValue.serverTimestamp()});
    } else if (action === "resolve_business_failure" && handoffSnapshot.exists) {
      transaction.update(handoffRef, {status: "failed_business", supportResolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    }
    if (action === "resolve_case") Object.assign(caseUpdate, {status: "resolved", resolution: String(request.data?.resolution || "Resolved by support."), resolvedBy: context.uid, resolvedAt: FieldValue.serverTimestamp()});
    transaction.update(caseRef, caseUpdate);
    appendJobEvent(transaction, {campaignId: supportCase.campaignId, zoneId: supportCase.zoneId, businessId: supportCase.businessId, scalerId: supportCase.scalerId, actorId: context.uid, type: `support.${action}`});
  });
  return {caseId, action};
});

exports.startTrackingSession = trackingCallable("startTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["campaignId", "zoneId"]), 4096);
  const context = await requireVerifiedUser(
    request,
    "Sign in before starting GPS tracking.",
  );
  if (context.role !== "scaler" && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Only an assigned Scaler can track a job.");
  }
  const campaignId = String(request.data?.campaignId || "").trim();
  const zoneId = String(request.data?.zoneId || "").trim();
  if (!campaignId || !zoneId) {
    throw new HttpsError("invalid-argument", "Campaign and zone are required.");
  }
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const pointerRef = db.collection("activeTrackingSessions").doc(context.uid);
  const participantRef = db.collection("zoneScalerParticipations")
    .doc(groupAssignment.participantId(zoneId, context.uid));
  const sessionRef = db.collection("trackingSessions").doc();
  let result = {sessionId: sessionRef.id, status: "active", recovered: false};
  await db.runTransaction(async (transaction) => {
    const [campaignSnapshot, zoneSnapshot, pointerSnapshot, participantSnapshot,
      trackingConsentStatus] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(zoneRef),
      transaction.get(pointerRef),
      transaction.get(participantRef),
      legalConsentService.status({
        uid: context.uid,
        agreementTypes: legalConsent.ROLE_REQUIREMENTS.scaler_tracking,
        transaction,
      }),
    ]);
    if (!campaignSnapshot.exists || !zoneSnapshot.exists) {
      throw new HttpsError("not-found", "The assigned job was not found.");
    }
    const campaign = campaignSnapshot.data() || {};
    const zone = zoneSnapshot.data() || {};
    const participant = participantSnapshot.data() || null;
    const groupAuthorized = participantSnapshot.exists && participant?.scalerUid === context.uid &&
      ["accepted", "started", "participating", "paused_work_window"].includes(String(participant.status));
    if (zone.campaignId !== campaignId ||
        (!context.isAdmin && zone.assignedScalerId !== context.uid && !groupAuthorized)) {
      throw new HttpsError("permission-denied", "This zone is not assigned to you.");
    }
    if (!["assigned", "accepted", "in_progress", "paused_work_window"].includes(String(zone.status))) {
      throw new HttpsError("failed-precondition", "This job cannot be started.");
    }
    const gate = await assertOperationalStart(transaction, {
      campaign, zone: {...zone, id: zoneId}, context, participant,
    });
    if (pointerSnapshot.exists) {
      const pointerSessionId = String(pointerSnapshot.data()?.sessionId || "");
      const pointedRef = db.collection("trackingSessions").doc(pointerSessionId);
      const pointedSnapshot = pointerSessionId ? await transaction.get(pointedRef) : null;
      const pointed = pointedSnapshot?.data() || null;
      if (pointed && ["active", "finalizing"].includes(String(pointed.status))) {
        if (pointed.scalerId === context.uid && pointed.campaignId === campaignId &&
            pointed.zoneId === zoneId && pointed.status === "active") {
          const priorCutoff = pointed.workWindowCutoffAt?.toDate?.() || null;
          // Fail-safe recovery when the scheduled cutoff worker was delayed or
          // unavailable. A later permitted work window closes the expired
          // segment and resumes the same long-lived tracking session with a
          // new immutable segment in this transaction.
          if (priorCutoff && priorCutoff.getTime() <= Date.now()) {
            const priorSegmentId = String(pointed.currentSegmentId || "");
            const segmentIndex = Number(pointed.segmentCount || 1) + 1;
            const segmentId = trackingSegmentId(segmentIndex);
            if (priorSegmentId) transaction.set(
              pointedRef.collection("segments").doc(priorSegmentId),
              {
                status: "closed_cutoff", closeReason: "work_window_cutoff",
                endedAt: Timestamp.fromDate(priorCutoff),
                updatedAt: FieldValue.serverTimestamp(),
              },
              {merge: true},
            );
            transaction.update(pointedRef, {
              status: "active", syncStatus: "collecting",
              pauseReason: FieldValue.delete(), pausedAt: FieldValue.delete(),
              currentSegmentId: segmentId, segmentCount: segmentIndex,
              workWindowEnd: gate.workWindow.end,
              workTimeZone: gate.workWindow.timeZone,
              workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
              workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.create(pointedRef.collection("segments").doc(segmentId), {
              segmentId, segmentIndex, status: "active",
              startedAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(pointerRef, {startedAt: FieldValue.serverTimestamp()});
            transaction.update(zoneRef, {
              status: "in_progress", activeTrackingSessionId: pointerSessionId,
              resumableTrackingSessionId: FieldValue.delete(), gpsTracking: true,
              gpsTrackingStartedAt: FieldValue.serverTimestamp(),
              workWindowEnd: gate.workWindow.end,
              workTimeZone: gate.workWindow.timeZone,
              workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
              workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
              updatedAt: FieldValue.serverTimestamp(),
            });
            appendJobEvent(transaction, {
              campaignId, zoneId,
              businessId: String(campaign.businessId || zone.businessId || ""),
              scalerId: context.uid, actorId: "system", type: "job.cutoff_paused",
              metadata: {reconciledOnResume: true, segmentId: priorSegmentId},
            });
            appendJobEvent(transaction, {
              campaignId, zoneId,
              businessId: String(campaign.businessId || zone.businessId || ""),
              scalerId: context.uid, actorId: context.uid, type: "job.started",
              metadata: {resumed: true, segmentId},
            });
            result = {
              sessionId: pointerSessionId, status: "active", recovered: true,
              resumed: true, segmentId,
              workWindowCutoffAtMs: gate.workWindow.cutoffAt.getTime(),
            };
            return;
          }
          result = {sessionId: pointerSessionId, status: "active", recovered: true};
          result.workWindowCutoffAtMs = gate.workWindow.cutoffAt.getTime();
          return;
        }
        throw new HttpsError("already-exists", "Another GPS tracking session is active.");
      }
      transaction.delete(pointerRef);
    }
    const resumableSessionId = String(participant?.resumableTrackingSessionId || zone.resumableTrackingSessionId || "");
    const resumeRequested = participant ? String(participant.status) === "paused_work_window" : String(zone.status) === "paused_work_window";
    if (resumeRequested && resumableSessionId) {
      const resumableRef = db.collection("trackingSessions").doc(resumableSessionId);
      const resumableSnapshot = await transaction.get(resumableRef);
      const resumable = resumableSnapshot.data() || {};
      if (!resumableSnapshot.exists || resumable.status !== "paused" ||
          resumable.scalerId !== context.uid || resumable.campaignId !== campaignId ||
          resumable.zoneId !== zoneId) {
        throw new HttpsError("failed-precondition", "The paused GPS session cannot be resumed.");
      }
      const segmentIndex = Number(resumable.segmentCount || 1) + 1;
      const segmentId = trackingSegmentId(segmentIndex);
      transaction.update(resumableRef, {
        status: "active", syncStatus: "collecting", pauseReason: FieldValue.delete(),
        pausedAt: FieldValue.delete(), currentSegmentId: segmentId,
        segmentCount: segmentIndex,
        workWindowEnd: gate.workWindow.end,
        workTimeZone: gate.workWindow.timeZone,
        workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
        workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(resumableRef.collection("segments").doc(segmentId), {
        segmentId, segmentIndex, status: "active", startedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(pointerRef, {
        sessionId: resumableSessionId, campaignId, zoneId, scalerId: context.uid,
        startedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(zoneRef, participant ? {
        status: "in_progress", updatedAt: FieldValue.serverTimestamp(),
      } : {
        status: "in_progress", activeTrackingSessionId: resumableSessionId,
        resumableTrackingSessionId: FieldValue.delete(), gpsTracking: true,
        gpsTrackingStartedAt: FieldValue.serverTimestamp(),
        workWindowEnd: gate.workWindow.end, workTimeZone: gate.workWindow.timeZone,
        workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
        workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (participant) transaction.update(participantRef, {status: "participating", attendanceStatus: "started",
        activeTrackingSessionId: resumableSessionId, resumableTrackingSessionId: FieldValue.delete(), gpsTracking: true,
        workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt), workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
        updatedAt: FieldValue.serverTimestamp()});
      result = {sessionId: resumableSessionId, status: "active", recovered: true,
        resumed: true, segmentId, workWindowCutoffAtMs: gate.workWindow.cutoffAt.getTime()};
      appendJobEvent(transaction, {
        campaignId, zoneId, businessId: String(campaign.businessId || zone.businessId || ""),
        scalerId: context.uid, actorId: context.uid, type: "job.started",
        metadata: {resumed: true, segmentId},
      });
      return;
    }
    // Existing active or paused sessions above are recovered without rewriting
    // their historical agreement state. Only creation of a new tracking
    // session requires the current location notice.
    if (trackingConsentStatus.missing.length) {
      const error = new Error("legal_consent_required");
      error.missing = trackingConsentStatus.missing;
      throw legalConsentError(
        error,
        "Review and accept the current location notice before starting tracking.",
      );
    }
    const firstSegmentId = trackingSegmentId(1);
    transaction.create(sessionRef, {
      campaignId,
      zoneId,
      businessId: String(campaign.businessId || zone.businessId || ""),
      scalerId: context.uid,
      participantId: participant?.participantId || null,
      groupAssignmentId: participant ? zoneId : null,
      status: "active",
      syncStatus: "collecting",
      simulated: false,
      startedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      uploadedPointCount: 0,
      acceptedPointCount: 0,
      rejectedPointCount: 0,
      pointCount: 0,
      chunkCount: 0,
      checkpointCount: 0,
      nextExpectedSequence: 1,
      lastUploadedSequence: 0,
      currentSegmentId: firstSegmentId,
      segmentCount: 1,
      workWindowEnd: gate.workWindow.end,
      workTimeZone: gate.workWindow.timeZone,
      workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
      workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
      schemaVersion: 2,
    });
    transaction.create(sessionRef.collection("segments").doc(firstSegmentId), {
      segmentId: firstSegmentId, segmentIndex: 1, status: "active",
      startedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(pointerRef, {
      sessionId: sessionRef.id,
      campaignId,
      zoneId,
      scalerId: context.uid,
      startedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, {
      status: "in_progress",
      ...(participant ? {} : {activeTrackingSessionId: sessionRef.id,
        gpsTracking: true, gpsTrackingStartedAt: FieldValue.serverTimestamp()}),
      startedAt: zone.startedAt || FieldValue.serverTimestamp(),
      workWindowEnd: gate.workWindow.end,
      workTimeZone: gate.workWindow.timeZone,
      workWindowCutoffAt: Timestamp.fromDate(gate.workWindow.cutoffAt),
      workWindowWarningAt: Timestamp.fromDate(gate.workWindow.warningAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (participant) transaction.update(participantRef, {
      status: "participating", attendanceStatus: "started",
      activeTrackingSessionId: sessionRef.id, gpsTracking: true,
      startedAt: participant.startedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendJobEvent(transaction, {
      campaignId, zoneId, businessId: String(campaign.businessId || zone.businessId || ""),
      scalerId: context.uid, actorId: context.uid, type: "job.start_authorized",
    });
    appendJobEvent(transaction, {
      campaignId, zoneId, businessId: String(campaign.businessId || zone.businessId || ""),
      scalerId: context.uid, actorId: context.uid, type: "job.started",
    });
    result = {
      sessionId: sessionRef.id, status: "active", recovered: false,
      resumed: false, segmentId: firstSegmentId,
      workWindowCutoffAtMs: gate.workWindow.cutoffAt.getTime(),
    };
  });
  return result;
});

exports.getTrackingSessionState = trackingCallable(
  "getTrackingSessionState", async (request) => {
    assertTrackingPayload(request.data, new Set(["sessionId"]), 4096);
    const context = await authenticatedUserContext(request, "Sign in to check tracking.");
    const sessionId = String(request.data?.sessionId || "").trim();
    if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
    const snapshot = await db.collection("trackingSessions").doc(sessionId).get();
    const session = snapshot.data();
    if (!snapshot.exists || !session ||
        (session.scalerId !== context.uid && !context.isAdmin)) {
      throw new HttpsError("permission-denied", "The tracking session is unavailable.");
    }
    return {
      sessionId,
      status: String(session.status || "unknown"),
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      syncStatus: session.syncStatus,
      lastUploadedSequence: Number(session.lastUploadedSequence || 0),
    };
  },
);

exports.uploadTrackingChunk = trackingCallable("uploadTrackingChunk", async (request) => {
  const context = await requireVerifiedUser(
    request,
    "Sign in before syncing GPS evidence.",
  );
  assertTrackingPayload(request.data, new Set([
    "sessionId", "chunkId", "startSequence", "endSequence", "points",
  ]), TRACKING_LIMITS.maxUploadPayloadBytes);
  const sessionId = String(request.data?.sessionId || "").trim();
  const rawPoints = request.data?.points;
  if (!sessionId || !Array.isArray(rawPoints) || rawPoints.length < 1 ||
      rawPoints.length > TRACKING_LIMITS.maxPointsPerChunk) {
    throw new HttpsError("invalid-argument", "The GPS chunk is invalid.");
  }
  let rawDigest;
  try {
    rawDigest = digestRawPoints(rawPoints);
  } catch (_) {
    throw new HttpsError("invalid-argument", "One or more GPS points are malformed.");
  }
  const startSequence = rawPoints[0]?.sequence;
  const endSequence = rawPoints.at(-1)?.sequence;
  if (!Number.isSafeInteger(startSequence) || !Number.isSafeInteger(endSequence) ||
      Number(request.data?.startSequence) !== startSequence ||
      Number(request.data?.endSequence) !== endSequence) {
    throw new HttpsError("invalid-argument", "GPS chunk sequence does not match its points.");
  }
  const chunkId = canonicalChunkId(startSequence, endSequence);
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  const chunkRef = sessionRef.collection("chunks").doc(chunkId);
  let duplicate = false;
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const existing = await transaction.get(chunkRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (existing.exists) {
      const existingData = existing.data() || {};
      if (existingData.payloadDigest === rawDigest &&
          existingData.startSequence === startSequence &&
          existingData.endSequence === endSequence) {
        duplicate = true;
        return;
      }
      throw new HttpsError("already-exists", "Conflicting GPS evidence already exists.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This tracking session is closed.");
    }
    const nowMs = Date.now();
    const startedAtMs = trackingTimestampMs(session.startedAt, nowMs);
    if (nowMs - startedAtMs > TRACKING_LIMITS.maxSessionDurationMs) {
      throw new HttpsError("resource-exhausted", "This tracking session exceeded its duration limit.");
    }
    if (startSequence !== Number(session.nextExpectedSequence || 1)) {
      throw new HttpsError("failed-precondition", "GPS evidence is missing or overlaps existing data.");
    }
    if (Number(session.chunkCount || 0) >= TRACKING_LIMITS.maxChunksPerSession ||
        Number(session.pointCount || 0) + rawPoints.length >
          TRACKING_LIMITS.maxPointsPerSession) {
      throw new HttpsError("resource-exhausted", "This tracking session reached its evidence limit.");
    }
    let normalized;
    try {
      normalized = normalizeChunk(rawPoints, {
        sessionId,
        campaignId: session.campaignId,
        zoneId: session.zoneId,
        scalerId: context.uid,
        nowMs,
        startedAtMs,
        previousPoint: session.lastEvidencePoint || null,
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "One or more GPS points are malformed.");
    }
    const points = normalized.points.map(firestoreTrackingPoint);
    const acceptedCount = points.filter((point) => point.accepted).length;
    transaction.create(chunkRef, {
      sessionId,
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      segmentId: String(session.currentSegmentId || trackingSegmentId(1)),
      chunkId,
      payloadDigest: rawDigest,
      startSequence,
      endSequence,
      pointCount: points.length,
      acceptedCount,
      points,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(sessionRef, {
      uploadedPointCount: FieldValue.increment(points.length),
      pointCount: FieldValue.increment(points.length),
      chunkCount: FieldValue.increment(1),
      acceptedPointCount: FieldValue.increment(acceptedCount),
      rejectedPointCount: FieldValue.increment(points.length - acceptedCount),
      lastUploadedSequence: endSequence,
      nextExpectedSequence: endSequence + 1,
      lastEvidencePoint: normalized.lastPoint,
      lastSyncAt: FieldValue.serverTimestamp(),
      syncStatus: "syncing",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {duplicate, endSequence};
});

exports.completeTrackingSession = trackingCallable("completeTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["sessionId"]), 4096);
  const context = await requireVerifiedUser(
    request,
    "Sign in before completing GPS tracking.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  let session;
  let alreadyCompleted = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    session = snapshot.data();
    if (!snapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (session.status === "completed") { alreadyCompleted = true; return; }
    if (session.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This tracking session was cancelled.");
    }
    if (!["active", "finalizing"].includes(String(session.status))) {
      throw new HttpsError("failed-precondition", "This tracking session cannot be completed.");
    }
    if (session.status === "active") {
      transaction.update(sessionRef, {
        status: "finalizing",
        syncStatus: "finalizing",
        finalizingAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  if (alreadyCompleted) {
    return {routeId: session.routeId || sessionId, status: "completed"};
  }
  const chunks = await sessionRef.collection("chunks").orderBy("startSequence").get();
  if (chunks.size !== Number(session.chunkCount || 0) ||
      chunks.size > TRACKING_LIMITS.maxChunksPerSession) {
    logger.error("Tracking chunk count integrity failure", {sessionId});
    throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
  }
  const evidencePoints = [];
  let expectedSequence = 1;
  const digestParts = [];
  for (const chunk of chunks.docs) {
    const data = chunk.data() || {};
    const points = Array.isArray(data.points) ? data.points : [];
    if (data.startSequence !== expectedSequence ||
        data.endSequence !== expectedSequence + points.length - 1 ||
        data.pointCount !== points.length ||
        chunk.id !== canonicalChunkId(data.startSequence, data.endSequence)) {
      logger.error("Tracking sequence integrity failure", {sessionId, chunkId: chunk.id});
      throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
    }
    for (const point of points) {
      if (Number(point.sequence) !== expectedSequence) {
        logger.error("Duplicate or missing GPS sequence", {sessionId, expectedSequence});
        throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
      }
      evidencePoints.push(point);
      expectedSequence += 1;
    }
    digestParts.push(`${data.startSequence}:${data.endSequence}:${data.payloadDigest}`);
  }
  if (evidencePoints.length !== Number(session.pointCount || 0) ||
      evidencePoints.length > TRACKING_LIMITS.maxPointsPerSession) {
    logger.error("Tracking point count integrity failure", {sessionId});
    throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
  }
  const accepted = evidencePoints.filter((point) => point.accepted === true);
  if (accepted.length < 2) {
    throw new HttpsError("failed-precondition", "Record at least two usable GPS points.");
  }
  const compatible = compatibilityRoutePoints(accepted).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    timestampMs: point.timestampMs,
    horizontalAccuracy: point.horizontalAccuracy,
    speed: point.speed,
    heading: point.heading,
    sequence: point.sequence,
  }));
  const routeRef = db.collection("campaignRoutes").doc(sessionId);
  const zoneRef = db.collection("campaignZones").doc(session.zoneId);
  const participantRef = session.participantId ?
    db.collection("zoneScalerParticipations").doc(String(session.participantId)) : null;
  const pointerRef = db.collection("activeTrackingSessions").doc(context.uid);
  const evidenceDigest = crypto.createHash("sha256")
    .update(digestParts.join("|"), "utf8").digest("hex");
  await db.runTransaction(async (transaction) => {
    const freshSession = await transaction.get(sessionRef);
    const freshRoute = await transaction.get(routeRef);
    const freshZone = await transaction.get(zoneRef);
    const freshPointer = await transaction.get(pointerRef);
    const current = freshSession.data() || {};
    if (current.status === "completed") return;
    if (current.status !== "finalizing") {
      throw new HttpsError("failed-precondition", "This tracking session changed state.");
    }
    if (!freshZone.exists) throw new HttpsError("not-found", "The assigned zone is unavailable.");
    if (freshRoute.exists &&
        (freshRoute.data()?.trackingSessionId !== sessionId ||
         freshRoute.data()?.evidenceDigest !== evidenceDigest)) {
      logger.error("Campaign route finalization conflict", {sessionId, routeId: routeRef.id});
      throw new HttpsError("failed-precondition", "GPS evidence failed an integrity check.");
    }
    if (!freshRoute.exists) transaction.create(routeRef, {
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      trackingSessionId: sessionId,
      trackingSegmentCount: Number(session.segmentCount || 1),
      tracking: false,
      simulated: false,
      startedAt: session.startedAt || FieldValue.serverTimestamp(),
      endedAt: FieldValue.serverTimestamp(),
      points: compatible,
      pointCount: compatible.length,
      fullEvidencePointCount: evidencePoints.length,
      rejectedPointCount: evidencePoints.length - accepted.length,
      evidenceStorage: "trackingSessions/chunks",
      routeSource: "native_background_v1",
      schemaVersion: 2,
      evidenceDigest,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const currentSegmentId = String(current.currentSegmentId || "");
    if (currentSegmentId) transaction.set(sessionRef.collection("segments").doc(currentSegmentId), {
      status: "completed", endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    transaction.update(sessionRef, {
      status: "completed",
      syncStatus: "synced",
      routeId: routeRef.id,
      endedAt: FieldValue.serverTimestamp(),
      finalPointCount: evidencePoints.length,
      finalAcceptedPointCount: accepted.length,
      currentSegmentId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(zoneRef, session.participantId ? {
      groupEvidenceUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    } : {
      routeId: routeRef.id, activeTrackingSessionId: FieldValue.delete(), gpsTracking: false,
      gpsRoutePointCount: compatible.length, trackingSegmentCount: Number(current.segmentCount || 1),
      gpsRouteSimulated: false, gpsTrackingEndedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (participantRef) transaction.update(participantRef, {
      status: "completed", attendanceStatus: "completed", routeId: routeRef.id,
      activeTrackingSessionId: FieldValue.delete(), gpsTracking: false,
      evidencePointCount: compatible.length, trackingSegmentCount: Number(current.segmentCount || 1),
      completedTrackingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (freshPointer.exists && freshPointer.data()?.sessionId === sessionId) {
      transaction.delete(pointerRef);
    }
  });
  return {routeId: routeRef.id, status: "completed", pointCount: compatible.length};
});

exports.cancelTrackingSession = trackingCallable("cancelTrackingSession", async (request) => {
  assertTrackingPayload(request.data, new Set(["sessionId", "reason"]), 8192);
  const context = await authenticatedUserContext(
    request,
    "Sign in before stopping GPS tracking.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  const reason = String(request.data?.reason || "cancelled").slice(0, 120);
  if (!sessionId) throw new HttpsError("invalid-argument", "Session is required.");
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  let resultStatus = "cancelled";
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session ||
        (session.scalerId !== context.uid && !context.isAdmin)) {
      throw new HttpsError("permission-denied", "This tracking session is not yours.");
    }
    if (session.status === "completed" || session.status === "cancelled") {
      resultStatus = session.status;
      return;
    }
    if (session.status === "finalizing") {
      throw new HttpsError("failed-precondition", "Completion is already finalizing.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This session cannot be cancelled.");
    }
    const pointerRef = db.collection("activeTrackingSessions").doc(session.scalerId);
    const zoneRef = db.collection("campaignZones").doc(session.zoneId);
    const participantRef = session.participantId ?
      db.collection("zoneScalerParticipations").doc(String(session.participantId)) : null;
    const pointer = await transaction.get(pointerRef);
    const zone = await transaction.get(zoneRef);
    transaction.update(sessionRef, {
      status: "cancelled",
      syncStatus: "closed",
      stopReason: reason,
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (zone.exists) transaction.update(zoneRef, session.participantId ? {
      updatedAt: FieldValue.serverTimestamp(),
    } : {status: "accepted", activeTrackingSessionId: FieldValue.delete(), gpsTracking: false,
      gpsTrackingEndedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    if (participantRef) transaction.update(participantRef, {status: "accepted", attendanceStatus: "accepted",
      activeTrackingSessionId: FieldValue.delete(), gpsTracking: false,
      gpsTrackingEndedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    if (pointer.exists && pointer.data()?.sessionId === sessionId) {
      transaction.delete(pointerRef);
    }
  });
  return {status: resultStatus};
});

exports.registerTrackingCheckpoint = trackingCallable(
  "registerTrackingCheckpoint", async (request) => {
  assertTrackingPayload(request.data, new Set([
    "sessionId", "storagePath", "location",
  ]), TRACKING_LIMITS.maxCheckpointPayloadBytes);
  const context = await requireVerifiedUser(
    request,
    "Sign in before adding a checkpoint.",
  );
  const sessionId = String(request.data?.sessionId || "").trim();
  const storagePath = String(request.data?.storagePath || "").trim();
  const expectedPrefix = `tracking_checkpoints/${context.uid}/${sessionId}/`;
  if (!sessionId || !storagePath.startsWith(expectedPrefix) ||
      storagePath.length <= expectedPrefix.length || storagePath.includes("..")) {
    throw new HttpsError("invalid-argument", "Checkpoint photo is required.");
  }
  let photoMetadata;
  try {
    [photoMetadata] = await getStorage().bucket().file(storagePath).getMetadata();
  } catch (error) {
    logger.warn("Checkpoint object lookup failed", {sessionId, storagePath, error: String(error)});
    throw new HttpsError("failed-precondition", "The checkpoint photo is unavailable.");
  }
  const contentType = String(photoMetadata.contentType || "").toLowerCase();
  const photoSize = Number(photoMetadata.size || 0);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(contentType) ||
      !Number.isFinite(photoSize) || photoSize < 1 ||
      photoSize > TRACKING_LIMITS.maxPhotoBytes) {
    throw new HttpsError("invalid-argument", "The checkpoint photo is not an allowed image.");
  }
  const sessionRef = db.collection("trackingSessions").doc(sessionId);
  const checkpointRef = sessionRef.collection("checkpoints").doc();
  await db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || !session || session.scalerId !== context.uid) {
      throw new HttpsError("permission-denied", "This active tracking session is not yours.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "This tracking session is closed.");
    }
    if (Number(session.checkpointCount || 0) >=
        TRACKING_LIMITS.maxCheckpointsPerSession) {
      throw new HttpsError("resource-exhausted", "This session reached its checkpoint limit.");
    }
    const nowMs = Date.now();
    const startedAtMs = trackingTimestampMs(session.startedAt, nowMs);
    let point;
    try {
      point = normalizePoint(request.data?.location, {
        sessionId,
        campaignId: session.campaignId,
        zoneId: session.zoneId,
        scalerId: context.uid,
        nowMs,
        startedAtMs,
        previousPoint: session.lastEvidencePoint || null,
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "Checkpoint location is invalid.");
    }
    const receiptDeltaMs = Math.abs(nowMs - point.timestampMs);
    const checkpointFlags = [...point.flags];
    if (receiptDeltaMs > 10 * 60 * 1000) checkpointFlags.push("stale_checkpoint_time");
    transaction.create(checkpointRef, {
      sessionId,
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      scalerId: context.uid,
      storagePath,
      storageGeneration: String(photoMetadata.generation || ""),
      contentType,
      size: photoSize,
      location: firestoreTrackingPoint({...point, flags: checkpointFlags}),
      measurementTimestampMs: point.timestampMs,
      receivedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(sessionRef, {
      checkpointCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const eventRef = db.collection("jobEvents").doc();
    transaction.create(eventRef, {
      type: "checkpoint.completed",
      campaignId: session.campaignId,
      zoneId: session.zoneId,
      businessId: session.businessId || null,
      scalerId: context.uid,
      actorId: context.uid,
      actorRole: "scaler",
      checkpointId: checkpointRef.id,
      trusted: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return {checkpointId: checkpointRef.id};
});

exports._trackingTest = {
  trackingLimits: TRACKING_LIMITS,
  normalizeChunk,
  normalizePoint,
  compatibilityRoutePoints,
  canonicalChunkId,
};

// ---------------------------------------------------------------------------
// Stripe marketplace (sandbox-ready, server-authoritative)
// ---------------------------------------------------------------------------

const MARKETPLACE_FUNCTION_OPTIONS = {
  enforceAppCheck: false,
  maxInstances: 10,
  concurrency: 20,
  timeoutSeconds: 60,
  memory: "256MiB",
  secrets: [STRIPE_SECRET_KEY],
};

const CAMPAIGN_QUOTE_FUNCTION_OPTIONS = {
  enforceAppCheck: false,
  maxInstances: 20,
  concurrency: 40,
  timeoutSeconds: 30,
  memory: "256MiB",
};

function safeCampaignQuoteCallable(name, handler) {
  return onCall(CAMPAIGN_QUOTE_FUNCTION_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${name} failed.`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "The campaign quote could not be prepared.");
    }
  });
}

function safeStripeCallable(name, handler) {
  return onCall(MARKETPLACE_FUNCTION_OPTIONS, async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${name} failed.`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "The financial operation could not be completed.");
    }
  });
}

async function requireFinancialRole(request, role, message) {
  const context = await requireVerifiedUser(request, message);
  if (!context.isAdmin && context.role !== role) {
    throw new HttpsError("permission-denied", `Only a ${role} can perform this operation.`);
  }
  return context;
}

function firestoreFinancialOperationStore() {
  return {
    async claim(input) {
      const ref = db.collection("financialOperations").doc(input.operationId);
      let result;
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.data() || {};
        if (current.inputDigest && current.inputDigest !== input.inputDigest) {
          result = {status: "conflict", execute: false}; return;
        }
        if (current.status === "succeeded") {
          result = {status: "succeeded", execute: false, result: current.result}; return;
        }
        if (current.status === "processing") {
          result = {status: "processing", execute: false}; return;
        }
        transaction.set(ref, {...input, status: "processing",
          attempt: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
          createdAt: snapshot.exists ? current.createdAt : FieldValue.serverTimestamp()}, {merge: true});
        result = {status: "processing", execute: true};
      });
      return result;
    },
    async get(operationId) {
      const snapshot = await db.collection("financialOperations").doc(operationId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    succeed(operationId, result) {
      return db.collection("financialOperations").doc(operationId).set({status: "succeeded", result,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    },
    fail(operationId, failure) {
      return db.collection("financialOperations").doc(operationId).set({
        status: failure.retryable ? "failed_retryable" : "failed_terminal",
        lastErrorCode: failure.code, updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  };
}

function campaignCheckoutOperationStore({campaignRef, paymentRef, businessId,
  fundingVersion, operationId, quote}) {
  const operationRef = db.collection("financialOperations").doc(operationId);
  return {
    async claim(input) {
      let result;
      await db.runTransaction(async (transaction) => {
        const [campaignSnapshot, paymentSnapshot, operationSnapshot] = await Promise.all([
          transaction.get(campaignRef),
          transaction.get(paymentRef),
          transaction.get(operationRef),
        ]);
        const campaign = campaignSnapshot.exists ?
          {...(campaignSnapshot.data() || {}), id: campaignSnapshot.id} : null;
        const payment = paymentSnapshot.exists ? paymentSnapshot.data() || {} : null;
        const current = operationSnapshot.data() || {};
        const eligibility = evaluateFundingCheckout({
          campaign, payment, businessId, expectedFundingVersion: fundingVersion,
        });
        if (eligibility.decision === "reject") {
          const code = eligibility.code === "campaign_not_owned" ?
            "permission-denied" : "failed-precondition";
          throw new HttpsError(code, "This campaign is not eligible for funding Checkout.");
        }
        const currentQuote = marketplace.quoteCampaignFunding(
          marketplace.campaignWorkerAmountCents(campaign),
        );
        if (currentQuote.workerAmountCents !== quote.workerAmountCents ||
            currentQuote.platformFeeRateBasisPoints !== quote.platformFeeRateBasisPoints ||
            currentQuote.platformFeeCents !== quote.platformFeeCents ||
            currentQuote.businessChargeCents !== quote.businessChargeCents ||
            currentQuote.currency !== quote.currency) {
          throw new HttpsError("failed-precondition", "Campaign pricing changed. Request a new quote.");
        }
        if (current.inputDigest && current.inputDigest !== input.inputDigest) {
          result = {status: "conflict", execute: false}; return;
        }
        if (eligibility.decision === "recover") {
          transaction.set(operationRef, {...input, status: "succeeded",
            result: eligibility.result, updatedAt: FieldValue.serverTimestamp(),
            createdAt: operationSnapshot.exists ? current.createdAt : FieldValue.serverTimestamp()},
          {merge: true});
          result = {status: "succeeded", execute: false, result: eligibility.result};
          return;
        }
        if (current.status === "succeeded") {
          result = {status: "succeeded", execute: false, result: current.result}; return;
        }
        if (current.status === "processing") {
          result = {status: "processing", execute: false}; return;
        }
        if (current.status === "failed_terminal") {
          throw new HttpsError("failed-precondition", "The funding attempt cannot be retried.");
        }
        transaction.set(operationRef, {...input, status: "processing",
          attempt: Number(current.attempt || 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: operationSnapshot.exists ? current.createdAt : FieldValue.serverTimestamp()},
        {merge: true});
        transaction.set(paymentRef, {
          id: paymentRef.id,
          businessId,
          campaignId: campaignRef.id,
          fundingVersion,
          ...quote,
          status: marketplace.PAYMENT_STATES.pending,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: paymentSnapshot.exists ?
            payment.createdAt : FieldValue.serverTimestamp(),
        }, {merge: true});
        transaction.set(campaignRef, {
          fundingStatus: "payment_pending",
          fundingCheckoutOperationId: operationId,
          fundingCheckoutVersion: fundingVersion,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        result = {status: "processing", execute: true};
      });
      return result;
    },
    async get() {
      const snapshot = await operationRef.get();
      return snapshot.exists ? snapshot.data() : null;
    },
    succeed(_operationId, result) {
      return operationRef.set({status: "succeeded", result,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    },
    fail(_operationId, failure) {
      return operationRef.set({
        status: failure.retryable ? "failed_retryable" : "failed_terminal",
        lastErrorCode: failure.code, updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  };
}

async function marketplaceCustomer(stripe, context) {
  const customerRef = db.collection("stripeCustomers").doc(context.uid);
  const current = await customerRef.get();
  if (current.exists && current.data()?.stripeCustomerId) {
    return current.data().stripeCustomerId;
  }
  const operationId = marketplace.operationId("customer", context.uid);
  const result = await runFinancialOperation({
    store: firestoreFinancialOperationStore(), operationId, kind: "customer_creation",
    trustedInput: {businessId: context.uid},
    reconcile: async () => {
      const snapshot = await customerRef.get();
      return snapshot.data()?.stripeCustomerId ? {stripeCustomerId: snapshot.data().stripeCustomerId} : null;
    },
    execute: async () => {
      const user = await getAuth().getUser(context.uid);
      const customer = await stripe.customers.create({email: user.email || undefined,
        name: user.displayName || undefined, metadata: {firebaseUid: context.uid}},
      {idempotencyKey: marketplace.stripeIdempotencyKey("customer", context.uid)});
      await customerRef.set({businessId: context.uid, stripeCustomerId: customer.id,
        mode: customer.livemode ? "live" : "test", updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()}, {merge: true});
      return {stripeCustomerId: customer.id};
    },
  });
  return result.stripeCustomerId;
}

exports.getMarketplacePolicy = safeStripeCallable("getMarketplacePolicy", async (request) => {
  await requireVerifiedUser(request, "Sign in to view marketplace pricing.");
  return {
    currency: marketplace.CURRENCY,
    platformFeeBasisPoints: marketplace.PLATFORM_FEE_BASIS_POINTS,
    platformFeeLabel: "ScaledCircle Platform Fee",
    reviewWindowHours: marketplace.REVIEW_WINDOW_HOURS,
    promotionalCreditsAreCash: false,
  };
});

exports.quoteCampaignFunding = safeCampaignQuoteCallable("quoteCampaignFunding", async (request) => {
  await requireFinancialRole(
    request, "business", "Sign in as a Business to request campaign pricing.",
  );
  const workerAmountCents = Number(request.data?.workerAmountCents);
  try {
    return {...campaignFundingQuote.quoteCampaignFunding(workerAmountCents), quoteVersion: 1};
  } catch (_) {
    throw new HttpsError("invalid-argument", "The worker amount is invalid.");
  }
});

// Purchased wallet credits are intentionally retired for marketplace money.
// Historical promotional balances remain readable but cannot fund Scaler pay.
exports.createCreditCheckoutSession = safeStripeCallable(
  "createCreditCheckoutSession",
  async (request) => {
    await requireFinancialRole(
      request, "business", "Sign in as a Business to view funding options.",
    );
    throw new HttpsError(
      "failed-precondition",
      "Purchased credits are retired. Fund campaigns directly through secure checkout.",
    );
  },
);

exports.publishFundedCampaign = safeStripeCallable(
  "publishFundedCampaign",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to launch a campaign.",
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const zonesQuery = db.collection("campaignZones").where("campaignId", "==", campaignId);
    await db.runTransaction(async (transaction) => {
      const campaignSnapshot = await transaction.get(campaignRef);
      if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
      const campaign = campaignSnapshot.data() || {};
      if (!context.isAdmin && campaign.businessId !== context.uid) {
        throw new HttpsError("permission-denied", "You do not own this campaign.");
      }
      assertProductionScalerCount(
        multiScalerRollout.campaignScalerCount(campaign),
      );
      if (campaign.status === "open") return;
      if (campaign.status !== "draft" || campaign.fundingStatus !== "funded" ||
          !cleanId(campaign.fundingPaymentId)) {
        throw new HttpsError(
          "failed-precondition", "Backend-confirmed campaign funding is required before launch.",
        );
      }
      transaction.update(campaignRef, {
        status: "open",
        publishedAt: FieldValue.serverTimestamp(),
        zonesLockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const zones = await zonesQuery.get();
    const batch = db.batch();
    for (const zone of zones.docs) {
      batch.update(zone.ref, {
        mapLocked: true,
        mapLockedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return {campaignId, status: "open", zonesLocked: zones.size};
  },
);

exports.createScalerConnectedAccount = safeStripeCallable(
  "createScalerConnectedAccount",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to set up payouts.",
    );
    const accountRef = db.collection("stripeConnectedAccounts").doc(context.uid);
    const existing = await accountRef.get();
    if (existing.exists && existing.data()?.stripeAccountId) {
      return {...existing.data(), created: false};
    }
    const stripe = stripeClient();
    const operationId = marketplace.operationId("account-v2", context.uid);
    const result = await runFinancialOperation({
      store: firestoreFinancialOperationStore(), operationId, kind: "connected_account_creation",
      trustedInput: {authenticatedScalerId: context.uid},
      reconcile: async () => {
        const current = await accountRef.get();
        return current.data()?.stripeAccountId ? {account: current.data()} : null;
      },
      execute: async () => {
        const authUser = await getAuth().getUser(context.uid);
        if (!authUser.email) {
          throw new HttpsError("failed-precondition", "A verified email is required.");
        }
        const account = await stripe.v2.core.accounts.create({contact_email: authUser.email,
          display_name: authUser.displayName || "ScaledCircle Scaler", dashboard: "express",
          configuration: {recipient: {capabilities: {stripe_balance: {
            stripe_transfers: {requested: true}}}}},
          include: ["configuration.recipient", "identity", "requirements"]},
        {idempotencyKey: marketplace.stripeIdempotencyKey("account-v2", context.uid)});
        const sanitized = marketplace.sanitizedConnectedAccount(account);
        await accountRef.set({scalerId: context.uid, ...sanitized,
          mode: account.livemode ? "live" : "test", createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return {account: sanitized};
      },
    });
    return {...result.account, created: result.recovered !== true};
  },
);

async function retrieveScalerAccount(stripe, scalerId) {
  const ref = db.collection("stripeConnectedAccounts").doc(scalerId);
  const snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data()?.stripeAccountId) {
    throw new HttpsError("failed-precondition", "Create a Stripe payout account first.");
  }
  const account = await stripe.v2.core.accounts.retrieve(
    snapshot.data().stripeAccountId,
    {include: ["configuration.recipient", "identity", "requirements"]},
  );
  const sanitized = marketplace.sanitizedConnectedAccount(account);
  await ref.set({...sanitized, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return sanitized;
}

exports.refreshScalerConnectedAccountStatus = safeStripeCallable(
  "refreshScalerConnectedAccountStatus",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to refresh payout status.",
    );
    return retrieveScalerAccount(stripeClient(), context.uid);
  },
);

exports.createScalerOnboardingLink = safeStripeCallable(
  "createScalerOnboardingLink",
  async (request) => {
    const context = await requireFinancialRole(
      request, "scaler", "Sign in as a Scaler to continue onboarding.",
    );
    const returnUrl = `${publicAppBaseUrl()}/?connect=return`;
    const refreshUrl = `${publicAppBaseUrl()}/?connect=refresh`;
    const stripe = stripeClient();
    const stored = await db.collection("stripeConnectedAccounts").doc(context.uid).get();
    if (!stored.exists || !stored.data()?.stripeAccountId) {
      throw new HttpsError("failed-precondition", "Create a Stripe payout account first.");
    }
    const link = await stripe.v2.core.accountLinks.create({
      account: stored.data().stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    }, {idempotencyKey: marketplace.stripeIdempotencyKey(
      "account-link", context.uid, Math.floor(Date.now() / (10 * 60 * 1000)),
    )});
    return {url: link.url, expiresAt: link.expires_at || null};
  },
);

exports.createCampaignFundingCheckoutSession = safeStripeCallable(
  "createCampaignFundingCheckoutSession",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to fund a campaign.",
    );
    // Consent is checked before customer/session/payment-record creation. A
    // missing agreement therefore cannot create any Stripe object or funding
    // authority as a side effect.
    await requireCurrentLegalConsents(
      context.uid,
      legalConsent.ROLE_REQUIREMENTS.business_funding,
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
    const campaign = campaignSnapshot.data() || {};
    if (campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "You do not own this campaign.");
    }
    const zoneSnapshots = await db.collection("campaignZones")
      .where("campaignId", "==", campaignId).get();
    const zoneReadiness = zoneSnapshots.docs.map((doc) =>
      smartZonePlanning.paymentReadiness(doc.data() || {}));
    if (!zoneReadiness.length || zoneReadiness.some((item) => !item.ready)) {
      throw new HttpsError(
        "failed-precondition",
        "Analyze and adjust every campaign Zone before funding.",
        {reason: "ZONE_NOT_PUBLISHABLE",
          blockers: zoneReadiness.filter((item) => !item.ready).map((item) => item.reason)},
      );
    }
    assertProductionScalerCount(
      multiScalerRollout.campaignScalerCount(campaign),
    );
    let fundingVersion;
    try {
      fundingVersion = nextFundingVersion(campaign);
    } catch (_) {
      throw new HttpsError("failed-precondition", "Campaign funding version is invalid.");
    }
    const quote = marketplace.quoteCampaignFunding(
      marketplace.campaignWorkerAmountCents(campaign),
    );
    const paymentId = marketplace.operationId(
      "campaign-payment", campaignId, fundingVersion,
    );
    const paymentRef = db.collection("campaignPayments").doc(paymentId);
    const stripe = stripeClient();
    const operationId = marketplace.operationId("campaign-checkout", campaignId, fundingVersion);
    const result = await runFinancialOperation({
      store: campaignCheckoutOperationStore({campaignRef, paymentRef,
        businessId: context.uid, fundingVersion, operationId, quote}),
      operationId, kind: "campaign_checkout_creation",
      trustedInput: {campaignId, businessId: context.uid, fundingVersion,
        businessChargeCents: quote.businessChargeCents},
      reconcile: async () => {
        const current = await paymentRef.get();
        const data = current.data() || {};
        return data.stripeCheckoutSessionId && data.stripeCheckoutUrl ? {
          sessionId: data.stripeCheckoutSessionId, url: data.stripeCheckoutUrl,
        } : null;
      },
      execute: async () => {
        const customer = await marketplaceCustomer(stripe, context);
        await paymentRef.set({id: paymentId, businessId: context.uid, campaignId, fundingVersion,
          stripeCustomerId: customer, ...quote, status: marketplace.PAYMENT_STATES.pending,
          transferredWorkerAmountCents: 0, reservedWorkerAmountCents: 0,
          refundedWorkerAmountCents: 0, refundedPlatformFeeCents: 0, refundedTotalCents: 0,
          disputedAmountCents: 0, platformFeePendingCents: quote.platformFeeCents,
          platformFeeRecognizedCents: 0, platformFeeRefundedCents: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()},
        {merge: false});
        const session = await stripe.checkout.sessions.create({mode: "payment", customer,
          client_reference_id: paymentId,
          line_items: [{quantity: 1, price_data: {currency: quote.currency,
            unit_amount: quote.businessChargeCents,
            product_data: {name: `ScaledCircle campaign funding: ${readText(campaign.name, 80) || campaignId}`}}}],
          payment_intent_data: {transfer_group: `campaign_${campaignId}`,
            metadata: {paymentId, campaignId, businessId: context.uid}},
          success_url: `${publicAppBaseUrl()}/?campaignFunding=return`,
          cancel_url: `${publicAppBaseUrl()}/?campaignFunding=cancelled`,
          metadata: {paymentId, campaignId, businessId: context.uid,
            purchaseType: "campaign_funding_v2"}},
        {idempotencyKey: marketplace.stripeIdempotencyKey("campaign-checkout", paymentId)});
        await paymentRef.update({stripeCheckoutSessionId: session.id,
          stripeCheckoutUrl: session.url, updatedAt: FieldValue.serverTimestamp()});
        return {sessionId: session.id, url: session.url};
      },
    });
    return {paymentId, ...result, quote};
  },
);

async function claimStripeEvent(event) {
  const ref = db.collection("stripeEvents").doc(event.id);
  let claimed = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.data()?.status;
    if (state === "processed" || state === "failed_terminal") return;
    // A failed delivery is deliberately claimable again. Stripe retries use
    // the same event ID, while the durable event record prevents duplicate
    // dependent operations. A currently processing delivery is left alone.
    if (state === "processing") {
      const updatedAt = snapshot.data()?.updatedAt;
      const leaseAgeMs = updatedAt instanceof Timestamp ?
        Date.now() - updatedAt.toMillis() : 0;
      if (leaseAgeMs < 5 * 60 * 1000) return;
    }
    transaction.set(ref, {
      stripeEventId: event.id,
      type: event.type,
      livemode: event.livemode === true,
      status: "processing",
      attempts: FieldValue.increment(1),
      receivedAt: snapshot.exists ? snapshot.data().receivedAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    claimed = true;
  });
  return {ref, claimed};
}

async function processCampaignCheckout(stripe, event) {
  const hinted = event.data.object || {};
  const session = await stripe.checkout.sessions.retrieve(hinted.id);
  const paymentRef = db.collection("campaignPayments").doc(session.client_reference_id || "missing");
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) throw new Error("campaign_payment_record_missing");
  const record = {id: paymentSnapshot.id, ...paymentSnapshot.data()};
  marketplace.validatePaymentAgainstRecord(session, record);
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(paymentRef);
    const current = fresh.data() || {};
    if (current.status === marketplace.PAYMENT_STATES.funded) return;
    if (current.status !== marketplace.PAYMENT_STATES.pending) {
      throw new Error("invalid_campaign_payment_transition");
    }
    transaction.update(paymentRef, {
      status: marketplace.PAYMENT_STATES.funded,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      fundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.collection("campaigns").doc(current.campaignId), {
      fundingStatus: "funded",
      fundingPaymentId: paymentRef.id,
      fundingVersion: current.fundingVersion,
      workerAmountCents: current.workerAmountCents,
      platformFeeCents: current.platformFeeCents,
      businessChargeCents: current.businessChargeCents,
      fundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function stripeAccountIdFromSnapshotEvent(event) {
  return cleanId(
    event.data?.object?.account || event.account,
  );
}

async function reconcileScalerAccountFromStripe(stripe, stripeAccountId, extra = {}) {
  if (!stripeAccountId) throw new Error("stripe_account_reference_missing");
  const matches = await db.collection("stripeConnectedAccounts")
    .where("stripeAccountId", "==", stripeAccountId).limit(1).get();
  if (matches.empty) {
    logger.warn("Ignored Stripe account event without a ScaledCircle owner.", {stripeAccountId});
    return null;
  }
  // Accounts v2 webhook payloads are thin. Always fetch current state before
  // writing sanitized capability/requirements fields.
  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.recipient", "identity", "requirements"],
  });
  const sanitized = marketplace.sanitizedConnectedAccount(account);
  const ref = matches.docs[0].ref;
  await ref.set({...sanitized, ...extra, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  if (sanitized.transfersStatus === "active") {
    const waiting = await db.collection("scalerTransfers")
      .where("scalerId", "==", matches.docs[0].id)
      .where("status", "==", "waiting_for_account").limit(100).get();
    const batch = db.batch();
    for (const snapshot of waiting.docs) {
      batch.update(snapshot.ref, {status: marketplace.TRANSFER_STATES.pending,
        updatedAt: FieldValue.serverTimestamp()});
    }
    if (!waiting.empty) await batch.commit();
  }
  return sanitized;
}

async function processStripeEvent(stripe, event) {
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const session = event.data.object;
    if (session.metadata?.purchaseType === "campaign_funding_v2") {
      await processCampaignCheckout(stripe, event);
    } else if (session.metadata?.purchaseType === "credits") {
      logger.warn("Ignored retired purchased-credit Checkout completion.", {eventId: event.id});
    }
  } else if (event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed") {
    let resource = event.data.object || {};
    if (event.type === "payment_intent.payment_failed" && resource.id) {
      resource = await stripe.paymentIntents.retrieve(resource.id);
    } else if (resource.id) {
      resource = await stripe.checkout.sessions.retrieve(resource.id);
    }
    const paymentId = cleanId(resource.metadata?.paymentId || resource.client_reference_id);
    if (paymentId) {
      const paymentRef = db.collection("campaignPayments").doc(paymentId);
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(paymentRef);
        if (!current.exists || current.data()?.status !== marketplace.PAYMENT_STATES.pending) return;
        transaction.update(paymentRef, {status: marketplace.PAYMENT_STATES.failed,
          updatedAt: FieldValue.serverTimestamp()});
      });
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const current = await stripe.subscriptions.retrieve(event.data.object.id);
    await syncStripeSubscription(current, `${event.id}_subscription`);
  } else if (event.type.startsWith("charge.dispute.")) {
    const dispute = await stripe.disputes.retrieve(event.data.object.id);
    const paymentId = cleanId(dispute.metadata?.paymentId);
    if (paymentId) await db.collection("campaignPayments").doc(paymentId).set({
      status: marketplace.PAYMENT_STATES.disputed,
      disputedAmountCents: Number(dispute.amount || 0),
      settlementFrozen: dispute.status !== "won",
      stripeDisputeId: dispute.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
    const refund = await stripe.refunds.retrieve(event.data.object.id);
    const paymentId = cleanId(refund.metadata?.paymentId);
    const refundOperationId = cleanId(refund.metadata?.refundOperationId);
    if (refundOperationId) {
      await db.collection("financialOperations").doc(refundOperationId).set({
        status: refund.status === "succeeded" ? "processed" :
          refund.status === "failed" || event.type === "refund.failed" ? "failed_terminal" : "processing",
        stripeRefundId: refund.id || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (paymentId && refund.status === "succeeded") {
      await db.collection("campaignPayments").doc(paymentId).set({
        lastStripeRefundId: refund.id || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  } else if (event.type === "transfer.created") {
    const transfer = event.data.object || {};
    const operationId = cleanId(transfer.metadata?.transferOperationId);
    if (operationId) await db.collection("scalerTransfers").doc(operationId).set({
      stripeTransferId: transfer.id || null,
      transferCreatedEventId: event.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else if (event.type === "transfer.reversed") {
    const transfer = await stripe.transfers.retrieve(event.data.object.id);
    const operationId = cleanId(transfer.metadata?.transferOperationId);
    if (operationId && transfer.reversed === true) {
      await db.collection("scalerTransfers").doc(operationId).set({
        status: marketplace.TRANSFER_STATES.reversed,
        reversedAmountCents: Number(transfer.amount_reversed || transfer.amount || 0),
        bankPayoutStatus: "not_observed",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  } else if (event.type === "payout.failed") {
    await reconcileScalerAccountFromStripe(stripe, stripeAccountIdFromSnapshotEvent(event), {
      bankPayoutStatus: "attention_required",
      payoutAttention: {
        code: "payout_failed",
        stripePayoutId: cleanId(event.data.object?.id),
        observedAt: FieldValue.serverTimestamp(),
      },
    });
  }
}

async function processStripeThinEvent(stripe, event) {
  // The signed thin payload identifies only the resource to retrieve. Current
  // Accounts v2 state, never payload capability fields, drives sanitized state.
  await reconcileScalerAccountFromStripe(stripe, stripeAccountIdFromThinEvent(event));
}

function stripeModeMatchesEnvironment(event) {
  const environment = String(process.env.SCALEDCIRCLE_ENV || "local").toLowerCase();
  // Snapshot Events include livemode. Thin Event Notifications may not; their
  // independently configured endpoint secret is the environment boundary.
  return typeof event.livemode !== "boolean" ||
    (environment === "production") === (event.livemode === true);
}

async function processClaimedStripeEvent(event, processor) {
  const {ref, claimed} = await claimStripeEvent(event);
  if (!claimed) return {received: true, duplicate: true};
  try {
    await processor(event);
    await ref.set({status: "processed", processedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {received: true};
  } catch (error) {
    await ref.set({
      status: error?.retryable === false ? "failed_terminal" : "failed_retryable",
      lastErrorCode: error?.code || "processing_failed",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    throw error;
  }
}

async function handleStripeWebhook(request, response, {secret, parseEvent, processEvent, label}) {
  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");
  let event;
  try {
    const stripe = stripeClient();
    event = parseEvent({
      stripe,
      rawBody: request.rawBody,
      signature: request.headers["stripe-signature"],
      secret: secret.value(),
    });
    if (!stripeModeMatchesEnvironment(event)) {
      logger.error("Stripe webhook mode did not match the configured environment.", {
        eventId: event.id, eventType: event.type, endpoint: label,
      });
      return response.status(400).send("Stripe webhook mode mismatch.");
    }
    const result = await processClaimedStripeEvent(event, (verified) => processEvent(stripe, verified));
    return response.status(200).json(result);
  } catch (error) {
    logger.error("Stripe webhook processing failed.", {
      eventId: event?.id || null,
      eventType: event?.type || null,
      endpoint: label,
      errorCode: error?.code || "webhook_processing_failed",
    });
    return response.status(event ? 500 : 400).send("Stripe webhook could not be processed.");
  }
}

// Canonical snapshot/v1 webhook. Accounts v2 thin events use stripeThinWebhook.
exports.stripeWebhook = onRequest(
  {
    maxInstances: 10,
    concurrency: 20,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: STRIPE_CHECKOUT_SECRETS.concat([STRIPE_WEBHOOK_SECRET]),
  },
  (request, response) => handleStripeWebhook(request, response, {
    secret: STRIPE_WEBHOOK_SECRET,
    parseEvent: parseSnapshotEvent,
    processEvent: processStripeEvent,
    label: "snapshot",
  }),
);

// Canonical Accounts v2 thin-event webhook with an independent signing secret.
exports.stripeThinWebhook = onRequest(
  {
    maxInstances: 10,
    concurrency: 20,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [STRIPE_SECRET_KEY, STRIPE_THIN_WEBHOOK_SECRET],
  },
  (request, response) => handleStripeWebhook(request, response, {
    secret: STRIPE_THIN_WEBHOOK_SECRET,
    parseEvent: parseThinEvent,
    processEvent: processStripeThinEvent,
    label: "accounts_v2_thin",
  }),
);

async function queueScalerTransfer(zoneId, releaseOptionalBonus = false) {
  if (!zoneId) throw new HttpsError("invalid-argument", "A zone is required.");
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  const zoneSnapshot = await zoneRef.get();
  if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
  const zone = zoneSnapshot.data() || {};
  if (zone.groupAssignmentId) {
    throw new HttpsError(
      "failed-precondition",
      "Group work must use the authoritative group settlement path.",
    );
  }
  if (zone.settlementBlocked === true || zone.status === "failed_business") {
    throw new HttpsError("failed-precondition", "This assignment is closed to normal settlement.");
  }
  const campaignRef = db.collection("campaigns").doc(zone.campaignId || "missing");
  const campaignSnapshot = await campaignRef.get();
  const campaign = campaignSnapshot.data() || {};
  const contractRef = db.collection("assignmentCompensations").doc(zoneId);
  const contractSnapshot = await contractRef.get();
  const paymentRef = db.collection("campaignPayments").doc(
    zone.fundingPaymentId || campaign.fundingPaymentId || "missing",
  );
  const paymentSnapshot = await paymentRef.get();
  const connectedRef = db.collection("stripeConnectedAccounts").doc(zone.assignedScalerId || "missing");
  const connectedSnapshot = await connectedRef.get();
  const routeRef = db.collection("campaignRoutes").doc(zone.routeId || "missing");
  const routeSnapshot = await routeRef.get();
  const completionRef = db.collection("campaignCompletions")
    .doc(zone.submittedCompletionId || "missing");
  const completionSnapshot = await completionRef.get();
  if (!campaignSnapshot.exists || !contractSnapshot.exists ||
      !paymentSnapshot.exists ||
      !routeSnapshot.exists || !completionSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Financial prerequisites are incomplete.");
  }
  const payment = paymentSnapshot.data() || {};
  const connected = connectedSnapshot.data() || {};
  const route = routeSnapshot.data() || {};
  const completion = completionSnapshot.data() || {};
  const completionBasisPoints = Math.round(Number(zone.completionPercentage || 0) * 100);
  const payout = marketplace.payoutForCompletion(
    contractSnapshot.data(), completionBasisPoints, releaseOptionalBonus,
  );
  if (payment.status !== marketplace.PAYMENT_STATES.funded || payment.settlementFrozen === true ||
      zone.verificationPassed !== true || !["approved", "auto_approved"].includes(zone.reviewStatus) ||
      zone.redoRequired === true ||
      route.scalerId !== zone.assignedScalerId || route.zoneId !== zoneId ||
      route.campaignId !== zone.campaignId || route.tracking === true ||
      completion.scalerId !== zone.assignedScalerId || completion.zoneId !== zoneId ||
      completion.campaignId !== zone.campaignId || completion.status !== "submitted" ||
      completion.compensationContractId !== contractRef.id) {
    throw new HttpsError("failed-precondition", "This work is not eligible for transfer.");
  }
  const transferId = marketplace.operationId("scaler-transfer", zoneId, 1);
  const transferRef = db.collection("scalerTransfers").doc(transferId);
  await db.runTransaction(async (transaction) => {
    const [existingTransfer, freshPayment] = await Promise.all([
      transaction.get(transferRef), transaction.get(paymentRef),
    ]);
    if (existingTransfer.exists) return;
    marketplace.assertAllocationAvailable(freshPayment.data() || {}, payout.transferAmountCents);
    const ready = connectedSnapshot.exists && connected.transfersStatus === "active" &&
      cleanId(connected.stripeAccountId);
    transaction.create(transferRef, {
    transferOperationId: transferId,
    paymentId: paymentSnapshot.id,
    campaignId: zone.campaignId,
    zoneId,
    businessId: zone.businessId,
    scalerId: zone.assignedScalerId,
    currency: marketplace.CURRENCY,
    amountCents: payout.transferAmountCents,
    baseAmountCents: payout.baseAmountCents,
    bonusAmountCents: payout.bonusAmountCents,
    earningsVersion: 1,
    status: ready ? marketplace.TRANSFER_STATES.pending : marketplace.TRANSFER_STATES.waitingForAccount,
    bankPayoutStatus: "not_observed",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(paymentRef, {
      reservedWorkerAmountCents: FieldValue.increment(payout.transferAmountCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {transferRef, transferId, transfer: (await transferRef.get()).data(),
    paymentRef, zoneRef, connected, payout};
}

async function executeQueuedScalerTransfer(transferId) {
  const transferRef = db.collection("scalerTransfers").doc(transferId);
  const initial = await transferRef.get();
  if (!initial.exists) throw new Error("transfer_operation_missing");
  const reserved = initial.data() || {};
  if (reserved.status === marketplace.TRANSFER_STATES.submitted) {
    return {transferOperationId: transferId, status: reserved.status, recovered: true};
  }
  if (reserved.status === marketplace.TRANSFER_STATES.waitingForAccount) {
    return {transferOperationId: transferId, status: reserved.status, recovered: true};
  }
  const connectedRef = db.collection("stripeConnectedAccounts").doc(reserved.scalerId || "missing");
  const connected = (await connectedRef.get()).data() || {};
  if (connected.transfersStatus !== "active" || !cleanId(connected.stripeAccountId)) {
    await transferRef.set({status: marketplace.TRANSFER_STATES.waitingForAccount,
      updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {transferOperationId: transferId, status: marketplace.TRANSFER_STATES.waitingForAccount};
  }
  let claimedExecutor = false;
  const executorLeaseStartedAtMillis = Date.now();
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(transferRef);
    const current = fresh.data() || {};
    const leaseIsFresh = current.executorClaimed === true &&
      Number.isSafeInteger(current.executorLeaseStartedAtMillis) &&
      executorLeaseStartedAtMillis - current.executorLeaseStartedAtMillis < 5 * 60 * 1000;
    if (current.status !== marketplace.TRANSFER_STATES.pending || leaseIsFresh) return;
    transaction.update(transferRef, {executorClaimed: true,
      executorLeaseStartedAtMillis,
      executorClaimedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    claimedExecutor = true;
  });
  if (!claimedExecutor) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = (await transferRef.get()).data() || {};
      if (current.status === marketplace.TRANSFER_STATES.submitted) {
        return {transferOperationId: transferId, status: current.status, recovered: true};
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("transfer_operation_in_progress");
  }
  try {
    const transfer = await stripeClient().transfers.create({
      amount: reserved.amountCents,
      currency: marketplace.CURRENCY,
      destination: connected.stripeAccountId,
      transfer_group: `campaign_${reserved.campaignId}`,
      metadata: {transferOperationId: transferId, campaignId: reserved.campaignId,
        zoneId: reserved.zoneId},
    }, {idempotencyKey: marketplace.stripeIdempotencyKey("transfer", transferId)});
    const paymentRef = db.collection("campaignPayments").doc(reserved.paymentId);
    const zoneRef = db.collection("campaignZones").doc(reserved.zoneId);
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(transferRef);
      if (fresh.data()?.status === marketplace.TRANSFER_STATES.submitted) return;
      transaction.update(transferRef, {status: marketplace.TRANSFER_STATES.submitted,
        stripeTransferId: transfer.id, transferredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
      transaction.update(paymentRef, {
        transferredWorkerAmountCents: FieldValue.increment(reserved.amountCents),
        reservedWorkerAmountCents: FieldValue.increment(-reserved.amountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(zoneRef, {paymentStatus: "transferred_to_connected_account",
        transferOperationId: transferId, paidAmountCents: reserved.amountCents,
        updatedAt: FieldValue.serverTimestamp()});
    });
    return {transferOperationId: transferId, status: marketplace.TRANSFER_STATES.submitted};
  } catch (error) {
    await transferRef.set({executorClaimed: false, executorLeaseStartedAtMillis: FieldValue.delete(),
      status: marketplace.TRANSFER_STATES.pending,
      retryableErrorCode: "stripe_transfer_retryable", updatedAt: FieldValue.serverTimestamp()},
    {merge: true});
    throw error;
  }
}

exports.createScalerTransfer = safeStripeCallable("createScalerTransfer", async (request) => {
  const context = await requireVerifiedUser(request, "Sign in to finalize a transfer.");
  const zoneId = cleanId(request.data?.zoneId);
  const zoneSnapshot = await db.collection("campaignZones").doc(zoneId || "missing").get();
  if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
  if (!context.isAdmin && zoneSnapshot.data()?.businessId !== context.uid) {
    throw new HttpsError("permission-denied", "Only the campaign Business may approve work.");
  }
  const queued = await queueScalerTransfer(zoneId, request.data?.releaseOptionalBonus === true);
  return executeQueuedScalerTransfer(queued.transferId);
});

exports.finalizeZoneReview = safeStripeCallable("finalizeZoneReview", async (request) => {
  const context = await requireVerifiedUser(request, "Sign in to review completed work.");
  const zoneId = cleanId(request.data?.zoneId);
  const decision = String(request.data?.decision || "");
  const feedback = String(request.data?.feedback || "").trim().slice(0, 2000);
  const releaseOptionalBonus = request.data?.releaseOptionalBonus === true;
  if (!zoneId || !["approve", "request_redo", "dispute"].includes(decision)) {
    throw new HttpsError("invalid-argument", "A valid zone and review decision are required.");
  }
  if (decision !== "approve" && !feedback) {
    throw new HttpsError("invalid-argument", "Review feedback is required.");
  }
  const zoneRef = db.collection("campaignZones").doc(zoneId);
  return db.runTransaction(async (transaction) => {
    const zoneSnapshot = await transaction.get(zoneRef);
    if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Zone not found.");
    const zone = zoneSnapshot.data() || {};
    if (zone.groupAssignmentId) {
      throw new HttpsError(
        "failed-precondition",
        "Group work has one zone-level review and group settlement path.",
      );
    }
    if (!context.isAdmin && zone.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "Only the campaign Business may review this work.");
    }
    if (zone.settlementBlocked === true || zone.status === "failed_business") {
      throw new HttpsError("failed-precondition", "This assignment is closed to normal review.");
    }
    const current = String(zone.reviewStatus || "");
    const target = decision === "approve" ? "approved" :
      decision === "request_redo" ? "redo_required" : "disputed";
    if (["approved", "auto_approved", "disputed"].includes(current)) {
      if (current === target || (current === "auto_approved" && target === "approved")) {
        return {zoneId, reviewStatus: current, alreadyProcessed: true};
      }
      throw new HttpsError("failed-precondition", "This review is already final.");
    }
    if (current !== "verification_pending") {
      throw new HttpsError("failed-precondition", "This work is not awaiting review.");
    }
    const contractRef = db.collection("assignmentCompensations").doc(zoneId);
    const completionRef = db.collection("campaignCompletions")
      .doc(cleanId(zone.submittedCompletionId) || "missing");
    const paymentRef = db.collection("campaignPayments")
      .doc(cleanId(zone.fundingPaymentId) || "missing");
    const [contractSnapshot, completionSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(contractRef), transaction.get(completionRef), transaction.get(paymentRef),
    ]);
    if (!contractSnapshot.exists || !completionSnapshot.exists || !paymentSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Review prerequisites are incomplete.");
    }
    const completion = completionSnapshot.data() || {};
    const payment = paymentSnapshot.data() || {};
    if (completion.zoneId !== zoneId || completion.scalerId !== zone.assignedScalerId ||
        completion.campaignId !== zone.campaignId || payment.campaignId !== zone.campaignId ||
        payment.businessId !== zone.businessId) {
      throw new HttpsError("failed-precondition", "Review records do not match the assignment.");
    }
    const timestamp = FieldValue.serverTimestamp();
    if (decision === "request_redo") {
      const redoCount = Number(zone.redoCount || 0);
      if (!Number.isSafeInteger(redoCount) || redoCount >= marketplace.DEFAULT_REDO_LIMIT) {
        throw new HttpsError("failed-precondition", "The redo limit has been reached.");
      }
      transaction.update(zoneRef, {
        reviewStatus: "redo_required", redoRequired: true, redoCount: redoCount + 1,
        reviewFeedback: feedback, reviewedBy: context.uid, reviewedAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.update(completionRef, {
        reviewStatus: "redo_required", reviewFeedback: feedback, updatedAt: timestamp,
      });
      return {zoneId, reviewStatus: "redo_required", redoCount: redoCount + 1};
    }
    if (decision === "dispute") {
      const disputeRef = db.collection("financialOperations")
        .doc(marketplace.operationId("work-dispute", zoneId, 1));
      transaction.update(zoneRef, {
        reviewStatus: "disputed", disputeOpen: true, reviewFeedback: feedback,
        reviewedBy: context.uid, reviewedAt: timestamp, updatedAt: timestamp,
      });
      transaction.update(paymentRef, {settlementFrozen: true, updatedAt: timestamp});
      transaction.set(disputeRef, {
        type: "work_dispute", status: "admin_review_required", zoneId,
        campaignId: zone.campaignId, paymentId: paymentSnapshot.id,
        businessId: zone.businessId, scalerId: zone.assignedScalerId,
        feedback, createdAt: timestamp, updatedAt: timestamp,
      }, {merge: false});
      return {zoneId, reviewStatus: "disputed"};
    }
    const completionBasisPoints = Math.round(Number(zone.completionPercentage || 0) * 100);
    const payout = marketplace.payoutForCompletion(
      contractSnapshot.data() || {}, completionBasisPoints, releaseOptionalBonus,
    );
    transaction.update(zoneRef, {
      reviewStatus: "approved", redoRequired: false,
      releaseOptionalBonus: payout.bonusAmountCents > 0,
      approvedTransferAmountCents: payout.transferAmountCents,
      approvedBaseAmountCents: payout.baseAmountCents,
      approvedBonusAmountCents: payout.bonusAmountCents,
      reviewedBy: context.uid, reviewedAt: timestamp, reviewFinalizedAt: timestamp,
      paymentStatus: "transfer_pending", updatedAt: timestamp,
    });
    transaction.update(completionRef, {
      reviewStatus: "approved", approvedTransferAmountCents: payout.transferAmountCents,
      reviewedAt: timestamp, updatedAt: timestamp,
    });
    return {zoneId, reviewStatus: "approved", payout};
  });
});

exports.requestCampaignCancellationRefund = safeStripeCallable(
  "requestCampaignCancellationRefund",
  async (request) => {
    const context = await requireFinancialRole(
      request, "business", "Sign in as a Business to cancel campaign funding.",
    );
    const campaignId = cleanId(request.data?.campaignId);
    if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (!campaignSnapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
    const campaign = campaignSnapshot.data() || {};
    if (!context.isAdmin && campaign.businessId !== context.uid) {
      throw new HttpsError("permission-denied", "You do not own this campaign.");
    }
    if (["in_progress", "submitted", "completed"].includes(campaign.status) ||
        campaign.workStartedAt || campaign.startedAt) {
      throw new HttpsError(
        "failed-precondition",
        "Work has started. Cancellation requires trusted support review.",
      );
    }
    const paymentId = cleanId(campaign.fundingPaymentId);
    if (!paymentId) throw new HttpsError("failed-precondition", "Campaign funding was not found.");
    const paymentRef = db.collection("campaignPayments").doc(paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists) throw new HttpsError("failed-precondition", "Funding record missing.");
    const payment = paymentSnapshot.data() || {};
    if (payment.businessId !== campaign.businessId || payment.campaignId !== campaignId) {
      throw new HttpsError("failed-precondition", "Funding record does not match campaign.");
    }
    if ((payment.transferredWorkerAmountCents || 0) > 0) {
      throw new HttpsError("failed-precondition", "A transfer exists; cancellation requires support review.");
    }
    if (payment.status === marketplace.PAYMENT_STATES.refunded) {
      return {paymentId, status: payment.status, recovered: true};
    }
    if (payment.status !== marketplace.PAYMENT_STATES.funded) {
      throw new HttpsError("failed-precondition", "Campaign is not eligible for an automatic refund.");
    }
    const refundAmountCents = payment.businessChargeCents - (payment.refundedTotalCents || 0);
    marketplace.assertSafeCents(refundAmountCents, "refundAmountCents");
    if (refundAmountCents <= 0) return {paymentId, status: marketplace.PAYMENT_STATES.refunded, recovered: true};
    const operationId = marketplace.operationId("campaign-refund", paymentId, "before-start-full");
    const operationRef = db.collection("financialOperations").doc(operationId);
    await db.runTransaction(async (transaction) => {
      const [operationDoc, freshPayment] = await Promise.all([
        transaction.get(operationRef), transaction.get(paymentRef),
      ]);
      if (operationDoc.exists) return;
      const current = freshPayment.data() || {};
      if (current.status !== marketplace.PAYMENT_STATES.funded) return;
      marketplace.assertAllocationAvailable(current, 0, current.workerAmountCents);
      transaction.create(operationRef, {
        operationId,
        type: "campaign_refund",
        ownerId: campaign.businessId,
        businessId: campaign.businessId,
        campaignId,
        paymentId,
        currency: marketplace.CURRENCY,
        workerRefundCents: current.workerAmountCents,
        platformFeeRefundCents: current.platformFeeCents,
        totalRefundCents: current.businessChargeCents,
        status: "processing",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(paymentRef, {
        status: marketplace.PAYMENT_STATES.refundPending,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const operation = (await operationRef.get()).data() || {};
    if (operation.status === "processed") {
      return {paymentId, refundOperationId: operationId, status: marketplace.PAYMENT_STATES.refunded, recovered: true};
    }
    const executorToken = crypto.randomUUID();
    const executorLeaseStartedAtMillis = Date.now();
    let executorClaimed = false;
    await db.runTransaction(async (transaction) => {
      const freshOperation = await transaction.get(operationRef);
      const current = freshOperation.data() || {};
      if (current.status === "processed") return;
      const leaseIsFresh = current.executorToken &&
        Number.isSafeInteger(current.executorLeaseStartedAtMillis) &&
        executorLeaseStartedAtMillis - current.executorLeaseStartedAtMillis < 5 * 60 * 1000;
      if (leaseIsFresh) return;
      transaction.set(operationRef, {
        executorToken,
        executorLeaseStartedAtMillis,
        executorClaimedAt: FieldValue.serverTimestamp(),
        status: "processing",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      executorClaimed = true;
    });
    if (!executorClaimed) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const current = (await operationRef.get()).data() || {};
        if (current.status === "processed") {
          return {
            paymentId,
            refundOperationId: operationId,
            status: marketplace.PAYMENT_STATES.refunded,
            recovered: true,
          };
        }
        if (!current.executorToken) break;
      }
      throw new HttpsError("unavailable", "The refund is already being processed. Retry shortly.");
    }
    let refund;
    try {
      refund = await stripeClient().refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmountCents,
        metadata: {refundOperationId: operationId, paymentId, campaignId},
      }, {idempotencyKey: marketplace.stripeIdempotencyKey("refund", operationId)});
    } catch (error) {
      await operationRef.set({
        status: "failed_retryable",
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
    if (refund.status !== "succeeded" && refund.status !== "pending") {
      await operationRef.set({
        status: "failed_retryable",
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw new HttpsError("unavailable", "Stripe has not confirmed the refund.");
    }
    await db.runTransaction(async (transaction) => {
      const [freshOperation, freshPayment] = await Promise.all([
        transaction.get(operationRef), transaction.get(paymentRef),
      ]);
      if (freshOperation.data()?.status === "processed") return;
      const current = freshPayment.data() || {};
      transaction.update(operationRef, {
        status: refund.status === "succeeded" ? "processed" : "processing",
        stripeRefundId: refund.id,
        executorToken: FieldValue.delete(),
        executorLeaseStartedAtMillis: FieldValue.delete(),
        executorClaimedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (refund.status === "succeeded") {
        transaction.update(paymentRef, {
          status: marketplace.PAYMENT_STATES.refunded,
          refundedWorkerAmountCents: current.workerAmountCents,
          refundedPlatformFeeCents: current.platformFeeCents,
          refundedTotalCents: current.businessChargeCents,
          platformFeePendingCents: 0,
          platformFeeRefundedCents: current.platformFeeCents,
          stripeRefundId: refund.id,
          refundedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(campaignRef, {
          fundingStatus: "refunded",
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return {paymentId, refundOperationId: operationId, status: refund.status};
  },
);

exports.autoApproveVerifiedCompletions = onSchedule(
  {schedule: "every 30 minutes", timeZone: "Etc/UTC", maxInstances: 1},
  async () => {
    const cutoff = Timestamp.fromMillis(
      Date.now() - marketplace.REVIEW_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const query = await db.collection("campaignZones")
      .where("reviewStatus", "==", "verification_pending")
      .where("verificationPassed", "==", true)
      .where("completionSubmittedAt", "<=", cutoff)
      .limit(100)
      .get();
    for (const snapshot of query.docs) {
      let approved = false;
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(snapshot.ref);
        const zone = fresh.data() || {};
        if (zone.reviewStatus !== "verification_pending" ||
            zone.verificationPassed !== true || zone.disputeOpen === true ||
            zone.redoRequired === true) return;
        transaction.update(snapshot.ref, {
          reviewStatus: "auto_approved",
          reviewFinalizedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        approved = true;
      });
      if (approved) {
        try {
          // Auto-approval queues the exact deterministic transfer operation
          // used by explicit Business approval. The Stripe executor remains a
          // separate idempotent step; no second payout algorithm exists here.
          await queueScalerTransfer(snapshot.id, false);
        } catch (error) {
          logger.error("Auto-approved completion could not queue its transfer.", {
            zoneId: snapshot.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  },
);

exports.executeQueuedScalerTransfers = onSchedule(
  {schedule: "every 5 minutes", timeZone: "Etc/UTC", maxInstances: 1,
    secrets: [STRIPE_SECRET_KEY]},
  async () => {
    const pending = await db.collection("scalerTransfers")
      .where("status", "==", marketplace.TRANSFER_STATES.pending).limit(50).get();
    for (const snapshot of pending.docs) {
      try {
        await executeQueuedScalerTransfer(snapshot.id);
      } catch (error) {
        logger.error("Queued Scaler transfer remains retryable.", {
          transferOperationId: snapshot.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

exports._marketplaceTest = {
  ...marketplace,
  campaignCheckoutOperationStore,
};

// Retired cash-wallet settlement callables. Keeping controlled stubs avoids a
// silent client break while ensuring no caller can bypass the Connect transfer
// and server-authoritative review state machines.
for (const legacyName of ["approveZonePayout", "requestZoneRedo", "dropZoneScaler"]) {
  exports[legacyName] = onCall({enforceAppCheck: false, maxInstances: 5}, async (request) => {
    await requireVerifiedUser(request, "Sign in to review completed work.");
    throw new HttpsError(
      "failed-precondition",
      "This legacy financial operation is retired. Update the app and use the secure review flow.",
    );
  });
}

// Sales is intentionally appended so generation of existing isolated codebases
// remains byte-stable when the Sales boundary evolves.
const salesFunnel = require("./sales_funnel");
const salesService = salesFunnel.createSalesService({db, FieldValue});

function salesHttpsError(error) {
  const code = String(error?.message || "");
  if (code === "trusted_sales_actor_required") {
    return new HttpsError("permission-denied", "Trusted Sales access is required.");
  }
  if (["business_name_required", "invalid_sales_source", "invalid_sales_priority",
    "lead_id_required", "invalid_sales_lead_action", "derived_sales_stage_forbidden",
    "future_follow_up_required", "invalid_suppression_status", "business_identity_required",
    "invalid_sales_activity", "invalid_contact_channel", "sales_activity_summary_required"
  ].includes(code)) return new HttpsError("invalid-argument", "A valid Sales update is required.");
  if (["sales_lead_not_found", "linked_business_not_found"].includes(code)) {
    return new HttpsError("not-found", "The requested Sales record was not found.");
  }
  if (code === "sales_lead_suppressed") {
    return new HttpsError("failed-precondition", "This lead may not be contacted.");
  }
  return new HttpsError("internal", "Unable to complete the Sales operation.");
}

async function requireTrustedSalesActor(request) {
  const context = await authenticatedUserContext(request, "You must be logged in to use Sales.");
  try {
    return salesFunnel.assertTrustedSalesActor(context);
  } catch (error) {
    throw salesHttpsError(error);
  }
}

/** Returns a bounded, redacted Sales pipeline. Paid stages are server-derived. */
exports.getSalesPipeline = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    await requireTrustedSalesActor(request);
    try { return await salesService.getPipeline(request.data); } catch (error) { throw salesHttpsError(error); }
  },
);

/** Applies a purpose-built, auditable lead mutation; never accepts paid truth. */
exports.mutateSalesLead = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireTrustedSalesActor(request);
    try { return await salesService.mutateLead(request.data, actor); } catch (error) { throw salesHttpsError(error); }
  },
);

/** Records a contact, note, or outcome without sending an outbound message. */
exports.recordSalesActivity = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireTrustedSalesActor(request);
    try { return await salesService.recordActivity(request.data, actor); } catch (error) { throw salesHttpsError(error); }
  },
);

async function requireCreativeMediaBusiness(request) {
  const context = await requireVerifiedUser(request, "Log in to manage Brand Assets.");
  if (context.role !== "business" || context.user.active !== true) {
    throw new HttpsError("permission-denied", "Brand Assets are available to active Business accounts.");
  }
  return context;
}

function creativeMediaError(error) {
  const code = String(error?.message || error);
  if (code === "media_access_denied") return new HttpsError("permission-denied", "That Brand Asset is not available.");
  if (["media_upload_limit_reached", "media_asset_limit_reached"].includes(code)) {
    return new HttpsError("resource-exhausted", code === "media_asset_limit_reached" ?
      "This Brand Assets library has reached its current limit." : "Finish an active upload before starting another.");
  }
  if (["media_not_ready", "media_approval_requirements_missing", "brand_logo_not_approved",
    "media_upload_incomplete"].includes(code)) return new HttpsError("failed-precondition", {
    media_not_ready: "This image is still processing.",
    media_approval_requirements_missing: "Add factual alt text and confirm your right to use this image before approving it.",
    brand_logo_not_approved: "Approve this logo revision before selecting it.",
    media_upload_incomplete: "The upload has not finished yet.",
  }[code]);
  if (["invalid_request_id", "invalid_media_purpose", "invalid_media_cursor",
    "invalid_brand_color", "invalid_brand_style", "invalid_brand_service"].includes(code)) {
    return new HttpsError("invalid-argument", "Check the Brand Asset details and try again.");
  }
  if (code === "brand_service_limit_reached") {
    return new HttpsError("resource-exhausted", "Choose no more than 12 services for visuals.");
  }
  if (code === "brand_service_not_offered") {
    return new HttpsError("failed-precondition", "Choose services saved in your Business Growth Profile.");
  }
  if (["media_file_unsuitable", "media_processing_failed"].includes(code)) {
    return new HttpsError("failed-precondition", code === "media_file_unsuitable" ?
      "This file is not a supported JPEG, PNG, or WebP image." : "We couldn't prepare this image. Try another file.");
  }
  return new HttpsError("internal", "Brand Assets are temporarily unavailable.");
}

async function creativeMediaCall(request, operation) {
  const actor = await requireCreativeMediaBusiness(request);
  try { return await operation({actor, input: request.data || {}}); }
  catch (error) { throw creativeMediaError(error); }
}

exports.getBusinessMediaWorkspace = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.workspace),
);
exports.createBusinessMediaUploadIntent = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.createUploadIntent),
);
exports.finalizeBusinessMediaUpload = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 4, timeoutSeconds: 120, memory: "1GiB"},
  (request) => creativeMediaCall(request, creativeMediaService.finalizeUpload),
);
exports.updateBusinessMediaRevisionMetadata = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.updateMetadata),
);
exports.approveBusinessMediaRevision = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.approve),
);
exports.rejectBusinessMediaRevision = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.reject),
);
exports.removeBusinessMediaAsset = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.remove),
);
exports.updateBusinessBrandProfile = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 10},
  (request) => creativeMediaCall(request, creativeMediaService.updateBrand),
);

function generationHttpsError(error) {
  const code = String(error?.message || error);
  if (["generation_access_denied", "generation_job_not_found"].includes(code)) {
    return new HttpsError("permission-denied", "That generated visual is not available.");
  }
  if (["generation_disabled", "provider_unavailable", "budget_disabled", "test_adapter_forbidden"].includes(code)) {
    return new HttpsError("failed-precondition", "Generated visuals are temporarily unavailable.");
  }
  if (code === "generation_rate_limited") {
    return new HttpsError("resource-exhausted", "You’ve reached the current generated-visual limit. Try again later.");
  }
  if (["invalid_generation_request", "unsupported_service_category", "invalid_visual_direction",
    "invalid_generated_purpose", "invalid_generation_cursor"].includes(code)) {
    return new HttpsError("invalid-argument", "Choose a supported service and visual direction.");
  }
  if (["generation_not_approvable", "moderation_blocked"].includes(code)) {
    return new HttpsError("failed-precondition", "This concept cannot be approved for use.");
  }
  return new HttpsError("internal", "Generated visuals are temporarily unavailable.");
}
async function generationBusinessCall(request, operation) {
  const actor = await requireCreativeMediaBusiness(request);
  try { return await operation({actor, input: request.data || {}}); }
  catch (error) { throw generationHttpsError(error); }
}
exports.getGeneratedServiceVisualWorkspace = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 4},
  (request) => generationBusinessCall(request,
    ({actor, input}) => generationService.list({actor, input, admin: false})),
);
exports.requestGeneratedServiceVisual = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 2},
  (request) => generationBusinessCall(request, generationService.request),
);
exports.processGeneratedServiceVisual = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 2, timeoutSeconds: 120, memory: "1GiB"},
  (request) => generationBusinessCall(request,
    ({actor, input}) => generationService.process({actor, jobId: input.jobId})),
);
exports.approveGeneratedServiceVisual = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 4},
  (request) => generationBusinessCall(request, generationService.approve),
);
exports.rejectGeneratedServiceVisual = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 4},
  (request) => generationBusinessCall(request, generationService.reject),
);
exports.getGeneratedMediaOperations = onCall(
  {region: "us-east1", enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const context = await authenticatedUserContext(request, "Admin access is required.");
    if (context.isAdmin !== true) throw new HttpsError("permission-denied", "Admin access is required.");
    try { return await generationService.operations({actor: context, input: request.data || {}}); }
    catch (error) { throw generationHttpsError(error); }
  },
);

// Attribution Foundation V1 extends the maintained Sales lead boundary. Public
// response traffic can record immutable, privacy-minimized interactions but can
// never select tenant attribution or create conversions.
const attributionFoundation = require("./attribution_foundation");
const attributionProjectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT || "";
const attributionService = attributionFoundation.createAttributionService({db, FieldValue,
  publicBaseUrl: attributionFoundation.publicResponseOrigin(attributionProjectId)});

function attributionHttpsError(error) {
  const code = String(error?.message || "");
  if (["attribution_actor_required", "cross_business_attribution_forbidden",
    "attribution_reference_forbidden"].includes(code)) {
    return new HttpsError("permission-denied", "Attribution access is not available.");
  }
  if (["invalid_response_destination", "invalid_attribution_source",
    "unsupported_response_asset_type", "business_identity_required",
    "interaction_id_required"].includes(code)) {
    return new HttpsError("invalid-argument", "A valid attribution request is required.");
  }
  if (["response_asset_not_found", "interaction_not_found"].includes(code)) {
    return new HttpsError("not-found", "The requested response record was not found.");
  }
  if (code === "response_asset_inactive") {
    return new HttpsError("failed-precondition", "This response link is no longer active.");
  }
  if (code === "interaction_not_live") {
    return new HttpsError("failed-precondition",
      "Test and pre-launch responses cannot create live leads.");
  }
  return new HttpsError("internal", "Unable to complete the attribution operation.");
}

async function requireAttributionActor(request) {
  const context = await authenticatedUserContext(request, "Sign in to use attribution tools.");
  try { return attributionFoundation.assertAttributionActor(context); } catch (error) {
    console.warn("attribution_actor_denied", {
      category: "authority_contract_mismatch",
      actorRole: context.role || "unknown",
      canonicalAdmin: context.isAdmin === true,
      emailVerified: context.emailVerified === true,
      businessLifecycleActive: context.role === "business" ?
        context.user?.active !== false && context.user?.disabled !== true : null,
    });
    throw attributionHttpsError(error);
  }
}

exports.createResponseAsset = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireAttributionActor(request);
    try { return await attributionService.createResponseAsset(request.data, actor); } catch (error) {
      throw attributionHttpsError(error);
    }
  },
);

/** Process an explicitly reconciled job without replaying arbitrary updates. */
exports.retryTransactionalEmailJob = onDocumentUpdated(
  {
    document: "outboundEmailJobs/{jobId}",
    secrets: [SUPPORT_EMAIL_SMTP_PASSWORD],
    retry: false,
    maxInstances: 5,
  },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after;
    if (!after || before.status === "retry_requested" || after.data()?.status !== "retry_requested") return;
    return transactionalEmail.processDeliveryJob({
      db, reference: after.ref, jobId: event.params.jobId, FieldValue,
      createTransport: (options) => nodemailer.createTransport(options), logger,
      smtpPassword: SUPPORT_EMAIL_SMTP_PASSWORD.value(),
    });
  },
);

exports.getAttributionOverview = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireAttributionActor(request);
    try { return await attributionService.getOverview(request.data, actor); } catch (error) {
      console.error("attribution_overview_failed", {
        category: "read_model_failure",
        actorRole: actor.role,
        scope: actor.role === "admin" && !request.data?.businessUid ? "admin_bounded" : "business",
      });
      throw attributionHttpsError(error);
    }
  },
);

exports.bridgeResponseLead = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireAttributionActor(request);
    try { return await attributionService.bridgeLead(request.data, actor); } catch (error) {
      throw attributionHttpsError(error);
    }
  },
);

exports.resolveTrackedResponse = onRequest(
  {cors: false, maxInstances: 20, timeoutSeconds: 15},
  async (request, response) => {
    try {
      const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0];
      const trace = String(request.headers["x-cloud-trace-context"] || "")
        .split("/")[0].split(";")[0].trim();
      const requestIdentity = trace || crypto.randomUUID();
      const result = await attributionService.resolveAndRecord({code: request.query.code,
        ip: forwarded || request.ip, userAgent: request.headers["user-agent"], requestIdentity});
      response.set("Cache-Control", "no-store");
      response.redirect(302, result.destination);
    } catch (error) {
      const code = String(error?.message || "");
      console.warn("attribution_response_resolution_failed", {
        category: attributionFoundation.resolverFailureCategory(error),
        codeFingerprint: attributionFoundation.responseCodeFingerprint(request.query.code),
        codePresent: Boolean(String(request.query.code || "").trim()),
        stage: "resolve_or_record",
      });
      response.status(code === "response_asset_inactive" ? 410 : 404)
        .set("Cache-Control", "no-store")
        .send("This ScaledCircle response link is unavailable.");
    }
  },
);

// Landing Page + Form V1 is isolated from the retired campaignTrackingCodes
// authority. Public page and form identities are always derived server-side.
const landingPage = require("./landing_page");
const landingPageWorkspace = require("./landing_page_workspace");
function effectiveLandingPageProjectIdentity() {
  let firebaseConfigProjectId=null;
  try{firebaseConfigProjectId=JSON.parse(process.env.FIREBASE_CONFIG||"{}").projectId||null;}catch(_){firebaseConfigProjectId=null;}
  const identity={gcloudProject:landingPage.text(process.env.GCLOUD_PROJECT,160)||null,
    googleCloudProject:landingPage.text(process.env.GOOGLE_CLOUD_PROJECT,160)||null,
    firebaseConfigProject:landingPage.text(firebaseConfigProjectId,160)||null,
    adminAppProject:landingPage.text(getApp().options.projectId,160)||null,
    authAppProject:landingPage.text(getAuth().app.options.projectId,160)||null};
  const projects=Object.values(identity).filter(Boolean);const unique=[...new Set(projects)];
  return {...identity,effectiveProjectId:identity.gcloudProject||identity.googleCloudProject||identity.firebaseConfigProject||
    identity.adminAppProject||identity.authAppProject||null,match:unique.length<=1};
}
const landingPageService = landingPage.createLandingPageService({db, FieldValue,
  bucket: () => getStorage().bucket(),
  getAuthUser: (uid) => getAuth().getUser(uid),
  runtimeProjectIdentity: effectiveLandingPageProjectIdentity,
  reportRecipientResolution: recordLandingPageRecipientResolutionSafe,
  publicBaseUrl: landingPage.publicOrigin(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT || "demo-scaledcircle")});

async function requireLandingPageActor(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to manage landing pages.");
  const profile = await db.collection("users").doc(request.auth.uid).get();
  const role = String(profile.data()?.role || "").toLowerCase();
  if (!profile.exists || !["business", "admin"].includes(role)) {
    throw new HttpsError("permission-denied", "Landing page access is not available.");
  }
  return {uid: request.auth.uid, role};
}

function landingPageError(error) {
  const code = String(error?.message || "");
  if (code.includes("forbidden") || code.includes("required")) return new HttpsError("permission-denied", "Landing page access is not available.");
  if (code.includes("unavailable") || code.includes("missing")) return new HttpsError("not-found", "Landing page unavailable.");
  return new HttpsError("failed-precondition", "We couldn't complete that landing page action.");
}

async function recordLandingPageHealth(event, success) {
  await db.collection("featureHealth").doc("landing_page").set({
    schemaVersion: landingPage.SCHEMA_VERSION, feature: "landing_page",
    status: success ? "enabled" : "attention", lastEvent: event,
    ...(success ? {successfulEvents: FieldValue.increment(1), lastSuccessfulEventAt: FieldValue.serverTimestamp()} :
      {failedEvents: FieldValue.increment(1), lastFailedEventAt: FieldValue.serverTimestamp()}),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

async function recordLandingPageHealthSafe(event, success) {
  try {
    await recordLandingPageHealth(event, success);
  } catch (error) {
    logger.warn("landing_page_health_record_failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function recordLandingPageRecipientResolutionSafe(outcome, context = {}) {
  const category = String(outcome?.category || "auth_other_failure").slice(0, 80);
  if (category !== "resolved") {
    logger.warn("landing_page_business_recipient_resolution_failed", {
      category,
      firebaseErrorCode: outcome?.firebaseErrorCode || null,
      backendCategory: outcome?.diagnostic?.backendCategory || null,
      httpStatus: outcome?.diagnostic?.httpStatus || null,
      backendCode: outcome?.diagnostic?.backendCode || null,
      causeType: outcome?.diagnostic?.causeType || null,
      causeCode: outcome?.diagnostic?.causeCode || null,
      errorType: outcome?.diagnostic?.errorType || null,
      safeMessage: outcome?.diagnostic?.safeMessage || null,
      businessUidFingerprint: landingPage.digest(String(context.businessUid || "unavailable")).slice(0, 16),
      leadIdFingerprint: context.leadId ? landingPage.digest(String(context.leadId)).slice(0, 16) : null,
      operation: String(context.operation || "unknown").slice(0, 40),
    });
  }
  try {
    await db.collection("featureHealth").doc("landing_page_email_delivery").set({
      schemaVersion: landingPage.EMAIL_JOB_SCHEMA_VERSION,
      feature: "landing_page_email_delivery",
      component: "business_recipient",
      status: category === "resolved" ? "enabled" : "attention",
      recipientAuthority: category === "resolved" ? "healthy" : "degraded",
      lastRecipientResolutionCategory: category,
      lastFirebaseErrorCode: outcome?.firebaseErrorCode || null,
      lastBackendCategory: outcome?.diagnostic?.backendCategory || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge:true});
  } catch (error) {
    logger.warn("landing_page_recipient_health_record_failed", {
      category,
      errorCategory: String(error?.code || "health_write_failed").slice(0, 80),
    });
  }
}

exports.getLandingPageWorkspace = onCall({region: "us-east1", enforceAppCheck: false, maxInstances: 10}, async (request) => {
  const actor = await requireLandingPageActor(request);
  if (request.data?.action === "create") {
    try { return await landingPageService.createDraft(request.data || {}, actor); } catch (error) { throw landingPageError(error); }
  }
  const pageId = String(request.data?.pageId || "");
  if (!pageId) {
    const pageSize = landingPageWorkspace.PAGE_SIZE;
    let cursor = null;
    if (request.data?.cursor != null) {
      try {
        cursor = landingPageWorkspace.decodeCursor(request.data.cursor);
      } catch (_) {
        throw new HttpsError("invalid-argument", "That Landing Page list position is no longer available.");
      }
    }
    let query = db.collection("landingPages");
    if (actor.role === "business") query = query.where("businessUid", "==", actor.uid);
    query = query.orderBy("createdAt", "desc")
      .orderBy(require("firebase-admin/firestore").FieldPath.documentId(), "desc");
    if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.createdAtMillis), cursor.pageId);
    const pages = await query.limit(pageSize + 1).get();
    const visibleDocs = pages.docs.slice(0, pageSize);
    const records = visibleDocs.map((doc) => ({pageId: doc.id, ...doc.data()}));
    const hasMore = pages.docs.length > pageSize;
    const last = visibleDocs.at(-1);
    const nextCursor = hasMore && last ? landingPageWorkspace.encodeCursor({
      createdAtMillis: last.data().createdAt.toMillis(), pageId: last.id,
    }) : null;
    const summaries = await Promise.all(records.map(async (record) => {
      const version = record.draftVersionId ? await db.collection("landingPages").doc(record.pageId)
        .collection("versions").doc(record.draftVersionId).get() : null;
      let inquiryCount = null;
      const countOwnerUid = actor.role === "business" ? actor.uid : String(record.businessUid || "");
      if (countOwnerUid) {
        try {
          inquiryCount = await landingPageWorkspace.exactInquiryCount(db, countOwnerUid, record.pageId);
        } catch (error) {
          logger.warn("landing_page_inquiry_count_unavailable", {
            pageIdFingerprint: landingPage.digest(record.pageId).slice(0, 16),
            errorCategory: String(error?.code || "count_failed").slice(0, 80),
          });
        }
      }
      return {pageId: record.pageId,title: String(version?.data()?.content?.headline || "Untitled Landing Page"),
        status: record.status,trackingMode: record.trackingMode,publicSlug: record.publicSlug,
        createdAt: record.createdAt || null,updatedAt: record.updatedAt || null,inquiryCount,
        hasUnpublishedChanges: record.status === "published" && record.draftVersionId !== record.publishedVersionId};
    }));
    return {schemaVersion: landingPage.SCHEMA_VERSION, pages: summaries, hasMore, nextCursor};
  }
  const page = await db.collection("landingPages").doc(pageId).get();
  if (!page.exists || (actor.role !== "admin" && page.data()?.businessUid !== actor.uid)) throw new HttpsError("permission-denied", "Landing page access is not available.");
  const versions = await page.ref.collection("versions").orderBy("createdAt", "desc").limit(20).get();
  const inquiryQuery = db.collection("salesLeads").where("ownerUid", "==", page.data().businessUid)
    .where("attribution.landingPageId", "==", page.id);
  let inquiryCount = null;
  try { inquiryCount = await landingPageWorkspace.exactInquiryCount(db, page.data().businessUid, page.id); } catch (error) {
    logger.warn("landing_page_inquiry_count_unavailable", {
      pageIdFingerprint: landingPage.digest(page.id).slice(0, 16),
      errorCategory: String(error?.code || "count_failed").slice(0, 80),
    });
  }
  const inquiries = await inquiryQuery.limit(10).get();
  const pageInquiries = inquiries.docs.filter((doc) => doc.data()?.attribution?.landingPageId === page.id);
  return {schemaVersion: landingPage.SCHEMA_VERSION, page: {pageId: page.id, ...page.data()},
    versions: versions.docs.map((doc) => ({versionId: doc.id, ...doc.data()})),
    inquirySummary: {count: inquiryCount, recent: pageInquiries.map((doc) => ({
      leadId: doc.id, contactName: String(doc.data()?.contactName || "New inquiry"),
      contactEmail: doc.data()?.contactEmail || null,
      contactPhone: doc.data()?.contactPhone || null,
      requestSummary: String(doc.data()?.requestSummary || ""),
      status: String(doc.data()?.stage || "prospect"),
      source: "Landing page",
      createdAt: doc.data()?.createdAt || null,
    }))}};
});

exports.mutateLandingPageDraft = onCall({region: "us-east1", enforceAppCheck: false, maxInstances: 10}, async (request) => {
  const actor = await requireLandingPageActor(request);
  try { return await landingPageService.saveDraft(request.data || {}, actor); } catch (error) { throw landingPageError(error); }
});

exports.transitionLandingPage = onCall({region: "us-east1", enforceAppCheck: false, maxInstances: 10}, async (request) => {
  const actor = await requireLandingPageActor(request);
  try { const result = await landingPageService.transition(request.data || {}, actor);
    await recordLandingPageHealth("publish", true); return result;
  } catch (error) { await recordLandingPageHealth("publish", false); throw landingPageError(error); }
});

exports.reconcileLandingPageInquiryDelivery = onCall(
  {region:"us-east1",enforceAppCheck:false,maxInstances:2},
  async(request)=>{
    const actor=await requireLandingPageActor(request);
    if(actor.role!=="admin")throw new HttpsError("permission-denied","Admin authority is required.");
    try{return await landingPageService.reconcileInquiry(request.data||{},actor);}
    catch(error){logger.warn("landing_page_delivery_reconciliation_failed",{actorUidFingerprint:landingPage.digest(actor.uid).slice(0,16),
      code:String(error?.message||"reconciliation_failed").slice(0,80)});throw landingPageError(error);}
  },
);

exports.renderLandingPage = onRequest({region: "us-east1", cors: false, maxInstances: 20}, async (request, response) => {
  const slug = request.path.split("/").filter(Boolean).at(-1);
  try {
    const resolved = await landingPageService.resolve(slug);
    if (request.query?.submitted === "1") {
      response.set("Cache-Control", "no-store");
      response.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      return response.status(200).type("html").send(landingPage.renderSuccessPage({style: resolved.version.content.style}));
    }
    response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    response.set("Content-Security-Policy", "default-src 'none'; img-src https://firebasestorage.googleapis.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    await recordLandingPageHealthSafe("render", true);
    const responseContext=landingPage.validOpaqueContext(request.query?.sc_response);
    const formAction=responseContext ? `/landing-page-submit?response=${encodeURIComponent(responseContext)}` :
      "/landing-page-submit";
    response.status(200).type("html").send(landingPage.renderPage({...resolved,
      version:{...resolved.version,id:resolved.version.submissionContext},formAction}));
  } catch (error) {
    console.warn("landing_page_resolution_failed", {
      category: String(error?.message || "landing_page_internal").replace(/[^a-z0-9_]/gi, "_").slice(0, 80),
      slugFingerprint: landingPage.digest(String(slug || "")).slice(0, 16),
      slugPresent: Boolean(slug),
    });
    await recordLandingPageHealthSafe("render", false);
    response.set("Cache-Control", "no-store");
    response.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    response.status(404).type("html").send(landingPage.renderUnavailablePage());
  }
});

exports.submitLandingPageForm = onRequest({region: "us-east1", cors: false, maxInstances: 20}, async (request, response) => {
  if (request.method !== "POST") return response.status(405).send("Method not allowed");
  try {
    const body=request.body||{};
    const input={...body,version:landingPage.validOpaqueContext(body.version||body.context),
      response:request.query?.response};
    const result = await landingPageService.submit({...input, idempotencyKey: request.get("Idempotency-Key") || input.idempotencyKey}, {requestIdentity: request.get("X-Request-ID"), ip: request.ip});
    await Promise.all([
      recordLandingPageHealthSafe("lead_transaction", true),
      recordLandingPageHealthSafe("notification_delivery_queued", true),
      recordLandingPageHealthSafe("success_response", true),
    ]);
    response.set("Cache-Control", "no-store");
    response.redirect(303, `/p/${encodeURIComponent(result.slug)}?submitted=1`);
  } catch (_) { await recordLandingPageHealthSafe("lead_transaction", false); response.status(400).type("html").send("<!doctype html><title>Try again</title><main><h1>We couldn't send your request.</h1><p>Check your details and try again.</p></main>"); }
});
