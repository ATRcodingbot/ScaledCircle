"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const generation = require("./generation_foundation");

function memoryDb() {
  const docs = new Map(); let clock = 1_800_000_000_000;
  const snapshot = (path) => ({id: path.split("/").at(-1), exists: docs.has(path),
    data: () => docs.get(path), ref: reference(path)});
  function reference(path) { return {path, id: path.split("/").at(-1),
    async get() { return snapshot(path); }, async create(data) { if (docs.has(path)) throw new Error("exists"); docs.set(path, data); },
    async update(patch) { docs.set(path, {...docs.get(path), ...patch}); },
    collection(name) { return collection(`${path}/${name}`); }}; }
  function collection(path) {
    const filters = []; const orders = []; let maximum = Infinity; let cursor = null;
    const api = {doc(id) { return reference(`${path}/${id}`); },
      where(field, op, value) { filters.push({field, op, value}); return api; },
      orderBy(field, direction = "asc") { orders.push({field, direction}); return api; },
      startAfter(...values) { cursor = values; return api; }, limit(value) { maximum = value; return api; },
      async get() {
        let rows = [...docs.entries()].filter(([key]) => key.split("/").length === path.split("/").length + 1 && key.startsWith(`${path}/`))
          .map(([key]) => snapshot(key));
        rows = rows.filter((row) => filters.every(({field, op, value}) => {
          const actual = field === "__name__" ? row.id : row.data()?.[field];
          if (op === "==") return actual === value;
          if (op === ">=") return Number(actual) >= Number(value);
          return true;
        }));
        rows.sort((a, b) => { for (const {field, direction} of orders) {
          const av = field === "__name__" ? a.id : Number(a.data()?.[field] || 0);
          const bv = field === "__name__" ? b.id : Number(b.data()?.[field] || 0);
          if (av !== bv) return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
        } return 0; });
        if (cursor) {
          const cursorMillis = Number(cursor[0]); const cursorId = String(cursor[1]);
          rows = rows.filter((row) => Number(row.data()?.createdAt || 0) < cursorMillis ||
            (Number(row.data()?.createdAt || 0) === cursorMillis && row.id < cursorId));
        }
        rows = rows.slice(0, maximum); return {docs: rows, size: rows.length};
      }};
    return api;
  }
  return {docs, collection, async runTransaction(fn) { return fn({get: (ref) => ref.get(),
    update: (ref, patch) => ref.update(patch), create: (ref, data) => ref.create(data)}); },
  FieldValue: {serverTimestamp: () => ++clock}, Timestamp: {fromMillis: (v) => v},
  FieldPath: {documentId: () => "__name__"}};
}

test("generated constants preserve immutable origin disclosure and conservative limits", () => {
  assert.match(generation.DISCLOSURE, /not a photo/i);
  assert.equal(generation.PAGE_SIZE, 20);
  assert.equal(generation.MAX_ACTIVE_JOBS, 2);
  assert.equal(generation.MAX_REQUESTS_PER_DAY, 8);
});

test("safe request accepts only approved services and bounded visual directions", () => {
  const result = generation.sanitizeRequest({requestId: "request_safe_123", serviceCategory: "Decks",
    visualDirection: "modern", requestedPurpose: "service_visual"}, ["Decks"]);
  assert.equal(result.serviceCategory, "Decks");
  assert.throws(() => generation.sanitizeRequest({...result, requestId: "request_safe_124",
    serviceCategory: "Invented awards"}, ["Decks"]), /unsupported_service_category/);
  assert.throws(() => generation.sanitizeRequest({...result, requestId: "request_safe_125",
    visualDirection: "raw prompt"}, ["Decks"]), /invalid_visual_direction/);
  assert.throws(() => generation.sanitizeRequest({...result, requestId: "request_safe_126",
    requestedPurpose: "logo"}, ["Decks"]), /invalid_generated_purpose/);
});

test("safe brief excludes people property before-after credentials text and logos", () => {
  const brief = generation.safeBrief({serviceCategory: "Decks", visualDirection: "clean",
    requestedPurpose: "service_visual"}, {primaryColor: "#112233", stylePreset: "clean"});
  for (const exclusion of ["identifiable_people", "real_customer_property", "before_after",
    "credentials_or_awards", "factual_signage", "business_logo", "completed_work_claim"]) {
    assert.ok(brief.exclusions.includes(exclusion));
  }
  assert.equal(brief.embeddedText, "avoid");
});

test("moderation fails closed for people before-after credentials and unsupported claims", () => {
  for (const flag of ["identifiable_people", "before_after", "credential_claim", "unsupported_claim",
    "real_property_transformation"]) assert.equal(generation.normalizeModeration({flags: [flag]}).status, "blocked");
  assert.equal(generation.normalizeModeration({status: "passed"}).status, "passed");
});

