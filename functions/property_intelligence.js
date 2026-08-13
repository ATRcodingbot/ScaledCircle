"use strict";

const crypto = require("node:crypto");

const ANALYSIS_VERSION = "PropertyIntelligenceV2";
const SIGNAL_VERSION = "PropertyAgeSignalV1";
const ACS_SOURCE_VERSION = "ACS_2024_5YR_B25034";
const MARYLAND_SOURCE_VERSION = "MD_OPEN_DATA_ed4q-f8tm";
const CENSUS_BOUNDARY_VERSION = "TIGERweb_ACS2024_BlockGroups_Layer8";
const DATA_SOURCE_BUNDLE_VERSION = `${MARYLAND_SOURCE_VERSION}__${ACS_SOURCE_VERSION}__${CENSUS_BOUNDARY_VERSION}`;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GEOMETRY_POINTS = 250;
const MAX_BOUNDING_BOX_SQ_KM = 200;
const MAX_PARCELS = 5000;
const MARYLAND_PAGE_SIZE = 1000;
const MAX_CENSUS_GEOGRAPHIES = 100;
const TIGERWEB_BLOCK_GROUP_LAYER = 8;
const ACS_REFERENCE_YEAR = 2024;
const ASSISTANT_CONTEXT_VERSION = "ScaledCircleIntelligenceContextV1";
const ASSISTANT_PROMPT_VERSION = "ScaledCircleIntelligencePromptV1";

const MARYLAND_FIELDS = Object.freeze({
  propertyId: "account_id_mdp_field_acctid",
  county: "county_name_mdp_field_cntyname",
  longitude: "mdp_longitude_mdp_field_digxcord_converted_to_wgs84",
  latitude: "mdp_latitude_mdp_field_digycord_converted_to_wgs84",
  yearBuilt: "c_a_m_a_system_data_year_built_yyyy_mdp_field_yearblt_sdat_field_235",
  landUse: "land_use_code_mdp_field_lu_desclu_sdat_field_50",
  propertyCode: "county_system_property_code_sdat_field_56",
  structureArea: "c_a_m_a_system_data_structure_area_sq_ft_mdp_field_sqftstrc_sdat_field_241",
  sourceEdition: "mdproperty_view_edition_year_mdp_field_existing",
});

const ACS_FIELDS = Object.freeze([
  "B25034_001E", "B25034_002E", "B25034_003E", "B25034_004E",
  "B25034_005E", "B25034_006E", "B25034_007E", "B25034_008E",
  "B25034_009E", "B25034_010E", "B25034_011E",
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateGeometry(raw) {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_GEOMETRY_POINTS) {
    throw new Error("Property Intelligence requires 3-250 geometry points.");
  }
  const points = raw.map((point) => {
    const latitude = finite(point?.latitude);
    const longitude = finite(point?.longitude);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) throw new Error("Invalid Property Intelligence geometry.");
    return {latitude, longitude};
  });
  const box = boundingBox(points);
  const widthKm = haversineKm(box.minLatitude, box.minLongitude, box.minLatitude, box.maxLongitude);
  const heightKm = haversineKm(box.minLatitude, box.minLongitude, box.maxLatitude, box.minLongitude);
  if (widthKm * heightKm > MAX_BOUNDING_BOX_SQ_KM) throw new Error("Selected area is too large for Property Intelligence.");
  return points;
}

function canonicalGeometry(points) {
  return points.map((point) => [point.latitude.toFixed(7), point.longitude.toFixed(7)]);
}

function geometryDigest(points) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalGeometry(validateGeometry(points)))).digest("hex");
}

function boundingBox(points) {
  return points.reduce((box, point) => ({
    minLatitude: Math.min(box.minLatitude, point.latitude), maxLatitude: Math.max(box.maxLatitude, point.latitude),
    minLongitude: Math.min(box.minLongitude, point.longitude), maxLongitude: Math.max(box.maxLongitude, point.longitude),
  }), {minLatitude: 90, maxLatitude: -90, minLongitude: 180, maxLongitude: -180});
}

