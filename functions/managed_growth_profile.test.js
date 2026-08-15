"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const profile = require("./managed_growth_profile");

const valid = {
  businessName: "Example Remodeler", businessDescription: "A locally operated remodeler.",
  serviceAreas: ["Anne Arundel County"], servicesOffered: ["Decks", "Fences"],
  targetCustomers: ["Existing homeowners"], claimsToAvoid: ["Guaranteed results"],
};

test("profile is allowlisted, reusable, and versioned by the caller", () => {
  const sanitized = profile.sanitizeProfile(valid);
  assert.equal(profile.isProfileReady(sanitized), true);
  assert.deepEqual(sanitized.servicesOffered, ["Decks", "Fences"]);
  assert.throws(() => profile.sanitizeProfile({...valid, licenseNumber: "invented"}),
    /unsupported_business_growth_profile_field/);
  assert.throws(() => profile.sanitizeProfile({...valid, businessDescription: "API key secret"}),
    /sensitive_business_growth_profile_field/);
});

test("generation context preserves profile grounding and execution boundaries", () => {
  const context = profile.buildGenerationContext({profile: profile.sanitizeProfile(valid),
    profileVersion: 3, request: {artifactType: "growth_plan_30_day",
      instruction: "Focus on decks", mode: "organic_only"}});
  assert.equal(context.profileVersion, 3);
  assert.equal(context.request.instruction, "Focus on decks");
  assert.equal(context.boundaries.noPublishingSendingOrderingFundingSpendingOrAssignment, true);
  assert.equal(context.boundaries.actualAdSpendConnected, false);
});

test("generation context uses confirmed service areas and never invents territory", () => {
  const context = profile.buildGenerationContext({profile: profile.sanitizeProfile(valid),
    profileVersion: 4, request: {artifactType: "seo_plan"}, discovery: {
      schemaVersion: "ServiceAreaPreferencesV1", priorityServices: ["Decks"],
      excludedServices: ["Roofing"], areas: [{name: "Main Area", type: "place",
        places: ["Baltimore County"], enabled: true}],
    }});
  assert.deepEqual(context.discoveryPreferences.areas[0].places, ["Baltimore County"]);
  assert.deepEqual(context.discoveryPreferences.priorityServices, ["Decks"]);
  assert.doesNotMatch(JSON.stringify(context), /Anne Arundel/i);
});

test("every supported workflow validates and unknown workflow fails", () => {
  for (const artifactType of profile.ALLOWED_ARTIFACT_TYPES) {
    assert.equal(profile.sanitizeGenerationRequest({artifactType}).artifactType, artifactType);
  }
  assert.throws(() => profile.sanitizeGenerationRequest({artifactType: "stripe_checkout"}),
    /invalid_growth_artifact_type/);
});

test("internal QA receives conservative finite generation caps", () => {
  assert.deepEqual(profile.rateCaps("internal_qa"), {daily: 8, monthly: 40});
  assert.ok(profile.rateCaps("paid").daily > profile.rateCaps("internal_qa").daily);
});

test("artifact output is structured and safe to persist", () => {
  const artifact = profile.validateArtifact({title: "Plan", summary: "Grounded draft",
    sections: [{heading: "Week 1", content: "Educational deck content."}],
    limitations: ["No performance guarantee."], creativeBriefs: [{title: "Deck detail", brief: "Close crop."}]});
  assert.equal(artifact.sections.length, 1);
  assert.equal(artifact.limitations.length, 1);
});

test("website assistance accepts only public HTTPS URLs", () => {
  assert.equal(profile.validatePublicWebsite("https://scaledcircle.com/about").hostname,
    "scaledcircle.com");
  for (const url of ["http://example.com", "https://localhost", "https://127.0.0.1",
    "https://10.0.0.4", "https://192.168.1.2", "https://user:pass@example.com"]) {
    assert.throws(() => profile.validatePublicWebsite(url));
  }
  assert.equal(profile.isPrivateAddress("10.0.0.2"), true);
  assert.equal(profile.isPrivateAddress("192.168.1.2"), true);
  assert.equal(profile.isPrivateAddress("fd00::1"), true);
  assert.equal(profile.isPrivateAddress("8.8.8.8"), false);
});

test("website information remains unconfirmed suggestions", () => {
  const suggestion = profile.extractWebsiteSuggestions(`
    <html><head><title>Example Remodeling</title>
    <meta name="description" content="Decks, fences and remodeling in Maryland"></head>
    <body>Call (410) 555-0100 for decks, fences, kitchens and bathrooms.</body></html>`,
  "https://example.com");
  assert.equal(suggestion.confirmationRequired, true);
  assert.deepEqual(suggestion.services, ["decks", "fences", "remodeling", "kitchens", "bathrooms"]);
  assert.equal(suggestion.phone, "(410) 555-0100");
  assert.deepEqual(suggestion.serviceAreas, []);
});
