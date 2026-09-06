"use strict";
// Exact maintained operational geometry helpers; parity checked by tests.
const crypto = require("node:crypto");
function haversineMeters(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(value)));
}

function calculateGeometryWalkingEstimate(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("At least three geometry points are required.");
  }
  const centerLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos(centerLat * Math.PI / 180));
  const projected = points.map((point) => ({
    x: point.longitude * metersPerDegreeLng,
    y: point.latitude * metersPerDegreeLat,
  }));
  let twiceArea = 0;
  let perimeterMeters = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    twiceArea += projected[index].x * projected[next].y - projected[next].x * projected[index].y;
    perimeterMeters += haversineMeters(points[index], points[next]);
  }
  const areaSquareMeters = Math.abs(twiceArea) / 2;
  // Geometry-only planning model shared with the current client UX. The
  // server owns the authoritative result used to cap a one-Scaler zone.
  const estimatedWalkingMeters = perimeterMeters + areaSquareMeters / 30;
  const estimatedWalkingMinutes = Math.max(1, Math.ceil(estimatedWalkingMeters / 75));
  return {
    areaSquareMeters,
    perimeterMeters,
    estimatedWalkingMeters,
    estimatedWalkingMinutes,
    version: "geometry_v1_server",
  };
}

function zoneGeometryDigest(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("At least three geometry points are required.");
  }
  const normalized = points.map((point) => {
    const latitude = Number(point?.latitude);
    const longitude = Number(point?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Zone geometry contains an invalid coordinate.");
    }
    return [latitude.toFixed(7), longitude.toFixed(7)];
  });
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
module.exports={calculateGeometryWalkingEstimate,zoneGeometryDigest};
