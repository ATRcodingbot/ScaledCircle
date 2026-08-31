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
const TEMPLATE_SCHEMA_VERSION = "PhysicalMarketingTemplateV1";
const MARKETING_READINESS_VERSION = "PhysicalMarketingReadinessV1";
const MAX_WORKSPACE_ITEMS = 50;
const MAX_ADMIN_ITEMS = 100;
const MIN_EFFECTIVE_DPI = 300;
const PDF_X_VERSION = "PDF/X-4";
const FONT_REGULAR = require.resolve("@fontsource/roboto/files/roboto-latin-400-normal.woff");
const FONT_BOLD = require.resolve("@fontsource/roboto/files/roboto-latin-700-normal.woff");

const TEMPLATE_SPECS = Object.freeze({
  door_hanger_service_hero_v1: Object.freeze({
    templateId: "door_hanger_service_hero_v1", version: 1, label: "Service Hero",
    purpose: "Visual-first service marketing", productType: "door_hanger",
    requiresMedia: true, requiresOffer: false, mediaOptional: false,
  }),
  door_hanger_offer_action_v1: Object.freeze({
    templateId: "door_hanger_offer_action_v1", version: 1, label: "Offer / Action",
    purpose: "A Business-authorized offer with a strong next step", productType: "door_hanger",
    requiresMedia: true, requiresOffer: true, mediaOptional: false,
  }),
  door_hanger_professional_services_v1: Object.freeze({
    templateId: "door_hanger_professional_services_v1", version: 1,
    label: "Professional Services", purpose: "Business identity and bounded service context",
    productType: "door_hanger", requiresMedia: false, requiresOffer: false, mediaOptional: true,
  }),
});

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\b(?:lorem\s+ipsum|test\s+business|sample\s+company|dummy\s+cta|fixture)\b/i,
  /\b(?:example\.(?:com|org|net)|placeholder(?:@|\s|$))\b/i,
  /\b(?:555[\s)./-]*01\d\d|\(?555\)?[\s.-]*\d{3}[\s.-]*\d{4})\b/i,
  /\b(?:test|sample|dummy)\s+(?:phone|email|address|service|offer|headline)\b/i,
]);

const UNSUPPORTED_CLAIM_PATTERNS = Object.freeze([
  /(?:^|\W)#\s*1(?:\W|$)/i,
  /\b(?:best|guaranteed?|award[- ]winning|five[- ]star|5[- ]star|free estimates?|insured)\b/i,
  /\b(?:licensed|certified)\b/i,
  /\b\d+\s+years?(?:\s+of)?\s+experience\b/i,
  /\b\d+\s*%\s*off\b/i,
]);

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

function templateSpec(templateId, productType = "door_hanger") {
  if (productType !== "door_hanger") return {templateId: "physical_generic_v1", version: 1,
    label: "Professional print", purpose: "Provider-neutral print layout", productType,
    requiresMedia: false, requiresOffer: false, mediaOptional: true,
    schemaVersion: TEMPLATE_SCHEMA_VERSION};
  const id = text(templateId, 100) || "door_hanger_service_hero_v1";
  const spec = TEMPLATE_SPECS[id];
  if (!spec || spec.productType !== productType) throw new Error("physical_template_unsupported");
  return {...spec, schemaVersion: TEMPLATE_SCHEMA_VERSION};
}

function publicTemplateSpecs() {
  return Object.values(TEMPLATE_SPECS).map((item) => ({...item,
    schemaVersion: TEMPLATE_SCHEMA_VERSION}));
}

function containsPlaceholder(value) {
  const candidate = text(value, 1000);
  return Boolean(candidate && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(candidate)));
}

function containsUnsupportedClaim(value) {
  const candidate = text(value, 1000);
  return Boolean(candidate && UNSUPPORTED_CLAIM_PATTERNS.some((pattern) => pattern.test(candidate)));
}

function normalizedComparable(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function readableColor(background) {
  const hex = validHexColor(background, "#176FD1");
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const whiteRatio = 1.05 / (luminance + 0.05);
  const blackRatio = (luminance + 0.05) / 0.05;
  return whiteRatio >= blackRatio ? {hex: "#FFFFFF", ratio: whiteRatio} :
    {hex: "#111827", ratio: blackRatio};
}

function customerServiceLanguage(service) {
  const canonical = requiredText(service, 80, "physical_service_required");
  const lower = canonical.toLowerCase();
  if (/deck/.test(lower)) return {canonical, noun: "deck", project: "deck project"};
  if (/fence/.test(lower)) return {canonical, noun: "fence", project: "fence project"};
  if (/patio/.test(lower)) return {canonical, noun: "patio", project: "patio project"};
  if (/seasonal cleanup/.test(lower)) return {canonical, noun: "seasonal cleanup", project: "seasonal cleanup"};
  if (/landscap/.test(lower)) return {canonical, noun: "landscaping", project: "landscaping project"};
  const noun = lower.replace(/^build\s+/, "").replace(/^install\s+/, "")
    .replace(/\bservices\b/g, "service").replace(/\s+/g, " ").trim();
  return {canonical, noun, project: `${noun} project`};
}

function suggestedCopy(service) {
  const normalized = requiredText(service, 80, "physical_service_required");
  const lower = normalized.toLowerCase();
  const language = customerServiceLanguage(normalized);
  const headline = /deck/.test(lower) ? "Build the deck your home deserves" :
    /fence/.test(lower) ? "A better-looking boundary starts here" :
      /seasonal cleanup/.test(lower) ? "Make seasonal cleanup easier to start" :
        `Make your ${language.project} easier to start`;
  return {headline, supportingText: `Explore professional ${language.noun} options for your property.`,
    cta: "Scan to learn more"};
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
    includeBusinessPhone: input.includeBusinessPhone === true,
    landingPageId: requiredText(input.landingPageId, 160, "physical_landing_page_required"),
    trackingPhoneAssetId: text(input.trackingPhoneAssetId, 160) || null,
    media: media?.assetId && media?.revisionId ? media : null,
    templateId: templateSpec(input.templateId ||
      (input.template ? "door_hanger_service_hero_v1" : null), spec.productType).templateId,
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
  const width = Math.ceil(placement.widthInches * MIN_EFFECTIVE_DPI);
  const height = Math.ceil(placement.heightInches * MIN_EFFECTIVE_DPI);
  const cmykJpeg = await image.clone().resize({width, height, fit: "cover", position: "attention"})
    .toColourspace("cmyk").jpeg({quality: 92, chromaSubsampling: "4:4:4"})
    .withIccProfile("cmyk").toBuffer();
  const proof = await sharp(imageBuffer).rotate().resize({width, height, fit: "cover",
    position: "attention"}).jpeg({quality: 90}).toBuffer();
  return {cmykJpeg, proof, width: metadata.width, height: metadata.height,
    effectiveDpi: Math.floor(effectiveDpi)};
}

async function normalizeLogo(logoBuffer) {
  if (!logoBuffer) return null;
  const source = sharp(logoBuffer, {failOn: "error", limitInputPixels: 20_000_000}).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 180 || metadata.height < 80) {
    throw new Error("physical_logo_resolution_low");
  }
  const prepared = source.clone().resize({width: 900, height: 300, fit: "contain",
    background: "#FFFFFF", withoutEnlargement: false}).flatten({background: "#FFFFFF"});
  return {cmykJpeg: await prepared.clone().toColourspace("cmyk")
    .jpeg({quality: 94, chromaSubsampling: "4:4:4"}).withIccProfile("cmyk").toBuffer(),
  proof: await prepared.jpeg({quality: 92}).toBuffer(),
  wordmark: metadata.width / metadata.height >= 2.4};
}