test("deterministic local adapter is impossible in staging and production", () => {
  const fixture = Buffer.from("fixture");
  assert.throws(() => generation.deterministicTestAdapter({fixture,
    environment: {projectId: "scaledcircle-staging", emulator: true, nodeEnv: "test"}}), /test_adapter_forbidden/);
  assert.throws(() => generation.deterministicTestAdapter({fixture,
    environment: {projectId: "scaled-circle", emulator: false, nodeEnv: "production"}}), /test_adapter_forbidden/);
  assert.ok(generation.deterministicTestAdapter({fixture,
    environment: {projectId: "demo-scaledcircle", emulator: true, nodeEnv: "test"}}));
});

test("request retry, duplicate processing, approval, and Try another remain distinct", async () => {
  const env = memoryDb(); let providerCalls = 0; let ingests = 0; let approvals = 0;
  const adapter = {id: "test", mode: "test", async generateServiceConcept({jobId}) { providerCalls++;
    return {providerRequestReference: jobId, binary: Buffer.from("fixture"), moderation: {status: "passed"}, usage: {outputs: 1}}; }};
  const service = generation.createGenerationService({db: env, FieldValue: env.FieldValue,
    Timestamp: env.Timestamp, FieldPath: env.FieldPath, adapter, capability: async () => "test_only",
    budgetEnabled: async () => true, approvedServices: async () => ["Decks"],
    ingestCandidate: async ({requestId}) => { ingests++; return {assetId: `asset_${requestId}`, revisionId: `revision_${requestId}`}; },
    approveCandidate: async () => { approvals++; }, now: () => 1_800_000_000_000});
  const actor = {uid: "business-a"}; const input = {requestId: "generation_request_001",
    serviceCategory: "Decks", visualDirection: "clean"};
  const first = await service.request({actor, input}); const replay = await service.request({actor, input});
  assert.equal(first.jobId, replay.jobId); assert.equal(replay.idempotentReplay, true);
  const processed = await service.process({actor, jobId: first.jobId});
  const duplicate = await service.process({actor, jobId: first.jobId});
  assert.equal(processed.revisionId, duplicate.revisionId); assert.equal(providerCalls, 1); assert.equal(ingests, 1);
  await service.approve({actor, input: {jobId: first.jobId}});
  await service.approve({actor, input: {jobId: first.jobId}});
  assert.equal(approvals, 1);
  const another = await service.request({actor, input: {...input, requestId: "generation_request_002"}});
  assert.notEqual(another.jobId, first.jobId);
});

test("capability, budget, tenant, and moderation boundaries fail closed", async () => {
  const base = (overrides = {}) => { const env = memoryDb(); return {env,
    service: generation.createGenerationService({db: env, FieldValue: env.FieldValue, Timestamp: env.Timestamp,
      FieldPath: env.FieldPath, adapter: {id: "test", mode: "test", async generateServiceConcept() {
        return {binary: Buffer.from("x"), moderation: overrides.moderation || {status: "passed"}}; }},
      capability: async () => overrides.capability || "test_only",
      budgetEnabled: async () => overrides.budget !== false, approvedServices: async () => ["Decks"],
      ingestCandidate: async () => ({assetId: "asset", revisionId: "revision"})})}; };
  const input = {requestId: "generation_request_003", serviceCategory: "Decks", visualDirection: "clean"};
  await assert.rejects(base({capability: "disabled"}).service.request({actor: {uid: "a"}, input}), /generation_disabled/);
  await assert.rejects(base({budget: false}).service.request({actor: {uid: "a"}, input}), /budget_disabled/);
  const blocked = base({moderation: {flags: ["identifiable_people"]}});
  const job = await blocked.service.request({actor: {uid: "a"}, input});
  assert.equal((await blocked.service.process({actor: {uid: "a"}, jobId: job.jobId})).status, "blocked");
  await assert.rejects(blocked.service.approve({actor: {uid: "b"}, input: {jobId: job.jobId}}), /generation_access_denied/);
});

test("job cursor is opaque deterministic and rejects malformed input", () => {
  const cursor = generation.encodeCursor(1_800_000_000_000, "visual_job_123");
  assert.deepEqual(generation.decodeCursor(cursor), {createdAt: 1_800_000_000_000, id: "visual_job_123"});
  assert.throws(() => generation.decodeCursor("bad"), /invalid_generation_cursor/);
});

test("daily and active request limits are enforced per tenant", async () => {
  const env = memoryDb(); const now = 1_800_000_000_000;
  const makeService = () => generation.createGenerationService({db: env, FieldValue: env.FieldValue,
    Timestamp: env.Timestamp, FieldPath: env.FieldPath,
    adapter: {id: "test", mode: "test", async generateServiceConcept() {}},
    capability: async () => "test_only", budgetEnabled: async () => true,
    approvedServices: async () => ["Decks"], ingestCandidate: async () => ({}), now: () => now});
  const service = makeService(); const actor = {uid: "limited-business"};
  for (let index = 0; index < 2; index++) await service.request({actor, input: {
    requestId: `active_request_${index}_safe`, serviceCategory: "Decks", visualDirection: "clean"}});
  await assert.rejects(service.request({actor, input: {requestId: "active_request_3_safe",
    serviceCategory: "Decks", visualDirection: "clean"}}), /generation_rate_limited/);
  const dailyActor = {uid: "daily-limited-business"};
  for (let index = 0; index < 8; index++) env.docs.set(`visualGenerationJobs/daily_${index}`, {
    businessUid: dailyActor.uid, status: "approved", createdAt: now - index});
  await assert.rejects(service.request({actor: dailyActor, input: {requestId: "daily_request_9_safe",
    serviceCategory: "Decks", visualDirection: "clean"}}), /generation_rate_limited/);
});

