"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {after, before, beforeEach, test} = require("node:test");
const {assertFails, assertSucceeds, initializeTestEnvironment} =
  require("@firebase/rules-unit-testing");

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-scaledcircle",
    firestore: {rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")},
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [id, role] of [
      ["scaler-one", "scaler"], ["scaler-two", "scaler"],
      ["business-one", "business"], ["business-two", "business"],
      ["admin-one", "admin"],
    ]) await db.doc(`users/${id}`).set({role, active: true});
    await db.doc("campaigns/campaign-one").set({businessId: "business-one", status: "draft"});
    await db.doc("campaignZones/zone-one").set({
      campaignId: "campaign-one", businessId: "business-one", zoneName: "Zone 1",
      shapeType: "polygon", serviceAreaType: "polygon", serviceArea: [],
      serviceAreaPointCount: 0, serviceAreaCenter: null, serviceAreaRadiusMeters: null,
      estimatedHomes: 50, homeCountStatus: "estimated", homeCountMethod: "area",
      homeCountConfidence: "low", homeCountConfidenceScore: 0.2,
      assignedScalerId: "scaler-one", assignedScalerEmail: "one@example.test",
      status: "in_progress", activeTrackingSessionId: "session-one",
      gpsTracking: true, routeId: "route-one", routePointCount: 10,
      paymentStatus: "unpaid", updatedAt: new Date(), createdAt: new Date(),
    });
    await db.doc("campaignZones/zone-draft").set({
      campaignId: "campaign-one", businessId: "business-one", zoneName: "Draft",
      shapeType: "polygon", serviceAreaType: "polygon", serviceArea: [],
      serviceAreaPointCount: 0, serviceAreaCenter: null, serviceAreaRadiusMeters: null,
      estimatedHomes: 0, homeCountStatus: "unavailable", homeCountMethod: "area",
      homeCountConfidence: "low", homeCountConfidenceScore: 0,
      assignedScalerId: null, assignedScalerEmail: null, status: "unassigned",
      updatedAt: new Date(), createdAt: new Date(),
    });
    await db.doc("campaignRoutes/route-one").set({
      scalerId: "scaler-one", businessId: "business-one", campaignId: "campaign-one",
      zoneId: "zone-one", routeSource: "native_background_v1", points: [],
    });
    await db.doc("trackingSessions/session-one").set({
      scalerId: "scaler-one", businessId: "business-one", campaignId: "campaign-one",
      zoneId: "zone-one", status: "active",
    });
    await db.doc("trackingSessions/session-one/chunks/seq_000000001_000000001").set({
      scalerId: "scaler-one", points: [{latitude: 39, longitude: -76}],
    });
    await db.doc("wallets/business-one").set({ownerId: "business-one", availableCredits: 100});
    await db.doc("businessSubscriptions/business-one").set({
      businessId: "business-one", planId: "scale", status: "active",
      expiresAt: new Date(Date.now() + 86400000),
    });
    await db.doc("campaignPayments/payment-one").set({
      businessId: "business-one", campaignId: "campaign-one", status: "funded",
    });
    await db.doc("scalerTransfers/transfer-one").set({
      businessId: "business-one", scalerId: "scaler-one", status: "transfer_pending",
    });
    await db.doc("stripeConnectedAccounts/scaler-one").set({
      scalerId: "scaler-one", stripeAccountId: "acct_test", transfersStatus: "pending",
    });
    await db.doc("assignmentCompensations/zone-one").set({
      businessId: "business-one", scalerId: "scaler-one", baseAmountCents: 5000,
    });
    await db.doc("financialOperations/op-one").set({ownerId: "business-one", status: "succeeded"});
    await db.doc("stripeEvents/evt_test").set({status: "processed"});
    await db.doc("materialLogisticsChangeProposals/zone-one_v2").set({
      campaignId: "campaign-one", zoneId: "zone-one", businessId: "business-one",
      affectedScalerIds: ["scaler-one"], status: "pending_acknowledgment",
    });
    await db.doc("notifications/assignment_zone-one_scaler-one").set({
      userId: "scaler-one", type: "job_assignment", title: "Assigned",
      message: "Review the Job Room", read: false, createdAt: new Date(),
    });
    await db.doc("adminIssues/issue-one").set({status: "open", severity: "high"});
    await db.doc("adminAuditEvents/audit-one").set({eventType: "admin_promoted"});
    await db.doc("entitlementAuditEvents/beta-one").set({eventType: "internal_beta_granted"});
    await db.doc("businessGrowthProfiles/business-one").set({
      businessUid: "business-one", profileVersion: 1, businessName: "Business One",
    });
    await db.doc("businessGrowthProfiles/business-two").set({
      businessUid: "business-two", profileVersion: 1, businessName: "Business Two",
    });
    await db.doc("managedGrowthArtifacts/artifact-one").set({
      businessUid: "business-one", status: "draft", artifact: {title: "Plan"},
    });
    await db.doc("managedGrowthRateLimits/business-one_day").set({
      businessUid: "business-one", count: 1,
    });
  });
});

