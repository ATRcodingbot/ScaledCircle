"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const socialOperations = require("./social_operations");
const socialOAuth = require("./social_oauth");
const subscriptionEntitlements = require("./subscription_entitlements");
const scaledCircleLaunchPlan = require("./scaledcircle_launch_plan");
const xFirstPublish = require("./x_first_publish");

if (getApps().length === 0) initializeApp();
const db = getFirestore();
setGlobalOptions({region: "us-east1"});

const socialOAuthEncryptionKey = defineSecret("SOCIAL_OAUTH_TOKEN_ENCRYPTION_KEY");
const metaSocialAppSecret = defineSecret("META_SOCIAL_APP_SECRET");
const youtubeSocialClientSecret = defineSecret("YOUTUBE_SOCIAL_CLIENT_SECRET");
const xSocialClientSecret = defineSecret("X_SOCIAL_CLIENT_SECRET");

function runtimeEnvironment() {
  return String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "")
    .toLowerCase().includes("staging") ? "staging" : "production";
}

function providerConfigRef(provider, environment = runtimeEnvironment()) {
  return db.collection("socialProviderConfigs").doc(`${environment}_${provider}`);
}

const providerSecretBindings = Object.freeze({
  meta: Object.freeze({secret: metaSocialAppSecret,
    secretName: "META_SOCIAL_APP_SECRET"}),
  youtube: Object.freeze({secret: youtubeSocialClientSecret,
    secretName: "YOUTUBE_SOCIAL_CLIENT_SECRET"}),
  x: Object.freeze({secret: xSocialClientSecret,
    secretName: "X_SOCIAL_CLIENT_SECRET"}),
});

function providerSecretBinding(provider) {
  const binding = providerSecretBindings[provider];
  if (!binding) throw new Error("unsupported_social_oauth_provider");
  return binding;
}

function requireRuntimeProvider(expectedProvider, actualProvider) {
  if (actualProvider !== expectedProvider) throw new Error("social_oauth_provider_runtime_mismatch");
}

function readText(value, maximumLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function isoValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function requireFirstXCertificationBusiness(business) {
  if (runtimeEnvironment() !== "staging" || business.uid !== xFirstPublish.BUSINESS_UID ||
      !business.isAdmin) {
    throw new HttpsError("permission-denied", "This bounded staging certification is unavailable.");
  }
  return business;
}

function firstXTrackedUrl(asset) {
  const code = readText(asset?.publicCode, 80);
  const origin = readText(asset?.publicOrigin, 240);
  if (!/^[A-Za-z0-9_-]{24}$/.test(code) || asset?.exposure !== "public_publish" ||
      origin !== "https://scaledcircle.com") return null;
  return `${origin}/r?code=${encodeURIComponent(code)}`;
}

async function requireVerifiedUser(request, message) {
  if (!request.auth) throw new HttpsError("unauthenticated", message);
  const user = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "";
  const context = {
    uid: request.auth.uid,
    user,
    role,
    isAdmin: role === "admin",
    emailVerified: request.auth.token.email_verified === true,
  };
  if (!context.isAdmin && !context.emailVerified) {
    throw new HttpsError("permission-denied", "Verify your email address before using Social Operations.");
  }
  return context;
}

async function requireSocialOperationsBusiness(request) {
  const context = await requireVerifiedUser(request, "You must be logged in to use Social Operations.");
  if (!context.isAdmin && context.role !== "business") {
    throw new HttpsError("permission-denied", "Social Operations is available to Business accounts.");
  }
  const entitlement = (await db.collection("businessSubscriptions").doc(context.uid).get()).data();
  if (!context.isAdmin && !subscriptionEntitlements.hasActiveScaleEntitlement(entitlement)) {
    throw new HttpsError("permission-denied", "An active Scale or Managed Growth entitlement is required.");
  }
  return {
    ...context,
    entitlement: entitlement || {},
    planId: context.isAdmin ? "managed_growth" :
      socialOperations.normalizePlanId(entitlement?.planId || entitlement?.plan),
  };
}

async function requireManagedGrowthBusiness(request) {
  const context = await requireVerifiedUser(request, "You must be logged in to use Managed Growth.");
  if (!context.isAdmin && context.role !== "business") {
    throw new HttpsError("permission-denied", "Managed Growth is available to Business accounts.");
  }
  const entitlement = (await db.collection("businessSubscriptions").doc(context.uid).get()).data();
  if (!context.isAdmin && !subscriptionEntitlements.hasActiveManagedGrowthEntitlement(entitlement)) {
    throw new HttpsError("permission-denied", "An active Managed Growth entitlement is required.");
  }
  return {...context, entitlement: entitlement || {}};
}

exports.getSocialOperationsWorkspace = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const [connections, plans, emailPlans, snapshots, metaAds, googleAds,
      qualityAssessments, pastPostRatings, profileSnapshot] = await Promise.all([
      db.collection("socialConnections").doc(business.uid).collection("providers").get(),
      db.collection("socialContentPlans").where("businessUid", "==", business.uid).limit(10).get(),
      db.collection("emailContentPlans").where("businessUid", "==", business.uid).limit(10).get(),
      db.collection("socialPerformanceSnapshots").where("businessUid", "==", business.uid).limit(50).get(),
      db.collection("adAccountHealth").doc(`${business.uid}_meta_ads`).get(),
      db.collection("adAccountHealth").doc(`${business.uid}_google_ads`).get(),
      db.collection("socialContentQualityAssessments")
        .where("businessUid", "==", business.uid).limit(100).get(),
      db.collection("socialPastPostRatings")
        .where("businessUid", "==", business.uid).limit(100).get(),
      db.collection("businessGrowthProfiles").doc(business.uid).get(),
    ]);
    const connectionMap = new Map(connections.docs.map((doc) => [doc.id, doc.data()]));
    const safeConnections = socialOperations.PROVIDERS.map((provider) =>
      socialOperations.connectionProjection({provider, ...(connectionMap.get(provider) || {})}));
    const performance = snapshots.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    return {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      canonicalBusinessId: business.uid,
      canonicalBusinessName: readText(profileSnapshot.data()?.businessName, 240) || null,
      planId: business.planId,
      managedGrowth: business.planId === "managed_growth",
      connections: safeConnections,
      plans: plans.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      emailPlans: emailPlans.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      ads: [
        socialOperations.adAccountHealth({provider: "meta_ads", ...(metaAds.data() || {})}),
        socialOperations.adAccountHealth({provider: "google_ads", ...(googleAds.data() || {})}),
      ],
      weeklyLearning: socialOperations.weeklyLearning({
        businessUid: business.uid,
        snapshots: performance,
        now: Date.now(),
      }),
      contentHealth: socialOperations.contentHealthProjection({
        assessments: qualityAssessments.docs.map((doc) => ({id: doc.id, ...doc.data()})),
        ratings: pastPostRatings.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      }),
      contentQualityLearning: socialOperations.qualityLearningComparison({
        businessUid: business.uid,
        assessments: qualityAssessments.docs.map((doc) => ({id: doc.id, ...doc.data()})),
        snapshots: performance,
        now: Date.now(),
      }),
      externalPublishingEnabled: false,
      adMutationsEnabled: false,
      emailDeliveryEnabled: false,
      internalPlanAlignment: runtimeEnvironment() === "staging" && business.isAdmin ? {
        sourcePlanId: scaledCircleLaunchPlan.PLAN_ID,
        sourceArtifact: scaledCircleLaunchPlan.SOURCE_ARTIFACT,
        migrationAvailable: plans.size === 0,
        canonicalBusinessId: business.uid,
      } : null,
      firstXCertificationAvailable: runtimeEnvironment() === "staging" && business.isAdmin &&
        business.uid === xFirstPublish.BUSINESS_UID,
    };
  },
);

exports.reviewScheduledSocialContentV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const [profileSnapshot, itemSnapshots, versionSnapshots, performanceSnapshots] =
      await Promise.all([
        db.collection("businessGrowthProfiles").doc(business.uid).get(),
        db.collection("socialContentItems").where("businessUid", "==", business.uid)
          .limit(60).get(),
        db.collection("socialContentVersions").where("businessUid", "==", business.uid)
          .limit(120).get(),
        db.collection("socialPerformanceSnapshots").where("businessUid", "==", business.uid)
          .limit(100).get(),
      ]);
    const profile = profileSnapshot.data() || {};
    const versions = new Map(versionSnapshots.docs.map((doc) => [doc.id, doc.data()]));
    const performance = performanceSnapshots.docs.map((doc) => doc.data());
    const batch = db.batch();
    const assessments = [];
    for (const item of itemSnapshots.docs) {
      const data = item.data();
      if (["published", "canceled"].includes(data.status)) continue;
      const versionNumber = Number(data.currentVersion || 0);
      const sourceVersionId = `${item.id}_v${versionNumber}`;
      const source = versions.get(sourceVersionId);
      if (!source) continue;
      const recentVariants = versionSnapshots.docs
        .filter((doc) => doc.id !== sourceVersionId)
        .flatMap((doc) => doc.data().variants || []);
      const itemPerformance = performance.filter((snapshot) =>
        snapshot.contentItemId === item.id);
      const assessment = socialOperations.assessScheduledContent({
        businessUid: business.uid,
        contentItemId: item.id,
        versionRecord: {...source,
          scheduledFor: isoValue(source.scheduledFor || data.scheduledFor)},
        businessContext: {
          businessName: profile.businessName,
          services: profile.services || profile.selectedServices || [],
          geography: [profile.serviceArea, profile.city, profile.county]
            .filter((value) => typeof value === "string" && value.trim()),
        },
        recentVariants,
        performanceEvidence: itemPerformance,
        now: Date.now(),
      });
      const assessmentId = `${item.id}_v${versionNumber}`;
      batch.set(db.collection("socialContentQualityAssessments").doc(assessmentId), {
        ...assessment,
        sourceVersionId,
        versionId: source.versionId || `v${versionNumber}`,
        planId: source.planId || data.planId,
        campaignId: source.campaignId || data.campaignId || null,
        scheduledFor: source.scheduledFor || data.scheduledFor || null,
        assessedAt: FieldValue.serverTimestamp(),
        providerMutationsEnabled: false,
      }, {merge: false});
      assessments.push({id: assessmentId, ...assessment});
    }
    if (assessments.length) await batch.commit();
    return {
      assessedCount: assessments.length,
      needsAttentionCount: assessments.filter((item) =>
        ["weak", "needs_attention"].includes(item.qualityBand)).length,
      readyToPublishCount: assessments.filter((item) => item.readyToPublish === true).length,
      providerMutationsEnabled: false,
      externalPublishingEnabled: false,
    };
  },
);

exports.rateHistoricalSocialContentV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const requested = Number(request.data?.lookbackDays || 30);
    const lookbackDays = [7, 30, 90].includes(requested) ? requested :
      Math.max(1, Math.min(180, Math.round(requested)));
    const [snapshotDocs, capabilityDocs] = await Promise.all([
      db.collection("socialPerformanceSnapshots").where("businessUid", "==", business.uid)
        .limit(100).get(),
      db.collection("socialPostCapabilitySnapshots").where("businessUid", "==", business.uid)
        .limit(100).get(),
    ]);
    const cutoff = Date.now() - lookbackDays * 86400000;
    const capabilityMap = new Map(capabilityDocs.docs.map((doc) => {
      const data = doc.data();
      return [`${data.provider}_${data.providerPostId || data.contentItemId}`, data];
    }));
    const ratings = [];
    const batch = db.batch();
    for (const snapshot of snapshotDocs.docs) {
      const data = snapshot.data();
      const observedAt = isoValue(data.observedAt) || isoValue(data.createdAt);
      if (observedAt && new Date(observedAt).getTime() < cutoff) continue;
      const key = `${data.provider}_${data.providerPostId || data.contentItemId}`;
      const capabilityData = capabilityMap.get(key);
      const capability = capabilityData ? socialOperations.postCapabilityProjection({
        provider: data.provider,
        providerPostId: data.providerPostId,
        providerState: capabilityData.providerState,
        evidence: {...capabilityData, authoritative: true},
        observedAt: isoValue(capabilityData.observedAt) || Date.now(),
      }) : socialOperations.postCapabilityProjection({provider: data.provider,
        providerPostId: data.providerPostId});
      const rating = socialOperations.ratePastPost({businessUid: business.uid,
        provider: data.provider, contentItemId: data.contentItemId || snapshot.id,
        performanceSnapshot: data, capability, now: Date.now()});
      const ratingId = `${business.uid}_${snapshot.id}_${lookbackDays}`.slice(0, 1500);
      batch.set(db.collection("socialPastPostRatings").doc(ratingId), {
        ...rating,
        lookbackDays,
        ratedAt: FieldValue.serverTimestamp(),
      }, {merge: false});
      ratings.push(rating);
    }
    if (ratings.length) await batch.commit();
    return {lookbackDays, ratedCount: ratings.length,
      insufficientPerformanceEvidenceCount: ratings.filter((item) =>
        item.performanceEvidenceStatus === "insufficient_evidence").length,
      providerMutationsEnabled: false};
  },
);

