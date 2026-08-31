"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const sharp = require("sharp");
const QRCode = require("qrcode");
const fontkit = require("@pdf-lib/fontkit");
const {
  PDFDocument, PDFName, PDFString, PDFDict, PDFNumber, cmyk,
} = require("pdf-lib");

const SCHEMA_VERSION = "PhysicalMarketingExecutionV1";
const PRICING_POLICY_VERSION = "PhysicalFulfillmentPricingV1";
const MAX_WORKSPACE_ITEMS = 50;
const MAX_ADMIN_ITEMS = 100;
const MIN_EFFECTIVE_DPI = 300;
const PDF_X_VERSION = "PDF/X-4";
const FONT_REGULAR = require.resolve("@fontsource/roboto/files/roboto-latin-400-normal.woff");
const FONT_BOLD = require.resolve("@fontsource/roboto/files/roboto-latin-700-normal.woff");

const PRODUCT_SPECS = Object.freeze({
  door_hanger_3_5x8_5: Object.freeze({
    productType: "door_hanger", label: "Door hanger", widthInches: 3.5, heightInches: 8.5,
    bleedInches: 0.0625, safeInches: 0.125, sides: [1, 2], defaultSides: 2,
    quantities: [100, 250, 500, 1000, 2500], colorProfile: "CMYK",
    stockTarget: "14pt coated", finishTarget: "professional_gloss_or_aqueous",
    dieCut: {kind: "standard_circular_hole", diameterInches: 1.1875,
      centerXInches: 1.75, centerFromTopInches: 0.75, exclusionPaddingInches: 0.125},
  }),
  postcard_4x6: Object.freeze({
    productType: "postcard", label: "Postcard 4 × 6", widthInches: 6, heightInches: 4,
    bleedInches: 0.125, safeInches: 0.125, sides: [2], defaultSides: 2,
    quantities: [50, 100, 250, 500, 1000, 2500], colorProfile: "CMYK",
  }),
  postcard_6x9: Object.freeze({
    productType: "postcard", label: "Postcard 6 × 9", widthInches: 9, heightInches: 6,
    bleedInches: 0.125, safeInches: 0.125, sides: [2], defaultSides: 2,
    quantities: [50, 100, 250, 500, 1000, 2500], colorProfile: "CMYK",
  }),
  postcard_6x11: Object.freeze({
    productType: "postcard", label: "Postcard 6 × 11", widthInches: 11, heightInches: 6,
    bleedInches: 0.125, safeInches: 0.125, sides: [2], defaultSides: 2,
    quantities: [50, 100, 250, 500, 1000, 2500], colorProfile: "CMYK", uiHidden: true,
  }),
  flyer_letter: Object.freeze({
    productType: "flyer", label: "Flyer 8.5 × 11", widthInches: 8.5, heightInches: 11,
    bleedInches: 0.125, safeInches: 0.1875, sides: [1, 2], defaultSides: 1,
    quantities: [25, 50, 100, 250, 500, 1000], colorProfile: "CMYK",
  }),
  business_card_3_5x2: Object.freeze({
    productType: "business_card", label: "Business card 3.5 × 2", widthInches: 3.5, heightInches: 2,
    bleedInches: 0.125, safeInches: 0.125, sides: [1, 2], defaultSides: 2,
    quantities: [100, 250, 500, 1000, 2500], colorProfile: "CMYK",
  }),
});

const PRICING_POLICY = Object.freeze({
  version: PRICING_POLICY_VERSION,
  currency: "USD",
  fulfillmentFeeRateBps: 1000,
  fulfillmentFeeMinimumMinor: 499,
  feeBaseComponents: ["providerSubtotal", "shipping", "postage"],
  excludedFromFeeBase: ["tax", "paymentProcessingExpense"],
  downloadFeeMinor: 0,
  advertisingExcluded: true,
});

function text(value, maximum = 160) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, maximum);
}

function requiredText(value, maximum, code) {
  const result = text(value, maximum);
  if (!result) throw new Error(code);
  if (/[<>\u0000-\u001f]/.test(result)) throw new Error(code);
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  const encoded = typeof value === "string" ? value : JSON.stringify(stable(value));
  return crypto.createHash("sha256").update(encoded).digest("hex");
}

function productSpec(specId) {
  const id = text(specId, 80);
  const spec = PRODUCT_SPECS[id];
  if (!spec) throw new Error("physical_product_unsupported");
  return {specId: id, version: "PhysicalProductSpecV1", ...spec};
}

function publicProductSpecs() {
  return Object.entries(PRODUCT_SPECS)
    .filter(([, spec]) => !spec.uiHidden)
    .map(([specId, spec]) => ({specId, version: "PhysicalProductSpecV1", ...spec,
      dieCut: spec.dieCut || null}));
}

