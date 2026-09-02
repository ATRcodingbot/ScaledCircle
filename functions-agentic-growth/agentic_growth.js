"use strict";

const crypto = require("node:crypto");

const SCHEMA_VERSION = "AgenticGrowthAuthorityV1";
const AGENT_TYPES = Object.freeze([
  "marketing_manager", "business_assistant", "lead_generation",
  "growth_strategist", "supervisor",
]);
const AUTONOMY_MODES = Object.freeze([
  "observe", "draft", "approval_required", "bounded_managed",
]);
const ACTION_STATES = Object.freeze([
  "observed", "drafted", "awaiting_approval", "approved", "executing",
  "completed", "failed", "canceled", "escalated", "unknown_outcome",
]);
const ACTION_TYPES = Object.freeze([
  "classify_lead", "draft_customer_response", "propose_appointment",
  "propose_crm_update", "propose_social_optimization", "rate_content",
  "research_prospect", "rank_prospect", "draft_outreach",
  "recommend_growth_experiment", "recommend_campaign",
]);
const PIPELINE_STATES = Object.freeze([
  "new", "qualified", "needs_follow_up", "appointment_set", "estimate_sent",
  "waiting", "won", "lost", "do_not_contact",
]);
const PROSPECT_FIT = Object.freeze([
  "high_fit", "medium_fit", "research_needed", "low_fit", "excluded",
]);
const CRM_STAGE_ADAPTER = Object.freeze({
  new: Object.freeze({salesStage: "prospect"}),
  qualified: Object.freeze({salesStage: "qualified"}),
  needs_follow_up: Object.freeze({salesStage: "contacted", requiresFollowUpAt: true}),
  appointment_set: Object.freeze({salesStage: "interested", activityType: "appointment_set"}),
  estimate_sent: Object.freeze({salesStage: "interested", activityType: "estimate_sent"}),
  waiting: Object.freeze({salesStage: "interested", requiresFollowUpAt: true}),
  won: Object.freeze({salesStage: null, derivedFromCanonicalConversion: true}),
  lost: Object.freeze({salesStage: "closed_not_interested"}),
  do_not_contact: Object.freeze({salesStage: null, suppressionStatus: "do_not_contact"}),
});
const EXTERNAL_ACTIONS = new Set([
  "send_customer_reply", "send_outreach_email", "send_sms", "place_call",
  "publish_social", "mutate_ad", "book_appointment",
]);

function cleanText(value, maximumLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function cleanList(value, maximumItems = 30, maximumLength = 180) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, maximumLength)).filter(Boolean))].slice(0, maximumItems);
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireBusinessUid(value) {
  const businessUid = cleanText(value, 180);
  if (!businessUid) throw new Error("agent_business_required");
  return businessUid;
}

function requireAgentType(value) {
  const agentType = cleanText(value, 60).toLowerCase();
  if (!AGENT_TYPES.includes(agentType)) throw new Error("unsupported_agent_type");
  return agentType;
}

function requireAutonomyMode(value) {
  const mode = cleanText(value, 40).toLowerCase();
  if (!AUTONOMY_MODES.includes(mode)) throw new Error("unsupported_agent_autonomy_mode");
  return mode;
}

function normalizeMoney(value, maximum = 100000000) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > maximum) {
    throw new Error("invalid_agent_budget");
  }
  return amount;
}

function createAgentProfile({businessUid, agentType, autonomyMode = "observe", enabled = true,
  displayName, now = Date.now()}) {
  const type = requireAgentType(agentType);
  const mode = requireAutonomyMode(autonomyMode);
  return {schemaVersion: SCHEMA_VERSION, businessUid: requireBusinessUid(businessUid),
    agentType: type, displayName: cleanText(displayName, 100) ||
      type.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
    enabled: enabled === true, autonomyMode: mode,
    externalMutationCertified: false, unrestrictedAutonomy: false,
    status: enabled === true ? "active" : "disabled", createdAt: now, updatedAt: now};
}

