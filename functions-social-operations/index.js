"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const socialOperations = require("./social_operations");
const subscriptionEntitlements = require("./subscription_entitlements");

if (getApps().length === 0) initializeApp();
const db = getFirestore();
setGlobalOptions({region: "us-east1"});

function readText(value, maximumLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
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
    const [connections, plans, emailPlans, snapshots, metaAds, googleAds] = await Promise.all([
      db.collection("socialConnections").doc(business.uid).collection("providers").get(),
      db.collection("socialContentPlans").where("businessUid", "==", business.uid).limit(10).get(),
      db.collection("emailContentPlans").where("businessUid", "==", business.uid).limit(10).get(),
      db.collection("socialPerformanceSnapshots").where("businessUid", "==", business.uid).limit(50).get(),
      db.collection("adAccountHealth").doc(`${business.uid}_meta_ads`).get(),
      db.collection("adAccountHealth").doc(`${business.uid}_google_ads`).get(),
    ]);
    const connectionMap = new Map(connections.docs.map((doc) => [doc.id, doc.data()]));
    const safeConnections = socialOperations.PROVIDERS.map((provider) =>
      socialOperations.connectionProjection({provider, ...(connectionMap.get(provider) || {})}));
    const performance = snapshots.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    return {
      schemaVersion: socialOperations.SCHEMA_VERSION,
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
      externalPublishingEnabled: false,
      adMutationsEnabled: false,
      emailDeliveryEnabled: false,
    };
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
    const [plans, jobs, connections, snapshots] = await Promise.all([
      db.collection("socialContentPlans").count().get(),
      db.collection("socialPublishingJobs").count().get(),
      db.collectionGroup("providers").count().get(),
      db.collection("socialPerformanceSnapshots").count().get(),
    ]);
    return {
      schemaVersion: socialOperations.SCHEMA_VERSION,
      contentPlanCount: plans.data().count,
      publishJobCount: jobs.data().count,
      connectionProjectionCount: connections.data().count,
      performanceSnapshotCount: snapshots.data().count,
      externalPublishingEnabled: false,
      adMutationsEnabled: false,
      emailDeliveryEnabled: false,
      tokenValuesExposed: false,
    };
  },
);
