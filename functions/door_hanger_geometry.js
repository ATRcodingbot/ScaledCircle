"use strict";

// Coordinates are inches from the TOP LEFT of trim, on each printed face.
// Vendor templates are not interchangeable. A new format needs its own reviewed entry.
const GEOMETRY_VERSION = "DoorHangerGeometryV2";
const CUSTOMER_COPY = "Door hangers include a reserved top area for the printer’s hole/die-cut. Important text, logos and QR codes are automatically kept below the safe area.";
const GOTPRINT = Object.freeze({
  id: "gotprint_3_5x8_5_20260926", version: GEOMETRY_VERSION,
  vendor: "gotprint", verified: true,
  reference: "https://static.gotprint.com/templates/gotprint.com/doorhanger-3.5inx8.5in.pdf.zip",
  frontSha256: "9da1211488a7b001db334ac3d4f78d65535a54105666236bca5b8a4f8a3e3322",
  backSha256: "87a5dfb094d85dbc8fe18da440570a3b86a28e43adb61f08298e55d6836cfcd1",
  trim: {width: 3.5, height: 8.5}, bleed: 0.0625, safeMargin: 0.125,
  // Conservative envelope of the PDF's outer BLUE safe boundary, not the cut itself.
  // PDF: 261x621 pt; trim inset 4.5 pt; blue circular boundary bottom 463.699 pt.
  exclusion: {circle: {cx: 1.75, cy: 1.303, radius: 0.825},
    frontSlit: [{x: 0.65, y: -0.0625}, {x: 1.30, y: -0.0625},
      {x: 1.78, y: 0.90}, {x: 1.10, y: 1.15}], mirrorBack: true},
  contentTop: 2.15,
  rasterDpi: 350, colorSpace: "CMYK", pdfFonts: "embedded",
  vendorRasterPreferred: true, vendorPdfRequiresOutlinedText: true,
  qr: {quietModules: 4, minimumInches: 0.8},
});

function geometryFor(spec) {
  if (spec.productType !== "door_hanger") return null;
  if (spec.geometryId !== GOTPRINT.id || spec.widthInches !== GOTPRINT.trim.width ||
      spec.heightInches !== GOTPRINT.trim.height || spec.bleedInches !== GOTPRINT.bleed) {
    throw new Error("door_hanger_geometry_unverified");
  }
  return structuredClone(GOTPRINT);
}

function needsRegeneration(version = {}) {
  return String(version.productSpecId || "").startsWith("door_hanger") &&
    (version.geometrySnapshot?.version !== GEOMETRY_VERSION ||
      version.geometrySnapshot?.id !== GOTPRINT.id);
}

function preflightContent(geometry, boxes, {complete = true} = {}) {
  if (!geometry?.verified) return {status: "fail", warnings: ["Printer template geometry is not verified."]};
  if (!complete || !Array.isArray(boxes) || !boxes.length) return {status: "fail",
    warnings: ["Important artwork content has not been verified. Correct or review the artwork before print-ready approval."]};
  const warnings = [];
  for (const box of boxes) {
    // All important content uses the more conservative safe line, including the slit.
    // No OCR confidence is treated as proof that a photograph has no important subject.
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
        box.width <= 0 || box.height <= 0 || box.x < geometry.safeMargin ||
        box.y < geometry.contentTop ||
        box.x + box.width > geometry.trim.width - geometry.safeMargin ||
        box.y + box.height > geometry.trim.height - geometry.safeMargin) {
      warnings.push(`${String(box.kind || "Important content").slice(0, 40)} crosses the door-hanger safe area. Reposition or scale it before printing.`);
    }
  }
  return {status: warnings.length ? "fail" : "pass", warnings};
}

function generationGeometry() {
  return {geometryId: GOTPRINT.id, units: "inches_from_trim_top_left",
    trim: GOTPRINT.trim, exclusion: GOTPRINT.exclusion, contentTop: GOTPRINT.contentTop,
    instruction: "The top 2.15 inches are unavailable for important content on either face. Compose important imagery below that line from the outset. No printed hole or guide. This service image is placed entirely inside the safe content region."};
}

module.exports = {GEOMETRY_VERSION, CUSTOMER_COPY, GOTPRINT, geometryFor, preflightContent, generationGeometry, needsRegeneration};
