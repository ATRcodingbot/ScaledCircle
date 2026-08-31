"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jsQR = require("jsqr");
const sharp = require("sharp");
const physical = require("./physical_marketing");
const providers = require("./physical_fulfillment_providers");

function draft(overrides = {}) {
  return physical.normalizeDraft({productSpecId: "door_hanger_3_5x8_5", sideCount: 2,
    campaignId: "campaign-a", service: "Build decks", headline: "Build the deck your home deserves",
    offer: "Explore professional deck options for your property.", cta: "Scan to learn more",
    landingPageId: "page-a", templateId: "door_hanger_service_hero_v1",
    media: {assetId: "asset-a", revisionId: "revision-a"}, ...overrides});
}

function authority(overrides = {}) {
  return {businessName: "Attractive Remodel", businessNameSource: "business_growth_profile",
    services: ["Build decks", "Fences"], primaryColor: "#176FD1", secondaryColor: "#10243E",
    phone: null, phoneSource: null, authorizedOffer: null,
    destination: "https://scaledcircle.test/p/attractive-remodel", ...overrides};
}

function version(overrides = {}) {
  const content = overrides.content || draft();
  return {productSpecId: "door_hanger_3_5x8_5", content,
    templateId: content.templateId, templateVersion: 1,
    brandSnapshot: authority(overrides.brandSnapshot),
    mediaSnapshot: content.media ? {assetId: content.media.assetId,
      revisionId: content.media.revisionId, contentHash: "a".repeat(64),
      origin: "business_upload"} : null,
    landingPage: {landingPageId: "page-a", destination: authority().destination},
    responseAssetId: "response-a",
    trackedUrl: "https://scaledcircle.test/r?code=ATTRACTIVEDECKS", ...overrides};
}

