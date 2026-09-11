"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const socialOperations = require("./social_operations");
const socialOAuth = require("./social_oauth");
const metaConnection = require("./social_meta_connection");
const oauthLifecycle = require("./social_oauth_lifecycle");
const metaCustomer = require("./social_meta_customer");
const launchAvailability = require('./social_launch_availability');
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

const PRODUCTION_X_PROVIDER_CONFIG = Object.freeze({
  provider: "x",
  clientId: "SVE2bE9DelpBSU1ZT1I4ejJRNXc6MTpjaQ",
  redirectUri: "https://us-east1-scaled-circle.cloudfunctions.net/socialOAuthXCallbackV1",
  appName: "ScaledCircle Social Operations — Production",
});

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

function safeSocialOAuthFailureCode(error) {
  const code = readText(error?.message, 120);
  return /^social_oauth_[a-z0-9_]+$/.test(code) ? code : "social_oauth_setup_failed";
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

// Customer approvals are separate from internal dogfood allowances. An empty
// deployment allowlist fails closed; no plan approval enables this path.
function customerSchedulingStore() {
  return require('./social_customer_scheduling').createStore({db, environment:runtimeEnvironment(),
    enabledUids:(process.env.SOCIAL_CUSTOMER_SCHEDULING_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean)});
}
function customerPostCallable(method) {
  return onCall({enforceAppCheck:false,maxInstances:3},async request=>{
    const business=await requireSocialOperationsBusiness(request);
    if(business.role!=='business' || !metaCustomer.available(business,process.env.SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS))
      throw new HttpsError('permission-denied','Post scheduling is not available for this Business.');
    try{return await customerSchedulingStore()[method](business.uid,request.data||{});}
    catch(error){
      require('firebase-functions/logger').warn('customer_social_schedule_rejected',{uid:business.uid,reason:error.message});
      throw new HttpsError('failed-precondition','This post could not be scheduled. Review its current version and requirements before trying again.');
    }
  });
}

exports.previewCustomerSocialPostV1=customerPostCallable('preview');
exports.approveAndScheduleCustomerSocialPostV1=customerPostCallable('approve');

exports.getSocialOperationsWorkspace = onCall(
  {enforceAppCheck: false, maxInstances: 6},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue);
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
    const safeConnections = require('./social_launch_availability').channels(business).map((provider) =>
      socialOperations.connectionProjection({provider, ...(connectionMap.get(provider) || {})}));
    const performance = snapshots.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const customerPlans=await require('./social_customer_post_projection').load({db,uid:business.uid,
      plans:plans.docs.map(doc=>({id:doc.id,...doc.data()})),store:customerSchedulingStore()});
    const cadenceObservations=await db.collection('socialMetaMeasurementSnapshots').where('businessUid','==',business.uid).limit(100).get();
    const cadenceJobs=await db.collection('socialMetaMeasurementJobs').where('businessUid','==',business.uid).limit(100).get();
    const cadenceJobMap=new Map(cadenceJobs.docs.map(doc=>[doc.id,doc.data()]));
    const cadence=require('./social_customer_cadence');
    const qualityMap=new Map(qualityAssessments.docs.map(doc=>[doc.id,doc.data()]));
    const cadenceLearning=['facebook','instagram'].map(provider=>cadence.recommend({uid:business.uid,provider,
      observations:cadenceObservations.docs.map(doc=>{const row=doc.data(),q=qualityMap.get(row.contentVersionId);
        const valid=q?.businessUid===business.uid&&q.immutableSourceHash===row.contentHash;
        const variant=valid?q.variantAssessments?.find(v=>v.provider===row.provider):null;
        return {...row,hoursAfterPublication:cadenceJobMap.get(doc.id)?.hoursAfterPublication,
          qualityReady:valid&&q.readyToPublish===true,fatigueObserved:variant?.repetition?.repeated};})}));


    return {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      canonicalBusinessId: business.uid,
      canonicalBusinessName: readText(profileSnapshot.data()?.businessName, 240) || null,
      planId: business.planId,
      managedGrowth: business.planId === "managed_growth",
      connections: safeConnections,
      managedPublishingAvailable: metaCustomer.available(business, process.env.SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS),
      plans: customerPlans,
      cadence: {startingCopy:cadence.startingCopy,platforms:cadenceLearning},
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
      runtimeStatus: await require("./social_runtime_status").load(db, business.uid, {
        plans: customerPlans, connections: safeConnections,
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
      internalDevelopmentAvailable: business.isAdmin === true,
      availableCustomerChannels: launchAvailability.channels(business),
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

function safeRefreshFailure(error) {
  if (error?.providerCode === "invalid_request") return "invalid_refresh_credential";
  if (String(error?.message || "").includes("refresh_token_missing")) {
    return "refresh_credential_missing";
  }
  if (String(error?.message || "").includes("scope_mismatch")) return "scope_mismatch";
  if (String(error?.message || "").includes("account_mismatch")) return "account_mismatch";
  return "provider_refresh_failed";
}

async function refreshStoredXCredential({businessUid, connectionRef, connection, config,
  clientSecret, expectedProviderUserId = connection?.providerUserId, now = Date.now()}) {
  if (!expectedProviderUserId || !connection?.credentialId || connection.provider !== "x") {
    throw new Error("x_connection_credential_missing");
  }
  const credentialRef = db.collection("socialConnectionCredentials").doc(connection.credentialId);
  const leaseId = db.collection("socialCredentialRefreshLeases").doc().id;
  const claimed = await db.runTransaction(async (transaction) => {
    const [credentialSnapshot, connectionSnapshot] = await Promise.all([
      transaction.get(credentialRef), transaction.get(connectionRef),
    ]);
    const currentCredential = credentialSnapshot.data();
    const currentConnection = connectionSnapshot.data();
    if (!currentCredential || currentCredential.businessUid !== businessUid ||
        currentCredential.provider !== "x" ||
        currentConnection?.credentialId !== credentialRef.id ||
        currentConnection?.providerUserId !== expectedProviderUserId) {
      throw new Error("x_connection_credential_missing");
    }
    const claim = socialOAuth.beginCredentialRefresh({credential: currentCredential,
      leaseId, now});
    transaction.update(credentialRef, {...claim.update, updatedAt: FieldValue.serverTimestamp()});
    transaction.set(connectionRef, {tokenHealth: "refreshing",
      updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {credential: currentCredential, connection: currentConnection,
      expectedGeneration: claim.expectedGeneration};
  });
  let tokens, account, tokenAad;
  let rotationPersisted = false;
  let persistedGeneration = null;
  try {
    account = socialOAuth.decryptJson(claimed.credential.accountEnvelope,
      socialOAuthEncryptionKey.value(), `${businessUid}:x:${connection.credentialId}`);
    if (account.accountId !== expectedProviderUserId) throw new Error("x_account_mismatch");
    tokenAad = `${businessUid}:x:${account.accountId}`;
    const storedTokens = socialOAuth.decryptJson(claimed.credential.tokenEnvelope,
      socialOAuthEncryptionKey.value(), tokenAad);
    const expectedScopes = socialOAuth.exactScopeSet(claimed.connection.grantedScopes,
      ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"]);
    tokens = await socialOAuth.refreshTokens({provider: "x", tokens: storedTokens,
      config, clientSecret});
    let scopeMismatch = false;
    if (tokens.grantedScopes) {
      try { socialOAuth.exactScopeSet(tokens.grantedScopes, expectedScopes); } catch (_) {
        scopeMismatch = true;
      }
    }
    const secretFields = {...tokens};
    delete secretFields.refreshed;
    delete secretFields.grantedScopes;
    const completedAt = Date.now();
    persistedGeneration = await db.runTransaction(async (transaction) => {
      const [credentialSnapshot, connectionSnapshot] = await Promise.all([
        transaction.get(credentialRef), transaction.get(connectionRef),
      ]);
      const currentCredential = credentialSnapshot.data();
      const currentConnection = connectionSnapshot.data();
      if (currentConnection?.credentialId !== credentialRef.id ||
          currentConnection?.providerUserId !== expectedProviderUserId) {
        throw new Error("social_oauth_stale_refresh_generation");
      }
      const completed = socialOAuth.completeCredentialRefresh({credential: currentCredential,
        leaseId, expectedGeneration: claimed.expectedGeneration, now: completedAt,
        expiresIn: tokens.expiresIn});
      const nextConnectionRevision = socialOAuth.connectionRevision(currentConnection) + 1;
      transaction.update(credentialRef, {...completed,
        schemaVersion: "SocialConnectionCredentialV2",
        connectionRevision: nextConnectionRevision,
        tokenHealth: "validating",
        tokenEnvelope: socialOAuth.encryptJson(secretFields,
            socialOAuthEncryptionKey.value(), tokenAad),
        grantedScopes: expectedScopes,
        refreshLeaseId: FieldValue.delete(), refreshLeaseGeneration: FieldValue.delete(),
        refreshStartedAtMillis: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()});
      transaction.set(connectionRef, {status: "connected_write", tokenHealth: "validating",
        credentialRotationGeneration: completed.rotationGeneration,
        connectionRevision: nextConnectionRevision, grantedScopes: expectedScopes,
        lastCredentialRefreshAtMillis: completedAt,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return completed.rotationGeneration;
    });
    rotationPersisted = true;
    if (scopeMismatch) throw new Error("social_oauth_scope_mismatch");
    const identity = await socialOAuth.readProviderIdentity({provider: "x", tokens});
    if (identity.accountId !== expectedProviderUserId) {
      throw new Error("x_account_mismatch");
    }
    await db.runTransaction(async (transaction) => {
      const [credentialSnapshot, connectionSnapshot] = await Promise.all([
        transaction.get(credentialRef), transaction.get(connectionRef)]);
      if (connectionSnapshot.data()?.credentialId !== credentialRef.id ||
          connectionSnapshot.data()?.providerUserId !== expectedProviderUserId) {
        throw new Error("social_oauth_stale_refresh_generation");
      }
      if (socialOAuth.credentialGeneration(credentialSnapshot.data()) !== persistedGeneration) {
        throw new Error("social_oauth_stale_refresh_generation");
      }
      transaction.update(credentialRef, {tokenHealth: "healthy",
        refreshState: "healthy", updatedAt: FieldValue.serverTimestamp()});
      transaction.set(connectionRef, {status: "connected_write", tokenHealth: "healthy",
        lastIdentityVerifiedAtMillis: Date.now(), updatedAt: FieldValue.serverTimestamp()},
      {merge: true});
    });
    return {account, identity, tokens, rotationGeneration: persistedGeneration};
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const [credentialSnapshot, connectionSnapshot] = await Promise.all([
        transaction.get(credentialRef), transaction.get(connectionRef),
      ]);
      const currentCredential = credentialSnapshot.data();
      const currentConnection = connectionSnapshot.data();
      if (currentConnection?.credentialId !== credentialRef.id ||
          currentConnection?.providerUserId !== expectedProviderUserId) return;
      if (!rotationPersisted && currentCredential?.refreshLeaseId === leaseId) {
        const failed = socialOAuth.failCredentialRefresh({credential: currentCredential,
          leaseId, expectedGeneration: claimed.expectedGeneration, now: Date.now()});
        transaction.update(credentialRef, {...failed,
          refreshLeaseId: FieldValue.delete(), refreshLeaseGeneration: FieldValue.delete(),
          refreshStartedAtMillis: FieldValue.delete(),
          lastRefreshFailure: safeRefreshFailure(error), updatedAt: FieldValue.serverTimestamp()});
        transaction.set(connectionRef, {status: "reauth_required", tokenHealth: "needs_attention",
          connectionRevision: socialOAuth.connectionRevision(currentConnection) + 1,
          lastRefreshFailure: safeRefreshFailure(error),
          updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      } else if (rotationPersisted &&
          socialOAuth.credentialGeneration(currentCredential) === persistedGeneration) {
        transaction.update(credentialRef, {tokenHealth: "needs_attention",
          lastRefreshFailure: safeRefreshFailure(error), updatedAt: FieldValue.serverTimestamp()});
        transaction.set(connectionRef, {status: "reauth_required", tokenHealth: "needs_attention",
          connectionRevision: socialOAuth.connectionRevision(currentConnection) + 1,
          lastRefreshFailure: safeRefreshFailure(error), updatedAt: FieldValue.serverTimestamp()},
        {merge: true});
      }
    }).catch(() => {});
    throw error;
  }
}

function firstXProductionSuccessorRefs() {
  const versionRef = db.collection("socialContentVersions")
    .doc(xFirstPublish.PRODUCTION_VERSION_DOCUMENT_ID);
  const qualityRef = db.collection("socialContentQualityAssessments")
    .doc(xFirstPublish.PRODUCTION_VERSION_DOCUMENT_ID);
  const mediaRef = db.collection("socialMediaLibraries").doc(xFirstPublish.BUSINESS_UID)
    .collection("items").doc(xFirstPublish.PRODUCTION_MEDIA_ID);
  const approvalRef = db.collection("socialExternalApprovalIntents")
    .doc("social_approval_intent_f7eb91c8b7955f9c78899bb186a6bb38afa8ed7310173d2211ceca84dba405b7");
  const jobRef = db.collection("socialPublishingJobs")
    .doc("social_replacement_a69427db9c7b3a34c64cfb72b01e8196565b2c7e38e06ca9312874f7e86ffc78");
  const originalJobRef = db.collection("socialPublishingJobs")
    .doc(xFirstPublish.ORIGINAL_HISTORICAL_JOB_ID);
  const originalApprovalRef = db.collection("socialExternalApprovals")
    .doc("social_approval_e280103ba4c99550880d934d4f50506cdc757b0c17db63a668997fb792084164");
  return {versionRef, qualityRef, mediaRef, approvalRef, jobRef,
    originalJobRef, originalApprovalRef};
}

function firstXProductionSuccessorPublishMode(request) {
  if (request.method !== "POST") throw new Error("method_not_allowed");
  const url = String(request.originalUrl || request.url || "");
  if (url.includes("?")) throw new Error("empty_request_required");
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const keys = Object.keys(body);
  if (!keys.length) return "execute";
  if (keys.length === 1 && body.mode === "preflight") return "preflight";
  throw new Error("empty_request_required");
}

function assertFirstXProductionSuccessorState({version, quality, media, approval, job,
  requireApproved = false}) {
  const expectedApproval = xFirstPublish.productionApprovalIntent({version,
    qualityAssessment: quality});
  const expectedJob = xFirstPublish.productionReplacementJob({version,
    approvalIntent: expectedApproval});
  const rendered = version?.variants?.[0]?.renderedCopy;
  if (expectedApproval.id !==
      "social_approval_intent_f7eb91c8b7955f9c78899bb186a6bb38afa8ed7310173d2211ceca84dba405b7" ||
      expectedJob.id !==
      "social_replacement_a69427db9c7b3a34c64cfb72b01e8196565b2c7e38e06ca9312874f7e86ffc78" ||
      version?.variants?.[0]?.responseAssetId !== xFirstPublish.PRODUCTION_RESPONSE_ASSET_ID ||
      rendered !== xFirstPublish.renderPostText(xFirstPublish.PRODUCTION_RESPONSE_URL) ||
      quality?.score !== 78 || quality?.qualityBand !== "good" ||
      quality?.recommendation !== "keep" || quality?.readyToPublish !== true ||
      media?.mediaAssetId !== xFirstPublish.PRODUCTION_MEDIA_ID ||
      media?.sha256 !== xFirstPublish.MEDIA_SHA256 || media?.stagingReferenceCount !== 0 ||
      approval?.approvalHash !== expectedApproval.record.approvalHash ||
      job?.bindingHash !== expectedJob.record.bindingHash ||
      job?.replacesPostId !== xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID ||
      Number(job?.attemptCount) !== 0 || Number(job?.providerCreateAttemptCount) !== 0 ||
      job?.providerPostId != null || job?.replacementProviderPostId != null ||
      !job?.reusedProviderMediaId) {
    throw new Error("x_v4_exact_state_mismatch");
  }
  xFirstPublish.assertNoStagingReference({version, media, approval, job});
  const expectedStatus = requireApproved ? "approved_for_execution" : "awaiting_founder_approval";
  if (approval.status !== expectedStatus || job.status !== expectedStatus ||
      approval.externalExecutionAllowed !== requireApproved ||
      approval.providerMutationAuthorized !== requireApproved ||
      job.externalExecutionAllowed !== requireApproved ||
      (requireApproved ? job.providerMutationAuthorized !== true :
        job.providerMutationAuthorized === true)) {
    throw new Error("x_v4_approval_state_mismatch");
  }
  return {expectedApproval, expectedJob, renderedCopy: rendered};
}

exports.approveFirstXProductionSuccessorV4 = onRequest(
  {invoker: "private", cors: false, maxInstances: 1},
  async (request, response) => {
    try { xFirstPublish.assertProductionSuccessorHttpRequest(request); } catch (error) {
      return response.status(String(error?.message || "").includes("method") ? 405 : 400)
        .json({error: "empty_post_required"});
    }
    if (runtimeEnvironment() !== "staging" ||
        String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "") !==
          "scaledcircle-staging") return response.status(403).json({error: "unavailable"});
    const refs = firstXProductionSuccessorRefs();
    const [version, quality, media, approval, job] = await Promise.all([
      refs.versionRef.get(), refs.qualityRef.get(), refs.mediaRef.get(),
      refs.approvalRef.get(), refs.jobRef.get(),
    ]);
    try {
      assertFirstXProductionSuccessorState({version: version.data(), quality: quality.data(),
        media: media.data(), approval: approval.data(), job: job.data()});
    } catch (_) { return response.status(409).json({error: "exact_v4_gate_failed"}); }
    await db.runTransaction(async (transaction) => {
      const [currentApproval, currentJob, currentVersion] = await Promise.all([
        transaction.get(refs.approvalRef), transaction.get(refs.jobRef),
        transaction.get(refs.versionRef),
      ]);
      assertFirstXProductionSuccessorState({version: currentVersion.data(), quality: quality.data(),
        media: media.data(), approval: currentApproval.data(), job: currentJob.data()});
      transaction.update(refs.approvalRef, {status: "approved_for_execution",
        externalExecutionAllowed: true, providerMutationAuthorized: true,
        approvedBy: "FOUNDER_EXPLICIT_APPROVAL", approvedAt: FieldValue.serverTimestamp(),
        approvalScope: "one_exact_x_v4_replacement"});
      transaction.update(refs.jobRef, {status: "approved_for_execution",
        externalExecutionAllowed: true, providerMutationAuthorized: true,
        approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      transaction.update(refs.versionRef, {founderPublicationApproved: true,
        founderPublicationApprovalIntentId: refs.approvalRef.id,
        founderPublicationApprovedAt: FieldValue.serverTimestamp()});
    });
    return response.status(200).json({result: {approvalIntentId: refs.approvalRef.id,
      publishJobId: refs.jobRef.id, version: "sc_x_20260903_mapping_v1:v4",
      status: "approved_for_execution", externalExecutionAllowed: true,
      providerMutationAuthorized: true, attemptCount: 0, providerPostId: null}});
  },
);

exports.publishFirstXProductionSuccessorV4 = onRequest(
  {invoker: "private", cors: false, maxInstances: 1, timeoutSeconds: 60,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request, response) => {
    let mode;
    try { mode = firstXProductionSuccessorPublishMode(request); } catch (error) {
      return response.status(String(error?.message || "").includes("method") ? 405 : 400)
        .json({error: "empty_or_fixed_preflight_post_required"});
    }
    if (runtimeEnvironment() !== "staging" ||
        String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "") !==
          "scaledcircle-staging") return response.status(403).json({error: "unavailable"});
    const refs = firstXProductionSuccessorRefs();
    const connectionRef = db.collection("socialConnections").doc(xFirstPublish.BUSINESS_UID)
      .collection("providers").doc("x");
    const [version, quality, media, approval, job, connection, originalJob,
      originalApproval, possibleDuplicates] =
      await Promise.all([refs.versionRef.get(), refs.qualityRef.get(), refs.mediaRef.get(),
        refs.approvalRef.get(), refs.jobRef.get(), connectionRef.get(),
        refs.originalJobRef.get(), refs.originalApprovalRef.get(),
        db.collection("socialPublishingJobs")
          .where("replacesPostId", "==", xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID).limit(10).get()]);
    let gate;
    let historicalEvidence;
    try {
      gate = assertFirstXProductionSuccessorState({version: version.data(), quality: quality.data(),
        media: media.data(), approval: approval.data(), job: job.data(), requireApproved: true});
      xFirstPublish.assertWriteConnection(connection.data());
      historicalEvidence = xFirstPublish.assertHistoricalDeletionEvidence({
        originalJob: {id: originalJob.id, ...originalJob.data()},
        originalApproval: {id: originalApproval.id, ...originalApproval.data()},
        replacementJob: job.data(), version: version.data(), connection: connection.data()});
      if (possibleDuplicates.docs.some((doc) => doc.id !== refs.jobRef.id &&
          (doc.data()?.providerPostId || doc.data()?.replacementProviderPostId))) {
        throw new Error("x_v4_duplicate_replacement_exists");
      }
    } catch (_) { return response.status(409).json({error: "exact_v4_gate_failed"}); }
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const tokens = (await refreshStoredXCredential({businessUid: xFirstPublish.BUSINESS_UID,
      connectionRef, connection: connection.data(), config,
      clientSecret: providerSecretBinding("x").secret.value()})).tokens;
    const original = await xFirstPublish.inspectHistoricalPost({accessToken: tokens.accessToken,
      providerPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID});
    let historicalAuthority;
    try {
      historicalAuthority = xFirstPublish.authorizeHistoricalReplacement({
        inspection: original, historicalEvidence});
    } catch (_) {
      return response.status(409).json({error: "original_post_identity_conflict",
        classification: original.classification});
    }
    if (!historicalAuthority.authorized) {
      return response.status(409).json({error: "founder_deleted_post_still_exists"});
    }
    const existing = await xFirstPublish.reconcilePost({accessToken: tokens.accessToken,
      renderedCopy: gate.renderedCopy, startedAt: Date.now() - 7 * 24 * 60 * 60 * 1000});
    if (existing.status === "found") {
      return response.status(409).json({error: "replacement_already_exists"});
    }
    if (mode === "preflight") {
      return response.status(200).json({result: {status: "ready_for_founder_approval",
        providerMutationCount: 0, originalProviderState: original.status,
        originalProviderClassification: original.classification,
        historicalAuthority: historicalAuthority.authority,
        historicalDeletionEvidenceAccepted: true,
        originalProviderPostId: historicalEvidence.originalProviderPostId,
        expectedProviderAccountId: historicalEvidence.expectedProviderAccountId,
        version: "sc_x_20260903_mapping_v1:v4", attemptCount: 0,
        providerCreateAttemptCount: 0, duplicateReplacementCount: 0}});
    }
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(refs.jobRef);
      if (current.data()?.status !== "approved_for_execution" ||
          Number(current.data()?.attemptCount) !== 0 || current.data()?.providerPostId != null) {
        throw new Error("x_v4_job_already_claimed");
      }
      transaction.update(refs.jobRef, {status: "creating", attemptCount: 1,
        providerCreateAttemptCount: 1, providerMutationCount: 1,
        createStartedAtMillis: Date.now(), updatedAt: FieldValue.serverTimestamp()});
    });
    try {
      const created = await xFirstPublish.createReplacementPost({accessToken: tokens.accessToken,
        renderedCopy: gate.renderedCopy, mediaId: job.data().reusedProviderMediaId});
      const receiptId = `social_replacement_receipt_${xFirstPublish.digest({
        publishJobId: refs.jobRef.id, providerPostId: created.providerPostId})}`;
      const receiptRef = db.collection("socialProviderReceipts").doc(receiptId);
      const batch = db.batch();
      batch.create(receiptRef, {schemaVersion: "SocialProviderReplacementReceiptV2",
        businessUid: xFirstPublish.BUSINESS_UID, provider: "x",
        publishJobId: refs.jobRef.id, providerPostId: created.providerPostId,
        providerPostUrl: created.providerPostUrl, providerTextHash: created.providerTextHash,
        contentItemId: xFirstPublish.CONTENT_ITEM_ID,
        contentVersionId: "sc_x_20260903_mapping_v1:v4", version: 4,
        mediaAssetId: xFirstPublish.PRODUCTION_MEDIA_ID,
        mediaSha256: xFirstPublish.MEDIA_SHA256,
        responseAssetId: xFirstPublish.PRODUCTION_RESPONSE_ASSET_ID,
        replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
        replacementReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
        originalDeletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
        status: "accepted", immutable: true, createdAt: FieldValue.serverTimestamp()});
      batch.update(refs.jobRef, {status: "completed", providerPostId: created.providerPostId,
        providerPostUrl: created.providerPostUrl, providerReceiptId: receiptId,
        externalExecutionAllowed: false, providerMutationAuthorized: false,
        reconciliationRequired: false, completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()});
      batch.update(refs.approvalRef, {status: "consumed", externalExecutionAllowed: false,
        providerMutationAuthorized: false, consumedByJobId: refs.jobRef.id,
        consumedAt: FieldValue.serverTimestamp()});
      batch.update(db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID), {
        status: "published", currentVersion: 4,
        currentVersionId: xFirstPublish.PRODUCTION_VERSION_DOCUMENT_ID,
        providerState: "published_verified", providerPostId: created.providerPostId,
        responseAssetId: xFirstPublish.PRODUCTION_RESPONSE_ASSET_ID,
        mediaAssetId: xFirstPublish.PRODUCTION_MEDIA_ID,
        replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
        replacementReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
        updatedAt: FieldValue.serverTimestamp()});
      await batch.commit();
      let publicVerification = "provider_receipt_only";
      try {
        const verified = await xFirstPublish.lookupPost({accessToken: tokens.accessToken,
          providerPostId: created.providerPostId});
        if (verified.status === "found" && verified.text === gate.renderedCopy) {
          publicVerification = "provider_readback_verified";
          await refs.jobRef.update({publicVerification,
            verifiedAt: FieldValue.serverTimestamp()});
        }
      } catch (_) { /* receipt remains authoritative; later read-only reconciliation is safe */ }
      return response.status(200).json({result: {publishJobId: refs.jobRef.id,
        status: "completed", providerPostId: created.providerPostId,
        providerPostUrl: created.providerPostUrl, providerReceiptId: receiptId,
        publicVerification, attemptCount: 1, providerCreateAttemptCount: 1,
        duplicateReplacementCount: 0}});
    } catch (error) {
      await refs.jobRef.set({status: "unknown_provider_outcome", reconciliationRequired: true,
        externalExecutionAllowed: false, providerMutationAuthorized: false,
        safeFailure: readText(error?.message || error, 120),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      await refs.approvalRef.set({externalExecutionAllowed: false,
        providerMutationAuthorized: false}, {merge: true});
      return response.status(409).json({error: "provider_outcome_requires_reconciliation"});
    }
  },
);

exports.reconcileFirstXProductionSuccessorV4 = onRequest(
  {invoker: "private", cors: false, maxInstances: 1, timeoutSeconds: 60,
    secrets: [socialOAuthEncryptionKey, providerSecretBinding("x").secret]},
  async (request, response) => {
    try { xFirstPublish.assertProductionSuccessorHttpRequest(request); } catch (error) {
      return response.status(String(error?.message || "").includes("method") ? 405 : 400)
        .json({error: "empty_post_required"});
    }
    if (runtimeEnvironment() !== "staging" ||
        String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "") !==
          "scaledcircle-staging") return response.status(403).json({error: "unavailable"});
    const refs = firstXProductionSuccessorRefs();
    const connectionRef = db.collection("socialConnections").doc(xFirstPublish.BUSINESS_UID)
      .collection("providers").doc("x");
    const [version, quality, media, approval, job, connection, possibleDuplicates] =
      await Promise.all([refs.versionRef.get(), refs.qualityRef.get(), refs.mediaRef.get(),
        refs.approvalRef.get(), refs.jobRef.get(), connectionRef.get(),
        db.collection("socialPublishingJobs")
          .where("replacesPostId", "==", xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID).limit(10).get()]);
    const jobData = job.data() || {};
    try {
      assertFirstXProductionSuccessorState({version: version.data(), quality: quality.data(),
        media: media.data(), approval: {...approval.data(), status: "approved_for_execution",
          externalExecutionAllowed: true, providerMutationAuthorized: true},
        job: {...jobData, status: "approved_for_execution", attemptCount: 0,
          providerCreateAttemptCount: 0, providerPostId: null, replacementProviderPostId: null,
          externalExecutionAllowed: true, providerMutationAuthorized: true}, requireApproved: true});
      xFirstPublish.assertWriteConnection(connection.data());
      if (jobData.status !== "unknown_provider_outcome" ||
          Number(jobData.attemptCount) !== 1 || Number(jobData.providerCreateAttemptCount) !== 1 ||
          jobData.providerPostId != null || jobData.replacementProviderPostId != null ||
          jobData.reconciliationRequired !== true || jobData.safeFailure !== "x_post_receipt_mismatch" ||
          jobData.externalExecutionAllowed !== false || jobData.providerMutationAuthorized !== false) {
        throw new Error("x_v4_reconciliation_state_mismatch");
      }
      if (possibleDuplicates.docs.some((doc) => doc.id !== refs.jobRef.id &&
          (doc.data()?.providerPostId || doc.data()?.replacementProviderPostId))) {
        throw new Error("x_v4_duplicate_replacement_exists");
      }
    } catch (_) { return response.status(409).json({error: "exact_v4_reconciliation_gate_failed"}); }
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const tokens = (await refreshStoredXCredential({businessUid: xFirstPublish.BUSINESS_UID,
      connectionRef, connection: connection.data(), config,
      clientSecret: providerSecretBinding("x").secret.value()})).tokens;
    const renderedCopy = version.data()?.variants?.[0]?.renderedCopy;
    let reconciled = await xFirstPublish.reconcilePost({accessToken: tokens.accessToken,
      renderedCopy, startedAt: Number(jobData.createStartedAtMillis || 0) - 60000,
      endedAt: Date.now() + 60000});
    const safeDiagnostics = {recentStatus: reconciled.status, observedStatus: null,
      observedIdMatches: false, mediaAttachmentCount: 0, textMatches: false,
      entityUrlCount: 0};
    if (reconciled.status !== "found") {
      const exactObservedPostId = "2095896483010662816";
      const observed = await xFirstPublish.lookupPost({accessToken: tokens.accessToken,
        providerPostId: exactObservedPostId});
      const mediaKeys = Array.isArray(observed.attachments?.media_keys) ?
        observed.attachments.media_keys : [];
      const mediaEntityCount = xFirstPublish.providerMediaEntityCount(observed.entities);
      const textMatches = xFirstPublish.providerTextMatchesRendered({providerText: observed.text,
        renderedCopy, entities: observed.entities});
      Object.assign(safeDiagnostics, {observedStatus: observed.status,
        observedIdMatches: observed.providerPostId === exactObservedPostId,
        mediaAttachmentCount: mediaKeys.length, mediaEntityCount, textMatches,
        entityUrlCount: Array.isArray(observed.entities?.urls) ? observed.entities.urls.length : 0});
      if (observed.status === "found" &&
          (mediaKeys.length === 1 || mediaEntityCount === 1) && textMatches) {
        reconciled = {status: "found", providerPostId: exactObservedPostId,
          providerPostUrl: observed.providerPostUrl, createdAt: observed.createdAt};
      }
    }
    if (reconciled.status !== "found") return response.status(409).json({result: {
      status: "unknown_provider_outcome", retryAuthorized: false, providerMutationCount: 0,
      safeDiagnostics}});
    const receiptId = `social_replacement_receipt_${xFirstPublish.digest({
      publishJobId: refs.jobRef.id, providerPostId: reconciled.providerPostId})}`;
    const receiptRef = db.collection("socialProviderReceipts").doc(receiptId);
    try {
      await db.runTransaction(async (transaction) => {
        const [currentJob, currentReceipt] = await Promise.all([
          transaction.get(refs.jobRef), transaction.get(receiptRef),
        ]);
        const current = currentJob.data() || {};
        if (currentReceipt.exists || current.status !== "unknown_provider_outcome" ||
            Number(current.attemptCount) !== 1 || Number(current.providerCreateAttemptCount) !== 1 ||
            current.providerPostId != null || current.reconciliationRequired !== true) {
          throw new Error("x_v4_reconciliation_conflict");
        }
        transaction.create(receiptRef, {schemaVersion: "SocialProviderReplacementReceiptV2",
          businessUid: xFirstPublish.BUSINESS_UID, provider: "x",
          publishJobId: refs.jobRef.id, providerPostId: reconciled.providerPostId,
          providerPostUrl: reconciled.providerPostUrl,
          providerTextHash: xFirstPublish.digest(renderedCopy),
          contentItemId: xFirstPublish.CONTENT_ITEM_ID,
          contentVersionId: "sc_x_20260903_mapping_v1:v4", version: 4,
          mediaAssetId: xFirstPublish.PRODUCTION_MEDIA_ID,
          mediaSha256: xFirstPublish.MEDIA_SHA256,
          responseAssetId: xFirstPublish.PRODUCTION_RESPONSE_ASSET_ID,
          replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
          replacementReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
          originalDeletionSource: xFirstPublish.ORIGINAL_DELETION_SOURCE,
          status: "reconciled", immutable: true, createdAt: FieldValue.serverTimestamp()});
        transaction.update(refs.jobRef, {status: "completed",
          providerPostId: reconciled.providerPostId, providerPostUrl: reconciled.providerPostUrl,
          providerReceiptId: receiptId, externalExecutionAllowed: false,
          providerMutationAuthorized: false, reconciliationRequired: false,
          publicVerification: "provider_readback_reconciled",
          reconciledAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()});
        transaction.update(refs.approvalRef, {status: "consumed", externalExecutionAllowed: false,
          providerMutationAuthorized: false, consumedByJobId: refs.jobRef.id,
          consumedAt: FieldValue.serverTimestamp()});
        transaction.update(db.collection("socialContentItems").doc(xFirstPublish.CONTENT_ITEM_ID), {
          status: "published", currentVersion: 4,
          currentVersionId: xFirstPublish.PRODUCTION_VERSION_DOCUMENT_ID,
          providerState: "published_verified", providerPostId: reconciled.providerPostId,
          responseAssetId: xFirstPublish.PRODUCTION_RESPONSE_ASSET_ID,
          mediaAssetId: xFirstPublish.PRODUCTION_MEDIA_ID,
          replacesPostId: xFirstPublish.ORIGINAL_DEFECTIVE_POST_ID,
          replacementReason: xFirstPublish.ORIGINAL_DEFECT_REASON,
          updatedAt: FieldValue.serverTimestamp()});
      });
    } catch (_) { return response.status(409).json({error: "x_v4_reconciliation_conflict"}); }
    return response.status(200).json({result: {publishJobId: refs.jobRef.id,
      status: "completed", providerPostId: reconciled.providerPostId,
      providerPostUrl: reconciled.providerPostUrl, providerReceiptId: receiptId,
      publicVerification: "provider_readback_reconciled", attemptCount: 1,
      providerCreateAttemptCount: 1, providerMutationCount: 0,
      duplicateReplacementCount: 0, reconciled: true}});
  },
);

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
      const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
      const tokens = (await refreshStoredXCredential({businessUid: business.uid,
        connectionRef: connection.ref, connection: connectionData, config,
        clientSecret: providerSecretBinding("x").secret.value()})).tokens;
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
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const tokens = (await refreshStoredXCredential({businessUid: business.uid,
      connectionRef, connection: connectionData, config,
      clientSecret: providerSecretBinding("x").secret.value()})).tokens;
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
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const tokens = (await refreshStoredXCredential({businessUid: business.uid,
      connectionRef, connection: connectionData, config,
      clientSecret: providerSecretBinding("x").secret.value()})).tokens;
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
      const configSnapshot = await providerConfigRef("x", "staging").get();
      const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
      const connectionRef = db.collection("socialConnections").doc(business.uid)
        .collection("providers").doc("x");
      const tokens = (await refreshStoredXCredential({businessUid: business.uid,
        connectionRef, connection: connectionData, config,
        clientSecret: providerSecretBinding("x").secret.value()})).tokens;
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
    const configSnapshot = await providerConfigRef("x", "staging").get();
    const config = socialOAuth.validateProviderConfig({...configSnapshot.data(), provider: "x"});
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc("x");
    const tokens = (await refreshStoredXCredential({businessUid: business.uid,
      connectionRef, connection: connectionData, config,
      clientSecret: providerSecretBinding("x").secret.value()})).tokens;
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

exports.prepareCustomerSocialPlanV1 = onCall({enforceAppCheck:false,maxInstances:2},async request=>{
  const business=await requireSocialOperationsBusiness(request);
  if(!metaCustomer.available(business,process.env.SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS))throw new HttpsError('permission-denied','This planning pilot is private.');
  if(Object.keys(request.data||{}).length)throw new HttpsError('invalid-argument','Plans use your saved Business context.');
  const [profile,geography,connections]=await Promise.all([db.doc('businessGrowthProfiles/'+business.uid).get(),
    db.doc('discoveryPreferences/'+business.uid).get(),db.collection('socialConnections').doc(business.uid).collection('providers').get()]);
  let plan;
  try{plan=require('./social_customer_plan').prepare({uid:business.uid,planId:business.planId,profile:profile.data(),
    scope:require('./growth_geography').serviceAreaScope(geography.data(),business.uid),
    connections:connections.docs.map(d=>({provider:d.id,...d.data()}))});}
  catch(_){throw new HttpsError('failed-precondition','Review your Business profile, saved service areas and connected Social accounts first.');}
  return db.runTransaction(async tx=>{
    const marker=db.doc('socialPlanningRuns/customer_initial_'+business.uid),previous=await tx.get(marker);
    if(previous.exists)return {planId:previous.data().planId,reused:true,externalPublishingEnabled:false};
    tx.create(db.doc('socialContentPlans/'+plan.id),{...plan.record,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    for(const item of plan.record.items){const id=plan.id+'_'+item.itemKey;
      tx.create(db.doc('socialContentItems/'+id),{schemaVersion:socialOperations.SCHEMA_VERSION,businessUid:business.uid,
        planId:plan.id,itemKey:item.itemKey,status:'ready_for_review',currentVersion:1,
        scheduledFor:Timestamp.fromDate(new Date(item.scheduledFor)),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(db.doc('socialContentVersions/'+id+'_v1'),{...socialOperations.contentItemVersion({businessUid:business.uid,planId:plan.id,item}),
        scheduledFor:Timestamp.fromDate(new Date(item.scheduledFor)),createdAt:FieldValue.serverTimestamp()});
    }
    tx.create(marker,{businessUid:business.uid,planId:plan.id,actorUid:business.uid,createdAt:FieldValue.serverTimestamp(),executionAuthorized:false});
    return {planId:plan.id,itemCount:plan.record.items.length,reused:false,externalPublishingEnabled:false};
  });
});

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
    // A customer strategy approval is not approval of unfinished post creative.
    // Keep the legacy workflow separate and pin the decision to the reviewed version.
    const strategyResult = await db.runTransaction(async tx => {
      const snapshot = await tx.get(planRef);
      const record = snapshot.data();
      if (record?.strategy?.version !== 'CustomerSocialDraftStrategyV1') return null;
      if (record.businessUid !== business.uid) throw new HttpsError('permission-denied', 'This plan is not in your Business.');
      if (Number(request.data?.planVersion) !== Number(record.planVersion)) throw new HttpsError('failed-precondition', 'Review the latest plan before approving.');
      if (record.status === 'approved' && record.approvedVersion === record.planVersion) return {planId,status:'approved',duplicate:true,approvedItemCount:0,externalPublishingEnabled:false};
      let approved;
      try { approved = socialOperations.approvePlan({businessUid:business.uid,record,planVersion:request.data?.planVersion}); }
      catch (_) { throw new HttpsError('failed-precondition', 'Review the latest plan before approving.'); }
      tx.update(planRef,{status:approved.status,approvedVersion:approved.approvedVersion,approvedByUid:business.uid,approvedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      return {planId,status:'approved',approvedItemCount:0,externalPublishingEnabled:false};
    });
    if (strategyResult) return strategyResult;
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
    if (!launchAvailability.canUseMarketingEmail(business)) throw new HttpsError('failed-precondition', 'Email Marketing is Coming Soon.');
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
        writeScopesEnabled: doc.data().writeScopesEnabled === true,
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
      if (environment === "production") {
        const exactRequest = request.data?.provider === PRODUCTION_X_PROVIDER_CONFIG.provider &&
          request.data?.clientId === PRODUCTION_X_PROVIDER_CONFIG.clientId &&
          request.data?.redirectUri === PRODUCTION_X_PROVIDER_CONFIG.redirectUri &&
          request.data?.appName === PRODUCTION_X_PROVIDER_CONFIG.appName &&
          request.data?.enabled === true && request.data?.historicalSyncEnabled === true;
        if (!exactRequest) throw new Error("production_x_provider_config_mismatch");
        config = socialOAuth.validateProviderConfig({
          ...PRODUCTION_X_PROVIDER_CONFIG,
          environment,
          enabled: true,
          historicalSyncEnabled: true,
          writeScopesEnabled: true,
          externalPublishingEnabled: false,
        });
      } else {
        config = socialOAuth.validateProviderConfig({
          provider: request.data?.provider,
          clientId: request.data?.clientId,
          redirectUri: request.data?.redirectUri,
          environment,
          enabled: request.data?.enabled === true,
          historicalSyncEnabled: request.data?.historicalSyncEnabled === true,
          writeScopesEnabled: request.data?.writeScopesEnabled === true,
          externalPublishingEnabled: false,
          appName: request.data?.appName,
        });
      }
    } catch (_) {
      throw new HttpsError("invalid-argument", "Review the provider configuration and try again.");
    }
    await providerConfigRef(config.provider, environment).set({
      schemaVersion: "SocialProviderConfigV1",
      ...config,
      writeScopesEnabled: config.writeScopesEnabled,
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
      writeScopesEnabled: config.writeScopesEnabled,
      externalPublishingEnabled: false,
    };
  },
);

exports.beginSocialOAuthConnectionV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4, secrets: [socialOAuthEncryptionKey]},
  async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    const provider = socialOAuth.normalizeProvider(request.data?.provider);
    if (!launchAvailability.canConnect(provider,business)) throw new HttpsError('failed-precondition', 'This channel is Coming Soon.');
    if (provider === "meta") await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue);
    const environment = runtimeEnvironment();
    const customerManaged = request.data?.capability === "managed_publishing";
    if (request.data?.capability && !customerManaged) throw new HttpsError("invalid-argument", "Choose a supported permission.");
    if (customerManaged && (provider !== "meta" || !metaCustomer.available(business, process.env.SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS))) {
      throw new HttpsError("permission-denied", "Managed publishing is not available for this workspace yet.");
    }
    let config, metaWrite, requestWriteScopes, proposed;
    try {
      config = metaConnection.connectionConfig(
        (await providerConfigRef(provider, environment).get()).data(), business.uid);
      metaWrite = !customerManaged && provider === "meta" && config?.writeScopesEnabled === true;
      const customerTarget = customerManaged ? metaCustomer.publishingTarget((await db.doc(
        `socialConnections/${business.uid}/providers/facebook`).get()).data()) : null;
      if (metaWrite) metaConnection.authorize(config, business.uid);
      requestWriteScopes = (provider === "x" || metaWrite) && config?.writeScopesEnabled === true;
      proposed = socialOAuth.createAttempt({
        businessUid: business.uid,
        provider,
        config,
        encryptionKey: socialOAuthEncryptionKey.value(),
        scopes: metaWrite || customerManaged ? socialOAuth.META_PUBLISH_SCOPES :
          requestWriteScopes ? socialOAuth.X_PUBLISH_SCOPES : null,
        customerTarget,
        purpose: customerManaged ? metaCustomer.PURPOSE : metaWrite ? "meta_connection_authority" :
          requestWriteScopes ? "x_connection_authority" : "read_only_connection",
        now: Date.now(),
      });
    } catch (error) {
      console.error(JSON.stringify({event: "social_oauth_begin_rejected",
        code: safeSocialOAuthFailureCode(error), provider, environment}));
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
        const reusable = socialOAuth.isReusableAttempt(pending,
          {businessUid: business.uid, provider, now: Date.now()});
        let exactPurposeAndScopes = false;
        if (reusable && pending.purpose === proposed.record.purpose) {
          try {
            socialOAuth.exactScopeSet(pending.requestedScopes, proposed.record.requestedScopes);
            exactPurposeAndScopes = true;
          } catch (_) {}
        }
        if (exactPurposeAndScopes) {
          return {attemptId: pendingAttemptId, record: pending, reused: true,
            authorizationUrl: socialOAuth.continuationUrl(pending, {businessUid: business.uid,
              provider, attemptId: pendingAttemptId,
              encryptionKey: socialOAuthEncryptionKey.value(), now: Date.now()})};
        }
        if (reusable) {
          transaction.update(pendingRef, {status: "superseded",
            supersededByAttemptId: proposed.attemptId,
            updatedAt: FieldValue.serverTimestamp()});
        }
      }
      const attemptRef = db.collection("socialOAuthAttempts").doc(proposed.attemptId);
      transaction.set(attemptRef, {...proposed.record,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()},
      {merge: false});
      if (customerManaged && (connection?.credentialId !== proposed.record.customerTarget.credentialId ||
          connection?.providerUserId !== proposed.record.customerTarget.pageId)) throw new HttpsError("failed-precondition", "Your Page changed. Review the connection first.");
      const preserveVerified = provider === "meta" && Boolean(connection?.credentialId) &&
        ["connected_read_only", "connected_write"].includes(connection?.status);
      transaction.set(connectionRef, {
        schemaVersion: socialOperations.SCHEMA_VERSION,
        provider: surface,
        status: preserveVerified ? connection.status : "authorizing",
        pendingAttemptId: proposed.attemptId,
        pendingManagedPublishing: customerManaged,
        ...(preserveVerified ? {} : {capabilities: {profile: false, analytics: false, publishText: false,
          publishImage: false, publishVideo: false, schedule: false}}),
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
      requestedScopes: resolved.record.requestedScopes,
      writeScopesRequested: requestWriteScopes,
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
        if (socialOAuth.isReusableAttempt(pending, {businessUid: business.uid, provider: "x",
          now: Date.now()})) {
          transaction.update(pendingRef, {status: "superseded",
            supersededByAttemptId: proposed.attemptId,
            updatedAt: FieldValue.serverTimestamp()});
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
    await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue, {attemptId});
    const attemptRef = db.collection("socialOAuthAttempts").doc(attemptId);
    const record = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(attemptRef);
      const current = snapshot.data();
      const now = Date.now();
      if (current?.businessUid === business.uid && current.provider === "x" &&
          !socialOAuth.isReusableAttempt(current, {businessUid: business.uid,
            provider: "x", now})) {
        const connectionRef = db.collection("socialConnections").doc(business.uid)
          .collection("providers").doc("x");
        const connection = (await transaction.get(connectionRef)).data() || {};
        if (connection.pendingAttemptId === attemptId) {
          transaction.set(connectionRef, {
            status: "reauth_required",
            tokenHealth: "needs_attention",
            pendingAttemptId: FieldValue.delete(),
            lastFailedAttemptId: attemptId,
            lastAuthorizationFailure: "attempt_expired",
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      }
      return current;
    });
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
      status: active ? record.status : ["error", "canceled", "expired", "connected_read_only", "connected_write"].includes(record.status) ? record.status : "expired",
      authorizationUrl: continueUrl,
      continuationAvailable: Boolean(continueUrl),
      candidates: active && Array.isArray(record.safeCandidates) ? record.safeCandidates : [],
      grantedScopes: Array.isArray(record.grantedScopes) ? record.grantedScopes : [],
      missingScopes: Array.isArray(record.missingScopes) ? record.missingScopes : [],
      writeScopesRequested: ["x_first_publish_certification", "x_connection_authority", "meta_connection_authority"]
        .includes(record.purpose),
      writeScopesGranted: ["x_first_publish_certification", "x_connection_authority", "meta_connection_authority"]
        .includes(record.purpose) &&
        Array.isArray(record.grantedScopes) &&
        (record.provider === "meta" ? socialOAuth.META_PUBLISH_SCOPES : xFirstPublish.X_WRITE_SCOPES)
          .every((scope) => record.grantedScopes.includes(scope)),
    };
  },
);

exports.cancelSocialOAuthAttemptV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async request => {
    const business = await requireSocialOperationsBusiness(request);
    const attemptId = readText(request.data?.attemptId, 128);
    const attempt = (await db.collection("socialOAuthAttempts").doc(attemptId).get()).data();
    if (!attempt || attempt.businessUid !== business.uid || attempt.provider !== "meta") {
      throw new HttpsError("not-found", "This Facebook connection attempt is unavailable.");
    }
    const changed = await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue,
      {attemptId, reason: "canceled"});
    return {canceled: changed};
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
    await db.runTransaction(async (transaction) => {
      const [currentAttemptSnapshot, currentConnectionSnapshot, currentCredentialSnapshot] =
        await Promise.all([transaction.get(attemptRef), transaction.get(connectionRef),
          transaction.get(credentialRef)]);
      const currentAttempt = currentAttemptSnapshot.data();
      const currentConnection = currentConnectionSnapshot.data() || {};
      const currentCredential = currentCredentialSnapshot.data() || {};
      if (currentConnection.pendingAttemptId !== attemptId ||
          currentAttempt?.status !== "identity_pending" ||
          currentAttempt.businessUid !== business.uid || currentAttempt.provider !== "x" ||
          Number(currentAttempt.expiresAtMillis || 0) <= Date.now()) {
        throw new Error("social_oauth_stale_connection_attempt");
      }
      socialOAuth.exactScopeSet(currentAttempt.grantedScopes, xFirstPublish.X_WRITE_SCOPES);
      const nextRevision = socialOAuth.connectionRevision(currentConnection) + 1;
      const nextGeneration = currentCredentialSnapshot.exists ?
        socialOAuth.credentialGeneration(currentCredential) + 1 : 1;
      transaction.set(credentialRef, {...selected.credentialRecord,
        rotationGeneration: nextGeneration, connectionRevision: nextRevision,
        accountEnvelope: socialOAuth.encryptJson(selected.privateAccount,
          socialOAuthEncryptionKey.value(), `${business.uid}:x:${credentialId}`),
        createdAt: currentCredential.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()}, {merge: false});
      transaction.set(connectionRef, {schemaVersion: socialOperations.SCHEMA_VERSION,
        provider: "x", status: "connected_write", tokenHealth: "healthy",
        connectionRevision: nextRevision, credentialRotationGeneration: nextGeneration,
        accountDisplayName: safe.accountDisplayName,
        accountType: safe.accountType, handle: safe.handle, providerAccountId: safe.candidateId,
        providerUserId: selected.privateAccount.accountId, credentialId,
        capabilities: safe.capabilities, grantedScopes: currentAttempt.grantedScopes,
        writeScopesGranted: true, externalPublishingEnabled: false,
        narrowCertificationContentItemId: xFirstPublish.CONTENT_ITEM_ID,
        narrowCertificationVersion: xFirstPublish.VERSION_NUMBER,
        environment: currentAttempt.environment,
        authorizationUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()}, {merge: false});
      transaction.update(attemptRef, {status: "connected_write", selectedCandidate: safe,
        candidateEnvelope: FieldValue.delete(), verifierEnvelope: FieldValue.delete(),
        connectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    });
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
    const writeConnection = attempt?.provider === "x" &&
      attempt?.purpose === "x_connection_authority";
    const metaWrite = attempt?.provider === "meta" && attempt?.purpose === "meta_connection_authority";
    const customerManaged = attempt?.provider === "meta" && attempt?.purpose === metaCustomer.PURPOSE;
    if (customerManaged && !metaCustomer.available(business, process.env.SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS)) throw new HttpsError("permission-denied", "Managed publishing is unavailable for this workspace.");
    if (!attempt || attempt.businessUid !== business.uid ||
        (attempt.purpose && !["read_only_connection", "x_connection_authority", "meta_connection_authority", metaCustomer.PURPOSE]
          .includes(attempt.purpose))) {
      throw new HttpsError("not-found", "The connection attempt is unavailable.");
    }
    if (!require('./social_launch_availability').canConnect(attempt.provider,business)) throw new HttpsError('failed-precondition','This channel is Coming Soon.');
    try {
      if (attempt.provider === "meta" && !metaWrite) {
        if (socialOAuth.readOnlyMetaScopes(attempt.grantedScopes).missing.length) {
          throw new Error("social_oauth_required_scope_missing");
        }
      } else socialOAuth.exactScopeSet(attempt.grantedScopes, metaWrite ? socialOAuth.META_PUBLISH_SCOPES :
        writeConnection ? socialOAuth.X_PUBLISH_SCOPES : socialOAuth.PROVIDER_SCOPES[attempt.provider]);
    } catch (_) {
      if (attempt.provider === "meta") await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue,
        {attemptId, reason: "required_access_missing"});
      throw new HttpsError("failed-precondition", attempt.provider === "meta" ?
        "Facebook wasn't connected. Try again." :
        "The provider did not grant the exact requested permissions.");
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
      if (attempt.provider === "meta") await oauthLifecycle.recoverMetaPending(db, business.uid, FieldValue, {attemptId});
      throw new HttpsError("failed-precondition", "Review and confirm the provider identity again.");
    }
    const credentialId = socialOAuth.digest(
      `${business.uid}:${attempt.provider}:${selected.privateAccount.accountId}`);
    const connectionRoot = db.collection("socialConnections").doc(business.uid)
      .collection("providers");
    if (metaWrite) {
      const credentialRef = db.collection("socialConnectionCredentials").doc(credentialId);
      const facebookRef = connectionRoot.doc("facebook");
      const instagramRef = connectionRoot.doc("instagram");
      await db.runTransaction(async (transaction) => {
        const [a, f, i, c, p] = await Promise.all([transaction.get(attemptRef),
          transaction.get(facebookRef), transaction.get(instagramRef), transaction.get(credentialRef),
          transaction.get(providerConfigRef("meta", runtimeEnvironment()))]);
        const current = a.data();
        metaConnection.confirmation({attempt: current, attemptId, businessUid: business.uid,
          environment: runtimeEnvironment(), config: p.data(), facebook: f.data(),
          instagram: i.data(), now: Date.now()});
        socialOAuth.exactScopeSet(current.grantedScopes, socialOAuth.META_PUBLISH_SCOPES);
        // Select again from the transaction's current encrypted attempt, never a stale pre-read.
        const chosen = socialOAuth.selectCandidate({attempt: current,
          candidateId: request.data?.candidateId, encryptionKey: socialOAuthEncryptionKey.value(),
          now: Date.now()});
        const revision = Math.max(socialOAuth.connectionRevision(f.data()),
          socialOAuth.connectionRevision(i.data())) + 1;
        const generation = c.exists ? socialOAuth.credentialGeneration(c.data()) + 1 : 1;
        transaction.set(credentialRef, {...chosen.credentialRecord,
          rotationGeneration: generation, connectionRevision: revision,
          accountEnvelope: socialOAuth.encryptJson(chosen.privateAccount,
            socialOAuthEncryptionKey.value(), `${business.uid}:meta:${credentialId}`),
          createdAt: c.data()?.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()}, {merge: false});
        for (const [surface, ref, id, name, handle] of [
          ["facebook", facebookRef, current.metaDogfood.pageId, current.metaDogfood.pageName, null],
          ["instagram", instagramRef, current.metaDogfood.instagramId,
            chosen.safeCandidate.linkedAccountDisplayName, current.metaDogfood.instagramUsername],
        ]) {
          transaction.set(ref, {schemaVersion: socialOperations.SCHEMA_VERSION,
            provider: surface, status: "connected_write", tokenHealth: "healthy",
            providerUserId: id, providerAccountId: id, accountDisplayName: name,
            accountType: surface === "facebook" ? "facebook_page" : "instagram_professional",
            handle, credentialId, connectionRevision: revision, credentialRotationGeneration: generation,
            grantedScopes: current.grantedScopes, writeScopesGranted: true,
            capabilities: metaConnection.capabilities(current.grantedScopes, surface),
            linkedPageId: current.metaDogfood.pageId,
            externalPublishingEnabled: false, environment: current.environment,
            authorizationUpdatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()}, {merge: false});
        }
        transaction.update(attemptRef, {status: "connected_write", selectedCandidate: chosen.safeCandidate,
          candidateEnvelope: FieldValue.delete(), verifierEnvelope: FieldValue.delete(),
          connectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      });
      return {provider: "meta", status: "connected_write", identity: selected.safeCandidate,
        writeScopesGranted: true, externalPublishingEnabled: false};
    }
    if (writeConnection) {
      const credentialRef = db.collection("socialConnectionCredentials").doc(credentialId);
      const connectionRef = connectionRoot.doc("x");
      await db.runTransaction(async (transaction) => {
        const [currentAttemptSnapshot, currentConnectionSnapshot, currentCredentialSnapshot] =
          await Promise.all([transaction.get(attemptRef), transaction.get(connectionRef),
            transaction.get(credentialRef)]);
        const currentAttempt = currentAttemptSnapshot.data();
        const currentConnection = currentConnectionSnapshot.data() || {};
        const currentCredential = currentCredentialSnapshot.data() || {};
        if (currentConnection.pendingAttemptId !== attemptId ||
            currentAttempt?.status !== "identity_pending" ||
            currentAttempt.businessUid !== business.uid || currentAttempt.provider !== "x" ||
            currentAttempt.purpose !== "x_connection_authority" ||
            Number(currentAttempt.expiresAtMillis || 0) <= Date.now()) {
          throw new Error("social_oauth_stale_connection_attempt");
        }
        socialOAuth.exactScopeSet(currentAttempt.grantedScopes, socialOAuth.X_PUBLISH_SCOPES);
        const nextRevision = socialOAuth.connectionRevision(currentConnection) + 1;
        const nextGeneration = currentCredentialSnapshot.exists ?
          socialOAuth.credentialGeneration(currentCredential) + 1 : 1;
        transaction.set(credentialRef, {...selected.credentialRecord,
          rotationGeneration: nextGeneration, connectionRevision: nextRevision,
          accountEnvelope: socialOAuth.encryptJson(selected.privateAccount,
            socialOAuthEncryptionKey.value(), `${business.uid}:x:${credentialId}`),
          createdAt: currentCredential.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()}, {merge: false});
        transaction.set(connectionRef, {
          schemaVersion: socialOperations.SCHEMA_VERSION,
          provider: "x",
          status: "connected_write",
          tokenHealth: "healthy",
          connectionRevision: nextRevision,
          credentialRotationGeneration: nextGeneration,
          accountDisplayName: selected.safeCandidate.accountDisplayName,
          accountType: selected.safeCandidate.accountType,
          handle: selected.safeCandidate.handle,
          providerAccountId: selected.safeCandidate.candidateId,
          providerUserId: selected.privateAccount.accountId,
          credentialId,
          capabilities: selected.safeCandidate.capabilities,
          grantedScopes: currentAttempt.grantedScopes,
          writeScopesGranted: true,
          externalPublishingEnabled: false,
          environment: currentAttempt.environment,
          authorizationUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: false});
        transaction.update(attemptRef, {
          status: "connected_write",
          selectedCandidate: selected.safeCandidate,
          candidateEnvelope: FieldValue.delete(),
          verifierEnvelope: FieldValue.delete(),
          connectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return {
        provider: "x",
        status: "connected_write",
        identity: selected.safeCandidate,
        writeScopesGranted: true,
        externalPublishingEnabled: false,
      };
    }
    await db.runTransaction(async batch => {
    const current = (await batch.get(attemptRef)).data();
    const currentConnection = (await batch.get(connectionRoot.doc(attempt.provider === "meta" ? "facebook" : attempt.provider))).data() || {};
    if (current?.status !== "identity_pending" || current.businessUid !== business.uid ||
        current.expiresAtMillis <= Date.now() || currentConnection.pendingAttemptId !== attemptId ||
        ["iv", "ciphertext", "tag"].some(k => current.candidateEnvelope?.[k] !== attempt.candidateEnvelope?.[k])) {
      throw new HttpsError("failed-precondition", "This connection attempt ended. Try again.");
    }
    if (customerManaged) metaCustomer.assertTarget(current, currentConnection, selected.privateAccount);
    const priorCredential = (await batch.get(db.collection("socialConnectionCredentials").doc(credentialId))).data();
    const revision = socialOAuth.connectionRevision(currentConnection) + 1;
    const generation = priorCredential ? socialOAuth.credentialGeneration(priorCredential) + 1 : 1;
    batch.set(db.collection("socialConnectionCredentials").doc(credentialId), {
      ...selected.credentialRecord,
      connectionRevision: revision, rotationGeneration: generation,
      accountEnvelope: socialOAuth.encryptJson(selected.privateAccount,
        socialOAuthEncryptionKey.value(), `${business.uid}:${attempt.provider}:${credentialId}`),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    const managedReady = customerManaged && (selected.safeCandidate.capabilities.publishText || selected.safeCandidate.capabilities.publishImage);
    const base = {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      status: managedReady ? "connected_write" : "connected_read_only",
      accountDisplayName: selected.safeCandidate.accountDisplayName,
      accountType: selected.safeCandidate.accountType,
      handle: selected.safeCandidate.handle,
      providerAccountId: selected.safeCandidate.candidateId,
      providerUserId: selected.privateAccount.accountId,
      credentialId,
      connectionRevision: revision, credentialRotationGeneration: generation,
      tokenHealth: "healthy",
      ...(attempt.provider === "meta" ? {linkedPageId: selected.privateAccount.accountId} : {}),
      capabilities: selected.safeCandidate.capabilities,
      grantedScopes: attempt.grantedScopes,
      writeScopesGranted: managedReady,
      managedPublishingPermissionGranted: managedReady,
      approvalMode: "approval_required",
      externalPublishingEnabled: false,
      environment: attempt.environment,
      authorizationUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (attempt.provider === "meta") {
      batch.set(connectionRoot.doc("facebook"), {...base, provider: "facebook"}, {merge: false});
      if (selected.safeCandidate.instagramCapabilities?.profile === true) {
        batch.set(connectionRoot.doc("instagram"), {
          ...base,
          provider: "instagram",
          status: customerManaged && selected.safeCandidate.instagramCapabilities?.publishImage ? "connected_write" : "connected_read_only",
          writeScopesGranted: customerManaged && selected.safeCandidate.instagramCapabilities?.publishImage === true,
          managedPublishingPermissionGranted: customerManaged && selected.safeCandidate.instagramCapabilities?.publishImage === true,
          accountDisplayName: selected.safeCandidate.linkedAccountDisplayName ||
            selected.safeCandidate.linkedHandle,
          accountType: "instagram_professional",
          handle: selected.safeCandidate.linkedHandle,
          providerAccountId: `${selected.safeCandidate.candidateId}_instagram`,
          providerUserId: selected.privateAccount.linkedAccountId,
          capabilities: selected.safeCandidate.instagramCapabilities,
        }, {merge: false});
      } else {
        batch.set(connectionRoot.doc("instagram"), {schemaVersion: socialOperations.SCHEMA_VERSION,
          provider: "instagram", status: "not_connected", writeScopesGranted: false,
          environment: attempt.environment, capabilities: {profile: false, analytics: false,
            publishText: false, publishImage: false, publishVideo: false, schedule: false},
          authorizationUpdatedAt: FieldValue.serverTimestamp()}, {merge: false});
      }
    } else {
      batch.set(connectionRoot.doc(attempt.provider), {...base, provider: attempt.provider}, {merge: false});
    }
    batch.update(attemptRef, {
      status: managedReady ? "connected_write" : "connected_read_only",
      selectedCandidate: selected.safeCandidate,
      candidateEnvelope: FieldValue.delete(),
      verifierEnvelope: FieldValue.delete(),
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    });
    return {
      provider: attempt.provider,
      status: customerManaged && (selected.safeCandidate.capabilities.publishText || selected.safeCandidate.capabilities.publishImage) ? "connected_write" : "connected_read_only",
      identity: selected.safeCandidate,
      writeScopesGranted: customerManaged && (selected.safeCandidate.capabilities.publishText || selected.safeCandidate.capabilities.publishImage) === true,
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
      const config = socialOAuth.validateProviderConfig(metaConnection.connectionConfig({
        ...(await providerConfigRef(attempt.provider, attempt.environment).get()).data(),
        provider: attempt.provider,
      }, attempt.businessUid, attempt.purpose));
      const completed = await socialOAuth.completeExchange({
        attempt,
        code,
        config,
        clientSecret: providerSecretParameter.value(),
        encryptionKey: socialOAuthEncryptionKey.value(),
        now: Date.now(),
      });
      if (attempt.provider === "meta") {
        await db.runTransaction(async (transaction) => {
          const [latest, connection] = await Promise.all([transaction.get(attemptRef),
            transaction.get(db.collection("socialConnections").doc(attempt.businessUid)
              .collection("providers").doc("facebook"))]);
          if (latest.data()?.status !== "exchanging" ||
              latest.data()?.expiresAtMillis <= Date.now() ||
              connection.data()?.pendingAttemptId !== attemptId) {
            throw new Error("social_oauth_stale_connection_attempt");
          }
          transaction.update(attemptRef, {...completed, updatedAt: FieldValue.serverTimestamp()});
        });
      } else {
        await attemptRef.update({...completed, updatedAt: FieldValue.serverTimestamp()});
      }
      if (attempt.provider === "meta" && completed.status !== "identity_pending") {
        await oauthLifecycle.recoverMetaPending(db, attempt.businessUid, FieldValue,
          {attemptId, reason: "required_access_missing"});
      }
      response.status(200).type("html").send(socialOAuth.callbackHtml({
        success: completed.status === "identity_pending",
        message: completed.status === "identity_pending" ?
          "Return to ScaledCircle to review and confirm the exact account identity." :
          attempt.purpose === "x_first_publish_certification" ?
            "X did not grant the exact permission needed for this approved post." :
          attempt.purpose === "x_connection_authority" ?
            "X did not grant the exact permissions required for this connection." :
            "The provider did not grant every required read-only permission.",
      }));
    } catch (error) {
      const failure = readText(error?.message || error, 120);
      const safeFailure = failure === "social_oauth_attempt_expired" ?
        "attempt_expired" : "connection_failed";
      console.warn("social_oauth_callback_failed", {
        provider: expectedProvider,
        failure,
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
        if (expectedProvider === "meta") {
          const failed = (await attemptRef.get()).data();
          if (failed?.provider === "meta" && failed.businessUid) await oauthLifecycle.recoverMetaPending(
            db, failed.businessUid, FieldValue, {attemptId,
              reason: request.query?.error === "access_denied" ? "canceled" : safeFailure});
        }
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(attemptRef);
          const current = snapshot.data();
          let connectionRef = null;
          let connection = null;
          if (current?.businessUid && current?.provider === "x") {
            connectionRef = db.collection("socialConnections").doc(current.businessUid)
              .collection("providers").doc("x");
            connection = (await transaction.get(connectionRef)).data() || {};
          }
          if (["authorizing", "exchanging"].includes(current?.status)) {
            transaction.set(attemptRef, {status: "error", safeFailure,
              updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          }
          if (safeFailure === "attempt_expired" && connectionRef &&
              connection.pendingAttemptId === attemptId) {
            transaction.set(connectionRef, {
              status: "reauth_required",
              tokenHealth: "needs_attention",
              pendingAttemptId: FieldValue.delete(),
              lastFailedAttemptId: attemptId,
              lastAuthorizationFailure: safeFailure,
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true});
          }
        }).catch(() => {});
      }
      response.status(400).type("html").send(socialOAuth.callbackHtml({
        success: false,
        message: expectedProvider === "meta" ? "Facebook wasn't connected. Return to ScaledCircle and try again." : safeFailure === "attempt_expired" ?
          "This X authorization attempt expired before ScaledCircle could complete it. " +
            "Return to ScaledCircle and choose Start fresh X authorization." :
          "The read-only authorization could not be completed. No account was connected.",
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
    const config = socialOAuth.validateProviderConfig(metaConnection.connectionConfig({
      ...(await providerConfigRef(provider, environment).get()).data(), provider,
    }, business.uid));
    if (!config.historicalSyncEnabled) {
      throw new HttpsError("failed-precondition", "Historical sync is not enabled for this provider.");
    }
    const connectionRef = db.collection("socialConnections").doc(business.uid)
      .collection("providers").doc(surface);
    const connection = (await connectionRef.get()).data();
    const xCapabilities = provider === "x" ?
      socialOperations.xConnectionCapabilities(connection || {}) : null;
    const readConnectionReady = provider === "x" ? xCapabilities.canReadInsights :
      Boolean(connection && ["connected_read_only", "connected_write"].includes(connection.status));
    if (!readConnectionReady || !connection?.credentialId) {
      const reconnectRequired = provider === "x" && connection &&
        (!xCapabilities.healthy || connection.tokenHealth === "needs_attention");
      throw new HttpsError("failed-precondition", reconnectRequired ?
        "Reconnect X to restore read-only insights." :
        "Connect this account read only first.");
    }
    const credentialRef = db.collection("socialConnectionCredentials").doc(connection.credentialId);
    const credentialSnapshot = await credentialRef.get();
    const credential = credentialSnapshot.data();
    if (!credential || credential.businessUid !== business.uid || credential.provider !== provider) {
      throw new HttpsError("permission-denied", "The connection credential is unavailable.");
    }
    try {
      let account;
      let tokens;
      let tokenAad;
      if (provider === "x") {
        const refreshed = await refreshStoredXCredential({businessUid: business.uid,
          connectionRef, connection, config, clientSecret: providerSecretParameter.value()});
        account = refreshed.account;
        tokens = refreshed.tokens;
      } else {
        account = socialOAuth.decryptJson(credential.accountEnvelope,
          socialOAuthEncryptionKey.value(), `${business.uid}:${provider}:${connection.credentialId}`);
        tokenAad = `${business.uid}:${provider}:${account.accountId}`;
        tokens = socialOAuth.decryptJson(credential.tokenEnvelope,
          socialOAuthEncryptionKey.value(), tokenAad);
        tokens = await socialOAuth.refreshTokens({provider, tokens, config,
          clientSecret: providerSecretParameter.value()});
      }
      if (provider === "meta" && config.metaDogfood) {
        metaConnection.authorize(config, business.uid);
        if (account.accountId !== config.metaDogfood.pageId ||
            account.linkedAccountId !== config.metaDogfood.instagramId) throw new Error("meta_baseline_identity_mismatch");
        socialOAuth.exactScopeSet(connection.grantedScopes, socialOAuth.META_PUBLISH_SCOPES);
        if (connection.tokenHealth !== "healthy" || connection.environment !== environment ||
            connection.providerUserId !== (surface === "facebook" ? config.metaDogfood.pageId : config.metaDogfood.instagramId)) {
          throw new Error("meta_baseline_connection_mismatch");
        }
        const baseline = await require("./social_meta_baseline").collect({surface,
          account: {...account, linkedHandle: config.metaDogfood.instagramUsername,
            pageName: config.metaDogfood.pageName}, tokens,
          diagnostic: surface === "facebook" ? entry => require("firebase-functions/logger").warn("Facebook baseline Graph failure", entry) : undefined});
        const snapshotRef = db.collection("socialPerformanceSnapshots").doc(
          `meta_baseline_${socialOAuth.digest({businessUid: business.uid, baseline})}`);
        await db.runTransaction(async (tx) => {
          const [currentConnection, currentCredential, currentConfig] = await Promise.all([
            tx.get(connectionRef), tx.get(credentialRef), tx.get(providerConfigRef(provider, environment))]);
          metaConnection.authorize(currentConfig.data(), business.uid, config.metaDogfood);
          if (currentConfig.data()?.historicalSyncEnabled !== true ||
              currentConnection.data()?.credentialId !== connection.credentialId ||
              currentConnection.data()?.connectionRevision !== connection.connectionRevision ||
              currentCredential.data()?.rotationGeneration !== credential.rotationGeneration) {
            throw new Error("meta_baseline_stale_credential");
          }
          tx.create(snapshotRef, {...baseline, businessUid: business.uid, environment,
            connectionRevision: connection.connectionRevision, createdAt: FieldValue.serverTimestamp()});
          tx.update(connectionRef, {lastSyncAt: FieldValue.serverTimestamp(),
            metricCollectionHealth: "partial", updatedAt: FieldValue.serverTimestamp()});
        });
        return {provider: surface, baseline, importedSnapshotCount: 1,
          metricCollectionHealth: "partial", externalPublishingEnabled: false};
      }
      if (provider === "meta") {
        const baseline = await metaCustomer.readBaseline({surface, connection,
          credential: {...credential, id: credentialSnapshot.id}, account, tokens,
          collect: require("./social_meta_baseline").collect});
        const snapshotRef = db.collection("socialPerformanceSnapshots").doc(
          `meta_baseline_${socialOAuth.digest({businessUid: business.uid, baseline})}`);
        await db.runTransaction(async tx => {
          const [currentSnapshot,currentCredential] = await Promise.all([tx.get(connectionRef),tx.get(credentialRef)]);
          const current = currentSnapshot.data();
          if (current?.credentialId !== connection.credentialId || current.providerUserId !== connection.providerUserId ||
              current.connectionRevision !== connection.connectionRevision ||
              currentCredential.data()?.tokenEnvelope?.ciphertext !== credential.tokenEnvelope?.ciphertext) throw Error("meta_baseline_stale_credential");
          tx.set(snapshotRef, {...baseline, businessUid: business.uid, environment,
            attribution: "provider_history_not_scaledcircle_publication", createdAt: FieldValue.serverTimestamp()});
          tx.update(connectionRef, {lastSyncAt: FieldValue.serverTimestamp(), metricCollectionHealth: "partial", updatedAt: FieldValue.serverTimestamp()});
        });
        return {provider: surface, baseline, importedSnapshotCount: 1, metricCollectionHealth: "partial", externalPublishingEnabled: false};
      }
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
      if (provider !== "x" && tokens.refreshed) {
        const secretFields = {...tokens};
        delete secretFields.refreshed;
        delete secretFields.grantedScopes;
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
    } catch (error) {
      if (provider === "meta") {
        if (surface === "facebook") require("firebase-functions/logger").warn("Facebook baseline execution failed", {
          provider: surface, pageId: connection.providerUserId,
          reason: /^meta_baseline_[a-z_0-9]+$/.test(error.message || "") ? error.message : "execution_error",
        });
        // Missing metrics, throttling or a stale sync never invalidate a newer connection.
        await db.runTransaction(async tx => {
          const current = (await tx.get(connectionRef)).data();
          if (current?.credentialId !== connection.credentialId ||
              current?.connectionRevision !== connection.connectionRevision) return;
          tx.update(connectionRef, {metricCollectionHealth: "error",
            ...(error.message === "meta_baseline_authority_or_rate_limit_190" ?
              {status: "reauth_required", tokenHealth: "needs_attention"} : {}),
            updatedAt: FieldValue.serverTimestamp()});
        });
        throw new HttpsError("unavailable", "Insights are temporarily unavailable. Try again later.");
      }
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

// Owner-scoped planning and exact immutable weekly approval. Publishing needs
// a separate, explicitly activated bounded Social Supervisor allowance.
const socialGrowthCycle = require("./social_growth_cycle");
function growthPlanningCallable(handler) {
  return onCall({enforceAppCheck: false, maxInstances: 2}, async (request) => {
    const business = await requireSocialOperationsBusiness(request);
    if (!["scaledcircle-staging", "scaled-circle"].includes(process.env.GCLOUD_PROJECT)) {
      throw new HttpsError("failed-precondition", "Growth cycle planning is awaiting release review.");
    }
    try { return await handler(business.uid, request.data || {}); }
    catch (_) { throw new HttpsError("failed-precondition", "Review the latest content and cycle before continuing."); }
  });
}
exports.createSocialGrowthCycleV1 = growthPlanningCallable(async (businessUid, data) => {
  if (!Array.isArray(data.versionIds) || !data.versionIds.length || data.versionIds.length > 60 ||
      data.versionIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,220}$/.test(id))) {
    throw new Error("growth_selection_invalid");
  }
  const plan = await db.collection("socialContentPlans").doc(data.planId).get();
  if (plan.data()?.businessUid !== businessUid) throw new Error("growth_plan_not_owned");
  const versions = await Promise.all(data.versionIds.map(async (id) => {
    const snapshot = await db.collection("socialContentVersions").doc(id).get();
    if (snapshot.data()?.planId !== data.planId) throw new Error("growth_plan_mismatch");
    return {id, record: snapshot.data()};
  }));
  const providerAccounts = {};
  if (versions.some(version => version.record.variants?.some(variant => variant.provider === "x"))) {
    const connection = (await db.doc(`socialConnections/${businessUid}/providers/x`).get()).data();
    if (!connection?.providerUserId || !connection?.handle) throw new Error("growth_account_required");
    providerAccounts.x = {providerUserId: connection.providerUserId, handle: connection.handle};
  }
  const metaSurfaces = ["facebook", "instagram"].filter(surface =>
    versions.some(version => version.record.variants?.some(variant => variant.provider === surface)));
  if (metaSurfaces.length) {
    const config = (await providerConfigRef("meta", runtimeEnvironment()).get()).data();
    metaConnection.authorize(config, businessUid);
    for (const surface of metaSurfaces) {
      const connection = (await db.doc(`socialConnections/${businessUid}/providers/${surface}`).get()).data();
      socialOAuth.exactScopeSet(connection?.grantedScopes, socialOAuth.META_PUBLISH_SCOPES);
      const expectedId = surface === "facebook" ? config.metaDogfood.pageId : config.metaDogfood.instagramId;
      if (connection?.environment !== runtimeEnvironment() || connection.tokenHealth !== "healthy" ||
          connection.status !== "connected_write" || connection.providerUserId !== expectedId ||
          connection.linkedPageId !== config.metaDogfood.pageId ||
          (surface === "instagram" && connection.handle !== config.metaDogfood.instagramUsername)) {
        throw new Error("growth_identity_mismatch");
      }
      providerAccounts[surface] = {providerUserId: connection.providerUserId,
        linkedPageId: connection.linkedPageId,
        ...(surface === "instagram" ? {handle: connection.handle} : {})};
    }
  }
  const record = socialGrowthCycle.cycle({businessUid, planId: data.planId, versions, providerAccounts,
    strategy: data.strategy, startsAt: data.startsAt, endsAt: data.endsAt, timeZone: data.timeZone,
    mode: "approval_required"});
  const saved = await socialGrowthCycle.createStore(db).save(record);
  return {cycleId: saved.id, digest: saved.digest, externalPublishingEnabled: false};
});
exports.approveSocialGrowthWeekV1 = growthPlanningCallable(async (businessUid, data) => {
  if (!/^growth_cycle_[a-f0-9]{64}$/.test(data.cycleId || "")) throw new Error("growth_cycle_invalid");
  return socialGrowthCycle.createStore(db).approve({businessUid, cycleId: data.cycleId,
    expectedDigest: data.expectedDigest, versionIds: data.versionIds,
    windowStart: data.windowStart, windowEnd: data.windowEnd});
});
exports.getSocialGrowthCycleV1 = growthPlanningCallable(async (businessUid, data) => {
  if (!/^growth_cycle_[a-f0-9]{64}$/.test(data.cycleId || "")) throw new Error("growth_cycle_invalid");
  const snapshot = await db.collection("socialGrowthCycles").doc(data.cycleId).get();
  if (snapshot.data()?.businessUid !== businessUid) throw new Error("growth_cycle_not_owned");
  return {cycle: snapshot.data(), externalPublishingEnabled: false};
});

const socialGrowthPublisher = require("./social_growth_publisher");
function normalSocialPublisher() {
  return socialGrowthPublisher.createPublisher({db, project: process.env.GCLOUD_PROJECT,
    credentials: async (job, authority) => {
      const connectionRef = db.doc(`socialConnections/${job.businessUid}/providers/x`);
      const connection = (await connectionRef.get()).data();
      if (connection?.providerUserId !== authority.providerUserId || connection?.handle !== authority.handle) {
        throw new Error("growth_identity_mismatch");
      }
      const config = socialOAuth.validateProviderConfig({...(await providerConfigRef("x").get()).data(), provider: "x"});
      if (runtimeEnvironment() === "production" && (config.clientId !== PRODUCTION_X_PROVIDER_CONFIG.clientId ||
          config.redirectUri !== PRODUCTION_X_PROVIDER_CONFIG.redirectUri)) throw new Error("growth_environment_mismatch");
      const refreshed = await refreshStoredXCredential({businessUid: job.businessUid, connectionRef,
        connection, config, expectedProviderUserId: authority.providerUserId, clientSecret: xSocialClientSecret.value()});
      return {accessToken: refreshed.tokens.accessToken, providerUserId: authority.providerUserId, handle: authority.handle};
    }});
}

// Preparing/pausing has no provider effects. Activation requires an existing
// exact owner approval; it does not approve or regenerate any content.
exports.setSocialGrowthPublishingStateV1 = growthPlanningCallable(async (businessUid, data) => {
  const publisher = normalSocialPublisher();
  if (data.action === "prepare") return publisher.prepare(businessUid);
  if (data.action === "pause") return publisher.pause(businessUid);
  if (data.action === "activate") return publisher.activate({businessUid, approvalId: data.approvalId});
  throw new Error("growth_action_invalid");
});

exports.runSocialGrowthPublisherV1 = onSchedule({schedule: "every 1 minutes", timeZone: "UTC",
  maxInstances: 1, timeoutSeconds: 540, retryCount: 0,
  secrets: [socialOAuthEncryptionKey, xSocialClientSecret]}, async () => {
  const publisher = normalSocialPublisher();
  // This small bounded release handles only explicitly activated weekly plans.
  // No job discovery can create a publication outside its Supervisor allowance.
  const states = await db.collection("socialPublishingAuthorities")
    .where("externalPublishingEnabled", "==", true).limit(100).get();
  for (const snapshot of states.docs) {
    const state = snapshot.data();
    if (!Array.isArray(state.jobIds) || state.jobIds.length > 3 || state.businessUid !== snapshot.id) continue;
    for (const id of state.jobIds) {
      if (!/^social_growth_job_[a-f0-9]{64}$/.test(id)) continue;
      const job = (await db.doc(`socialGrowthJobs/${id}`).get()).data();
      // Unknown outcomes are held for explicit read-only reconciliation; the
      // minute scheduler must not repeatedly spend provider read quota.
      if (!job || job.sendStarted || ["published", "canceled"].includes(job.status) ||
          Date.parse(job.scheduledFor) > Date.now()) continue;
      try { await publisher.execute(id); }
      catch (_) { console.warn("social_growth_job_held"); }
    }
  }
});

exports.reconcileSocialGrowthPublicationV1 = onCall({enforceAppCheck: false, maxInstances: 2,
  secrets: [socialOAuthEncryptionKey, xSocialClientSecret]}, async request => {
  const business = await requireSocialOperationsBusiness(request);
  const id = request.data?.jobId;
  if (!/^social_growth_job_[a-f0-9]{64}$/.test(id || "")) throw new HttpsError("invalid-argument", "Choose a publication.");
  const job = (await db.doc(`socialGrowthJobs/${id}`).get()).data();
  if (job?.businessUid !== business.uid || job.sendStarted !== true) throw new HttpsError("failed-precondition", "This publication is unavailable for review.");
  try { const result = await normalSocialPublisher().execute(id); return {status: result.status}; }
  catch (_) { throw new HttpsError("failed-precondition", "Publication review needs attention."); }
});

// Meta certification is independently gated; changing an X allowance cannot
// enable Meta. This release deliberately has no Meta activation export.
function normalMetaPublisher() {
  return require("./social_meta_runtime").createPublisher({db,project:process.env.GCLOUD_PROJECT,
    providerCreatesEnabled:false,credentials:loadMetaPublisherCredential});
}
// Only the scheduled feed path can reach provider creates. Inspection is
// always read-only; each provider requires its own exact approved allowance.
function scheduledMetaFeedPublisher() {
  return require("./social_meta_runtime").createPublisher({db,project:process.env.GCLOUD_PROJECT,
    providerCreatesEnabled:process.env.GCLOUD_PROJECT==="scaled-circle",enabledProviders:["facebook","instagram"],credentials:loadMetaPublisherCredential});
}
async function loadMetaPublisherCredential(job,expected) {
      if(job.provider==="instagram") return require("./social_meta_page_credential").resolveMetaPageExecutionCredential({
        db,decryptJson:socialOAuth.decryptJson,encryptionKey:()=>socialOAuthEncryptionKey.value(),businessUid:job.businessUid,expected});
      const ref=db.doc(`socialConnections/${job.businessUid}/providers/${job.provider}`);
      const current=(await ref.get()).data();
      if(current?.credentialId!==expected.credentialId || current?.connectionRevision!==expected.connectionRevision ||
          current?.credentialRotationGeneration!==expected.credentialRotationGeneration ||
          current?.providerUserId!==expected.providerUserId || current?.tokenHealth!=="healthy")throw Error("meta_credential_changed");
      const credential=(await db.doc(`socialConnectionCredentials/${current.credentialId}`).get()).data();
      if(credential?.businessUid!==job.businessUid || credential?.provider!=="meta" ||
          credential?.rotationGeneration!==current.credentialRotationGeneration ||
          credential?.connectionRevision!==current.connectionRevision)throw Error("meta_credential_changed");
      const account=socialOAuth.decryptJson(credential.accountEnvelope,socialOAuthEncryptionKey.value(),
        `${job.businessUid}:meta:${current.credentialId}`);
      if(account.accountId!==current.linkedPageId ||
          (job.provider==="instagram"?account.linkedAccountId:account.accountId)!==current.providerUserId)throw Error("meta_credential_identity_mismatch");
      const tokens=socialOAuth.decryptJson(credential.tokenEnvelope,socialOAuthEncryptionKey.value(),
        `${job.businessUid}:meta:${account.accountId}`);
      const session={businessUid:job.businessUid,providerUserId:current.providerUserId,linkedPageId:current.linkedPageId,tokenType:"PAGE"};
      Object.defineProperty(session,"accessToken",{value:tokens.pageAccessToken,enumerable:false});return session;
}
async function inspectMetaScheduler(businessUid,executeDue=false) {
  const config=(await providerConfigRef("meta",runtimeEnvironment()).get()).data();
  metaConnection.authorize(config,businessUid);
  return require("./social_meta_scheduler").run({db,publisher:scheduledMetaFeedPublisher(),businessUid,inspectOnly:!executeDue});
}
// IAM-private, GET-only credential rehearsal. No provider POST or persistence.
exports.inspectMetaPageExecutionCredentialV1=onRequest({invoker:"private",cors:false,maxInstances:1,timeoutSeconds:120,
  secrets:[socialOAuthEncryptionKey]},async(request,response)=>{
  if(request.method!=="GET")return response.status(405).json({error:"read_only"});
  try{
    const config=(await providerConfigRef("meta",runtimeEnvironment()).get()).data();
    const uid=config?.metaDogfood?.businessUid;metaConnection.authorize(config,uid);
    const connection=(await db.doc(`socialConnections/${uid}/providers/instagram`).get()).data();
    if(connection.providerUserId!==config.metaDogfood.instagramId||connection.linkedPageId!==config.metaDogfood.pageId)throw Error("meta_identity_changed");
    const session=await loadMetaPublisherCredential({businessUid:uid,provider:"instagram"},connection);
    const allowance=(await db.doc(`socialPublishingAuthorities/${uid}/providers/instagram`).get()).data();
    if(allowance?.jobIds?.length!==3)throw Error("meta_jobs_changed");
    const jobs=[];for(const id of allowance.jobIds){
      const inspection=await normalMetaPublisher().inspect(id);
      const receipts=(await db.doc(`socialGrowthJobs/${id}`).collection("receipts").get()).size;
      const steps=(await db.doc(`socialGrowthJobs/${id}`).collection("providerSteps").get()).size;
      jobs.push({...inspection,receipts,providerSteps:steps});
    }
    await session.assertCurrent();
    return response.json({tokenType:session.tokenType,pageId:session.pageId,instagramId:session.providerUserId,
      connectionRevision:session.connectionRevision,generation:session.credentialRotationGeneration,
      paused:allowance.killSwitchActive===true&&allowance.externalPublishingEnabled===false,jobs,providerCreates:0});
  }catch{return response.status(409).json({error:"meta_page_credential_certification_failed_closed"});}
});
exports.inspectMetaGrowthRuntimeV1=growthPlanningCallable(async businessUid=>inspectMetaScheduler(businessUid));
exports.approveMetaGrowthWeekV1=growthPlanningCallable(async(businessUid,data)=>{
  metaConnection.authorize((await providerConfigRef("meta","production").get()).data(),businessUid);
  if(!/^growth_cycle_[a-f0-9]{64}$/.test(data.cycleId||""))throw Error("meta_cycle_invalid");
  return require("./social_meta_preparation").createApprovalStore({db})({businessUid,cycleId:data.cycleId,
    expectedDigest:data.expectedDigest,versionIds:data.versionIds,windowStart:data.windowStart,windowEnd:data.windowEnd});
});
// IAM-private preparation/rehearsal only. The owner is fixed by the restricted
// production Meta configuration, never selected by the request. No secrets or
// approval creation are available through this administrative endpoint.
exports.prepareMetaGrowthWeekV1=onRequest({invoker:"private",cors:false,maxInstances:1,timeoutSeconds:120},async(request,response)=>{
  if(request.method!=="POST")return response.status(405).json({error:"post_required"});
  if(process.env.GCLOUD_PROJECT!=="scaled-circle")return response.status(403).json({error:"production_meta_only"});
  try {
    const preparation=require("./social_meta_preparation");
    if(request.body?.action==="prepare")return response.json({result:await preparation.createPreparer({db})(request.body.input)});
    const config=(await providerConfigRef("meta","production").get()).data(),uid=config?.metaDogfood?.businessUid;
    metaConnection.authorize(config,uid);
    const provider=request.body?.provider;
    if(!["facebook","instagram"].includes(provider))throw Error("meta_provider_required");
    const other=provider==="facebook"?"instagram":"facebook",otherRef=db.doc(`socialPublishingAuthorities/${uid}/providers/${other}`);
    if(request.body.action==="pause"){
      const before=(await otherRef.get()).data()||null;
      await normalMetaPublisher().pause(uid,provider);
      return response.json({result:{paused:provider,otherChannelUnchanged:require("node:util").isDeepStrictEqual(before,(await otherRef.get()).data()||null),providerCreates:0}});
    }
    if(request.body.action!=="rehearse")throw Error("meta_prepare_action_invalid");
    const state=(await db.doc(`socialPublishingAuthorities/${uid}/providers/${provider}`).get()).data();
    if(!Array.isArray(state?.jobIds)||state.jobIds.length!==3)throw Error("meta_prepared_jobs_required");
    const results=[];
    for(const id of state.jobIds){
      const job=(await db.doc(`socialGrowthJobs/${id}`).get()).data();
      const actual=await preparation.inspect({db,job});
      const denied=async fn=>{try{await fn();return false;}catch(_){return true;}};
      const stopped=await preparation.inspect({db,job,healthOverride:{killSwitchActive:true}});
      results.push({...actual,wrongVersionDenied:await denied(()=>preparation.inspect({db,job:{...job,versionId:job.versionId+"_wrong"}})),
        wrongIdentityDenied:await denied(()=>preparation.inspect({db,job:{...job,businessUid:"not_the_owner"}})),
        wrongApprovalDenied:await denied(()=>preparation.inspect({db,job:{...job,approvalId:"not_an_approval"}})),
        publishingDisabledDenied:await denied(()=>normalMetaPublisher().execute(id)),
        supervisorStopHeld:stopped.supervisorStopped===true,
        simulatedCases:["wrongVersion","wrongIdentity","wrongApproval","supervisorStop"],
        receiptCount:(await db.doc(`socialGrowthJobs/${id}`).collection("receipts").get()).size});
    }
    return response.json({result:{provider,results,providerCreates:0,approvalsCreated:0}});
  }catch(error){
    const code=/^meta_[a-z_]+$/.test(error.message||"")?error.message:"meta_prepare_review_required";
    return response.status(409).json({error:code});
  }
});
exports.setMetaGrowthPublishingStateV1=growthPlanningCallable(async(businessUid,data)=>{
  const config=(await providerConfigRef("meta",runtimeEnvironment()).get()).data();
  metaConnection.authorize(config,businessUid);
  if(!["facebook","instagram"].includes(data.provider))throw Error("meta_provider_required");
  const publisher=normalMetaPublisher();
  if(data.action==="prepare")return publisher.prepare(businessUid,data.provider);
  if(data.action==="pause")return publisher.pause(businessUid,data.provider);
  // A caller cannot turn the certification release into a publishing release.
  throw Error("meta_deployment_creates_disabled");
});
exports.reconcileMetaGrowthPublicationV1=onCall({enforceAppCheck:false,maxInstances:2,
  secrets:[socialOAuthEncryptionKey]},async request=>{
  const business=await requireSocialOperationsBusiness(request);
  const id=request.data?.jobId;
  if(!/^social_growth_job_[a-f0-9]{64}$/.test(id||""))throw new HttpsError("invalid-argument","Choose a publication.");
  const job=(await db.doc(`socialGrowthJobs/${id}`).get()).data();
  if(job?.businessUid!==business.uid||!["facebook","instagram"].includes(job.provider))throw new HttpsError("permission-denied","Publication unavailable.");
  try {return await normalMetaPublisher().execute(id,{reconcileOnly:true});}
  catch(_){throw new HttpsError("failed-precondition","Publication review needs attention.");}
});
exports.runMetaGrowthPublisherV1=onSchedule({schedule:"every 5 minutes",timeZone:"UTC",
  maxInstances:1,timeoutSeconds:120,retryCount:0,secrets:[socialOAuthEncryptionKey]},async()=>{
  const config=(await providerConfigRef("meta",runtimeEnvironment()).get()).data();
  if(!config?.metaDogfood?.businessUid)return;
  const inspection=await inspectMetaScheduler(config.metaDogfood.businessUid,true);
  require("firebase-functions/logger").info("meta_scheduler_certification",{
    discoveredJobs:inspection.results.length,results:inspection.results,
    enabledProviders:["facebook","instagram"]});
});

// Only exact customer approvals are processed here. Existing internal/X jobs
// and their allowances are never selected or changed by this scheduler.
exports.runCustomerMetaPublisherV1=onSchedule({schedule:'every 5 minutes',timeZone:'UTC',
  maxInstances:1,timeoutSeconds:120,retryCount:0,secrets:[socialOAuthEncryptionKey]},async()=>{
  const customerUids=(process.env.SOCIAL_CUSTOMER_SCHEDULING_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(customerUids.length>25)throw Error('customer_scheduler_inventory_review_required');
  const publisher=require('./social_meta_runtime').createPublisher({db,project:process.env.GCLOUD_PROJECT,
    providerCreatesEnabled:process.env.GCLOUD_PROJECT==='scaled-circle',customerUids,credentials:loadMetaPublisherCredential});
  for(const businessUid of customerUids) {
    const result=await require('./social_meta_scheduler').run({db,publisher,businessUid,customerOnly:true});
    require('firebase-functions/logger').info('customer_social_scheduler',{businessUid,results:result.results});
  }
});

exports.runMetaGrowthMeasurementsV1=onSchedule({schedule:"every 15 minutes",timeZone:"UTC",
  maxInstances:1,timeoutSeconds:120,retryCount:0,secrets:[socialOAuthEncryptionKey]},async()=>{
  const config=(await providerConfigRef("meta",runtimeEnvironment()).get()).data();
  if(!config?.metaDogfood?.businessUid)return;
  metaConnection.authorize(config,config.metaDogfood.businessUid);
  if(!config.historicalSyncEnabled)return;
  const collector=require("./social_meta_measurements").createCollector({db,readEvidence:async(job,receipt,approval)=>{
    if(job.businessUid!==config.metaDogfood.businessUid)throw Error("meta_measurement_owner_mismatch");
    const connection=(await db.doc(`socialConnections/${job.businessUid}/providers/${job.provider}`).get()).data();
    if(connection?.environment!==runtimeEnvironment()||connection?.providerUserId!==approval.providerAccounts?.[job.provider]?.providerUserId||
        connection?.linkedPageId!==config.metaDogfood.pageId||connection?.status!=="connected_write")throw Error("meta_measurement_identity_mismatch");
    socialOAuth.exactScopeSet(connection.grantedScopes,socialOAuth.META_PUBLISH_SCOPES);
    const session=await loadMetaPublisherCredential(job,connection);
    return require("./social_meta_post_insights").collect({job,receipt,approval,session});
  }});
  const pending=await db.collection("socialMetaMeasurementJobs").where("status","in",["pending","reading"]).limit(50).get();
  for(const snapshot of pending.docs)if(snapshot.data().businessUid===config.metaDogfood.businessUid)await collector(snapshot.id);
});

const socialGrowthMeasurements = require("./social_growth_measurements");
exports.runSocialGrowthMeasurementsV1 = onSchedule({schedule: "every 15 minutes", timeZone: "UTC",
  maxInstances: 1, timeoutSeconds: 300, retryCount: 0,
  secrets: [socialOAuthEncryptionKey, xSocialClientSecret]}, async () => {
  const project = process.env.GCLOUD_PROJECT;
  socialGrowthPublisher.environment(project);
  const collector = socialGrowthMeasurements.createCollector({db, credentials: async (job, identity) => {
    const connectionRef = db.doc(`socialConnections/${job.businessUid}/providers/x`);
    const connection = (await connectionRef.get()).data();
    if (connection?.environment !== runtimeEnvironment() || connection?.providerUserId !== identity.providerUserId ||
        connection?.handle !== identity.handle) throw new Error("measurement_identity_mismatch");
    const config = socialOAuth.validateProviderConfig({...(await providerConfigRef("x").get()).data(), provider: "x"});
    if (!config.enabled || !config.historicalSyncEnabled || config.environment !== runtimeEnvironment() ||
        (runtimeEnvironment() === "production" && config.clientId !== PRODUCTION_X_PROVIDER_CONFIG.clientId)) throw new Error("measurement_config_invalid");
    const refreshed = await refreshStoredXCredential({businessUid: job.businessUid, connectionRef, connection,
      config, expectedProviderUserId: identity.providerUserId, clientSecret: xSocialClientSecret.value()});
    return {accessToken: refreshed.tokens.accessToken};
  }});
  const pending = await db.collection("socialGrowthMeasurementJobs").where("status", "in", ["pending", "reading"]).limit(100).get();
  for (const snapshot of pending.docs) {
    if (Date.parse(snapshot.data().scheduledFor) <= Date.now()) await collector(snapshot.id);
  }
});