test("job pagination returns 20 + 20 + 5 unique jobs without leaking provider fields", async () => {
  const env = memoryDb(); const actor = {uid: "business-page"};
  for (let index = 0; index < 45; index++) {
    const id = `visual_job_${String(index).padStart(3, "0")}`;
    env.docs.set(`visualGenerationJobs/${id}`, {businessUid: actor.uid, status: "approved",
      serviceCategory: "Decks", visualDirection: "clean", requestedPurpose: "service_visual",
      providerRequestReference: `secret-${index}`, providerUsage: {outputs: 1}, actualCostMicros: 42,
      createdAt: 1_800_000_000_000 - index, updatedAt: 1_800_000_000_000 - index});
  }
  const service = generation.createGenerationService({db: env, FieldValue: env.FieldValue,
    Timestamp: env.Timestamp, FieldPath: env.FieldPath, capability: async () => "disabled",
    budgetEnabled: async () => false, approvedServices: async () => ["Decks"]});
  const first = await service.list({actor});
  const second = await service.list({actor, input: {cursor: first.nextCursor}});
  const third = await service.list({actor, input: {cursor: second.nextCursor}});
  assert.deepEqual([first.jobs.length, second.jobs.length, third.jobs.length], [20, 20, 5]);
  assert.equal(first.hasMore, true); assert.equal(second.hasMore, true); assert.equal(third.hasMore, false);
  assert.equal(new Set([...first.jobs, ...second.jobs, ...third.jobs].map((job) => job.jobId)).size, 45);
  assert.equal(Object.hasOwn(first.jobs[0], "providerRequestReference"), false);
  assert.equal(Object.hasOwn(first.jobs[0], "providerUsage"), false);
  assert.equal(Object.hasOwn(first.jobs[0], "actualCostMicros"), false);
});

test("admin operations run zero-model auth preflight only when explicitly requested", async () => {
  const env = memoryDb(); let preflights = 0;
  const service = generation.createGenerationService({db: env, FieldValue: env.FieldValue,
    Timestamp: env.Timestamp, FieldPath: env.FieldPath, capability: async () => "disabled",
    budgetEnabled: async () => false, providerAuthPreflight: async () => { preflights++;
      return {metadataToken: "PASS", claimsMatch: "PASS", openAIExchange: "PASS", failureCategory: null}; }});
  const ordinary = await service.operations({actor: {uid: "admin", isAdmin: true}});
  assert.equal(ordinary.providerAuthPreflight, null); assert.equal(preflights, 0);
  const diagnostic = await service.operations({actor: {uid: "admin", isAdmin: true},
    input: {providerAuthPreflight: true}});
  assert.equal(diagnostic.providerAuthPreflight.openAIExchange, "PASS"); assert.equal(preflights, 1);
});

test("pre-provider auth failures retain safe categories and operational evidence", async () => {
  const env = memoryDb(); const evidence = []; const transitions = [];
  const adapter = {id: "openai", mode: "external", async generateServiceConcept() {
    const error = new Error("private provider detail"); error.category = "google_claim_mismatch";
    error.outcome = "definitive"; throw error;
  }};
  const service = generation.createGenerationService({db: env, FieldValue: env.FieldValue,
    Timestamp: env.Timestamp, FieldPath: env.FieldPath, adapter, capability: async () => "enabled",
    budgetEnabled: async () => true, approvedServices: async () => ["Seasonal cleanup"],
    ingestCandidate: async () => ({}), reportOperationalFailure: (value) => evidence.push(value),
    budgetAuthority: {reserve: async ({jobId}) => ({jobId, status: "reserved"}),
      release: async ({reservation}) => transitions.push(["released", reservation.jobId]),
      settle: async () => transitions.push(["settled"]), holdUnknown: async () => transitions.push(["unknown"])}});
  const actor = {uid: "business-safe"};
  const job = await service.request({actor, input: {requestId: "wif_failure_request_001",
    serviceCategory: "Seasonal cleanup", visualDirection: "clean"}});
  await assert.rejects(service.process({actor, jobId: job.jobId}), /google_claim_mismatch/);
  assert.equal(env.docs.get(`visualGenerationJobs/${job.jobId}`).failureCategory, "google_claim_mismatch");
  assert.deepEqual(evidence, [{jobId: job.jobId, category: "google_claim_mismatch",
    phase: "provider_or_ingestion", providerRequestReferencePresent: false}]);
  assert.deepEqual(transitions, [["released", job.jobId]]);
  assert.equal(JSON.stringify(evidence).includes("private provider detail"), false);
});