test("Managed Growth profiles and artifacts are owner-readable and backend-write-only", async () => {
  const owner = store("business-one");
  const other = store("business-two");
  await assertSucceeds(owner.doc("businessGrowthProfiles/business-one").get());
  await assertFails(other.doc("businessGrowthProfiles/business-one").get());
  await assertFails(owner.doc("businessGrowthProfiles/business-one").set({businessName: "Forged"}));
  await assertSucceeds(owner.doc("managedGrowthArtifacts/artifact-one").get());
  await assertFails(other.doc("managedGrowthArtifacts/artifact-one").get());
  await assertFails(owner.doc("managedGrowthArtifacts/forged").set({businessUid: "business-one"}));
  await assertFails(owner.doc("managedGrowthRateLimits/business-one_day").get());
  await assertFails(owner.doc("managedGrowthRateLimits/business-one_day").set({count: 0}));
});

test("discovery preferences are owner-readable and backend-write-only", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("discoveryPreferences/business-one").set({
      userUid: "business-one", role: "business", schemaVersion: "ServiceAreaPreferencesV1",
      areas: [], preferenceVersion: 1,
    });
  });
  await assertSucceeds(store("business-one").doc("discoveryPreferences/business-one").get());
  await assertFails(store("scaler-one").doc("discoveryPreferences/business-one").get());
  await assertFails(store("business-one").doc("discoveryPreferences/business-one").update({areas: []}));
  await assertFails(store("business-one").doc("discoveryPreferences/business-one").delete());
});

after(async () => environment?.cleanup());

const store = (uid) => environment.authenticatedContext(uid).firestore();

test("private tracking evidence is readable only by owner, campaign business, and admin", async () => {
  await assertSucceeds(store("scaler-one").doc("trackingSessions/session-one").get());
  await assertSucceeds(store("business-one").doc("trackingSessions/session-one/chunks/seq_000000001_000000001").get());
  await assertSucceeds(store("admin-one").doc("trackingSessions/session-one").get());
  await assertFails(store("scaler-two").doc("trackingSessions/session-one").get());
  await assertFails(store("business-two").doc("trackingSessions/session-one").get());
  await assertFails(environment.unauthenticatedContext().firestore().doc("trackingSessions/session-one").get());
});

test("outbound email jobs cannot be read or authored by clients", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("outboundEmailJobs/welcome-user_test").set({
      to: "user@example.test",
      fromAddress: "support@scaledcircle.com",
      status: "queued",
    });
  });
  for (const uid of ["scaler-one", "business-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("outboundEmailJobs/welcome-user_test").get());
    await assertFails(db.doc("outboundEmailJobs/arbitrary").set({
      to: "attacker@example.test",
      fromAddress: "spoof@example.test",
      status: "queued",
    }));
  }
  await assertFails(environment.unauthenticatedContext().firestore()
    .doc("outboundEmailJobs/arbitrary").set({to: "attacker@example.test"}));
});

