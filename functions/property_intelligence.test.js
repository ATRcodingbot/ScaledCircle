"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const property = require("./property_intelligence");

const polygon = [{latitude: 39, longitude: -77}, {latitude: 39, longitude: -76.9},
  {latitude: 39.1, longitude: -76.9}, {latitude: 39.1, longitude: -77}];
const field = property.MARYLAND_FIELDS;

function md(id, year, latitude = 39.05, longitude = -76.95, use = "Residential") {
  return {[field.propertyId]: id, [field.yearBuilt]: String(year), [field.latitude]: latitude,
    [field.longitude]: longitude, [field.landUse]: use, [field.county]: "Howard",
    [field.structureArea]: 1800, [field.sourceEdition]: "2026", owner_name: "MUST NOT LEAK"};
}

function censusPayload() {
  return [["NAME", ...property.ACS_FIELDS, "state", "county", "tract", "block group"],
    ["BG", "100", "5", "10", "10", "10", "10", "15", "15", "10", "3", "2", "24", "027", "601101", "1"]];
}

test("Maryland records normalize without owner data", () => {
  const value = property.normalizeMarylandRecord(md("A", 1975));
  assert.equal(value.yearBuilt, 1975); assert.equal(value.yearBuiltBucket, "1960To1979");
  assert.equal(value.residential, true); assert.equal("owner_name" in value, false);
});

test("parcel records deduplicate by official account ID and prefer useful year", () => {
  const records = [property.normalizeMarylandRecord(md("A", 0)), property.normalizeMarylandRecord(md("A", 1980))];
  assert.equal(property.deduplicateParcels(records).length, 1);
  assert.equal(property.deduplicateParcels(records)[0].yearBuilt, 1980);
});

test("geometry intersection excludes outside parcels", () => {
  const inside = property.normalizeMarylandRecord(md("A", 1970));
  const outside = property.normalizeMarylandRecord(md("B", 1970, 40, -76));
  assert.equal(property.analyzeParcelObservations([inside, outside], {geometry: polygon}).propertyCount, 1);
});

test("point-in-polygon includes boundary points and rejects malformed coordinates", () => {
  assert.equal(property.pointInPolygon({latitude: 39, longitude: -77}, polygon), true);
  assert.equal(property.pointInPolygon({latitude: Number.NaN, longitude: -77}, polygon), false);
});

test("parcel age metrics calculate 20/30/40 and pre-period percentages", () => {
  const observations = [md("1", 1930), md("2", 1950), md("3", 1970), md("4", 1990), md("5", 2010)]
    .map(property.normalizeMarylandRecord);
  const result = property.analyzeParcelObservations(observations, {geometry: polygon});
  assert.equal(result.percentPre1980, 60); assert.equal(result.percentPre2000, 80);
  assert.equal(result.percent20PlusYearsOld, 80); assert.equal(result.percent30PlusYearsOld, 80);
  assert.equal(result.percent40PlusYearsOld, 60);
});

test("Census B25034 parser retains official buckets", () => {
  const records = property.parseCensusB25034(censusPayload());
  assert.equal(records.length, 1); assert.equal(records[0].total, 100);
  assert.equal(records[0].buckets.pre1940, 2); assert.equal(records[0].geographyType, "census_block_group");
});

test("Census aggregate is explicitly neighborhood-level and approximate", () => {
  const result = property.analyzeCensusAggregates(property.parseCensusB25034(censusPayload()), {referenceYear: 2026});
  assert.equal(result.geographyType, "census_block_group");
  assert.match(result.limitations.join(" "), /intersecting Census block groups/);
  assert.equal(result.yearBuiltMedianApprox, null);
  assert.equal(result.analyzedUnitLabel, "Housing units analyzed");
  assert.equal(result.percent30PlusYearsOld, null);
  assert.equal(typeof result.estimatedPercent30PlusYearsOld, "number");
  assert.equal(result.inputGranularity, "aggregate_census");
  assert.equal(result.signalPrecision, "aggregateEstimate");
});

test("TIGERweb parser retains one or multiple intersecting official block groups", () => {
  const one = property.parseTigerwebBlockGroups({features: [{properties: {GEOID: "240276011011", BLKGRP: "1"}}]});
  assert.deepEqual(one.map((item) => item.geographyId), ["240276011011"]);
  const many = property.parseTigerwebBlockGroups({features: [
    {properties: {GEOID: "240276011012", BLKGRP: "2"}},
    {properties: {GEOID: "240276011011", BLKGRP: "1"}},
  ]});
  assert.deepEqual(many.map((item) => item.geographyId), ["240276011011", "240276011012"]);
});