function centroid(points) {
  return points.reduce((value, point) => ({latitude: value.latitude + point.latitude / points.length,
    longitude: value.longitude + point.longitude / points.length}), {latitude: 0, longitude: 0});
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1); const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    const crossProduct = (point.latitude - a.latitude) * (b.longitude - a.longitude) -
      (point.longitude - a.longitude) * (b.latitude - a.latitude);
    const onSegment = Math.abs(crossProduct) <= 1e-10 &&
      point.latitude >= Math.min(a.latitude, b.latitude) - 1e-10 &&
      point.latitude <= Math.max(a.latitude, b.latitude) + 1e-10 &&
      point.longitude >= Math.min(a.longitude, b.longitude) - 1e-10 &&
      point.longitude <= Math.max(a.longitude, b.longitude) + 1e-10;
    if (onSegment) return true;
    const crosses = ((a.latitude > point.latitude) !== (b.latitude > point.latitude)) &&
      point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude) /
      (b.latitude - a.latitude || Number.EPSILON) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function arcGisPolygon(geometry) {
  const ring = geometry.map((point) => [point.longitude, point.latitude]);
  const first = ring[0]; const last = ring.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return {rings: [ring], spatialReference: {wkid: 4326}};
}

function parseTigerwebBlockGroups(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const byId = new Map();
  for (const feature of features) {
    const value = feature?.properties || feature?.attributes || {};
    const state = String(value.STATE || value.STATEFP || "").padStart(2, "0");
    const county = String(value.COUNTY || value.COUNTYFP || "").padStart(3, "0");
    const tract = String(value.TRACT || value.TRACTCE || "").padStart(6, "0");
    const blockGroup = String(value.BLKGRP || value.BLKGRPCE || value["BLOCK GROUP"] || "");
    const geographyId = String(value.GEOID || `${state}${county}${tract}${blockGroup}`);
    if (!/^\d{12}$/.test(geographyId) || !/^\d$/.test(blockGroup)) continue;
    byId.set(geographyId, {geographyId, state: geographyId.slice(0, 2), county: geographyId.slice(2, 5),
      tract: geographyId.slice(5, 11), blockGroup: geographyId.slice(11)});
  }
  return [...byId.values()].sort((a, b) => a.geographyId.localeCompare(b.geographyId));
}

function isResidential(record) {
  const text = `${record.landUse || ""} ${record.propertyType || ""} ${record.propertyCode || ""}`.toLowerCase();
  if (/commercial|industrial|exempt|public|office|retail/.test(text)) return false;
  return /residential|residence|dwelling|apartment|condo|town|single|multi|^r\b/.test(text) || text.trim() === "";
}

function yearBucket(year) {
  if (!Number.isInteger(year) || year < 1600 || year > new Date().getUTCFullYear() + 1) return null;
  if (year < 1940) return "pre1940";
  if (year < 1960) return "1940To1959";
  if (year < 1980) return "1960To1979";
  if (year < 2000) return "1980To1999";
  if (year < 2015) return "2000To2014";
  return "2015Plus";
}

function normalizeMarylandRecord(raw) {
  const propertyId = String(raw[MARYLAND_FIELDS.propertyId] || "").trim();
  const latitude = finite(raw[MARYLAND_FIELDS.latitude]); const longitude = finite(raw[MARYLAND_FIELDS.longitude]);
  const year = Number.parseInt(String(raw[MARYLAND_FIELDS.yearBuilt] || ""), 10);
  if (!propertyId || latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const propertyType = String(raw[MARYLAND_FIELDS.landUse] || raw[MARYLAND_FIELDS.propertyCode] || "unknown").trim();
  return {source: "Maryland Open Data", sourceVersion: MARYLAND_SOURCE_VERSION, geographyType: "parcel_point",
    propertyId, latitude, longitude, yearBuilt: yearBucket(year) ? year : null, yearBuiltBucket: yearBucket(year),
    residential: isResidential({landUse: raw[MARYLAND_FIELDS.landUse], propertyType, propertyCode: raw[MARYLAND_FIELDS.propertyCode]}),
    propertyType, county: String(raw[MARYLAND_FIELDS.county] || "").trim(),
    structureAreaSquareFeet: finite(raw[MARYLAND_FIELDS.structureArea]), observedAt: null,
    sourceEdition: String(raw[MARYLAND_FIELDS.sourceEdition] || "").trim() || null,
    confidence: yearBucket(year) ? "high" : "low"};
}

function deduplicateParcels(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record?.propertyId) continue;
    const existing = byId.get(record.propertyId);
    if (!existing || (!existing.yearBuilt && record.yearBuilt)) byId.set(record.propertyId, record);
  }
  return [...byId.values()];
}