function compilePlaybook({businessUid, agentType, allowedServices = [], serviceArea = [],
  businessHours = {}, tone = "professional", qualificationQuestions = [], schedulingRules = {},
  pricingAuthority = "none", prohibitedClaims = [], escalationRules = {}, followupRules = {},
  approvalMode = "approval_required", plainLanguageRules = [], now = Date.now()}) {
  const type = requireAgentType(agentType);
  const pricing = cleanText(pricingAuthority, 40).toLowerCase();
  if (!["none", "canonical_catalog", "approved_estimate_range"].includes(pricing)) {
    throw new Error("invalid_pricing_authority");
  }
  const daySet = cleanList(businessHours.days, 7, 12).map((day) => day.toLowerCase());
  const rules = cleanList(plainLanguageRules, 30, 300);
  const recognized = [];
  const unparsed = [];
  for (const rule of rules) {
    const normalized = rule.toLowerCase();
    if (/never\s+(quote|provide)\s+price/.test(normalized)) recognized.push("never_quote_price");
    else if (/do not contact .* more than \d+|contact limit/.test(normalized)) {
      recognized.push("contact_frequency_limit");
    } else if (/escalate .*\$[\d,]+|project.*over.*\$[\d,]+/.test(normalized)) {
      recognized.push("value_escalation_threshold");
    } else if (/only schedule|business hours|monday|weekday/.test(normalized)) {
      recognized.push("schedule_window");
    } else unparsed.push(rule);
  }
  const claims = cleanList([
    "fabricated_price", "fabricated_availability", "fabricated_license",
    "fabricated_insurance", "fabricated_warranty", "fabricated_guarantee",
    "fabricated_refund_policy", "fabricated_discount", "fabricated_completion_date",
    ...prohibitedClaims,
  ], 40, 120);
  const source = {businessUid: requireBusinessUid(businessUid), agentType: type,
    allowedServices: cleanList(allowedServices, 40, 120), serviceArea: cleanList(serviceArea, 30, 160),
    businessHours: {timeZone: cleanText(businessHours.timeZone, 80) || null,
      days: daySet, opensAt: cleanText(businessHours.opensAt, 8) || null,
      closesAt: cleanText(businessHours.closesAt, 8) || null},
    tone: cleanText(tone, 120) || "professional",
    qualificationQuestions: cleanList(qualificationQuestions, 20, 240),
    schedulingRules: {allowProposal: schedulingRules.allowProposal === true,
      requireCanonicalAvailability: true, bookingMutationCertified: false},
    pricingAuthority: recognized.includes("never_quote_price") ? "none" : pricing,
    prohibitedClaims: claims,
    escalationRules: {angryCustomer: escalationRules.angryCustomer !== false,
      sensitiveMatter: escalationRules.sensitiveMatter !== false,
      uncertainAuthority: true,
      valueThresholdMinor: escalationRules.valueThresholdMinor == null ? null :
        normalizeMoney(escalationRules.valueThresholdMinor)},
    followupRules: {maximumAttempts: Math.min(10, Math.max(0,
      Number.isInteger(Number(followupRules.maximumAttempts)) ? Number(followupRules.maximumAttempts) : 0)),
    minimumIntervalHours: Math.min(720, Math.max(1,
      Number.isInteger(Number(followupRules.minimumIntervalHours)) ?
        Number(followupRules.minimumIntervalHours) : 24))},
    approvalMode: requireAutonomyMode(approvalMode), recognizedRules: [...new Set(recognized)],
    unparsedInstructions: unparsed,
    activationBlockedByUnparsedCriticalRule: unparsed.length > 0};
  return {schemaVersion: SCHEMA_VERSION, ...source,
    playbookHash: digest(source), createdAt: now, updatedAt: now};
}

function permissionModel({businessUid, agentType, autonomyMode, readableResources = [],
  draftableActions = []}) {
  const type = requireAgentType(agentType);
  const mode = requireAutonomyMode(autonomyMode);
  const drafts = cleanList(draftableActions, 30, 80)
    .filter((action) => ACTION_TYPES.includes(action));
  return {schemaVersion: SCHEMA_VERSION, businessUid: requireBusinessUid(businessUid),
    agentType: type, autonomyMode: mode,
    readableResources: cleanList(readableResources, 40, 100), draftableActions: drafts,
    externalActions: [...EXTERNAL_ACTIONS].map((action) => ({action, allowed: false,
      certificationStatus: "not_certified"})),
    maySend: false, mayPublish: false, mayCall: false, mayText: false,
    mayBookAppointment: false, unrestrictedAuthority: false};
}

