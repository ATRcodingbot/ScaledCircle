"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const adapterModule = require("./openai_image_adapter");

const enabled = {providerGenerationEnabled: true, pricing: {imageOutputUsdPerMillion: 30}, estimatedCostMicros: 41000};
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
  const prompt = adapterModule.buildPrompt({serviceCategory: "Decks"});
  for (const value of ["No people", "generic", "No people, faces", "before-and-after"]) assert.match(prompt, new RegExp(value, "i"));
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
