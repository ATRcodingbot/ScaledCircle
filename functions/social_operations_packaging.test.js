"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "functions-social-operations");
const indexSource = fs.readFileSync(path.join(packageRoot, "index.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const firebase = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));

test("Social Operations has one dedicated zero-secret codebase", () => {
  const config = firebase.functions.find((entry) => entry.codebase === "social-operations");
  assert.equal(config.source, "functions-social-operations");
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["firebase-admin", "firebase-functions"]);
  for (const forbidden of [
    "CENSUS_API_KEY", "defineSecret", "TWILIO_", "OPENAI_", "STRIPE_",
    "SMTP_", "META_", "GOOGLE_ADS_", "X_API_", "YOUTUBE_",
  ]) assert.doesNotMatch(indexSource, new RegExp(forbidden));
});

test("Social Operations exports only the five provider-free callables", () => {
  const names = [...indexSource.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [
    "approveSocialContentPlanV1",
    "createEmailContentPlanV1",
    "createSocialContentPlanV1",
    "getSocialOperationsAdminSummary",
    "getSocialOperationsWorkspace",
  ]);
});