exports.proposeScheduledSocialReplacementV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const contentItemId = readText(request.data?.contentItemId, 500);
    const itemSnapshot = await db.collection("socialContentItems").doc(contentItemId).get();
    const item = itemSnapshot.data();
    if (!item || item.businessUid !== business.uid) {
      throw new HttpsError("permission-denied", "This scheduled item is not available.");
    }
    if (["published", "canceled"].includes(item.status)) {
      throw new HttpsError("failed-precondition", "Only unpublished content can be replaced here.");
    }
    const sourceVersion = Number(item.currentVersion || 0);
    const sourceSnapshot = await db.collection("socialContentVersions")
      .doc(`${contentItemId}_v${sourceVersion}`).get();
    let proposal;
    try {
      proposal = socialOperations.replacementProposal({businessUid: business.uid,
        contentItemId, sourceVersion: sourceSnapshot.data(),
        replacementItem: request.data?.replacementItem,
        reason: request.data?.reason, now: Date.now()});
    } catch (_) {
      throw new HttpsError("invalid-argument", "Review the replacement draft and try again.");
    }
    await db.collection("socialContentReplacementProposals").doc(proposal.id).set({
      ...proposal.record,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    return {proposalId: proposal.id, status: proposal.record.status,
      sourceVersion, replacementVersion: proposal.record.replacementVersion.version,
      providerMutationRequested: false, externalPublishingEnabled: false};
  },
);

