"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const property = require("./property_intelligence");

const root = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
const weatherSource = fs.readFileSync(path.join(root, "functions-weather", "index.js"), "utf8");
const weatherPackage = JSON.parse(fs.readFileSync(
  path.join(root, "functions-weather", "package.json"), "utf8",
));

test("Weather Intelligence keeps deterministic facts and adds the shared model transport", () => {
  assert.match(mainSource, /https:\/\/api\.weather\.gov\/alerts\/active/);
  assert.match(mainSource, /function weatherOpportunityFromFeature/);
  assert.match(mainSource, /combinedText\.includes\("hail"\)/);
  assert.match(mainSource, /modelVersion: "weather-opportunity-v1"/);
  assert.match(weatherSource, /combined\.includes\("heat"\)/);
  assert.deepEqual(Object.keys(weatherPackage.dependencies).sort(), [
    "firebase-admin", "firebase-functions",
  ]);
  assert.match(mainSource, /scaledCircleIntelligence/);
  assert.match(mainSource, /exports\.analyzeScaleIntelligence/);
  assert.match(mainSource, /loadWeatherOpportunityFeed/);
  assert.doesNotMatch(weatherSource, /openai|gemini|vertex|generative-ai|anthropic|chat\.completions|generateContent/i);
});

test("existing Weather Intelligence remains NWS facts plus disclosed estimates", () => {
  assert.match(mainSource, /source: "National Weather Service"/);
  assert.match(mainSource, /experimentalOpportunityModel: true/);
  assert.match(mainSource, /weatherOpportunityCache/);
  assert.match(weatherSource, /weatherAlertDeliveries/);
  assert.match(weatherSource, /opportunity estimates are experimental/i);
});

test("Property future context allowlists authoritative facts and excludes private data", () => {
  const analysis = {
    analysisId: "analysis-1", geometryDigest: "digest-1",
    analysisVersion: "PropertyIntelligenceV2", propertyAgeSignal: 72,
    propertyAgeSignalCategory: "OLDER STOCK", propertyAgeSignalVersion: "PropertyAgeSignalV1",
    propertyCount: 100, residentialStructureCount: 90,
    predominantConstructionEra: "1960-1979", percentPre1980: 45,
    percentPre2000: 61, confidence: "HIGH", dataCoverage: 91,
    source: "Maryland Open Data", sourceVersion: "MD_OPEN_DATA_ed4q-f8tm",
    limitations: ["Property age does not establish condition."],
    ownerName: "MUST NOT LEAK", race: "MUST NOT LEAK",
  };
  const context = property.buildPropertyIntelligenceAssistantContext({
    objective: "Market HVAC replacement systems", propertyIntelligence: analysis,
  });
  assert.equal(context.propertyIntelligence.knownData.propertyAgeSignal, 72);
  assert.equal(context.propertyIntelligence.knownData.predominantConstructionEra, "1960-1979");
  assert.equal(JSON.stringify(context).includes("MUST NOT LEAK"), false);
  assert.match(context.propertyIntelligence.inference, /do not establish/);
});

test("combined context sanitizes Weather and keeps component signals separate", () => {
  const context = property.buildPropertyIntelligenceAssistantContext({
    objective: "Compare areas for roofing outreach",
    propertyIntelligence: {propertyAgeSignal: 60, limitations: []},
    weatherIntelligence: {source: "National Weather Service", secret: "NO",
      alerts: [{event: "Hail", severity: "Severe", ownerName: "NO",
        opportunity: {services: ["Roofing"], estimatedLeadLiftLowPercent: 10,
          estimatedLeadLiftHighPercent: 30, rationale: "Deterministic rule."}}]},
  });
  assert.equal(context.componentSignals.property.propertyAgeSignal, 60);
  assert.equal(context.componentSignals.weather.alerts[0].event, "Hail");
  assert.equal(JSON.stringify(context).includes('"secret"'), false);
  assert.equal(JSON.stringify(context).includes('"ownerName"'), false);
  assert.equal(context.componentSignals.campaign, null);
});

test("identical grounded contexts have one deterministic future cache identity", () => {
  const input = {objective: "Explain this area", propertyIntelligence: {
    analysisId: "analysis-1", geometryDigest: "digest-1",
    analysisVersion: "PropertyIntelligenceV2", propertyAgeSignal: 72,
    limitations: [],
  }};
  const first = property.buildPropertyIntelligenceAssistantContext(input);
  const second = property.buildPropertyIntelligenceAssistantContext(input);
  assert.equal(property.intelligenceCacheIdentity(first), property.intelligenceCacheIdentity(second));
  assert.notEqual(property.intelligenceCacheIdentity(first),
    property.intelligenceCacheIdentity({...second, objective: "Different objective"}));
});

test("no configured transport means zero model calls and no fabricated response", async () => {
  const result = await property.analyzeBusinessOpportunity({
    objective: "I run a roofing company. How might this area be useful?",
    propertyIntelligence: {propertyAgeSignal: null, limitations: ["Unavailable"]},
  });
  assert.equal(result.status, "transport_unavailable");
  assert.equal(result.productionReady, false);
  assert.equal(result.provider, null);
  assert.equal(result.model, null);
  assert.equal(result.response, null);
  assert.equal(result.context.propertyIntelligence.knownData.propertyAgeSignal, null);
});

test("mock model output cannot replace authoritative Property Age Signal", async () => {
  const result = await property.analyzeBusinessOpportunity({
    objective: "Explain this area",
    propertyIntelligence: {propertyAgeSignal: 72,
      propertyAgeSignalCategory: "OLDER STOCK", limitations: []},
  }, {transport: async () => ({propertyAgeSignal: 100, narrative: "mock only"})});
  assert.equal(result.authoritativeKnownData.propertyAgeSignal, 72);
  assert.equal(result.response.knownPropertyData.propertyAgeSignal, 72);
  assert.equal(result.response.propertyAgeSignal, undefined);
  assert.equal(result.response.aiInterpretation, "mock only");
});

test("HVAC and roofing objectives remain qualified inference, never property condition", () => {
  const analysis = {propertyAgeSignal: 72, limitations: []};
  for (const objective of [
    "I run an HVAC company. What opportunity do you see here?",
    "I run a roofing company. How might this area be useful?",
  ]) {
    const grounding = property.aiGrounding(analysis, objective);
    assert.match(grounding.inference, /may be relevant/);
    assert.match(grounding.inference, /do not establish the condition or service needs/);
  }
});

test("Property AI has no callable that could bypass the Scale entitlement gate", () => {
  assert.doesNotMatch(mainSource, /exports\.(askProperty|analyzeBusinessOpportunity|propertyAi)/i);
  const start = mainSource.indexOf("exports.analyzePropertyIntelligence");
  const entitlement = mainSource.indexOf('collection("businessSubscriptions")', start);
  const providers = mainSource.indexOf("new propertyIntelligence.MarylandPropertyProvider", start);
  assert.ok(entitlement >= 0 && entitlement < providers);
});
