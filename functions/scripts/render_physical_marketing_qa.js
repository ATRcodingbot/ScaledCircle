"use strict";

const fs = require("node:fs");
const path = require("node:path");
const jsQR = require("jsqr");
const sharp = require("sharp");
const physical = require("../physical_marketing");

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const output = path.join(root, "output", "pdf");
  const evidenceRoot = path.join(root, "tmp", "pdfs", "physical-marketing-door-hanger-v1");
  fs.mkdirSync(output, {recursive: true});
  fs.mkdirSync(evidenceRoot, {recursive: true});
  const trackedUrl = "https://scaledcircle.com/r?code=QA-DOOR-HANGER-V1";
  const content = physical.normalizeDraft({
    productSpecId: "door_hanger_3_5x8_5",
    sideCount: 2,
    campaignId: "qa-campaign",
    service: "Seasonal cleanup",
    headline: "Refresh your outdoor space",
    offer: "A clean, professional next step for your property.",
    cta: "Plan your next project",
    phone: "(555) 010-2000",
    landingPageId: "qa-landing-page",
    primaryColor: "#176FD1",
    secondaryColor: "#10243E",
  });
  const rendered = await physical.renderPrintMaster({
    version: {productSpecId: content.productSpecId, content},
    trackedUrl,
  });
  const pdfPath = path.join(output, "physical-marketing-door-hanger-v1.pdf");
  fs.writeFileSync(pdfPath, rendered.pdf);
  for (const proof of rendered.proofs) {
    fs.writeFileSync(path.join(evidenceRoot, `proof-side-${proof.side}.webp`), proof.webp);
    fs.writeFileSync(path.join(evidenceRoot, `proof-side-${proof.side}.jpg`), proof.jpg);
  }
  const {data, info} = await sharp(rendered.proofs[1].webp)
    .ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "dontInvert",
  });
  if (decoded?.data !== trackedUrl) throw new Error("rendered_qr_scan_failed");
  const artifactHash = physical.digest(rendered.pdf);
  const preflight = physical.preflightReport({
    version: {productSpecId: content.productSpecId, content},
    renderEvidence: rendered.evidence,
    artifactHash,
  });
  if (preflight.status !== "pass") throw new Error("print_preflight_failed");
  const evidence = {
    generatedAt: new Date().toISOString(),
    providerTraffic: 0,
    productSpecId: content.productSpecId,
    artifactHash,
    bytes: rendered.pdf.length,
    qrDecodedFromRenderedProof: true,
    qrDestination: trackedUrl,
    renderEvidence: rendered.evidence,
    preflight,
  };
  fs.writeFileSync(path.join(evidenceRoot, "evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({pdfPath, evidenceRoot, artifactHash,
    qrDecoded: true, preflight: preflight.status})}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