function parseCensusB25034(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) throw new Error("Malformed Census B25034 response.");
  const header = payload[0];
  const output = [];
  for (const row of payload.slice(1)) {
    const value = Object.fromEntries(header.map((name, index) => [name, row[index]]));
    const count = (field) => Math.max(0, Number.parseInt(value[field], 10) || 0);
    output.push({geographyId: `${value.state || ""}${value.county || ""}${value.tract || ""}${value["block group"] || ""}`,
      geographyType: "census_block_group", source: "U.S. Census Bureau ACS 5-Year", sourceVersion: ACS_SOURCE_VERSION,
      total: count("B25034_001E"), buckets: {"2020Plus": count("B25034_002E"), "2010To2019": count("B25034_003E"),
        "2000To2009": count("B25034_004E"), "1990To1999": count("B25034_005E"), "1980To1989": count("B25034_006E"),
        "1970To1979": count("B25034_007E"), "1960To1969": count("B25034_008E"), "1950To1959": count("B25034_009E"),
        "1940To1949": count("B25034_010E"), "pre1940": count("B25034_011E")}});
  }
  return output;
}

function pct(value, total) { return total > 0 ? Math.round(value * 1000 / total) / 10 : 0; }

function propertyAgeSignal({percent20PlusYearsOld, percent30PlusYearsOld, percent40PlusYearsOld, coverage}) {
  const raw = percent40PlusYearsOld * 0.5 + percent30PlusYearsOld * 0.3 + percent20PlusYearsOld * 0.2;
  const modifier = 0.65 + Math.max(0, Math.min(1, coverage)) * 0.35;
  const score = Math.round(Math.max(0, Math.min(100, raw * modifier)));
  return {score, version: SIGNAL_VERSION, category: score < 25 ? "NEWER STOCK" : score < 50 ? "MIXED STOCK" : score < 75 ? "OLDER STOCK" : "HIGH OLDER-STOCK CONCENTRATION"};
}

function predominantEra(buckets) {
  const key = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0];
  const sourceSupportedLabel = ({"1940To1949": "1940-1949", "1950To1959": "1950-1959",
    "1960To1969": "1960-1969", "1970To1979": "1970-1979", "1980To1989": "1980-1989",
    "1990To1999": "1990-1999", "2000To2009": "2000-2009", "2010To2019": "2010-2019",
    "2020Plus": "2020 or later"})[key];
  if (sourceSupportedLabel) return sourceSupportedLabel;
  return ({pre1940: "Before 1940", "1940To1959": "1940–1959", "1960To1979": "1960–1979",
    "1980To1999": "1980–1999", "2000To2014": "2000–2014", "2015Plus": "2015 or later"})[key] || "Unavailable";
}

function confidenceFor({coverage, granularity, recordCount}) {
  if (!recordCount || coverage < 0.2) return "INSUFFICIENT";
  if (granularity === "parcel" && coverage >= 0.8) return "HIGH";
  if (coverage >= 0.55) return "MODERATE";
  return "LOW";
}

function analyzeParcelObservations(observations, {geometry, sourceUpdatedAt = null,
  referenceYear = new Date().getUTCFullYear(), partialCoverage = false} = {}) {
  const unique = deduplicateParcels(observations).filter((record) => !geometry || pointInPolygon(record, geometry));
  const residential = unique.filter((record) => record.residential);
  const usable = residential.filter((record) => record.yearBuiltBucket);
  const buckets = {pre1940: 0, "1940To1959": 0, "1960To1979": 0, "1980To1999": 0, "2000To2014": 0, "2015Plus": 0};
  for (const record of usable) buckets[record.yearBuiltBucket] += 1;
  const total = usable.length; const coverage = residential.length ? total / residential.length : 0;
  const years = usable.map((record) => record.yearBuilt).sort((a, b) => a - b);
  const pre1980 = buckets.pre1940 + buckets["1940To1959"] + buckets["1960To1979"];
  const pre2000 = pre1980 + buckets["1980To1999"];
  if (!Number.isInteger(referenceYear) || referenceYear < 2000 || referenceYear > 2200) throw new Error("Invalid analysis reference year.");
  const p20 = pct(usable.filter((r) => referenceYear - r.yearBuilt >= 20).length, total);
  const p30 = pct(usable.filter((r) => referenceYear - r.yearBuilt >= 30).length, total);
  const p40 = pct(usable.filter((r) => referenceYear - r.yearBuilt >= 40).length, total);
  const signal = propertyAgeSignal({percent20PlusYearsOld: p20, percent30PlusYearsOld: p30, percent40PlusYearsOld: p40, coverage});
  const types = {};
  for (const record of residential) types[record.propertyType || "unknown"] = (types[record.propertyType || "unknown"] || 0) + 1;
  return analysisShape({source: "Maryland Open Data", sourceVersion: MARYLAND_SOURCE_VERSION, dataUpdatedAt: sourceUpdatedAt,
    geographyType: "parcel", propertyCount: unique.length, structureCount: unique.filter((r) => r.structureAreaSquareFeet > 0 || r.yearBuilt).length,
    residentialStructureCount: residential.length, usableCount: total, buckets, predominantConstructionEra: predominantEra(buckets),
    median: years.length ? years[Math.floor((years.length - 1) / 2)] : null,
    mean: years.length ? Math.round(years.reduce((sum, year) => sum + year, 0) / years.length) : null,
    pre1980: pct(pre1980, total), pre2000: pct(pre2000, total), p20, p30, p40, types, coverage, signal,
    inputGranularity: "parcel_level", signalPrecision: "parcelLevel", ageMetricPrecision: "exact_year_built",
    analysisReferenceYear: referenceYear, partialCoverage,
    confidence: partialCoverage ? "LOW" : confidenceFor({coverage, granularity: "parcel", recordCount: residential.length}),
    limitations: [...(total ? [] : ["No residential property-age records were available for this area."]),
      ...(partialCoverage ? [`The provider query reached the ${MAX_PARCELS}-record safety limit; coverage is partial.`] : [])]});
}

