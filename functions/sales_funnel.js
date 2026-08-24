"use strict";

const SCHEMA_VERSION = "SalesFunnelV1";
const MANUAL_STAGES = new Set([
  "prospect", "qualified", "contacted", "interested", "closed_not_interested",
]);
const ALL_STAGES = [
  "prospect", "qualified", "contacted", "interested", "signed_up",
  "activated", "paid", "retained", "closed_not_interested",
];
const SOURCES = new Set([
  "founder", "sales", "business_referral", "scaler_referral", "website",
  "social", "organic", "outreach", "event", "partnership", "agent_discovery", "other",
]);
const SUPPRESSIONS = new Set(["do_not_contact", "opted_out", "invalid_contact", "not_interested"]);
const CHANNELS = new Set(["email", "phone", "facebook", "instagram", "linkedin", "in_person", "other"]);
const PRIORITIES = new Set(["low", "normal", "high"]);
const PAGE_LIMIT = 50;

function text(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(value) ? Number(value) : null;
}

function assertTrustedSalesActor(actor) {
  if (!actor?.uid || actor.role !== "admin" || actor.emailVerified !== true ||
      actor.user?.active === false || actor.user?.disabled === true) {
    throw new Error("trusted_sales_actor_required");
  }
  return actor;
}

function sanitizeCreate(input = {}) {
  const businessName = text(input.businessName, 160);
  if (!businessName) throw new Error("business_name_required");
  const source = text(input.source, 40).toLowerCase() || "sales";
  if (!SOURCES.has(source)) throw new Error("invalid_sales_source");
  const priority = text(input.priority, 20).toLowerCase() || "normal";
  if (!PRIORITIES.has(priority)) throw new Error("invalid_sales_priority");
  return {
    businessName,
    businessWebsite: text(input.businessWebsite, 300) || null,
    industry: text(input.industry || input.vertical, 100) || null,
    cityRegion: text(input.cityRegion, 120) || null,
    contactName: text(input.contactName, 120) || null,
    contactEmail: text(input.contactEmail, 160).toLowerCase() || null,
    contactPhone: text(input.contactPhone, 50) || null,
    source,
    sourceDetail: text(input.sourceDetail, 160) || null,
    priority,
    researchSummary: text(input.researchSummary, 1200) || null,
    opportunityContext: text(input.opportunityContext, 500) || null,
  };
}

function sanitizePatch(input = {}) {
  const allowed = {};
  for (const [source, target, max] of [
    ["businessName", "businessName", 160], ["businessWebsite", "businessWebsite", 300],
    ["industry", "industry", 100], ["cityRegion", "cityRegion", 120],
    ["contactName", "contactName", 120], ["contactEmail", "contactEmail", 160],
    ["contactPhone", "contactPhone", 50], ["sourceDetail", "sourceDetail", 160],
    ["researchSummary", "researchSummary", 1200], ["opportunityContext", "opportunityContext", 500],
  ]) if (Object.hasOwn(input, source)) allowed[target] = text(input[source], max) || null;
  if (Object.hasOwn(input, "priority")) {
    const priority = text(input.priority, 20).toLowerCase();
    if (!PRIORITIES.has(priority)) throw new Error("invalid_sales_priority");
    allowed.priority = priority;
  }
  if (Object.hasOwn(input, "source")) {
    const source = text(input.source, 40).toLowerCase();
    if (!SOURCES.has(source)) throw new Error("invalid_sales_source");
    allowed.source = source;
  }
  return allowed;
}

function derivedStage(lead, business, paidCampaignCount) {
  if (text(lead.stage, 40) === "closed_not_interested") return "closed_not_interested";
  if (paidCampaignCount >= 2) return "retained";
  if (paidCampaignCount >= 1) return "paid";
  if (lead.convertedBusinessUid && business) {
    const ready = business.onboardingComplete === true || business.profileComplete === true ||
      business.campaignCreationReady === true;
    return ready ? "activated" : "signed_up";
  }
  return MANUAL_STAGES.has(lead.stage) ? lead.stage : "prospect";
}

