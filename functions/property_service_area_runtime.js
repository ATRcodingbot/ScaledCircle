"use strict";

const crypto = require("node:crypto");
const property = require("./property_intelligence");
const operations = require("./operational_layer");
const managedGrowth = require("./managed_growth");

function withPhysicalChannel(value, geometry) {
  const walking = operations.calculateGeometryWalkingEstimate(geometry);
  const homes = Number(value?.residentialStructureCount || value?.propertyCount || 0);
  const areaSquareKm = walking.areaSquareMeters / 1000000;
  const signals = {
    homesPerSquareKm: homes > 0 && areaSquareKm > 0 ? homes / areaSquareKm : null,
    averagePropertySpacingMeters: homes > 0 ? Math.sqrt(walking.areaSquareMeters / homes) : null,
    walkingMinutesPerReachableAddress: homes > 0 ? walking.estimatedWalkingMinutes / homes : null,
    accessStatus: "unknown",
  };
  return {...value, physicalLogisticsVersion: "PropertyPhysicalLogisticsV1",
    physicalLogistics: signals,
    physicalChannelSuitability: managedGrowth.evaluatePhysicalChannelSuitability(signals)};
}

// Only neutral property facts enter this shared cache. Business context and
// rankings belong to the workspace-specific recommendation service.
function publicAnalysis(value) {
  const result = {...value};
  const failures = new Set(result.providerFailures || []);
  delete result.providerFailures;
  result.limitations = result.source === "none"
    ? ["Property evidence was unavailable for this section. No service demand or property condition has been inferred."]
    : (result.limitations || []).filter(text => typeof text === "string" &&
      !failures.has(text) && !/https?:\/\/|HTTP\s*\d{3}|api.?key|ECONN|ETIMEDOUT/i.test(text));
  return result;
}

function createAnalyzer({db, FieldValue, apiKey = "", now = Date.now,
  fetchJson: suppliedFetch, budgetMs = 100000}) {
  const deadline = now() + budgetMs;
  const fetchJson = suppliedFetch || (async (url, {timeoutMs = 8000} = {}) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("Property evidence time budget reached.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(8000, timeoutMs, remaining));
    try {
      const response = await fetch(url, {signal: controller.signal,
        headers: {"User-Agent": "ScaledCircle Property Intelligence support@scaledcircle.com"}});
      if (!response.ok) throw new Error("Property evidence source unavailable.");
      return await response.json();
    } finally { clearTimeout(timer); }
  });
  const providers = [new property.MarylandPropertyProvider({fetchJson}),
    new property.CensusPropertyProvider({fetchJson, apiKey})];
  return async geometry => {
    property.validateGeometry(geometry);
    const digest = property.geometryDigest(geometry);
    const id = crypto.createHash("sha256").update(
      `${property.ANALYSIS_VERSION}:${property.DATA_SOURCE_BUNDLE_VERSION}:${digest}`).digest("hex");
    const ref = db.collection("propertyIntelligenceCache").doc(id);
    const snapshot = await ref.get();
    const cached = snapshot.data();
    if (property.cacheIsReusable(cached, {digest, now: now()})) {
      return withPhysicalChannel(publicAnalysis({...cached.analysis, analysisId: id, geometryDigest: digest}), geometry);
    }
    if (now() >= deadline) throw new Error("Property evidence time budget reached.");
    const value = publicAnalysis({...await property.analyzeWithFallback({geometry, providers}),
      analysisId: id, geometryDigest: digest, generatedAt: new Date(now()).toISOString()});
    // Transient provider failures are not cached as a month of missing evidence.
    if (value.source !== "none") await ref.set({analysisVersion: property.ANALYSIS_VERSION,
      dataSourceBundleVersion: property.DATA_SOURCE_BUNDLE_VERSION, geometryDigest: digest,
      source: value.source, sourceVersion: value.sourceVersion,
      generatedAt: FieldValue.serverTimestamp(), analysis: value});
    return withPhysicalChannel(value, geometry);
  };
}

module.exports = {publicAnalysis, createAnalyzer, withPhysicalChannel};