const ACS_YEAR_RANGES = Object.freeze({
  "2020Plus": [2020, ACS_REFERENCE_YEAR], "2010To2019": [2010, 2019], "2000To2009": [2000, 2009],
  "1990To1999": [1990, 1999], "1980To1989": [1980, 1989], "1970To1979": [1970, 1979],
  "1960To1969": [1960, 1969], "1950To1959": [1950, 1959], "1940To1949": [1940, 1949], pre1940: [null, 1939],
});

function estimatedOlderCount(rawBuckets, thresholdYears, referenceYear) {
  const cutoff = referenceYear - thresholdYears;
  let count = 0;
  for (const [key, amount] of Object.entries(rawBuckets)) {
    const [minimum, maximum] = ACS_YEAR_RANGES[key] || [];
    if (maximum == null || amount <= 0) continue;
    if (maximum <= cutoff) count += amount;
    else if (minimum != null && minimum <= cutoff) {
      count += amount * ((cutoff - minimum + 1) / (maximum - minimum + 1));
    }
  }
  return count;
}

function analyzeCensusAggregates(records, {geographiesUsed = null, referenceYear = new Date().getUTCFullYear()} = {}) {
  if (!Number.isInteger(referenceYear) || referenceYear < ACS_REFERENCE_YEAR || referenceYear > 2200) throw new Error("Invalid analysis reference year.");
  const rawBuckets = Object.fromEntries(Object.keys(ACS_YEAR_RANGES).map((key) => [key, 0]));
  let total = 0;
  for (const record of records) {
    total += record.total;
    for (const key of Object.keys(rawBuckets)) rawBuckets[key] += record.buckets[key] || 0;
  }
  const pre1980 = rawBuckets.pre1940 + rawBuckets["1940To1949"] + rawBuckets["1950To1959"] +
    rawBuckets["1960To1969"] + rawBuckets["1970To1979"];
  const pre2000 = pre1980 + rawBuckets["1980To1989"] + rawBuckets["1990To1999"];
  const p20 = pct(estimatedOlderCount(rawBuckets, 20, referenceYear), total);
  const p30 = pct(estimatedOlderCount(rawBuckets, 30, referenceYear), total);
  const p40 = pct(estimatedOlderCount(rawBuckets, 40, referenceYear), total);
  const coverage = total > 0 ? 1 : 0; const signal = propertyAgeSignal({percent20PlusYearsOld: p20, percent30PlusYearsOld: p30, percent40PlusYearsOld: p40, coverage: 0.75});
  const geographyIds = (geographiesUsed || records.map((record) => record.geographyId)).filter(Boolean);
  return analysisShape({source: "U.S. Census Bureau ACS 5-Year", sourceVersion: ACS_SOURCE_VERSION, dataUpdatedAt: "2024",
    geographyType: "census_block_group", propertyCount: total, structureCount: total, residentialStructureCount: total,
    usableCount: total, buckets: rawBuckets, predominantConstructionEra: predominantEra(rawBuckets), median: null, mean: null,
    pre1980: pct(pre1980, total), pre2000: pct(pre2000, total), p20: null, p30: null, p40: null,
    estimatedP20: p20, estimatedP30: p30, estimatedP40: p40, types: {"housing units": total},
    inputGranularity: "aggregate_census", signalPrecision: "aggregateEstimate", ageMetricPrecision: "estimated_from_acs_buckets",
    analysisReferenceYear: referenceYear, censusGeographiesUsed: geographyIds,
    aggregationMethod: "sum_raw_b25034_counts_then_calculate_percentages",
    geographicCoverageMethod: "all_housing_unit_counts_from_intersecting_block_groups_no_area_weighting",
    ageThresholdApproximationMethod: "uniform_distribution_within_each_published_year_built_bucket",
    ageThresholdSourceBuckets: Object.keys(ACS_YEAR_RANGES),
    coverage, signal, confidence: confidenceFor({coverage: 0.75, granularity: "aggregate", recordCount: total}),
    limitations: ["Neighborhood estimate based on intersecting Census block groups.",
      "Counts include all housing units in every intersecting block group; they do not imply that every represented unit lies inside the selected polygon.",
      "Rolling age percentages are estimates that assume uniform distribution within each published ACS year-built bucket."]});
}

