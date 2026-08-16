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

test("artifact worker sends one validated backend job through the supplied SMTP adapter", async () => {
  const prepared = delivery.prepareDelivery({uid: "business-one",
    recipient: "owner@example.test", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One", now: Date.UTC(2026, 7, 16)});
  let sentMessage;
  let markedSent;
  const result = await delivery.processArtifactEmailJob({jobId: prepared.jobId,
    job: prepared.job, senderEmail: "support@scaledcircle.com",
    senderName: "Scaled Circle Support", reject: async () => assert.fail("valid job rejected"),
    claim: async () => true, sendMail: async (message) => {
      sentMessage = message; return {messageId: "mock-message"};
    }, markSent: async (id) => { markedSent = id; },
    markFailed: async () => assert.fail("valid send failed"), logFailure: () => {}});
  assert.equal(result.status, "sent");
  assert.equal(sentMessage.to, "owner@example.test");
  assert.match(sentMessage.text, /Here is|ORGANIC SOCIAL DRAFT|ScaledCircle created/);
  assert.doesNotMatch(sentMessage.text, /internal-model|inputTokens|promptVersion/);
  assert.equal(markedSent, "mock-message");
});

test("artifact worker rejects malformed and bulk-recipient jobs without SMTP", async () => {
  const prepared = delivery.prepareDelivery({uid: "business-one",
    recipient: "owner@example.test", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One", now: Date.UTC(2026, 7, 16)});
  for (const job of [
    {...prepared.job, schemaVersion: "wrong"},
    {...prepared.job, to: "one@example.test,two@example.test"},
    {...prepared.job, businessUid: ""},
  ]) {
    let rejected = false;
    const result = await delivery.processArtifactEmailJob({jobId: prepared.jobId, job,
      senderEmail: "support@scaledcircle.com", senderName: "Scaled Circle Support",
      reject: async () => { rejected = true; }, claim: async () => assert.fail("invalid job claimed"),
      sendMail: async () => assert.fail("invalid job sent"),
      markSent: async () => assert.fail("invalid job marked sent"),
      markFailed: async () => assert.fail("invalid job marked failed"), logFailure: () => {}});
    assert.equal(result.status, "rejected");
    assert.equal(rejected, true);
  }
});

test("artifact worker claim prevents duplicate SMTP delivery", async () => {
  const prepared = delivery.prepareDelivery({uid: "business-one",
    recipient: "owner@example.test", artifactId: "artifact-one", artifactDocument,
    businessName: "Business One", now: Date.UTC(2026, 7, 16)});
  let sends = 0;
  const result = await delivery.processArtifactEmailJob({jobId: prepared.jobId,
    job: prepared.job, senderEmail: "support@scaledcircle.com",
    senderName: "Scaled Circle Support", reject: async () => {}, claim: async () => false,
    sendMail: async () => { sends += 1; }, markSent: async () => {},
    markFailed: async () => {}, logFailure: () => {}});
  assert.equal(result.status, "already_claimed");
  assert.equal(sends, 0);
});
