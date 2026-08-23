"use strict";

const OPS_SCHEMA_VERSION = "AdminOpsReadModelV1";
const STALE_PAYMENT_MS = 15 * 60 * 1000;
const STALE_REFUND_MS = 24 * 60 * 60 * 1000;
const STALE_COMPLETION_MS = 48 * 60 * 60 * 1000;
const STALE_EMAIL_MS = 30 * 60 * 1000;
const QUERY_LIMIT = 100;

function text(value, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(value)) return Number(value);
  return null;
}

function ageMs(value, now) {
  const at = millis(value);
  return at == null ? null : Math.max(0, now - at);
}

function safeReference(value) {
  const raw = text(value, 160);
  if (!raw) return null;
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

function safeIdentity(data = {}) {
  return {
    displayName: text(data.displayName || data.businessName || data.name, 120) || null,
    email: text(data.email, 160) || null,
  };
}

function issue({id, category, severity, summary, status, entityType, entityId,
  campaignId, userId, createdAt, recommendedAction, detailKind}) {
  return {id, category, severity, summary, status, entityType, entityId,
    campaignId: campaignId || null, userId: userId || null,
    createdAt: millis(createdAt), recommendedAction, detailKind};
}

function paymentIssues(records, now) {
  const items = [];
  for (const record of records) {
    const data = record.data || {};
    const status = text(data.status || data.paymentStatus, 60).toLowerCase();
    const age = ageMs(data.updatedAt || data.createdAt, now);
    const campaignId = text(data.campaignId, 160);
    const common = {entityType: "campaignPayment", entityId: record.id,
      campaignId, createdAt: data.updatedAt || data.createdAt,
      detailKind: "campaign_timeline"};
    if (["refund_review_required", "review_required", "disputed", "dispute_open"].includes(status)) {
      items.push(issue({id: `payment_${record.id}`, category: "payment_refund",
        severity: "action_required", summary: status.includes("refund") ?
          "A campaign refund requires operational review." :
          "A campaign payment requires operational review.", status, ...common,
        recommendedAction: "Review the authoritative campaign financial timeline."}));
    } else if (["pending", "processing", "checkout_completed"].includes(status) &&
        age != null && age > STALE_PAYMENT_MS) {
      items.push(issue({id: `payment_${record.id}`, category: "payment_refund",
        severity: "attention", summary: "Payment reconciliation has remained pending longer than expected.",
        status, ...common, recommendedAction: "Review payment and signed-event reconciliation."}));
    } else if (["refund_pending", "refunding"].includes(status) &&
        age != null && age > STALE_REFUND_MS) {
      items.push(issue({id: `payment_${record.id}`, category: "payment_refund",
        severity: "attention", summary: "A refund has remained pending longer than expected.",
        status, ...common, recommendedAction: "Review refund finality and signed event history."}));
    }
  }
  return items;
}

function completionIssues(records, earningsByCompletion, now) {
  const items = [];
  for (const record of records) {
    const data = record.data || {};
    const status = text(data.status || data.reviewStatus, 60).toLowerCase();
    const age = ageMs(data.updatedAt || data.submittedAt || data.createdAt, now);
    const common = {entityType: "campaignCompletion", entityId: record.id,
      campaignId: text(data.campaignId, 160), userId: text(data.scalerId, 160),
      createdAt: data.updatedAt || data.submittedAt || data.createdAt,
      detailKind: "campaign_timeline"};
    if (["submitted", "verification_pending", "review_pending"].includes(status) &&
        age != null && age > STALE_COMPLETION_MS) {
      items.push(issue({id: `completion_${record.id}`, category: "completion_earning",
        severity: "attention", summary: "Completed work is still awaiting review.", status,
        ...common, recommendedAction: "Open the campaign timeline and review completion status."}));
    }
    if (["redo_required", "request_redo"].includes(status) &&
        age != null && age > STALE_COMPLETION_MS) {
      items.push(issue({id: `completion_${record.id}`, category: "completion_earning",
        severity: "attention", summary: "A requested work redo remains unresolved.", status,
        ...common, recommendedAction: "Review the completion and participant status."}));
    }
    if (["approved", "verified"].includes(status) && !earningsByCompletion.has(record.id)) {
      items.push(issue({id: `earning_${record.id}`, category: "completion_earning",
        severity: "action_required", summary: "Approved work has no matching worker earning record.",
        status: "earning_missing", ...common,
        recommendedAction: "Investigate the completion-to-earning authority; do not edit Wallet data."}));
    }
  }
  return items;
}

function emailIssues(records, now) {
  return records.flatMap((record) => {
    const data = record.data || {};
    const status = text(data.status, 60).toLowerCase();
    const age = ageMs(data.updatedAt || data.createdAt, now);
    if (!["failed", "retry_exhausted"].includes(status) &&
        !(status === "queued" && age != null && age > STALE_EMAIL_MS)) return [];
    return [issue({id: `email_${record.id}`, category: "email_provider",
      severity: ["failed", "retry_exhausted"].includes(status) ? "action_required" : "attention",
      summary: status === "queued" ? "A transactional email has remained queued too long." :
        "A transactional email could not be delivered.", status,
      entityType: "outboundEmailJob", entityId: record.id,
      campaignId: text(data.metadata?.campaignId || data.campaignId, 160),
      userId: text(data.userId || data.metadata?.userId, 160),
      createdAt: data.updatedAt || data.createdAt,
      recommendedAction: "Review the redacted delivery status and retry policy.",
      detailKind: "email_status"})];
  });
}

function supportIssues(records) {
  return records.flatMap((record) => {
    const data = record.data || {};
    const status = text(data.status, 60).toLowerCase() || "open";
    if (status === "resolved" || status === "closed") return [];
    return [issue({id: `support_${record.id}`, category: "support",
      severity: text(data.priority, 30).toLowerCase() === "high" ? "action_required" : "attention",
      summary: text(data.summary, 240) || "A participant support case needs attention.", status,
      entityType: "supportCase", entityId: record.id,
      campaignId: text(data.campaignId, 160), userId: text(data.openedBy, 160),
      createdAt: data.updatedAt || data.createdAt,
      recommendedAction: status === "open" ? "Open the case and begin review." : "Continue case review.",
      detailKind: "support_case"})];
  });
}

function assertSupportStatusTransition(currentInput, nextInput) {
  const current = text(currentInput, 40).toLowerCase() || "open";
  const next = text(nextInput, 40).toLowerCase();
  if (!["open", "in_progress", "resolved"].includes(next)) {
    throw new Error("invalid_support_status_update");
  }
  if (current === next) return {current, next, replay: true};
  const allowed = current === "open" ? ["in_progress", "resolved"] :
    current === "in_progress" ? ["open", "resolved"] : [];
  if (!allowed.includes(next)) throw new Error("invalid_support_status_transition");
  return {current, next, replay: false};
}

function healthFromIssues(items, loadFailures = []) {
  const categories = {
    payments: ["payment_refund"], email: ["email_provider"],
    campaigns: ["campaign_participant"], completions: ["completion_earning"],
    support: ["support"], providers: ["email_provider"],
  };
  return Object.entries(categories).map(([metric, accepted]) => {
    const matching = items.filter((item) => accepted.includes(item.category));
    const failed = loadFailures.some((name) =>
      (metric === "payments" && name === "campaignPayments") ||
      (metric === "email" && name === "outboundEmailJobs") ||
      (metric === "providers" && name === "outboundEmailJobs") ||
      (metric === "completions" && name === "campaignCompletions") ||
      (metric === "support" && name === "supportCases"));
    return {metric, state: failed ? "degraded" : matching.length ? "attention" : "healthy",
      issueCount: matching.length};
  });
}

function timelineEvents({campaign, paymentRecords, eventRecords, completionRecords,
  earningRecords, supportRecords}) {
  const events = [];
  const add = (type, title, at, sourceId, detail = null, campaignId = null) => {
    const timestamp = millis(at);
    if (timestamp == null) return;
    events.push({type, title, occurredAt: timestamp, sourceId, detail,
      campaignId: text(campaignId, 160) || null});
  };
  if (campaign) {
    add("campaign_created", "Campaign created", campaign.data.createdAt, campaign.id, null, campaign.id);
    add("campaign_published", "Campaign published", campaign.data.publishedAt, campaign.id, null, campaign.id);
    add("refund_requested", "Refund requested", campaign.data.refundRequestedAt, campaign.id, null, campaign.id);
    add("campaign_archived", "Campaign archived", campaign.data.archivedAt, campaign.id, null, campaign.id);
  }
  for (const record of paymentRecords) {
    const data = record.data;
    add("payment_received", "Payment received", data.paidAt || data.fundedAt, record.id,
      {grossCents: Number(data.businessChargeCents || data.amountCents || data.totalCents || 0),
        workerCents: Number(data.workerAmountCents || data.workerCompensationCents || 0),
        platformFeeCents: Number(data.platformFeeCents || 0),
        reference: safeReference(data.paymentIntentId || data.checkoutSessionId || record.id)}, data.campaignId);
    add("refund_completed", "Refund completed", data.refundedAt, record.id,
      {refundCents: Number(data.refundedTotalCents || data.refundedAmountCents ||
          data.refundAmountCents || 0),
        reference: safeReference(data.refundId)}, data.campaignId);
  }
  for (const record of eventRecords) {
    const data = record.data;
    const type = text(data.type || data.eventType, 80);
    if (/gps|chunk|sample/i.test(type)) continue;
    add(type || "campaign_event", text(data.title || data.summary, 160) ||
      type.replaceAll("_", " ").replaceAll(".", " "),
    data.occurredAt || data.createdAt, record.id, null, data.campaignId);
  }
  for (const record of completionRecords) {
    add("completion_submitted", "Completion submitted", record.data.submittedAt, record.id,
      null, record.data.campaignId);
    add("completion_reviewed", "Completion reviewed", record.data.reviewedAt || record.data.approvedAt,
      record.id, {status: text(record.data.status || record.data.reviewStatus, 60)},
      record.data.campaignId);
  }
  for (const record of earningRecords) {
    add("worker_earning_established", "Worker earning established", record.data.earnedAt,
      record.id, {totalEarnedCents: Number(record.data.totalEarnedCents || 0)},
      record.data.campaignId);
  }
  for (const record of supportRecords) {
    add("support_opened", "Support case opened", record.data.createdAt, record.id,
      null, record.data.campaignId);
    add("support_resolved", "Support case resolved", record.data.resolvedAt, record.id,
      null, record.data.campaignId);
  }
  return events.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 100);
}

