"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const meta = require("../functions-social-operations/social_meta_candidate");
const growth = require("../functions-social-operations/social_growth_cycle");
const revision = (provider = "facebook") => meta.mediaRevision({businessUid: "tenant", assetId: "asset", provider,
  productionOrigin: "https://scaledcircle.com", images: Array.from({length: provider === "facebook" ? 1 : 4}, (_, i) => ({
    sha256: String(i + 1).repeat(64), bytes: 100, width: 1080, height: 1350,
    mime: provider === "facebook" ? "image/png" : "image/jpeg",
    url: `https://scaledcircle.com/social/${String(i + 1).repeat(64)}.${provider === "facebook" ? "png" : "jpg"}`}))});
const job = (r) => growth.jobs({id: "approval", businessUid: "tenant", items: [{versionId: "version", bindingHash: "binding",
  scheduledFor: "2026-09-08T13:30:00Z", variants: [{provider: r.provider, copy: "Explore our work. Link in bio.",
    mediaAssetId: r.assetId, mediaRevisionId: r.id}]}]})[0];
const account = {businessUid: "tenant", providerUserId: "123", linkedPageId: "456"};
const approval = (j) => ({id: "approval", businessUid: "tenant", approvedByUid: "tenant",
  providerAccounts: {[j.provider]: account}, items: [j.binding]});

test("Meta candidates reuse shared deterministic jobs and cannot enable execution", () => {
  for (const provider of ["facebook", "instagram"]) {
    const r = revision(provider), j = job(r), candidate = meta.prepare({job: j, revision: r, account, approval: approval(j)});
    assert.equal(candidate.jobId, j.id);
    assert.equal(candidate.executionEnabled, false);
    assert.equal(job(r).id, j.id);
    assert.equal(candidate.maximumEffects.containers, provider === "instagram" ? 5 : 0);
  }
});
test("media order, owner, format, origin and changed bytes fail closed", () => {
  const r = revision("instagram"), j = job(r);
  for (const changed of [{...r, images: [...r.images].reverse()}, {...r, businessUid: "other"},
    {...r, images: r.images.map(i => ({...i, mime: "image/png"}))},
    {...r, images: r.images.map(i => ({...i, url: i.url.replace("scaledcircle.com", "scaledcircle-staging.web.app")}))}]) {
    assert.throws(() => meta.prepare({job: j, revision: changed, account, approval: approval(j)}));
  }
  assert.throws(() => meta.prepare({job: j, revision: r, account: {...account, businessUid: "other"}}));
  assert.throws(() => meta.prepare({job: j, revision: r, account: {...account, linkedPageId: null}}));
  assert.throws(() => meta.prepare({job: j, revision: r, account: {...account, providerUserId: "999"}, approval: approval(j)}));
  assert.throws(() => meta.prepare({job: j, revision: r, account, approval: {...approval(j), revokedAt: 1}}));
});
test("Instagram partial/unknown outcomes do not create another container", () => {
  assert.equal(meta.nextStep({started: true}), "reconcile");
  assert.equal(meta.nextStep({outcome: "unknown", providerId: "123"}), "reconcile");
  assert.equal(meta.nextStep({providerId: "123", status: "FINISHED"}), "reuse_receipt");
  assert.equal(meta.nextStep({providerId: "123", status: "EXPIRED"}), "needs_attention");
  assert.equal(meta.nextStep({providerId: "123", status: "IN_PROGRESS"}), "poll");
});

test("shared jobs support Facebook text and Instagram single image without carousel side effects", () => {
  const textJob = job(revision());
  Object.assign(textJob.binding.variants[0], {format: "text", mediaAssetId: null, mediaRevisionId: null});
  const text = meta.prepare({job: textJob, account, approval: approval(textJob)});
  assert.deepEqual(text.request.body, {message: "Explore our work. Link in bio."});
  assert.equal(text.request.path, "/123/feed");
  const original = revision("instagram");
  const single = meta.mediaRevision({...original, productionOrigin: "https://scaledcircle.com", images: original.images.slice(0, 1)});
  const j = job(single), image = meta.prepare({job: j, revision: single, account, approval: approval(j)});
  assert.equal(image.maximumEffects.containers, 1);
  assert.equal(image.children, undefined);
  assert.equal(image.container.body.caption, j.binding.variants[0].copy);
});