function safeLead(id, data, business, paidCampaignCount, now) {
  const stage = derivedStage(data, business, paidCampaignCount);
  const followUpAt = millis(data.nextFollowUpAt);
  const suppression = text(data.suppressionStatus, 40) || null;
  return {
    leadId: id, businessName: text(data.businessName, 160),
    businessWebsite: text(data.businessWebsite, 300) || null,
    industry: text(data.industry, 100) || null, cityRegion: text(data.cityRegion, 120) || null,
    contactName: text(data.contactName, 120) || null,
    contactEmail: text(data.contactEmail, 160) || null, contactPhone: text(data.contactPhone, 50) || null,
    source: text(data.source, 40), sourceDetail: text(data.sourceDetail, 160) || null,
    stage, storedStage: text(data.stage, 40), ownerUid: text(data.ownerUid, 160) || null,
    priority: text(data.priority, 20) || "normal", nextFollowUpAt: followUpAt,
    followUpReason: text(data.followUpReason, 240) || null,
    lastContactedAt: millis(data.lastContactedAt), suppressionStatus: suppression,
    mayContact: !suppression, researchSummary: text(data.researchSummary, 1200) || null,
    opportunityContext: text(data.opportunityContext, 500) || null,
    convertedBusinessUid: text(data.convertedBusinessUid, 160) || null,
    firstPaidAt: millis(data.firstPaidAt), paidCampaignCount,
    createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt),
    followUpBucket: followUpAt == null ? null : followUpAt < now ? "overdue" :
      followUpAt < now + 24 * 60 * 60 * 1000 ? "today" : "upcoming",
  };
}

function summarize(leads) {
  const counts = Object.fromEntries(ALL_STAGES.map((stage) => [stage, 0]));
  let overdue = 0;
  for (const lead of leads) {
    counts[lead.stage] = (counts[lead.stage] || 0) + 1;
    if (lead.followUpBucket === "overdue" && lead.mayContact) overdue += 1;
  }
  return {counts, overdueFollowUps: overdue,
    highPriorityInterested: leads.filter((lead) => lead.priority === "high" && lead.stage === "interested").length,
    recentPaidConversions: leads.filter((lead) => ["paid", "retained"].includes(lead.stage)).length};
}

