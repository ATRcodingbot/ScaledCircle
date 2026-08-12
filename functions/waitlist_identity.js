const crypto = require("node:crypto");

const WAITLIST_ROLES = new Set(["business", "scaler"]);

function normalizeWaitlistEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 254).toLowerCase();
}

function assertWaitlistRole(value) {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!WAITLIST_ROLES.has(role)) throw new Error("Waitlist role must be business or scaler.");
  return role;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function waitlistDocumentId({role, email}) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  if (!normalizedEmail) throw new Error("A normalized email is required.");
  return sha256(`${assertWaitlistRole(role)}:${normalizedEmail}`);
}

function subscriberEmailHash(email) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  if (!normalizedEmail) throw new Error("A normalized email is required.");
  return sha256(normalizedEmail);
}

function waitlistResetPaths({role, email}) {
  const normalizedEmail = normalizeWaitlistEmail(email);
  const waitlistId = waitlistDocumentId({role, email: normalizedEmail});
  const emailHash = subscriberEmailHash(normalizedEmail);
  return Object.freeze([
    `waitlist/${waitlistId}`,
    `outboundEmailJobs/welcome-subscriber_${emailHash}`,
    `outboundEmailJobs/admin-new-subscriber_${emailHash}`,
  ]);
}

module.exports = {
  WAITLIST_ROLES,
  normalizeWaitlistEmail,
  waitlistDocumentId,
  subscriberEmailHash,
  waitlistResetPaths,
};
