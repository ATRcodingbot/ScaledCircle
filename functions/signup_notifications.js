const crypto = require("node:crypto");

const SUPPORT_EMAIL = "support@scaledcircle.com";
const SUPPORT_FROM_NAME = "Scaled Circle Support";
const EMAIL_JOB_COLLECTION = "outboundEmailJobs";
const ALLOWED_ROLES = new Set(["business", "scaler"]);
const ALLOWED_SEVERITIES = new Set(["info", "warning", "critical"]);

function cleanText(value, maximumLength = 320) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").slice(0, maximumLength);
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function emailHash(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function roleLabel(role) {
  return role === "business" ? "Business" : "Scaler";
}

function firstName(displayName) {
  return cleanText(displayName, 120).split(" ").filter(Boolean)[0] || "there";
}

function job({id, to, subject, text, template, eventType, metadata = {}}) {
  return {
    id,
    data: {
      to: normalizeEmail(to),
      fromAddress: SUPPORT_EMAIL,
      fromName: SUPPORT_FROM_NAME,
      replyTo: SUPPORT_EMAIL,
      subject: cleanText(subject, 180),
      text: String(text || "").slice(0, 12000),
      template: cleanText(template, 80),
      eventType: cleanText(eventType, 80),
      metadata,
      status: "queued",
    },
  };
}

function accountSignupJobs({uid, authUser, profile, occurredAt}) {
  const role = cleanText(profile?.role || profile?.accountType, 40).toLowerCase();
  const email = normalizeEmail(authUser?.email);
  if (!uid || !ALLOWED_ROLES.has(role) || !email) return [];

  const label = roleLabel(role);
  const name = cleanText(profile?.displayName || authUser?.displayName, 120);
  const source = cleanText(
    profile?.signupSource || profile?.earlyAccessSource || profile?.source,
    100,
  ) || "account_profile_created";
  const timestamp = occurredAt || "server-recorded";
  const nextAction = role === "business"
    ? "Verify your email, complete your Business profile, and prepare your first campaign."
    : "Verify your email, complete your Scaler profile, and explore available campaign opportunities.";

  return [
    job({
      id: `welcome-user_${uid}`,
      to: email,
      subject: "Welcome to Scaled Circle",
      template: "welcome_account",
      eventType: "signup.account.welcome",
      text: [
        `Hi ${firstName(name)},`,
        "",
        `Welcome to Scaled Circle as a ${label}.`,
        nextAction,
        "",
        `Questions? Contact ${SUPPORT_EMAIL}.`,
      ].join("\n"),
      metadata: {uid, role, source},
    }),
    job({
      id: `admin-new-user_${uid}`,
      to: SUPPORT_EMAIL,
      subject: `New Scaled Circle signup — ${label}`,
      template: "support_new_account",
      eventType: "signup.account.support_alert",
      text: [
        `Name: ${name || "Not provided"}`,
        `Email: ${email}`,
        `Role: ${label}`,
        `Firebase UID: ${uid}`,
        `Created: ${timestamp}`,
        `Source/platform: ${source}`,
        `Email verified: ${authUser?.emailVerified === true ? "yes" : "no"}`,
      ].join("\n"),
      metadata: {
        uid,
        role,
        source,
        emailVerified: authUser?.emailVerified === true,
      },
    }),
  ];
}

function subscriberSignupJobs({subscriber, occurredAt, existingUser = false}) {
  const email = normalizeEmail(subscriber?.email);
  if (!email) return [];
  const hash = emailHash(email);
  const source = cleanText(subscriber?.source, 100) || "notification_list";
  const timestamp = occurredAt || "server-recorded";

  return [
    job({
      id: `welcome-subscriber_${hash}`,
      to: email,
      subject: "Welcome to Scaled Circle",
      template: "welcome_subscriber",
      eventType: "signup.subscriber.welcome",
      text: [
        `Hi ${firstName(subscriber?.displayName)},`,
        "",
        "You successfully signed up for Scaled Circle updates.",
        "You can expect launch, product, and opportunity communications.",
        "",
        `Questions? Contact ${SUPPORT_EMAIL}.`,
      ].join("\n"),
      metadata: {source},
    }),
    job({
      id: `admin-new-subscriber_${hash}`,
      to: SUPPORT_EMAIL,
      subject: "New Scaled Circle email subscriber",
      template: "support_new_subscriber",
      eventType: "signup.subscriber.support_alert",
      text: [
        `Subscriber email: ${email}`,
        `Signup timestamp: ${timestamp}`,
        `Source/page: ${source}`,
        `Existing user: ${existingUser ? "yes" : "no"}`,
      ].join("\n"),
      metadata: {source, existingUser: existingUser === true},
    }),
  ];
}

function supportAlertJob({
  type,
  severity = "info",
  subject,
  summary,
  entityType,
  entityId,
  metadata = {},
  eventId,
}) {
  const safeType = cleanText(type, 80);
  const safeEntityType = cleanText(entityType, 80);
  const safeEntityId = cleanText(entityId, 160);
  const safeEventId = cleanText(eventId, 200);
  if (!safeType || !safeEntityType || !safeEntityId || !safeEventId) {
    throw new Error("A support alert requires type, entityType, entityId, and eventId.");
  }
  const safeSeverity = ALLOWED_SEVERITIES.has(severity) ? severity : "info";
  const digest = crypto.createHash("sha256")
    .update(`${safeType}:${safeEntityType}:${safeEntityId}:${safeEventId}`)
    .digest("hex");
  return job({
    id: `support-alert_${digest}`,
    to: SUPPORT_EMAIL,
    subject: cleanText(subject, 180),
    template: "support_operational_alert",
    eventType: safeType,
    text: [
      `Severity: ${safeSeverity}`,
      `Summary: ${cleanText(summary, 2000)}`,
      `Entity: ${safeEntityType}/${safeEntityId}`,
    ].join("\n"),
    metadata: {
      severity: safeSeverity,
      entityType: safeEntityType,
      entityId: safeEntityId,
      ...sanitizeMetadata(metadata),
    },
  });
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = cleanText(key, 60);
    if (!safeKey || /(password|token|secret|key|payment|bank|card)/i.test(safeKey)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      safe[safeKey] = typeof value === "string" ? cleanText(value, 500) : value;
    }
  }
  return safe;
}

