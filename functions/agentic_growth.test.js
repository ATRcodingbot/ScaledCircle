"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const agentic = require("../functions-agentic-growth/agentic_growth");

const now = Date.parse("2030-01-01T12:00:00Z");

test("distinct agents use bounded autonomy and never unrestricted authority", () => {
  for (const agentType of agentic.AGENT_TYPES) {
    const profile = agentic.createAgentProfile({businessUid: "scaledcircle", agentType, now});
    assert.equal(profile.unrestrictedAutonomy, false);
    assert.equal(profile.externalMutationCertified, false);
  }
  assert.deepEqual(agentic.AUTONOMY_MODES,
    ["observe", "draft", "approval_required", "bounded_managed"]);
});

test("structured playbook compiles critical rules and preserves unknown instructions for review", () => {
  const playbook = agentic.compilePlaybook({businessUid: "biz", agentType: "business_assistant",
    allowedServices: ["Decks", "Patios"], serviceArea: ["Howard County, MD"],
    qualificationQuestions: ["What type of project are you considering?"],
    pricingAuthority: "approved_estimate_range",
    plainLanguageRules: ["Never quote price", "Use my special judgment rule"], now});
  assert.equal(playbook.pricingAuthority, "none");
  assert.equal(playbook.recognizedRules.includes("never_quote_price"), true);
  assert.equal(playbook.activationBlockedByUnparsedCriticalRule, true);
  assert.equal(playbook.unparsedInstructions.length, 1);
  assert.equal(playbook.prohibitedClaims.includes("fabricated_availability"), true);
});

test("permission authority keeps every external channel disabled", () => {
  const permission = agentic.permissionModel({businessUid: "biz", agentType: "lead_generation",
    autonomyMode: "bounded_managed", readableResources: ["public_business_sources"],
    draftableActions: ["research_prospect", "draft_outreach"]});
  assert.equal(permission.externalActions.every((item) => item.allowed === false), true);
  assert.equal(permission.maySend, false);
  assert.equal(permission.mayCall, false);
  assert.equal(permission.mayText, false);
});

test("budget hierarchy, contact limits, and kill switch fail safely", () => {
  assert.throws(() => agentic.budgetModel({businessUid: "biz", agentType: "supervisor",
    perActionMinor: 200, dailyMinor: 100}), /invalid_agent_budget_hierarchy/);
  const budget = agentic.budgetModel({businessUid: "biz", agentType: "lead_generation",
    dailyContactLimit: 0, monthlyContactLimit: 0, killSwitch: true});
  const decision = agentic.supervisorDecision({businessUid: "biz", profiles: [], actions: [],
    budgets: [budget]});
  assert.equal(decision.safeToDraft, false);
  assert.equal(decision.safeToExecuteExternally, false);
  assert.equal(decision.reasons.includes("kill_switch_active"), true);
});

test("agent actions are deterministic, auditable, and reject secret-bearing payloads", () => {
  const input = {businessUid: "biz", agentType: "marketing_manager",
    actionType: "propose_social_optimization", subjectId: "post-1",
    inputEvidenceIds: ["assessment-1"], payload: {recommendation: "improve"}, now};
  const first = agentic.createAction(input);
  const second = agentic.createAction(input);
  assert.equal(first.id, second.id);
  assert.equal(first.record.actionHash, second.record.actionHash);
  assert.equal(first.record.externalMutationEnabled, false);
  assert.throws(() => agentic.createAction({...input, payload: {accessToken: "forbidden"}}),
    /sensitive_agent_payload_forbidden/);
});

test("agent runs are replay-safe and audits exclude opaque chats and credentials", () => {
  const input = {businessUid: "biz", agentType: "growth_strategist",
    requestKey: "weekly_review_20300101", observationIds: ["metric-1"], now};
  const first = agentic.createAgentRun(input);
  const second = agentic.createAgentRun(input);
  assert.equal(first.id, second.id);
  assert.equal(first.record.opaqueChatHistoryStored, false);
  const audit = agentic.auditEvent({businessUid: "biz", agentType: "growth_strategist",
    runId: first.id, eventType: "recommendation_created", safeSummary: "One bounded experiment.", now});
  assert.equal(audit.record.containsRawConversation, false);
  assert.equal(audit.record.containsProviderCredential, false);
});

test("approval binds the exact immutable action without authorizing execution", () => {
  const action = agentic.createAction({businessUid: "biz", agentType: "business_assistant",
    actionType: "draft_customer_response", subjectId: "lead-1", payload: {}, now});
  const approval = agentic.approvalRecord({businessUid: "biz",
    action: {id: action.id, ...action.record}, approverUid: "owner", decision: "approved", now});
  assert.equal(approval.record.actionHash, action.record.actionHash);
  assert.equal(approval.record.executionAuthorized, false);
  assert.throws(() => agentic.approvalRecord({businessUid: "other",
    action: action.record, approverUid: "owner", decision: "approved"}), /not_owned/);
});

test("uncertainty and restricted facts escalate instead of hallucinating", () => {
  const playbook = agentic.compilePlaybook({businessUid: "biz",
    agentType: "business_assistant", allowedServices: ["Decks"],
    qualificationQuestions: ["What is the project location?"], now});
  const price = agentic.businessAssistantDraft({businessUid: "biz", playbook,
    observation: {intent: "price", service: "Decks", confidence: "high"}, now});
  assert.equal(price.status, "escalated");
  assert.equal(price.draft, null);
  const unknownService = agentic.businessAssistantDraft({businessUid: "biz", playbook,
    observation: {intent: "quote_request", service: "Roofing", confidence: "high"}, now});
  assert.equal(unknownService.status, "escalated");
  assert.equal(unknownService.externalMessageSent, false);
});

