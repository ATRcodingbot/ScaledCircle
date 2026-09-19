'use strict';

// Read-model only: never reconciles, schedules or retries a publication.
function summarizeJobs(jobs, now = Date.now()) {
  const result = {observedJobs: jobs.length, published: 0, scheduled: 0,
    needsReview: 0, activeLeases: 0, lastPublishedAt: null, nextPublishAt: null};
  for (const job of jobs) {
    if (job.status === 'published') {
      result.published++;
      const completed = typeof job.completedAt === 'number' ? job.completedAt : job.completedAt?.toMillis?.();
      if (Number.isFinite(completed)) result.lastPublishedAt = Math.max(result.lastPublishedAt || 0, completed);
    } else if (['approved', 'scheduled'].includes(job.status)) {
      const due = Date.parse(job.scheduledFor);
      if (!Number.isFinite(due) || due + 15 * 60000 < now) result.needsReview++;
      else {
        result.scheduled++;
        result.nextPublishAt = Math.min(result.nextPublishAt ?? Infinity, due);
      }
    } else if (!['canceled', 'cancelled'].includes(job.status)) result.needsReview++;
    if (Number(job.leaseUntil) > now) result.activeLeases++;
  }
  return result;
}
module.exports = {summarizeJobs};
