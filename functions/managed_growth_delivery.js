"use strict";

const crypto = require("node:crypto");

const DELIVERY_SCHEMA_VERSION = "ManagedGrowthArtifactDeliveryV1";
const DELIVERY_PREFERENCE_VERSION = "ArtifactDeliveryPreferencesV1";
const DELIVERY_TEMPLATE = "artifact_delivery_v1";
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

function text(value, maximum = 1200) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}

function normalizeEmail(value) {
  const email = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid_artifact_delivery_email");
  }
  return email;
}

function validateOwnedArtifact(uid, document) {
  if (!document || document.businessUid !== uid || !document.artifact ||
      typeof document.artifact !== "object" || Array.isArray(document.artifact)) {
    throw new Error("artifact_not_owned_or_missing");
  }
  return document.artifact;
}

function renderArtifactText({artifact, businessName, generatedAt}) {
  const output = new StringBuffer();
  output.line(text(artifact.title, 240).toUpperCase() || "MANAGED GROWTH DRAFT");
  output.line(`Business: ${text(businessName, 160) || "Your business"}`);
  output.line(`Generated: ${new Date(generatedAt).toISOString().slice(0, 10)}`);
  output.line();
  if (text(artifact.summary, 2400)) output.line(text(artifact.summary, 2400));
  for (const section of Array.isArray(artifact.sections) ? artifact.sections.slice(0, 60) : []) {
    const heading = text(section?.heading, 180);
    const content = text(section?.content, 8000);
    if (!heading || !content) continue;
    output.line();
    output.line(heading.toUpperCase());
    output.line(content);
  }
  const limitations = Array.isArray(artifact.limitations) ? artifact.limitations
    .slice(0, 30).map((item) => text(item, 600)).filter(Boolean) : [];
  if (limitations.length) {
    output.line();
    output.line("LIMITATIONS");
    limitations.forEach((item) => output.line(item));
  }
  return output.value().slice(0, 50000);
}

class StringBuffer {
  constructor() { this.lines = []; }
  line(value = "") { this.lines.push(String(value)); }
  value() { return this.lines.join("\n").trim(); }
}

function deliveryJobId({uid, artifactId, recipient, now = Date.now()}) {
  const window = Math.floor(now / IDEMPOTENCY_WINDOW_MS);
  const digest = crypto.createHash("sha256")
    .update(`${uid}\n${artifactId}\n${recipient}\n${window}`).digest("hex");
  return `artifact_${digest}`;
}

function prepareDelivery({uid, recipient, artifactId, artifactDocument,
  businessName, now = Date.now()}) {
  const email = normalizeEmail(recipient);
  const artifact = validateOwnedArtifact(uid, artifactDocument);
  const rendered = renderArtifactText({artifact, businessName,
    generatedAt: artifactDocument.createdAt?.toDate?.() || now});
  const jobId = deliveryJobId({uid, artifactId, recipient: email, now});
  return {jobId, recipient: email, rendered, job: {
    template: DELIVERY_TEMPLATE,
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    status: "queued",
    to: email,
    fromAddress: "support@scaledcircle.com",
    fromName: "Scaled Circle Support",
    replyTo: "support@scaledcircle.com",
    subject: `Your ScaledCircle file — ${text(artifact.title, 120) || "Managed Growth draft"}`,
    text: `${text(artifact.title, 240)}\n\nScaledCircle created this draft for ${text(businessName, 160) || "your business"}.\n\n${rendered}\n\nThis is artifact delivery, not a marketing campaign send.`,
    businessUid: uid,
    artifactId,
    bodyHash: crypto.createHash("sha256").update(rendered).digest("hex"),
    attachmentIncluded: false,
    createdAt: null,
    updatedAt: null,
  }};
}

function deliveryPreference(uid, email) {
  return {schemaVersion: DELIVERY_PREFERENCE_VERSION, businessUid: uid,
    artifactDeliveryEmail: normalizeEmail(email), updatedAt: null, updatedBy: uid};
}

module.exports = {DELIVERY_SCHEMA_VERSION, DELIVERY_PREFERENCE_VERSION,
  DELIVERY_TEMPLATE, IDEMPOTENCY_WINDOW_MS, normalizeEmail, validateOwnedArtifact,
  renderArtifactText, deliveryJobId, prepareDelivery, deliveryPreference};