function textSizeFor(font, value, width, maximum, minimum, maximumLines) {
  for (let size = maximum; size >= minimum; size -= 1) {
    if (wrap(font, value, size, width).length <= maximumLines) return size;
  }
  throw new Error("physical_copy_does_not_fit");
}

function drawWrappedText(page, font, value, options) {
  const {x, top, width, size, color, maximumLines, lineHeight = size * 1.16} = options;
  const lines = wrap(font, value, size, width);
  if (lines.length > maximumLines) throw new Error("physical_copy_does_not_fit");
  let y = top - size;
  for (const line of lines) {
    page.drawText(line, {x, y, size, font, color});
    y -= lineHeight;
  }
  return {bottom: y, lines: lines.length, minimumFontPoints: size};
}

function serviceList(snapshot, selected) {
  const result = [selected, ...(Array.isArray(snapshot?.services) ? snapshot.services : [])]
    .map((item) => text(item, 80)).filter(Boolean);
  return [...new Map(result.map((item) => [normalizedComparable(item), item])).values()].slice(0, 4);
}

function doorHangerLayoutEvidence(template, layout, draft, businessSnapshot, fontEvidence, hasMedia,
  generatedMedia) {
  return {templateId: template.templateId, templateVersion: template.version,
    minimumVisualMarginPoints: layout.safe + layout.bleed,
    ctaAssociatedWithQr: true, ctaInsideSafeArea: true, qrBreathingRoomPoints: 18,
    frontBackDifferentiated: draft.sideCount === 2,
    emptyRequiredRegions: [!businessSnapshot?.businessName && "business_identity",
      template.requiresMedia && !hasMedia && "hero_media", template.requiresOffer && !draft.offer && "offer"]
      .filter(Boolean),
    minimumFontPoints: Math.min(...fontEvidence), requiredRegionCount: template.requiresOffer ? 8 : 7,
    conceptualDisclosurePresent: generatedMedia !== true || hasMedia === true};
}