function validHexColor(value, fallback) {
  const normalized = text(value, 7).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function normalizeDraft(input = {}) {
  const spec = productSpec(input.productSpecId);
  const sideCount = Number(input.sideCount || spec.defaultSides);
  if (!spec.sides.includes(sideCount)) throw new Error("physical_side_count_invalid");
  const media = input.media && typeof input.media === "object" ? {
    assetId: text(input.media.assetId, 160), revisionId: text(input.media.revisionId, 160),
  } : null;
  return {
    productSpecId: spec.specId,
    sideCount,
    campaignId: requiredText(input.campaignId, 160, "physical_campaign_required"),
    service: requiredText(input.service, 80, "physical_service_required"),
    headline: requiredText(input.headline, 90, "physical_headline_required"),
    offer: text(input.offer, 180),
    cta: requiredText(input.cta || "Learn more", 50, "physical_cta_required"),
    phone: text(input.phone, 40),
    landingPageId: requiredText(input.landingPageId, 160, "physical_landing_page_required"),
    trackingPhoneAssetId: text(input.trackingPhoneAssetId, 160) || null,
    media: media?.assetId && media?.revisionId ? media : null,
    template: ["clean", "bold", "friendly"].includes(input.template) ? input.template : "clean",
    primaryColor: validHexColor(input.primaryColor, "#176FD1"),
    secondaryColor: validHexColor(input.secondaryColor, "#10243E"),
  };
}

function calculateFulfillmentQuote(input = {}, policy = PRICING_POLICY) {
  if (!policy || policy.version !== PRICING_POLICY_VERSION ||
      !Number.isInteger(policy.fulfillmentFeeRateBps) || policy.fulfillmentFeeRateBps < 0 ||
      !Number.isInteger(policy.fulfillmentFeeMinimumMinor) || policy.fulfillmentFeeMinimumMinor < 0) {
    throw new Error("physical_pricing_policy_invalid");
  }
  const money = (name) => {
    const value = Number(input[name] || 0);
    if (!Number.isInteger(value) || value < 0) throw new Error("physical_quote_money_invalid");
    return value;
  };
  const providerSubtotal = money("providerSubtotal");
  const shipping = money("shipping");
  const postage = money("postage");
  const tax = money("tax");
  const paymentProcessingExpense = money("paymentProcessingExpense");
  const feeBase = providerSubtotal + shipping + postage;
  const percentageFee = Math.round((feeBase * policy.fulfillmentFeeRateBps) / 10000);
  const fulfillmentFee = Math.max(percentageFee, policy.fulfillmentFeeMinimumMinor);
  return {
    pricingPolicyVersion: policy.version, currency: "USD", providerSubtotal, shipping, postage, tax,
    paymentProcessingExpense, feeBase, fulfillmentFee,
    customerTotal: providerSubtotal + shipping + postage + tax + fulfillmentFee,
    scaledCircleFulfillmentRevenue: fulfillmentFee,
  };
}

function hexToCmyk(hex) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const k = 1 - Math.max(...rgb);
  if (k >= 0.999) return cmyk(0, 0, 0, 1);
  return cmyk((1 - rgb[0] - k) / (1 - k), (1 - rgb[1] - k) / (1 - k),
    (1 - rgb[2] - k) / (1 - k), k);
}

function wrap(font, value, size, width) {
  const words = text(value, 1000).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function qrMatrix(url) {
  const qr = QRCode.create(url, {errorCorrectionLevel: "M"});
  return {size: qr.modules.size, get: (row, column) => qr.modules.get(row, column)};
}

function drawQr(page, matrix, x, y, size) {
  const quiet = 4;
  const cells = matrix.size + quiet * 2;
  const unit = size / cells;
  page.drawRectangle({x, y, width: size, height: size, color: cmyk(0, 0, 0, 0)});
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.get(row, column)) page.drawRectangle({
        x: x + (column + quiet) * unit,
        y: y + (matrix.size - row - 1 + quiet) * unit,
        width: unit + 0.03, height: unit + 0.03, color: cmyk(0, 0, 0, 1),
      });
    }
  }
  return {quietModules: quiet, modulePoints: unit, physicalInches: size / 72};
}

async function cmykOutputProfile() {
  const sample = await sharp({create: {width: 1, height: 1, channels: 3, background: "#ffffff"}})
    .toColourspace("cmyk").jpeg().withIccProfile("cmyk").toBuffer();
  const metadata = await sharp(sample).metadata();
  if (!metadata.icc?.length) throw new Error("physical_cmyk_profile_unavailable");
  return metadata.icc;
}

