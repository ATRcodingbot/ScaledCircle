"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

for (const collection of ["responseAssets", "responseInteractions", "attributionConversions",
  "featureHealth"]) {
  test(`${collection} remains server-write-only`, () => {
    const pattern = new RegExp(`match /${collection}/\\{[^}]+\\} \\{[\\s\\S]*?` +
      "allow read, create, update, delete: if false;[\\s\\S]*?\\}");
    assert.match(rules, pattern);
  });
}

test("public response traffic is routed through a Function, not Firestore Rules", () => {
  const firebase = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "firebase.json"), "utf8"));
  const responseRewrite = firebase.hosting.rewrites.find((rewrite) => rewrite.source === "/r");
  assert.deepEqual(responseRewrite, {
    source: "/r", function: {functionId: "resolveTrackedResponse", region: "us-east1"},
  });
});
