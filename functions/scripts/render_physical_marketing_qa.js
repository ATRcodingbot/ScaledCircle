"use strict";

const fs = require("node:fs");
const path = require("node:path");
const jsQR = require("jsqr");
const sharp = require("sharp");
const physical = require("../physical_marketing");

async function serviceImage() {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1500">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c7e0ee"/>
    <stop offset="1" stop-color="#edf2e4"/></linearGradient><linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
    <stop stop-color="#7b5030"/><stop offset=".5" stop-color="#ae7a49"/><stop offset="1" stop-color="#79502f"/></linearGradient></defs>
    <rect width="1800" height="1500" fill="url(#sky)"/><rect y="830" width="1800" height="670" fill="#52744b"/>
    <polygon points="120,1120 900,545 1680,1120" fill="#d8cdbd"/><rect x="245" y="870" width="1310" height="330" rx="14" fill="url(#wood)"/>
    <g stroke="#5a3a24" stroke-width="18"><line x1="310" y1="870" x2="310" y2="1300"/><line x1="1490" y1="870" x2="1490" y2="1300"/>
    <line x1="260" y1="1000" x2="1540" y2="1000"/><line x1="260" y1="1090" x2="1540" y2="1090"/></g>
    <g fill="#314c2d"><circle cx="180" cy="1090" r="105"/><circle cx="1640" cy="1090" r="120"/></g></svg>`);
  return sharp(svg).jpeg({quality: 94, chromaSubsampling: "4:4:4"}).toBuffer();
}

async function wordmark() {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="320">
    <rect width="360" height="320" fill="#fff"/><path d="M55 260L180 45l125 215h-65l-60-108-60 108z" fill="#176FD1"/>
    <path d="M145 255L180 192l35 63z" fill="#10243E"/></svg>`)).png().toBuffer();
}

function snapshot(templateId, offer) {
  const mediaRequired = templateId !== "door_hanger_professional_services_v1";
  const content = physical.normalizeDraft({productSpecId: "door_hanger_3_5x8_5", sideCount: 2,
    campaignId: "campaign-attractive-remodel", service: "Build decks",
    headline: templateId === "door_hanger_professional_services_v1" ?
      "Thoughtful improvements for your outdoor space" : "Build the deck your home deserves",
    offer: offer || "Explore professional deck options for your property.", cta: "Scan to learn more",
    landingPageId: "page-attractive-remodel", templateId,
    media: mediaRequired ? {assetId: "asset-approved-deck", revisionId: "revision-approved-deck"} : null});
  return {productSpecId: content.productSpecId, content, templateId,
    templateVersion: physical.templateSpec(templateId).version,
    brandSnapshot: {businessName: "Attractive Remodel", businessNameSource: "business_growth_profile",
      services: ["Build decks", "Fences"], primaryColor: "#176FD1", secondaryColor: "#10243E",
      phone: null, phoneSource: null, approvedLogo: {assetId: "asset-logo", revisionId: "revision-logo",
        contentHash: "b".repeat(64)}},
    mediaSnapshot: mediaRequired ? {assetId: content.media.assetId, revisionId: content.media.revisionId,
      contentHash: "a".repeat(64), origin: "business_upload"} : null,
    landingPage: {landingPageId: content.landingPageId,
      destination: "https://scaledcircle.com/attractive-remodel"},
    responseAssetId: "response-attractive-remodel",
    trackedUrl: "https://scaledcircle.com/r?code=ATTRACTIVEDECKS", immutable: true};
}

async function renderFixture({output, evidenceRoot, templateId, filename, offer}) {
  const version = snapshot(templateId, offer);
  const rendered = await physical.renderPrintMaster({version, trackedUrl: version.trackedUrl,
    mediaBuffer: version.mediaSnapshot ? await serviceImage() : null, logoBuffer: await wordmark()});
  const pdfPath = path.join(output, filename); fs.writeFileSync(pdfPath, rendered.pdf);
  const fixtureRoot = path.join(evidenceRoot, templateId); fs.mkdirSync(fixtureRoot, {recursive: true});
  for (const proof of rendered.proofs) {
    fs.writeFileSync(path.join(fixtureRoot, `proof-side-${proof.side}.webp`), proof.webp);
    fs.writeFileSync(path.join(fixtureRoot, `proof-side-${proof.side}.jpg`), proof.jpg);
  }
  const {data, info} = await sharp(rendered.proofs[1].webp).ensureAlpha().raw()
    .toBuffer({resolveWithObject: true});
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height,
    {inversionAttempts: "dontInvert"});
  if (decoded?.data !== version.trackedUrl) throw new Error(`rendered_qr_scan_failed:${templateId}`);
  const artifactHash = physical.digest(rendered.pdf);
  const preflight = physical.preflightReport({version, renderEvidence: rendered.evidence, artifactHash});
  const marketingReadiness = physical.marketingReadinessReport({version,
    renderEvidence: rendered.evidence});
  if (preflight.status !== "pass") throw new Error(`print_preflight_failed:${templateId}`);
  if (marketingReadiness.status !== "pass") {
    throw new Error(`marketing_readiness_failed:${templateId}:${marketingReadiness.failures.join(",")}`);
  }
  fs.writeFileSync(path.join(fixtureRoot, "evidence.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(), providerTraffic: 0, templateId,
    templateVersion: version.templateVersion, artifactHash, bytes: rendered.pdf.length,
    qrDecodedFromRenderedProof: true, qrDestination: version.trackedUrl,
    renderEvidence: rendered.evidence, preflight, marketingReadiness,
  }, null, 2)}\n`);
  return {templateId, pdfPath, artifactHash, qrDecoded: true,
    printReady: preflight.status, marketingReady: marketingReadiness.status};
}

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const output = path.join(root, "output", "pdf");
  const evidenceRoot = path.join(root, "tmp", "pdfs", "physical-marketing-creative-quality-v1");
  fs.mkdirSync(output, {recursive: true}); fs.mkdirSync(evidenceRoot, {recursive: true});
  const results = [];
  results.push(await renderFixture({output, evidenceRoot, templateId: "door_hanger_service_hero_v1",
    filename: "physical-marketing-door-hanger-service-hero-v1.pdf"}));
  results.push(await renderFixture({output, evidenceRoot,
    templateId: "door_hanger_professional_services_v1",
    filename: "physical-marketing-door-hanger-professional-services-v1.pdf"}));
  results.push(await renderFixture({output, evidenceRoot, templateId: "door_hanger_offer_action_v1",
    offer: "Plan your deck project with Attractive Remodel",
    filename: "physical-marketing-door-hanger-offer-action-v1.pdf"}));
  process.stdout.write(`${JSON.stringify({evidenceRoot, results})}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
