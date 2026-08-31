"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jsQR = require("jsqr");
const sharp = require("sharp");
const physical = require("./physical_marketing");
const providers = require("./physical_fulfillment_providers");

function draft(overrides = {}) {
  return physical.normalizeDraft({productSpecId: "door_hanger_3_5x8_5", sideCount: 2,
    campaignId: "campaign-a", service: "Deck construction", headline: "Build a better outdoor space",
    offer: "A clear next step for your deck or patio project.", cta: "See project options",
    phone: "(555) 010-2000", landingPageId: "page-a", ...overrides});
}

test("bounded V1 product specs include required door hanger and supported front/back profiles", () => {
  const door = physical.productSpec("door_hanger_3_5x8_5");
  assert.equal(door.widthInches, 3.5); assert.equal(door.heightInches, 8.5);
  assert.deepEqual(door.sides, [1, 2]); assert.deepEqual(door.quantities, [100, 250, 500, 1000, 2500]);
  assert.equal(door.dieCut.kind, "standard_circular_hole");
  assert.equal(Object.values(physical.PRODUCT_SPECS).filter((item) => !item.uiHidden).length, 5);
});

test("drafts are bounded and reject unsupported products, sides, and missing campaign or destination", () => {
  assert.equal(draft().headline, "Build a better outdoor space");
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

test("door-hanger renderer creates deterministic PDF/X-4 evidence, CMYK intent, embedded fonts, and vector QR", async () => {
  const version = {productSpecId: "door_hanger_3_5x8_5", content: draft()};
  const rendered = await physical.renderPrintMaster({version,
    trackedUrl: "https://scaledcircle.test/r?code=ABCDEFGHJKMNPQRSTUVWXY234"});
  assert.match(rendered.pdf.subarray(0, 16).toString("latin1"), /^%PDF-1\.7/);
  assert.match(rendered.pdf.toString("latin1"), /PDF\/X-4/);
  assert.equal(rendered.evidence.outputIntent, "CMYK");
  assert.equal(rendered.evidence.fontsEmbedded, true); assert.equal(rendered.evidence.sideCount, 2);
  assert.equal(rendered.proofs.length, 2);
  for (const proof of rendered.proofs) {
    const metadata = await sharp(proof.webp).metadata();
    assert.equal(metadata.format, "webp"); assert.ok(metadata.width > 500); assert.ok(metadata.height > 1000);
  }
  const report = physical.preflightReport({version, renderEvidence: rendered.evidence,
    artifactHash: physical.digest(rendered.pdf)});
  assert.equal(report.status, "pass"); assert.equal(report.checks.qrQuietZone, true);
  assert.equal(report.checks.dieCutExclusion, true); assert.equal(report.checks.embeddedFonts, true);
});

test("QR decodes from the rendered door-hanger proof at physical output size", async () => {
  const trackedUrl = "https://scaledcircle.com/r?code=door-hanger-proof";
  const rendered = await physical.renderPrintMaster({
    version: {productSpecId: "door_hanger_3_5x8_5", content: draft()},
    trackedUrl,
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
  await assert.rejects(physical.renderPrintMaster({version: {productSpecId: "door_hanger_3_5x8_5",
    content: draft()}, trackedUrl: "https://scaledcircle.test/r?code=ABCDEFGHJKMNPQRSTUVWXY234",
  mediaBuffer: tiny}), /physical_media_resolution_low/);
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
