const assert = require("node:assert/strict");
const test = require("node:test");

const notifications = require("./signup_notifications");

function profile(role) {
  return {
    role,
    displayName: role === "business" ? "Blair Builder" : "Sam Scaler",
    companyName: role === "business" ? "Builder LLC" : "",
    source: "flutter_web",
    password: "must-never-appear",
    authToken: "must-never-appear",
    paymentCard: "must-never-appear",
  };
}

function authUser(role) {
  return {
    email: `${role}@example.test`,
    displayName: role === "business" ? "Blair Builder" : "Sam Scaler",
    emailVerified: role === "business",
  };
}

function fakeDatabase() {
  const documents = new Map();
  return {
    documents,
    collection(collectionName) {
      return {
        doc(id) {
          const path = `${collectionName}/${id}`;
          return {path};
        },
      };
    },
    async runTransaction(callback) {
      const pending = [];
      const transaction = {
        async get(reference) {
          return {
            exists: documents.has(reference.path),
            data: () => documents.get(reference.path),
          };
        },
        create(reference, data) {
          pending.push([reference.path, data]);
        },
      };
      const result = await callback(transaction);
      for (const [path, data] of pending) {
        if (documents.has(path)) throw new Error("already exists");
        documents.set(path, data);
      }
      return result;
    },
  };
}

async function queue(jobs, db = fakeDatabase()) {
  const result = await notifications.queueEmailJobs({
    db,
    jobs,
    serverTimestamp: "SERVER_TIMESTAMP",
  });
  return {db, result};
}

test("new Business queues exactly one welcome and one support alert", async () => {
  const jobs = notifications.accountSignupJobs({
    uid: "business-1",
    authUser: authUser("business"),
    profile: profile("business"),
    occurredAt: "2026-08-12T12:00:00Z",
  });
  const {db} = await queue(jobs);
  assert.equal(db.documents.size, 2);
  assert.ok(db.documents.has("outboundEmailJobs/welcome-user_business-1"));
  assert.ok(db.documents.has("outboundEmailJobs/admin-new-user_business-1"));
});

test("new Scaler queues exactly one welcome and one support alert", async () => {
  const jobs = notifications.accountSignupJobs({
    uid: "scaler-1",
    authUser: authUser("scaler"),
    profile: profile("scaler"),
  });
  const {db} = await queue(jobs);
  assert.equal(db.documents.size, 2);
  assert.ok(db.documents.has("outboundEmailJobs/welcome-user_scaler-1"));
  assert.ok(db.documents.has("outboundEmailJobs/admin-new-user_scaler-1"));
});

test("new subscriber queues one welcome and one support alert", async () => {
  const jobs = notifications.subscriberSignupJobs({
    subscriber: {email: "News@Example.test", source: "homepage_popup"},
    occurredAt: "2026-08-12T12:00:00Z",
  });
  const {db} = await queue(jobs);
  assert.equal(db.documents.size, 2);
  assert.equal([...db.documents.values()].filter((value) =>
    value.to === "news@example.test").length, 1);
  assert.equal([...db.documents.values()].filter((value) =>
    value.to === notifications.SUPPORT_EMAIL).length, 1);
});

test("trigger retry cannot duplicate deterministic jobs", async () => {
  const db = fakeDatabase();
  const jobs = notifications.accountSignupJobs({
    uid: "retry-user",
    authUser: authUser("business"),
    profile: profile("business"),
  });
  const first = await queue(jobs, db);
  const second = await queue(jobs, db);
  assert.deepEqual(first.result, {created: 2, existing: 0});
  assert.deepEqual(second.result, {created: 0, existing: 2});
  assert.equal(db.documents.size, 2);
});

test("recipients and From identity are server controlled", () => {
  const malicious = profile("business");
  malicious.to = "attacker@example.test";
  malicious.fromAddress = "spoof@example.test";
  const jobs = notifications.accountSignupJobs({
    uid: "secure-user",
    authUser: authUser("business"),
    profile: malicious,
  });
  assert.deepEqual(jobs.map((entry) => entry.data.to).sort(), [
    "business@example.test",
    notifications.SUPPORT_EMAIL,
  ].sort());
  assert.ok(jobs.every((entry) =>
    entry.data.fromAddress === notifications.SUPPORT_EMAIL));
});

test("no authoritative profile means no account email jobs", () => {
  assert.deepEqual(notifications.accountSignupJobs({
    uid: "orphan-auth-user",
    authUser: authUser("business"),
    profile: undefined,
  }), []);
  assert.deepEqual(notifications.accountSignupJobs({
    uid: "rolled-back-user",
    authUser: authUser("business"),
    profile: {role: "pending"},
  }), []);
});

test("failed or rolled-back account signup queues no email", async () => {
  const db = fakeDatabase();
  const auth = {
    async getUser() {
      const error = new Error("not found");
      error.code = "auth/user-not-found";
      throw error;
    },
  };
  const result = await notifications.handleAccountProfileCreated({
    uid: "rolled-back-user",
    profile: profile("business"),
    auth,
    db,
    serverTimestamp: "SERVER_TIMESTAMP",
  });
  assert.deepEqual(result, {created: 0, existing: 0});
  assert.equal(db.documents.size, 0);
});

test("account-origin waitlist enrollment does not duplicate account mail", async () => {
  const db = fakeDatabase();
  const auth = {async getUserByEmail() { return authUser("business"); }};
  const result = await notifications.handleSubscriberCreated({
    subscriber: {
      email: "business@example.test",
      source: "flutter_account_creation|heard=search_engine",
    },
    auth,
    db,
    serverTimestamp: "SERVER_TIMESTAMP",
  });
  assert.deepEqual(result, {created: 0, existing: 0});
  assert.equal(db.documents.size, 0);
});

test("support notification excludes sensitive and unnecessary profile fields", () => {
  const jobs = notifications.accountSignupJobs({
    uid: "sanitized-user",
    authUser: authUser("business"),
    profile: profile("business"),
  });
  const support = jobs.find((entry) =>
    entry.id === "admin-new-user_sanitized-user");
  const serialized = JSON.stringify(support.data);
  assert.doesNotMatch(serialized, /must-never-appear/);
  assert.doesNotMatch(serialized, /password|authToken|paymentCard/);
  assert.match(support.data.text, /Firebase UID: sanitized-user/);
});

test("reusable support alerts are deterministic and sanitize metadata", async () => {
  const db = fakeDatabase();
  const alert = {
    type: "payment.webhook_failed",
    severity: "critical",
    subject: "Webhook processing needs attention",
    summary: "A trusted operation requires review.",
    entityType: "stripeEvent",
    entityId: "evt-safe-id",
    eventId: "attempt-1",
    metadata: {retryable: true, secretKey: "never-store-this"},
  };
  await notifications.queueSupportAlert({
    db,
    serverTimestamp: "SERVER_TIMESTAMP",
    ...alert,
  });
  await notifications.queueSupportAlert({
    db,
    serverTimestamp: "SERVER_TIMESTAMP",
    ...alert,
  });
  assert.equal(db.documents.size, 1);
  const value = [...db.documents.values()][0];
  assert.equal(value.to, notifications.SUPPORT_EMAIL);
  assert.equal(value.metadata.retryable, true);
  assert.equal(value.metadata.secretKey, undefined);
});
