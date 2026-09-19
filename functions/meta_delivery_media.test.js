"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const {prepare} = require("./scripts/prepare_meta_delivery_media");
test("immutable published media survives ordinary Flutter Hosting releases", () => {
  const folder = path.resolve(__dirname, "../apps/mobile/web/social");
  const expected = [
    "2f453997dd7b59c24aa1246a2e197b3ba05b40817daa678428befeb11c1db28d.png",
    "36a6bcbcae69cc9e296e9bb784cbe5e790d622d1501980f09f98a8737deec06b.jpg",
    "41e6977b5cb7a4a04b47f6892a838a14e47890a0eb525009506ca9280ca39d4b.jpg",
    "68bc79bc60f57ea266172374e23bae20b60c7d0a4ef255ed013314bd5009feab.jpg",
    "783e3bb9a5209ebdc9ecb05e88dcf016933f42cc2e4e86bfde5c2dff5463c160.jpg",
  ];
  for (const name of expected) {
    const bytes = fs.readFileSync(path.join(folder, name));
    assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"), path.parse(name).name);
  }
});
test("Meta delivery preserves PNG lineage and ordered reproducible JPEG derivatives", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "sc-meta-"));
  try {
    const first = await prepare(folder), again = await prepare(folder);
    assert.deepEqual(first, again);
    assert.equal(first.files.length, 5);
    assert.equal(first.files[0].sourceSha256, first.files[0].sha256);
    assert.deepEqual(first.files.slice(1).map(f => f.order), [0, 1, 2, 3]);
    for (const item of first.files.slice(1)) {
      const info = await sharp(path.join(folder, item.path)).metadata();
      assert.equal(info.format, "jpeg");
      assert.equal(info.width, 1080); assert.equal(info.height, 1350);
      assert.equal(info.exif, undefined); assert.equal(info.xmp, undefined);
      assert.notEqual(item.sourceSha256, item.sha256);
    }
  } finally {
    // Exact fixture files only; no recursive deletion of a computed directory.
    for (const file of fs.readdirSync(path.join(folder, "social"))) fs.unlinkSync(path.join(folder, "social", file));
    fs.rmdirSync(path.join(folder, "social")); fs.unlinkSync(path.join(folder, "manifest.json")); fs.rmdirSync(folder);
  }
});