async function renderDoorHangerPrintMaster({version, trackedUrl, mediaBuffer, logoBuffer}) {
  const spec = productSpec(version.productSpecId); const draft = version.content;
  const business = version.brandSnapshot || {};
  const generatedMedia = version.mediaSnapshot?.origin === "generated_service_concept";
  const template = templateSpec(version.templateId || draft.templateId, spec.productType);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync(FONT_REGULAR), {subset: true});
  const bold = await pdf.embedFont(fs.readFileSync(FONT_BOLD), {subset: true});
  const fixedDate = new Date("2000-01-01T00:00:00.000Z");
  pdf.setTitle(`${business.businessName || "Business"} - ${spec.label} - ${draft.headline}`);
  pdf.setAuthor("ScaledCircle"); pdf.setCreator("ScaledCircle Physical Marketing Execution V1");
  pdf.setProducer("ScaledCircle"); pdf.setCreationDate(fixedDate); pdf.setModificationDate(fixedDate);
  addPdfXMetadata(pdf, await cmykOutputProfile());
  const placement = {widthInches: spec.widthInches - 0.36, heightInches: 2.7};
  const normalizedMedia = await normalizePlacedImage(mediaBuffer, placement);
  const normalizedLogo = await normalizeLogo(logoBuffer);
  const embeddedImage = normalizedMedia ? await pdf.embedJpg(normalizedMedia.cmykJpeg) : null;
  const embeddedLogo = normalizedLogo ? await pdf.embedJpg(normalizedLogo.cmykJpeg) : null;
  const primaryHex = validHexColor(business.primaryColor || draft.primaryColor, "#176FD1");
  const secondaryHex = validHexColor(business.secondaryColor || draft.secondaryColor, "#10243E");
  const primary = hexToCmyk(primaryHex); const secondary = hexToCmyk(secondaryHex);
  const primaryInk = hexToCmyk(readableColor(primaryHex).hex);
  const qr = qrMatrix(trackedUrl); const sideEvidence = []; const pageEvidence = [];
  const fontEvidence = [];
  for (let side = 1; side <= draft.sideCount; side += 1) {
    const layout = sideLayout(spec, draft, side); const page = pdf.addPage([layout.width, layout.height]);
    const protectedFromTop = spec.dieCut && side === 1 ? spec.dieCut.centerFromTopInches +
      spec.dieCut.diameterInches / 2 + spec.dieCut.exclusionPaddingInches : null;
    pageEvidence.push({side, widthPoints: layout.width, heightPoints: layout.height,
      bleedPoints: layout.bleed, safePoints: layout.safe, contentTopPoints: layout.top,
      dieSafeContentTopPoints: protectedFromTop == null ? null :
        layout.height - layout.bleed - protectedFromTop * 72});
    page.drawRectangle({x: 0, y: 0, width: layout.width, height: layout.height,
      color: side === 1 ? primary : cmyk(0, 0, 0, 0)});
    const headerHeight = 34; const headerY = layout.top - headerHeight;
    if (side === 1) {
      if (embeddedLogo) page.drawImage(embeddedLogo, {x: layout.left, y: headerY + 3,
        width: normalizedLogo.wordmark ? 156 : 58, height: 23});
      if (!normalizedLogo?.wordmark) {
        const identityX = embeddedLogo ? layout.left + 66 : layout.left;
        const identitySize = textSizeFor(bold, business.businessName, layout.right - identityX,
          13, 9, 2); fontEvidence.push(identitySize);
        drawWrappedText(page, bold, business.businessName, {x: identityX, top: layout.top - 2,
          width: layout.right - identityX, size: identitySize, color: primaryInk, maximumLines: 2});
      } else fontEvidence.push(9);
      const heroTop = headerY - 12; const headlineSize = textSizeFor(bold, draft.headline,
        layout.contentWidth, 27, 17, 3); fontEvidence.push(headlineSize);
      const headline = drawWrappedText(page, bold, draft.headline, {x: layout.left, top: heroTop,
        width: layout.contentWidth, size: headlineSize, color: primaryInk, maximumLines: 3});
      page.drawText(draft.service.toUpperCase(), {x: layout.left, y: headline.bottom - 3,
        size: 9, font: bold, color: primaryInk}); fontEvidence.push(9);
      const imageTop = headline.bottom - 22; const imageHeight = Math.min(194, imageTop - 151);
      if (embeddedImage && imageHeight >= 140) {
        const imageY = imageTop - imageHeight;
        page.drawImage(embeddedImage, {x: layout.left, y: imageY,
          width: layout.contentWidth, height: imageHeight});
        if (generatedMedia) {
          page.drawRectangle({x: layout.left, y: imageY, width: layout.contentWidth,
            height: 17, color: cmyk(0, 0, 0, 0)});
          page.drawText("CONCEPTUAL SERVICE VISUAL — NOT COMPLETED WORK", {x: layout.left + 6,
            y: imageY + 5, size: 7.5, font: bold, color: secondary}); fontEvidence.push(7.5);
        }
      }
      if (!embeddedImage && template.templateId === "door_hanger_professional_services_v1") {
        const services = serviceList(business, draft.service).slice(0, 3);
        const panelHeight = Math.min(194, Math.max(148, imageHeight));
        const panelY = imageTop - panelHeight;
        page.drawRectangle({x: layout.left, y: panelY, width: layout.contentWidth,
          height: panelHeight, color: cmyk(0.035, 0.018, 0, 0)});
        page.drawText("SERVICES FOR YOUR PROPERTY", {x: layout.left + 12,
          y: panelY + panelHeight - 20, size: 7.5, font: bold, color: secondary});
        fontEvidence.push(7.5);
        const cardHeight = Math.min(74, (panelHeight - 42) / Math.max(services.length, 1) - 6);
        let cardY = panelY + panelHeight - 36 - cardHeight;
        for (const item of services) {
          page.drawRectangle({x: layout.left + 12, y: cardY, width: layout.contentWidth - 24,
            height: cardHeight, color: cmyk(0, 0, 0, 0)});
          page.drawRectangle({x: layout.left + 12, y: cardY, width: 5,
            height: cardHeight, color: primary});
          page.drawText(item, {x: layout.left + 27, y: cardY + cardHeight / 2 - 4,
            size: 11, font: bold, color: secondary});
          cardY -= cardHeight + 7; fontEvidence.push(11);
        }
      }
      const bandHeight = 92; const bandY = layout.bottom + 12;
      page.drawRectangle({x: layout.left, y: bandY, width: layout.contentWidth,
        height: bandHeight, color: cmyk(0, 0, 0, 0.08)});
      const supporting = draft.offer || `Professional ${draft.service.toLowerCase()} options for your property.`;
      const supportSize = textSizeFor(regular, supporting, layout.contentWidth - 24, 11, 9, 3);
      fontEvidence.push(supportSize);
      drawWrappedText(page, regular, supporting, {x: layout.left + 12, top: bandY + bandHeight - 10,
        width: layout.contentWidth - 24, size: supportSize, color: secondary, maximumLines: 3});
      page.drawText(draft.cta.toUpperCase(), {x: layout.left + 12, y: bandY + 13,
        size: 10, font: bold, color: secondary}); fontEvidence.push(10);
    } else {
      page.drawRectangle({x: 0, y: layout.top - 54, width: layout.width, height: 54,
        color: primary});
      if (embeddedLogo) page.drawImage(embeddedLogo, {x: layout.left, y: layout.top - 44,
        width: normalizedLogo.wordmark ? 152 : 58, height: 23});
      if (!normalizedLogo?.wordmark) {
        const identityX = embeddedLogo ? layout.left + 66 : layout.left;
        const identitySize = textSizeFor(bold, business.businessName, layout.right - identityX,
          13, 9, 2); fontEvidence.push(identitySize);
        drawWrappedText(page, bold, business.businessName, {x: identityX, top: layout.top - 12,
          width: layout.right - identityX, size: identitySize, color: primaryInk, maximumLines: 2});
      } else fontEvidence.push(9);
      const backHeadline = template.templateId === "door_hanger_offer_action_v1" && draft.offer ?
        draft.offer : `Ready to plan your ${draft.service.toLowerCase()} project?`;
      const backSize = textSizeFor(bold, backHeadline, layout.contentWidth, 22, 15, 3);
      fontEvidence.push(backSize);
      const backTitle = drawWrappedText(page, bold, backHeadline, {x: layout.left,
        top: layout.top - 72, width: layout.contentWidth, size: backSize,
        color: secondary, maximumLines: 3});
      let listY = backTitle.bottom - 8;
      for (const item of serviceList(business, draft.service).slice(0, 3)) {
        page.drawText(`• ${item}`, {x: layout.left, y: listY, size: 10,
          font: regular, color: secondary}); listY -= 19; fontEvidence.push(10);
      }
      const cardY = layout.bottom + 16; const cardHeight = 170;
      const middleBottom = cardY + cardHeight + 16;
      const middleTop = Math.max(middleBottom + 60, listY - 6);
      const middleHeight = middleTop - middleBottom;
      if (embeddedImage && middleHeight >= 70) {
        page.drawImage(embeddedImage, {x: layout.left, y: middleBottom,
          width: layout.contentWidth, height: middleHeight});
        if (generatedMedia) {
          page.drawRectangle({x: layout.left, y: middleBottom, width: layout.contentWidth,
            height: 17, color: cmyk(0, 0, 0, 0)});
          page.drawText("CONCEPTUAL SERVICE VISUAL — NOT COMPLETED WORK", {x: layout.left + 6,
            y: middleBottom + 5, size: 7.5, font: bold, color: secondary}); fontEvidence.push(7.5);
        }
      } else if (middleHeight >= 70) {
        page.drawRectangle({x: layout.left, y: middleBottom, width: layout.contentWidth,
          height: middleHeight, color: primary});
        page.drawText("YOUR NEXT PROJECT", {x: layout.left + 14,
          y: middleBottom + middleHeight - 30, size: 8, font: bold, color: primaryInk});
        const focusSize = textSizeFor(bold, draft.service, layout.contentWidth - 28, 24, 16, 3);
        fontEvidence.push(8, focusSize);
        drawWrappedText(page, bold, draft.service, {x: layout.left + 14,
          top: middleBottom + middleHeight - 42, width: layout.contentWidth - 28,
          size: focusSize, color: primaryInk, maximumLines: 3});
      }
      page.drawRectangle({x: layout.left, y: cardY, width: layout.contentWidth,
        height: cardHeight, color: cmyk(0.04, 0.015, 0, 0)});
      const qrSize = 84; const qrX = layout.left + 12; const qrY = cardY + 42;
      const qrEvidence = drawQr(page, qr, qrX, qrY, qrSize); sideEvidence.push({side, qr: qrEvidence});
      page.drawText("SCAN TO GET STARTED", {x: qrX, y: cardY + 22,
        size: 7.5, font: bold, color: secondary}); fontEvidence.push(7.5);
      const ctaX = qrX + qrSize + 13; const ctaWidth = layout.right - 10 - ctaX;
      const ctaSize = textSizeFor(bold, draft.cta, ctaWidth, 16, 10, 3); fontEvidence.push(ctaSize);
      const ctaText = drawWrappedText(page, bold, draft.cta, {x: ctaX,
        top: cardY + cardHeight - 18, width: ctaWidth, size: ctaSize,
        color: secondary, maximumLines: 3});
      drawWrappedText(page, regular, "Scan to learn more and choose your next step.", {x: ctaX,
        top: ctaText.bottom - 4, width: ctaWidth, size: 8.5, color: secondary, maximumLines: 4});
      if (business.phone) page.drawText(business.phone, {x: ctaX, y: cardY + 24,
        size: 8.5, font: bold, color: secondary});
    }
  }
  const pdfBytes = Buffer.from(await pdf.save({useObjectStreams: false, addDefaultPage: false}));
  const proofs = [];
  for (let side = 1; side <= draft.sideCount; side += 1) proofs.push(await renderDoorHangerProof({
    spec, draft, side, trackedUrl, mediaProof: normalizedMedia?.proof || null,
    logoProof: normalizedLogo?.proof || null, logoWordmark: normalizedLogo?.wordmark === true,
    business, template, generatedMedia,
  }));
  const layout = sideLayout(spec, draft, 1);
  return {pdf: pdfBytes, proofs, digitalJpg: proofs[0].jpg,
    evidence: {pdfXVersion: PDF_X_VERSION, outputIntent: "CMYK", fontsEmbedded: true,
      sideCount: draft.sideCount, sideEvidence, pageEvidence,
      effectiveRasterDpi: normalizedMedia?.effectiveDpi || null, vectorOnly: !normalizedMedia,
      marketingLayout: doorHangerLayoutEvidence(template, layout, draft, business,
        fontEvidence, Boolean(normalizedMedia), generatedMedia),
      colorContrastRatio: readableColor(primaryHex).ratio}};
}

