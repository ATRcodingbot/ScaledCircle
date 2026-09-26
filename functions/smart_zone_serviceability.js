"use strict";

// Planning evidence only. This module never creates execution routes or changes
// completion, compensation, funding or coverage authority.
const MAX_FEATURES = 5000;
const MAX_EDGES = 5000;
const MIN_TARGETS = 6;
const MAX_TARGET_ROAD_METERS = 60;
const MAX_AREA_PER_TARGET = 6000;
const MAX_ROUTE_METERS_PER_TARGET = 150;
const METERS = 111320;
function intent(workType) {
  const value = String(workType || '').replace(/[^a-z]/gi, '').toLowerCase();
  if (['businesscarddistribution', 'b2boutreach', 'businessoutreach'].includes(value)) return 'business';
  if (['eventmarketing', 'event'].includes(value)) return 'event';
  if (['fielddistribution', 'flyerdistribution', 'flyerdelivery', 'doorhangerdistribution',
    'neighborhoodcanvassing', 'doortodoor', 'doortodooroutreach'].includes(value)) return 'residential';
  return 'unsupported';
}
function excluded(kind, targetIntent) {
  if (['water', 'restricted', 'cemetery', 'industrial'].includes(kind)) return true;
  if (targetIntent === 'event') return false;
  if (['school', 'institution', 'park', 'parking'].includes(kind)) return true;
  return kind === 'commercial' && targetIntent === 'residential';
}
function xy(p, latitude) {
  return {x: p.longitude * METERS * Math.cos(latitude * Math.PI / 180), y: p.latitude * METERS};
}
function distance(a, b) {
  const p = xy(a, (a.latitude + b.latitude) / 2), q = xy(b, (a.latitude + b.latitude) / 2);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
function key(p) { return `${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`; }
function interpolate(a, b, fraction) {
  return {latitude: a.latitude + (b.latitude - a.latitude) * fraction,
    longitude: a.longitude + (b.longitude - a.longitude) * fraction};
}
function projection(p, a, b) {
  const origin = xy(p, p.latitude), from = xy(a, p.latitude), to = xy(b, p.latitude);
  const dx = to.x - from.x, dy = to.y - from.y, size = dx * dx + dy * dy;
  const t = size ? Math.max(0, Math.min(1, ((origin.x - from.x) * dx + (origin.y - from.y) * dy) / size)) : 0;
  return interpolate(a, b, t);
}
function intersects(a, b, c, d) {
  const cross = (p, q, r) => (q.longitude - p.longitude) * (r.latitude - p.latitude) -
    (q.latitude - p.latitude) * (r.longitude - p.longitude);
  const inBox = (p, q, r) => r.longitude >= Math.min(p.longitude, q.longitude) - 1e-10 &&
    r.longitude <= Math.max(p.longitude, q.longitude) + 1e-10 &&
    r.latitude >= Math.min(p.latitude, q.latitude) - 1e-10 && r.latitude <= Math.max(p.latitude, q.latitude) + 1e-10;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) ||
    (Math.abs(abC) < 1e-14 && inBox(a, b, c)) || (Math.abs(abD) < 1e-14 && inBox(a, b, d)) ||
    (Math.abs(cdA) < 1e-14 && inBox(c, d, a)) || (Math.abs(cdB) < 1e-14 && inBox(c, d, b));
}
function lineHitsPolygon(a, b, polygon, geo) {
  return geo.pointInsidePolygon(a, polygon) || geo.pointInsidePolygon(b, polygon) ||
    polygon.some((p, i) => intersects(a, b, p, polygon[(i + 1) % polygon.length]));
}
function polygonsOverlap(a, b, geo) {
  return a.some((p, i) => lineHitsPolygon(p, a[(i + 1) % a.length], b, geo)) ||
    b.some(p => geo.pointInsidePolygon(p, a));
}
function permitted(way) {
  if (!['residential', 'living_street', 'pedestrian', 'unclassified', 'tertiary', 'service'].includes(way.highway)) return false;
  if (['private', 'no', 'customers', 'delivery', 'permit', 'destination'].includes(way.access) ||
      ['private', 'no', 'customers', 'permit'].includes(way.foot)) return false;
  if (way.highway === 'service' && !['yes', 'designated', 'permissive'].includes(way.foot)) return false;
  if (['driveway', 'parking_aisle', 'drive-through'].includes(way.service)) return false;
  return (!way.bridge || way.bridge === 'no') && (!way.tunnel || way.tunnel === 'no') && (!way.layer || way.layer === '0');
}
function shape({anchor, boundary, snapshot, workType, propertiesPerHour, desiredTargetLimit, maximumZones, desiredMinutes}, geo) {
  const targetIntent = intent(workType);
  const empty = reason => ({candidates: [], targetIntent, eligibleMappedFeatureCount: 0, reasons: [reason]});
  if (!snapshot || !Array.isArray(snapshot.targetFeatures) || !Array.isArray(snapshot.routeWays)) {
    return empty('Reliable classified targets and local-road linework are unavailable. Review or draw the area manually.');
  }
  if (snapshot.targetFeatures.length > MAX_FEATURES || snapshot.routeWays.length > MAX_EDGES) {
    return empty('The mapped evidence exceeds the bounded planning limit. Select a smaller area for review.');
  }
  if (targetIntent === 'unsupported') return empty('This campaign intent needs manual target and route review.');
  const lands = (snapshot.landFeatures || []).filter(p => excluded(p.kind, targetIntent));
  if (lands.some(p => { const check = geo.validateGeometry(p.polygon); return !check.valid &&
      !(check.reason === 'non_zero_area_required' && check.areaSquareMeters >= 1); })) {
    return empty('Some non-target land has incomplete geometry. Review the area manually.');
  }
  const exclusions = lands.map(p => p.polygon);
  if (lands.length > 1000 || lands.reduce((sum, p) => sum + p.polygon.length, 0) > 20000) {
    return empty('The land evidence exceeds the bounded planning limit. Select a smaller area for review.');
  }
  const barriers = (snapshot.barrierWays || []).flatMap(way => (way.geometry || []).slice(1)
    .map((p, i) => [way.geometry[i], p]));
  const blocked = (a, b) => exclusions.some(p => lineHitsPolygon(a, b, p, geo)) ||
    barriers.some(([c, d]) => intersects(a, b, c, d));
  const features = [];
  const seen = new Set();
  for (const feature of [...snapshot.targetFeatures].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (feature.kind !== targetIntent || !Number.isFinite(feature.latitude) || !Number.isFinite(feature.longitude) ||
        !geo.pointInsidePolygon(feature, boundary) || exclusions.some(p => geo.pointInsidePolygon(feature, p))) continue;
    const duplicateKey = feature.addressKey || key(feature);
    if (seen.has(duplicateKey) || features.some(f => distance(feature, f) < 1 ||
        (f.footprint && geo.pointInsidePolygon(feature, f.footprint)) ||
        (feature.footprint && geo.pointInsidePolygon(f, feature.footprint)))) continue;
    seen.add(duplicateKey); features.push(feature);
  }
  if (targetIntent === 'event') return {...empty('Mapped venues can be relevant to this campaign. Event access and work duration require manual review.'),
    eligibleMappedFeatureCount: features.length};
  if ((snapshot.unresolvedLandFeatures || []).some(feature => excluded(feature.kind, targetIntent))) {
    return {...empty('A mapped non-target feature has no reliable footprint. Review the surrounding area manually.'),
      eligibleMappedFeatureCount: features.length, eligibleMappedSourceIds: features.map(feature => feature.id)};
  }
  const edges = new Map(), adjacency = new Map();
  for (const way of snapshot.routeWays) {
    if (!permitted(way) || !Array.isArray(way.geometry)) continue;
    for (let i = 1; i < way.geometry.length; i++) {
      const from = way.geometry[i - 1], to = way.geometry[i];
      if (![from.latitude, from.longitude, to.latitude, to.longitude].every(Number.isFinite)) continue;
      // Interpolate only along actual ordered provider linework. This bounds
      // target proximity without inventing connectors or crossing junctions.
      const steps = Math.ceil(distance(from, to) / 40);
      if (steps > MAX_EDGES) return empty('Road linework is too broad for reliable bounded planning.');
      for (let j = 0; j < steps; j++) {
        const a = interpolate(from, to, j / steps), b = interpolate(from, to, (j + 1) / steps);
        if (!geo.pointInsidePolygon(a, boundary) || !geo.pointInsidePolygon(b, boundary) || blocked(a, b)) continue;
        if (boundary.some((p, n) => intersects(a, b, p, boundary[(n + 1) % boundary.length]))) continue;
        const ids = [key(a), key(b)], id = [...ids].sort().join('|');
        if (edges.has(id)) continue;
        const edge = {id, from: ids[0], to: ids[1], a, b, meters: distance(a, b)};
        if (edge.meters < .1) continue;
        edges.set(id, edge);
        for (const node of ids) { if (!adjacency.has(node)) adjacency.set(node, []); adjacency.get(node).push(edge); }
        if (edges.size > MAX_EDGES) return empty('The connected road evidence exceeds the bounded planning limit.');
      }
    }
  }
  const components = new Map(); let component = 0;
  for (const node of adjacency.keys()) {
    if (components.has(node)) continue;
    const queue = [node]; components.set(node, ++component);
    for (let i = 0; i < queue.length; i++) for (const edge of adjacency.get(queue[i]) || []) {
      const other = edge.from === queue[i] ? edge.to : edge.from;
      if (!components.has(other)) { components.set(other, component); queue.push(other); }
    }
  }
  const associated = [];
  for (const feature of features) {
    let best;
    for (const edge of edges.values()) {
      const snap = projection(feature, edge.a, edge.b), meters = distance(feature, snap);
      if (meters <= MAX_TARGET_ROAD_METERS && (!best || meters < best.meters) && !blocked(feature, snap)) best = {edge, snap, meters};
    }
    if (best) associated.push({...feature, ...best, component: components.get(best.edge.from)});
  }
  const groups = new Map();
  associated.sort((a, b) => distance(anchor, a) - distance(anchor, b) || a.id.localeCompare(b.id));
  for (const feature of associated.slice(0, desiredTargetLimit)) {
    if (!groups.has(feature.component)) groups.set(feature.component, []);
    groups.get(feature.component).push(feature);
  }
  const candidates = [];
  function candidate(items) {
    const queue = [items[0].edge.from], parents = new Map([[queue[0], null]]);
    for (let i = 0; i < queue.length; i++) for (const edge of adjacency.get(queue[i]) || []) {
      const other = edge.from === queue[i] ? edge.to : edge.from;
      if (!parents.has(other)) { parents.set(other, {node: queue[i], edge}); queue.push(other); }
    }
    const routes = new Map();
    for (const item of items) {
      routes.set(item.edge.id, item.edge);
      for (let node = item.edge.from; parents.get(node); node = parents.get(node).node) {
        const edge = parents.get(node).edge; routes.set(edge.id, edge);
      }
    }
    if (routes.size > 200) return null;
    const points = [...items, ...[...routes.values()].flatMap(edge => [edge.a, edge.b])];
    const hull = geo.convexHull(points.flatMap(p => {
      const dLat = 8 / METERS, dLon = dLat / Math.cos(p.latitude * Math.PI / 180);
      return [-1, 1].flatMap(x => [-1, 1].map(y => ({latitude: p.latitude + x * dLat, longitude: p.longitude + y * dLon})));
    }));
    if (!geo.validateGeometry(hull).valid || hull.some(p => !geo.pointInsidePolygon(p, boundary)) ||
        hull.some((p, i) => boundary.some((q, j) => intersects(p, hull[(i + 1) % hull.length], q, boundary[(j + 1) % boundary.length])))) return null;
    if (exclusions.some(p => polygonsOverlap(hull, p, geo)) || barriers.some(([a, b]) => lineHitsPolygon(a, b, hull, geo))) return null;
    if ((snapshot.unresolvedLandFeatures || []).some(f => excluded(f.kind, targetIntent) && (!f.center ||
        geo.pointInsidePolygon({latitude: f.center.lat, longitude: f.center.lon}, hull)))) return null;
    const walkingMeters = [...routes.values()].reduce((s, edge) => s + edge.meters, 0);
    if (geo.polygonAreaSquareMeters(hull) / items.length > MAX_AREA_PER_TARGET ||
        walkingMeters / items.length > MAX_ROUTE_METERS_PER_TARGET) return null;
    const workload = geo.estimateWorkload({estimatedProperties: items.length, estimatedWalkingMeters: walkingMeters * 2, workType, propertiesPerHour});
    if (workload.estimatedMinutes > Math.min(geo.SINGLE_SCALER_MAX_MINUTES,
      Number.isFinite(desiredMinutes) ? Math.max(15, desiredMinutes) : geo.SINGLE_SCALER_MAX_MINUTES)) return null;
    return {geometry: hull, workload, features: items.map(({edge, snap, meters, component, ...rest}) => rest),
      networkSegments: [...routes.values()].map(edge => ({from: edge.a, to: edge.b})),
      sourceComponentIds: [String(items[0].component)], mappedRouteMeters: Math.round(walkingMeters)};
  }
  function partition(items) {
    if (items.length < MIN_TARGETS || candidates.length >= maximumZones) return;
    const result = candidate(items);
    if (result) { candidates.push(result); return; }
    if (items.length < MIN_TARGETS * 2) return;
    const lat = items.map(p => p.latitude), lon = items.map(p => p.longitude);
    const horizontal = (Math.max(...lon) - Math.min(...lon)) * Math.cos(anchor.latitude * Math.PI / 180) > Math.max(...lat) - Math.min(...lat);
    items.sort((a, b) => horizontal ? a.longitude - b.longitude || a.latitude - b.latitude : a.latitude - b.latitude || a.longitude - b.longitude);
    const middle = Math.floor(items.length / 2);
    partition(items.slice(0, middle)); partition(items.slice(middle));
  }
  for (const items of groups.values()) partition(items);
  return {candidates, targetIntent, eligibleMappedFeatureCount: features.length,
    eligibleMappedSourceIds: features.map(feature => feature.id),
    roadSupportedTargetCount: associated.length,
    roadSupportedSourceIds: associated.map(feature => feature.id),
    reasons: candidates.length ? ['Mapped target features are near connected permitted local-road linework.',
      'Known campaign-ineligible land and mapped highway/rail barriers are excluded from each proposed polygon.',
      'OSM coverage and real-world pedestrian access are incomplete; inspect each proposed Zone before use.'] :
      ['We found insufficient connected target and road evidence to automatically create a practical Zone. Review or draw it manually.']};
}
module.exports = {shape, intent, excluded, polygonsOverlap, permitted, MIN_TARGETS};