test("admin issues and admin audit events are admin-readable and server-written", async () => {
  for (const path of ["adminIssues/issue-one", "adminAuditEvents/audit-one"]) {
    await assertSucceeds(store("admin-one").doc(path).get());
    await assertFails(store("business-one").doc(path).get());
    await assertFails(store("scaler-one").doc(path).get());
    await assertFails(store("admin-one").doc(path).update({forged: true}));
    await assertFails(store("business-one").doc(path.replace(/one$/, "forged")).set({forged: true}));
  }
});

test("clients cannot promote themselves or other profiles", async () => {
  await assertFails(store("business-one").doc("users/business-one").update({role: "admin"}));
  await assertFails(store("admin-one").doc("users/business-one").update({role: "admin"}));
  await assertFails(store("scaler-one").doc("users/scaler-one").update({role: "admin"}));
});

test("subscription entitlement records remain backend-only", async () => {
  await assertFails(store("business-one").doc("businessSubscriptions/business-one").get());
  await assertFails(store("business-one").doc("businessSubscriptions/business-one").update({planId: "scale"}));
  await assertFails(store("business-two").doc("businessSubscriptions/business-two").set({
    businessId: "business-two", planId: "scale", status: "active",
  }));
  await assertFails(store("admin-one").doc("businessSubscriptions/business-one").get());
});

test("internal beta entitlement audit events are backend-only and immutable to every client", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("entitlementAuditEvents/event-one").set({
      eventType: "internal_beta_granted", businessUid: "business-one",
      source: "internal_beta", occurredAt: new Date(),
    });
  });
  for (const uid of ["business-one", "scaler-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("entitlementAuditEvents/event-one").get());
    await assertFails(db.doc("entitlementAuditEvents/forged").set({
      eventType: "internal_beta_granted", businessUid: uid,
    }));
    await assertFails(db.doc("entitlementAuditEvents/event-one").update({reason: "changed"}));
    await assertFails(db.doc("entitlementAuditEvents/event-one").delete());
  }
});

test("AI interpretation cache and rate limits remain backend-only", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc("intelligenceAnalysisCache/analysis-one").set({
      businessId: "business-one", status: "complete",
    });
    await context.firestore().doc("intelligenceRateLimits/window-one").set({
      count: 1, policyVersion: "ScaleIntelligenceRateLimitV1",
    });
  });
  for (const uid of ["scaler-one", "business-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("intelligenceAnalysisCache/analysis-one").get());
    await assertFails(db.doc("intelligenceAnalysisCache/forged").set({status: "complete"}));
    await assertFails(db.doc("intelligenceRateLimits/window-one").get());
    await assertFails(db.doc("intelligenceRateLimits/forged").set({count: 0}));
  }
});