exports.ingestScaledCircleLaunchPlanV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    if (runtimeEnvironment() !== "staging" || !business.isAdmin) {
      throw new HttpsError("permission-denied", "This staging plan alignment is unavailable.");
    }
    const [connectionsSnapshot, existingPlan] = await Promise.all([
      db.collection("socialConnections").doc(business.uid).collection("providers").get(),
      db.collection("socialContentPlans").doc(scaledCircleLaunchPlan.PLAN_ID).get(),
    ]);
    const connections = new Map(connectionsSnapshot.docs.map((doc) => [doc.id, doc.data()]));
    const required = ["facebook", "instagram", "x", "youtube"];
    const normalizedHandle = (provider) => readText(connections.get(provider)?.handle, 180)
      .toLowerCase().replace(/^@/, "");
    if (required.some((provider) => connections.get(provider)?.status !== "connected_read_only") ||
        connections.get("facebook")?.providerAccountId !== "meta_page_1198660363339503" ||
        normalizedHandle("instagram") !== "scaledcircleapp" ||
        normalizedHandle("x") !== "scaledcircle" ||
        normalizedHandle("youtube") !== "scaledcircle") {
      throw new HttpsError("failed-precondition",
        "Confirm all four ScaledCircle read-only provider identities before aligning the plan.");
    }
    const migration = scaledCircleLaunchPlan.buildScaledCircleLaunchPlan({
      businessUid: business.uid, subscriptionPlanId: business.planId, now: Date.now(),
    });
    if (existingPlan.exists) {
      const existing = existingPlan.data() || {};
      if (existing.businessUid !== business.uid ||
          existing.contentHash !== migration.planRecord.contentHash) {
        throw new HttpsError("already-exists",
          "A different canonical record already uses this plan identity.");
      }
      return {canonicalBusinessId: business.uid, planId: migration.planId,
        planVersionId: migration.planVersionId, campaignId: migration.campaignId,
        itemCount: migration.content.length,
        platformVersionCount: migration.content.reduce((sum, entry) =>
          sum + entry.versionRecord.variants.length, 0), responseAssetCount: 0,
        reused: true, externalPublishingEnabled: false};
    }
    const batch = db.batch();
    batch.create(db.collection("socialContentPlans").doc(migration.planId), {
      ...migration.planRecord, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const entry of migration.content) {
      batch.create(db.collection("socialContentItems").doc(entry.itemId), {
        ...entry.itemRecord,
        scheduledFor: Timestamp.fromDate(new Date(entry.itemRecord.scheduledFor)),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      batch.create(db.collection("socialContentVersions").doc(entry.versionRecordId), {
        ...entry.versionRecord,
        scheduledFor: Timestamp.fromDate(new Date(entry.versionRecord.scheduledFor)),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return {canonicalBusinessId: business.uid, planId: migration.planId,
      planVersionId: migration.planVersionId, campaignId: migration.campaignId,
      itemCount: migration.content.length,
      platformVersionCount: migration.content.reduce((sum, entry) =>
        sum + entry.versionRecord.variants.length, 0), responseAssetCount: 0,
      reused: false, externalPublishingEnabled: false};
  },
);

exports.prepareFirstXPublishFoundationV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const planRef = db.collection("socialContentPlans").doc(xFirstPublish.PLAN_ID);
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionOneRef = db.collection("socialContentVersions")
      .doc(xFirstPublish.ORIGINAL_VERSION_DOCUMENT_ID);
    const versionTwoRef = db.collection("socialContentVersions")
      .doc(xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID);
    const versionTwoQualityRef = db.collection("socialContentQualityAssessments")
      .doc(xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID);
    const campaignRef = db.collection("campaigns").doc(xFirstPublish.CAMPAIGN_ID);
    const mediaRef = db.collection("socialMediaLibraries").doc(business.uid)
      .collection("items").doc(xFirstPublish.MEDIA_ID);
    const [plan, item, versionOne, versionTwo, versionTwoQuality, campaign, media] =
      await Promise.all([
        planRef.get(), itemRef.get(), versionOneRef.get(), versionTwoRef.get(),
        versionTwoQualityRef.get(), campaignRef.get(), mediaRef.get(),
    ]);
    if (!plan.exists || plan.data()?.businessUid !== business.uid ||
        plan.data()?.campaignId !== xFirstPublish.CAMPAIGN_ID ||
        !item.exists || item.data()?.businessUid !== business.uid ||
        item.data()?.planId !== xFirstPublish.PLAN_ID ||
        !versionOne.exists || versionOne.data()?.businessUid !== business.uid ||
        Number(versionOne.data()?.version) !== 1 ||
        xFirstPublish.weightedXLength(versionOne.data()?.variants?.[0]?.copy) <= 280 ||
        !versionTwo.exists || versionTwo.data()?.businessUid !== business.uid ||
        Number(versionTwo.data()?.version) !== xFirstPublish.PREVIOUS_VERSION_NUMBER ||
        versionTwo.data()?.supersedes !== xFirstPublish.ORIGINAL_VERSION_DOCUMENT_ID ||
        !versionTwoQuality.exists || versionTwoQuality.data()?.recommendation !== "improve" ||
        versionTwoQuality.data()?.readyToPublish === true) {
      throw new HttpsError("failed-precondition", "The canonical v1 plan lineage is unavailable.");
    }
    if (Number(item.data()?.currentVersion || 0) > xFirstPublish.VERSION_NUMBER) {
      throw new HttpsError("failed-precondition", "A newer immutable version already exists.");
    }
    if (campaign.exists && campaign.data()?.businessId !== business.uid) {
      throw new HttpsError("failed-precondition", "The campaign identity is already owned elsewhere.");
    }
    if (media.exists && (media.data()?.businessUid !== business.uid ||
        media.data()?.sha256 !== xFirstPublish.MEDIA_SHA256)) {
      throw new HttpsError("failed-precondition", "The immutable media identity is already in use.");
    }
    const batch = db.batch();
    if (!campaign.exists) {
      batch.create(campaignRef, {
        schemaVersion: "SocialCampaignAttributionV1",
        businessId: business.uid,
        campaignName: "ScaledCircle Maryland brand launch — September 2026",
        campaignType: "social_brand_launch",
        status: "draft",
        socialPlanId: xFirstPublish.PLAN_ID,
        providerMutationEnabled: false,
        financialAuthorityEnabled: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!media.exists) {
      batch.create(mediaRef, {
        schemaVersion: "SocialMediaArtifactV1",
        businessUid: business.uid,
        mediaId: xFirstPublish.MEDIA_ID,
        revisionId: xFirstPublish.MEDIA_REVISION_ID,
        status: "certified",
        source: "real_scaledcircle_ui_capture",
        publicUrl: xFirstPublish.MEDIA_URL,
        sha256: xFirstPublish.MEDIA_SHA256,
        byteLength: xFirstPublish.MEDIA_BYTES,
        width: xFirstPublish.MEDIA_WIDTH,
        height: xFirstPublish.MEDIA_HEIGHT,
        contentType: "image/png",
        privacyReview: "pass",
        visualQualityReview: "pass",
        containsCustomerPii: false,
        immutable: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!campaign.exists || !media.exists) await batch.commit();
    return {
      businessUid: business.uid,
      planId: xFirstPublish.PLAN_ID,
      campaignId: xFirstPublish.CAMPAIGN_ID,
      contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      sourceVersion: xFirstPublish.PREVIOUS_VERSION_ID,
      replacementVersion: xFirstPublish.VERSION_ID,
      supersessionReason: "SOCIAL_QUALITY_IMPROVEMENT",
      media: {mediaId: xFirstPublish.MEDIA_ID, revisionId: xFirstPublish.MEDIA_REVISION_ID,
        sha256: xFirstPublish.MEDIA_SHA256, width: xFirstPublish.MEDIA_WIDTH,
        height: xFirstPublish.MEDIA_HEIGHT, contentType: "image/png",
        privacyReview: "pass", visualQualityReview: "pass"},
      responseAssetRequest: {
        businessUid: business.uid,
        requestId: `${xFirstPublish.CONTENT_ITEM_ID}:${xFirstPublish.VERSION_ID}`,
        type: "tracked_link",
        label: "ScaledCircle X Smart Mapping — v3",
        destination: xFirstPublish.DESTINATION_URL,
        source: "social",
        sourceDetail: `${xFirstPublish.CONTENT_ITEM_ID}:${xFirstPublish.VERSION_ID}`,
        campaignId: xFirstPublish.CAMPAIGN_ID,
        creativeVersion: xFirstPublish.VERSION_ID,
      },
      providerMutations: 0,
    };
  },
);

exports.createFirstXPublishVersionV2 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const responseAssetId = readText(request.data?.responseAssetId, 180);
    const assetSnapshot = await db.collection("responseAssets").doc(responseAssetId).get();
    const asset = assetSnapshot.data();
    const trackedUrl = firstXTrackedUrl(asset);
    if (!asset || asset.businessUid !== business.uid || asset.status !== "active" ||
        asset.type !== "tracked_link" || asset.destination !== xFirstPublish.DESTINATION_URL ||
        asset.attribution?.campaignId !== xFirstPublish.CAMPAIGN_ID ||
        asset.attribution?.source !== "social" ||
        asset.attribution?.sourceDetail !==
          `${xFirstPublish.CONTENT_ITEM_ID}:${xFirstPublish.PREVIOUS_VERSION_ID}` ||
        asset.attribution?.creativeVersion !== xFirstPublish.PREVIOUS_VERSION_ID || !trackedUrl) {
      throw new HttpsError("failed-precondition", "The exact tracked response asset is unavailable.");
    }
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionRef = db.collection("socialContentVersions")
      .doc(xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID);
    const proposed = xFirstPublish.versionTwoRecord({businessUid: business.uid,
      responseAssetId, trackedUrl, now: Date.now()});
    const result = await db.runTransaction(async (transaction) => {
      const [itemSnapshot, existingVersion] = await Promise.all([
        transaction.get(itemRef), transaction.get(versionRef),
      ]);
      const item = itemSnapshot.data();
      if (!item || item.businessUid !== business.uid || item.planId !== xFirstPublish.PLAN_ID ||
          Number(item.currentVersion || 0) > xFirstPublish.PREVIOUS_VERSION_NUMBER) {
        throw new Error("x_content_item_lineage_mismatch");
      }
      if (existingVersion.exists) {
        if (existingVersion.data()?.contentHash !== proposed.contentHash ||
            existingVersion.data()?.supersedes !== xFirstPublish.ORIGINAL_VERSION_DOCUMENT_ID) {
          throw new Error("x_existing_version_mismatch");
        }
        return {reused: true, record: existingVersion.data()};
      }
      transaction.create(versionRef, {...proposed,
        createdAt: FieldValue.serverTimestamp()});
      transaction.update(itemRef, {
        currentVersion: xFirstPublish.PREVIOUS_VERSION_NUMBER,
        currentVersionId: xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID,
        status: "ready_for_review",
        approvedVersion: null,
        supersededVersion: 1,
        supersessionReason: "X_CHARACTER_LIMIT",
        mediaAssetId: xFirstPublish.MEDIA_ID,
        responseAssetId,
        scheduledFor: Timestamp.fromDate(new Date(xFirstPublish.SCHEDULED_FOR)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {reused: false, record: proposed};
    });
    return {
      contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      versionId: xFirstPublish.PREVIOUS_VERSION_ID,
      version: xFirstPublish.PREVIOUS_VERSION_NUMBER,
      contentHash: result.record.contentHash,
      supersedes: xFirstPublish.ORIGINAL_VERSION_DOCUMENT_ID,
      supersessionReason: "X_CHARACTER_LIMIT",
      weightedCharacters: xFirstPublish.weightedXLength(result.record.variants[0].renderedCopy),
      responseAssetId,
      trackedUrl,
      mediaId: xFirstPublish.MEDIA_ID,
      reused: result.reused,
      providerMutations: 0,
    };
  },
);

exports.createFirstXPublishVersionV3 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const responseAssetId = readText(request.data?.responseAssetId, 180);
    const assetSnapshot = await db.collection("responseAssets").doc(responseAssetId).get();
    const asset = assetSnapshot.data();
    const trackedUrl = firstXTrackedUrl(asset);
    if (!asset || asset.businessUid !== business.uid || asset.status !== "active" ||
        asset.type !== "tracked_link" || asset.destination !== xFirstPublish.DESTINATION_URL ||
        asset.attribution?.campaignId !== xFirstPublish.CAMPAIGN_ID ||
        asset.attribution?.source !== "social" ||
        asset.attribution?.sourceDetail !== `${xFirstPublish.CONTENT_ITEM_ID}:${xFirstPublish.VERSION_ID}` ||
        asset.attribution?.creativeVersion !== xFirstPublish.VERSION_ID || !trackedUrl) {
      throw new HttpsError("failed-precondition", "The exact tracked response asset is unavailable.");
    }
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionTwoRef = db.collection("socialContentVersions")
      .doc(xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID);
    const versionTwoQualityRef = db.collection("socialContentQualityAssessments")
      .doc(xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID);
    const versionRef = db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const proposed = xFirstPublish.versionRecord({businessUid: business.uid,
      responseAssetId, trackedUrl, now: Date.now()});
    const result = await db.runTransaction(async (transaction) => {
      const [itemSnapshot, versionTwo, versionTwoQuality, existingVersion] = await Promise.all([
        transaction.get(itemRef), transaction.get(versionTwoRef),
        transaction.get(versionTwoQualityRef), transaction.get(versionRef),
      ]);
      const item = itemSnapshot.data();
      const currentVersion = Number(item?.currentVersion || 0);
      if (!item || item.businessUid !== business.uid || item.planId !== xFirstPublish.PLAN_ID ||
          currentVersion < xFirstPublish.PREVIOUS_VERSION_NUMBER ||
          currentVersion > xFirstPublish.VERSION_NUMBER || !versionTwo.exists ||
          versionTwo.data()?.businessUid !== business.uid ||
          Number(versionTwo.data()?.version) !== xFirstPublish.PREVIOUS_VERSION_NUMBER ||
          versionTwo.data()?.supersedes !== xFirstPublish.ORIGINAL_VERSION_DOCUMENT_ID ||
          !versionTwoQuality.exists || versionTwoQuality.data()?.recommendation !== "improve" ||
          versionTwoQuality.data()?.readyToPublish === true) {
        throw new Error("x_content_item_quality_lineage_mismatch");
      }
      if (existingVersion.exists) {
        if (existingVersion.data()?.contentHash !== proposed.contentHash ||
            existingVersion.data()?.supersedes !== xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID) {
          throw new Error("x_existing_version_mismatch");
        }
        return {reused: true, record: existingVersion.data()};
      }
      transaction.create(versionRef, {...proposed,
        createdAt: FieldValue.serverTimestamp()});
      transaction.update(itemRef, {
        currentVersion: xFirstPublish.VERSION_NUMBER,
        currentVersionId: xFirstPublish.VERSION_DOCUMENT_ID,
        status: "ready_for_review",
        approvedVersion: null,
        supersededVersion: xFirstPublish.PREVIOUS_VERSION_NUMBER,
        supersessionReason: "SOCIAL_QUALITY_IMPROVEMENT",
        mediaAssetId: xFirstPublish.MEDIA_ID,
        responseAssetId,
        scheduledFor: Timestamp.fromDate(new Date(xFirstPublish.SCHEDULED_FOR)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {reused: false, record: proposed};
    });
    return {
      contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      versionId: xFirstPublish.VERSION_ID,
      version: xFirstPublish.VERSION_NUMBER,
      contentHash: result.record.contentHash,
      supersedes: xFirstPublish.PREVIOUS_VERSION_DOCUMENT_ID,
      supersessionReason: "SOCIAL_QUALITY_IMPROVEMENT",
      weightedCharacters: xFirstPublish.weightedXLength(result.record.variants[0].renderedCopy),
      responseAssetId,
      trackedUrl,
      mediaId: xFirstPublish.MEDIA_ID,
      reused: result.reused,
      providerMutations: 0,
    };
  },
);

exports.getFirstXPublishCertificationV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionRef = db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const qualityRef = db.collection("socialContentQualityAssessments")
      .doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const [item, version, quality, connection, jobs, repair] = await Promise.all([
      itemRef.get(), versionRef.get(), qualityRef.get(), connectionRef.get(),
      db.collection("socialPublishingJobs")
        .where("businessUid", "==", business.uid).limit(20).get(),
      db.collection("socialPublishedPostRepairs").doc("first_x_public_origin_repair_v1").get(),
    ]);
    const versionData = version.data();
    const responseAssetId = readText(versionData?.variants?.[0]?.responseAssetId, 180);
    const [asset, approval] = await Promise.all([
      responseAssetId ? db.collection("responseAssets").doc(responseAssetId).get() : null,
      versionData?.approvalId ? db.collection("socialExternalApprovals")
        .doc(versionData.approvalId).get() : null,
    ]);
    const job = jobs.docs.find((doc) => doc.data()?.contentItemId === xFirstPublish.CONTENT_ITEM_ID &&
      Number(doc.data()?.version) === xFirstPublish.VERSION_NUMBER);
    const connectionProjection = socialOperations.connectionProjection({provider: "x",
      ...(connection.data() || {})});
    return {
      contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      versionId: xFirstPublish.VERSION_ID,
      itemStatus: item.data()?.status || "not_prepared",
      versionStatus: versionData?.status || "not_created",
      weightedCharacters: versionData ?
        xFirstPublish.weightedXLength(versionData.variants?.[0]?.renderedCopy) : null,
      media: {mediaId: xFirstPublish.MEDIA_ID, sha256: xFirstPublish.MEDIA_SHA256,
        width: xFirstPublish.MEDIA_WIDTH, height: xFirstPublish.MEDIA_HEIGHT,
        privacyReview: "pass", visualQualityReview: "pass"},
      responseAsset: asset?.exists ? {responseAssetId, trackedUrl: firstXTrackedUrl(asset.data()),
        destination: asset.data()?.destination} : null,
      quality: quality.exists ? {score: quality.data()?.score, qualityBand: quality.data()?.qualityBand,
        recommendation: quality.data()?.recommendation,
        readyToPublish: quality.data()?.readyToPublish === true} : null,
      founderPublishApprovalRequired: versionData?.founderPublicationApprovalRequired === true,
      founderPublishApprovalRecorded: versionData?.founderPublicationApproved === true,
      connection: {status: connectionProjection.status,
        accountDisplayName: connectionProjection.accountDisplayName,
        handle: connectionProjection.handle,
        capabilities: connectionProjection.capabilities,
        pendingAttemptId: connectionProjection.pendingAttemptId},
      approval: approval?.exists ? {approvalId: approval.id, status: approval.data()?.status,
        approvalHash: approval.data()?.approvalHash} : null,
      publishJob: job ? {publishJobId: job.id, status: job.data()?.status,
        providerPostId: job.data()?.providerPostId || null,
        providerPostUrl: job.data()?.providerPostUrl || null,
        scheduledFor: isoValue(job.data()?.scheduledFor) || job.data()?.scheduledFor || null,
        attemptCount: Number(job.data()?.attemptCount || 0),
        reconciliationRequired: job.data()?.reconciliationRequired === true} : null,
      repair: repair.exists ? {repairId: repair.id, status: repair.data()?.status,
        productionPublicUrl: repair.data()?.productionPublicUrl || null,
        originalProviderPostId: repair.data()?.originalProviderPostId || null,
        replacementProviderPostId: repair.data()?.replacementProviderPostId || null,
        manualDeletionEvidenceId: repair.data()?.manualDeletionEvidenceId || null,
        replacementReceiptId: repair.data()?.replacementReceiptId || null,
        providerDeleteAttemptCount: Number(repair.data()?.providerDeleteAttemptCount || 0),
        replacementAttemptCount: Number(repair.data()?.replacementAttemptCount || 0)} : null,
      externalPublishingEnabled: false,
      narrowCertificationOnly: true,
    };
  },
);

exports.recordFirstXFounderApprovalV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionRef = db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const qualityRef = db.collection("socialContentQualityAssessments")
      .doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const [item, version, quality, health] = await Promise.all([
      itemRef.get(), versionRef.get(), qualityRef.get(),
      db.collection("agentHealth").doc(business.uid).get(),
    ]);
    const versionData = version.data();
    const responseAssetId = readText(versionData?.variants?.[0]?.responseAssetId, 180);
    const assetSnapshot = responseAssetId ?
      await db.collection("responseAssets").doc(responseAssetId).get() : null;
    const asset = assetSnapshot?.data();
    const responseAsset = asset ? {responseAssetId, ...asset, trackedUrl: firstXTrackedUrl(asset)} : null;
    if (!item.exists || item.data()?.businessUid !== business.uid ||
        Number(item.data()?.currentVersion) !== xFirstPublish.VERSION_NUMBER ||
        !versionData || health.data()?.killSwitchActive !== true ||
        health.data()?.externalActionsEnabled !== false) {
      throw new HttpsError("failed-precondition", "The bounded publish safety state is unavailable.");
    }
    let approval;
    try {
      approval = xFirstPublish.approvalRecord({version: versionData,
        qualityAssessment: quality.data(), responseAsset, approvedByUid: business.uid,
        now: Date.now()});
    } catch (_) {
      throw new HttpsError("failed-precondition", "The exact content approval gate did not pass.");
    }
    const intentRef = db.collection("socialExternalApprovalIntents").doc(approval.id);
    const result = await db.runTransaction(async (transaction) => {
      const [currentVersion, existingIntent] = await Promise.all([
        transaction.get(versionRef), transaction.get(intentRef),
      ]);
      if (existingIntent.exists) {
        if (existingIntent.data()?.approvalHash !== approval.record.approvalHash) {
          throw new Error("x_founder_approval_replay_mismatch");
        }
        return {reused: true};
      }
      if (currentVersion.data()?.founderPublicationApproved === true) {
        throw new Error("x_founder_approval_state_mismatch");
      }
      transaction.create(intentRef, {...approval.record,
        status: "approved_for_permission_upgrade", externalExecutionAllowed: false,
        providerMutationAuthorized: false, createdAt: FieldValue.serverTimestamp(),
        approvedAt: FieldValue.serverTimestamp()});
      transaction.update(versionRef, {founderPublicationApproved: true,
        founderPublicationApprovalIntentId: approval.id,
        founderPublicationApprovedAt: FieldValue.serverTimestamp()});
      return {reused: false};
    });
    return {approvalIntentId: approval.id, approvalHash: approval.record.approvalHash,
      status: "approved_for_permission_upgrade", reused: result.reused,
      externalExecutionAllowed: false, providerMutations: 0,
      globalAgentKillSwitchActive: true};
  },
);

exports.createFirstXPublishApprovalV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const itemRef = db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID);
    const versionRef = db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const qualityRef = db.collection("socialContentQualityAssessments")
      .doc(xFirstPublish.VERSION_DOCUMENT_ID);
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const [item, version, quality, connection, health] = await Promise.all([
      itemRef.get(), versionRef.get(), qualityRef.get(), connectionRef.get(),
      db.collection("agentHealth").doc(business.uid).get(),
    ]);
    const versionData = version.data();
    const responseAssetId = readText(versionData?.variants?.[0]?.responseAssetId, 180);
    const assetSnapshot = responseAssetId ?
      await db.collection("responseAssets").doc(responseAssetId).get() : null;
    const asset = assetSnapshot?.data();
    const responseAsset = asset ? {responseAssetId, ...asset, trackedUrl: firstXTrackedUrl(asset)} : null;
    try {
      xFirstPublish.assertWriteConnection(connection.data());
    } catch (_) {
      throw new HttpsError("failed-precondition", "Reconnect the exact ScaledCircle X account first.");
    }
    if (!item.exists || item.data()?.businessUid !== business.uid ||
        Number(item.data()?.currentVersion) !== xFirstPublish.VERSION_NUMBER ||
        !versionData || health.data()?.killSwitchActive !== true ||
        health.data()?.externalActionsEnabled !== false) {
      throw new HttpsError("failed-precondition", "The bounded publish safety state is unavailable.");
    }
    let approval;
    try {
      approval = xFirstPublish.approvalRecord({version: versionData,
        qualityAssessment: quality.data(), responseAsset, approvedByUid: business.uid,
        now: Date.now()});
    } catch (_) {
      throw new HttpsError("failed-precondition", "The exact content approval gate did not pass.");
    }
    const approvedVersion = socialOperations.approveContentVersion({businessUid: business.uid,
      record: versionData, version: xFirstPublish.VERSION_NUMBER, now: Date.now()});
    const publishJob = socialOperations.publishJob({businessUid: business.uid,
      contentItemId: xFirstPublish.CONTENT_ITEM_ID, versionRecord: approvedVersion,
      provider: "x", scheduledFor: xFirstPublish.SCHEDULED_FOR,
      connection: connection.data(), now: Date.now()});
    const approvalRef = db.collection("socialExternalApprovals").doc(approval.id);
    const jobRef = db.collection("socialPublishingJobs").doc(publishJob.id);
    const result = await db.runTransaction(async (transaction) => {
      const [existingApproval, existingJob] = await Promise.all([
        transaction.get(approvalRef), transaction.get(jobRef),
      ]);
      if (existingApproval.exists || existingJob.exists) {
        if (!existingApproval.exists || !existingJob.exists ||
            existingApproval.data()?.approvalHash !== approval.record.approvalHash ||
            existingJob.data()?.approvalId !== approval.id) {
          throw new Error("x_approval_replay_mismatch");
        }
        return {reused: true};
      }
      transaction.create(approvalRef, {...approval.record,
        approvedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()});
      transaction.set(versionRef, {...approvedVersion, approvalId: approval.id,
        approvedAt: FieldValue.serverTimestamp(), createdAt: versionData.createdAt}, {merge: false});
      transaction.update(itemRef, {status: "scheduled",
        approvedVersion: xFirstPublish.VERSION_NUMBER, approvalId: approval.id,
        scheduledFor: Timestamp.fromDate(new Date(xFirstPublish.SCHEDULED_FOR)),
        updatedAt: FieldValue.serverTimestamp()});
      transaction.create(jobRef, {...publishJob.record,
        approvalId: approval.id, approvalHash: approval.record.approvalHash,
        responseAssetId, mediaAssetId: xFirstPublish.MEDIA_ID,
        mediaSha256: xFirstPublish.MEDIA_SHA256, renderedCopyHash:
          xFirstPublish.digest(versionData.variants[0].renderedCopy),
        executionAuthority: "single_certified_item_only",
        globalAgentKillSwitchRemainsActive: true,
        externalExecutionAllowed: true, providerMutationCount: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      return {reused: false};
    });
    return {approvalId: approval.id, approvalHash: approval.record.approvalHash,
      publishJobId: publishJob.id, scheduledFor: xFirstPublish.SCHEDULED_FOR,
      status: "scheduled", reused: result.reused, globalAgentKillSwitchActive: true,
      externalExecutionScope: "one_exact_x_image_post"};
  },
);

async function firstXCredential(businessUid, connection) {
  const credential = (await db.collection("socialConnectionCredentials")
    .doc(connection.credentialId).get()).data();
  if (!credential || credential.businessUid !== businessUid || credential.provider !== "x") {
    throw new Error("x_connection_credential_missing");
  }
  const account = socialOAuth.decryptJson(credential.accountEnvelope,
    socialOAuthEncryptionKey.value(), `${businessUid}:x:${connection.credentialId}`);
  if (account.accountId !== xFirstPublish.EXPECTED_X_ID) throw new Error("x_account_mismatch");
  const tokenAad = `${businessUid}:x:${account.accountId}`;
  const tokens = socialOAuth.decryptJson(credential.tokenEnvelope,
    socialOAuthEncryptionKey.value(), tokenAad);
  return {credential, account, tokenAad, tokens};
}

exports.executeFirstXPublishV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, timeoutSeconds: 60,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const publishJobId = readText(request.data?.publishJobId, 180);
    const jobRef = db.collection("socialPublishingJobs").doc(publishJobId);
    const jobSnapshot = await jobRef.get();
    const job = jobSnapshot.data();
    if (!job || job.businessUid !== business.uid ||
        job.contentItemId !== xFirstPublish.CONTENT_ITEM_ID ||
        Number(job.version) !== xFirstPublish.VERSION_NUMBER || job.provider !== "x" ||
        job.mediaSha256 !== xFirstPublish.MEDIA_SHA256 ||
        job.executionAuthority !== "single_certified_item_only") {
      throw new HttpsError("failed-precondition", "The exact publish job is unavailable.");
    }
    if (job.status === "completed") return {publishJobId, status: "completed",
      providerPostId: job.providerPostId, providerPostUrl: job.providerPostUrl,
      idempotentReplay: true};
    if (job.status !== "scheduled" || Number(job.attemptCount || 0) !== 0 ||
        new Date(job.scheduledFor).getTime() > Date.now() + 30000) {
      throw new HttpsError("failed-precondition", "This approved post is not ready to publish.");
    }
    const [version, approval, asset, media, connection, health, configSnapshot] = await Promise.all([
      db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID).get(),
      db.collection("socialExternalApprovals").doc(job.approvalId).get(),
      db.collection("responseAssets").doc(job.responseAssetId).get(),
      db.collection("socialMediaLibraries").doc(business.uid).collection("items")
        .doc(xFirstPublish.MEDIA_ID).get(),
      db.collection("socialConnections").doc(business.uid).collection("providers").doc("x").get(),
      db.collection("agentHealth").doc(business.uid).get(),
      providerConfigRef("x", "staging").get(),
    ]);
    const connectionData = connection.data();
    try { xFirstPublish.assertWriteConnection(connectionData); } catch (_) {
      throw new HttpsError("failed-precondition", "The exact X publishing connection is unavailable.");
    }
    const trackedUrl = firstXTrackedUrl(asset.data());
    const renderedCopy = xFirstPublish.renderPostText(trackedUrl);
    if (!version.exists || version.data()?.approvalId !== job.approvalId ||
        version.data()?.contentHash !== approval.data()?.contentHash ||
        approval.data()?.approvalHash !== job.approvalHash || approval.data()?.status !== "approved" ||
        approval.data()?.mediaSha256 !== xFirstPublish.MEDIA_SHA256 ||
        approval.data()?.responseAssetId !== job.responseAssetId ||
        media.data()?.sha256 !== xFirstPublish.MEDIA_SHA256 ||
        media.data()?.privacyReview !== "pass" || media.data()?.visualQualityReview !== "pass" ||
        health.data()?.killSwitchActive !== true || health.data()?.externalActionsEnabled !== false ||
        xFirstPublish.digest(renderedCopy) !== job.renderedCopyHash) {
      throw new HttpsError("failed-precondition", "The exact approval or safety binding changed.");
    }
    const claimed = await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(jobRef)).data();
      if (current?.status === "completed") return false;
      if (current?.status !== "scheduled" || Number(current?.attemptCount || 0) !== 0) {
        throw new Error("x_publish_already_claimed");
      }
      transaction.update(jobRef, {status: "publishing", attemptCount: 1,
        providerCreateStartedAtMillis: Date.now(), reconciliationRequired: true,
        updatedAt: FieldValue.serverTimestamp()});
      return true;
    });
    if (!claimed) return {publishJobId, status: "completed", idempotentReplay: true};
    try {
      const auth = await firstXCredential(business.uid, connectionData);
      const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
      const tokens = await socialOAuth.refreshTokens({provider: "x", tokens: auth.tokens,
        config, clientSecret: providerSecretBinding("x").secret.value()});
      const mediaResponse = await fetch(xFirstPublish.MEDIA_URL, {cache: "no-store"});
      if (!mediaResponse.ok) throw new Error("x_media_source_unavailable");
      const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());
      xFirstPublish.assertMedia(mediaBytes);
      const uploaded = await xFirstPublish.uploadMedia({accessToken: tokens.accessToken,
        bytes: mediaBytes});
      await jobRef.update({providerMediaId: uploaded.mediaId,
        providerMediaKey: uploaded.mediaKey, mediaUploadedAt: FieldValue.serverTimestamp(),
        providerMutationCount: 1, updatedAt: FieldValue.serverTimestamp()});
      const created = await xFirstPublish.createPost({accessToken: tokens.accessToken,
        renderedCopy, mediaId: uploaded.mediaId});
      const receiptId = `social_receipt_${xFirstPublish.digest({publishJobId,
        providerPostId: created.providerPostId})}`;
      const receiptRef = db.collection("socialProviderReceipts").doc(receiptId);
      const batch = db.batch();
      batch.create(receiptRef, {schemaVersion: "SocialProviderReceiptV1",
        businessUid: business.uid, provider: "x", publishJobId,
        contentItemId: xFirstPublish.CONTENT_ITEM_ID, contentVersion: xFirstPublish.VERSION_NUMBER,
        providerPostId: created.providerPostId, providerPostUrl: created.providerPostUrl,
        providerTextHash: created.providerTextHash, mediaAssetId: xFirstPublish.MEDIA_ID,
        mediaSha256: xFirstPublish.MEDIA_SHA256, responseAssetId: job.responseAssetId,
        status: "accepted", immutable: true, createdAt: FieldValue.serverTimestamp()});
      batch.update(jobRef, {status: "completed", providerPostId: created.providerPostId,
        providerPostUrl: created.providerPostUrl, providerReceiptId: receiptId,
        providerMutationCount: 2, reconciliationRequired: false,
        providerAcceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      batch.update(db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID), {
        status: "published", providerPostId: created.providerPostId,
        publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      if (tokens.refreshed) {
        const stored = {...tokens}; delete stored.refreshed;
        batch.update(db.collection("socialConnectionCredentials").doc(connectionData.credentialId), {
          tokenEnvelope: socialOAuth.encryptJson(stored, socialOAuthEncryptionKey.value(),
            auth.tokenAad), expiresAtMillis: tokens.expiresIn ?
            Date.now() + tokens.expiresIn * 1000 : null,
          updatedAt: FieldValue.serverTimestamp()});
      }
      await batch.commit();
      return {publishJobId, status: "completed", providerPostId: created.providerPostId,
        providerPostUrl: created.providerPostUrl, providerReceiptId: receiptId,
        idempotentReplay: false, providerMutationCount: 2};
    } catch (error) {
      await jobRef.set({status: "unknown_provider_outcome", reconciliationRequired: true,
        safeFailure: readText(error?.message || error, 120),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      throw new HttpsError("aborted",
        "X returned an uncertain outcome. ScaledCircle will reconcile before any further action.");
    }
  },
);

exports.reconcileFirstXPublishV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, timeoutSeconds: 30,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const publishJobId = readText(request.data?.publishJobId, 180);
    const jobRef = db.collection("socialPublishingJobs").doc(publishJobId);
    const job = (await jobRef.get()).data();
    if (!job || job.businessUid !== business.uid ||
        job.contentItemId !== xFirstPublish.CONTENT_ITEM_ID ||
        job.status !== "unknown_provider_outcome" || Number(job.attemptCount) !== 1) {
      throw new HttpsError("failed-precondition", "This publish job does not require reconciliation.");
    }
    const [connection, configSnapshot] = await Promise.all([
      db.collection("socialConnections").doc(business.uid).collection("providers").doc("x").get(),
      providerConfigRef("x", "staging").get(),
    ]);
    const connectionData = connection.data();
    xFirstPublish.assertWriteConnection(connectionData);
    const auth = await firstXCredential(business.uid, connectionData);
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const tokens = await socialOAuth.refreshTokens({provider: "x", tokens: auth.tokens,
      config, clientSecret: providerSecretBinding("x").secret.value()});
    const result = await xFirstPublish.lookupPost({accessToken: tokens.accessToken,
      providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID});
    if (result.status !== "found") return {publishJobId,
      status: "unknown_provider_outcome", retryAuthorized: false,
      reconciliationRequired: true};
    const receiptId = `social_receipt_${xFirstPublish.digest({publishJobId,
      providerPostId: result.providerPostId})}`;
    const batch = db.batch();
    batch.set(db.collection("socialProviderReceipts").doc(receiptId), {
      schemaVersion: "SocialProviderReceiptV1", businessUid: business.uid,
      provider: "x", publishJobId, contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      contentVersion: xFirstPublish.VERSION_NUMBER, providerPostId: result.providerPostId,
      providerPostUrl: result.providerPostUrl, providerCreatedAt: result.createdAt,
      providerTextHash: xFirstPublish.digest(result.text), status: "reconciled_known_post",
      immutable: true, createdAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.update(jobRef, {status: "completed", providerPostId: result.providerPostId,
      providerPostUrl: result.providerPostUrl, providerReceiptId: receiptId,
      reconciliationRequired: false, reconciledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    await batch.commit();
    return {publishJobId, status: "completed", providerPostId: result.providerPostId,
      providerPostUrl: result.providerPostUrl, providerReceiptId: receiptId,
      reconciled: true, duplicateCreateAttempted: false};
  },
);

const FIRST_X_REPAIR_ID = "first_x_public_origin_repair_v1";

exports.registerFirstXProductionResponseAssetV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    let asset;
    try {
      asset = xFirstPublish.assertProductionResponseAsset(request.data || {});
    } catch (_) {
      throw new HttpsError("invalid-argument", "The production response link is invalid.");
    }
    const job = (await db.collection("socialPublishingJobs")
      .doc(xFirstPublish.expectedJobId()).get()).data();
    if (!job || Number(job.attemptCount) !== 1 || Number(job.providerCreateAttemptCount || 1) !== 1) {
      throw new HttpsError("failed-precondition", "The original X publish history is invalid.");
    }
    const repairRef = db.collection("socialPublishedPostRepairs").doc(FIRST_X_REPAIR_ID);
    const record = {schemaVersion: "SocialPublishedPostRepairV1", businessUid: business.uid,
      provider: "x", contentItemId: xFirstPublish.CONTENT_ITEM_ID,
      contentVersion: xFirstPublish.VERSION_NUMBER,
      originalProviderPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      originalResponseAssetId: job.responseAssetId,
      originalRenderedUrl: xFirstPublish.DEFECTIVE_TRACKED_URL,
      defectReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
      originalDeletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
      productionResponseAssetId: asset.responseAssetId,
      productionPublicCode: asset.publicCode, productionPublicUrl: asset.publicUrl,
      destination: xFirstPublish.DESTINATION_URL, campaignId: xFirstPublish.CAMPAIGN_ID,
      status: "awaiting_manual_deletion_verification", providerDeleteAttemptCount: 0,
      replacementAttemptCount: 0,
      providerCreateAttemptsOriginal: 1, providerCreateAttemptsReplacement: 0,
      immutableProductionBinding: true, updatedAt: FieldValue.serverTimestamp()};
    const result = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(repairRef);
      if (existing.exists) {
        const current = existing.data();
        if (current.productionResponseAssetId !== asset.responseAssetId ||
            current.productionPublicUrl !== asset.publicUrl) {
          throw new Error("x_repair_asset_replay_mismatch");
        }
        return {reused: true};
      }
      transaction.create(repairRef, {...record, createdAt: FieldValue.serverTimestamp()});
      return {reused: false};
    });
    return {repairId: FIRST_X_REPAIR_ID, status: "awaiting_manual_deletion_verification", ...asset,
      destination: xFirstPublish.DESTINATION_URL, reused: result.reused};
  },
);