function addPdfXMetadata(pdf, profile) {
  const context = pdf.context;
  const profileStream = context.flateStream(profile, {
    N: PDFNumber.of(4), Alternate: PDFName.of("DeviceCMYK"),
  });
  const profileRef = context.register(profileStream);
  const outputIntent = context.obj({
    Type: PDFName.of("OutputIntent"), S: PDFName.of("GTS_PDFX"),
    OutputConditionIdentifier: PDFString.of("CMYK Print Profile"),
    Info: PDFString.of("ScaledCircle provider-neutral CMYK output intent"),
    RegistryName: PDFString.of("https://www.color.org"), DestOutputProfile: profileRef,
  });
  pdf.catalog.set(PDFName.of("OutputIntents"), context.obj([outputIntent]));
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" ` +
    `pdfxid:GTS_PDFXVersion="PDF/X-4"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const metadataRef = context.register(context.stream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"), Subtype: PDFName.of("XML"),
  }));
  pdf.catalog.set(PDFName.of("Metadata"), metadataRef);
  const info = context.lookup(context.trailerInfo.Info, PDFDict);
  info.set(PDFName.of("GTS_PDFXVersion"), PDFString.of(PDF_X_VERSION));
  info.set(PDFName.of("Trapped"), PDFName.of("False"));
}

function sideLayout(spec, draft, side) {
  const bleed = spec.bleedInches * 72;
  const width = (spec.widthInches + spec.bleedInches * 2) * 72;
  const height = (spec.heightInches + spec.bleedInches * 2) * 72;
  const safe = spec.safeInches * 72;
  const left = bleed + safe;
  const right = width - bleed - safe;
  const bottom = bleed + safe;
  let top = height - bleed - safe;
  if (spec.dieCut && side === 1) {
    const protectedFromTop = spec.dieCut.centerFromTopInches +
      spec.dieCut.diameterInches / 2 + spec.dieCut.exclusionPaddingInches;
    top = Math.min(top, height - bleed - protectedFromTop * 72);
  }
  return {width, height, bleed, safe, left, right, bottom, top,
    contentWidth: right - left, contentHeight: top - bottom, draft};
}

async function normalizePlacedImage(imageBuffer, placement) {
  if (!imageBuffer) return null;
  const image = sharp(imageBuffer, {failOn: "error", limitInputPixels: 40_000_000}).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("physical_media_invalid");
  const effectiveDpi = Math.min(metadata.width / placement.widthInches,
    metadata.height / placement.heightInches);
  if (effectiveDpi < MIN_EFFECTIVE_DPI) throw new Error("physical_media_resolution_low");
  const cmykJpeg = await image.toColourspace("cmyk").jpeg({quality: 92, chromaSubsampling: "4:4:4"})
    .withIccProfile("cmyk").toBuffer();
  const proof = await sharp(imageBuffer).rotate().resize({width: 1600, height: 1600, fit: "inside",
    withoutEnlargement: true}).jpeg({quality: 88}).toBuffer();
  return {cmykJpeg, proof, width: metadata.width, height: metadata.height,
    effectiveDpi: Math.floor(effectiveDpi)};
}

async function renderPrintMaster({version, trackedUrl, mediaBuffer}) {
  const spec = productSpec(version.productSpecId);
  const draft = version.content;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync(FONT_REGULAR), {subset: true});
  const bold = await pdf.embedFont(fs.readFileSync(FONT_BOLD), {subset: true});
  const fixedDate = new Date("2000-01-01T00:00:00.000Z");
  pdf.setTitle(`${spec.label} - ${draft.headline}`);
  pdf.setAuthor("ScaledCircle"); pdf.setCreator("ScaledCircle Physical Marketing Execution V1");
  pdf.setProducer("ScaledCircle"); pdf.setCreationDate(fixedDate); pdf.setModificationDate(fixedDate);
  addPdfXMetadata(pdf, await cmykOutputProfile());
  const primary = hexToCmyk(draft.primaryColor);
  const secondary = hexToCmyk(draft.secondaryColor);
  const placement = {widthInches: Math.max(1, spec.widthInches - 0.6),
    heightInches: Math.max(0.8, Math.min(3, spec.heightInches * 0.32))};
  const normalizedMedia = await normalizePlacedImage(mediaBuffer, placement);
  const embeddedImage = normalizedMedia ? await pdf.embedJpg(normalizedMedia.cmykJpeg) : null;
  const qr = qrMatrix(trackedUrl);
  const sideEvidence = [];
  const pageEvidence = [];
  for (let side = 1; side <= draft.sideCount; side += 1) {
    const layout = sideLayout(spec, draft, side);
    const protectedFromTop = spec.dieCut && side === 1 ?
      spec.dieCut.centerFromTopInches + spec.dieCut.diameterInches / 2 +
        spec.dieCut.exclusionPaddingInches : null;
    pageEvidence.push({side, widthPoints: layout.width, heightPoints: layout.height,
      bleedPoints: layout.bleed, safePoints: layout.safe, contentTopPoints: layout.top,
      dieSafeContentTopPoints: protectedFromTop == null ? null :
        layout.height - layout.bleed - protectedFromTop * 72});
    const page = pdf.addPage([layout.width, layout.height]);
    page.drawRectangle({x: 0, y: 0, width: layout.width, height: layout.height,
      color: side === 1 ? primary : cmyk(0, 0, 0, 0)});
    const ink = side === 1 ? cmyk(0, 0, 0, 0) : secondary;
    if (side === 1) {
      const titleSize = Math.max(16, Math.min(34, layout.contentWidth / 10));
      let y = layout.top;
      for (const line of wrap(bold, draft.headline, titleSize, layout.contentWidth).slice(0, 4)) {
        y -= titleSize * 1.18;
        page.drawText(line, {x: layout.left, y, size: titleSize, font: bold, color: ink});
      }
      if (draft.offer) {
        y -= 16;
        for (const line of wrap(regular, draft.offer, Math.max(10, titleSize * 0.46), layout.contentWidth)
          .slice(0, 4)) {
          page.drawText(line, {x: layout.left, y, size: Math.max(10, titleSize * 0.46), font: regular,
            color: ink});
          y -= Math.max(13, titleSize * 0.56);
        }
      }
      if (embeddedImage) {
        const boxHeight = Math.min(placement.heightInches * 72, y - layout.bottom - 44);
        if (boxHeight > 40) {
          const scale = Math.min(layout.contentWidth / embeddedImage.width, boxHeight / embeddedImage.height);
          const w = embeddedImage.width * scale; const h = embeddedImage.height * scale;
          page.drawImage(embeddedImage, {x: layout.left + (layout.contentWidth - w) / 2,
            y: layout.bottom + 34, width: w, height: h});
        }
      }
      page.drawText(draft.service, {x: layout.left, y: layout.bottom, size: 10, font: bold, color: ink});
    } else {
      const titleSize = Math.max(15, Math.min(28, layout.contentWidth / 12));
      const lines = wrap(bold, draft.cta, titleSize, layout.contentWidth).slice(0, 3);
      let y = layout.top - titleSize;
      for (const line of lines) {
        page.drawText(line, {x: layout.left, y, size: titleSize, font: bold, color: secondary});
        y -= titleSize * 1.2;
      }
      const qrSize = Math.min(1.25 * 72, layout.contentWidth * 0.5, layout.contentHeight * 0.52);
      const qrEvidence = drawQr(page, qr, layout.left, layout.bottom + 24, qrSize);
      if (draft.phone) page.drawText(draft.phone, {x: layout.left, y: layout.bottom,
        size: 9, font: regular, color: secondary});
      sideEvidence.push({side, qr: qrEvidence});
    }
    if (draft.sideCount === 1) {
      const qrSize = Math.min(0.9 * 72, layout.contentWidth * 0.3);
      const qrEvidence = drawQr(page, qr, layout.right - qrSize, layout.bottom, qrSize);
      sideEvidence.push({side, qr: qrEvidence});
    }
  }
  const pdfBytes = Buffer.from(await pdf.save({useObjectStreams: false, addDefaultPage: false}));
  const proofs = [];
  for (let side = 1; side <= draft.sideCount; side += 1) {
    proofs.push(await renderProof({spec, draft, side, trackedUrl,
      mediaProof: normalizedMedia?.proof || null}));
  }
  return {pdf: pdfBytes, proofs, digitalJpg: proofs[0].jpg,
    evidence: {pdfXVersion: PDF_X_VERSION, outputIntent: "CMYK", fontsEmbedded: true,
      sideCount: draft.sideCount, sideEvidence, pageEvidence,
      effectiveRasterDpi: normalizedMedia?.effectiveDpi || null, vectorOnly: !normalizedMedia}};
}

function xml(value) {
  return String(value || "").replace(/[&<>"']/g, (match) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[match]);
}

function svgQr(matrix, x, y, size) {
  const quiet = 4; const cells = matrix.size + quiet * 2; const unit = size / cells;
  let output = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/>`;
  for (let row = 0; row < matrix.size; row += 1) for (let column = 0; column < matrix.size; column += 1) {
    if (matrix.get(row, column)) output += `<rect x="${x + (column + quiet) * unit}" ` +
      `y="${y + (row + quiet) * unit}" width="${unit + 0.2}" height="${unit + 0.2}" fill="#000"/>`;
  }
  return output;
}

