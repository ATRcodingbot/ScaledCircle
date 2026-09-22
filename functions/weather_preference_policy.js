"use strict";
const entitlement = require("./subscription_entitlements");

function text(value, maximumLength = 500) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maximumLength);
}
function hasWeatherSubscription(user, subscription) {
  if (text(user.role, 40).toLowerCase() === "admin") return true;
  return subscription.revokedAt == null && entitlement.hasActiveScaleEntitlement(subscription);
}
function shouldMonitorWeatherUser(user) {
  return user.preferences != null || user.countyIds.size > 0;
}
function distanceMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const radians = (degrees) => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) *
    Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function weatherPreferenceDecision(user, county) {
  const preferences = user.preferences;
  if (!preferences) return user.countyIds.has(county.id) ?
    {matched: true, reason: `Matches your ${county.name} weather area`} :
    {matched: false, reason: "Outside your saved weather areas"};
  if (preferences.role !== "business" || preferences.notifications?.weatherInMyAreas !== true)
    return {matched: false, reason: "Weather opportunity notifications are off"};
  const areas = Array.isArray(preferences.areas) ? preferences.areas.filter((a) => a?.enabled !== false) : [];
  const token = county.name.toLowerCase().replace(/ county$/, "");
  const direct = areas.find((area) => {
    const values = [area.name, area.placeLabel, ...(Array.isArray(area.places) ? area.places : [])]
      .map((value) => text(value, 200).toLowerCase());
    if (values.some((value) => value.includes(token))) return true;
    const center = area.center; const radius = Number(area.radiusMiles || 0);
    return center && radius > 0 && distanceMiles(Number(center.latitude), Number(center.longitude),
      county.latitude, county.longitude) <= radius;
  });
  if (direct) return {matched: true, reason: direct.primary === true ? "Inside your main service area" :
    `Matches your ${text(direct.name, 80) || county.name} service area`};
  const scope = text(preferences.outsideOpportunityScope, 40).toLowerCase();
  if (preferences.notifications?.outsideMyAreas !== true || scope === "none")
    return {matched: false, reason: "Outside your usual service area"};
  if (scope === "maryland") return {matched: true,
    reason: "Outside your usual service area — you enabled Maryland opportunities"};
  if (scope === "followed" && user.countyIds.has(county.id)) return {matched: true, reason: "You follow this area"};
  if (scope === "nearby" && areas.some((area) => area.center && distanceMiles(
    Number(area.center.latitude), Number(area.center.longitude), county.latitude, county.longitude) <=
    Number(area.radiusMiles || 20) + 30)) return {matched: true,
    reason: "Outside your usual service area — you enabled nearby opportunities"};
  return {matched: false, reason: "Outside your notification preferences"};
}
module.exports = {hasWeatherSubscription, shouldMonitorWeatherUser, weatherPreferenceDecision};