function analysisShape(value) {
  return {analysisVersion: ANALYSIS_VERSION, propertyAgeSignalVersion: value.signal.version,
    source: value.source, sourceVersion: value.sourceVersion, dataUpdatedAt: value.dataUpdatedAt,
    geographyType: value.geographyType, analyzedUnitLabel: value.geographyType === "census_block_group" ? "Housing units analyzed" : "Properties analyzed",
    propertyCount: value.propertyCount, structureCount: value.structureCount,
    residentialStructureCount: value.residentialStructureCount, recordsWithUsableYearBuilt: value.usableCount,
    predominantConstructionEra: value.predominantConstructionEra, yearBuiltMedianApprox: value.median,
    yearBuiltMeanApprox: value.mean, yearBuiltBuckets: value.buckets,
    percentPre1980: value.pre1980, percentPre2000: value.pre2000, percent20PlusYearsOld: value.p20,
    percent30PlusYearsOld: value.p30, percent40PlusYearsOld: value.p40,
    estimatedPercent20PlusYearsOld: value.estimatedP20 ?? null,
    estimatedPercent30PlusYearsOld: value.estimatedP30 ?? null,
    estimatedPercent40PlusYearsOld: value.estimatedP40 ?? null,
    analysisReferenceYear: value.analysisReferenceYear, ageMetricPrecision: value.ageMetricPrecision,
    inputGranularity: value.inputGranularity, signalPrecision: value.signalPrecision,
    censusGeographiesUsed: value.censusGeographiesUsed || [],
    intersectingGeographyCount: value.censusGeographiesUsed?.length || 0,
    aggregationMethod: value.aggregationMethod || "individual_property_observations",
    geographicCoverageMethod: value.geographicCoverageMethod || "server_point_in_polygon",
    ageThresholdApproximationMethod: value.ageThresholdApproximationMethod || null,
    ageThresholdSourceBuckets: value.ageThresholdSourceBuckets || [], partialCoverage: !!value.partialCoverage,
    propertyTypeDistribution: value.types, propertyAgeSignal: value.signal.score,
    propertyAgeSignalCategory: value.signal.category, confidence: value.confidence,
    dataCoverage: Math.round(value.coverage * 1000) / 10, limitations: value.limitations,
    aiSummary: value.signal.score >= 75 ? "This area contains a relatively high concentration of older residential properties." :
      value.signal.score >= 50 ? "This area contains a meaningful concentration of older residential properties." :
      value.signal.score >= 25 ? "This area contains a mix of newer and older residential properties." :
      "Available records indicate predominantly newer residential property stock."};
}

function aiGrounding(analysis, objective = "") {
  return {knownData: {analysisId: analysis.analysisId || null, geometryDigest: analysis.geometryDigest || null,
    analysisVersion: analysis.analysisVersion || ANALYSIS_VERSION,
    propertyAgeSignal: analysis.propertyAgeSignal, propertyAgeSignalCategory: analysis.propertyAgeSignalCategory,
    propertyAgeSignalVersion: analysis.propertyAgeSignalVersion,
    propertyCount: analysis.propertyCount, residentialStructureCount: analysis.residentialStructureCount,
    predominantConstructionEra: analysis.predominantConstructionEra,
    yearBuiltBuckets: analysis.yearBuiltBuckets, percentPre1980: analysis.percentPre1980, percentPre2000: analysis.percentPre2000,
    percent20PlusYearsOld: analysis.percent20PlusYearsOld, percent30PlusYearsOld: analysis.percent30PlusYearsOld,
    percent40PlusYearsOld: analysis.percent40PlusYearsOld, propertyTypeDistribution: analysis.propertyTypeDistribution,
    estimatedPercent20PlusYearsOld: analysis.estimatedPercent20PlusYearsOld,
    estimatedPercent30PlusYearsOld: analysis.estimatedPercent30PlusYearsOld,
    estimatedPercent40PlusYearsOld: analysis.estimatedPercent40PlusYearsOld,
    inputGranularity: analysis.inputGranularity, signalPrecision: analysis.signalPrecision,
    source: analysis.source, sourceVersion: analysis.sourceVersion, dataUpdatedAt: analysis.dataUpdatedAt,
    freshness: {generatedAt: analysis.generatedAt || null,
      dataUpdatedAt: analysis.dataUpdatedAt || null},
    confidence: analysis.confidence, coverage: analysis.dataCoverage, limitations: analysis.limitations,
    physicalLogisticsVersion: analysis.physicalLogisticsVersion || null,
    physicalLogistics: analysis.physicalLogistics || null,
    physicalChannelSuitability: analysis.physicalChannelSuitability || null},
  inference: objective ? `These property-age characteristics may be relevant when evaluating ${String(objective).slice(0, 240)}, but they do not establish the condition or service needs of any property or component.` :
    "No trade-specific inference was requested.", distinctionRequired: true};
}