async function renderProof({spec, draft, side, trackedUrl, mediaProof}) {
  const dpi = 150;
  const width = Math.round((spec.widthInches + spec.bleedInches * 2) * dpi);
  const height = Math.round((spec.heightInches + spec.bleedInches * 2) * dpi);
  const bleed = spec.bleedInches * dpi; const safe = spec.safeInches * dpi;
  const left = bleed + safe; const right = width - bleed - safe;
  const primary = draft.primaryColor; const secondary = draft.secondaryColor;
  let top = bleed + safe;
  if (spec.dieCut && side === 1) top = bleed + (spec.dieCut.centerFromTopInches +
    spec.dieCut.diameterInches / 2 + spec.dieCut.exclusionPaddingInches) * dpi;
  const image = mediaProof ? `data:image/jpeg;base64,${mediaProof.toString("base64")}` : null;
  const qr = qrMatrix(trackedUrl); const qrSize = Math.min(190, (right - left) * 0.45);
  const front = `<rect width="100%" height="100%" fill="${primary}"/>` +
    `<text x="${left}" y="${top + 44}" fill="#fff" font-size="38" font-weight="700" ` +
    `font-family="Arial, sans-serif">${xml(draft.headline)}</text>` +
    `<text x="${left}" y="${top + 82}" fill="#fff" font-size="22" font-family="Arial, sans-serif">` +
    `${xml(draft.offer)}</text>` +
    (image ? `<image href="${image}" x="${left}" y="${top + 110}" width="${right-left}" ` +
      `height="${Math.max(120, height-top-190)}" preserveAspectRatio="xMidYMid slice"/>` : "") +
    `<text x="${left}" y="${height-bleed-safe}" fill="#fff" font-size="18" font-weight="700" ` +
    `font-family="Arial, sans-serif">${xml(draft.service)}</text>`;
  const back = `<rect width="100%" height="100%" fill="#fff"/>` +
    `<text x="${left}" y="${top + 44}" fill="${secondary}" font-size="36" font-weight="700" ` +
    `font-family="Arial, sans-serif">${xml(draft.cta)}</text>` +
    svgQr(qr, left, height - bleed - safe - qrSize - 28, qrSize) +
    `<text x="${left}" y="${height-bleed-safe}" fill="${secondary}" font-size="18" ` +
    `font-family="Arial, sans-serif">${xml(draft.phone)}</text>`;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${side === 1 ? front : back}</svg>`);
  const webp = await sharp(svg).webp({quality: 88}).toBuffer();
  const jpg = await sharp(svg).jpeg({quality: 92, chromaSubsampling: "4:4:4"}).toBuffer();
  return {side, webp, jpg, width, height};
}

function preflightReport({version, renderEvidence, artifactHash}) {
  const spec = productSpec(version.productSpecId);
  const expectedWidthPoints = (spec.widthInches + spec.bleedInches * 2) * 72;
  const expectedHeightPoints = (spec.heightInches + spec.bleedInches * 2) * 72;
  const expectedBleedPoints = spec.bleedInches * 72;
  const expectedSafePoints = spec.safeInches * 72;
  const pages = Array.isArray(renderEvidence.pageEvidence) ? renderEvidence.pageEvidence : [];
  const front = pages.find((item) => item.side === 1);
  const checks = {
    exactTrim: pages.length === version.content.sideCount && pages.every((page) =>
      Math.abs(page.widthPoints - expectedWidthPoints) < 0.01 &&
      Math.abs(page.heightPoints - expectedHeightPoints) < 0.01),
    bleed: pages.length > 0 && pages.every((page) =>
      Math.abs(page.bleedPoints - expectedBleedPoints) < 0.01),
    safeArea: pages.length > 0 && pages.every((page) =>
      Math.abs(page.safePoints - expectedSafePoints) < 0.01),
    dieCutExclusion: spec.productType !== "door_hanger" ||
      (spec.dieCut?.kind === "standard_circular_hole" && front?.dieSafeContentTopPoints != null &&
        front.contentTopPoints <= front.dieSafeContentTopPoints + 0.01),
    pageOrder: renderEvidence.sideCount === version.content.sideCount &&
      pages.every((page, index) => page.side === index + 1),
    effectiveResolution: renderEvidence.vectorOnly || renderEvidence.effectiveRasterDpi >= MIN_EFFECTIVE_DPI,
    cmykOutputIntent: renderEvidence.outputIntent === "CMYK",
    embeddedFonts: renderEvidence.fontsEmbedded === true,
    qrQuietZone: renderEvidence.sideEvidence.every((item) => item.qr.quietModules >= 4),
    qrPhysicalSize: renderEvidence.sideEvidence.every((item) => item.qr.physicalInches >= 0.8),
    contentBounds: version.content.headline.length <= 90 && version.content.offer.length <= 180,
    artifactHash: /^[a-f0-9]{64}$/.test(artifactHash),
  };
  return {version: "PhysicalPrintPreflightV1", status: Object.values(checks).every(Boolean) ? "pass" : "fail",
    checks, printMaster: {format: "application/pdf", pdfXVersion: PDF_X_VERSION,
      widthInches: spec.widthInches, heightInches: spec.heightInches,
      bleedInches: spec.bleedInches, sideCount: version.content.sideCount},
    qr: {vector: true, scanValidation: "matrix_round_trip_required"}};
}

function resolvePhysicalBusinessUid(actor, requested) {
  if (!actor?.uid || !["business", "admin"].includes(actor.role)) {
    throw new Error("physical_actor_forbidden");
  }
  if (actor.role === "business") {
    if (requested && requested !== actor.uid) throw new Error("physical_cross_tenant_forbidden");
    return actor.uid;
  }
  return requiredText(requested, 160, "physical_business_required");
}

function createPhysicalMarketingService({db, FieldValue, bucket, createResponseAsset,
  publicBaseUrl = "https://scaledcircle.com"}) {
  if (!db || !FieldValue || !bucket || !createResponseAsset) throw new Error("physical_service_dependencies_missing");
  const materials = db.collection("marketingMaterials");
  const versions = db.collection("marketingMaterialVersions");
  const artifacts = db.collection("printReadyArtifacts");
  const approvals = db.collection("marketingMaterialApprovals");

  async function ownedCampaign(uid, campaignId) {
    const snap = await db.collection("campaigns").doc(campaignId).get();
    if (!snap.exists || snap.data()?.businessId !== uid) throw new Error("physical_campaign_forbidden");
    return {campaignId: snap.id, name: text(snap.data()?.name || snap.data()?.title || "Campaign", 120)};
  }

  async function ownedLandingPage(uid, pageId) {
    const snap = await db.collection("landingPages").doc(pageId).get();
    const data = snap.data() || {};
    if (!snap.exists || data.businessUid !== uid || data.status !== "published" || !data.publishedVersionId) {
      throw new Error("physical_landing_page_forbidden");
    }
    return {landingPageId: snap.id, landingPageVersionId: data.publishedVersionId,
      publicSlug: data.publicSlug, destination: `${publicBaseUrl}/p/${encodeURIComponent(data.publicSlug)}`};
  }

  async function ownedMedia(uid, media) {
    if (!media) return {snapshot: null, buffer: null};
    const assetRef = db.collection("businessMediaLibraries").doc(uid).collection("assets").doc(media.assetId);
    const [assetSnap, revisionSnap] = await Promise.all([
      assetRef.get(), assetRef.collection("revisions").doc(media.revisionId).get(),
    ]);
    const asset = assetSnap.data() || {}; const revision = revisionSnap.data() || {};
    if (!assetSnap.exists || !revisionSnap.exists || asset.removed === true ||
        revision.approvalStatus !== "approved" || revision.status !== "ready") {
      throw new Error("physical_media_forbidden");
    }
    const rendition = revision.renditions?.hero || revision.renditions?.card;
    if (!rendition?.storagePath) throw new Error("physical_media_unavailable");
    const [buffer] = await bucket().file(rendition.storagePath).download();
    return {snapshot: {assetId: media.assetId, revisionId: media.revisionId,
      origin: revision.origin || "business_upload", contentHash: revision.contentHash || null,
      storagePath: rendition.storagePath}, buffer};
  }

  async function workspace(input, actor) {
    const uid = resolvePhysicalBusinessUid(actor, input?.businessUid);
    const [materialQuery, campaignQuery, pageQuery, mediaQuery] = await Promise.all([
      materials.where("businessUid", "==", uid).limit(MAX_WORKSPACE_ITEMS).get(),
      db.collection("campaigns").where("businessId", "==", uid).limit(50).get(),
      db.collection("landingPages").where("businessUid", "==", uid).limit(50).get(),
      db.collection("businessMediaLibraries").doc(uid).collection("assets").limit(50).get(),
    ]);
    const materialItems = await Promise.all(materialQuery.docs.map(async (doc) => {
      const data = doc.data() || {}; const versionId = data.reviewVersionId || data.approvedVersionId;
      const versionSnap = versionId ? await versions.doc(versionId).get() : null;
      const version = versionSnap?.exists ? {versionId, ...versionSnap.data()} : null;
      const artifactSnap = version?.artifactId ? await artifacts.doc(version.artifactId).get() : null;
      const artifact = artifactSnap?.exists ? artifactSnap.data() : null;
      return {materialId: doc.id, ...data, version: version ? {...version,
        artifact: artifact ? {artifactId: artifact.artifactId, format: artifact.format,
          storagePath: artifact.storagePath, digitalJpgPath: artifact.digitalJpgPath,
          proofs: artifact.proofs, artifactHash: artifact.artifactHash,
          preflight: artifact.preflight} : null} : null};
    }));
    const media = [];
    for (const doc of mediaQuery.docs) {
      const data = doc.data() || {}; const revisionId = data.approvedRevisionId;
      if (!revisionId || data.removed === true) continue;
      const revision = await doc.ref.collection("revisions").doc(revisionId).get();
      if (revision.exists && revision.data()?.approvalStatus === "approved") media.push({
        assetId: doc.id, revisionId, title: text(data.title || "Approved image", 120),
        origin: revision.data()?.origin || "business_upload",
      });
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      materials: materialItems.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
      campaigns: campaignQuery.docs.map((doc) => ({campaignId: doc.id,
        name: text(doc.data()?.name || doc.data()?.title || "Campaign", 120)})),
      landingPages: pageQuery.docs.filter((doc) => doc.data()?.status === "published")
        .map((doc) => ({landingPageId: doc.id, title: text(doc.data()?.title || doc.data()?.publicSlug || "Landing Page", 120)})),
      approvedMedia: media,
      productSpecs: publicProductSpecs(),
      pricingPolicy: {...PRICING_POLICY},
      fulfillment: {download: "available", print: "coming_soon", mail: "coming_soon",
        localPickup: "not_integrated"},
    };
  }

  async function mutate(input, actor) {
    const uid = resolvePhysicalBusinessUid(actor, input?.businessUid);
    const action = text(input?.action, 40);
    const draft = normalizeDraft(input?.draft || {});
    await ownedCampaign(uid, draft.campaignId);
    await ownedLandingPage(uid, draft.landingPageId);
    if (draft.media) await ownedMedia(uid, draft.media);
    const now = FieldValue.serverTimestamp();
    if (action === "create") {
      const requestId = requiredText(input?.requestId, 160, "physical_request_required");
      const materialId = `material_${digest(`${uid}:${requestId}`).slice(0, 40)}`;
      const ref = materials.doc(materialId);
      let replay = false;
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists) {
          if (existing.data()?.businessUid !== uid || existing.data()?.creationRequestId !== requestId) {
            throw new Error("physical_creation_conflict");
          }
          replay = true; return;
        }
        tx.create(ref, {schemaVersion: SCHEMA_VERSION, businessUid: uid, campaignId: draft.campaignId,
          productSpecId: draft.productSpecId, status: "DRAFT", draft, draftRevision: 1,
          creationRequestId: requestId, approvedVersionId: null, reviewVersionId: null,
          createdBy: actor.uid, createdAt: now, updatedAt: now});
      });
      return {materialId, status: "DRAFT", idempotentReplay: replay};
    }
    if (action !== "save") throw new Error("physical_mutation_invalid");
    const materialId = requiredText(input?.materialId, 160, "physical_material_required");
    const ref = materials.doc(materialId);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists || current.data()?.businessUid !== uid) throw new Error("physical_material_forbidden");
      tx.update(ref, {campaignId: draft.campaignId, productSpecId: draft.productSpecId, draft,
        draftRevision: Number(current.data()?.draftRevision || 0) + 1, status: "DRAFT",
        reviewVersionId: null, updatedAt: now});
    });
    return {materialId, status: "DRAFT"};
  }

  async function prepare(input, actor) {
    const uid = resolvePhysicalBusinessUid(actor, input?.businessUid);
    const materialId = requiredText(input?.materialId, 160, "physical_material_required");
    const ref = materials.doc(materialId); const snap = await ref.get(); const material = snap.data() || {};
    if (!snap.exists || material.businessUid !== uid) throw new Error("physical_material_forbidden");
    const draft = normalizeDraft(material.draft || {}); const spec = productSpec(draft.productSpecId);
    const campaign = await ownedCampaign(uid, draft.campaignId);
    const page = await ownedLandingPage(uid, draft.landingPageId);
    const media = await ownedMedia(uid, draft.media);
    const draftHash = digest({materialId, revision: material.draftRevision, draft, page, media: media.snapshot});
    const versionId = `version_${digest(`${materialId}:${material.draftRevision}:${draftHash}`).slice(0, 40)}`;
    const existing = await versions.doc(versionId).get();
    if (existing.exists) return {materialId, versionId, artifactId: existing.data()?.artifactId,
      status: material.status, idempotentReplay: true};
    const response = await createResponseAsset({
      businessUid: uid, requestId: `physical:${versionId}`, type: "qr",
      label: `${spec.label}: ${draft.headline}`,
      destination: page.destination,
      attribution: {source: "qr", sourceDetail: "physical_marketing", campaignId: draft.campaignId,
        materialId, materialType: spec.productType, creativeVersion: versionId,
        landingPageId: page.landingPageId, landingPageVersionId: page.landingPageVersionId},
    }, actor);
    const snapshot = {schemaVersion: SCHEMA_VERSION, versionId, materialId, businessUid: uid,
      campaign, productSpecId: spec.specId, productSpecVersion: spec.version, content: draft,
      mediaSnapshot: media.snapshot, landingPage: page,
      responseAssetId: response.responseAssetId, trackedUrl: response.trackedUrl,
      trackingPhoneAssetId: draft.trackingPhoneAssetId, immutable: true};
    snapshot.contentHash = digest(snapshot);
    const rendered = await renderPrintMaster({version: snapshot, trackedUrl: response.trackedUrl,
      mediaBuffer: media.buffer});
    const artifactHash = digest(rendered.pdf);
    const artifactId = `artifact_${digest(`${versionId}:${artifactHash}`).slice(0, 40)}`;
    const base = `physical_marketing_private/${uid}/${materialId}/${versionId}`;
    const proofRecords = [];
    for (const proof of rendered.proofs) {
      const path = `${base}/proof-side-${proof.side}.webp`;
      await bucket().file(path).save(proof.webp, {resumable: false,
        metadata: {contentType: "image/webp", cacheControl: "private,no-store"}});
      proofRecords.push({side: proof.side, storagePath: path, width: proof.width, height: proof.height,
        contentHash: digest(proof.webp)});
    }
    const pdfPath = `${base}/print-master.pdf`; const jpgPath = `${base}/digital-front.jpg`;
    await Promise.all([
      bucket().file(pdfPath).save(rendered.pdf, {resumable: false,
        metadata: {contentType: "application/pdf", cacheControl: "private,no-store"}}),
      bucket().file(jpgPath).save(rendered.digitalJpg, {resumable: false,
        metadata: {contentType: "image/jpeg", cacheControl: "private,no-store"}}),
    ]);
    const preflight = preflightReport({version: snapshot, renderEvidence: rendered.evidence, artifactHash});
    if (preflight.status !== "pass") throw new Error("physical_preflight_failed");
    const at = FieldValue.serverTimestamp();
    const artifact = {schemaVersion: SCHEMA_VERSION, artifactId, businessUid: uid, materialId, versionId,
      contentHash: snapshot.contentHash, artifactHash, immutable: true, format: "PDF/X-4",
      storagePath: pdfPath, digitalJpgPath: jpgPath, proofs: proofRecords, preflight,
      providerArtifactHash: null, createdAt: at};
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref); const versionRef = versions.doc(versionId);
      const artifactRef = artifacts.doc(artifactId); const prior = await tx.get(versionRef);
      if (prior.exists) return;
      if (!current.exists || current.data()?.businessUid !== uid ||
          Number(current.data()?.draftRevision) !== Number(material.draftRevision)) {
        throw new Error("physical_draft_changed");
      }
      tx.create(artifactRef, artifact);
      tx.create(versionRef, {...snapshot, artifactId, artifactHash, preflightStatus: "pass", createdAt: at});
      tx.update(ref, {status: "READY_FOR_REVIEW", reviewVersionId: versionId,
        responseAssetId: response.responseAssetId, updatedAt: at});
    });
    return {materialId, versionId, artifactId, status: "READY_FOR_REVIEW", preflight,
      artifact: {storagePath: pdfPath, digitalJpgPath: jpgPath, proofs: proofRecords, artifactHash}};
  }

  async function approve(input, actor) {
    const uid = resolvePhysicalBusinessUid(actor, input?.businessUid);
    const materialId = requiredText(input?.materialId, 160, "physical_material_required");
    const versionId = requiredText(input?.versionId, 160, "physical_version_required");
    const ref = materials.doc(materialId); const versionRef = versions.doc(versionId);
    const approvalRef = approvals.doc(versionId); const at = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const [materialSnap, versionSnap, approvalSnap] = await Promise.all([
        tx.get(ref), tx.get(versionRef), tx.get(approvalRef),
      ]);
      if (!materialSnap.exists || !versionSnap.exists || materialSnap.data()?.businessUid !== uid ||
          versionSnap.data()?.businessUid !== uid || versionSnap.data()?.materialId !== materialId ||
          materialSnap.data()?.reviewVersionId !== versionId || versionSnap.data()?.preflightStatus !== "pass") {
        throw new Error("physical_approval_forbidden");
      }
      if (!approvalSnap.exists) tx.create(approvalRef, {schemaVersion: SCHEMA_VERSION, businessUid: uid,
        materialId, versionId, artifactId: versionSnap.data()?.artifactId, decision: "approved",
        approvedBy: actor.uid, approvedAt: at, immutable: true});
      tx.update(ref, {status: "ORDER_READY", approvedVersionId: versionId,
        reviewVersionId: versionId, updatedAt: at});
    });
    return {materialId, versionId, status: "ORDER_READY", idempotent: true};
  }

  async function operations(_input, actor) {
    if (!actor?.uid || actor.role !== "admin") throw new Error("physical_admin_required");
    const [materialQuery, versionQuery, artifactQuery, approvalQuery] = await Promise.all([
      materials.limit(MAX_ADMIN_ITEMS).get(), versions.limit(MAX_ADMIN_ITEMS).get(),
      artifacts.limit(MAX_ADMIN_ITEMS).get(), approvals.limit(MAX_ADMIN_ITEMS).get(),
    ]);
    const statusCounts = {};
    for (const doc of materialQuery.docs) {
      const status = text(doc.data()?.status, 40) || "UNKNOWN";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return {schemaVersion: SCHEMA_VERSION, environment: "provider_free", materials: materialQuery.size,
      versions: versionQuery.size, artifacts: artifactQuery.size, approvals: approvalQuery.size,
      statusCounts, preflightFailures: artifactQuery.docs.filter((doc) =>
        doc.data()?.preflight?.status !== "pass").length,
      fulfillment: {download: "available", providerTraffic: 0, print: "not_connected", mail: "not_connected"},
      pricingPolicy: {version: PRICING_POLICY.version, feeRateBps: PRICING_POLICY.fulfillmentFeeRateBps,
        minimumUsd: PRICING_POLICY.fulfillmentFeeMinimumMinor / 100},
      rawRecipientDataExposed: false, rawProviderCredentialsExposed: false};
  }

  return {workspace, mutate, prepare, approve, operations};
}

module.exports = {
  SCHEMA_VERSION, PRICING_POLICY_VERSION, PRODUCT_SPECS, PRICING_POLICY, MIN_EFFECTIVE_DPI,
  PDF_X_VERSION, text, stable, digest, productSpec, publicProductSpecs, normalizeDraft,
  calculateFulfillmentQuote,
  qrMatrix, renderPrintMaster, preflightReport, resolvePhysicalBusinessUid,
  createPhysicalMarketingService,
};