function createSalesService({db, FieldValue, now = () => Date.now()}) {
  async function getPipeline(input = {}) {
    const limit = Math.min(Math.max(integer(input.limit, PAGE_LIMIT), 1), PAGE_LIMIT);
    const stageFilter = text(input.stage, 40).toLowerCase();
    let query = db.collection("salesLeads").orderBy("updatedAt", "desc").limit(limit);
    const snapshot = await query.get();
    const raw = snapshot.docs.map((doc) => ({id: doc.id, data: doc.data() || {}}));
    const businessIds = [...new Set(raw.map((item) => text(item.data.convertedBusinessUid, 160)).filter(Boolean))];
    const businesses = new Map();
    await Promise.all(businessIds.map(async (uid) => {
      const value = await db.collection("users").doc(uid).get();
      if (value.exists) businesses.set(uid, value.data() || {});
    }));
    const payments = await db.collection("campaignPayments").where("status", "==", "paid").limit(200).get();
    const paidByBusiness = new Map();
    const firstPaidByBusiness = new Map();
    for (const doc of payments.docs) {
      const data = doc.data() || {};
      const uid = text(data.businessId, 160);
      if (!uid) continue;
      paidByBusiness.set(uid, (paidByBusiness.get(uid) || 0) + 1);
      const at = millis(data.paidAt || data.fundedAt);
      if (at != null && (!firstPaidByBusiness.has(uid) || at < firstPaidByBusiness.get(uid))) firstPaidByBusiness.set(uid, at);
    }
    let leads = raw.map(({id, data}) => {
      const uid = text(data.convertedBusinessUid, 160);
      const merged = {...data, firstPaidAt: firstPaidByBusiness.get(uid) || data.firstPaidAt};
      return safeLead(id, merged, businesses.get(uid), paidByBusiness.get(uid) || 0, now());
    });
    if (stageFilter) leads = leads.filter((lead) => lead.stage === stageFilter);
    const activitySnapshot = await db.collection("salesActivities").orderBy("occurredAt", "desc").limit(30).get();
    const recentActivity = activitySnapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {activityId: doc.id, leadId: text(data.leadId, 160), type: text(data.type, 40),
        channel: text(data.channel, 30) || null, outcome: text(data.outcome, 240) || null,
        summary: text(data.summary, 500) || null, occurredAt: millis(data.occurredAt)};
    });
    return {schemaVersion: SCHEMA_VERSION, generatedAt: now(), leads, summary: summarize(leads),
      recentActivity, page: {limit, returned: leads.length, hasMore: snapshot.docs.length === limit}};
  }

  async function mutateLead(input, actor) {
    const action = text(input?.action, 40).toLowerCase();
    const at = FieldValue.serverTimestamp();
    if (action === "create") {
      const leadRef = db.collection("salesLeads").doc();
      const eventRef = db.collection("salesActivities").doc();
      const data = sanitizeCreate(input?.lead);
      await db.runTransaction(async (transaction) => {
        transaction.create(leadRef, {...data, schemaVersion: SCHEMA_VERSION, stage: "prospect",
          ownerUid: actor.uid, suppressionStatus: null, createdAt: at, updatedAt: at, createdBy: actor.uid});
        transaction.create(eventRef, {schemaVersion: SCHEMA_VERSION, leadId: leadRef.id,
          type: "lead_created", actorUid: actor.uid, occurredAt: at});
      });
      return {leadId: leadRef.id, stage: "prospect"};
    }
    const leadId = text(input?.leadId, 160);
    if (!leadId) throw new Error("lead_id_required");
    const leadRef = db.collection("salesLeads").doc(leadId);
    const eventRef = db.collection("salesActivities").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(leadRef);
      if (!snapshot.exists) throw new Error("sales_lead_not_found");
      const current = snapshot.data() || {};
      let patch = {updatedAt: at};
      let type = action;
      if (action === "update") patch = {...patch, ...sanitizePatch(input?.lead)};
      else if (action === "stage") {
        const stage = text(input?.stage, 40).toLowerCase();
        if (!MANUAL_STAGES.has(stage)) throw new Error("derived_sales_stage_forbidden");
        patch.stage = stage;
        if (stage === "closed_not_interested") patch.suppressionStatus = "not_interested";
      } else if (action === "follow_up") {
        const next = Number(input?.nextFollowUpAt);
        if (!Number.isFinite(next) || next <= now()) throw new Error("future_follow_up_required");
        patch.nextFollowUpAt = new Date(next);
        patch.followUpReason = text(input?.reason, 240) || "Follow up";
      } else if (action === "suppress") {
        const status = text(input?.status, 40).toLowerCase();
        if (!SUPPRESSIONS.has(status)) throw new Error("invalid_suppression_status");
        patch.suppressionStatus = status;
      } else if (action === "unsuppress") {
        patch.suppressionStatus = null;
      } else if (action === "assign") {
        patch.ownerUid = text(input?.ownerUid, 160) || actor.uid;
      } else if (action === "link_business") {
        let uid = text(input?.businessUid, 160);
        const email = text(input?.businessEmail, 160).toLowerCase();
        if (!uid && email) {
          let matches = await transaction.get(
            db.collection("users").where("normalizedEmail", "==", email).limit(2));
          if (matches.docs.length === 0) {
            matches = await transaction.get(db.collection("users").where("email", "==", email).limit(2));
          }
          if (matches.docs.length === 1) uid = matches.docs[0].id;
        }
        if (!uid) throw new Error("business_identity_required");
        const business = await transaction.get(db.collection("users").doc(uid));
        if (!business.exists || text(business.data()?.role, 40).toLowerCase() !== "business") {
          throw new Error("linked_business_not_found");
        }
        patch.convertedBusinessUid = uid;
      } else throw new Error("invalid_sales_lead_action");
      transaction.update(leadRef, patch);
      transaction.create(eventRef, {schemaVersion: SCHEMA_VERSION, leadId,
        type, actorUid: actor.uid, fromStage: current.stage || null,
        toStage: patch.stage || current.stage || null, occurredAt: at});
    });
    return {leadId, action};
  }

  async function recordActivity(input, actor) {
    const leadId = text(input?.leadId, 160);
    const type = text(input?.type, 40).toLowerCase();
    if (!leadId || !["contact", "note", "outcome"].includes(type)) throw new Error("invalid_sales_activity");
    const channel = text(input?.channel, 30).toLowerCase();
    if (type === "contact" && !CHANNELS.has(channel)) throw new Error("invalid_contact_channel");
    const summary = text(input?.summary, 500);
    if (!summary) throw new Error("sales_activity_summary_required");
    const leadRef = db.collection("salesLeads").doc(leadId);
    const activityRef = db.collection("salesActivities").doc();
    const at = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const lead = await transaction.get(leadRef);
      if (!lead.exists) throw new Error("sales_lead_not_found");
      const data = lead.data() || {};
      if (data.suppressionStatus && type === "contact") throw new Error("sales_lead_suppressed");
      transaction.create(activityRef, {schemaVersion: SCHEMA_VERSION, leadId, type,
        channel: channel || null, outcome: text(input?.outcome, 240) || null,
        summary, actorUid: actor.uid, occurredAt: at});
      const patch = {updatedAt: at};
      if (type === "contact") {
        patch.lastContactedAt = at;
        if (["prospect", "qualified"].includes(data.stage)) patch.stage = "contacted";
      }
      transaction.update(leadRef, patch);
    });
    return {leadId, activityId: activityRef.id};
  }
  return {getPipeline, mutateLead, recordActivity};
}

module.exports = {SCHEMA_VERSION, MANUAL_STAGES, ALL_STAGES, SOURCES, SUPPRESSIONS,
  CHANNELS, PAGE_LIMIT, text, millis, assertTrustedSalesActor, sanitizeCreate,
  sanitizePatch, derivedStage, safeLead, summarize, createSalesService};
