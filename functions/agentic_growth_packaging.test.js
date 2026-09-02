"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "functions-agentic-growth");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
const firebase = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "firebase.json"), "utf8"));

test("agentic runtime is isolated, secret-free, and has no provider execution export", () => {
  assert.equal(source.includes("defineSecret"), false);
  assert.equal(source.includes("onRequest"), false);
  assert.equal(source.includes("send_customer_reply"), false);
  assert.equal(source.includes("publish_social"), false);
  assert.equal(source.includes("tweet.write"), false);
  assert.equal(source.includes("providerMutationRouteAvailable: false"), true);
  const codebase = firebase.functions.find((item) => item.codebase === "agentic-growth");
  assert.equal(codebase.source, "functions-agentic-growth");
});

test("Agentic callable surface contains only provider-free read/observe authority", () => {
  const exports = [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
  assert.deepEqual(exports.sort(), [
    "getAgenticGrowthAdminSummaryV1", "getAgenticGrowthWorkspaceV1",
    "initializeAgenticGrowthDogfoodV1", "runMarketingManagerObserveV1",
  ]);
});