function limitedText(value, maximumLength) {
  return value === null || value === undefined ? "" :
    String(value).trim().slice(0, maximumLength);
}

function sanitizeWeatherIntelligence(weatherIntelligence) {
  if (!weatherIntelligence || typeof weatherIntelligence !== "object") return null;
  const rawAlerts = Array.isArray(weatherIntelligence.alerts) ?
    weatherIntelligence.alerts.slice(0, 12) : [];
  return {
    source: limitedText(weatherIntelligence.source, 120) || "National Weather Service",
    weatherAnalysisVersion: limitedText(
      weatherIntelligence.weatherAnalysisVersion || weatherIntelligence.modelVersion,
      120,
    ) || "weather-opportunity-v1",
    cached: weatherIntelligence.cached === true,
    stale: weatherIntelligence.stale === true,
    alerts: rawAlerts.map((alert) => {
      const opportunity = alert?.opportunity && typeof alert.opportunity === "object" ?
        alert.opportunity : alert || {};
      return {
        event: limitedText(alert?.event, 120),
        headline: limitedText(alert?.headline, 240),
        severity: limitedText(alert?.severity, 40),
        areaDescription: limitedText(alert?.areaDescription, 500),
        onset: limitedText(alert?.onset, 80),
        expires: limitedText(alert?.expires, 80),
        services: Array.isArray(opportunity.services) ?
          opportunity.services.slice(0, 12).map((value) => limitedText(value, 80)) : [],
        estimatedLeadLiftLowPercent: finite(
          opportunity.estimatedLeadLiftLowPercent ?? opportunity.leadLiftLowPercent,
        ),
        estimatedLeadLiftHighPercent: finite(
          opportunity.estimatedLeadLiftHighPercent ?? opportunity.leadLiftHighPercent,
        ),
        confidence: limitedText(opportunity.confidence, 80),
        rationale: limitedText(opportunity.rationale, 500),
        experimental: true,
      };
    }),
    limitations: [
      "Weather facts come from National Weather Service alerts.",
      "Opportunity ranges are deterministic experimental estimates, not model-generated facts or guaranteed demand.",
    ],
  };
}

function buildPropertyIntelligenceAssistantContext({objective = "", propertyIntelligence,
  weatherIntelligence = null, campaignContext = null}) {
  const propertyContext = aiGrounding(propertyIntelligence, objective);
  const weatherContext = sanitizeWeatherIntelligence(weatherIntelligence);
  return {interface: "PropertyIntelligenceAssistantContextV1",
    sharedInterface: ASSISTANT_CONTEXT_VERSION,
    promptVersion: ASSISTANT_PROMPT_VERSION,
    objective: String(objective).trim().slice(0, 500),
    propertyIntelligence: propertyContext,
    weatherIntelligence: weatherContext,
    campaignContext: campaignContext === null ? null : {status: "not_loaded_by_authoritative_server"},
    componentSignals: {property: propertyContext.knownData, weather: weatherContext, campaign: null},
    responseContract: {knownPropertyDataMustRemainVerbatim: true,
      inferenceMustBeQualified: true, unavailableDataMustRemainUnavailable: true}};
}

function intelligenceCacheIdentity(context, {modelVersion = "unconfigured"} = {}) {
  const property = context?.propertyIntelligence?.knownData || {};
  const weather = context?.weatherIntelligence || {};
  const key = {
    analysisId: property.analysisId || null,
    geometryDigest: property.geometryDigest || null,
    propertyAnalysisVersion: property.analysisVersion || ANALYSIS_VERSION,
    weatherAnalysisVersion: weather.weatherAnalysisVersion || null,
    objective: context?.objective || "",
    promptVersion: context?.promptVersion || ASSISTANT_PROMPT_VERSION,
    modelVersion,
  };
  return crypto.createHash("sha256").update(JSON.stringify(key)).digest("hex");
}

