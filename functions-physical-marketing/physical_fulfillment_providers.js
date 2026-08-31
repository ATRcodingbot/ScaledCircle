"use strict";

const crypto = require("node:crypto");

const PRINT_PROVIDER_METHODS = Object.freeze([
  "getCapabilities", "validateArtifact", "quote", "createOrder", "getOrder",
  "cancelOrder", "getProof", "verifyWebhook", "reconcileStatus",
]);
const MAIL_PROVIDER_METHODS = Object.freeze([
  ...PRINT_PROVIDER_METHODS, "verifyAddresses", "quoteMailing", "createMailCampaign", "scheduleSend",
]);

function text(value, maximum = 160) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function requestHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value, Object.keys(value || {}).sort()))
    .digest("hex");
}

function assertProvider(provider, kind = "print") {
  const methods = kind === "mail" ? MAIL_PROVIDER_METHODS : PRINT_PROVIDER_METHODS;
  if (!provider || !text(provider.id, 80) || !["sandbox", "live", "mock"].includes(provider.environment)) {
    throw new Error("physical_provider_invalid");
  }
  for (const method of methods) if (typeof provider[method] !== "function") {
    throw new Error(`physical_provider_method_missing:${method}`);
  }
  return provider;
}

function normalizeQuote(quote, now = Date.now()) {
  const money = ["providerSubtotal", "shipping", "postage", "tax"];
  if (!quote || !text(quote.providerQuoteId, 160) || quote.currency !== "USD" ||
      !Number.isFinite(Number(quote.expiresAt)) || Number(quote.expiresAt) <= now) {
    throw new Error("physical_provider_quote_invalid");
  }
  for (const name of money) if (!Number.isInteger(quote[name]) || quote[name] < 0) {
    throw new Error("physical_provider_quote_invalid");
  }
  return {...quote, providerQuoteId: text(quote.providerQuoteId, 160), expiresAt: Number(quote.expiresAt)};
}

function createMockPrintProvider({now = () => Date.now()} = {}) {
  const quotes = new Map(); const orders = new Map(); const idempotency = new Map();
  return assertProvider({
    id: "mock_print", environment: "mock",
    async getCapabilities() {
      return {fulfillmentClasses: ["ship_to_business"], products: ["door_hanger_3_5x8_5"],
        pickupIntegrated: false};
    },
    async validateArtifact(input) {
      return {valid: input?.preflight?.status === "pass", providerProfile: "mock-v1"};
    },
    async quote(input) {
      const key = requestHash(input); if (quotes.has(key)) return quotes.get(key);
      const result = normalizeQuote({providerQuoteId: `mock_quote_${key.slice(0, 24)}`, currency: "USD",
        providerSubtotal: 5000, shipping: 1200, postage: 0, tax: 400, expiresAt: now() + 3600000}, now());
      quotes.set(key, result); return result;
    },
    async createOrder(input) {
      const key = text(input?.idempotencyKey, 160);
      if (!key) throw new Error("physical_provider_idempotency_required");
      if (idempotency.has(key)) return idempotency.get(key);
      const quote = normalizeQuote(input.quote, now());
      const result = {providerOrderId: `mock_order_${requestHash({key, quote: quote.providerQuoteId}).slice(0, 24)}`,
        status: "submitted", accepted: true};
      idempotency.set(key, result); orders.set(result.providerOrderId, result); return result;
    },
    async getOrder(input) { return orders.get(input?.providerOrderId) || null; },
    async cancelOrder(input) {
      const order = orders.get(input?.providerOrderId); if (!order) return {canceled: false};
      const result = {...order, status: "canceled", canceled: true}; orders.set(order.providerOrderId, result);
      return result;
    },
    async getProof() { return {available: true, url: null, mock: true}; },
    async verifyWebhook() { return {verified: true, mock: true}; },
    async reconcileStatus(input) { return orders.get(input?.providerOrderId) || {status: "unknown_provider_outcome"}; },
  });
}

module.exports = {
  PRINT_PROVIDER_METHODS, MAIL_PROVIDER_METHODS, requestHash, assertProvider, normalizeQuote,
  createMockPrintProvider,
};