async function serviceImage() {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1400">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cfe8f6"/>
    <stop offset="1" stop-color="#eef4ea"/></linearGradient></defs><rect width="1600" height="1400" fill="url(#sky)"/>
    <rect y="760" width="1600" height="640" fill="#54794d"/><polygon points="100,1040 800,570 1500,1040" fill="#d6cab5"/>
    <rect x="255" y="900" width="1090" height="260" rx="10" fill="#9a6f43"/>
    <g stroke="#684829" stroke-width="16"><line x1="310" y1="900" x2="310" y2="1230"/>
    <line x1="1290" y1="900" x2="1290" y2="1230"/><line x1="260" y1="1010" x2="1340" y2="1010"/></g></svg>`);
  return sharp(svg).jpeg({quality: 94}).toBuffer();
}

test("bounded V1 product specs include required door hanger and supported front/back profiles", () => {
  const door = physical.productSpec("door_hanger_3_5x8_5");
  assert.equal(door.widthInches, 3.5); assert.equal(door.heightInches, 8.5);
  assert.deepEqual(door.sides, [1, 2]); assert.deepEqual(door.quantities, [100, 250, 500, 1000, 2500]);
  assert.equal(door.dieCut.kind, "standard_circular_hole");
  assert.equal(Object.values(physical.PRODUCT_SPECS).filter((item) => !item.uiHidden).length, 5);
});

test("customer-visible ProductSpecs retain their stable server validation identifiers", () => {
  const specs = physical.publicProductSpecs();
  assert.equal(specs.length, 5);
  assert.equal(specs.find((item) => item.productType === "door_hanger").specId,
    "door_hanger_3_5x8_5");
  for (const item of specs) {
    assert.equal(physical.productSpec(item.specId).specId, item.specId);
    assert.equal(item.version, "PhysicalProductSpecV1");
  }
});

test("drafts are bounded and reject unsupported products, sides, and missing campaign or destination", () => {
  assert.equal(draft().headline, "Build the deck your home deserves");
  assert.throws(() => draft({productSpecId: "yard_sign"}), /physical_product_unsupported/);
  assert.throws(() => draft({sideCount: 3}), /physical_side_count_invalid/);
  assert.throws(() => draft({campaignId: ""}), /physical_campaign_required/);
  assert.throws(() => draft({landingPageId: ""}), /physical_landing_page_required/);
});

test("version and artifact hashing is deterministic and sensitive to content", () => {
  const first = physical.digest({draft: draft(), version: 1});
  const reordered = physical.digest({version: 1, draft: draft()});
  const changed = physical.digest({draft: draft({headline: "Different"}), version: 1});
  assert.equal(first, reordered); assert.notEqual(first, changed); assert.match(first, /^[a-f0-9]{64}$/);
});

test("physical-marketing tenant authority fails closed before storage or provider work", () => {
  assert.equal(physical.resolvePhysicalBusinessUid({uid: "business-a", role: "business"}),
    "business-a");
  assert.throws(() => physical.resolvePhysicalBusinessUid(null), /physical_actor_forbidden/);
  assert.throws(() => physical.resolvePhysicalBusinessUid({uid: "scaler-a", role: "scaler"}),
    /physical_actor_forbidden/);
  assert.throws(() => physical.resolvePhysicalBusinessUid(
    {uid: "business-a", role: "business"}, "business-b"), /physical_cross_tenant_forbidden/);
  assert.equal(physical.resolvePhysicalBusinessUid({uid: "admin-a", role: "admin"}, "business-b"),
    "business-b");
  assert.throws(() => physical.resolvePhysicalBusinessUid({uid: "admin-a", role: "admin"}),
    /physical_business_required/);
});

test("fulfillment pricing is server-authoritative, versioned, and applies the approved minimum", () => {
  assert.deepEqual(physical.calculateFulfillmentQuote({providerSubtotal: 2000, shipping: 500,
    postage: 0, tax: 200, paymentProcessingExpense: 120}), {
    pricingPolicyVersion: "PhysicalFulfillmentPricingV1", currency: "USD", providerSubtotal: 2000,
    shipping: 500, postage: 0, tax: 200, paymentProcessingExpense: 120, feeBase: 2500,
    fulfillmentFee: 499, customerTotal: 3199, scaledCircleFulfillmentRevenue: 499,
  });
  assert.equal(physical.calculateFulfillmentQuote({providerSubtotal: 10000, shipping: 1000,
    postage: 1000, tax: 800}).fulfillmentFee, 1200);
  assert.throws(() => physical.calculateFulfillmentQuote({providerSubtotal: 100}, {...physical.PRICING_POLICY,
    fulfillmentFeeRateBps: "1000"}), /physical_pricing_policy_invalid/);
});

test("placeholder and unsupported-claim policies fail closed without blocking canonical contractor copy", () => {
  for (const value of ["(555) 010-2000", "hello@example.com", "Lorem ipsum", "Test Business",
    "Sample Company", "Dummy CTA", "fixture service copy"]) assert.equal(physical.containsPlaceholder(value), true);
  assert.equal(physical.containsPlaceholder("Attractive Remodel"), false);
  for (const value of ["#1 deck builder", "Guaranteed results", "Award-winning work",
    "Free estimates", "Licensed and insured", "20% off"]) {
    assert.equal(physical.containsUnsupportedClaim(value), true);
  }
  assert.equal(physical.containsUnsupportedClaim("Explore deck options for your property"), false);
});

test("authorized copy, media, contact, service, and offer checks use canonical Business authority", () => {
  assert.equal(physical.validateAuthorizedDraft(draft(), authority()).businessName,
    "Attractive Remodel");
  assert.doesNotThrow(() => physical.validateAuthorizedDraft(draft({media: null,
    templateId: "door_hanger_professional_services_v1"}), authority()));
  assert.throws(() => physical.validateAuthorizedDraft(draft({service: "Roofing"}), authority()),
    /physical_service_not_authorized/);
  assert.throws(() => physical.validateAuthorizedDraft(draft({headline: "Test Business offer"}), authority()),
    /physical_placeholder_blocked/);
  assert.throws(() => physical.validateAuthorizedDraft(draft({headline: "Guaranteed deck results"}), authority()),
    /physical_unsupported_claim/);
  assert.throws(() => physical.validateAuthorizedDraft(draft({includeBusinessPhone: true}), authority()),
    /physical_verified_phone_missing/);
  const offer = "Plan your deck project with Attractive Remodel";
  assert.throws(() => physical.validateAuthorizedDraft(draft({templateId: "door_hanger_offer_action_v1",
    offer}), authority()), /physical_offer_not_authorized/);
  assert.doesNotThrow(() => physical.validateAuthorizedDraft(draft({templateId: "door_hanger_offer_action_v1",
    offer}), authority({authorizedOffer: offer})));
});

test("template behavior is versioned and copy assistance remains bounded and claim-safe", () => {
  assert.deepEqual(physical.publicTemplateSpecs().map((item) => item.templateId), [
    "door_hanger_service_hero_v1", "door_hanger_offer_action_v1",
    "door_hanger_professional_services_v1",
  ]);
  for (const item of physical.publicTemplateSpecs()) {
    assert.equal(item.version, 1); assert.equal(item.schemaVersion, "PhysicalMarketingTemplateV1");
  }
  const suggestion = physical.suggestedCopy("Build decks");
  assert.equal(suggestion.headline, "Build the deck your home deserves");
  assert.match(suggestion.supportingText, /professional deck options/i);
  assert.doesNotMatch(Object.values(suggestion).join(" "), /build decks project/i);
  assert.equal(physical.containsUnsupportedClaim(Object.values(suggestion).join(" ")), false);
  assert.equal(physical.readableColor("#176FD1").ratio >= 4.5, true);
});

test("door-hanger renderer creates deterministic PDF/X-4 evidence, CMYK intent, embedded fonts, and vector QR", async () => {
  const snapshot = version(); const rendered = await physical.renderPrintMaster({version: snapshot,
    trackedUrl: snapshot.trackedUrl, mediaBuffer: await serviceImage()});
  assert.match(rendered.pdf.subarray(0, 16).toString("latin1"), /^%PDF-1\.7/);
  assert.match(rendered.pdf.toString("latin1"), /PDF\/X-4/);
  assert.equal(rendered.evidence.outputIntent, "CMYK");
  assert.equal(rendered.evidence.fontsEmbedded, true); assert.equal(rendered.evidence.sideCount, 2);
  assert.equal(rendered.proofs.length, 2);
  for (const proof of rendered.proofs) {
    const metadata = await sharp(proof.webp).metadata();
    assert.equal(metadata.format, "webp"); assert.ok(metadata.width > 500); assert.ok(metadata.height > 1000);
  }
  const report = physical.preflightReport({version: snapshot, renderEvidence: rendered.evidence,
    artifactHash: physical.digest(rendered.pdf)});
  assert.equal(report.status, "pass"); assert.equal(report.checks.qrQuietZone, true);
  assert.equal(report.checks.dieCutExclusion, true); assert.equal(report.checks.embeddedFonts, true);
  const marketing = physical.marketingReadinessReport({version: snapshot,
    renderEvidence: rendered.evidence});
  assert.equal(marketing.status, "pass"); assert.deepEqual(marketing.failures, []);
  assert.equal(rendered.evidence.marketingLayout.frontBackDifferentiated, true);
  assert.ok(rendered.evidence.marketingLayout.qrBreathingRoomPoints >= 16);
});

test("QR decodes from the rendered door-hanger proof at physical output size", async () => {
  const trackedUrl = "https://scaledcircle.com/r?code=door-hanger-proof";
  const snapshot = version({trackedUrl});
  const rendered = await physical.renderPrintMaster({
    version: snapshot, trackedUrl, mediaBuffer: await serviceImage(),
  });
  const {data, info} = await sharp(rendered.proofs[1].webp)
    .ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "dontInvert",
  });
  assert.equal(decoded?.data, trackedUrl);
  assert.ok(rendered.evidence.sideEvidence[0].qr.physicalInches >= 0.75);
  assert.ok(rendered.evidence.sideEvidence[0].qr.quietModules >= 4);
});

test("low-resolution placed media fails rather than changing DPI metadata", async () => {
  const tiny = await sharp({create: {width: 40, height: 40, channels: 3, background: "#336699"}})
    .jpeg().toBuffer();
  await assert.rejects(physical.renderPrintMaster({version: version(),
    trackedUrl: "https://scaledcircle.test/r?code=ABCDEFGHJKMNPQRSTUVWXY234",
  mediaBuffer: tiny}), /physical_media_resolution_low/);
});

test("print readiness and marketing readiness remain independent and ORDER_READY requires both", async () => {
  const snapshot = version({brandSnapshot: authority({businessName: "Test Business"})});
  const rendered = await physical.renderPrintMaster({version: snapshot,
    trackedUrl: snapshot.trackedUrl, mediaBuffer: await serviceImage()});
  const print = physical.preflightReport({version: snapshot, renderEvidence: rendered.evidence,
    artifactHash: physical.digest(rendered.pdf)});
  const marketing = physical.marketingReadinessReport({version: snapshot,
    renderEvidence: rendered.evidence});
  assert.equal(print.status, "pass"); assert.equal(marketing.status, "fail");
  assert.ok(marketing.failures.includes("placeholderFree"));
  assert.equal(physical.versionOrderReady({preflightStatus: "pass", printReadinessStatus: "pass",
    marketingReadinessStatus: "fail"}), false);
  assert.equal(physical.versionOrderReady({preflightStatus: "pass", printReadinessStatus: "pass",
    marketingReadinessStatus: "pass"}), true);
});

test("professional-services template gracefully rebalances without media while media templates fail closed", async () => {
  const noMedia = draft({media: null, templateId: "door_hanger_professional_services_v1",
    headline: "Thoughtful improvements for your outdoor space"});
  const snapshot = version({content: noMedia, mediaSnapshot: null});
  const rendered = await physical.renderPrintMaster({version: snapshot, trackedUrl: snapshot.trackedUrl});
  assert.equal(physical.marketingReadinessReport({version: snapshot,
    renderEvidence: rendered.evidence}).status, "pass");
  assert.throws(() => physical.validateAuthorizedDraft(draft({media: null}), authority()),
    /physical_template_media_required/);
});

test("approved generated concepts retain a visible conceptual-origin disclosure in print and proof layouts", async () => {
  const snapshot = version({mediaSnapshot: {assetId: "asset-generated",
    revisionId: "revision-generated", contentHash: "c".repeat(64),
    origin: "generated_service_concept", approvalStatus: "approved", customerSelected: true}});
  const rendered = await physical.renderPrintMaster({version: snapshot,
    trackedUrl: snapshot.trackedUrl, mediaBuffer: await serviceImage()});
  assert.equal(rendered.evidence.marketingLayout.conceptualDisclosurePresent, true);
  const marketing = physical.marketingReadinessReport({version: snapshot,
    renderEvidence: rendered.evidence});
  assert.equal(marketing.status, "pass");
  assert.equal(marketing.checks.generatedOriginDisclosure, true);
});

test("low-fidelity renderer fixtures cannot become customer MARKETING_READY unless explicitly approved and selected", async () => {
  const fixture = version({mediaSnapshot: {assetId: "asset-fixture", revisionId: "revision-fixture",
    contentHash: "d".repeat(64), origin: "renderer_fixture", testFixture: true}});
  const rendered = await physical.renderPrintMaster({version: fixture,
    trackedUrl: fixture.trackedUrl, mediaBuffer: await serviceImage()});
  const blocked = physical.marketingReadinessReport({version: fixture,
    renderEvidence: rendered.evidence});
  assert.equal(blocked.status, "fail");
  assert.ok(blocked.failures.includes("customerVisibleMediaEligible"));
  const selected = {...fixture, mediaSnapshot: {...fixture.mediaSnapshot,
    customerSelected: true, approvalStatus: "approved"}};
  assert.equal(physical.marketingReadinessReport({version: selected,
    renderEvidence: rendered.evidence}).checks.customerVisibleMediaEligible, true);
});

test("long canonical Business copy and wide or tall approved logos remain bounded", async () => {
  const snapshot = version({brandSnapshot: authority({
    businessName: "Attractive Remodel and Outdoor Improvement Services",
  }), content: draft({headline: "Plan a thoughtful deck improvement for your outdoor space"})});
  const wideLogo = await sharp({create: {width: 1600, height: 300, channels: 3,
    background: "#ffffff"}}).png().toBuffer();
  const tallLogo = await sharp({create: {width: 300, height: 1200, channels: 3,
    background: "#176fd1"}}).png().toBuffer();
  for (const logoBuffer of [wideLogo, tallLogo]) {
    const rendered = await physical.renderPrintMaster({version: snapshot,
      trackedUrl: snapshot.trackedUrl, mediaBuffer: await serviceImage(), logoBuffer});
    assert.equal(rendered.proofs.length, 2);
    assert.equal(physical.preflightReport({version: snapshot, renderEvidence: rendered.evidence,
      artifactHash: physical.digest(rendered.pdf)}).status, "pass");
  }
});

test("mock provider quote and order contracts are replay-idempotent without provider traffic", async () => {
  const provider = providers.createMockPrintProvider({now: () => 1000});
  const quote = await provider.quote({productSpecId: "door_hanger_3_5x8_5", quantity: 250, zip: "21401"});
  const replayQuote = await provider.quote({productSpecId: "door_hanger_3_5x8_5", quantity: 250, zip: "21401"});
  assert.deepEqual(replayQuote, quote);
  const first = await provider.createOrder({idempotencyKey: "order-one", quote});
  const replay = await provider.createOrder({idempotencyKey: "order-one", quote});
  assert.deepEqual(replay, first); assert.equal(first.status, "submitted");
  assert.throws(() => providers.assertProvider({id: "bad", environment: "mock"}),
    /physical_provider_method_missing/);
});
