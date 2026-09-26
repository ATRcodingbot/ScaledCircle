"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {PDFDocument} = require("pdf-lib");
const geo = require("./door_hanger_geometry");
const physical = require("./physical_marketing");

for (const kind of ["logo", "headline", "QR", "phone", "legal text", "critical photo subject"]) {
  test(`${kind} in hole or slit area is blocked on either side`, () => {
    for (const side of [1, 2]) assert.equal(geo.preflightContent(geo.GOTPRINT,
      [{kind, side, x: 1, y: 0.5, width: 1, height: 0.5}]).status, "fail");
  });
}
test("valid safe content passes; incomplete uploaded content is warned and blocked", () => {
  const boxes = [{kind: "logo", x: 0.2, y: 2.2, width: 1, height: 0.4}];
  assert.equal(geo.preflightContent(geo.GOTPRINT, boxes).status, "pass");
  assert.equal(geo.preflightContent(geo.GOTPRINT, boxes, {complete: false}).status, "fail");
  assert.throws(() => physical.normalizeDraft({productSpecId: "door_hanger_3_5x8_5",
    artworkUploadId: "unverified-upload"}), /isn’t supported yet/);
});
test("geometry changes cannot borrow verification; unrelated landscape products are unaffected", () => {
  const spec = physical.productSpec("door_hanger_3_5x8_5");
  assert.throws(() => geo.geometryFor({...spec, widthInches: 4.25}), /unverified/);
  assert.throws(() => geo.geometryFor({...spec, geometryId: "another-vendor"}), /unverified/);
  assert.equal(geo.geometryFor(physical.productSpec("postcard_4x6")), null);
  assert.equal(geo.preflightContent({...geo.GOTPRINT, contentTop: 3},
    [{kind: "logo", x: 0.2, y: 2.2, width: 1, height: 0.4}]).status, "fail");
});
test("historical door-hanger approval needs regeneration, not silent migration", () => {
  const version = {productSpecId: "door_hanger_3_5x8_5", preflightStatus: "pass",
    printReadinessStatus: "pass", marketingReadinessStatus: "pass"};
  assert.equal(physical.versionOrderReady(version), false);
});
test("both exported faces preserve safe area; PDFs and 350 DPI raster files have no editor overlay", async () => {
  const content = physical.normalizeDraft({productSpecId: "door_hanger_3_5x8_5", sideCount: 2,
    campaignId: "synthetic-only", service: "Fences", headline: "Plan your fence project",
    cta: "Learn more", landingPageId: "synthetic-page",
    templateId: "door_hanger_professional_services_v1"});
  const result = await physical.renderPrintMaster({version: {productSpecId: content.productSpecId,
    content, brandSnapshot: {businessName: "QA Business", services: ["Fences"]}},
    trackedUrl: "https://example.test/qa"});
  const pdf = await PDFDocument.load(result.pdf);
  for (const page of pdf.getPages()) {
    assert.deepEqual(page.getSize(), {width: 261, height: 621});
    assert.equal(page.getTrimBox().width, 252);
  }
  for (const page of result.evidence.pageEvidence) assert.ok(page.contentTopPoints <= 461.701);
  assert.equal(result.evidence.contentSafety.status, "pass");
  for (const proof of result.proofs) assert.doesNotMatch(proof.svg.toString(), /Keep important content|safe.line|CUT ZONE|<circle/);
  for (const raster of result.rasterPrints) {
    const metadata = await sharp(raster.jpg).metadata();
    assert.equal(metadata.width, 1269); assert.equal(metadata.height, 3019);
    assert.equal(metadata.density, 350); assert.equal(metadata.space, "cmyk");
  }
  // Optional local diagnostic artifacts contain only synthetic fixture content.
  if (process.env.DOOR_HANGER_QA_DIR) {
    const fs = require("node:fs"); const path = require("node:path");
    fs.writeFileSync(path.join(process.env.DOOR_HANGER_QA_DIR, "safe-export.pdf"), result.pdf);
    for (const proof of result.proofs) fs.writeFileSync(path.join(process.env.DOOR_HANGER_QA_DIR, `proof-${proof.side}.jpg`), proof.jpg);
  }
});
