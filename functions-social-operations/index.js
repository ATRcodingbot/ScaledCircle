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
      writeScopesGranted: false,
    };
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
    if (!attempt || attempt.businessUid !== business.uid) {
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
    if (!connection || connection.status !== "connected_read_only" || !connection.credentialId) {
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
