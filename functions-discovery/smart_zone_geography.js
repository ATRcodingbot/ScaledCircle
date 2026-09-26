"use strict";

const smartZonePlanning = require("./smart_zone_planning");

const MAX_QUERY_AREA_SQUARE_METERS = smartZonePlanning.MAX_GEOGRAPHIC_QUERY_SQUARE_METERS;
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
    nwr["shop"](poly:"${polygon}");
    nwr["office"](poly:"${polygon}");
    nwr["building"~"^(commercial|retail|school|college|university|hospital|civic|government|industrial|warehouse)$"](poly:"${polygon}");
    nwr["amenity"~"^(school|kindergarten|college|university|hospital|prison|community_centre|theatre|place_of_worship|grave_yard|townhall|courthouse|police|fire_station|parking)$"](poly:"${polygon}");
    nwr["landuse"~"^(education|institutional|industrial|cemetery|commercial|retail)$"](poly:"${polygon}");
    nwr["access"~"^(private|no|permit)$"](poly:"${polygon}");
    way["highway"~"^(residential|living_street|service|unclassified|tertiary|pedestrian)$"](poly:"${polygon}");
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link)$"](poly:"${polygon}");
    way["railway"~"^(rail|light_rail)$"](poly:"${polygon}");
    nwr["natural"="water"](poly:"${polygon}");
    nwr["waterway"="riverbank"](poly:"${polygon}");
    nwr["leisure"~"^(park|nature_reserve|stadium|sports_centre)$"](poly:"${polygon}");
    relation["boundary"="place"]["place"~"^(neighbourhood|neighborhood|quarter|suburb)$"](poly:"${polygon}");
  );out meta center geom;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetchImpl(endpoint, {method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ScaledCircle-SmartZone/1.0 (support@scaledcircle.com)"},
      body: new URLSearchParams({data: query}).toString(), signal: controller.signal});
    if (!response.ok) return null;
    const payload = await response.json();
    // Overpass can return HTTP 200 with partial elements and a timeout/error.
    // Partial target data without all exclusion branches cannot support a plan.
    if (payload.remark || !Array.isArray(payload.elements) || payload.elements.length > 20000) return null;
    return snapshotFromElements(selectedBoundary, payload.elements, {
      dataTimestamp: payload.osm3s?.timestamp_osm_base || null,
      fetchedAt: new Date().toISOString()});
  } catch (_) { return null; } finally { clearTimeout(timeout); }
}