function budgetModel({businessUid, agentType, perActionMinor = 0, dailyMinor = 0,
  monthlyMinor = 0, providerMinor = 0, dailyContactLimit = 0,
  monthlyContactLimit = 0, approvalThresholdMinor = 0, killSwitch = false}) {
  const budget = {schemaVersion: SCHEMA_VERSION, businessUid: requireBusinessUid(businessUid),
    agentType: requireAgentType(agentType), perActionMinor: normalizeMoney(perActionMinor),
    dailyMinor: normalizeMoney(dailyMinor), monthlyMinor: normalizeMoney(monthlyMinor),
    providerMinor: normalizeMoney(providerMinor), dailyContactLimit: normalizeMoney(dailyContactLimit, 10000),
    monthlyContactLimit: normalizeMoney(monthlyContactLimit, 100000),
    approvalThresholdMinor: normalizeMoney(approvalThresholdMinor), killSwitch: killSwitch === true};
  if ((budget.dailyMinor && budget.perActionMinor > budget.dailyMinor) ||
      (budget.monthlyMinor && budget.dailyMinor > budget.monthlyMinor) ||
      (budget.monthlyContactLimit && budget.dailyContactLimit > budget.monthlyContactLimit)) {
    throw new Error("invalid_agent_budget_hierarchy");
  }
  return budget;
}

function createAction({businessUid, agentType, actionType, subjectId, inputEvidenceIds = [],
  payload = {}, autonomyMode = "draft", version = 1, now = Date.now()}) {
  const type = requireAgentType(agentType);
  const action = cleanText(actionType, 80).toLowerCase();
  if (!ACTION_TYPES.includes(action)) throw new Error("unsupported_agent_action");
  const mode = requireAutonomyMode(autonomyMode);
  const safePayload = JSON.parse(JSON.stringify(payload || {}));
  for (const forbidden of ["accessToken", "refreshToken", "password", "clientSecret", "rawMailboxBody"]) {
    if (Object.hasOwn(safePayload, forbidden)) throw new Error("sensitive_agent_payload_forbidden");
  }
  const identity = {businessUid: requireBusinessUid(businessUid), agentType: type,
    actionType: action, subjectId: cleanText(subjectId, 180) || null,
    inputEvidenceIds: cleanList(inputEvidenceIds, 100, 180), version: Number(version), payload: safePayload};
  if (!Number.isInteger(identity.version) || identity.version < 1) throw new Error("invalid_action_version");
  const actionHash = digest(identity);
  return {id: `agent_action_${actionHash.slice(0, 40)}`, record: {schemaVersion: SCHEMA_VERSION,
    ...identity, actionHash, state: mode === "observe" ? "observed" : "drafted",
    autonomyMode: mode, requiresApprovalBeforeExternalEffect: true,
    externalMutationRequested: false, externalMutationEnabled: false,
    providerCostMinor: 0, createdAt: now, updatedAt: now}};
}

function createAgentRun({businessUid, agentType, requestKey, observationIds = [],
  playbookHash, now = Date.now()}) {
  const key = cleanText(requestKey, 160);
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(key)) throw new Error("invalid_agent_run_request_key");
  const source = {businessUid: requireBusinessUid(businessUid), agentType: requireAgentType(agentType),
    requestKey: key, observationIds: cleanList(observationIds, 100, 180),
    playbookHash: cleanText(playbookHash, 64) || null};
  return {id: `agent_run_${digest(source).slice(0, 40)}`, record: {schemaVersion: SCHEMA_VERSION,
    ...source, status: "observed", actionIds: [], opaqueChatHistoryStored: false,
    externalMutationEnabled: false, createdAt: now, updatedAt: now}};
}

function auditEvent({businessUid, agentType, runId, actionId = null, eventType,
  actorType = "agent", safeSummary, now = Date.now()}) {
  const event = cleanText(eventType, 80).toLowerCase();
  if (!event) throw new Error("agent_audit_event_required");
  const source = {businessUid: requireBusinessUid(businessUid), agentType: requireAgentType(agentType),
    runId: cleanText(runId, 180), actionId: cleanText(actionId, 180) || null,
    eventType: event, actorType: cleanText(actorType, 40), safeSummary: cleanText(safeSummary, 600)};
  return {id: `agent_audit_${digest({...source, now}).slice(0, 40)}`, record: {
    schemaVersion: SCHEMA_VERSION, ...source, containsRawConversation: false,
    containsProviderCredential: false, occurredAt: now}};
}

const TRANSITIONS = Object.freeze({
  observed: ["drafted", "canceled", "escalated"],
  drafted: ["awaiting_approval", "canceled", "escalated"],
  awaiting_approval: ["approved", "canceled", "escalated"],
  approved: ["canceled", "escalated"],
  executing: ["completed", "failed", "unknown_outcome", "escalated"],
  unknown_outcome: ["completed", "failed", "escalated"],
  completed: [], failed: [], canceled: [], escalated: [],
});

