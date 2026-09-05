"use strict";
// Deterministic format conversion of reviewed canonical PNGs, no image generation.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function prepare(output) {
  const source = path.resolve(__dirname, "../../docs/audit-media/meta-20260905");
  const original = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));
  const results = [];
  for (const [index, item] of original.media.entries()) {
    const bytes = fs.readFileSync(path.join(source, item.file));
    if (digest(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error("canonical_media_changed");
    const before = await sharp(bytes).metadata();
    if (before.format !== "png" || before.width !== item.dimensions[0] || before.height !== item.dimensions[1]) throw new Error("canonical_media_dimensions");
    const delivered = index === 0 ? bytes : await sharp(bytes).flatten({background: "#ffffff"})
      .toColourspace("srgb").jpeg({quality: 95, chromaSubsampling: "4:4:4", progressive: false}).toBuffer();
    const metadata = await sharp(delivered).metadata();
    if (metadata.width !== before.width || metadata.height !== before.height ||
        (index > 0 && (metadata.format !== "jpeg" || metadata.exif || metadata.xmp || delivered.length > 8 * 1024 * 1024))) throw new Error("delivery_media_invalid");
    const sha256 = digest(delivered), extension = index === 0 ? "png" : "jpg";
    const name = `${sha256}.${extension}`;
    results.push({name, bytes: delivered, record: {provider: index === 0 ? "facebook" : "instagram",
      order: index === 0 ? 0 : index - 1, sourceSha256: item.sha256, sha256, bytes: delivered.length,
      width: metadata.width, height: metadata.height, mime: index === 0 ? "image/png" : "image/jpeg",
      path: `/social/${name}`, url: `https://scaledcircle.com/social/${name}`}});
  }
  fs.mkdirSync(path.join(output, "social"), {recursive: true});
  for (const file of results) {
    const target = path.join(output, "social", file.name);
    if (fs.existsSync(target) && digest(fs.readFileSync(target)) !== file.record.sha256) throw new Error("immutable_media_collision");
    fs.writeFileSync(target, file.bytes);
  }
  const manifest = {schemaVersion: "MetaDeliveryMediaV1", encoder: sharp.versions,
    transform: "PNG originals preserved; JPEG quality95 4:4:4 sRGB, no resize, metadata stripped",
    files: results.map(f => f.record), publicationApproved: false};
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
module.exports = {prepare};
if (require.main === module) prepare(path.resolve(__dirname, "../../.firebase/meta-delivery"))
  .then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {console.error(error.message); process.exitCode = 1;});
