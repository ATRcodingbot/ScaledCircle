"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("production capacity preflight is read-only and project-explicit", () => {
  const source = fs.readFileSync("scripts/check_personalization_capacity.js", "utf8");
  assert.match(source, /projectId !== "scaled-circle"/);
  assert.match(source, /\.select\("active", "betaAccess"\)\.get\(\)/);
  assert.match(source, /\.count\(\)\.get\(\)/);
  assert.doesNotMatch(source, /\.set\(|\.update\(|\.create\(|\.delete\(/);
  assert.match(source, /STOP_PARTITION_REQUIRED/);
});

test("release notes disclose provider and proactive-matching limits", () => {
  const notes = fs.readFileSync("../docs/PERSONALIZATION_MANAGED_GROWTH_RELEASE.md", "utf8");
  for (const phrase of ["Proactive Property-opportunity alerts are not yet available",
    "Managed Growth reminder notifications are not yet available", "Coming Soon / Beta",
    "Advertising execution is not connected", "400 saved Scaler preference records"]) {
    assert.match(notes, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
