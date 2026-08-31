"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const adapterModule = require("./openai_image_adapter");

const enabled = {providerGenerationEnabled: true, pricing: {imageOutputUsdPerMillion: 30}, estimatedCostMicros: 41000};
const wifConfig = {openAIIdentityProviderId: "idp_test", openAIServiceAccountId: "user_test",
  openAIWifAudience: adapterModule.DEFAULT_WIF_AUDIENCE, openAIMappedSubject: "123456789"};
function jwt(claims = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({alg: "RS256", typ: "JWT"})}.${encode({iss: adapterModule.GOOGLE_OIDC_ISSUER,
    aud: adapterModule.DEFAULT_WIF_AUDIENCE, sub: "123456789", email: "runtime@example.iam.gserviceaccount.com",
    email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600, ...claims})}.signature`;
}
function metadataFetch({ok = true, body = jwt(), status = ok ? 200 : 500, inspect = null} = {}) {
  return async (url, options) => { if (inspect) inspect(url, options); return {ok, status, text: async () => body}; };
}
function client(response, errors = []) { let calls = 0; return {get calls() { return calls; }, images: {async generate(input, options) {
  calls++; assert.equal(input.model, adapterModule.DEFAULT_SNAPSHOT); assert.equal(input.size, "1536x1024");
  assert.equal(input.quality, "medium"); assert.equal(options.maxRetries, 0); if (errors.length) throw errors.shift(); return response;}},
moderations: {async create() { return {results: [{flagged: false}]}; }}}; }
function service(api, config = enabled, options = {}) { return adapterModule.createOpenAIImageAdapter({clientFactory: async () => api,
  configProvider: async () => config, sleep: async () => {}, ...options}); }

test("maps the safe provider-neutral brief to pinned GPT-Image-2 defaults", async () => {
  const api = client({data: [{b64_json: Buffer.from("image").toString("base64")}], _request_id: "req_safe",
    usage: {output_tokens_details: {image_tokens: 1000}}});
  const result = await service(api).generateServiceConcept({jobId: "job_1", brief: {serviceCategory: "Decks", visualDirection: "clean"}});
  assert.equal(result.modelSnapshot, "gpt-image-2-2026-04-21"); assert.equal(result.providerRequestReference, "req_safe");
  assert.equal(result.cost.actualCostMicros, 30000); assert.equal(api.calls, 1);
  const prompt = adapterModule.buildPrompt({serviceCategory: "Build decks",
    visualSubject: "a pristine, professionally constructed residential deck",
    workmanship: "physically plausible professional execution",
    composition: "portrait print composition with a narrow door-hanger crop",
    serviceAreaVisualContext: {areaLabel: "Frederick County, Maryland",
      propertyStyle: "detached residential", terrain: "gently rolling",
      vegetation: "Mid-Atlantic deciduous vegetation"}});
  for (const value of ["No people", "before-and-after", "Frederick County", "pristine",
    "physically plausible", "door-hanger crop", "specific real home", "mansion bias"]) {
    assert.match(prompt, new RegExp(value, "i"));
  }
  for (const unsafe of ["resident name", "recipient", "income", "race", "religion", "123 Main Street"]) {
    assert.doesNotMatch(prompt, new RegExp(unsafe, "i"));
  }
});

test("provider remains disabled without any client creation or external call", async () => {
  let clients = 0; const adapter = adapterModule.createOpenAIImageAdapter({clientFactory: async () => { clients++; },
    configProvider: async () => ({providerGenerationEnabled: false})});
  await assert.rejects(adapter.generateServiceConcept({jobId: "job", brief: {}}), /generation_disabled/);
  assert.equal(clients, 0);
});

test("moderation block, invalid and malformed output fail closed", async () => {
  const moderationClient = client({data: [{b64_json: Buffer.from("image").toString("base64")}]});
  moderationClient.moderations.create = async () => ({results: [{flagged: true}]});
  await assert.rejects(service(moderationClient).generateServiceConcept({jobId: "job", brief: {}}), /moderation_blocked/);
  await assert.rejects(service(client({data: []})).generateServiceConcept({jobId: "job", brief: {}}), /invalid_output/);
  assert.equal(adapterModule.classify({status: 400}).category, "invalid_request");
});

test("429 and pre-dispatch transport errors retry with bounded backoff", async () => {
  const api = client({data: [{b64_json: Buffer.from("image").toString("base64")}]}, [{status: 429}, {code: "network", requestSent: false}]);
  await service(api, {...enabled, secondaryModerationEnabled: false}).generateServiceConcept({jobId: "job", brief: {}});
  assert.equal(api.calls, 3);
});

test("5xx and post-dispatch timeout are indeterminate and never retried", async () => {
  for (const failure of [{status: 503}, {code: "timeout", requestSent: true}]) {
    const api = client({}, [failure]); const error = await service(api).generateServiceConcept({jobId: "job", brief: {}}).catch((e) => e);
    assert.equal(error.outcome, "unknown_provider_outcome"); assert.equal(api.calls, 1);
  }
});

test("cost is calculated only from server-side provider usage and pricing", () => {
  const usage = adapterModule.normalizeUsage({input_tokens_details: {text_tokens: 10, image_tokens: 20},
    output_tokens_details: {image_tokens: 1000}});
  assert.deepEqual(usage, {textInputTokens: 10, imageInputTokens: 20, imageOutputTokens: 1000});
  assert.equal(adapterModule.calculateCostMicros(usage, {imageOutputUsdPerMillion: 30}), 30000);
});

test("official Google metadata request and OpenAI exchange preflight return safe claims only", async () => {
  let request = null; let exchange = null;
  const result = await adapterModule.runOpenAIWifPreflight({config: wifConfig,
    fetchImpl: metadataFetch({inspect: (url, options) => { request = {url, options}; }}),
    exchangeToken: async (input) => { exchange = input; return "short-lived-access-token"; }});
  const url = new URL(request.url);
  assert.equal(url.searchParams.get("audience"), adapterModule.DEFAULT_WIF_AUDIENCE);
  assert.equal(url.searchParams.get("format"), "full");
  assert.equal(request.options.headers["Metadata-Flavor"], "Google");
  assert.equal(exchange.identityProviderId, "idp_test");
  assert.equal(exchange.serviceAccountId, "user_test");
  assert.equal(exchange.subjectToken.split(".").length, 3);
  assert.deepEqual(result, {metadataToken: "PASS", claimsMatch: "PASS", openAIExchange: "PASS",
    failureCategory: null, claims: {issuer: adapterModule.GOOGLE_OIDC_ISSUER,
      audience: adapterModule.DEFAULT_WIF_AUDIENCE, subject: "123456789",
      email: "runtime@example.iam.gserviceaccount.com", emailVerified: true,
      expiresAtMillis: result.claims.expiresAtMillis}});
  assert.equal(JSON.stringify(result).includes("short-lived-access-token"), false);
  assert.equal(JSON.stringify(result).includes(exchange.subjectToken), false);
});

test("WIF config validation rejects each missing required value", () => {
  for (const field of ["openAIIdentityProviderId", "openAIServiceAccountId", "openAIWifAudience", "openAIMappedSubject"]) {
    const config = {...wifConfig}; delete config[field];
    assert.throws(() => adapterModule.validatedWifConfig(config), (error) => error.category === "wif_config_missing");
  }
});

test("metadata failures and malformed tokens receive safe operational categories", async () => {
  await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
    fetchImpl: metadataFetch({ok: false}), exchangeToken: async () => "token"}),
  (error) => error.category === "google_metadata_unavailable");
  await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
    fetchImpl: metadataFetch({body: ""}), exchangeToken: async () => "token"}),
  (error) => error.category === "google_subject_token_invalid");
  await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
    fetchImpl: metadataFetch({body: "not-a-jwt"}), exchangeToken: async () => "token"}),
  (error) => error.category === "google_subject_token_invalid");
});

test("issuer, audience, subject, verification and expiry mismatches fail before exchange", async () => {
  const variants = [{iss: "https://issuer.invalid"}, {aud: "https://wrong.example"}, {sub: "other-subject"},
    {email_verified: false}, {exp: Math.floor(Date.now() / 1000) - 10}];
  for (const claims of variants) {
    let exchanged = false;
    await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
      fetchImpl: metadataFetch({body: jwt(claims)}), exchangeToken: async () => { exchanged = true; return "token"; }}),
    (error) => error.category === "google_claim_mismatch");
    assert.equal(exchanged, false);
  }
});

test("OpenAI mapping and authentication exchange failures are classified without credentials", async () => {
  for (const failure of [{status: 400, expected: "openai_wif_exchange_failed"},
    {status: 401, expected: "openai_auth_rejected"}, {status: 403, expected: "openai_auth_rejected"}]) {
    await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
      fetchImpl: metadataFetch(), exchangeToken: async () => { const error = new Error("provider detail");
        error.status = failure.status; throw error; }}), (error) => error.category === failure.expected);
  }
  await assert.rejects(adapterModule.runOpenAIWifPreflight({config: wifConfig,
    fetchImpl: metadataFetch(), exchangeToken: async () => ""}),
  (error) => error.category === "openai_wif_exchange_failed");
});

test("OpenAI client initialization uses the JWT metadata provider and fails safely", async () => {
  class FakeOpenAI { constructor(options) { this.options = options; } }
  const api = adapterModule.createOpenAIWifClient({config: wifConfig, OpenAI: FakeOpenAI,
    fetchImpl: metadataFetch()});
  assert.equal(api.options.workloadIdentity.identityProviderId, "idp_test");
  assert.equal(api.options.workloadIdentity.provider.tokenType, "jwt");
  await assert.doesNotReject(api.options.workloadIdentity.provider.getToken());
  assert.throws(() => adapterModule.createOpenAIWifClient({config: wifConfig,
    OpenAI: class { constructor() { throw new Error("constructor failed"); } }}),
  (error) => error.category === "provider_client_initialization_failed");
});