function sanitizeAssistantResponse(response, context) {
  const raw = response && typeof response === "object" ? response : {};
  const interpretation = typeof response === "string" ? response :
    (raw.interpretation || raw.narrative || raw.text || "");
  const limitations = Array.isArray(raw.limitations) ?
    raw.limitations.slice(0, 20).map((value) => limitedText(value, 500)) : [];
  return {
    knownPropertyData: context.propertyIntelligence.knownData,
    aiInterpretation: limitedText(interpretation, 4000),
    limitations,
    qualification: "AI interpretation cannot establish property or component condition, service need, or customer intent.",
  };
}

async function analyzeBusinessOpportunity(input, {transport = null} = {}) {
  const context = buildPropertyIntelligenceAssistantContext(input);
  const cacheIdentity = intelligenceCacheIdentity(context);
  if (typeof transport !== "function") return {status: "transport_unavailable", productionReady: false,
    provider: null, model: null, cacheIdentity, context, response: null};
  const rawResponse = await transport(context);
  return {status: "complete", productionReady: true, cacheIdentity, context,
    authoritativeKnownData: context.propertyIntelligence.knownData,
    response: sanitizeAssistantResponse(rawResponse, context)};
}

class MarylandPropertyProvider {
  constructor({fetchJson = defaultFetchJson} = {}) { this.fetchJson = fetchJson; }
  async analyze({geometry}) {
    const box = boundingBox(geometry); const f = MARYLAND_FIELDS;
    const where = `${f.latitude} between ${box.minLatitude} and ${box.maxLatitude} AND ${f.longitude} between ${box.minLongitude} and ${box.maxLongitude}`;
    const select = Object.values(f).join(",");
    const payload = []; let offset = 0; let truncated = false;
    while (offset < MAX_PARCELS) {
      const limit = Math.min(MARYLAND_PAGE_SIZE, MAX_PARCELS - offset);
      const url = `https://opendata.maryland.gov/resource/ed4q-f8tm.json?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(`${f.propertyId} ASC`)}&$limit=${limit}&$offset=${offset}`;
      const page = await this.fetchJson(url, {timeoutMs: 12000});
      if (!Array.isArray(page)) throw new Error("Malformed Maryland provider response.");
      payload.push(...page); offset += page.length;
      if (page.length < limit) break;
    }
    if (payload.length >= MAX_PARCELS) {
      const sentinelUrl = `https://opendata.maryland.gov/resource/ed4q-f8tm.json?$select=${encodeURIComponent(f.propertyId)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(`${f.propertyId} ASC`)}&$limit=1&$offset=${MAX_PARCELS}`;
      const sentinel = await this.fetchJson(sentinelUrl, {timeoutMs: 12000});
      truncated = Array.isArray(sentinel) && sentinel.length > 0;
    }
    const observations = deduplicateParcels((Array.isArray(payload) ? payload : []).map(normalizeMarylandRecord).filter(Boolean));
    if (!observations.length) return null;
    const editions = observations.map((item) => item.sourceEdition).filter(Boolean).sort();
    const analysis = analyzeParcelObservations(observations, {geometry, partialCoverage: truncated,
      sourceUpdatedAt: editions.length ? `MdProperty View edition ${editions.at(-1)}` : null});
    analysis.providerPagination = {pageSize: MARYLAND_PAGE_SIZE, retrievedRecords: payload.length,
      maxRecords: MAX_PARCELS, truncated, coverageStatus: truncated ? "partial" : "complete"};
    return analysis;
  }
}