test("material logistics proposals are callable-only records", async () => {
  for (const uid of ["scaler-one", "business-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("materialLogisticsChangeProposals/zone-one_v2").get());
    await assertFails(db.doc("materialLogisticsChangeProposals/zone-one_v2")
      .update({status: "accepted"}));
    await assertFails(db.doc("materialLogisticsChangeProposals/forged").set({
      affectedScalerIds: [uid], status: "accepted",
    }));
  }
});

test("notifications are recipient-private server events with read-only acknowledgment", async () => {
  const id = "notifications/assignment_zone-one_scaler-one";
  await assertSucceeds(store("scaler-one").doc(id).get());
  await assertFails(store("scaler-two").doc(id).get());
  await assertFails(store("business-one").doc(id).get());
  await assertSucceeds(store("scaler-one").doc(id).update({
    read: true, readAt: new Date(),
  }));
  await assertFails(store("scaler-two").doc(id).update({read: true}));
  await assertFails(store("scaler-one").doc(id).update({title: "Forged"}));
  await assertFails(store("scaler-one").doc("notifications/forged").set({
    userId: "scaler-one", type: "job_assignment", read: false,
  }));
});

test("no client can mutate native or client-claimed legacy route evidence", async () => {
  for (const uid of ["scaler-one", "scaler-two", "business-one", "business-two", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("campaignRoutes/route-one").update({points: [{latitude: 0}]}));
    await assertFails(db.doc("campaignRoutes/route-one").delete());
    await assertFails(db.doc("campaignRoutes/fake-legacy").set({
      scalerId: uid, campaignId: "campaign-one", zoneId: "zone-one",
      routeSource: "legacy_browser_v1", points: [],
    }));
  }
  await assertSucceeds(store("scaler-one").doc("campaignRoutes/route-one").get());
  await assertSucceeds(store("business-one").doc("campaignRoutes/route-one").get());
  await assertSucceeds(store("admin-one").doc("campaignRoutes/route-one").get());
  await assertFails(store("scaler-two").doc("campaignRoutes/route-one").get());
});

test("tracking sessions, chunks, checkpoints, and active pointers are server-only writes", async () => {
  for (const uid of ["scaler-one", "business-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("trackingSessions/session-one").update({status: "completed"}));
    await assertFails(db.doc("trackingSessions/session-one/chunks/forged").set({points: []}));
    await assertFails(db.doc("trackingSessions/session-one/checkpoints/forged").set({storagePath: "x"}));
    await assertFails(db.doc("activeTrackingSessions/scaler-one").set({sessionId: "forged"}));
  }
});

test("assigned scaler and businesses cannot spoof protected campaign zone state", async () => {
  const attempts = [
    {status: "completed"}, {assignedScalerId: "scaler-two"},
    {activeTrackingSessionId: "forged"}, {gpsTracking: false},
    {routeId: "forged"}, {routePointCount: 999},
    {completionPercentage: 100}, {paymentStatus: "paid"}, {payoutAmount: 10000},
  ];
  for (const uid of ["scaler-one", "scaler-two", "business-one", "business-two"]) {
    for (const patch of attempts) {
      await assertFails(store(uid).doc("campaignZones/zone-one").update(patch));
    }
  }
});

test("owning business may edit only mapped draft configuration fields", async () => {
  const ref = store("business-one").doc("campaignZones/zone-draft");
  await assertSucceeds(ref.update({zoneName: "Safer draft", estimatedHomes: 75, updatedAt: new Date()}));
  await assertFails(ref.update({status: "assigned"}));
  await assertFails(ref.update({assignedScalerId: "scaler-one"}));
  await assertFails(store("business-two").doc("campaignZones/zone-draft").update({zoneName: "stolen"}));
});

test("clients cannot mutate wallets or authoritative financial records", async () => {
  for (const uid of ["business-one", "scaler-one", "admin-one"]) {
    const db = store(uid);
    await assertFails(db.doc("wallets/business-one").update({availableCredits: 999999}));
    await assertFails(db.doc("walletTransactions/forged").set({businessId: uid, amount: 999999}));
    await assertFails(db.doc("campaignPayments/payment-one").update({status: "funded"}));
    await assertFails(db.doc("scalerTransfers/transfer-one").update({status: "paid"}));
    await assertFails(db.doc("stripeConnectedAccounts/scaler-one").update({transfersStatus: "active"}));
    await assertFails(db.doc("assignmentCompensations/zone-one").update({baseAmountCents: 1}));
    await assertFails(db.doc("financialOperations/op-one").update({status: "succeeded"}));
    await assertFails(db.doc("stripeEvents/evt_test").get());
  }
});

test("financial reads are scoped to participants and admins", async () => {
  await assertSucceeds(store("business-one").doc("campaignPayments/payment-one").get());
  await assertFails(store("business-two").doc("campaignPayments/payment-one").get());
  await assertFails(store("scaler-one").doc("campaignPayments/payment-one").get());
  await assertSucceeds(store("admin-one").doc("campaignPayments/payment-one").get());

  await assertSucceeds(store("scaler-one").doc("scalerTransfers/transfer-one").get());
  await assertSucceeds(store("business-one").doc("scalerTransfers/transfer-one").get());
  await assertFails(store("scaler-two").doc("scalerTransfers/transfer-one").get());
  await assertSucceeds(store("admin-one").doc("scalerTransfers/transfer-one").get());
});
