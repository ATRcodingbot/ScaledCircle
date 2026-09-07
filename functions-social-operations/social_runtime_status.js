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

async function load(db, uid) {
  const scopes = [["socialGrowthJobs", "businessUid"], ["socialStoryJobs", "owner"],
    ["socialGrowthMeasurementJobs", "businessUid"], ["socialMetaMeasurementJobs", "businessUid"]];
  try {
    const snapshots = await Promise.all(scopes.map(([collection, field]) =>
      db.collection(collection).where(field, "==", uid).limit(101).get()));
    if (snapshots.some(s => s.size > 100)) return {available: false, reason: "More execution history needs review."};
    const rows = snapshots.map(s => s.docs.map(d => d.data()));
    return {available: true, checkedAt: new Date().toISOString(), channels: project({
      jobs: [...rows[0], ...rows[1].map(j => ({...j, story: true}))], measurements: [...rows[2], ...rows[3]],
    })};
  } catch (_) {
    return {available: false, reason: "Saved execution status is temporarily unavailable. Refresh to retry."};
  }
}
module.exports = {project, load};
