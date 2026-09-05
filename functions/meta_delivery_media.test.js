"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const {prepare} = require("./scripts/prepare_meta_delivery_media");
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
