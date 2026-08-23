"use strict";

const crypto = require("node:crypto");

const LIMITS = Object.freeze({
  maxPointsPerChunk: 100,
  maxPointsPerSession: 21600,
  maxChunksPerSession: 432,
  maxCheckpointsPerSession: 250,
  maxSessionDurationMs: 24 * 60 * 60 * 1000,
  maxUploadPayloadBytes: 192 * 1024,
  maxCheckpointPayloadBytes: 16 * 1024,
  maxPhotoBytes: 10 * 1024 * 1024,
  maxSequence: 1000000,
  maxFutureSkewMs: 2 * 60 * 1000,
  maxBeforeSessionSkewMs: 5 * 60 * 1000,
  maxAccuracyMeters: 100,
  impossibleSpeedMetersPerSecond: 15,
});

const POINT_KEYS = new Set([
  "sequence",
  "latitude",
  "longitude",
  "timestampMs",
  "horizontalAccuracy",
  "speed",
  "heading",
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  assertPlainObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field.`);
  }
}

function serializedBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function canonicalRawPoint(raw) {
  assertAllowedKeys(raw, POINT_KEYS, "GPS point");
  const sequence = numberOrNull(raw.sequence);
  const latitude = numberOrNull(raw.latitude);
  const longitude = numberOrNull(raw.longitude);
  const timestampMs = numberOrNull(raw.timestampMs);
  const horizontalAccuracy = numberOrNull(raw.horizontalAccuracy);
  const speed = numberOrNull(raw.speed);
  const heading = numberOrNull(raw.heading);
  if (!Number.isSafeInteger(sequence) || sequence < 1 ||
      sequence > LIMITS.maxSequence) throw new TypeError("Invalid GPS sequence.");
  if (latitude === null || latitude < -90 || latitude > 90 ||
      longitude === null || longitude < -180 || longitude > 180) {
    throw new TypeError("Invalid GPS coordinates.");
  }
  if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) {
    throw new TypeError("Invalid GPS timestamp.");
  }
  if (horizontalAccuracy === null || horizontalAccuracy < 0) {
    throw new TypeError("Invalid GPS accuracy.");
  }
  if (raw.speed !== undefined && (speed === null || speed < 0)) {
    throw new TypeError("Invalid GPS speed.");
  }
  if (raw.heading !== undefined &&
      (heading === null || heading < 0 || heading >= 360)) {
    throw new TypeError("Invalid GPS heading.");
  }
  return {
    sequence,
    latitude,
    longitude,
    timestampMs,
    horizontalAccuracy,
    ...(speed === null ? {} : {speed}),
    ...(heading === null ? {} : {heading}),
  };
}

function haversineMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function normalizePoint(raw, options) {
  const point = canonicalRawPoint(raw);
  const nowMs = options.nowMs;
  const startedAtMs = options.startedAtMs;
  if (point.timestampMs > nowMs + LIMITS.maxFutureSkewMs ||
      point.timestampMs < startedAtMs - LIMITS.maxBeforeSessionSkewMs) {
    throw new TypeError("GPS timestamp is outside the active session.");
  }
  const flags = [];
  if (point.horizontalAccuracy > LIMITS.maxAccuracyMeters) flags.push("low_accuracy");
  const previous = options.previousPoint;
  if (previous) {
    const elapsedSeconds = Math.max(0.001,
      Math.abs(point.timestampMs - previous.timestampMs) / 1000);
    const distanceMeters = haversineMeters(previous, point);
    const calculatedSpeed = distanceMeters / elapsedSeconds;
    if (calculatedSpeed > LIMITS.impossibleSpeedMetersPerSecond) {
      flags.push("impossible_speed");
      if (distanceMeters > 250) flags.push("impossible_jump");
    }
    if (point.timestampMs + 30000 < previous.timestampMs) {
      flags.push("timestamp_regression");
    }
  }
  const accepted = !flags.some((flag) => [
    "low_accuracy", "impossible_speed", "impossible_jump",
  ].includes(flag));
  return {
    ...point,
    sessionId: options.sessionId,
    campaignId: options.campaignId,
    zoneId: options.zoneId,
    scalerId: options.scalerId,
    accepted,
    flags,
  };
}

function digestRawPoints(points) {
  const canonical = points.map(canonicalRawPoint);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function normalizeChunk(rawPoints, options) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 1 ||
      rawPoints.length > LIMITS.maxPointsPerChunk) {
    throw new TypeError("Invalid GPS chunk size.");
  }
  const canonical = rawPoints.map(canonicalRawPoint);
  for (let index = 1; index < canonical.length; index += 1) {
    if (canonical[index].sequence !== canonical[index - 1].sequence + 1) {
      throw new TypeError("GPS sequences must be contiguous and unique.");
    }
  }
  let previousPoint = options.previousPoint || null;
  const points = canonical.map((point) => {
    const normalized = normalizePoint(point, {...options, previousPoint});
    previousPoint = normalized;
    return normalized;
  });
  return {
    points,
    startSequence: points[0].sequence,
    endSequence: points.at(-1).sequence,
    digest: digestRawPoints(canonical),
    lastPoint: points.at(-1),
  };
}

function canonicalChunkId(startSequence, endSequence) {
  const pad = (value) => String(value).padStart(9, "0");
  return `seq_${pad(startSequence)}_${pad(endSequence)}`;
}

function compatibilityRoutePoints(points, maximum = 3000) {
  if (points.length <= maximum) return points;
  const lastIndex = points.length - 1;
  return Array.from({length: maximum}, (_, index) =>
    points[Math.round(index * lastIndex / (maximum - 1))]);
}

module.exports = {
  LIMITS,
  POINT_KEYS,
  assertAllowedKeys,
  canonicalChunkId,
  canonicalRawPoint,
  compatibilityRoutePoints,
  digestRawPoints,
  haversineMeters,
  normalizeChunk,
  normalizePoint,
  serializedBytes,
};
