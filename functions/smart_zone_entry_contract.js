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

module.exports = {normalizeAreaSelection, selectResolvedArea};
