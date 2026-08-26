"use strict";

const smartZonePlanning = require("./smart_zone_planning");

const MAX_QUERY_AREA_SQUARE_METERS = 25000000;
const QUERY_TIMEOUT_MILLISECONDS = 12000;

async function fetchSnapshot({selectedBoundary, endpoint, fetchImpl = fetch}) {
  if (!Array.isArray(selectedBoundary) ||
      !smartZonePlanning.validateGeometry(selectedBoundary).valid ||
      smartZonePlanning.polygonAreaSquareMeters(selectedBoundary) >
        MAX_QUERY_AREA_SQUARE_METERS) return null;
  const polygon = selectedBoundary.map((item) =>
    `${Number(item.latitude).toFixed(7)} ${Number(item.longitude).toFixed(7)}`).join(" ");
  const query = `[out:json][timeout:15];(
    nwr["addr:housenumber"](poly:"${polygon}");
    nwr["building"~"^(apartments|bungalow|detached|house|residential|semidetached_house|terrace)$"](poly:"${polygon}");
    way["highway"~"^(residential|living_street|service|unclassified|tertiary|pedestrian)$"](poly:"${polygon}");
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link)$"](poly:"${polygon}");
    way["railway"~"^(rail|light_rail)$"](poly:"${polygon}");
    nwr["natural"="water"](poly:"${polygon}");
    nwr["waterway"="riverbank"](poly:"${polygon}");
    nwr["leisure"="park"](poly:"${polygon}");
    relation["boundary"="place"]["place"~"^(neighbourhood|neighborhood|quarter|suburb)$"](poly:"${polygon}");
  );out tags center geom;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetchImpl(endpoint, {method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ScaledCircle-SmartZone/1.0 (support@scaledcircle.com)"},
      body: new URLSearchParams({data: query}).toString(), signal: controller.signal});
    if (!response.ok) return null;
    return snapshotFromElements(selectedBoundary, (await response.json()).elements);
  } catch (_) { return null; } finally { clearTimeout(timeout); }
}

function snapshotFromElements(selectedBoundary, rawElements) {
  const serviceablePoints = []; const exclusionPolygons = []; const mappedBoundaries = [];
  let waterFeatureCount = 0; let parkFeatureCount = 0; let barrierFeatureCount = 0;
  for (const element of Array.isArray(rawElements) ? rawElements : []) {
    const tags = element.tags || {}; const geometry = Array.isArray(element.geometry) ?
      element.geometry.map((item) => ({latitude: item.lat, longitude: item.lon})) : [];
    const isWater = tags.natural === "water" || tags.waterway === "riverbank";
    const isPark = tags.leisure === "park";
    const isMappedPlace = tags.boundary === "place" &&
      /^(neighbourhood|neighborhood|quarter|suburb)$/.test(tags.place || "");
    const isBarrier = /^(motorway|motorway_link|trunk|trunk_link)$/.test(tags.highway || "") ||
      /^(rail|light_rail)$/.test(tags.railway || "");
    if (isWater || isPark) {
      if (isWater) waterFeatureCount += 1; else parkFeatureCount += 1;
      if (geometry.length >= 3) exclusionPolygons.push(geometry);
      continue;
    }
    if (isMappedPlace) {
      if (geometry.length >= 3 && smartZonePlanning.validateGeometry(geometry).valid) {
        mappedBoundaries.push(geometry);
      }
      continue;
    }
    if (isBarrier) { barrierFeatureCount += 1; continue; }
    if (tags.highway && geometry.length) {
      for (const item of geometry) serviceablePoints.push({...item,
        componentId: `road-${element.id}`, kind: "local_road"});
      continue;
    }
    const center = element.center || (Number.isFinite(element.lat) ? element : null);
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lon)) {
      serviceablePoints.push({latitude: center.lat, longitude: center.lon,
        componentId: `property-${element.id}`, kind: "property"});
    }
  }
  const territoryCenter = {latitude: selectedBoundary.reduce((sum, item) =>
    sum + Number(item.latitude), 0) / selectedBoundary.length,
  longitude: selectedBoundary.reduce((sum, item) =>
    sum + Number(item.longitude), 0) / selectedBoundary.length};
  const serviceableBoundary = mappedBoundaries.find((boundary) =>
    smartZonePlanning.pointInsidePolygon(territoryCenter, boundary)) || null;
  return {source: "openstreetmap_bounded_snapshot_v1", serviceablePoints,
    exclusionPolygons, waterFeatureCount, parkFeatureCount, barrierFeatureCount,
    serviceableBoundary, serviceableBoundaryType: serviceableBoundary ?
      "mapped_place_boundary" : null};
}

module.exports = {MAX_QUERY_AREA_SQUARE_METERS, QUERY_TIMEOUT_MILLISECONDS,
  fetchSnapshot, snapshotFromElements};
