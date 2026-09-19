"use strict";

function text(value, maximum = 180) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function normalizeAreaSelection(value) {
  if (!value || typeof value !== "object") return null;
  const query = text(value.query);
  const resultId = text(value.resultId, 240);
  if (query.length < 2 || !resultId) throw new Error("invalid_area_selection");
  return {query, resultId};
}

function selectResolvedArea(selection, resolution) {
  const results = Array.isArray(resolution?.results) ? resolution.results : [];
  const match = results.find((result) => String(result?.id || "") === selection.resultId);
  if (!match) throw new Error("area_boundary_unavailable");
  const geometry = Array.isArray(match.geometry) ? match.geometry.filter((point) =>
    Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))) : [];
  const latitude = Number(match.latitude); const longitude = Number(match.longitude);
  if (geometry.length < 3 && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    throw new Error("area_boundary_unavailable");
  }
  return {
    geometry: geometry.map((point) => ({
      latitude: Number(point.latitude), longitude: Number(point.longitude),
    })),
    name: text(match.fullAddress || match.primaryText, 240) || "Selected campaign area",
    resultId: String(match.id),
    resolutionSource: text(match.resolutionSource, 80),
    resolutionVersion: text(match.resolutionVersion, 80),
    center: {latitude, longitude},
  };
}

function workloadHours(value = 5) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 192) throw Error('campaign_workload_invalid');
  return hours;
}
function planningFailure(error) {
  if (error?.message === 'campaign_workload_invalid') return {code: 'invalid-argument',
    message: 'Choose estimated work from 30 minutes to 192 hours.'};
  if (error?.message === 'selected_area_cannot_fit_workload_boundary') return {code: 'failed-precondition',
    message: 'Choose or draw a smaller campaign territory inside your service area. Your saved area is unchanged.'};
  return {code: 'unavailable', message: 'We could not prepare workable Zones for this area. Keep your selection and try again, or draw a smaller territory.'};
}
module.exports = {normalizeAreaSelection, selectResolvedArea, workloadHours, planningFailure};
