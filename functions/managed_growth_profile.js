"use strict";

const crypto = require("node:crypto");

const PROFILE_SCHEMA_VERSION = "BusinessGrowthProfileV1";
const ARTIFACT_SCHEMA_VERSION = "ManagedGrowthArtifactV1";
const PROMPT_VERSION = "ManagedGrowthArtifactPromptV1";
const RATE_POLICY_VERSION = "ManagedGrowthArtifactRatePolicyV1";
const MODEL = "gpt-5.6-terra";
const ALLOWED_ARTIFACT_TYPES = new Set([
  "business_analysis", "growth_plan_30_day", "social_package", "seo_plan",
  "advertising_plan", "email_sequence", "direct_mail_plan",
]);
const QA_DAILY_CAP = 8;
const QA_MONTHLY_CAP = 40;
const STANDARD_DAILY_CAP = 12;
const STANDARD_MONTHLY_CAP = 80;
const WEBSITE_SERVICE_TERMS = Object.freeze([
  "decks", "fences", "remodeling", "roofing", "siding", "painting",
  "flooring", "windows", "doors", "landscaping", "plumbing", "electrical",
  "heating", "air conditioning", "concrete", "masonry", "kitchens", "bathrooms",
]);

function text(value, maximum = 1200) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}
function list(value, maximumItems = 40, maximumLength = 240) {
  return Array.isArray(value) ? value.slice(0, maximumItems)
    .map((item) => text(item, maximumLength)).filter(Boolean) : [];
}

const LIST_FIELDS = new Set([
  "serviceAreas", "servicesOffered", "priorityServices", "servicesNotOffered",
  "targetCustomers", "differentiators", "claimsToAvoid", "localKeywords",
  "socialUrls", "seoTargets", "emailAudience", "preferredChannels",
  "channelsToAvoid", "contentThemes",
]);
const TEXT_FIELDS = new Set([
  "businessName", "businessDescription", "website", "primaryPhone", "primaryCta",
  "valueProposition", "brandVoice", "preferredEmailFrequency", "plannedAdBudget",
  "directMailOffer", "directMailCta", "postingFrequency",
]);

function sanitizeProfile(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("invalid_business_growth_profile");
  }
  const systemFields = new Set(["businessUid", "schemaVersion", "profileVersion", "updatedBy",
    "updatedAt", "createdAt"]);
  const unknown = Object.keys(input).filter((key) =>
    !LIST_FIELDS.has(key) && !TEXT_FIELDS.has(key) && !systemFields.has(key));
  if (unknown.length) throw new Error("unsupported_business_growth_profile_field");
  const result = {};
  for (const key of TEXT_FIELDS) result[key] = text(input[key]);
  for (const key of LIST_FIELDS) result[key] = list(input[key]);
  const serialized = JSON.stringify(result);
  if (/password|secret|api[_ -]?key|social security|\bssn\b/i.test(serialized)) {
    throw new Error("sensitive_business_growth_profile_field");
  }
  return result;
}

function isProfileReady(profile) {
  return Boolean(profile?.businessName && profile?.businessDescription &&
    profile?.servicesOffered?.length && profile?.serviceAreas?.length);
}

function sanitizeGenerationRequest(input = {}) {
  const artifactType = text(input.artifactType, 60);
  if (!ALLOWED_ARTIFACT_TYPES.has(artifactType)) throw new Error("invalid_growth_artifact_type");
  const mode = ["organic_only", "organic_paid_planning", "custom"].includes(input.mode) ?
    input.mode : "organic_only";
  const plannedBudget = Number(input.plannedBudget);
  return {
    artifactType,
    instruction: text(input.instruction, 1200),
    mode,
    platforms: list(input.platforms, 8, 60),
    audience: text(input.audience, 300),
    plannedBudget: Number.isFinite(plannedBudget) && plannedBudget >= 0 ? plannedBudget : null,
    propertyContext: input.propertyContext && typeof input.propertyContext === "object" ? {
      analysisId: text(input.propertyContext.analysisId, 100),
      geometryDigest: text(input.propertyContext.geometryDigest, 100),
      propertyCount: Number(input.propertyContext.propertyCount) || null,
      businessObjective: text(input.propertyContext.businessObjective, 500),
    } : null,
  };
}