async function queueEmailJobs({db, jobs, serverTimestamp}) {
  if (!jobs.length) return {created: 0, existing: 0};
  const references = jobs.map((entry) => db.collection(EMAIL_JOB_COLLECTION).doc(entry.id));
  return db.runTransaction(async (transaction) => {
    const snapshots = [];
    for (const reference of references) snapshots.push(await transaction.get(reference));
    let created = 0;
    for (let index = 0; index < jobs.length; index += 1) {
      if (snapshots[index].exists) continue;
      transaction.create(references[index], {
        ...jobs[index].data,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
        attempts: 0,
      });
      created += 1;
    }
    return {created, existing: jobs.length - created};
  });
}

async function queueSupportAlert({db, serverTimestamp, ...alert}) {
  return queueEmailJobs({
    db,
    serverTimestamp,
    jobs: [supportAlertJob(alert)],
  });
}

async function handleAccountProfileCreated({
  uid,
  profile,
  auth,
  db,
  serverTimestamp,
}) {
  if (!profile || !uid) return {created: 0, existing: 0};
  let authUser;
  try {
    authUser = await auth.getUser(uid);
  } catch (error) {
    // A profile write followed by an Auth rollback is not a completed signup.
    if (error?.code === "auth/user-not-found") return {created: 0, existing: 0};
    throw error;
  }
  return queueEmailJobs({
    db,
    serverTimestamp,
    jobs: accountSignupJobs({
      uid,
      authUser,
      profile,
      occurredAt: authUser.metadata?.creationTime || "server-recorded",
    }),
  });
}

async function handleSubscriberCreated({
  subscriber,
  occurredAt,
  auth,
  db,
  serverTimestamp,
}) {
  const email = normalizeEmail(subscriber?.email);
  if (!email) return {created: 0, existing: 0};
  let existingUser = false;
  try {
    await auth.getUserByEmail(email);
    existingUser = true;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  if (existingUser && cleanText(subscriber?.source, 100)
    .startsWith("flutter_account_creation")) {
    return {created: 0, existing: 0};
  }
  return queueEmailJobs({
    db,
    serverTimestamp,
    jobs: subscriberSignupJobs({subscriber, occurredAt, existingUser}),
  });
}

module.exports = {
  SUPPORT_EMAIL,
  SUPPORT_FROM_NAME,
  EMAIL_JOB_COLLECTION,
  accountSignupJobs,
  subscriberSignupJobs,
  supportAlertJob,
  queueEmailJobs,
  queueSupportAlert,
  handleAccountProfileCreated,
  handleSubscriberCreated,
  normalizeEmail,
  emailHash,
};
