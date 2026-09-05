"use strict";

const METRICS = Object.freeze(["followers", "impressions", "reach", "engagements",
  "profileActions", "responseAssetClicks", "landingPageVisits", "leads", "signups", "conversions"]);
const AVAILABILITY = Object.freeze(["AVAILABLE", "NO_DATA", "UNAVAILABLE", "PARTIAL", "DELAYED"]);
const missing = (reason = "NO_DATA") => ({status: reason, value: null});

function observation(input) {
  if (!input?.id || !input.businessUid || !input.provider || !input.definition ||
      !input.sourceRef || !METRICS.includes(input.metric) || !AVAILABILITY.includes(input.status) ||
      !["provider_reported", "tracked_attribution", "correlation", "conversion_attribution"].includes(input.evidenceClass) ||
      !["snapshot", "interval", "cumulative"].includes(input.measurement) ||
      !Number.isFinite(Date.parse(input.observedAt))) throw new Error("growth_observation_invalid");
  if (input.status === "AVAILABLE" && (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0)) {
    throw new Error("growth_metric_invalid");
  }
  if (input.measurement === "interval" && (!Number.isFinite(Date.parse(input.periodStart)) ||
      !Number.isFinite(Date.parse(input.periodEnd)) || Date.parse(input.periodStart) >= Date.parse(input.periodEnd))) {
    throw new Error("growth_metric_window_invalid");
  }
  return {...input, value: input.status === "AVAILABLE" ? input.value : null};
}

function report({businessUid, provider, startsAt, endsAt, timeZone, observations = [], outcomes = [], now = Date.now()}) {
  new Intl.DateTimeFormat("en", {timeZone}).format();
  const start = Date.parse(startsAt), end = Date.parse(endsAt);
  if (!businessUid || !provider || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error("growth_report_window_invalid");
  }
  const unique = new Map();
  for (const raw of observations.filter((item) => item.businessUid === businessUid && item.provider === provider)) {
    const item = observation(raw);
    if (unique.has(item.id) && JSON.stringify(unique.get(item.id)) !== JSON.stringify(item)) throw new Error("growth_observation_conflict");
    unique.set(item.id, item);
  }
  const metrics = {};
  for (const metric of METRICS) {
    const values = [...unique.values()].filter((item) => item.metric === metric && Date.parse(item.observedAt) <= Math.min(end, now));
    const points = values.filter((item) => Date.parse(item.observedAt) >= start)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    let summary = missing(points.length && points.at(-1).status !== "AVAILABLE" ? points.at(-1).status : "NO_DATA");
    if (metric === "followers") {
      const available = values.filter((item) => item.status === "AVAILABLE" && item.measurement === "snapshot");
      const baseline = available.filter((item) => Date.parse(item.observedAt) <= start)
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
      const last = available.filter((item) => Date.parse(item.observedAt) >= start)
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
      summary = last ? {status: "AVAILABLE", value: last.value, asOf: last.observedAt,
        delta: baseline && baseline.definition === last.definition && baseline.sourceRef === last.sourceRef ?
          last.value - baseline.value : null, baselineAt: baseline?.observedAt || null} : summary;
    } else {
      // Only compatible interval measurements can be added. Never sum lifetime
      // post counters or overlapping reach into a purported period total.
      const intervals = values.filter((item) => item.status === "AVAILABLE" && item.measurement === "interval" &&
        Date.parse(item.periodStart) >= start && Date.parse(item.periodEnd) <= end)
        .sort((a, b) => Date.parse(a.periodStart) - Date.parse(b.periodStart));
      const compatible = intervals.length && new Set(intervals.map((x) => `${x.definition}:${x.evidenceClass}:${x.sourceRef}`)).size === 1;
      const noOverlap = intervals.every((item, index) => !index || Date.parse(item.periodStart) >= Date.parse(intervals[index - 1].periodEnd));
      const full = intervals.length && Date.parse(intervals[0].periodStart) === start &&
        Date.parse(intervals.at(-1).periodEnd) === end && intervals.every((item, index) =>
        !index || Date.parse(item.periodStart) === Date.parse(intervals[index - 1].periodEnd));
      if (compatible && noOverlap && (metric !== "reach" || intervals.length === 1)) {
        summary = {status: full && end <= now ? "AVAILABLE" : "PARTIAL",
          value: intervals.reduce((sum, item) => sum + item.value, 0), definition: intervals[0].definition,
          evidenceClass: intervals[0].evidenceClass};
      }
    }
    metrics[metric] = {...summary, points: points.map((item) => ({observedAt: item.observedAt,
      value: item.value, status: item.status, definition: item.definition, measurement: item.measurement,
      evidenceClass: item.evidenceClass, sourceRef: item.sourceRef}))};
  }
  const attributed = new Map();
  for (const event of outcomes) {
    if (event.businessUid !== businessUid || event.provider !== provider || !event.eventId ||
        !event.sourceRecordId || !event.responseAssetId || !event.contentVersionId ||
        !event.subjectId || event.verified !== true || !["lead", "signup", "conversion"].includes(event.kind) ||
        Date.parse(event.occurredAt) < start || Date.parse(event.occurredAt) >= end ||
        !Number.isFinite(Date.parse(event.occurredAt))) continue;
    // A retry/new event ID does not turn the same lead into multiple leads.
    const key = `${event.kind}:${event.sourceRecordId}:${event.subjectId}`;
    attributed.set(key, {eventId: event.eventId, sourceRecordId: event.sourceRecordId,
      contentVersionId: event.contentVersionId, kind: event.kind});
  }
  const numerator = metrics.engagements, denominator = metrics.impressions;
  const rate = numerator.status === "AVAILABLE" && denominator.status === "AVAILABLE" && denominator.value > 0 &&
    numerator.evidenceClass === denominator.evidenceClass ?
    {status: "AVAILABLE", value: numerator.value / denominator.value, denominator: "impressions"} : missing();
  const trackedOutcomeCounts = Object.fromEntries(["lead", "signup", "conversion"].map((kind) => {
    const count = [...attributed.values()].filter((event) => event.kind === kind).length;
    return [kind, count ? {status: "PARTIAL", value: count, coverage: "verified_records_only"} : missing()];
  }));
  return {schemaVersion: "SocialGrowthReportV1", businessUid, provider, startsAt, endsAt, timeZone,
    completeness: end > now ? "PARTIAL" : "CLOSED_WINDOW", metrics, engagementRate: rate,
    attributedOutcomes: [...attributed.values()], trackedOutcomeCounts, attributionIsCausation: false,
    futureChart: {title: "Brand Growth — Last 30 Days", missingValue: null,
      connectGaps: false, separateEvidenceClasses: true}, generatedAt: new Date(now).toISOString()};
}

module.exports = {METRICS, AVAILABILITY, observation, report};