function transitionAction(action, nextState, {externalExecutionCertified = false, now = Date.now()} = {}) {
  const next = cleanText(nextState, 40).toLowerCase();
  if (!ACTION_STATES.includes(next) || !TRANSITIONS[action?.state]?.includes(next)) {
    throw new Error("invalid_agent_action_transition");
  }
  if (next === "executing" && externalExecutionCertified !== true) {
    throw new Error("external_agent_execution_not_certified");
  }
  return {...action, state: next, updatedAt: now};
}

function approvalRecord({businessUid, action, approverUid, decision, reason, now = Date.now()}) {
  if (!action || action.businessUid !== businessUid || !action.actionHash) {
    throw new Error("agent_action_not_owned");
  }
  const normalized = cleanText(decision, 20).toLowerCase();
  if (!["approved", "rejected"].includes(normalized)) throw new Error("invalid_agent_approval_decision");
  const approver = cleanText(approverUid, 180);
  if (!approver) throw new Error("agent_approver_required");
  const record = {schemaVersion: SCHEMA_VERSION, businessUid: requireBusinessUid(businessUid),
    actionId: cleanText(action.id, 180) || null, actionHash: action.actionHash,
    actionVersion: action.version, approverUid: approver,
    decision: normalized, reason: cleanText(reason, 600) || null,
    executionAuthorized: false, decidedAt: now};
  return {id: `agent_approval_${digest(record).slice(0, 40)}`, record};
}

function assistantPipelineProjection(state) {
  const normalized = cleanText(state, 40).toLowerCase();
  if (!PIPELINE_STATES.includes(normalized)) throw new Error("invalid_assistant_pipeline_state");
  return {assistantState: normalized, ...CRM_STAGE_ADAPTER[normalized],
    reusesExistingSalesAuthority: true, directCrmMutationEnabled: false};
}

function escalationRecord({businessUid, agentType, actionId = null, reasonCode,
  safeSummary, severity = "normal", now = Date.now()}) {
  const reason = cleanText(reasonCode, 80).toLowerCase();
  if (!reason) throw new Error("agent_escalation_reason_required");
  const source = {businessUid: requireBusinessUid(businessUid), agentType: requireAgentType(agentType),
    actionId: cleanText(actionId, 180) || null, reasonCode: reason,
    safeSummary: cleanText(safeSummary, 800), severity: cleanText(severity, 20) || "normal"};
  return {id: `agent_escalation_${digest(source).slice(0, 40)}`, record: {
    schemaVersion: SCHEMA_VERSION, ...source, status: "open", externalMutationEnabled: false,
    createdAt: now, updatedAt: now}};
}

function marketingManagerReview({businessUid, assessments = [], ratings = [], timing = []}) {
  const ownedAssessments = assessments.filter((item) => item?.businessUid === businessUid);
  const ownedRatings = ratings.filter((item) => item?.businessUid === businessUid);
  return {schemaVersion: SCHEMA_VERSION, businessUid: requireBusinessUid(businessUid),
    agentType: "marketing_manager", mode: "observe",
    scheduledReviewed: ownedAssessments.length, pastPostsRated: ownedRatings.length,
    needsAttention: ownedAssessments.filter((item) => ["improve", "replace", "reschedule", "remove"]
      .includes(item.recommendation)).map((item) => item.contentItemId),
    timingRecommendations: timing.filter((item) => item?.businessUid === businessUid),
    providerMutationsEnabled: false, externalPublishingEnabled: false};
}

function businessAssistantDraft({businessUid, playbook, observation, now = Date.now()}) {
  if (playbook?.businessUid !== businessUid || playbook?.agentType !== "business_assistant") {
    throw new Error("assistant_playbook_not_owned");
  }
  const intent = cleanText(observation?.intent, 80).toLowerCase();
  const service = cleanText(observation?.service, 120);
  const asksForRestrictedFact = ["price", "availability", "license", "insurance", "warranty",
    "discount", "completion_date", "refund"].includes(intent);
  const unsupportedService = service && !playbook.allowedServices
    .some((allowed) => allowed.toLowerCase() === service.toLowerCase());
  if (asksForRestrictedFact || unsupportedService || observation?.confidence === "low") {
    return {status: "escalated", reasonCode: asksForRestrictedFact ? "uncertain_business_authority" :
      unsupportedService ? "service_not_authorized" : "insufficient_evidence",
    draft: null, externalMessageSent: false, createdAt: now};
  }
  return {status: "drafted", intent: intent || "general_inquiry", pipelineState: "new",
    draft: {purpose: "acknowledge_and_qualify", questions: playbook.qualificationQuestions,
      unsupportedClaimsIncluded: false}, requiresBusinessApproval: true,
    externalMessageSent: false, createdAt: now};
}

