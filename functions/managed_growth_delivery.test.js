"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const delivery = require("./managed_growth_delivery");

const artifactDocument = {
  businessUid: "business-one",
  artifactType: "social_package",
  model: "internal-model",
  usage: {inputTokens: 100},
  artifact: {
    title: "Organic Social Draft",
    summary: "Deck and fence education.",
    sections: [{heading: "Facebook", content: "A useful homeowner tip."}],
    limitations: ["Business review required."],
  },
};

test("artifact delivery validates ownership and recipient", () => {
  assert.throws(() => delivery.prepareDelivery({uid: "business-two",
    recipient: "owner@example.test", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One"}), /artifact_not_owned_or_missing/);
  assert.throws(() => delivery.prepareDelivery({uid: "business-one",
    recipient: "not-an-email", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One"}), /invalid_artifact_delivery_email/);
});

test("artifact delivery renders customer content without internal metadata", () => {
  const prepared = delivery.prepareDelivery({uid: "business-one",
    recipient: "owner@example.test", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One", now: Date.UTC(2026, 7, 16)});
  assert.match(prepared.rendered, /ORGANIC SOCIAL DRAFT/);
  assert.match(prepared.rendered, /Business: Business One/);
  assert.match(prepared.rendered, /A useful homeowner tip/);
  assert.doesNotMatch(prepared.rendered, /internal-model|inputTokens|profileVersion|promptVersion/);
  assert.equal(prepared.job.attachmentIncluded, false);
});

test("artifact delivery uses a deterministic five-minute idempotency window", () => {
  const input = {uid: "business-one", artifactId: "artifact-one",
    recipient: "owner@example.test"};
  assert.equal(delivery.deliveryJobId({...input, now: 1000}),
    delivery.deliveryJobId({...input, now: 299999}));
  assert.notEqual(delivery.deliveryJobId({...input, now: 1000}),
    delivery.deliveryJobId({...input, now: 300001}));
});

test("saved delivery preference is dedicated and contains no identity or billing mutation", () => {
  const value = delivery.deliveryPreference("business-one", "Files@Example.test");
  assert.equal(value.artifactDeliveryEmail, "files@example.test");
  assert.equal(value.businessUid, "business-one");
  for (const field of ["email", "billingEmail", "supportEmail", "role", "stripeCustomerId"]) {
    assert.equal(Object.hasOwn(value, field), false);
  }
});
