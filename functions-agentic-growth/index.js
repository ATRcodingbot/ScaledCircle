"use strict";

const crypto = require("node:crypto");
const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const agentic = require("./agentic_growth");

if (getApps().length === 0) initializeApp();
const db = getFirestore();
setGlobalOptions({region: "us-east1"});

const SAFE_AGENT_LABELS = Object.freeze({
  marketing_manager: Object.freeze({name: "Marketing Manager", state: "Observing"}),
  business_assistant: Object.freeze({name: "Business Assistant", state: "Draft only"}),
  lead_generation: Object.freeze({name: "Lead Generation", state: "Research only"}),
  growth_strategist: Object.freeze({name: "Growth Strategist", state: "Observing"}),
  supervisor: Object.freeze({name: "Supervisor", state: "Safety active"}),
});

function safeText(value, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(JSON.stringify(value))
    .digest("hex").slice(0, 40)}`;
}

async function requireAgenticActor(request, {adminOnly = false} = {}) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to use the AI Team.");
  const user = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  const role = safeText(user.role, 40).toLowerCase();
  const isAdmin = role === "admin";
  if (adminOnly && !isAdmin) throw new HttpsError("permission-denied", "Admin access is required.");
  if (!isAdmin && role !== "business") {
    throw new HttpsError("permission-denied", "The AI Team is available to Business accounts.");
  }
  if (!isAdmin && request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verify your email address before using the AI Team.");
  }
  return {uid: request.auth.uid, isAdmin};
}

function docs(snapshot) {
  return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
}

function evidenceState(snapshot) {
  if (!snapshot) return "NO_DATA";
  const raw = safeText(snapshot.availability || snapshot.status, 80).toLowerCase();
  if (["unavailable", "outside_retention_window", "insufficient_permission"].includes(raw)) {
    return raw.toUpperCase();
  }
  const metrics = snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics : {};
  return Object.values(metrics).some((value) => Number.isFinite(Number(value))) ?
    "AVAILABLE" : "INSUFFICIENT_EVIDENCE";
}

function recommendationRecord({businessUid, assessment, performance, now}) {
  const contentItemId = safeText(assessment.contentItemId, 500) || assessment.id;
  const versionId = safeText(assessment.versionId || assessment.sourceVersionId, 500) || null;
  const platform = safeText(assessment.platform || assessment.provider, 60) || "unknown";
  const recommendation = safeText(assessment.recommendation, 40).toUpperCase() || "KEEP";
  const score = Number(assessment.creativeQualityScore ?? assessment.overallScore);
  const creativeEvidence = Number.isFinite(score) ?
    `Creative quality ${Math.round(score)}/100.` : "Creative quality evidence is unavailable.";
  const performanceStatus = evidenceState(performance);
  const timing = assessment.timing || {};
  const repetition = assessment.repetition || {};
  const discovery = assessment.discovery || {};
  const reason = safeText(assessment.reason || assessment.summary, 700) ||
    `${recommendation === "KEEP" ? "Keep" : "Review"} based on the current bounded quality assessment.`;
  const source = {businessUid, contentItemId, versionId, platform, recommendation};
  return {
    id: stableId("agent_recommendation", source),
    record: {
      schemaVersion: agentic.SCHEMA_VERSION,
      businessUid,
      agentType: "marketing_manager",
      contentItemId,
      versionId,
      platform,
      currentQualityState: safeText(assessment.qualityBand, 60).toUpperCase() || "UNAVAILABLE",
      creativeQualityEvidence: creativeEvidence,
      performanceEvidenceState: performanceStatus,
      timingConfidence: safeText(timing.confidence || assessment.timingConfidence, 20)
        .toUpperCase() || "LOW",
      discoveryNotes: safeText(discovery.reason || assessment.discoveryNotes, 500) ||
        "No additional discovery-language evidence is available.",
      repetitionRisk: repetition.repeated === true ? "FLAGGED" :
        safeText(assessment.repetitionRisk, 30).toUpperCase() || "NOT_FLAGGED",
      recommendation,
      reason,
      founderActionNeeded: recommendation !== "KEEP",
      externalExecutionAllowed: false,
      providerMutationRouteAvailable: false,
      status: "observed",
      createdAt: now,
      updatedAt: now,
    },
  };
}

exports.initializeAgenticGrowthDogfoodV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    const actor = await requireAgenticActor(request);
    const workspace = agentic.scaledCircleDogfoodWorkspace({businessUid: actor.uid});
    const batch = db.batch();
    for (const profile of workspace.profiles) {
      batch.set(db.collection("agentProfiles").doc(`${actor.uid}_${profile.agentType}`), {
        ...profile,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      const permission = agentic.permissionModel({businessUid: actor.uid,
        agentType: profile.agentType, autonomyMode: profile.autonomyMode,
        readableResources: profile.agentType === "marketing_manager" ?
          ["social_plans", "social_quality", "social_performance"] : [],
        draftableActions: profile.agentType === "business_assistant" ?
          ["draft_customer_response"] : []});
      batch.set(db.collection("agentPermissions").doc(`${actor.uid}_${profile.agentType}`),
        {...permission, updatedAt: FieldValue.serverTimestamp()}, {merge: false});
    }
    const supervisorBudget = agentic.budgetModel({businessUid: actor.uid,
      agentType: "supervisor", killSwitch: true});
    batch.set(db.collection("agentBudgets").doc(`${actor.uid}_supervisor`),
      {...supervisorBudget, updatedAt: FieldValue.serverTimestamp()}, {merge: false});
    batch.set(db.collection("agentHealth").doc(actor.uid), {
      schemaVersion: agentic.SCHEMA_VERSION, businessUid: actor.uid,
      externalActionsEnabled: false, externalExecutionRouteCount: 0,
      killSwitchActive: true, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: false});
    await batch.commit();
    return {initialized: true, agentCount: workspace.profiles.length,
      externalActionsEnabled: false, externalExecutionRouteCount: 0,
      killSwitchActive: true};
  },
);

exports.getAgenticGrowthWorkspaceV1 = onCall(
  {enforceAppCheck: false, maxInstances: 4},
  async (request) => {
    const actor = await requireAgenticActor(request);
    const [profiles, runs, observations, recommendations, health] = await Promise.all([
      db.collection("agentProfiles").where("businessUid", "==", actor.uid).limit(10).get(),
      db.collection("agentRuns").where("businessUid", "==", actor.uid).limit(20).get(),
      db.collection("agentObservations").where("businessUid", "==", actor.uid).limit(100).get(),
      db.collection("agentRecommendations").where("businessUid", "==", actor.uid).limit(100).get(),
      db.collection("agentHealth").doc(actor.uid).get(),
    ]);
    const profileMap = new Map(docs(profiles).map((item) => [item.agentType, item]));
    return {schemaVersion: agentic.SCHEMA_VERSION, title: "AI Team",
      initialized: profiles.size > 0,
      agents: agentic.AGENT_TYPES.map((type) => ({type, ...SAFE_AGENT_LABELS[type],
        enabled: profileMap.get(type)?.enabled === true})),
      runs: docs(runs).map((item) => ({id: item.id, status: item.status,
        agentType: item.agentType, createdAt: item.createdAt || null})),
      observations: docs(observations).map((item) => ({id: item.id,
        evidenceState: item.evidenceState, summary: item.safeSummary,
        createdAt: item.createdAt || null})),
      recommendations: docs(recommendations).map((item) => ({id: item.id,
        contentItemId: item.contentItemId, versionId: item.versionId, platform: item.platform,
        currentQualityState: item.currentQualityState,
        creativeQualityEvidence: item.creativeQualityEvidence,
        performanceEvidenceState: item.performanceEvidenceState,
        timingConfidence: item.timingConfidence, discoveryNotes: item.discoveryNotes,
        repetitionRisk: item.repetitionRisk, recommendation: item.recommendation,
        reason: item.reason, founderActionNeeded: item.founderActionNeeded === true})),
      externalActionsEnabled: false, externalExecutionRouteCount: 0,
      killSwitchActive: health.data()?.killSwitchActive !== false};
  },
);

exports.runMarketingManagerObserveV1 = onCall(
  {enforceAppCheck: false, maxInstances: 1},
  async (request) => {
    const actor = await requireAgenticActor(request);
    const requestKey = safeText(request.data?.requestKey, 160);
    if (!/^[A-Za-z0-9_-]{12,160}$/.test(requestKey)) {
      throw new HttpsError("invalid-argument", "The review request is not valid.");
    }
    const run = agentic.createAgentRun({businessUid: actor.uid,
      agentType: "marketing_manager", requestKey});
    const runRef = db.collection("agentRuns").doc(run.id);
    const existing = await runRef.get();
    if (existing.exists) return {runId: run.id, reused: true,
      observationCount: Number(existing.data()?.observationCount || 0),
      recommendationCount: Number(existing.data()?.recommendationCount || 0),
      externalExecutionAllowed: false};

    const [assessmentsSnapshot, ratingsSnapshot, performanceSnapshot,
      plansSnapshot, connectionsSnapshot] = await Promise.all([
      db.collection("socialContentQualityAssessments").where("businessUid", "==", actor.uid)
        .limit(100).get(),
      db.collection("socialPastPostRatings").where("businessUid", "==", actor.uid)
        .limit(100).get(),
      db.collection("socialPerformanceSnapshots").where("businessUid", "==", actor.uid)
        .limit(100).get(),
      db.collection("socialContentPlans").where("businessUid", "==", actor.uid).limit(10).get(),
      db.collection("socialConnections").doc(actor.uid).collection("providers").limit(10).get(),
    ]);
    const assessments = docs(assessmentsSnapshot);
    const ratings = docs(ratingsSnapshot);
    const performance = docs(performanceSnapshot);
    const byContent = new Map(performance.map((item) => [item.contentItemId, item]));
    const now = Date.now();
    const recommendations = assessments.map((assessment) => recommendationRecord({
      businessUid: actor.uid, assessment,
      performance: byContent.get(assessment.contentItemId), now,
    }));
    const evidenceStateValue = assessments.length || ratings.length || performance.length ?
      "AVAILABLE" : "NO_DATA";
    const observationSource = {businessUid: actor.uid, requestKey,
      plans: plansSnapshot.size, assessments: assessments.length, ratings: ratings.length,
      performance: performance.length, connections: connectionsSnapshot.size};
    const observationId = stableId("agent_observation", observationSource);
    const observation = {schemaVersion: agentic.SCHEMA_VERSION, businessUid: actor.uid,
      agentType: "marketing_manager", runId: run.id, evidenceState: evidenceStateValue,
      safeSummary: evidenceStateValue === "AVAILABLE" ?
        `Reviewed ${plansSnapshot.size} plan(s), ${assessments.length} quality assessment(s), ` +
          `${ratings.length} historical rating(s), and ${performance.length} performance snapshot(s).` :
        "No saved Social plan, quality assessment, rating, or performance evidence was available.",
      sourceCounts: observationSource, externalExecutionAllowed: false,
      createdAt: now, updatedAt: now};
    await db.runTransaction(async (transaction) => {
      const duplicate = await transaction.get(runRef);
      if (duplicate.exists) return;
      transaction.create(runRef, {...run.record, observationIds: [observationId],
        observationCount: 1, recommendationCount: recommendations.length,
        externalExecutionAllowed: false, externalExecutionRouteCount: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      transaction.create(db.collection("agentObservations").doc(observationId),
        {...observation, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      for (const recommendation of recommendations) {
        transaction.set(db.collection("agentRecommendations").doc(recommendation.id),
          {...recommendation.record, runId: run.id,
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()},
          {merge: false});
      }
    });
    return {runId: run.id, reused: false, observationCount: 1,
      recommendationCount: recommendations.length, evidenceState: evidenceStateValue,
      externalExecutionAllowed: false, externalExecutionRouteCount: 0};
  },
);

exports.getAgenticGrowthAdminSummaryV1 = onCall(
  {enforceAppCheck: false, maxInstances: 2},
  async (request) => {
    await requireAgenticActor(request, {adminOnly: true});
    const [profiles, runs, observations, recommendations, actions, health] = await Promise.all([
      db.collection("agentProfiles").limit(200).get(), db.collection("agentRuns").limit(200).get(),
      db.collection("agentObservations").limit(200).get(),
      db.collection("agentRecommendations").limit(200).get(),
      db.collection("agentActions").limit(1).get(), db.collection("agentHealth").limit(200).get(),
    ]);
    const runRecords = docs(runs);
    const observationRecords = docs(observations);
    return {schemaVersion: agentic.SCHEMA_VERSION, agentCount: profiles.size,
      runCount: runs.size, observationCount: observations.size,
      recommendationCount: recommendations.size, actionObjectCount: actions.size,
      latestRunId: runRecords[0]?.id || null,
      evidenceStates: [...new Set(observationRecords.map((item) => item.evidenceState)
        .filter(Boolean))],
      killSwitchActiveCount: docs(health).filter((item) => item.killSwitchActive === true).length,
      externalActionsEnabled: false, externalExecutionRouteCount: 0,
      rawConversationContentExposed: false, providerTokensExposed: false};
  },
);
