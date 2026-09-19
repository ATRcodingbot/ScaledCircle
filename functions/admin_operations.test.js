"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const admin = require("./admin_operations");

const NOW = Date.parse("2026-08-15T12:00:00Z");
const SERVER_TIMESTAMP = Object.freeze({serverTimestamp: true});
const FieldValue = {serverTimestamp: () => SERVER_TIMESTAMP};
const timestamp = (value) => ({toMillis: () => value});

function environment({targetRole = "business", targetVerified = true,
  includeOtherAdmin = true, replacementReady = true} = {}) {
  const documents = new Map([
    ["users/actor-admin", {role: "admin", email: "admin@example.test"}],
    ["users/target", {role: targetRole, accountType: "business", active: true,
      betaAccess: "approved", companyName: "Preserved Business"}],
  ]);
  if (includeOtherAdmin) documents.set("users/replacement", {role: "admin",
    lastAdminLoginVerifiedAt: replacementReady ? timestamp(NOW - 1000) : timestamp(NOW - 25 * 3600000)});
  const writes = [];
  const snapshot = (path) => ({exists: documents.has(path), id: path.split("/").at(-1),
    data: () => documents.get(path)});
  const docRef = (collection, id) => ({path: `${collection}/${id}`,
    get: async () => snapshot(`${collection}/${id}`)});
  const queryRef = (collection, role) => ({query: true, collection, role});
  const db = {
    collection(name) {
      return {doc: (id) => docRef(name, id),
        where: (field, op, value) => {
          assert.equal(field, "role"); assert.equal(op, "==");
          return queryRef(name, value);
        }};
    },
    async runTransaction(callback) {
      const transaction = {
        async get(ref) {
          if (ref.query) {
            return {docs: [...documents.entries()]
              .filter(([path, value]) => path.startsWith(`${ref.collection}/`) && value.role === ref.role)
              .map(([path]) => snapshot(path))};
          }
          return snapshot(ref.path);
        },
        update(ref, value) {
          documents.set(ref.path, {...(documents.get(ref.path) || {}), ...value});
          writes.push({operation: "update", path: ref.path, value});
        },
        create(ref, value) {
          if (documents.has(ref.path)) throw new Error("already_exists");
          documents.set(ref.path, value); writes.push({operation: "create", path: ref.path, value});
        },
      };
      return callback(transaction);
    },
  };
  const users = {
    target: {uid: "target", email: "target@example.test", emailVerified: targetVerified},
  };
  const auth = {
    async getUser(uid) { if (!users[uid]) throw new Error("missing"); return users[uid]; },
    async getUserByEmail(email) {
      const user = Object.values(users).find((entry) => entry.email === email);
      if (!user) throw new Error("missing"); return user;
    },
  };
  return {documents, writes, service: admin.createAdminOperationsService({db, auth, FieldValue,
    now: () => NOW})};
}

const actor = {uid: "actor-admin", role: "admin", isAdmin: true, emailVerified: true};

test("admin authority rejects unauthenticated, Business, Scaler, spoofed, and unverified callers", () => {
  for (const candidate of [null,
    {uid: "business", role: "business", isAdmin: false, emailVerified: true},
    {uid: "scaler", role: "scaler", isAdmin: false, emailVerified: true},
    {uid: "spoof", role: "business", isAdmin: true, emailVerified: true},
    {uid: "admin", role: "admin", isAdmin: true, emailVerified: false}]) {
    assert.throws(() => admin.assertTrustedAdmin(candidate), /trusted_admin_required/);
  }
});

test("trusted admin promotes by normalized email and preserves unrelated Business fields", async () => {
  const env = environment();
  const result = await env.service.setAdminRole({email: " TARGET@EXAMPLE.TEST ", action: "promote",
    reason: "Operational administrator transfer"}, actor);
  assert.deepEqual({changed: result.changed, role: result.role}, {changed: true, role: "admin"});
  const profile = env.documents.get("users/target");
  assert.equal(profile.role, "admin");
  assert.equal(profile.companyName, "Preserved Business");
  assert.equal(profile.active, true);
  assert.equal(profile.betaAccess, "approved");
  const audits = [...env.documents.entries()].filter(([path]) => path.startsWith("adminAuditEvents/"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].eventType, "admin_promoted");
  assert.equal(audits[0][1].occurredAt, SERVER_TIMESTAMP);
});

test("target must exist, have a profile, and have a verified Auth email", async () => {
  const unverified = environment({targetVerified: false});
  await assert.rejects(unverified.service.setAdminRole({uid: "target", action: "promote", reason: "x"}, actor),
    /target_email_unverified/);
  const env = environment();
  await assert.rejects(env.service.setAdminRole({email: "missing@example.test", action: "promote", reason: "x"}, actor),
    /target_auth_user_not_found/);
});