async function readCollection(db, name, failures) {
  try {
    const snapshot = await db.collection(name).limit(QUERY_LIMIT).get();
    return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data() || {}}));
  } catch (_) {
    failures.push(name);
    return [];
  }
}

function createAdminOpsReadService({db, FieldValue, now = () => Date.now()}) {
  async function getOverview() {
    const failures = [];
    const names = ["users", "campaigns", "campaignPayments", "campaignCompletions",
      "scalerEarnings", "supportCases", "outboundEmailJobs", "adminIssues", "jobEvents"];
    const values = await Promise.all(names.map((name) => readCollection(db, name, failures)));
    const data = Object.fromEntries(names.map((name, index) => [name, values[index]]));
    const earningsByCompletion = new Set(data.scalerEarnings
      .map((record) => text(record.data.completionId, 160)).filter(Boolean));
    const generated = [
      ...paymentIssues(data.campaignPayments, now()),
      ...completionIssues(data.campaignCompletions, earningsByCompletion, now()),
      ...emailIssues(data.outboundEmailJobs, now()),
      ...supportIssues(data.supportCases),
    ];
    const existing = data.adminIssues.flatMap((record) => {
      const value = record.data;
      if (text(value.status, 40).toLowerCase() !== "open") return [];
      return [issue({id: `admin_${record.id}`, category: text(value.type, 60) || "campaign_participant",
        severity: ["critical", "high"].includes(text(value.severity, 20).toLowerCase()) ?
          "action_required" : "attention", summary: text(value.summary, 240) || "Operational review is required.",
        status: "open", entityType: text(value.entityType, 80), entityId: text(value.entityId, 160),
        campaignId: text(value.campaignId, 160), userId: text(value.userId, 160),
        createdAt: value.createdAt, recommendedAction: "Open the affected operational detail.",
        detailKind: value.campaignId ? "campaign_timeline" : "issue"})];
    });
    const exceptions = [...generated, ...existing]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);
    const users = data.users;
    const campaigns = data.campaigns;
    const recentActivity = timelineEvents({campaign: null,
      paymentRecords: data.campaignPayments, eventRecords: data.jobEvents,
      completionRecords: data.campaignCompletions, earningRecords: data.scalerEarnings,
      supportRecords: data.supportCases}).slice(0, 20);
    return {schemaVersion: OPS_SCHEMA_VERSION, generatedAt: now(), partial: failures.length > 0,
      unavailableSources: failures,
      metrics: {
        businesses: users.filter((r) => text(r.data.role, 40).toLowerCase() === "business").length,
        approvedScalers: users.filter((r) => text(r.data.role, 40).toLowerCase() === "scaler" &&
          (r.data.approved === true || r.data.betaAccess === true || r.data.accountStatus === "active")).length,
        pendingScalers: users.filter((r) => text(r.data.role, 40).toLowerCase() === "scaler" &&
          !(r.data.approved === true || r.data.betaAccess === true || r.data.accountStatus === "active")).length,
        openCampaigns: campaigns.filter((r) => ["open", "active", "in_progress"].includes(
          text(r.data.status, 50).toLowerCase())).length,
        awaitingReview: data.campaignCompletions.filter((r) => ["submitted", "verification_pending", "review_pending"]
          .includes(text(r.data.status || r.data.reviewStatus, 60).toLowerCase())).length,
        openSupportCases: data.supportCases.filter((r) => !["resolved", "closed"]
          .includes(text(r.data.status, 40).toLowerCase())).length,
        exceptionCount: exceptions.length,
      }, exceptions, recentActivity, health: healthFromIssues(exceptions, failures)};
  }

  async function getCampaignTimeline(campaignIdInput) {
    const campaignId = text(campaignIdInput, 160);
    if (!campaignId) throw new Error("campaign_id_required");
    const campaignRef = db.collection("campaigns").doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (!campaignSnapshot.exists) throw new Error("campaign_not_found");
    const collections = ["campaignPayments", "jobEvents", "campaignCompletions",
      "scalerEarnings", "supportCases"];
    const records = await Promise.all(collections.map(async (name) => {
      const snapshot = await db.collection(name).where("campaignId", "==", campaignId)
        .limit(QUERY_LIMIT).get();
      return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data() || {}}));
    }));
    return {schemaVersion: OPS_SCHEMA_VERSION, campaign: {id: campaignSnapshot.id,
      name: text(campaignSnapshot.data()?.name || campaignSnapshot.data()?.campaignName, 160) || "Campaign",
      status: text(campaignSnapshot.data()?.status, 60),
      business: safeIdentity(campaignSnapshot.data())},
    events: timelineEvents({campaign: {id: campaignSnapshot.id, data: campaignSnapshot.data() || {}},
      paymentRecords: records[0], eventRecords: records[1], completionRecords: records[2],
      earningRecords: records[3], supportRecords: records[4]})};
  }

  async function updateSupportCaseStatus(input, actor) {
    const caseId = text(input?.caseId, 160);
    const status = text(input?.status, 40).toLowerCase();
    if (!caseId || !["open", "in_progress", "resolved"].includes(status)) {
      throw new Error("invalid_support_status_update");
    }
    const caseRef = db.collection("supportCases").doc(caseId);
    const auditRef = caseRef.collection("operationsAudit").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(caseRef);
      if (!snapshot.exists) throw new Error("support_case_not_found");
      const transition = assertSupportStatusTransition(snapshot.data()?.status, status);
      if (transition.replay) return;
      const current = transition.current;
      const at = FieldValue.serverTimestamp();
      transaction.update(caseRef, {status, updatedAt: at, lastUpdatedBy: actor.uid,
        ...(status === "resolved" ? {resolvedAt: at, resolvedBy: actor.uid} : {})});
      transaction.create(auditRef, {schemaVersion: OPS_SCHEMA_VERSION, fromStatus: current,
        toStatus: status, actorId: actor.uid, occurredAt: at});
    });
    return {caseId, status};
  }

  return {getOverview, getCampaignTimeline, updateSupportCaseStatus};
}

module.exports = {OPS_SCHEMA_VERSION, STALE_PAYMENT_MS, STALE_REFUND_MS,
  STALE_COMPLETION_MS, STALE_EMAIL_MS, text, millis, safeReference, safeIdentity,
  paymentIssues, completionIssues, emailIssues, supportIssues, healthFromIssues,
  assertSupportStatusTransition, timelineEvents, createAdminOpsReadService};
