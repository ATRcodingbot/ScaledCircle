"use strict";

const SCHEMA_VERSION = "ServiceAreaPreferencesV1";
const BUSINESS_SCHEMA_VERSION = "BusinessDiscoveryPreferencesV1";
const SCALER_SCHEMA_VERSION = "ScalerDiscoveryPreferencesV1";
const MATCH_VERSION = "OpportunityMatchV1";
const MAX_AREAS = 8;
const MAX_POINTS = 100;
const MAX_GOALS = 20;
const BUSINESS_OUTSIDE = new Set(["none", "nearby", "maryland", "followed"]);
const SCALER_TRAVEL = new Set(["never", "nearby", "worth_drive", "up_to_miles", "anywhere"]);
const AREA_TYPES = new Set(["around_business", "place", "postal_codes", "drawn"]);
const JOB_TYPES = new Set(["flyer_distribution", "door_hangers", "material_pickup",
  "crew_jobs", "short_local", "long_high_paying", "door_to_door"]);

function text(value, max = 160) {
  return value == null ? "" : String(value).trim().slice(0, max);
}
function list(value, max = 30, itemMax = 100) {
  return Array.isArray(value) ? value.slice(0, max).map((item) => text(item, itemMax))
    .filter(Boolean) : [];
}
function point(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {latitude, longitude};
}
function bounds(value) {
  if (!value || typeof value !== "object") return null;
  const output = {south: Number(value.south), north: Number(value.north),
    west: Number(value.west), east: Number(value.east)};
  return Object.values(output).every(Number.isFinite) ? output : null;
}
function sanitizeArea(value, index) {
  if (!value || typeof value !== "object") throw new Error("invalid_service_area");
  const type = text(value.type, 30);
  if (!AREA_TYPES.has(type)) throw new Error("invalid_service_area_type");
  const geometry = Array.isArray(value.geometry) ? value.geometry.slice(0, MAX_POINTS)
    .map(point).filter(Boolean) : [];
  if (type === "drawn" && geometry.length < 3) throw new Error("drawn_area_requires_geometry");
  const radiusMiles = Number(value.radiusMiles);
  const center = point(value.center);
  if (type === "around_business" && (!center || !Number.isFinite(radiusMiles) ||
      radiusMiles < 1 || radiusMiles > 250)) throw new Error("radius_area_requires_center");
  return {id: text(value.id, 80) || `area_${index + 1}`, name: text(value.name, 100) ||
    `Service Area ${index + 1}`, type, primary: value.primary === true, enabled: value.enabled !== false,
  centerLabel: text(value.centerLabel, 100), places: list(value.places, 20, 100),
  postalCodes: list(value.postalCodes, 30, 12),
  center, radiusMiles: center && Number.isFinite(radiusMiles) ? Math.round(radiusMiles * 10) / 10 : null,
  geometry, areaType: text(value.areaType, 30) || type, displayName: text(value.displayName, 160),
  city: text(value.city, 100), county: text(value.county, 100), state: text(value.state, 100),
  postalCode: text(value.postalCode, 20), bounds: bounds(value.bounds),
  resolutionSource: text(value.resolutionSource, 80),
  resolutionVersion: text(value.resolutionVersion, 80)};
}
function sanitizeGoal(value, index) {
  if (!value || typeof value !== "object") throw new Error("invalid_business_goal");
  return {id: text(value.id, 80) || `goal_${index + 1}`, label: text(value.label, 160),
    service: text(value.service, 100), enabled: value.enabled !== false,
    custom: value.custom === true, schemaVersion: "BusinessOpportunityGoalV1"};
}
function notificationDefaults(role) {
  return role === "business" ? {weatherInMyAreas: true, propertyOpportunities: true,
    campaignActivity: true, managedGrowthReminders: true, outsideMyAreas: false} :
    {newJobsInMyAreas: true, travelOpportunities: false, crewOpportunities: false,
      materialPickupJobs: true, doorToDoorOpportunities: false};
}
function sanitizeNotifications(role, value) {
  const defaults = notificationDefaults(role);
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.keys(defaults).map((key) => [key,
    typeof input[key] === "boolean" ? input[key] : defaults[key]]));
}
function sanitizeAlertDelivery(role, value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    inApp: input.inApp !== false,
    email: role === "scaler" && input.email === true,
    push: false,
    emailFrequency: "immediate",
  };
}
function sanitizePreferences(input, authoritativeRole) {
  if (!input || typeof input !== "object" || !["business", "scaler"].includes(authoritativeRole)) {
    throw new Error("invalid_discovery_preferences");
  }
  const areas = Array.isArray(input.areas) ? input.areas.slice(0, MAX_AREAS)
    .map(sanitizeArea) : [];
  if (areas.filter((area) => area.primary).length > 1) throw new Error("multiple_primary_areas");
  const base = {schemaVersion: SCHEMA_VERSION, role: authoritativeRole, areas,
    notifications: sanitizeNotifications(authoritativeRole, input.notifications),
    alertDelivery: sanitizeAlertDelivery(authoritativeRole, input.alertDelivery)};
  if (authoritativeRole === "business") return {...base,
    roleSchemaVersion: BUSINESS_SCHEMA_VERSION,
    priorityServices: list(input.priorityServices), otherServices: list(input.otherServices),
    excludedServices: list(input.excludedServices), outsideOpportunityScope:
      BUSINESS_OUTSIDE.has(input.outsideOpportunityScope) ? input.outsideOpportunityScope : "none",
    savedGoals: Array.isArray(input.savedGoals) ? input.savedGoals.slice(0, MAX_GOALS)
      .map(sanitizeGoal).filter((goal) => goal.label) : [],
    preferredCampaignTypes: list(input.preferredCampaignTypes, 10, 60),
    defaultResponseGoal: text(input.defaultResponseGoal, 160)};
  const travelMode = SCALER_TRAVEL.has(input.travelMode) ? input.travelMode : "nearby";
  const maxTravelMiles = Number(input.maxTravelMiles);
  const jobTypes = list(input.jobTypes).filter((item) => JOB_TYPES.has(item));
  const outreachOptIn = input.outreachOptIn === true;
  return {...base, roleSchemaVersion: SCALER_SCHEMA_VERSION, jobTypes,
    travelMode, maxTravelMiles: Number.isFinite(maxTravelMiles) && maxTravelMiles >= 1 &&
      maxTravelMiles <= 500 ? maxTravelMiles : 20, crewOptIn: input.crewOptIn === true,
    outreachOptIn, notifications: {...base.notifications,
      doorToDoorOpportunities: outreachOptIn && base.notifications.doorToDoorOpportunities}};
}
function radians(value) { return value * Math.PI / 180; }
function distanceMiles(a, b) {
  if (!a || !b) return null;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function insidePolygon(target, polygon) {
  if (!target || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude; const yi = polygon[i].latitude;
    const xj = polygon[j].longitude; const yj = polygon[j].latitude;
    if (((yi > target.latitude) !== (yj > target.latitude)) &&
      (target.longitude < (xj - xi) * (target.latitude - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function areaMatch(area, opportunity) {
  if (!area.enabled) return {matched: false, distance: null};
  const target = point(opportunity.location);
  if (area.geometry.length >= 3 && insidePolygon(target, area.geometry)) return {matched: true, distance: 0};
  const distance = distanceMiles(area.center, target);
  if (distance != null && area.radiusMiles != null && distance <= area.radiusMiles) return {matched: true, distance};
  const place = text(opportunity.place, 100).toLowerCase();
  const postalCode = text(opportunity.postalCode, 12).toLowerCase();
  if ((place && area.places.some((item) => item.toLowerCase() === place)) ||
      (postalCode && area.postalCodes.some((item) => item.toLowerCase() === postalCode))) {
    return {matched: true, distance};
  }
  return {matched: false, distance};
}
function matchOpportunity(preferences, opportunity, scope = "push") {
  if (scope === "manual") return {version: MATCH_VERSION, matched: true, matchScore: null,
    distance: null, serviceAreaMatch: null, serviceMatch: null, travelMatch: null,
    reasons: ["Manual search shows all available results."]};
  const enabledAreas = preferences.areas.filter((area) => area.enabled);
  const matches = enabledAreas.map((area) => ({area, ...areaMatch(area, opportunity)}));
  const area = matches.find((item) => item.matched);
  const distances = matches.map((item) => item.distance).filter(Number.isFinite);
  const distance = distances.length ? Math.min(...distances) : null;
  const desired = preferences.role === "business" ? preferences.priorityServices : preferences.jobTypes;
  const service = text(opportunity.service || opportunity.jobType, 100);
  const serviceMatch = !service || !desired.length || desired.some((item) => item.toLowerCase() === service.toLowerCase());
  let travelMatch = area != null;
  if (preferences.role === "business" && !travelMatch) {
    travelMatch = preferences.outsideOpportunityScope === "maryland" &&
      ["md", "maryland"].includes(text(opportunity.state, 20).toLowerCase()) ||
      preferences.outsideOpportunityScope === "followed" && opportunity.followed === true ||
      preferences.outsideOpportunityScope === "nearby" && distance != null && distance <= 25;
  }
  if (preferences.role === "scaler" && !travelMatch) {
    travelMatch = preferences.travelMode === "anywhere" ||
      (preferences.travelMode === "up_to_miles" && distance != null && distance <= preferences.maxTravelMiles) ||
      (preferences.travelMode === "nearby" && distance != null && distance <= preferences.maxTravelMiles) ||
      (preferences.travelMode === "worth_drive" && distance != null &&
        Number(opportunity.pay) >= Math.max(100, distance * 3));
  }
  if (opportunity.jobType === "door_to_door" && preferences.outreachOptIn !== true) travelMatch = false;
  const matched = serviceMatch && (area != null || travelMatch);
  const reasons = [];
  if (area) reasons.push(`Inside ${area.area.name}.`);
  if (service && serviceMatch) reasons.push(`Matches your ${service} preference.`);
  if (!area && travelMatch) reasons.push(preferences.role === "scaler" ?
    "You enabled travel opportunities." : "You chose to see opportunities beyond your usual area.");
  if (!matched) reasons.push("Outside your saved notification preferences.");
  return {version: MATCH_VERSION, matched, matchScore: matched ? (area ? 100 : 70) : 0,
    distance: distance == null ? null : Math.round(distance * 10) / 10,
    serviceAreaMatch: Boolean(area), serviceMatch, travelMatch, reasons};
}

module.exports = {SCHEMA_VERSION, BUSINESS_SCHEMA_VERSION, SCALER_SCHEMA_VERSION,
  MATCH_VERSION, sanitizePreferences, matchOpportunity, distanceMiles, insidePolygon,
  notificationDefaults};
