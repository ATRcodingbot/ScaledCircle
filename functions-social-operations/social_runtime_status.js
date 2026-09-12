"use strict";

// Read model only. Never authorizes, schedules, retries, or contacts a provider.
function iso(value) {
  const date = value?.toDate ? value.toDate() :
    new Date(typeof value === "number" || typeof value === "string" ? value : NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function project({jobs, measurements, now = Date.now()}) {
  return ["x", "facebook", "instagram"].map(provider => {
    const owned = jobs.filter(j => j.provider === provider);
    const pending = owned.filter(j => ["approved", "scheduled", "queued"].includes(j.status))
      .filter(j => iso(j.scheduledFor)).sort((a,b) => Date.parse(iso(a.scheduledFor))-Date.parse(iso(b.scheduledFor)));
    const published = owned.filter(j => j.providerPostId || j.providerMediaId);
    const failures = owned.filter(j => ["failed", "unknown_outcome", "hold", "reconciliation_required"].includes(j.status));
    const due = pending.filter(j => Date.parse(iso(j.scheduledFor)) <= now);
    const next = pending.find(j => Date.parse(iso(j.scheduledFor)) > now);
    const measurement = measurements.filter(m => (m.provider === provider || (provider === "x" && !m.provider)) && m.status === "pending" && iso(m.scheduledFor))
      .sort((a,b) => Date.parse(iso(a.scheduledFor))-Date.parse(iso(b.scheduledFor)))[0];
    return {provider, recordedJobCount: owned.length, approvedPendingCount: pending.length,
      publishedWithIdCount: published.length, needsReviewCount: failures.length + due.length,
      nextScheduledFor: next ? iso(next.scheduledFor) : null,
      nextFormat: next?.story === true ? "Story" : "Feed post",
      result: failures.length ? "An execution needs review. Do not retry a publication blindly." :
        due.length ? "A scheduled job is due; publication is not yet confirmed." :
        published.length ? "Publication IDs are recorded. See publication evidence for outcomes." :
        pending.length ? "Waiting for the scheduled publication. No publication ID is recorded." : "No approved scheduled work is recorded.",
      nextMeasurementAt: measurement ? iso(measurement.scheduledFor) : null,
      actionNeeded: failures.length || due.length ? "Review execution evidence." :
        pending.length ? "No action is needed before the scheduled time." : "Prepare and approve a plan to schedule work."};
  });
}

function customerState({jobs = [], plans = [], connections = [], now = Date.now()}) {
  plans=require("./social_customer_post_projection").overlay(plans,jobs);
  const review = require("./social_plan_state").project(plans);
  const draftPlans = plans.filter(p => !require("./social_plan_state").approved(p));
  const published = jobs.filter(j => j.providerPostId || j.providerMediaId);
  const scheduled = jobs.filter(j => ['approved','scheduled','queued'].includes(j.status) && iso(j.scheduledFor));
  const failed = jobs.some(j => ['failed','unknown_outcome','hold','reconciliation_required','blocked'].includes(j.status));
  const draftPosts = review.draftPosts;
  const counters = {draftPlans: draftPlans.length, approvedPlans: plans.length - draftPlans.length, draftPosts, scheduled: scheduled.length, published: published.length};
  const result = (state, title, description) => ({state,title,description,counters,review,publicationAuthorizedByStatus:false});
  if (failed) return result('blocked','Needs attention','A publication needs review. Check its saved outcome before trying again.');
  if (jobs.some(j => ['publishing','executing','running'].includes(j.status))) return result('publishing','Publishing','Approved content is being processed. Publication is not confirmed yet.');
  if (jobs.some(j => j.status === 'paused')) return result('paused','Paused','Saved publication work is paused. Your drafts remain available.');
  if (scheduled.length) return scheduled.some(j => Date.parse(iso(j.scheduledFor)) <= now)
    ? result('waiting_for_publication','Waiting for publication','Approved work is due. We have not confirmed its publication yet.')
    : result('scheduled','Scheduled','Approved work has a saved publication time.');
  if (draftPlans.length) return result('needs_review',review.title,'Review the proposed plan version. Content approval is separate.');
  if (published.length) return result('published_monitoring','Published / Monitoring','Publication evidence is recorded. Review available results without assuming leads or revenue.');
  if (plans.length) return result(draftPosts ? 'posts_need_review' : 'plan_approved', draftPosts ? 'Plan approved — posts need review' : 'Plan approved', draftPosts ? `${review.contentCounts.contentIdeas} content ideas have ${review.contentCounts.platformVersions} platform versions. ${draftPosts} versions need review. Nothing is scheduled yet.` : 'Strategy approval is recorded. Post approval, scheduling and publication remain separate.');
  if (!connections.some(c => ['connected_read_only','connected_write'].includes(c.status)))
    return result('needs_permission','Needs permission','Connect your Business accounts to prepare your Social plan.');
  return result('ready','Ready to plan','Your connected accounts are ready for a draft strategy. Nothing is scheduled.');
}

async function load(db, uid, context = {}) {
  const scopes = [["socialGrowthJobs", "businessUid"], ["socialStoryJobs", "owner"],
    ["socialGrowthMeasurementJobs", "businessUid"], ["socialMetaMeasurementJobs", "businessUid"],
    ["socialPublishingJobs", "businessUid"]];
  try {
    const snapshots = await Promise.all(scopes.map(([collection, field]) =>
      db.collection(collection).where(field, "==", uid).limit(101).get()));
    if (snapshots.some(s => s.size > 100)) return {available: false, reason: "More execution history needs review."};
    const rows = snapshots.map(s => s.docs.map(d => d.data()));
    const jobs = [...rows[0], ...rows[1].map(j => ({...j, story: true})), ...rows[4]];
    return {available: true, checkedAt: new Date().toISOString(),
      summary: customerState({...context,jobs}),
      channels: project({jobs, measurements: [...rows[2], ...rows[3]]}).map(channel => ({...channel, actionNeeded: channel.recordedJobCount ? channel.actionNeeded : customerState({...context,jobs}).review.nextAction}))};
  } catch (_) {
    return {available: false, reason: "Saved execution status is temporarily unavailable. Refresh to retry."};
  }
}
module.exports = {project, load, customerState};