test("last-admin demotion is forbidden", async () => {
  const env = environment({targetRole: "admin", includeOtherAdmin: false});
  env.documents.delete("users/actor-admin");
  await assert.rejects(env.service.setAdminRole({uid: "target", action: "demote", reason: "transfer",
    replacementAdminUid: "replacement"}, actor), /last_admin_demotion_forbidden/);
});

test("demotion requires a recently login-verified replacement and preserves Business profile", async () => {
  const stale = environment({targetRole: "admin", replacementReady: false});
  await assert.rejects(stale.service.setAdminRole({uid: "target", action: "demote", reason: "transfer",
    replacementAdminUid: "replacement"}, actor), /verified_replacement_admin_required/);
  const env = environment({targetRole: "admin"});
  const result = await env.service.setAdminRole({uid: "target", action: "demote", reason: "transfer",
    replacementAdminUid: "replacement"}, actor);
  assert.equal(result.role, "business");
  assert.equal(env.documents.get("users/target").companyName, "Preserved Business");
  assert.equal(env.documents.get("users/target").active, true);
});

test("admin login readiness is server stamped and idempotently audited by day", async () => {
  const env = environment();
  await env.service.confirmAdminLogin(actor);
  await env.service.confirmAdminLogin(actor);
  assert.equal(env.documents.get("users/actor-admin").lastAdminLoginVerifiedAt, SERVER_TIMESTAMP);
  const audits = [...env.documents.entries()].filter(([path]) => path.startsWith("adminAuditEvents/"));
  assert.equal(audits.length, 1);
});

test("issues are hourly deduplicated; only high and critical queue minimal support email", async () => {
  const env = environment();
  const high = {type: "provider_failure", severity: "high", summary: "Provider unavailable",
    dedupeKey: "provider-x"};
  const first = await env.service.createIssue(high, actor);
  const replay = await env.service.createIssue(high, actor);
  assert.equal(first.issueId, replay.issueId);
  assert.equal([...env.documents.keys()].filter((path) => path.startsWith("adminIssues/")).length, 1);
  const mail = [...env.documents.entries()].find(([path]) => path.startsWith("outboundEmailJobs/"))[1];
  assert.equal(mail.to, "support@scaledcircle.com");
  assert.doesNotMatch(mail.text, /customer|payment|secret/i);
  const routine = environment();
  await routine.service.createIssue({...high, severity: "normal"}, actor);
  assert.equal([...routine.documents.keys()].some((path) => path.startsWith("outboundEmailJobs/")), false);
});

test("admin authority collections remain server-only in rules and no bootstrap or Sales path exists", () => {
  const rules = fs.readFileSync("../firestore.rules", "utf8");
  assert.match(rules, /match \/adminAuditEvents\/{eventId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/adminIssues\/{issueId\}[\s\S]*?allow create, update, delete: if false/);
  const index = fs.readFileSync("./index.js", "utf8");
  assert.doesNotMatch(index, /registerSalesRepresentative|salesCommission|claimSalesReferral/);
  assert.equal(fs.existsSync("./scripts/bootstrap_first_admin.js"), false);
});

test('operations delegation is audited, revocable, expiring and never changes role or financial authority',async()=>{
 const env=environment();const before=structuredClone(env.documents.get('users/target'));
 const grant={email:'target@example.test',action:'grant_operations',reason:'Read-only launch operations',requestId:'ops_request_000001'};
 await env.service.setAdminRole(grant,actor);
 const profile=env.documents.get('users/target');assert.equal(profile.role,before.role);assert.equal(profile.companyName,before.companyName);
 const reader={uid:'target',role:'business',isAdmin:false,emailVerified:true,user:profile};
 assert.equal(admin.assertOperationsReader(reader,NOW).uid,'target');assert.throws(()=>admin.assertTrustedAdmin(reader));
 assert.throws(()=>admin.assertOperationsReader({...reader,authDisabled:true},NOW));
 assert.throws(()=>admin.assertOperationsReader(reader,NOW+31*86400000));
 const writes=env.writes.length;await env.service.setAdminRole(grant,actor);assert.equal(env.writes.length,writes);
 await assert.rejects(env.service.setAdminRole(grant,reader));
 await env.service.setAdminRole({...grant,action:'revoke_operations',requestId:'ops_request_000002'},actor);
 assert.throws(()=>admin.assertOperationsReader({...reader,user:env.documents.get('users/target')},NOW));
 assert(env.writes.every(w=>w.path.startsWith('users/')||w.path.startsWith('adminAuditEvents/')));
});
test('workspace permissions and client claims never imply platform operations access',()=>{
 for(const user of [{},{permissions:['admin','analytics','payments']},{adminOperationsAccess:{mode:'read_only'}},{adminOperationsAccess:{mode:'read_only',expiresAtMs:NOW+100},disabled:true}])assert.throws(()=>admin.assertOperationsReader({uid:'other',role:'business',emailVerified:true,user},NOW));
});
