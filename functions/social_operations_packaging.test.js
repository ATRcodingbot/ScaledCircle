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

test("Social Operations has one dedicated narrowly-secret-bound codebase", () => {
  const config = firebase.functions.find((entry) => entry.codebase === "social-operations");
  assert.equal(config.source, "functions-social-operations");
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["firebase-admin", "firebase-functions"]);
  for (const forbidden of [
    "CENSUS_API_KEY", "TWILIO_", "OPENAI_", "STRIPE_", "SMTP_", "GOOGLE_ADS_",
  ]) assert.doesNotMatch(indexSource, new RegExp(forbidden));
  for (const required of ["SOCIAL_OAUTH_TOKEN_ENCRYPTION_KEY",
    "YOUTUBE_SOCIAL_CLIENT_SECRET", "X_SOCIAL_CLIENT_SECRET"]) {
    assert.match(indexSource, new RegExp(required));
  }
  assert.doesNotMatch(indexSource, /META_SOCIAL_APP_SECRET/);
});

test("YouTube OAuth codebase binds only shared encryption and the YouTube secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["socialOAuthCallbackV1", "syncSocialReadOnlyPerformanceV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("youtube"\)\.secret/);
    assert.doesNotMatch(source, /META_SOCIAL_APP_SECRET|X_SOCIAL_CLIENT_SECRET/);
  }
  assert.doesNotMatch(indexSource, /META_SOCIAL_APP_SECRET/);
  assert.doesNotMatch(indexSource, /socialOAuthMetaCallbackV1/);
  assert.doesNotMatch(indexSource, /syncMetaSocialReadOnlyPerformanceV1/);
});

test("X OAuth codebase binds only shared encryption and the X secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["socialOAuthXCallbackV1", "syncXSocialReadOnlyPerformanceV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("x"\)\.secret/);
    assert.doesNotMatch(source, /META_SOCIAL_APP_SECRET|YOUTUBE_SOCIAL_CLIENT_SECRET/);
  }
});

test("Social Operations exports the provider-free surface plus bounded read-only OAuth", () => {
  const names = [...indexSource.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [
    "approveSocialContentPlanV1",
    "beginSocialOAuthConnectionV1",
    "configureSocialProviderV1",
    "confirmSocialOAuthConnectionV1",
    "createEmailContentPlanV1",
    "createSocialContentPlanV1",
    "getSocialOAuthAttemptV1",
    "getSocialOperationsAdminSummary",
    "getSocialOperationsWorkspace",
    "socialOAuthCallbackV1",
    "socialOAuthXCallbackV1",
    "syncSocialReadOnlyPerformanceV1",
    "syncXSocialReadOnlyPerformanceV1",
  ]);
});