function buildGenerationContext({profile, profileVersion, request, authoritative = {}, discovery = null}) {
  if (!isProfileReady(profile)) throw new Error("business_growth_profile_incomplete");
  const confirmedAreaNames = discovery && Array.isArray(discovery.areas) ? discovery.areas
    .filter((area) => area?.enabled !== false).map((area) => text(area.name, 100)).filter(Boolean) : [];
  const effectiveProfile = discovery ? {...profile,
    serviceAreas: confirmedAreaNames,
    priorityServices: list(discovery.priorityServices),
    servicesNotOffered: list(discovery.excludedServices)} : profile;
  return {
    contextVersion: "ManagedGrowthGenerationContextV1",
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    profileVersion,
    businessProfile: effectiveProfile,
    discoveryPreferences: discovery ? {
      schemaVersion: text(discovery.schemaVersion, 80),
      areasAreIndependent: true,
      areas: Array.isArray(discovery.areas) ? discovery.areas.filter((area) => area?.enabled !== false)
        .slice(0, 8).map((area) => ({name: text(area.name, 100), type: text(area.type, 40),
          centerLabel: text(area.centerLabel, 100), places: list(area.places, 20, 100),
          postalCodes: list(area.postalCodes, 30, 12),
          radiusMiles: Number(area.radiusMiles) || null, relationship: "independent"})) : [],
      priorityServices: list(discovery.priorityServices),
      excludedServices: list(discovery.excludedServices),
    } : null,
    request: sanitizeGenerationRequest(request),
    authoritative: {
      property: authoritative.property || null,
      weather: authoritative.weather || null,
      campaignPerformance: authoritative.campaignPerformance || null,
    },
    boundaries: {
      unknownValuesRemainUnknown: true,
      noLicensesAwardsRatingsProjectsTestimonialsGuaranteesOrServiceAreasMayBeInvented: true,
      savedServiceAreasAreIndependentRulesAndMustNotBeMergedIntoOneGeometry: true,
      radiusWordingRequiresTheSavedRadiusAndAConfirmedCenterLabel: true,
      outputIsDraftOnly: true,
      noPublishingSendingOrderingFundingSpendingOrAssignment: true,
      plannedBudgetIsNotActualSpend: true,
      actualAdSpendConnected: false,
      directMailCostsRemainSeparate: true,
      directMailManagementFeeBasisPoints: 2000,
      imageGenerationIncluded: false,
    },
  };
}

const RESPONSE_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["title", "summary", "sections", "limitations", "creativeBriefs"],
  properties: {
    title: {type: "string"}, summary: {type: "string"},
    sections: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["heading", "content"], properties: {heading: {type: "string"}, content: {type: "string"}}}},
    limitations: {type: "array", items: {type: "string"}},
    creativeBriefs: {type: "array", items: {type: "object", additionalProperties: false,
      required: ["title", "brief"], properties: {title: {type: "string"}, brief: {type: "string"}}}},
  },
});

function validateArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("malformed_growth_artifact");
  const sections = Array.isArray(value.sections) ? value.sections.slice(0, 60).map((section) => ({
    heading: text(section?.heading, 180), content: text(section?.content, 8000),
  })).filter((section) => section.heading && section.content) : [];
  if (!sections.length) throw new Error("empty_growth_artifact");
  return {title: text(value.title, 240), summary: text(value.summary, 2400), sections,
    limitations: list(value.limitations, 30, 600), creativeBriefs: Array.isArray(value.creativeBriefs) ?
      value.creativeBriefs.slice(0, 30).map((brief) => ({title: text(brief?.title, 180), brief: text(brief?.brief, 1600)})) : []};
}

function cacheIdentity(context) {
  return crypto.createHash("sha256").update(JSON.stringify({context, promptVersion: PROMPT_VERSION})).digest("hex");
}
function rateLimitWindows(now = Date.now()) {
  const date = new Date(now);
  return {day: date.toISOString().slice(0, 10), month: date.toISOString().slice(0, 7)};
}
function rateCaps(source) {
  return source === "internal_qa" ? {daily: QA_DAILY_CAP, monthly: QA_MONTHLY_CAP} :
    {daily: STANDARD_DAILY_CAP, monthly: STANDARD_MONTHLY_CAP};
}

function validatePublicWebsite(value) {
  let url;
  try { url = new URL(text(value, 2048)); }
  catch (_) { throw new Error("invalid_website_url"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443")) throw new Error("invalid_website_url");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") ||
      hostname.endsWith(".internal") || hostname === "0.0.0.0" || hostname === "::1") {
    throw new Error("private_website_url");
  }
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    const privateAddress = octets.some((item) => item > 255) || octets[0] === 10 ||
      octets[0] === 127 || octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
    if (privateAddress) throw new Error("private_website_url");
  }
  url.hash = "";
  return url;
}

function isPrivateAddress(address) {
  const normalized = text(address, 80).toLowerCase();
  if (!normalized || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  return octets.some((item) => item > 255) || octets[0] === 10 || octets[0] === 127 ||
    octets[0] === 0 || (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function decodeHtml(value) {
  return text(value, 4000).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractWebsiteSuggestions(html, website) {
  const source = text(html, 300000);
  const plain = decodeHtml(source.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
  const title = decodeHtml(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = decodeHtml(source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ||
    source.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] || "");
  const phone = plain.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0] || "";
  const lower = plain.toLowerCase();
  const services = WEBSITE_SERVICE_TERMS.filter((service) => lower.includes(service));
  return {website: validatePublicWebsite(website).toString(), title: text(title, 180),
    description: text(description, 600), phone: text(phone, 40), services,
    serviceAreas: [], confirmationRequired: true};
}

module.exports = {PROFILE_SCHEMA_VERSION, ARTIFACT_SCHEMA_VERSION, PROMPT_VERSION,
  RATE_POLICY_VERSION, MODEL, ALLOWED_ARTIFACT_TYPES, QA_DAILY_CAP, QA_MONTHLY_CAP,
  RESPONSE_SCHEMA, sanitizeProfile, isProfileReady, sanitizeGenerationRequest,
  buildGenerationContext, validateArtifact, cacheIdentity, rateLimitWindows, rateCaps,
  validatePublicWebsite, isPrivateAddress, extractWebsiteSuggestions};