test("safe inbound evidence creates a draft that still requires Business approval", () => {
  const playbook = agentic.compilePlaybook({businessUid: "biz",
    agentType: "business_assistant", allowedServices: ["Decks"],
    qualificationQuestions: ["What is the project location?"], now});
  const result = agentic.businessAssistantDraft({businessUid: "biz", playbook,
    observation: {intent: "project_inquiry", service: "Decks", confidence: "high"}, now});
  assert.equal(result.status, "drafted");
  assert.equal(result.requiresBusinessApproval, true);
  assert.equal(result.externalMessageSent, false);
});

test("assistant pipeline projects into the existing Sales authority instead of replacing it", () => {
  const estimate = agentic.assistantPipelineProjection("estimate_sent");
  assert.equal(estimate.salesStage, "interested");
  assert.equal(estimate.activityType, "estimate_sent");
  assert.equal(estimate.reusesExistingSalesAuthority, true);
  assert.equal(estimate.directCrmMutationEnabled, false);
  const won = agentic.assistantPipelineProjection("won");
  assert.equal(won.derivedFromCanonicalConversion, true);
  const suppressed = agentic.assistantPipelineProjection("do_not_contact");
  assert.equal(suppressed.suppressionStatus, "do_not_contact");
});

test("lead research ranks fit without authorizing outreach or protected targeting", () => {
  const profile = agentic.targetProfile({businessUid: "scaledcircle",
    goal: "Find qualified Maryland local businesses", geography: ["Maryland"],
    services: ["local marketing"], targetClasses: ["local business"], now});
  const ranked = agentic.rankProspect({profile, prospect: {geography: "Maryland",
    targetClass: "local business", serviceSignals: ["local marketing need"]}});
  assert.equal(ranked.fit, "high_fit");
  assert.equal(ranked.outreachAuthorized, false);
  const excluded = agentic.rankProspect({profile, prospect: {usesProtectedTrait: true}});
  assert.equal(excluded.fit, "excluded");
});

test("growth strategy uses explicit insufficient evidence instead of invented advice", () => {
  const result = agentic.growthStrategy({businessUid: "biz",
    evidence: [{businessUid: "biz", id: "views", status: "available", value: 4}], now});
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.recommendation, "INSUFFICIENT_EVIDENCE");
});

test("marketing manager reuses owned Social evidence and cannot mutate providers", () => {
  const result = agentic.marketingManagerReview({businessUid: "biz",
    assessments: [{businessUid: "biz", contentItemId: "one", recommendation: "replace"},
      {businessUid: "other", contentItemId: "leak", recommendation: "replace"}], ratings: []});
  assert.deepEqual(result.needsAttention, ["one"]);
  assert.equal(result.providerMutationsEnabled, false);
  assert.equal(result.externalPublishingEnabled, false);
});

test("supervisor detects duplicate active actions and never permits external execution", () => {
  const actions = ["a", "b"].map((id) => ({id, businessUid: "biz", subjectId: "lead-1",
    actionType: "draft_customer_response", state: "awaiting_approval"}));
  const decision = agentic.supervisorDecision({businessUid: "biz", actions,
    profiles: [], budgets: []});
  assert.equal(decision.status, "attention_required");
  assert.equal(decision.reasons.includes("conflicting_active_actions"), true);
  assert.equal(decision.safeToExecuteExternally, false);
});

test("execution transition remains impossible without a separately certified authority", () => {
  assert.throws(() => agentic.transitionAction({state: "approved"}, "executing"),
    /invalid_agent_action_transition/);
  assert.throws(() => agentic.transitionAction({state: "drafted"}, "executing"),
    /invalid_agent_action_transition/);
});

test("Business and Admin projections expose status, not provider tokens or raw conversations", () => {
  const profiles = [agentic.createAgentProfile({businessUid: "biz",
    agentType: "marketing_manager", now})];
  const supervisor = agentic.supervisorDecision({businessUid: "biz", profiles,
    actions: [], budgets: []});
  const business = agentic.businessControlCenter({businessUid: "biz", profiles,
    actions: [], escalations: [], recommendations: [], supervisor});
  const admin = agentic.adminProjection({profiles, actions: [], escalations: [], budgets: []});
  assert.equal(business.title, "AI Team");
  assert.equal(business.externalActionsEnabled, false);
  assert.equal(admin.rawConversationContentExposed, false);
  assert.equal(admin.providerTokensExposed, false);
});

test("ScaledCircle dogfood begins with observe/draft agents and a global external kill switch", () => {
  const workspace = agentic.scaledCircleDogfoodWorkspace({businessUid: "scaledcircle", now});
  assert.equal(workspace.profiles.length, 5);
  assert.equal(workspace.profiles.some((item) => item.autonomyMode === "bounded_managed"), false);
  assert.equal(workspace.businessAssistant.customerMessagesSent, 0);
  assert.equal(workspace.leadGeneration.outreachSent, 0);
  assert.equal(workspace.supervisor.externalMutationKillSwitch, true);
  assert.equal(workspace.externalActions, 0);
});

test("canonical action and lead states stay explicit", () => {
  assert.equal(agentic.ACTION_STATES.includes("unknown_outcome"), true);
  assert.equal(agentic.PIPELINE_STATES.includes("do_not_contact"), true);
  assert.equal(agentic.PROSPECT_FIT.includes("research_needed"), true);
});