async function renderPrintMaster({version, trackedUrl, mediaBuffer, logoBuffer}) {
  const spec = productSpec(version.productSpecId);
  if (spec.productType === "door_hanger") return renderDoorHangerPrintMaster({version, trackedUrl,
    mediaBuffer, logoBuffer});
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

function svgWrap(value, maximumCharacters, maximumLines) {
  const words = text(value, 1000).split(" ").filter(Boolean); const lines = []; let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maximumCharacters || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maximumLines) throw new Error("physical_copy_does_not_fit");
  return lines;
}

function svgTextBlock(value, {x, y, size, fill, weight = 400, maximumCharacters,
  maximumLines, lineHeight = size * 1.16}) {
  const lines = svgWrap(value, maximumCharacters, maximumLines);
  return {height: lines.length * lineHeight, svg: `<text x="${x}" y="${y}" fill="${fill}" ` +
    `font-size="${size}" font-weight="${weight}" font-family="Arial, sans-serif">` +
    lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">` +
      `${xml(line)}</tspan>`).join("") + `</text>`};
}

function svgAdaptiveTextBlock(value, {x, y, width, maximumSize, minimumSize,
  fill, weight = 400, maximumLines}) {
  for (let size = maximumSize; size >= minimumSize; size -= 1) {
    const maximumCharacters = Math.max(8, Math.floor(width / (size * 0.54)));
    try {
      return svgTextBlock(value, {x, y, size, fill, weight, maximumCharacters,
        maximumLines, lineHeight: size * 1.14});
    } catch (error) {
      if (error?.message !== "physical_copy_does_not_fit") throw error;
    }
  }
  throw new Error("physical_copy_does_not_fit");
}