test("Census provider intersects polygon and aggregates only returned block groups", async () => {
  const requested = [];
  const provider = new property.CensusPropertyProvider({fetchJson: async (url) => {
    requested.push(url);
    if (url.includes("tigerweb")) return {features: [
      {properties: {GEOID: "240276011011", BLKGRP: "1"}},
      {properties: {GEOID: "240276011012", BLKGRP: "2"}},
    ]};
    const header = censusPayload()[0];
    return [header, censusPayload()[1], ["BG2", "300", "0", "0", "0", "0", "0", "0", "0", "0", "0", "300", "24", "027", "601101", "2"]];
  }});
  const result = await provider.analyze({geometry: polygon});
  assert.equal(result.intersectingGeographyCount, 2);
  assert.deepEqual(result.censusGeographiesUsed, ["240276011011", "240276011012"]);
  assert.match(requested[0], /MapServer\/8\/query/);
  assert.match(decodeURIComponent(requested[0]), /esriSpatialRelIntersects/);
  assert.equal(result.propertyCount, 400);
});

test("ACS aggregation weights raw counts and never averages geography percentages", () => {
  const header = censusPayload()[0];
  const oldSmall = ["old", "10", "0", "0", "0", "0", "0", "0", "0", "0", "0", "10", "24", "027", "601101", "1"];
  const newLarge = ["new", "90", "90", "0", "0", "0", "0", "0", "0", "0", "0", "0", "24", "027", "601101", "2"];
  const result = property.analyzeCensusAggregates(property.parseCensusB25034([header, oldSmall, newLarge]), {referenceYear: 2026});
  assert.equal(result.percentPre1980, 10);
  assert.notEqual(result.percentPre1980, 50);
  assert.equal(result.aggregationMethod, "sum_raw_b25034_counts_then_calculate_percentages");
});

test("age-threshold calculations use the supplied server reference year", () => {
  const observations = [md("boundary", 2006)].map(property.normalizeMarylandRecord);
  assert.equal(property.analyzeParcelObservations(observations, {geometry: polygon, referenceYear: 2026}).percent20PlusYearsOld, 100);
  assert.equal(property.analyzeParcelObservations(observations, {geometry: polygon, referenceYear: 2025}).percent20PlusYearsOld, 0);
});

test("ACS bucket-boundary estimates are explicitly approximate", () => {
  const result = property.analyzeCensusAggregates(property.parseCensusB25034(censusPayload()), {referenceYear: 2026});
  assert.equal(result.ageMetricPrecision, "estimated_from_acs_buckets");
  assert.equal(result.analysisReferenceYear, 2026);
  assert.match(result.ageThresholdApproximationMethod, /uniform_distribution/);
  assert.ok(result.ageThresholdSourceBuckets.includes("2000To2009"));
});

test("Property Age Signal boundaries and version are transparent", () => {
  const scores = [0, 30, 60, 100].map((value) => property.propertyAgeSignal({
    percent20PlusYearsOld: value, percent30PlusYearsOld: value, percent40PlusYearsOld: value, coverage: 1}));
  assert.deepEqual(scores.map((item) => item.category), ["NEWER STOCK", "MIXED STOCK", "OLDER STOCK", "HIGH OLDER-STOCK CONCENTRATION"]);
  assert.ok(scores.every((item) => item.version === "PropertyAgeSignalV1"));
});

test("low coverage reduces rather than inflates age signal", () => {
  const high = property.propertyAgeSignal({percent20PlusYearsOld: 90, percent30PlusYearsOld: 90, percent40PlusYearsOld: 90, coverage: 1});
  const low = property.propertyAgeSignal({percent20PlusYearsOld: 90, percent30PlusYearsOld: 90, percent40PlusYearsOld: 90, coverage: 0.1});
  assert.ok(low.score < high.score);
});