function targetProfile({businessUid, goal, geography = [], services = [], targetClasses = [],
  excludedTraits = [], now = Date.now()}) {
  const prohibited = cleanList(excludedTraits, 30, 80);
  const source = {businessUid: requireBusinessUid(businessUid), goal: cleanText(goal, 600),
    geography: cleanList(geography, 30, 160), services: cleanList(services, 30, 120),
    targetClasses: cleanList(targetClasses, 30, 120), excludedTraits: prohibited,
    protectedTraitTargetingAllowed: false, researchOnly: true, outreachAuthorized: false};
  if (!source.goal || !source.geography.length || !source.targetClasses.length) {
    throw new Error("incomplete_lead_target_profile");
  }
  return {schemaVersion: SCHEMA_VERSION, ...source,
    profileHash: digest(source), createdAt: now, updatedAt: now};
}

function rankProspect({profile, prospect}) {
  if (!profile?.researchOnly || profile.outreachAuthorized !== false) {
    throw new Error("invalid_research_profile");
  }
  if (prospect?.usesProtectedTrait === true || prospect?.doNotContact === true ||
      prospect?.sourcePolicyStatus === "prohibited") {
    return {fit: "excluded", reasons: ["Excluded by privacy, policy, or contact preference."],
      outreachAuthorized: false};
  }
  const geographyMatch = profile.geography.some((area) =>
    cleanText(prospect?.geography, 160).toLowerCase().includes(area.toLowerCase()));
  const classMatch = profile.targetClasses.some((target) =>
    cleanText(prospect?.targetClass, 120).toLowerCase() === target.toLowerCase());
  const serviceMatch = profile.services.some((service) =>
    cleanList(prospect?.serviceSignals, 20, 120).some((signal) =>
      signal.toLowerCase().includes(service.toLowerCase())));
  const points = Number(geographyMatch) + Number(classMatch) + Number(serviceMatch);
  const fit = points === 3 ? "high_fit" : points === 2 ? "medium_fit" :
    points === 1 ? "research_needed" : "low_fit";
  return {fit, reasons: [geographyMatch ? "Geography matches." : "Geography needs review.",
    classMatch ? "Target class matches." : "Target class needs review.",
    serviceMatch ? "Service evidence matches." : "Service evidence needs review."],
  outreachAuthorized: false};
}

function growthStrategy({businessUid, evidence = [], minimumEvidence = 3, now = Date.now()}) {
  const owned = evidence.filter((item) => item?.businessUid === businessUid &&
    item.status === "available" && Number.isFinite(Number(item.value)));
  if (owned.length < minimumEvidence) return {schemaVersion: SCHEMA_VERSION,
    businessUid: requireBusinessUid(businessUid), status: "insufficient_evidence",
    recommendation: "INSUFFICIENT_EVIDENCE", evidenceCount: owned.length,
    experiments: ["Collect comparable same-Business channel and conversion evidence."], createdAt: now};
  const strongest = [...owned].sort((a, b) => Number(b.value) - Number(a.value))[0];
  return {schemaVersion: SCHEMA_VERSION, businessUid, status: "evidence_available",
    recommendation: "Run one bounded follow-up experiment against the strongest observed signal.",
    strongestEvidenceId: cleanText(strongest.id, 180), evidenceCount: owned.length,
    externalMutationEnabled: false, createdAt: now};
}

function supervisorDecision({businessUid, profiles = [], actions = [], budgets = [], usage = {}}) {
  const uid = requireBusinessUid(businessUid);
  const ownedProfiles = profiles.filter((item) => item?.businessUid === uid);
  const ownedActions = actions.filter((item) => item?.businessUid === uid);
  const ownedBudgets = budgets.filter((item) => item?.businessUid === uid);
  const reasons = [];
  if (ownedBudgets.some((item) => item.killSwitch === true)) reasons.push("kill_switch_active");
  for (const budget of ownedBudgets) {
    const spend = Number(usage[budget.agentType]?.monthlyMinor || 0);
    if (budget.monthlyMinor === 0 ? spend > 0 : spend >= budget.monthlyMinor) {
      reasons.push(`${budget.agentType}_monthly_budget_exhausted`);
    }
  }
  const activeKeys = new Set();
  for (const action of ownedActions.filter((item) =>
    ["awaiting_approval", "approved", "executing"].includes(item.state))) {
    const key = `${action.subjectId || "none"}:${action.actionType}`;
    if (activeKeys.has(key)) reasons.push("conflicting_active_actions");
    activeKeys.add(key);
  }
  return {schemaVersion: SCHEMA_VERSION, businessUid: uid,
    activeAgentCount: ownedProfiles.filter((item) => item.enabled).length,
    safeToDraft: !reasons.includes("kill_switch_active"), safeToExecuteExternally: false,
    status: reasons.length ? "attention_required" : "healthy", reasons: [...new Set(reasons)],
    pendingApprovalCount: ownedActions.filter((item) => item.state === "awaiting_approval").length,
    externalMutationEnabled: false};
}

