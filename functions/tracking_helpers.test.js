"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LIMITS,
  canonicalChunkId,
  canonicalRawPoint,
  compatibilityRoutePoints,
  digestRawPoints,
  normalizeChunk,
  normalizePoint,
  serializedBytes,
} = require("./tracking_security");

const nowMs = Date.UTC(2026, 7, 10, 16);
const context = {
  sessionId: "session",
  campaignId: "campaign",
  zoneId: "zone",
  scalerId: "scaler",
  nowMs,
  startedAtMs: nowMs - 60_000,
};

function point(sequence, overrides = {}) {
  return {
    sequence,
    latitude: 39.2 + sequence * 0.00001,
    longitude: -76.7,
    timestampMs: nowMs - 60_000 + sequence * 20_000,
    horizontalAccuracy: 7,
    speed: 1.4,
    heading: 120,
    ...overrides,
  };
}

test("accepts normal walking points and rejects client trust flags", () => {
  assert.throws(() => normalizePoint({...point(1), accepted: false}, context));
  assert.throws(() => normalizePoint({...point(1), flags: ["fake"]}, context));
  const normalized = normalizePoint(point(1), context);
  assert.equal(normalized.accepted, true);
  assert.deepEqual(normalized.flags, []);
  assert.equal(normalized.scalerId, "scaler");
});

test("validates every bounded numeric field", () => {
  for (const invalid of [
    point(1, {latitude: 91}), point(1, {longitude: -181}),
    point(1, {horizontalAccuracy: -1}), point(1, {speed: -1}),
    point(1, {heading: 360}), point(LIMITS.maxSequence + 1),
  ]) assert.throws(() => canonicalRawPoint(invalid), TypeError);
});

test("rejects malformed, ancient, and future timestamps", () => {
  assert.throws(() => canonicalRawPoint(point(1, {timestampMs: "today"})), TypeError);
  assert.throws(() => normalizePoint(point(1, {timestampMs: nowMs + 121_000}), context));
  assert.throws(() => normalizePoint(point(1, {timestampMs: context.startedAtMs - 301_000}), context));
});

test("server flags impossible speed and jump while preserving evidence", () => {
  const previousPoint = normalizePoint(point(1), context);
  const suspicious = normalizePoint(point(2, {
    latitude: 40.2,
    timestampMs: previousPoint.timestampMs + 1_000,
  }), {...context, previousPoint});
  assert.equal(suspicious.accepted, false);
  assert.ok(suspicious.flags.includes("impossible_speed"));
  assert.ok(suspicious.flags.includes("impossible_jump"));
});

test("requires contiguous unique chunk sequences", () => {
  assert.throws(() => normalizeChunk([point(1), point(1)], context));
  assert.throws(() => normalizeChunk([point(1), point(3)], context));
  const chunk = normalizeChunk([point(1), point(2)], context);
  assert.equal(chunk.startSequence, 1);
  assert.equal(chunk.endSequence, 2);
});

test("canonical IDs and payload digests make retries deterministic", () => {
  assert.equal(canonicalChunkId(1, 100), "seq_000000001_000000100");
  assert.equal(digestRawPoints([point(1)]), digestRawPoints([point(1)]));
  assert.notEqual(digestRawPoints([point(1)]), digestRawPoints([point(1, {latitude: 39.9})]));
});

test("compatibility route stays bounded and preserves endpoints", () => {
  const input = Array.from({length: LIMITS.maxPointsPerSession}, (_, index) => ({sequence: index + 1}));
  const output = compatibilityRoutePoints(input);
  assert.equal(output.length, 3000);
  assert.equal(output[0].sequence, 1);
  assert.equal(output.at(-1).sequence, LIMITS.maxPointsPerSession);
});

test("application payload measurement rejects unserializable/giant structures", () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(serializedBytes(cyclic), Number.POSITIVE_INFINITY);
  assert.ok(serializedBytes({points: "x".repeat(200_000)}) > LIMITS.maxUploadPayloadBytes);
});
