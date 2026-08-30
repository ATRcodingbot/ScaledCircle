"use strict";

const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SNAPSHOT = "gpt-image-2-2026-04-21";
const DEFAULT_SIZE = "1536x1024";
const DEFAULT_QUALITY = "medium";
const RETRYABLE = new Set(["rate_limited", "provider_unavailable"]);

class ProviderAdapterError extends Error {
  constructor(category, {outcome = "definitive", providerRequestId = null, cause = null} = {}) {
    super(category); this.name = "ProviderAdapterError"; this.category = category;
    this.outcome = outcome; this.providerRequestId = providerRequestId; this.cause = cause;
  }
}

function buildPrompt(brief = {}) {
  const category = String(brief.serviceCategory || "professional service").slice(0, 80);
  const direction = String(brief.visualDirection || "clean").slice(0, 24);
  return [
    `Create one professional ${direction} landscape service-concept image for ${category}.`,
    "Show an empty, generic residential or commercial work setting, service materials, and the service subject.",
    "The property must be generic and must not imply it belongs to a customer or this Business.",
    "No people, faces, crews, logos, readable text, signage, credentials, awards, ratings, reviews, guarantees,",
    "before-and-after composition, or claim that the depicted work was completed by the Business.",
    "Compose for a landing-page hero with a safe central crop and useful negative space.",
  ].join(" ");
}

function classify(error) {
  if (error instanceof ProviderAdapterError) return error;
  const status = Number(error?.status || error?.response?.status || 0);
  const requestId = error?.request_id || error?._request_id || error?.headers?.get?.("x-request-id") || null;
  const code = String(error?.code || "").toLowerCase();
  if (status === 429) return new ProviderAdapterError("rate_limited", {outcome: "safe_to_retry", providerRequestId: requestId, cause: error});
  if (status >= 500) return new ProviderAdapterError("provider_unavailable", {outcome: "unknown_provider_outcome", providerRequestId: requestId, cause: error});
  if (code.includes("timeout") || error?.name === "AbortError") return new ProviderAdapterError("timeout", {
    outcome: error?.requestSent === false ? "safe_to_retry" : "unknown_provider_outcome", providerRequestId: requestId, cause: error});
  if (status === 400 || status === 404 || status === 422) return new ProviderAdapterError("invalid_request", {cause: error});
  if (code.includes("content_policy") || code.includes("moderation")) return new ProviderAdapterError("moderation_blocked", {cause: error});
  return new ProviderAdapterError("provider_unavailable", {outcome: error?.requestSent === false ? "safe_to_retry" : "unknown_provider_outcome", providerRequestId: requestId, cause: error});
}

function normalizeUsage(usage = {}) {
  const input = usage.input_tokens_details || {};
  const output = usage.output_tokens_details || {};
  return {textInputTokens: Number(input.text_tokens || 0), imageInputTokens: Number(input.image_tokens || 0),
    imageOutputTokens: Number(output.image_tokens || usage.output_tokens || 0)};
}

function calculateCostMicros(usage, rates = {}) {
  const total = (usage.textInputTokens * Number(rates.textInputUsdPerMillion || 0) +
    usage.imageInputTokens * Number(rates.imageInputUsdPerMillion || 0) +
    usage.imageOutputTokens * Number(rates.imageOutputUsdPerMillion || 0)) / 1_000_000;
  return Number.isFinite(total) ? Math.round(total * 1_000_000) : null;
}

function createOpenAIImageAdapter({clientFactory, configProvider, sleep = async () => {}, maxRetries = 2}) {
  if (typeof clientFactory !== "function" || typeof configProvider !== "function") throw new Error("invalid_openai_adapter_config");
  return Object.freeze({id: "openai_gpt_image", mode: "external", executionMode: "synchronous",
    defaultModel: DEFAULT_MODEL, defaultModelSnapshot: DEFAULT_SNAPSHOT,
    async generateServiceConcept({jobId, brief}) {
      const config = await configProvider();
      if (config?.providerGenerationEnabled !== true) throw new ProviderAdapterError("generation_disabled");
      const client = await clientFactory(config); const model = config.model || DEFAULT_MODEL;
      const modelSnapshot = config.modelSnapshot || DEFAULT_SNAPSHOT; const requestTimestamp = Date.now();
      let response; let attempt = 0;
      while (true) {
        try {
          response = await client.images.generate({model: modelSnapshot, prompt: buildPrompt(brief), n: 1,
            size: config.size || DEFAULT_SIZE, quality: config.quality || DEFAULT_QUALITY,
            output_format: config.outputFormat || "webp", moderation: "auto"}, {maxRetries: 0,
            timeout: Number(config.timeoutMs || 120000), headers: {"X-Client-Request-Id": jobId}});
          break;
        } catch (raw) {
          const error = classify(raw);
          if (error.outcome !== "safe_to_retry" || !RETRYABLE.has(error.category) || attempt >= maxRetries) throw error;
          await sleep(Math.min(4000, 250 * (2 ** attempt++)));
        }
      }
      const encoded = response?.data?.[0]?.b64_json;
      if (typeof encoded !== "string" || encoded.length < 8) throw new ProviderAdapterError("invalid_output");
      const binary = Buffer.from(encoded, "base64");
      if (!binary.length) throw new ProviderAdapterError("invalid_output");
      if (config.secondaryModerationEnabled !== false && client.moderations?.create) {
        const moderation = await client.moderations.create({model: "omni-moderation-latest", input: [{type: "image_url",
          image_url: {url: `data:image/webp;base64,${encoded}`}}]}, {maxRetries: 0});
        if (moderation?.results?.some((value) => value.flagged === true)) throw new ProviderAdapterError("moderation_blocked");
      }
      const usage = normalizeUsage(response.usage); const actualCostMicros = calculateCostMicros(usage, config.pricing);
      return {binary, moderation: {status: "passed", flags: []}, providerRequestReference: response._request_id || null,
        usage, cost: {estimatedCostMicros: Number(config.estimatedCostMicros || 41000), actualCostMicros},
        provider: "openai", model, modelSnapshot, requestTimestamp};
    }});
}

module.exports = {DEFAULT_MODEL, DEFAULT_SNAPSHOT, DEFAULT_SIZE, DEFAULT_QUALITY, ProviderAdapterError,
  buildPrompt, classify, normalizeUsage, calculateCostMicros, createOpenAIImageAdapter};