function simpleRing(polygon) {
  const ring = polygon.slice(0, -1);
  if (ring.length < 3 || ring.length > 1000 || new Set(ring.map(p => `${p.latitude},${p.longitude}`)).size !== ring.length) return false;
  const cross = (a, b, c) => (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude);
  const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-14 &&
    p.latitude >= Math.min(a.latitude, b.latitude) && p.latitude <= Math.max(a.latitude, b.latitude) &&
    p.longitude >= Math.min(a.longitude, b.longitude) && p.longitude <= Math.max(a.longitude, b.longitude);
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[j], d = ring[(j + 1) % ring.length];
    if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return false;
  }
  return true;
}
function validSourceFootprint(polygon) {
  // A mapped house can be smaller than the minimum useful campaign Zone.
  // Do not reuse the economic/Zone geometry minimum for source observations.
  return polygon.every(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 85 && Math.abs(p.longitude) <= 180) && simpleRing(polygon) &&
    smartZonePlanning.polygonAreaSquareMeters(polygon) >= 1;
}
function elementPolygons(element) {
  const normalize = line => (line || []).map(p => ({latitude: p.lat, longitude: p.lon}));
  if (Array.isArray(element.geometry) && element.geometry.length >= 4 &&
      element.geometry[0].lat === element.geometry.at(-1).lat &&
      element.geometry[0].lon === element.geometry.at(-1).lon) {
    return [normalize(element.geometry)].filter(validSourceFootprint);
  }
  // Overpass relations carry member linework, not a top-level geometry. Join
  // only exact mapped outer endpoints; incomplete rings remain unresolved.
  const pieces = (element.members || []).filter(m => m.role === 'outer' && m.geometry?.length >= 2)
    .map(m => [...m.geometry]);
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  const result = []; let incomplete = (element.members || []).some(m =>
    m.role === 'outer' && (!Array.isArray(m.geometry) || m.geometry.length < 2));
  while (pieces.length) {
    const ring = pieces.shift();
    while (!same(ring[0], ring.at(-1))) {
      const next = pieces.findIndex(p => same(ring.at(-1), p[0]) || same(ring.at(-1), p.at(-1)));
      if (next < 0) break;
      let part = pieces.splice(next, 1)[0];
      if (!same(ring.at(-1), part[0])) part = part.reverse();
      ring.push(...part.slice(1));
    }
    if (same(ring[0], ring.at(-1)) && ring.length >= 4) result.push(normalize(ring));
    else incomplete = true;
  }
  const valid = result.filter(validSourceFootprint);
  return Object.assign(valid, {incomplete: incomplete || valid.length !== result.length});
}
function landKind(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank') return 'water';
  if (['private', 'no', 'permit'].includes(tags.access) || ['private', 'no'].includes(tags.foot)) return 'restricted';
  if (['school', 'kindergarten', 'college', 'university'].includes(tags.amenity) ||
      ['school', 'college', 'university'].includes(tags.building) || tags.landuse === 'education') return 'school';
  if (['hospital', 'prison', 'place_of_worship', 'community_centre', 'theatre', 'townhall', 'courthouse', 'police', 'fire_station'].includes(tags.amenity) ||
      ['hospital', 'civic', 'government'].includes(tags.building) || tags.landuse === 'institutional' || tags.office === 'government') return 'institution';
  if (tags.landuse === 'cemetery' || tags.amenity === 'grave_yard') return 'cemetery';
  if (tags.landuse === 'industrial' || ['industrial', 'warehouse'].includes(tags.building)) return 'industrial';
  if (tags.amenity === 'parking') return 'parking';
  if (['park', 'nature_reserve', 'stadium', 'sports_centre'].includes(tags.leisure)) return 'park';
  if (['commercial', 'retail'].includes(tags.landuse) || ['commercial', 'retail'].includes(tags.building)) return 'commercial';
  return null;
}
function targetKind(tags) {
  if (['private', 'no', 'permit'].includes(tags.access)) return null;
  const land = landKind(tags);
  if (['school', 'institution', 'park'].includes(land) || tags.amenity === 'theatre') return 'event';
  if (land && land !== 'commercial') return null;
  if (tags.shop || tags.office || ['commercial', 'retail'].includes(tags.building)) return 'business';
  if (/^(apartments|bungalow|detached|house|residential|semidetached_house|terrace)$/.test(tags.building || '') ||
      /^(residential|apartments|house)$/.test(tags['building:use'] || '')) return 'residential';
  // An unclassified street address does not establish residential eligibility.
  return tags['addr:housenumber'] ? 'unclassified_address' : null;
}
function representativePoint(polygon) {
  if (!polygon || !simpleRing(polygon)) return null;
  const origin = polygon[0]; let twiceArea = 0, latitude = 0, longitude = 0;
  for (let i = 1; i < polygon.length; i++) {
    const a = {x: polygon[i - 1].longitude - origin.longitude, y: polygon[i - 1].latitude - origin.latitude};
    const b = {x: polygon[i].longitude - origin.longitude, y: polygon[i].latitude - origin.latitude};
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross; longitude += (a.x + b.x) * cross; latitude += (a.y + b.y) * cross;
  }
  const centroid = {latitude: origin.latitude + latitude / (3 * twiceArea),
    longitude: origin.longitude + longitude / (3 * twiceArea)};
  if (smartZonePlanning.pointInsidePolygon(centroid, polygon)) return {lat: centroid.latitude, lon: centroid.longitude};
  // A concave footprint's centroid can lie outside it. Use a midpoint of an
  // actual interior scanline interval, never an unverified bounding-box center.
  const latitudes = [...new Set(polygon.map(p => p.latitude))].sort((a, b) => a - b);
  for (let i = 1; i < latitudes.length; i++) {
    const lat = (latitudes[i - 1] + latitudes[i]) / 2, intersections = [];
    for (let j = 1; j < polygon.length; j++) {
      const a = polygon[j - 1], b = polygon[j];
      if ((a.latitude > lat) !== (b.latitude > lat)) intersections.push(a.longitude +
        (b.longitude - a.longitude) * (lat - a.latitude) / (b.latitude - a.latitude));
    }
    intersections.sort((a, b) => a - b);
    for (let j = 1; j < intersections.length; j += 2) {
      const candidate = {latitude: lat, longitude: (intersections[j - 1] + intersections[j]) / 2};
      if (smartZonePlanning.pointInsidePolygon(candidate, polygon)) return {lat, lon: candidate.longitude};
    }
  }
  return null;
}
function snapshotFromElements(selectedBoundary, rawElements, provenance = {}) {
  const serviceablePoints = []; const exclusionPolygons = []; const mappedBoundaries = [];
  const routeWays = []; const targetFeatures = []; const landFeatures = []; const barrierWays = [];
  const unresolvedLandFeatures = [];
  let waterFeatureCount = 0; let parkFeatureCount = 0; let barrierFeatureCount = 0;
  for (const element of Array.isArray(rawElements) ? rawElements : []) {
    const tags = element.tags || {}; const geometry = Array.isArray(element.geometry) ?
      element.geometry.map((item) => ({latitude: item.lat, longitude: item.lon})) : [];
    const kind = landKind(tags);
    const isWater = kind === 'water';
    const isPark = kind === 'park';
    const isMappedPlace = tags.boundary === "place" &&
      /^(neighbourhood|neighborhood|quarter|suburb)$/.test(tags.place || "");
    const isBarrier = /^(motorway|motorway_link|trunk|trunk_link)$/.test(tags.highway || "") ||
      /^(rail|light_rail)$/.test(tags.railway || "");
    if (kind) {
      if (isWater) waterFeatureCount += 1;
      if (isPark) parkFeatureCount += 1;
      const polygons = elementPolygons(element);
      landFeatures.push(...polygons.map(polygon => ({id: String(element.id), kind, polygon})));
      // Keep the legacy route snapshot exclusions unchanged: campaign-aware
      // planning uses landFeatures; frozen completion contracts are unaffected.
      if (isWater || isPark) exclusionPolygons.push(...polygons);
      if ((!polygons.length || polygons.incomplete) && !tags.highway) unresolvedLandFeatures.push({id: String(element.id), kind,
        center: element.center || (Number.isFinite(element.lat) ? {lat: element.lat, lon: element.lon} : null)});
    }
    if (isMappedPlace) {
      if (geometry.length >= 3 && smartZonePlanning.validateGeometry(geometry).valid) {
        mappedBoundaries.push(geometry);
      }
      continue;
    }
    if (isBarrier) { barrierFeatureCount += 1; barrierWays.push({id: String(element.id), geometry}); continue; }
    if (tags.highway && geometry.length) {
      // Preserve the provider's actual ordered linework. Building centroids and
      // an unordered cloud of component points cannot establish a walkable route.
      routeWays.push({id: String(element.id), geometry,
        access: tags.access || null, foot: tags.foot || null,
        highway: tags.highway, service: tags.service || null,
        bridge: tags.bridge || null, tunnel: tags.tunnel || null,
        layer: tags.layer || null});
      for (const item of geometry) serviceablePoints.push({...item,
        componentId: `road-${element.id}`, kind: "local_road"});
      continue;
    }
    const footprint = /^(way|relation)$/.test(element.type || '') ? elementPolygons(element)[0] || null : null;
    let center = element.center || (Number.isFinite(element.lat) ? element : null);
    if (footprint && (!center || !smartZonePlanning.pointInsidePolygon({latitude: center.lat, longitude: center.lon}, footprint))) {
      center = representativePoint(footprint);
    }
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lon)) {
      const target = targetKind(tags);
      if (target) targetFeatures.push({id: `${element.type || 'feature'}/${element.id}`,
        latitude: center.lat, longitude: center.lon, kind: target, timestamp: element.timestamp || null,
        addressKey: tags['addr:housenumber'] && tags['addr:street'] ?
          `${tags['addr:street']}|${tags['addr:housenumber']}`.toLowerCase() : null,
        footprint});
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
    routeWays, targetFeatures, landFeatures, barrierWays, unresolvedLandFeatures,
    dataTimestamp: provenance.dataTimestamp || null, fetchedAt: provenance.fetchedAt || null,
    exclusionPolygons, waterFeatureCount, parkFeatureCount, barrierFeatureCount,
    serviceableBoundary, serviceableBoundaryType: serviceableBoundary ?
      "mapped_place_boundary" : null};
}

module.exports = {MAX_QUERY_AREA_SQUARE_METERS, QUERY_TIMEOUT_MILLISECONDS,
  fetchSnapshot, snapshotFromElements, targetKind, landKind, elementPolygons, representativePoint};