async function renderDoorHangerProof({spec, draft, side, trackedUrl, mediaProof, logoProof,
  logoWordmark, business, template, generatedMedia}) {
  const dpi = 150; const width = Math.round((spec.widthInches + spec.bleedInches * 2) * dpi);
  const height = Math.round((spec.heightInches + spec.bleedInches * 2) * dpi);
  const bleed = spec.bleedInches * dpi; const safe = spec.safeInches * dpi;
  const left = bleed + safe; const right = width - bleed - safe; const contentWidth = right - left;
  let top = bleed + safe;
  if (spec.dieCut && side === 1) top = bleed + (spec.dieCut.centerFromTopInches +
    spec.dieCut.diameterInches / 2 + spec.dieCut.exclusionPaddingInches) * dpi;
  const primary = validHexColor(business.primaryColor || draft.primaryColor, "#176FD1");
  const secondary = validHexColor(business.secondaryColor || draft.secondaryColor, "#10243E");
  const primaryInk = readableColor(primary).hex;
  const image = mediaProof ? `data:image/jpeg;base64,${mediaProof.toString("base64")}` : null;
  const logo = logoProof ? `data:image/jpeg;base64,${logoProof.toString("base64")}` : null;
  const qr = qrMatrix(trackedUrl);
  let body = `<rect width="100%" height="100%" fill="${side === 1 ? primary : "#FFFFFF"}"/>`;
  if (side === 1) {
    if (logo) body += `<image href="${logo}" x="${left}" y="${top}" width="${logoWordmark ? 300 : 110}" height="45" ` +
      `preserveAspectRatio="xMidYMid meet"/>`;
    if (!logoWordmark) {
      const identityX = logo ? left + 123 : left;
      const identity = svgAdaptiveTextBlock(business.businessName, {x: identityX, y: top + 24,
        width: right - identityX, maximumSize: 21, minimumSize: 14,
        fill: primaryInk, weight: 700, maximumLines: 2});
      body += identity.svg;
    }
    const headlineY = top + 82;
    const headline = svgAdaptiveTextBlock(draft.headline, {x: left, y: headlineY,
      width: contentWidth, maximumSize: 41, minimumSize: 26,
      fill: primaryInk, weight: 700, maximumLines: 3});
    body += headline.svg;
    const serviceY = headlineY + headline.height + 14;
    body += `<text x="${left}" y="${serviceY}" fill="${primaryInk}" font-size="16" ` +
      `font-weight="700" letter-spacing="1.5" font-family="Arial, sans-serif">` +
      `${xml(draft.service.toUpperCase())}</text>`;
    const imageY = serviceY + 25; const cardY = height - bleed - safe - 150;
    const imageHeight = Math.max(210, cardY - imageY - 22);
    if (image) {
      body += `<image href="${image}" x="${left}" y="${imageY}" width="${contentWidth}" ` +
        `height="${imageHeight}" preserveAspectRatio="xMidYMid slice"/>`;
      if (generatedMedia) body += `<rect x="${left}" y="${imageY + imageHeight - 27}" ` +
        `width="${contentWidth}" height="27" fill="#FFFFFF"/><text x="${left + 9}" ` +
        `y="${imageY + imageHeight - 9}" fill="${secondary}" font-size="10" font-weight="700" ` +
        `font-family="Arial,sans-serif">CONCEPTUAL SERVICE VISUAL — NOT COMPLETED WORK</text>`;
    }
    if (!image && template.templateId === "door_hanger_professional_services_v1") {
      body += `<rect x="${left}" y="${imageY}" width="${contentWidth}" height="${imageHeight}" ` +
        `fill="#F1F5F9"/>`;
      body += `<text x="${left + 22}" y="${imageY + 38}" fill="${secondary}" font-size="14" ` +
        `font-weight="700" letter-spacing="1" font-family="Arial, sans-serif">SERVICES FOR YOUR PROPERTY</text>`;
      let listY = imageY + 62;
      const services = serviceList(business, draft.service).slice(0, 3);
      const itemHeight = Math.min(180, Math.max(82,
        (imageHeight - 105 - (services.length - 1) * 16) / Math.max(services.length, 1)));
      for (const item of services) {
        body += `<rect x="${left + 20}" y="${listY}" width="${contentWidth - 40}" height="${itemHeight}" ` +
          `rx="8" fill="#FFFFFF"/><rect x="${left + 20}" y="${listY}" width="9" height="${itemHeight}" ` +
          `rx="4" fill="${primary}"/><text x="${left + 48}" y="${listY + itemHeight / 2 + 8}" ` +
          `fill="${secondary}" font-size="25" font-weight="700" font-family="Arial, sans-serif">${xml(item)}</text>`;
        listY += itemHeight + 16;
      }
    }
    body += `<rect x="${left}" y="${cardY}" width="${contentWidth}" height="138" ` +
      `rx="8" fill="#FFFFFF" fill-opacity="0.94"/>`;
    const supporting = draft.offer || `Professional ${draft.service.toLowerCase()} options for your property.`;
    const support = svgTextBlock(supporting, {x: left + 20, y: cardY + 36, size: 20,
      fill: secondary, maximumCharacters: 36, maximumLines: 3, lineHeight: 25}); body += support.svg;
    body += `<text x="${left + 20}" y="${cardY + 118}" fill="${secondary}" font-size="17" ` +
      `font-weight="700" letter-spacing="1" font-family="Arial, sans-serif">${xml(draft.cta.toUpperCase())}</text>`;
  } else {
    body += `<rect x="0" y="${top}" width="${width}" height="82" fill="${primary}"/>`;
    if (logo) body += `<image href="${logo}" x="${left}" y="${top + 14}" width="${logoWordmark ? 290 : 105}" height="45" ` +
      `preserveAspectRatio="xMidYMid meet"/>`;
    if (!logoWordmark) {
      const identityX = logo ? left + 118 : left;
      body += svgAdaptiveTextBlock(business.businessName, {x: identityX, y: top + 40,
        width: right - identityX, maximumSize: 20, minimumSize: 14,
        fill: primaryInk, weight: 700, maximumLines: 2}).svg;
    }
    const backHeadline = template.templateId === "door_hanger_offer_action_v1" && draft.offer ?
      draft.offer : `Ready to plan your ${draft.service.toLowerCase()} project?`;
    const heading = svgAdaptiveTextBlock(backHeadline, {x: left, y: top + 135,
      width: contentWidth, maximumSize: 34, minimumSize: 23,
      fill: secondary, weight: 700, maximumLines: 3});
    body += heading.svg; let listY = top + 147 + heading.height;
    for (const item of serviceList(business, draft.service).slice(0, 3)) {
      body += `<text x="${left}" y="${listY}" fill="${secondary}" font-size="19" ` +
        `font-family="Arial, sans-serif">• ${xml(item)}</text>`; listY += 32;
    }
    const cardY = height - bleed - safe - 275;
    const middleY = listY + 16; const middleHeight = cardY - middleY - 20;
    if (image && middleHeight >= 140) {
      body += `<image href="${image}" x="${left}" y="${middleY}" width="${contentWidth}" ` +
        `height="${middleHeight}" preserveAspectRatio="xMidYMid slice"/>`;
      if (generatedMedia) body += `<rect x="${left}" y="${middleY + middleHeight - 27}" ` +
        `width="${contentWidth}" height="27" fill="#FFFFFF"/><text x="${left + 9}" ` +
        `y="${middleY + middleHeight - 9}" fill="${secondary}" font-size="10" font-weight="700" ` +
        `font-family="Arial,sans-serif">CONCEPTUAL SERVICE VISUAL — NOT COMPLETED WORK</text>`;
    } else if (middleHeight >= 140) {
      body += `<rect x="${left}" y="${middleY}" width="${contentWidth}" height="${middleHeight}" ` +
        `rx="10" fill="${primary}"/><text x="${left + 24}" y="${middleY + 45}" fill="${primaryInk}" ` +
        `font-size="14" font-weight="700" letter-spacing="1.2" font-family="Arial,sans-serif">YOUR NEXT PROJECT</text>`;
      body += svgAdaptiveTextBlock(draft.service, {x: left + 24, y: middleY + 105,
        width: contentWidth - 48, maximumSize: 38, minimumSize: 24,
        fill: primaryInk, weight: 700, maximumLines: 3}).svg;
    }
    body += `<rect x="${left}" y="${cardY}" width="${contentWidth}" height="255" rx="10" ` +
      `fill="#F1F5F9"/>`;
    const qrSize = 145; const qrX = left + 18; const qrY = cardY + 58;
    body += svgQr(qr, qrX, qrY, qrSize);
    body += `<text x="${qrX}" y="${cardY + 225}" fill="${secondary}" font-size="12" ` +
      `font-weight="700" font-family="Arial, sans-serif">SCAN TO GET STARTED</text>`;
    const ctaX = qrX + qrSize + 20; const ctaWidth = right - ctaX - 12;
    body += svgAdaptiveTextBlock(draft.cta, {x: ctaX, y: cardY + 62, width: ctaWidth,
      maximumSize: 25, minimumSize: 17, fill: secondary, weight: 700, maximumLines: 3}).svg;
    body += svgTextBlock("Scan to learn more and choose your next step.", {x: ctaX, y: cardY + 155,
      size: 15, fill: secondary, maximumCharacters: Math.max(12, Math.floor(ctaWidth / 8)),
      maximumLines: 4, lineHeight: 19}).svg;
    if (business.phone) body += `<text x="${ctaX}" y="${cardY + 226}" fill="${secondary}" ` +
      `font-size="15" font-weight="700" font-family="Arial, sans-serif">${xml(business.phone)}</text>`;
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" ` +
    `height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
  const webp = await sharp(svg).webp({quality: 90}).toBuffer();
  const jpg = await sharp(svg).jpeg({quality: 93, chromaSubsampling: "4:4:4"}).toBuffer();
  return {side, webp, jpg, width, height};
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

function marketingReadinessReport({version, renderEvidence}) {
  const draft = version.content || {}; const brand = version.brandSnapshot || {};
  const template = templateSpec(version.templateId || draft.templateId,
    productSpec(version.productSpecId).productType);
  const layout = renderEvidence?.marketingLayout || {};
  const authoritativeServices = Array.isArray(brand.services) ? brand.services : [];
  const exactTexts = [brand.businessName, draft.service, draft.headline, draft.offer, draft.cta,
    brand.phone, version.landingPage?.destination];
  const claims = [draft.headline, draft.offer, draft.cta];
  const media = version.mediaSnapshot || null;
  const fixtureLikeMedia = media?.testFixture === true ||
    ["deterministic_fixture", "test_fixture", "renderer_fixture"].includes(media?.origin);
  const serviceAuthorized = authoritativeServices.some((item) =>
    normalizedComparable(item) === normalizedComparable(draft.service));
  const checks = {
    canonicalBusinessIdentity: Boolean(text(brand.businessName, 160) && brand.businessNameSource),
    placeholderFree: exactTexts.filter(Boolean).every((item) => !containsPlaceholder(item)),
    serviceAuthorized,
    ctaPresent: Boolean(text(draft.cta, 50)),
    destinationPresent: Boolean(version.landingPage?.landingPageId && version.responseAssetId &&
      /^https:\/\//.test(String(version.trackedUrl || ""))),
    templateRequirements: (!template.requiresMedia || Boolean(version.mediaSnapshot)) &&
      (!template.requiresOffer || Boolean(text(draft.offer, 180))),
    immutableMediaBinding: !version.mediaSnapshot || Boolean(version.mediaSnapshot.assetId &&
      version.mediaSnapshot.revisionId && version.mediaSnapshot.contentHash),
    customerVisibleMediaEligible: !fixtureLikeMedia ||
      (media.customerSelected === true && media.approvalStatus === "approved"),
    verifiedContactOnly: !brand.phone || (draft.includeBusinessPhone === true &&
      brand.phoneSource === "business_growth_profile"),
    meaningfulRequiredRegions: Array.isArray(layout.emptyRequiredRegions) &&
      layout.emptyRequiredRegions.length === 0,
    ctaSafePlacement: layout.ctaInsideSafeArea === true,
    visualMargins: Number(layout.minimumVisualMarginPoints) >= 12 &&
      Number(layout.qrBreathingRoomPoints) >= 16,
    readableTypography: Number(layout.minimumFontPoints) >= 7.5,
    contrast: Number(renderEvidence?.colorContrastRatio) >= 4.5,
    frontBackDifferentiated: draft.sideCount !== 2 || layout.frontBackDifferentiated === true,
    generatedOriginDisclosure: version.mediaSnapshot?.origin !== "generated_service_concept" ||
      layout.conceptualDisclosurePresent === true,
    noUnsupportedClaims: claims.filter(Boolean).every((item) => !containsUnsupportedClaim(item)),
  };
  return {version: MARKETING_READINESS_VERSION,
    status: Object.values(checks).every(Boolean) ? "pass" : "fail", checks,
    template: {templateId: template.templateId, templateVersion: template.version},
    businessVisualApprovalRequired: true,
    failures: Object.entries(checks).filter(([, value]) => !value).map(([key]) => key)};
}

function validateAuthorizedDraft(draft, authority = {}) {
  const template = templateSpec(draft.templateId, productSpec(draft.productSpecId).productType);
  const exactTexts = [authority.businessName, draft.service, draft.headline, draft.offer, draft.cta,
    authority.phone, authority.destination];
  if (exactTexts.filter(Boolean).some(containsPlaceholder)) throw new Error("physical_placeholder_blocked");
  if ([draft.headline, draft.offer, draft.cta].filter(Boolean).some(containsUnsupportedClaim)) {
    throw new Error("physical_unsupported_claim");
  }
  if (!authority.businessName || !authority.businessNameSource) throw new Error("physical_business_identity_missing");
  const services = Array.isArray(authority.services) ? authority.services : [];
  if (!services.some((item) => normalizedComparable(item) === normalizedComparable(draft.service))) {
    throw new Error("physical_service_not_authorized");
  }
  if (template.requiresMedia && !draft.media) throw new Error("physical_template_media_required");
  if (template.requiresOffer && (!authority.authorizedOffer ||
      normalizedComparable(draft.offer) !== normalizedComparable(authority.authorizedOffer))) {
    throw new Error("physical_offer_not_authorized");
  }
  if (draft.includeBusinessPhone && (!authority.phone ||
      authority.phoneSource !== "business_growth_profile")) {
    throw new Error("physical_verified_phone_missing");
  }
  return {template, businessName: authority.businessName, service: draft.service};
}

function versionOrderReady(version = {}) {
  return version.preflightStatus === "pass" && version.printReadinessStatus === "pass" &&
    version.marketingReadinessStatus === "pass";
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

  async function ownedMedia(uid, media, options = {}) {
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
    if (options.requiredPurpose && revision.purpose !== options.requiredPurpose) {
      throw new Error("physical_media_purpose_invalid");
    }
    if (options.excludePurpose && revision.purpose === options.excludePurpose) {
      throw new Error("physical_media_purpose_invalid");
    }
    const rendition = revision.renditions?.hero || revision.renditions?.card;
    if (!rendition?.storagePath) throw new Error("physical_media_unavailable");
    const [buffer] = await bucket().file(rendition.storagePath).download();
    return {snapshot: {assetId: media.assetId, revisionId: media.revisionId,
      origin: revision.origin || "business_upload", contentHash: revision.contentHash || null,
      purpose: revision.purpose || "general", altText: text(revision.altText, 240) || null,
      serviceLabel: text(revision.serviceLabel, 80) || null,
      approvalStatus: "approved", customerSelected: true,
      storagePath: rendition.storagePath}, buffer};
  }

  async function businessAuthority(uid, draft = {}) {
    const [growthSnap, brandSnap, userSnap] = await Promise.all([
      db.collection("businessGrowthProfiles").doc(uid).get(),
      db.collection("businessBrandProfiles").doc(uid).get(),
      db.collection("users").doc(uid).get(),
    ]);
    const growth = growthSnap.data() || {}; const brand = brandSnap.data() || {};
    const user = userSnap.data() || {};
    const businessName = text(growth.businessName || user.businessName || user.companyName ||
      user.displayName, 120);
    const businessNameSource = growth.businessName ? "business_growth_profile" :
      user.businessName || user.companyName || user.displayName ? "business_user_profile" : null;
    const growthServices = Array.isArray(growth.servicesOffered) ? growth.servicesOffered : [];
    const brandServices = Array.isArray(brand.approvedServiceCategories) ?
      brand.approvedServiceCategories : [];
    const services = (growthServices.length ? growthServices : brandServices)
      .slice(0, 20).map((item) => text(item, 80)).filter(Boolean);
    const verifiedPhone = text(growth.primaryPhone, 40);
    const phone = draft.includeBusinessPhone === true && verifiedPhone ? verifiedPhone : null;
    const approvedLogo = brand.approvedLogo?.assetId && brand.approvedLogo?.revisionId ?
      {assetId: text(brand.approvedLogo.assetId, 160),
        revisionId: text(brand.approvedLogo.revisionId, 160)} : null;
    return {businessName, businessNameSource, services,
      serviceSource: growthServices.length ? "business_growth_profile" : "business_brand_profile",
      primaryColor: validHexColor(brand.primaryColor, "#176FD1"),
      secondaryColor: validHexColor(brand.secondaryColor, "#10243E"),
      stylePreset: text(brand.stylePreset, 30) || "clean", approvedLogo,
      phone, phoneSource: phone ? "business_growth_profile" : null,
      verifiedPhoneAvailable: Boolean(verifiedPhone),
      authorizedOffer: text(growth.directMailOffer, 180) || null,
      serviceAreas: Array.isArray(growth.serviceAreas) ? growth.serviceAreas.slice(0, 8)
        .map((item) => text(item, 100)).filter(Boolean) : []};
  }

  async function workspace(input, actor) {
    const uid = resolvePhysicalBusinessUid(actor, input?.businessUid);
    const [materialQuery, campaignQuery, pageQuery, mediaQuery, authority] = await Promise.all([
      materials.where("businessUid", "==", uid).limit(MAX_WORKSPACE_ITEMS).get(),
      db.collection("campaigns").where("businessId", "==", uid).limit(50).get(),
      db.collection("landingPages").where("businessUid", "==", uid).limit(50).get(),
      db.collection("businessMediaLibraries").doc(uid).collection("assets").limit(50).get(),
      businessAuthority(uid),
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
          preflight: artifact.preflight, printReadiness: artifact.printReadiness || artifact.preflight,
          marketingReadiness: artifact.marketingReadiness || version.marketingReadiness || null} : null} : null};
    }));
    const media = [];
    for (const doc of mediaQuery.docs) {
      const data = doc.data() || {}; const revisionId = data.approvedRevisionId;
      if (!revisionId || data.removed === true) continue;
      const revision = await doc.ref.collection("revisions").doc(revisionId).get();
      if (revision.exists && revision.data()?.approvalStatus === "approved" &&
          revision.data()?.purpose !== "logo") media.push({
        assetId: doc.id, revisionId, title: text(data.title || "Approved image", 120),
        origin: revision.data()?.origin || "business_upload",
        serviceLabel: text(revision.data()?.serviceLabel, 80) || null,
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
      businessIdentity: {businessName: authority.businessName,
        hasApprovedLogo: Boolean(authority.approvedLogo),
        primaryColor: authority.primaryColor, secondaryColor: authority.secondaryColor,
        verifiedPhoneAvailable: authority.verifiedPhoneAvailable},
      availableServices: authority.services,
      authorizedOffer: authority.authorizedOffer,
      templateSpecs: publicTemplateSpecs().map((template) => ({...template,
        available: (!template.requiresMedia || media.length > 0) &&
          (!template.requiresOffer || Boolean(authority.authorizedOffer))})),
      copySuggestions: Object.fromEntries(authority.services.map((service) =>
        [service, suggestedCopy(service)])),
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
    const page = await ownedLandingPage(uid, draft.landingPageId);
    const authority = await businessAuthority(uid, draft);
    validateAuthorizedDraft(draft, {...authority, destination: page.destination});
    if (draft.media) await ownedMedia(uid, draft.media, {excludePurpose: "logo"});
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
    const authority = await businessAuthority(uid, draft);
    validateAuthorizedDraft(draft, {...authority, destination: page.destination});
    const media = await ownedMedia(uid, draft.media, {excludePurpose: "logo"});
    const logo = authority.approvedLogo ? await ownedMedia(uid, authority.approvedLogo,
      {requiredPurpose: "logo"}) : {snapshot: null, buffer: null};
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
      templateId: templateSpec(draft.templateId, spec.productType).templateId,
      templateVersion: templateSpec(draft.templateId, spec.productType).version,
      copySnapshot: {headline: draft.headline, supportingText: draft.offer || null,
        cta: draft.cta, service: draft.service},
      brandSnapshot: {...authority, approvedLogo: logo.snapshot},
      layoutSnapshot: {templateId: draft.templateId,
        imageFit: "cover_attention", optionalRegionsRebalance: true},
      mediaSnapshot: media.snapshot, landingPage: page,
      responseAssetId: response.responseAssetId, trackedUrl: response.trackedUrl,
      trackingPhoneAssetId: draft.trackingPhoneAssetId, immutable: true};
    snapshot.contentHash = digest(snapshot);
    const rendered = await renderPrintMaster({version: snapshot, trackedUrl: response.trackedUrl,
      mediaBuffer: media.buffer, logoBuffer: logo.buffer});
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
    const marketingReadiness = marketingReadinessReport({version: snapshot,
      renderEvidence: rendered.evidence});
    const at = FieldValue.serverTimestamp();
    const artifact = {schemaVersion: SCHEMA_VERSION, artifactId, businessUid: uid, materialId, versionId,
      contentHash: snapshot.contentHash, artifactHash, immutable: true, format: "PDF/X-4",
      storagePath: pdfPath, digitalJpgPath: jpgPath, proofs: proofRecords, preflight,
      printReadiness: preflight, marketingReadiness,
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
      tx.create(versionRef, {...snapshot, artifactId, artifactHash, preflightStatus: "pass",
        printReadinessStatus: "pass", marketingReadinessStatus: marketingReadiness.status,
        marketingReadiness,
        createdAt: at});
      tx.update(ref, {status: "READY_FOR_REVIEW", reviewVersionId: versionId,
        responseAssetId: response.responseAssetId, updatedAt: at});
    });
    return {materialId, versionId, artifactId, status: "READY_FOR_REVIEW", preflight,
      marketingReadiness,
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
          materialSnap.data()?.reviewVersionId !== versionId || !versionOrderReady(versionSnap.data())) {
        throw new Error("physical_approval_forbidden");
      }
      if (!approvalSnap.exists) tx.create(approvalRef, {schemaVersion: SCHEMA_VERSION, businessUid: uid,
        materialId, versionId, artifactId: versionSnap.data()?.artifactId, decision: "approved",
        approvedBy: actor.uid, approvedAt: at, immutable: true,
        printReady: true, marketingReady: true, businessVisualApproval: true});
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
    const marketingFailures = versionQuery.docs.filter((doc) =>
      doc.data()?.marketingReadinessStatus && doc.data()?.marketingReadinessStatus !== "pass");
    const artifactByVersion = new Map(artifactQuery.docs.map((doc) =>
      [doc.data()?.versionId, {artifactId: doc.id, ...doc.data()}]));
    const recentVersions = versionQuery.docs.slice(0, 25).map((doc) => {
      const version = doc.data() || {}; const artifact = artifactByVersion.get(doc.id) || {};
      return {versionId: doc.id, materialId: version.materialId,
        templateId: version.templateId || null, templateVersion: version.templateVersion || null,
        printReady: version.printReadinessStatus === "pass",
        marketingReady: version.marketingReadinessStatus === "pass",
        marketingReadinessFailures: Array.isArray(version.marketingReadiness?.failures) ?
          version.marketingReadiness.failures : [],
        selectedMediaRevisionId: version.mediaSnapshot?.revisionId || null,
        selectedMediaOrigin: version.mediaSnapshot?.origin || null,
        responseAssetId: version.responseAssetId || null,
        landingPageId: version.landingPage?.landingPageId || null,
        artifactHash: artifact.artifactHash || version.artifactHash || null};
    });
    return {schemaVersion: SCHEMA_VERSION, environment: "provider_free", materials: materialQuery.size,
      versions: versionQuery.size, artifacts: artifactQuery.size, approvals: approvalQuery.size,
      statusCounts, preflightFailures: artifactQuery.docs.filter((doc) =>
        doc.data()?.preflight?.status !== "pass").length,
      marketingReadinessFailures: marketingFailures.length,
      templateVersions: [...new Set(versionQuery.docs.map((doc) =>
        `${doc.data()?.templateId || "unknown"}@${doc.data()?.templateVersion || "unknown"}`))],
      recentVersions,
      fulfillment: {download: "available", providerTraffic: 0, print: "not_connected", mail: "not_connected"},
      pricingPolicy: {version: PRICING_POLICY.version, feeRateBps: PRICING_POLICY.fulfillmentFeeRateBps,
        minimumUsd: PRICING_POLICY.fulfillmentFeeMinimumMinor / 100},
      rawRecipientDataExposed: false, rawProviderCredentialsExposed: false};
  }

  return {workspace, mutate, prepare, approve, operations};
}

module.exports = {
  SCHEMA_VERSION, PRICING_POLICY_VERSION, TEMPLATE_SCHEMA_VERSION, MARKETING_READINESS_VERSION,
  PRODUCT_SPECS, TEMPLATE_SPECS, PRICING_POLICY, MIN_EFFECTIVE_DPI,
  PDF_X_VERSION, text, stable, digest, productSpec, publicProductSpecs, normalizeDraft,
  templateSpec, publicTemplateSpecs, containsPlaceholder, containsUnsupportedClaim,
  readableColor, customerServiceLanguage, suggestedCopy, validateAuthorizedDraft, marketingReadinessReport,
  versionOrderReady,
  calculateFulfillmentQuote,
  qrMatrix, renderPrintMaster, preflightReport, resolvePhysicalBusinessUid,
  createPhysicalMarketingService,
};