function businessControlCenter({businessUid, profiles = [], actions = [], escalations = [],
  recommendations = [], supervisor}) {
  const uid = requireBusinessUid(businessUid);
  const names = Object.fromEntries(profiles.filter((item) => item?.businessUid === uid)
    .map((item) => [item.agentType, {name: item.displayName,
      status: item.enabled ? "Active" : "Off", authority: item.autonomyMode}]));
  return {schemaVersion: SCHEMA_VERSION, businessUid: uid, title: "AI Team", agents: names,
    needsApproval: actions.filter((item) => item?.businessUid === uid &&
      item.state === "awaiting_approval").length,
    needsAttention: escalations.filter((item) => item?.businessUid === uid &&
      item.status !== "resolved").length,
    recommendations: recommendations.filter((item) => item?.businessUid === uid)
      .map((item) => ({title: cleanText(item.title, 160), reason: cleanText(item.reason, 500)})),
    supervisorStatus: supervisor?.status || "not_checked",
    externalActionsEnabled: false};
}

function adminProjection({profiles = [], actions = [], escalations = [], budgets = []}) {
  return {schemaVersion: SCHEMA_VERSION, agentCount: profiles.length,
    activeAgentCount: profiles.filter((item) => item.enabled).length,
    pendingApprovalCount: actions.filter((item) => item.state === "awaiting_approval").length,
    unknownOutcomeCount: actions.filter((item) => item.state === "unknown_outcome").length,
    openEscalationCount: escalations.filter((item) => item.status !== "resolved").length,
    killSwitchCount: budgets.filter((item) => item.killSwitch === true).length,
    externalMutationEnabled: false, rawConversationContentExposed: false,
    providerTokensExposed: false};
}

function scaledCircleDogfoodWorkspace({businessUid, now = Date.now()}) {
  const uid = requireBusinessUid(businessUid);
  const profiles = [
    createAgentProfile({businessUid: uid, agentType: "marketing_manager", autonomyMode: "observe", now}),
    createAgentProfile({businessUid: uid, agentType: "business_assistant", autonomyMode: "draft", now}),
    createAgentProfile({businessUid: uid, agentType: "lead_generation", autonomyMode: "observe", now}),
    createAgentProfile({businessUid: uid, agentType: "growth_strategist", autonomyMode: "observe", now}),
    createAgentProfile({businessUid: uid, agentType: "supervisor", autonomyMode: "observe", now}),
  ];
  return {schemaVersion: SCHEMA_VERSION, businessUid: uid, dogfoodBrand: "ScaledCircle",
    profiles, initialGoal: "Improve Maryland launch readiness using same-Business evidence.",
    marketingManager: {source: "existing_social_authority", providerMutationsEnabled: false},
    businessAssistant: {mode: "draft", customerMessagesSent: 0},
    leadGeneration: {mode: "research_only", outreachSent: 0},
    growthStrategist: {requiresSameBusinessEvidence: true},
    supervisor: {externalMutationKillSwitch: true}, externalActions: 0, createdAt: now};
}

module.exports = {SCHEMA_VERSION, AGENT_TYPES, AUTONOMY_MODES, ACTION_STATES, ACTION_TYPES,
  PIPELINE_STATES, PROSPECT_FIT, CRM_STAGE_ADAPTER,
  createAgentProfile, compilePlaybook, permissionModel,
  budgetModel, createAction, createAgentRun, auditEvent, transitionAction,
  approvalRecord, escalationRecord,
  assistantPipelineProjection, marketingManagerReview, businessAssistantDraft, targetProfile, rankProspect,
  growthStrategy, supervisorDecision, businessControlCenter, adminProjection,
  scaledCircleDogfoodWorkspace};