exports.reconcileFounderManualFirstXDeletionV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, timeoutSeconds: 30,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const repairRef = db.collection("socialPublishedPostRepairs").doc(FIRST_X_REPAIR_ID);
    const repair = (await repairRef.get()).data();
    if (!repair || repair.businessUid !== business.uid ||
        repair.status !== "awaiting_manual_deletion_verification" ||
        Number(repair.providerDeleteAttemptCount || 0) !== 0 ||
        repair.originalProviderPostId !== xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID) {
      throw new HttpsError("failed-precondition", "The manual X deletion is not ready to verify.");
    }
    const connectionData = (await db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x").get()).data();
    xFirstPublish.assertWriteConnection(connectionData);
    const auth = await firstXCredential(business.uid, connectionData);
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const tokens = await socialOAuth.refreshTokens({provider: "x", tokens: auth.tokens,
      config, clientSecret: providerSecretBinding("x").secret.value()});
    const lookup = await xFirstPublish.lookupPost({accessToken: tokens.accessToken,
      providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID});
    if (lookup.status === "found") {
      throw new HttpsError("failed-precondition", "The Founder-deleted X post is still public.");
    }
    const evidenceId = `social_manual_deletion_${xFirstPublish.digest({
      repairId: FIRST_X_REPAIR_ID, providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      source: xFirstPublish.ORIGINAL_DELETION_SOURCE})}`;
    const jobRef = db.collection("socialPublishingJobs").doc(xFirstPublish.expectedJobId());
    const batch = db.batch();
    batch.set(db.collection("socialProviderReceipts").doc(evidenceId), {
      schemaVersion: "SocialProviderManualDeletionEvidenceV1", businessUid: business.uid,
      provider: "x", repairId: FIRST_X_REPAIR_ID,
      providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      defectReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
      deletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
      providerDeleteReceipt: null, providerLookupState: "not_found",
      immutable: true, createdAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.update(repairRef, {status: "manual_deletion_confirmed",
      manualDeletionEvidenceId: evidenceId, providerDeleteAttemptCount: 0,
      founderManualDeletionVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    batch.update(jobRef, {status: "completed",
      providerState: "founder_manually_deleted_defect",
      originalProviderPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      defectReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
      deletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
      providerDeleteAttemptCount: 0, manualDeletionEvidenceId: evidenceId,
      reconciliationRequired: false, reconciledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    await batch.commit();
    return {repairId: FIRST_X_REPAIR_ID, status: "manual_deletion_confirmed",
      providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      manualDeletionEvidenceId: evidenceId, providerDeleteAttemptCount: 0,
      providerDeleteReceipt: null, replacementAuthorized: true};
  },
);

exports.createFirstXReplacementV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, timeoutSeconds: 30,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const repairRef = db.collection("socialPublishedPostRepairs").doc(FIRST_X_REPAIR_ID);
    const jobRef = db.collection("socialPublishingJobs").doc(xFirstPublish.expectedJobId());
    const [repairSnapshot, jobSnapshot, connectionSnapshot] = await Promise.all([
      repairRef.get(), jobRef.get(), db.collection("socialConnections").doc(business.uid)
        .collection("providers").doc("x").get(),
    ]);
    const repair = repairSnapshot.data();
    const job = jobSnapshot.data();
    if (!repair || repair.status !== "manual_deletion_confirmed" ||
        Number(repair.replacementAttemptCount || 0) !== 0 ||
        !job?.providerMediaId || Number(job.attemptCount) !== 1) {
      throw new HttpsError("failed-precondition", "The exact X replacement is not ready.");
    }
    const asset = xFirstPublish.assertProductionResponseAsset({
      responseAssetId: repair.productionResponseAssetId,
      publicCode: repair.productionPublicCode, publicUrl: repair.productionPublicUrl});
    const renderedCopy = xFirstPublish.renderPostText(asset.publicUrl);
    const connectionData = connectionSnapshot.data();
    xFirstPublish.assertWriteConnection(connectionData);
    await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(repairRef)).data();
      if (current?.status !== "manual_deletion_confirmed" ||
          Number(current?.replacementAttemptCount || 0) !== 0) {
        throw new Error("x_replacement_already_claimed");
      }
      transaction.update(repairRef, {status: "replacement_creating", replacementAttemptCount: 1,
        providerCreateAttemptsReplacement: 1,
        replacementCreateStartedAtMillis: Date.now(),
        replacementRenderedCopyHash: xFirstPublish.digest(renderedCopy),
        updatedAt: FieldValue.serverTimestamp()});
    });
    try {
      const auth = await firstXCredential(business.uid, connectionData);
      const configSnapshot = await providerConfigRef("x", "staging").get();
      const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
      const tokens = await socialOAuth.refreshTokens({provider: "x", tokens: auth.tokens,
        config, clientSecret: providerSecretBinding("x").secret.value()});
      const created = await xFirstPublish.createReplacementPost({accessToken: tokens.accessToken,
        renderedCopy, mediaId: job.providerMediaId});
      const receiptId = `social_replacement_receipt_${xFirstPublish.digest({
        repairId: FIRST_X_REPAIR_ID, providerPostId: created.providerPostId})}`;
      const batch = db.batch();
      batch.set(db.collection("socialProviderReceipts").doc(receiptId), {
        schemaVersion: "SocialProviderReplacementReceiptV1", businessUid: business.uid,
        provider: "x", repairId: FIRST_X_REPAIR_ID,
        providerPostId: created.providerPostId, providerPostUrl: created.providerPostUrl,
        providerTextHash: created.providerTextHash,
        replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
        replacementOfDefect: xFirstPublish.ORIGINAL_DEFECT_REASON,
        originalDeletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
        mediaAssetId: xFirstPublish.MEDIA_ID, mediaSha256: xFirstPublish.MEDIA_SHA256,
        responseAssetId: asset.responseAssetId, status: "accepted", immutable: true,
        createdAt: FieldValue.serverTimestamp()}, {merge: false});
      batch.update(repairRef, {status: "completed", replacementProviderPostId: created.providerPostId,
        replacementProviderPostUrl: created.providerPostUrl,
        replacementReceiptId: receiptId, completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
      batch.update(jobRef, {providerState: "deleted_replaced",
        originalProviderPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
        replacementProviderPostId: created.providerPostId,
        replacementProviderPostUrl: created.providerPostUrl,
        replacementReceiptId: receiptId, replacementResponseAssetId: asset.responseAssetId,
        replacementCreateAttemptCount: 1, updatedAt: FieldValue.serverTimestamp()});
      batch.update(db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID), {
        status: "published", providerState: "published_verified",
        providerPostId: created.providerPostId, responseAssetId: asset.responseAssetId,
        replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
        updatedAt: FieldValue.serverTimestamp()});
      await batch.commit();
      return {repairId: FIRST_X_REPAIR_ID, status: "completed",
        providerPostId: created.providerPostId, providerPostUrl: created.providerPostUrl,
        providerReceiptId: receiptId, replacementCreateAttempts: 1,
        duplicateCreateAttempted: false};
    } catch (error) {
      await repairRef.set({status: "unknown_replacement_outcome", reconciliationRequired: true,
        safeFailure: readText(error?.message || error, 120),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      throw new HttpsError("aborted", "X replacement requires reconciliation. No retry is allowed.");
    }
  },
);

exports.reconcileFirstXRepairV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, timeoutSeconds: 30,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const repairRef = db.collection("socialPublishedPostRepairs").doc(FIRST_X_REPAIR_ID);
    const repair = (await repairRef.get()).data();
    if (!repair || repair.status !== "unknown_replacement_outcome") {
      throw new HttpsError("failed-precondition", "This X repair does not require reconciliation.");
    }
    const connectionData = (await db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x").get()).data();
    xFirstPublish.assertWriteConnection(connectionData);
    const auth = await firstXCredential(business.uid, connectionData);
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const tokens = await socialOAuth.refreshTokens({provider: "x", tokens: auth.tokens,
      config, clientSecret: providerSecretBinding("x").secret.value()});
    const asset = xFirstPublish.assertProductionResponseAsset({
      responseAssetId: repair.productionResponseAssetId,
      publicCode: repair.productionPublicCode, publicUrl: repair.productionPublicUrl});
    const renderedCopy = xFirstPublish.renderPostText(asset.publicUrl);
    const result = await xFirstPublish.reconcilePost({accessToken: tokens.accessToken,
      renderedCopy, startedAt: Number(repair.replacementCreateStartedAtMillis || 0) - 60000});
    if (result.status !== "found") return {repairId: FIRST_X_REPAIR_ID,
      status: "unknown_replacement_outcome", retryAuthorized: false,
      duplicateCreateAttempted: false};
    const receiptId = `social_replacement_receipt_${xFirstPublish.digest({
      repairId: FIRST_X_REPAIR_ID, providerPostId: result.providerPostId})}`;
    const jobRef = db.collection("socialPublishingJobs").doc(xFirstPublish.expectedJobId());
    const batch = db.batch();
    batch.set(db.collection("socialProviderReceipts").doc(receiptId), {
      schemaVersion: "SocialProviderReplacementReceiptV1", businessUid: business.uid,
      provider: "x", repairId: FIRST_X_REPAIR_ID, providerPostId: result.providerPostId,
      providerPostUrl: result.providerPostUrl,
      providerTextHash: xFirstPublish.digest(renderedCopy),
      replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      replacementOfDefect: xFirstPublish.ORIGINAL_DEFECT_REASON,
      originalDeletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
      mediaAssetId: xFirstPublish.MEDIA_ID, mediaSha256: xFirstPublish.MEDIA_SHA256,
      responseAssetId: asset.responseAssetId, status: "reconciled", immutable: true,
      createdAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.update(repairRef, {status: "completed", replacementProviderPostId: result.providerPostId,
      replacementProviderPostUrl: result.providerPostUrl, replacementReceiptId: receiptId,
      reconciledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    batch.update(jobRef, {providerState: "deleted_replaced",
      originalProviderPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
      replacementProviderPostId: result.providerPostId,
      replacementProviderPostUrl: result.providerPostUrl,
      replacementReceiptId: receiptId, replacementResponseAssetId: asset.responseAssetId,
      replacementCreateAttemptCount: 1, updatedAt: FieldValue.serverTimestamp()});
    await batch.commit();
    return {repairId: FIRST_X_REPAIR_ID, status: "completed",
      providerPostId: result.providerPostId, providerPostUrl: result.providerPostUrl,
      providerReceiptId: receiptId, replacementCreateAttempts: 1,
      duplicateCreateAttempted: false, reconciled: true};
  },
);

exports.createSocialContentPlanV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const profile = (await db.collection("businessGrowthProfiles").doc(business.uid).get()).data();
    if (!profile?.businessName) {
      throw new HttpsError("failed-precondition", "Complete the Business Growth Profile first.");
    }
    let plan;
    try {
      plan = socialOperations.createContentPlan({
        businessUid: business.uid,
        planId: business.planId,
        businessName: profile.businessName,
        goal: request.data?.goal,
        pillars: request.data?.pillars,
        items: request.data?.items,
        automationMode: request.data?.automationMode || "manual",
        managedAuthorization: request.data?.managedAuthorization === true,
        startsOn: request.data?.startsOn,
        now: Date.now(),
      });
    } catch (error) {
      if (String(error?.message || error).includes("managed_social_authorization")) {
        throw new HttpsError("failed-precondition",
          "Managed publishing requires an active Managed Growth plan and explicit authorization.");
      }
      throw new HttpsError("invalid-argument", "Review the 30-day content plan and try again.");
    }
    const batch = db.batch();
    batch.set(db.collection("socialContentPlans").doc(plan.id), {
      ...plan.record,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    for (const item of plan.record.items) {
      const itemId = `${plan.id}_${item.itemKey}`;
      const version = socialOperations.contentItemVersion({
        businessUid: business.uid,
        planId: plan.id,
        item,
        now: Date.now(),
      });
      batch.set(db.collection("socialContentItems").doc(itemId), {
        schemaVersion: socialOperations.SCHEMA_VERSION,
        businessUid: business.uid,
        planId: plan.id,
        itemKey: item.itemKey,
        status: "ready_for_review",
        currentVersion: 1,
        scheduledFor: Timestamp.fromDate(new Date(item.scheduledFor)),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: false});
      batch.set(db.collection("socialContentVersions").doc(`${itemId}_v1`), {
        ...version,
        scheduledFor: Timestamp.fromDate(new Date(version.scheduledFor)),
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: false});
    }
    await batch.commit();
    return {
      planId: plan.id,
      status: plan.record.status,
      planVersion: plan.record.planVersion,
      itemCount: plan.record.items.length,
      externalPublishingEnabled: false,
    };
  },
);

exports.approveSocialContentPlanV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const planId = readText(request.data?.planId, 180);
    const planRef = db.collection("socialContentPlans").doc(planId);
    const [planSnapshot, itemSnapshots] = await Promise.all([
      planRef.get(),
      db.collection("socialContentItems").where("planId", "==", planId).limit(60).get(),
    ]);
    let approved;
    try {
      approved = socialOperations.approvePlan({
        businessUid: business.uid,
        record: planSnapshot.data(),
        planVersion: request.data?.planVersion,
        now: Date.now(),
      });
    } catch (error) {
      const code = String(error?.message || error);
      throw new HttpsError(code.includes("not_owned") ? "permission-denied" : "failed-precondition",
        "Review the latest 30-day plan before approving it.");
    }
    const batch = db.batch();
    batch.set(planRef, {
      ...approved,
      createdAt: planSnapshot.data().createdAt,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    for (const item of itemSnapshots.docs) {
      const version = Number(item.data().currentVersion || 0);
      const versionRef = db.collection("socialContentVersions").doc(`${item.id}_v${version}`);
      batch.update(item.ref, {
        status: "approved",
        approvedVersion: version,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.update(versionRef, {
        status: "approved",
        approvedVersion: version,
        approvedByUid: business.uid,
        approvedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return {
      planId,
      status: "approved",
      approvedVersion: approved.approvedVersion,
      approvedItemCount: itemSnapshots.size,
      externalPublishingEnabled: false,
    };
  },
);

exports.createEmailContentPlanV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const business = await requireManagedGrowthBusiness(request);
    const profile = (await db.collection("businessGrowthProfiles").doc(business.uid).get()).data();
    if (!profile?.businessName) {
      throw new HttpsError("failed-precondition", "Complete the Business Growth Profile first.");
    }
    let plan;
    try {
      plan = socialOperations.createEmailContentPlan({
        businessUid: business.uid,
        businessName: profile.businessName,
        goal: request.data?.goal,
        entries: request.data?.entries,
        startsOn: request.data?.startsOn,
        now: Date.now(),
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "Review the 30-day email content and try again.");
    }
    await db.collection("emailContentPlans").doc(plan.id).set({
      ...plan.record,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    return {
      emailPlanId: plan.id,
      entryCount: plan.record.entries.length,
      deliveryEnabled: false,
      complianceStatus: plan.record.complianceStatus,
    };
  },
);

exports.getSocialOperationsAdminSummary = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const context = await requireVerifiedUser(request, "Administrator authentication is required.");
    if (!context.isAdmin) {
      throw new HttpsError("permission-denied", "Administrator authority is required.");
    }
    const [plans, jobs, connections, snapshots, configs, qualityAssessments,
      pastPostRatings, replacementProposals] = await Promise.all([
      db.collection("socialContentPlans").count().get(),
      db.collection("socialPublishingJobs").count().get(),
      db.collectionGroup("providers").limit(100).get(),
      db.collection("socialPerformanceSnapshots").count().get(),
      db.collection("socialProviderConfigs").where("environment", "==", runtimeEnvironment())
        .limit(10).get(),
      db.collection("socialContentQualityAssessments").count().get(),
      db.collection("socialPastPostRatings").count().get(),
      db.collection("socialContentReplacementProposals").count().get(),
    ]);
    return {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      contentPlanCount: plans.data().count,
      publishJobCount: jobs.data().count,
      connectionProjectionCount: connections.size,
      connections: connections.docs.map((doc) => {
        const data = doc.data();
        const projection = socialOperations.connectionProjection({provider: doc.id, ...data});
        return {
          provider: projection.provider,
          status: projection.status,
          accountDisplayName: projection.accountDisplayName,
          handle: projection.handle,
          readOnly: projection.readOnly,
          requiresReconnect: projection.requiresReconnect,
          analyticsAvailable: projection.capabilities.analytics,
          lastSyncAt: data.lastSyncAt || null,
          tokenHealth: projection.requiresReconnect ? "attention_required" :
            projection.status.startsWith("connected_") ? "healthy" : "not_connected",
        };
      }),
      providerConfigs: configs.docs.map((doc) => ({
        provider: doc.data().provider || doc.id.split("_").at(-1),
        environment: doc.data().environment || runtimeEnvironment(),
        appName: doc.data().appName || null,
        enabled: doc.data().enabled === true,
        historicalSyncEnabled: doc.data().historicalSyncEnabled === true,
        writeScopesEnabled: false,
        externalPublishingEnabled: false,
      })),
      performanceSnapshotCount: snapshots.data().count,
      contentQualityAssessmentCount: qualityAssessments.data().count,
      pastPostRatingCount: pastPostRatings.data().count,
      replacementProposalCount: replacementProposals.data().count,
      providerCleanupMutationsEnabled: false,
      externalPublishingEnabled: false,
      adMutationsEnabled: false,
      emailDeliveryEnabled: false,
      tokenValuesExposed: false,
    };
  },
);

exports.configureSocialProviderV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const context = await requireVerifiedUser(request, "Administrator authentication is required.");
    if (!context.isAdmin) throw new HttpsError("permission-denied", "Administrator authority is required.");
    const environment = runtimeEnvironment();
    let config;
    try {
      config = socialOAuth.validateProviderConfig({
        provider: request.data?.provider,
        clientId: request.data?.clientId,
        redirectUri: request.data?.redirectUri,
        environment,
        enabled: request.data?.enabled === true,
        historicalSyncEnabled: request.data?.historicalSyncEnabled === true,
        appName: request.data?.appName,
      });
    } catch (_) {
      throw new HttpsError("invalid-argument", "Review the provider configuration and try again.");
    }
    await providerConfigRef(config.provider, environment).set({
      schemaVersion: "SocialProviderConfigV1",
      ...config,
      writeScopesEnabled: false,
      externalPublishingEnabled: false,
      configuredByUid: context.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    return {
      provider: config.provider,
      environment,
      enabled: config.enabled,
      historicalSyncEnabled: config.historicalSyncEnabled,
      redirectUri: config.redirectUri,
      writeScopesEnabled: false,
      externalPublishingEnabled: false,
    };
  },
);

exports.beginSocialOAuthConnectionV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const provider = socialOAuth.normalizeProvider(request.data?.provider);
    const environment = runtimeEnvironment();
    const config = (await providerConfigRef(provider, environment).get()).data();
    let proposed;
    try {
      proposed = socialOAuth.createAttempt({
        businessUid: business.uid,
        provider,
        config,
        encryptionKey: socialOAuthEncryptionKey.value(),
        now: Date.now(),
      });
    } catch (_) {
      throw new HttpsError("failed-precondition", "This read-only connection is not configured yet.");
    }
    const surface = provider === "meta" ? "facebook" : provider;
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc(surface);
    const resolved = await db.runTransaction(async (transaction) => {
      const connection = (await transaction.get(connectionRef)).data();
      const pendingAttemptId = readText(connection?.pendingAttemptId, 128);
      if (pendingAttemptId) {
        const pendingRef = db.collection("socialOAuthAttempts").doc(pendingAttemptId);
        const pending = (await transaction.get(pendingRef)).data();
        if (socialOAuth.isReusableAttempt(pending, {businessUid: business.uid, provider,
          now: Date.now()})) {
          return {attemptId: pendingAttemptId, record: pending, reused: true,
            authorizationUrl: socialOAuth.continuationUrl(pending, {businessUid: business.uid,
              provider, attemptId: pendingAttemptId,
              encryptionKey: socialOAuthEncryptionKey.value(), now: Date.now()})};
        }
      }
      const attemptRef = db.collection("socialOAuthAttempts").doc(proposed.attemptId);
      transaction.set(attemptRef, {...proposed.record,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()},
      {merge: false});
      transaction.set(connectionRef, {
        schemaVersion: socialOperations.SCHEMA_VERSION,
        provider: surface,
        status: "authorizing",
        pendingAttemptId: proposed.attemptId,
        capabilities: {profile: false, analytics: false, publishText: false,
          publishImage: false, publishVideo: false, schedule: false},
        environment,
        authorizationUpdatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {attemptId: proposed.attemptId, record: proposed.record, reused: false,
        authorizationUrl: proposed.authorizationUrl};
    });
    return {
      provider,
      attemptId: resolved.attemptId,
      authorizationUrl: resolved.authorizationUrl,
      continuationAvailable: Boolean(resolved.authorizationUrl),
      reusedExistingAttempt: resolved.reused,
      status: resolved.record.status,
      requestedScopes: socialOAuth.PROVIDER_SCOPES[provider],
      writeScopesRequested: false,
    };
  },
);

exports.beginFirstXPublishAuthorizationV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const [version, quality, connection, configSnapshot] = await Promise.all([
      db.collection("socialContentVersions").doc(xFirstPublish.VERSION_DOCUMENT_ID).get(),
      db.collection("socialContentQualityAssessments").doc(xFirstPublish.VERSION_DOCUMENT_ID).get(),
      db.collection("socialConnections").doc(business.uid).collection("providers").doc("x").get(),
      providerConfigRef("x", "staging").get(),
    ]);
    if (!version.exists || version.data()?.businessUid !== business.uid ||
        version.data()?.founderPublicationApproved !== true ||
        !quality.exists || quality.data()?.readyToPublish !== true ||
        Number(quality.data()?.score || 0) < 75 ||
        connection.data()?.providerAccountId !== `x_user_${xFirstPublish.EXPECTED_X_ID}`) {
      throw new HttpsError("failed-precondition",
        "Prepare and quality-check the exact post before enabling publishing access.");
    }
    const proposed = socialOAuth.createAttempt({businessUid: business.uid, provider: "x",
      config: configSnapshot.data(), encryptionKey: socialOAuthEncryptionKey.value(),
      scopes: xFirstPublish.X_WRITE_SCOPES, purpose: "x_first_publish_certification",
      now: Date.now()});
    const connectionRef = connection.ref;
    const resolved = await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(connectionRef)).data() || {};
      const pendingAttemptId = readText(current.pendingAttemptId, 128);
      if (pendingAttemptId) {
        const pendingRef = db.collection("socialOAuthAttempts").doc(pendingAttemptId);
        const pending = (await transaction.get(pendingRef)).data();
        if (pending?.purpose === "x_first_publish_certification" &&
            socialOAuth.isReusableAttempt(pending, {businessUid: business.uid, provider: "x",
              now: Date.now()})) {
          return {attemptId: pendingAttemptId, record: pending, reused: true,
            authorizationUrl: socialOAuth.continuationUrl(pending, {businessUid: business.uid,
              provider: "x", attemptId: pendingAttemptId,
              encryptionKey: socialOAuthEncryptionKey.value(), now: Date.now()})};
        }
      }
      const attemptRef = db.collection("socialOAuthAttempts").doc(proposed.attemptId);
      transaction.create(attemptRef, {...proposed.record,
        contentItemId: xFirstPublish.CONTENT_ITEM_ID,
        contentVersion: xFirstPublish.VERSION_NUMBER,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      transaction.set(connectionRef, {status: "write_scope_pending",
        pendingAttemptId: proposed.attemptId, writeScopesGranted: false,
        externalPublishingEnabled: false, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return {attemptId: proposed.attemptId, record: proposed.record, reused: false,
        authorizationUrl: proposed.authorizationUrl};
    });
    return {provider: "x", attemptId: resolved.attemptId,
      authorizationUrl: resolved.authorizationUrl,
      continuationAvailable: Boolean(resolved.authorizationUrl),
      reusedExistingAttempt: resolved.reused, status: resolved.record.status,
      requestedCapability: "Publish this approved X post",
      writeScopesRequested: true};
  },
);

exports.getSocialOAuthAttemptV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const attemptId = readText(request.data?.attemptId, 128);
    const record = (await db.collection("socialOAuthAttempts").doc(attemptId).get()).data();
    if (!record || record.businessUid !== business.uid) {
      throw new HttpsError("not-found", "The connection attempt is unavailable.");
    }
    const now = Date.now();
    const active = socialOAuth.isReusableAttempt(record, {businessUid: business.uid,
      provider: record.provider, now});
    const continueUrl = active ? socialOAuth.continuationUrl(record, {
      businessUid: business.uid, provider: record.provider, attemptId,
      encryptionKey: socialOAuthEncryptionKey.value(), now}) : null;
    return {
      attemptId,
      provider: record.provider,
      status: active ? record.status : "expired",
      authorizationUrl: continueUrl,
      continuationAvailable: Boolean(continueUrl),
      candidates: Array.isArray(record.safeCandidates) ? record.safeCandidates : [],
      grantedScopes: Array.isArray(record.grantedScopes) ? record.grantedScopes : [],
      missingScopes: Array.isArray(record.missingScopes) ? record.missingScopes : [],
      writeScopesGranted: record.purpose === "x_first_publish_certification" &&
        Array.isArray(record.grantedScopes) &&
        xFirstPublish.X_WRITE_SCOPES.every((scope) => record.grantedScopes.includes(scope)),
    };
  },
);

exports.confirmFirstXPublishAuthorizationV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = requireFirstXCertificationBusiness(
      await requireSocialOperationsBusiness(request));
    const attemptId = readText(request.data?.attemptId, 128);
    const attemptRef = db.collection("socialOAuthAttempts").doc(attemptId);
    const attempt = (await attemptRef.get()).data();
    if (!attempt || attempt.businessUid !== business.uid || attempt.provider !== "x" ||
        attempt.purpose !== "x_first_publish_certification" ||
        Number(attempt.contentVersion) !== xFirstPublish.VERSION_NUMBER ||
        attempt.contentItemId !== xFirstPublish.CONTENT_ITEM_ID ||
        !xFirstPublish.X_WRITE_SCOPES.every((scope) => attempt.grantedScopes?.includes(scope)) ||
        (attempt.grantedScopes || []).some((scope) => !xFirstPublish.X_WRITE_SCOPES.includes(scope))) {
      throw new HttpsError("failed-precondition", "The bounded X permission upgrade is unavailable.");
    }
    let selected;
    try {
      selected = socialOAuth.selectCandidate({attempt, candidateId: request.data?.candidateId,
        encryptionKey: socialOAuthEncryptionKey.value(), now: Date.now()});
    } catch (_) {
      throw new HttpsError("failed-precondition", "Review and confirm the exact X account again.");
    }
    const safe = selected.safeCandidate;
    if (selected.privateAccount.accountId !== xFirstPublish.EXPECTED_X_ID ||
        safe.accountDisplayName !== xFirstPublish.EXPECTED_X_NAME ||
        readText(safe.handle, 180).replace(/^@/, "").toLowerCase() !==
          xFirstPublish.EXPECTED_X_HANDLE || safe.capabilities.publishText !== true ||
        safe.capabilities.publishImage !== true) {
      throw new HttpsError("failed-precondition", "The returned X identity does not match ScaledCircle.");
    }
    const credentialId = socialOAuth.digest(`${business.uid}:x:${selected.privateAccount.accountId}`);
    const credentialRef = db.collection("socialConnectionCredentials").doc(credentialId);
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const batch = db.batch();
    batch.set(credentialRef, {...selected.credentialRecord,
      accountEnvelope: socialOAuth.encryptJson(selected.privateAccount,
        socialOAuthEncryptionKey.value(), `${business.uid}:x:${credentialId}`),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.set(connectionRef, {schemaVersion: socialOperations.SCHEMA_VERSION,
      provider: "x", status: "connected_write", accountDisplayName: safe.accountDisplayName,
      accountType: safe.accountType, handle: safe.handle, providerAccountId: safe.candidateId,
      providerUserId: selected.privateAccount.accountId, credentialId,
      capabilities: safe.capabilities, grantedScopes: attempt.grantedScopes,
      writeScopesGranted: true, externalPublishingEnabled: false,
      narrowCertificationContentItemId: xFirstPublish.CONTENT_ITEM_ID,
      narrowCertificationVersion: xFirstPublish.VERSION_NUMBER,
      environment: attempt.environment, authorizationUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.update(attemptRef, {status: "connected_write", selectedCandidate: safe,
      candidateEnvelope: FieldValue.delete(), verifierEnvelope: FieldValue.delete(),
      connectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    await batch.commit();
    return {provider: "x", status: "connected_write", identity: safe,
      capability: "approval_controlled_image_post", unrelatedScopesGranted: 0,
      globalExternalPublishingEnabled: false};
  },
);

exports.confirmSocialOAuthConnectionV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const attemptId = readText(request.data?.attemptId, 128);
    const attemptRef = db.collection("socialOAuthAttempts").doc(attemptId);
    const attemptSnapshot = await attemptRef.get();
    const attempt = attemptSnapshot.data();
    if (!attempt || attempt.businessUid !== business.uid ||
        (attempt.purpose && attempt.purpose !== "read_only_connection")) {
      throw new HttpsError("not-found", "The connection attempt is unavailable.");
    }
    let selected;
    try {
      selected = socialOAuth.selectCandidate({
        attempt,
        candidateId: request.data?.candidateId,
        encryptionKey: socialOAuthEncryptionKey.value(),
        now: Date.now(),
      });
    } catch (_) {
      throw new HttpsError("failed-precondition", "Review and confirm the provider identity again.");
    }
    const credentialId = socialOAuth.digest(
      `${business.uid}:${attempt.provider}:${selected.privateAccount.accountId}`);
    const connectionRoot = db.collection("socialConnections").doc(business.uid)
      .collection("providers");
    const batch = db.batch();
    batch.set(db.collection("socialConnectionCredentials").doc(credentialId), {
      ...selected.credentialRecord,
      accountEnvelope: socialOAuth.encryptJson(selected.privateAccount,
        socialOAuthEncryptionKey.value(), `${business.uid}:${attempt.provider}:${credentialId}`),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    const base = {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      status: "connected_read_only",
      accountDisplayName: selected.safeCandidate.accountDisplayName,
      accountType: selected.safeCandidate.accountType,
      handle: selected.safeCandidate.handle,
      providerAccountId: selected.safeCandidate.candidateId,
      credentialId,
      capabilities: selected.safeCandidate.capabilities,
      grantedScopes: attempt.grantedScopes,
      writeScopesGranted: false,
      environment: attempt.environment,
      authorizationUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (attempt.provider === "meta") {
      batch.set(connectionRoot.doc("facebook"), {...base, provider: "facebook"}, {merge: false});
      if (selected.safeCandidate.linkedHandle || selected.safeCandidate.linkedAccountDisplayName) {
        batch.set(connectionRoot.doc("instagram"), {
          ...base,
          provider: "instagram",
          accountDisplayName: selected.safeCandidate.linkedAccountDisplayName ||
            selected.safeCandidate.linkedHandle,
          accountType: "instagram_professional",
          handle: selected.safeCandidate.linkedHandle,
          providerAccountId: `${selected.safeCandidate.candidateId}_instagram`,
        }, {merge: false});
      }
    } else {
      batch.set(connectionRoot.doc(attempt.provider), {...base, provider: attempt.provider}, {merge: false});
    }
    batch.update(attemptRef, {
      status: "connected_read_only",
      selectedCandidate: selected.safeCandidate,
      candidateEnvelope: FieldValue.delete(),
      verifierEnvelope: FieldValue.delete(),
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return {
      provider: attempt.provider,
      status: "connected_read_only",
      identity: selected.safeCandidate,
      writeScopesGranted: false,
      externalPublishingEnabled: false,
    };
  },
);

function socialOAuthCallbackHandler(expectedProvider, providerSecretParameter) {
  return async (request, response) => {
    response.set("Cache-Control", "no-store");
    const state = readText(request.query?.state, 1000);
    const code = readText(request.query?.code, 10000);
    const attemptId = socialOAuth.digest(state);
    const attemptRef = db.collection("socialOAuthAttempts").doc(attemptId);
    try {
      if (!state || !code || request.query?.error) throw new Error("social_oauth_callback_invalid");
      const attempt = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(attemptRef);
        const current = snapshot.data();
        socialOAuth.assertAttempt(current, {now: Date.now()});
        if (current.status !== "authorizing") throw new Error("social_oauth_exchange_in_progress");
        transaction.update(attemptRef, {status: "exchanging",
          updatedAt: FieldValue.serverTimestamp()});
        return {...current, status: "exchanging"};
      });
      requireRuntimeProvider(expectedProvider, attempt.provider);
      const config = socialOAuth.validateProviderConfig({
        ...(await providerConfigRef(attempt.provider, attempt.environment).get()).data(),
        provider: attempt.provider,
      });
      const completed = await socialOAuth.completeExchange({
        attempt,
        code,
        config,
        clientSecret: providerSecretParameter.value(),
        encryptionKey: socialOAuthEncryptionKey.value(),
        now: Date.now(),
      });
      await attemptRef.update({
        ...completed,
        updatedAt: FieldValue.serverTimestamp(),
      });
      response.status(200).type("html").send(socialOAuth.callbackHtml({
        success: completed.status === "identity_pending",
        message: completed.status === "identity_pending" ?
          "Return to ScaledCircle to review and confirm the exact account identity." :
          attempt.purpose === "x_first_publish_certification" ?
            "X did not grant the exact permission needed for this approved post." :
            "The provider did not grant every required read-only permission.",
      }));
    } catch (error) {
      console.warn("social_oauth_callback_failed", {
        provider: expectedProvider,
        failure: readText(error?.message || error, 120),
        providerStatus: Number(error?.providerStatus || 0) || null,
        providerCode: readText(error?.providerCode, 100) || null,
        providerSubcode: readText(error?.providerSubcode, 100) || null,
        providerMessage: readText(error?.providerMessage, 240) || null,
        providerStage: readText(error?.providerStage, 80) || null,
        providerEndpoint: readText(error?.providerEndpoint, 120) || null,
        providerGraphVersion: readText(error?.providerGraphVersion, 40) || null,
        providerObjectType: readText(error?.providerObjectType, 80) || null,
        providerFields: readText(error?.providerFields, 240) || null,
        providerTokenClass: readText(error?.providerTokenClass, 80) || null,
        selectedPageId: readText(error?.selectedPageId, 180) || null,
        grantedScopes: Array.isArray(error?.grantedScopes) ?
          error.grantedScopes.map((scope) => readText(scope, 180)).filter(Boolean) : [],
      });
      const exchangeAlreadyInProgress = String(error?.message || error)
        .includes("social_oauth_exchange_in_progress");
      if (state && !exchangeAlreadyInProgress) {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(attemptRef);
          if (["authorizing", "exchanging"].includes(snapshot.data()?.status)) {
            transaction.set(attemptRef, {status: "error", safeFailure: "connection_failed",
              updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          }
        }).catch(() => {});
      }
      response.status(400).type("html").send(socialOAuth.callbackHtml({
        success: false,
        message: "The read-only authorization could not be completed. No account was connected.",
      }));
    }
  };
}

exports.socialOAuthCallbackV1 = onRequest(
  {maxInstances: 4, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("youtube").secret]},
  socialOAuthCallbackHandler("youtube", providerSecretBinding("youtube").secret),
);

exports.socialOAuthXCallbackV1 = onRequest(
  {maxInstances: 4, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("x").secret]},
  socialOAuthCallbackHandler("x", providerSecretBinding("x").secret),
);

exports.socialOAuthMetaCallbackV1 = onRequest(
  {maxInstances: 4, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("meta").secret]},
  socialOAuthCallbackHandler("meta", providerSecretBinding("meta").secret),
);

function syncSocialReadOnlyPerformanceHandler(expectedProvider, providerSecretParameter) {
  return async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const surface = readText(request.data?.provider, 30).toLowerCase();
    if (!socialOperations.PROVIDERS.includes(surface)) {
      throw new HttpsError("invalid-argument", "Choose a supported connected account.");
    }
    const provider = ["facebook", "instagram"].includes(surface) ? "meta" : surface;
    try {
      requireRuntimeProvider(expectedProvider, provider);
    } catch (_) {
      throw new HttpsError("invalid-argument", "Choose the matching connected provider.");
    }
    const environment = runtimeEnvironment();
    const config = socialOAuth.validateProviderConfig({
      ...(await providerConfigRef(provider, environment).get()).data(), provider,
    });
    if (!config.historicalSyncEnabled) {
      throw new HttpsError("failed-precondition", "Historical sync is not enabled for this provider.");
    }
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc(surface);
    const connection = (await connectionRef.get()).data();
    if (!connection || !["connected_read_only", "connected_write"].includes(connection.status) ||
        !connection.credentialId) {
      throw new HttpsError("failed-precondition", "Connect this account read only first.");
    }
    const credentialRef = db.collection("socialConnectionCredentials").doc(connection.credentialId);
    const credentialSnapshot = await credentialRef.get();
    const credential = credentialSnapshot.data();
    if (!credential || credential.businessUid !== business.uid || credential.provider !== provider) {
      throw new HttpsError("permission-denied", "The connection credential is unavailable.");
    }
    try {
      const account = socialOAuth.decryptJson(credential.accountEnvelope,
        socialOAuthEncryptionKey.value(), `${business.uid}:${provider}:${connection.credentialId}`);
      const tokenAad = `${business.uid}:${provider}:${account.accountId}`;
      let tokens = socialOAuth.decryptJson(credential.tokenEnvelope,
        socialOAuthEncryptionKey.value(), tokenAad);
      tokens = await socialOAuth.refreshTokens({provider, tokens, config,
        clientSecret: providerSecretParameter.value()});
      const snapshots = await socialOAuth.readHistoricalPerformance({
        provider, surface, tokens, account, now: Date.now(),
      });
      const batch = db.batch();
      for (const snapshot of snapshots) {
        const normalized = socialOperations.normalizePerformance({
          businessUid: business.uid,
          provider: surface,
          contentItemId: `historical_${socialOAuth.digest(snapshot.providerObjectId).slice(0, 24)}`,
          observedAt: snapshot.observedAtMillis,
          metrics: snapshot.metrics,
          unavailable: snapshot.unavailable,
        });
        const id = `social_performance_${socialOAuth.digest({surface,
          providerObjectId: snapshot.providerObjectId, observedAt: snapshot.observedAtMillis})}`;
        batch.set(db.collection("socialPerformanceSnapshots").doc(id), {
          ...normalized,
          source: "provider_read_only_import",
          periodStart: snapshot.periodStart || null,
          periodEnd: snapshot.periodEnd || null,
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: false});
      }
      if (tokens.refreshed) {
        const secretFields = {...tokens};
        delete secretFields.refreshed;
        batch.update(credentialRef, {
          tokenEnvelope: socialOAuth.encryptJson(secretFields,
            socialOAuthEncryptionKey.value(), tokenAad),
          expiresAtMillis: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      batch.update(connectionRef, {
        lastSyncAt: FieldValue.serverTimestamp(),
        metricCollectionHealth: snapshots.length ? "healthy" : "no_data",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return {
        provider: surface,
        importedSnapshotCount: snapshots.length,
        metricCollectionHealth: snapshots.length ? "healthy" : "no_data",
        externalPublishingEnabled: false,
      };
    } catch (_) {
      await connectionRef.set({status: "reauth_required", metricCollectionHealth: "error",
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      throw new HttpsError("unavailable", "The read-only performance sync needs attention.");
    }
  };
}

exports.syncSocialReadOnlyPerformanceV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("youtube").secret]},
  syncSocialReadOnlyPerformanceHandler("youtube", providerSecretBinding("youtube").secret),
);

exports.syncXSocialReadOnlyPerformanceV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("x").secret]},
  syncSocialReadOnlyPerformanceHandler("x", providerSecretBinding("x").secret),
);

exports.syncMetaSocialReadOnlyPerformanceV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2, secrets: [socialOAuthEncryptionKey,
    providerSecretBinding("meta").secret]},
  syncSocialReadOnlyPerformanceHandler("meta", providerSecretBinding("meta").secret),
);