test("client-looking score and owner fields never enter analysis", () => {
  const clean = property.normalizeMarylandRecord(md("A", 2005));
  const spoofed = property.normalizeMarylandRecord({...md("A", 2005), propertyAgeSignal: 100, owner_name: "Private"});
  const result = property.analyzeParcelObservations([spoofed], {geometry: polygon});
  assert.equal(result.propertyAgeSignal,
    property.analyzeParcelObservations([clean], {geometry: polygon}).propertyAgeSignal);
  assert.equal(JSON.stringify(result).includes("Private"), false);
});

test("protected demographic fields cannot affect scoring", () => {
  const base = md("A", 1965); const one = property.normalizeMarylandRecord(base);
  const two = property.normalizeMarylandRecord({...base, race: "x", religion: "y", disability: true});
  assert.equal(property.analyzeParcelObservations([one], {geometry: polygon}).propertyAgeSignal,
    property.analyzeParcelObservations([two], {geometry: polygon}).propertyAgeSignal);
});

test("AI grounding separates known data from objective inference", () => {
  const analysis = property.analyzeParcelObservations([property.normalizeMarylandRecord(md("A", 1970))], {geometry: polygon});
  const grounding = property.aiGrounding(analysis, "roofing outreach");
  assert.equal(grounding.knownData.source, "Maryland Open Data"); assert.match(grounding.inference, /may be relevant/);
  assert.match(grounding.inference, /do not establish/); assert.equal(grounding.distinctionRequired, true);
});

test("AI transport absence is honest and never fabricates a response", async () => {
  const analysis = property.analyzeParcelObservations([property.normalizeMarylandRecord(md("A", 1970))], {geometry: polygon});
  const result = await property.analyzeBusinessOpportunity({objective: "roofing outreach", propertyIntelligence: analysis});
  assert.equal(result.status, "transport_unavailable"); assert.equal(result.productionReady, false);
  assert.equal(result.response, null); assert.equal(result.context.interface, "PropertyIntelligenceAssistantContextV1");
});

test("mixed-source comparison fields expose neutral facts without universal ranking", () => {
  const parcel = property.analyzeParcelObservations([property.normalizeMarylandRecord(md("A", 1970))], {geometry: polygon});
  const census = property.analyzeCensusAggregates(property.parseCensusB25034(censusPayload()), {referenceYear: 2026});
  for (const item of [parcel, census]) {
    for (const key of ["propertyAgeSignal", "inputGranularity", "signalPrecision", "predominantConstructionEra", "percentPre1980", "percentPre2000", "confidence", "dataCoverage"]) assert.ok(key in item);
    assert.equal("best" in item, false); assert.equal("recommendedArea" in item, false);
  }
});

test("geometry changes invalidate digest", () => {
  const changed = polygon.map((point) => ({...point})); changed[0].latitude += 0.001;
  assert.notEqual(property.geometryDigest(polygon), property.geometryDigest(changed));
});

test("excessive or malformed geometry is rejected", () => {
  assert.throws(() => property.validateGeometry([{latitude: 1, longitude: 1}]));
  assert.throws(() => property.validateGeometry([{latitude: 0, longitude: 0}, {latitude: 0, longitude: 10}, {latitude: 10, longitude: 10}]));
});

test("Maryland provider uses official Socrata endpoint and fixture data", async () => {
  let requested = "";
  const provider = new property.MarylandPropertyProvider({fetchJson: async (url) => { requested = url; return [md("A", 1970)]; }});
  const result = await provider.analyze({geometry: polygon});
  assert.match(requested, /opendata\.maryland\.gov\/resource\/ed4q-f8tm\.json/);
  assert.equal(result.propertyCount, 1);
  assert.equal(result.dataUpdatedAt, "MdProperty View edition 2026");
  assert.match(decodeURIComponent(requested), /account_id_mdp_field_acctid ASC/);
});

test("Maryland provider paginates deterministically", async () => {
  const urls = [];
  const provider = new property.MarylandPropertyProvider({fetchJson: async (url) => {
    urls.push(url); const offset = Number(new URL(url).searchParams.get("$offset"));
    return offset === 0 ? Array.from({length: property.MARYLAND_PAGE_SIZE}, (_, index) => md(`A${index}`, 1970)) : [md("last", 1980)];
  }});
  const result = await provider.analyze({geometry: polygon});
  assert.equal(urls.length, 2); assert.equal(result.providerPagination.truncated, false);
});