class CensusPropertyProvider {
  constructor({fetchJson = defaultFetchJson, apiKey = ""} = {}) { this.fetchJson = fetchJson; this.apiKey = apiKey; }
  async analyze({geometry}) {
    const query = new URLSearchParams({f: "geojson", geometry: JSON.stringify(arcGisPolygon(geometry)),
      geometryType: "esriGeometryPolygon", spatialRel: "esriSpatialRelIntersects", inSR: "4326", outSR: "4326",
      outFields: "GEOID,STATE,COUNTY,TRACT,BLKGRP", returnGeometry: "false"});
    const geoUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/${TIGERWEB_BLOCK_GROUP_LAYER}/query?${query}`;
    const geographies = parseTigerwebBlockGroups(await this.fetchJson(geoUrl, {timeoutMs: 12000}));
    if (!geographies.length) return null;
    if (geographies.length > MAX_CENSUS_GEOGRAPHIES) throw new Error("Selected area intersects too many Census block groups.");
    const key = this.apiKey ? `&key=${encodeURIComponent(this.apiKey)}` : "";
    const tracts = new Map();
    for (const item of geographies) tracts.set(`${item.state}${item.county}${item.tract}`, item);
    const rows = [];
    for (const item of tracts.values()) {
      const url = `https://api.census.gov/data/2024/acs/acs5?get=NAME,${ACS_FIELDS.join(",")}&for=block%20group:*&in=state:${item.state}%20county:${item.county}%20tract:${item.tract}${key}`;
      rows.push(...parseCensusB25034(await this.fetchJson(url, {timeoutMs: 10000})));
    }
    const selected = new Set(geographies.map((item) => item.geographyId));
    const intersectingRows = rows.filter((row) => selected.has(row.geographyId));
    return intersectingRows.length ? analyzeCensusAggregates(intersectingRows,
      {geographiesUsed: geographies.map((item) => item.geographyId)}) : null;
  }
}

async function defaultFetchJson(url, {timeoutMs = 10000} = {}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetch(url, {headers: {"User-Agent": "ScaledCircle Property Intelligence support@scaledcircle.com"}, signal: controller.signal});
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`); return await response.json();
  } finally { clearTimeout(timeout); }
}

async function analyzeWithFallback({geometry, providers}) {
  const failures = [];
  for (const provider of providers) {
    try { const analysis = await provider.analyze({geometry}); if (analysis) return {...analysis, providerFailures: failures}; }
    catch (error) { failures.push(error instanceof Error ? error.message.slice(0, 160) : "Provider unavailable"); }
  }
  return {analysisVersion: ANALYSIS_VERSION, propertyAgeSignalVersion: SIGNAL_VERSION, source: "none", sourceVersion: null,
    geographyType: "none", propertyCount: 0, structureCount: 0, residentialStructureCount: 0, propertyAgeSignal: null,
    propertyAgeSignalCategory: "INSUFFICIENT DATA", confidence: "INSUFFICIENT", dataCoverage: 0,
    limitations: ["Property Intelligence temporarily unavailable.", ...failures], aiSummary: "No property-age records were available for this area."};
}

function cacheIsReusable(cache, {digest, now = Date.now()} = {}) {
  const generated = cache?.generatedAt?.toMillis ? cache.generatedAt.toMillis() :
    Date.parse(cache?.generatedAt || "");
  return cache?.geometryDigest === digest && cache?.analysisVersion === ANALYSIS_VERSION &&
    cache?.dataSourceBundleVersion === DATA_SOURCE_BUNDLE_VERSION &&
    Number.isFinite(generated) && now - generated >= 0 && now - generated < CACHE_TTL_MS && !!cache.analysis;
}

function assertBusinessAccess({uid, role, isAdmin, businessId}) {
  if (!uid) throw new Error("unauthenticated");
  if (role !== "business" && !isAdmin) throw new Error("business_required");
  if (!isAdmin && businessId !== uid) throw new Error("not_owner");
  return true;
}

module.exports = {ANALYSIS_VERSION, SIGNAL_VERSION, ACS_SOURCE_VERSION, MARYLAND_SOURCE_VERSION, CENSUS_BOUNDARY_VERSION, DATA_SOURCE_BUNDLE_VERSION, CACHE_TTL_MS,
  MAX_PARCELS, MARYLAND_PAGE_SIZE, MAX_CENSUS_GEOGRAPHIES, TIGERWEB_BLOCK_GROUP_LAYER, ACS_REFERENCE_YEAR,
  MARYLAND_FIELDS, ACS_FIELDS, validateGeometry, geometryDigest, boundingBox, pointInPolygon, arcGisPolygon,
  parseTigerwebBlockGroups, normalizeMarylandRecord, deduplicateParcels, parseCensusB25034,
  analyzeParcelObservations, analyzeCensusAggregates, estimatedOlderCount, propertyAgeSignal, aiGrounding,
  ASSISTANT_CONTEXT_VERSION, ASSISTANT_PROMPT_VERSION, sanitizeWeatherIntelligence,
  buildPropertyIntelligenceAssistantContext, intelligenceCacheIdentity, sanitizeAssistantResponse,
  analyzeBusinessOpportunity,
  MarylandPropertyProvider, CensusPropertyProvider, analyzeWithFallback, cacheIsReusable,
  assertBusinessAccess};