test("Maryland provider detects truncation with a sentinel request", async () => {
  const provider = new property.MarylandPropertyProvider({fetchJson: async (url) => {
    const parsed = new URL(url); const offset = Number(parsed.searchParams.get("$offset"));
    if (offset === property.MAX_PARCELS) return [{[field.propertyId]: "overflow"}];
    const limit = Number(parsed.searchParams.get("$limit"));
    return Array.from({length: limit}, (_, index) => md(`${offset + index}`, 1970));
  }});
  const result = await provider.analyze({geometry: polygon});
  assert.equal(result.partialCoverage, true); assert.equal(result.providerPagination.coverageStatus, "partial");
  assert.equal(result.confidence, "LOW");
});

test("Maryland bounding-box results are filtered by polygon and duplicate IDs", async () => {
  const provider = new property.MarylandPropertyProvider({fetchJson: async () => [
    md("inside", 1970), md("outside", 1970, 39.09, -76.99), md("inside", 1980),
    {...md("bad", 1970), [field.latitude]: "not-a-number"},
  ]});
  const result = await provider.analyze({geometry: [polygon[0], polygon[1], polygon[2]]});
  assert.equal(result.propertyCount, 1);
});

test("provider fallback selects Census when Maryland is unavailable", async () => {
  const result = await property.analyzeWithFallback({geometry: polygon, providers: [
    {analyze: async () => { throw new Error("Maryland unavailable"); }},
    {analyze: async () => property.analyzeCensusAggregates(property.parseCensusB25034(censusPayload()))},
  ]});
  assert.equal(result.source, "U.S. Census Bureau ACS 5-Year"); assert.equal(result.providerFailures.length, 1);
});

test("all provider failures return explicit no-data response", async () => {
  const result = await property.analyzeWithFallback({geometry: polygon, providers: [{analyze: async () => null}]});
  assert.equal(result.confidence, "INSUFFICIENT"); assert.equal(result.propertyAgeSignal, null);
});

test("source version is part of every analysis", () => {
  const mdResult = property.analyzeParcelObservations([property.normalizeMarylandRecord(md("A", 1970))], {geometry: polygon});
  const censusResult = property.analyzeCensusAggregates(property.parseCensusB25034(censusPayload()));
  assert.equal(mdResult.sourceVersion, property.MARYLAND_SOURCE_VERSION);
  assert.equal(censusResult.sourceVersion, property.ACS_SOURCE_VERSION);
});

test("cache reuses matching fresh analysis but rejects stale/source-version geometry", () => {
  const digest = property.geometryDigest(polygon); const now = Date.now();
  const fresh = {geometryDigest: digest, analysisVersion: property.ANALYSIS_VERSION,
    dataSourceBundleVersion: property.DATA_SOURCE_BUNDLE_VERSION,
    generatedAt: new Date(now - 1000).toISOString(), analysis: {source: "fixture"}};
  assert.equal(property.cacheIsReusable(fresh, {digest, now}), true);
  assert.equal(property.cacheIsReusable({...fresh, generatedAt: new Date(now - property.CACHE_TTL_MS - 1).toISOString()}, {digest, now}), false);
  assert.equal(property.cacheIsReusable({...fresh, analysisVersion: "old"}, {digest, now}), false);
  assert.equal(property.cacheIsReusable({...fresh, dataSourceBundleVersion: "old-source"}, {digest, now}), false);
  assert.equal(property.cacheIsReusable(fresh, {digest: "changed", now}), false);
});

test("only the owning Business or trusted admin passes authorization", () => {
  assert.equal(property.assertBusinessAccess({uid: "business-one", role: "business", isAdmin: false, businessId: "business-one"}), true);
  assert.equal(property.assertBusinessAccess({uid: "admin", role: "admin", isAdmin: true, businessId: "business-one"}), true);
  assert.throws(() => property.assertBusinessAccess({uid: "scaler", role: "scaler", isAdmin: false, businessId: "business-one"}));
  assert.throws(() => property.assertBusinessAccess({uid: "business-two", role: "business", isAdmin: false, businessId: "business-one"}));
});

test("property analysis contains no campaign publishing or funding authority", () => {
  const result = property.analyzeParcelObservations([property.normalizeMarylandRecord(md("A", 1970))], {geometry: polygon});
  for (const key of ["funded", "published", "paymentStatus", "stripeCheckoutSessionId"]) assert.equal(key in result, false);
});
