"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const operations = require("./operational_layer");

test("campaign logistics accepts all four product fulfillment methods", () => {
  const scheduledAt = "2030-09-03T12:30:00.000Z";
  for (const fulfillmentType of [
    "scaler_pickup_business", "business_delivery",
  ]) {
    const result = operations.normalizeMaterialLogistics({
      fulfillmentType, scheduledAt, location: "100 Staging Plaza",
    });
    assert.equal(result.fulfillmentType, fulfillmentType);
    assert.equal(result.materialsRequired, true);
  }
  const printShop = operations.normalizeMaterialLogistics({
    fulfillmentType: "scaler_pickup_print_shop",
    scheduledAt,
    location: "100 Staging Plaza",
    printingShopName: "Staging Print Shop",
    orderReference: "Order TEST-1",
  });
  assert.equal(printShop.printingShopName, "Staging Print Shop");
  assert.equal(
    operations.normalizeMaterialLogistics({
      fulfillmentType: "no_materials_required",
    }).materialsRequired,
    false,
  );
});

test("received and terminal participant handoffs cannot be rewritten", () => {
  assert.equal(operations.canRewriteMaterialHandoff("scheduled"), true);
  assert.equal(operations.canRewriteMaterialHandoff("scaler_en_route"), true);
  for (const status of [
    "scaler_arrived", "handoff_in_progress", "received",
    "failed_scaler", "failed_business", "failed_third_party", "support_review",
  ]) {
    assert.equal(operations.canRewriteMaterialHandoff(status), false);
  }
});

test("campaign edit callable is server-authoritative and preserves history", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const start = source.indexOf("exports.updateCampaignMaterialLogistics");
  const end = source.indexOf("exports.configureJobCoordination", start);
  assert.ok(start > 0 && end > start);
  const callable = source.slice(start, end);
  assert.match(callable, /requireVerifiedUser/);
  assert.match(callable, /campaign\.businessId !== context\.uid/);
  assert.match(callable, /db\.runTransaction/);
  assert.match(callable, /canRewriteMaterialHandoff/);
  assert.match(callable, /materialLogisticsHistory/);
  assert.match(callable, /materialLogisticsLockedAt/);
  assert.match(callable, /assignmentStarted/);
  assert.doesNotMatch(callable, /stripe\./i);
});

test("first single or group assignment locks and snapshots material terms", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  for (const exportName of ["assignScalerToZone", "acceptZoneGroupSlot"]) {
    const start = source.indexOf(`exports.${exportName}`);
    const end = source.indexOf("exports.", start + 20);
    const callable = source.slice(start, end);
    assert.match(callable, /materialLogisticsLockedReason: "scaler_assignment"/);
    assert.match(callable, /acceptedMaterialLogisticsVersion/);
    assert.match(callable, /acceptedMaterialLogisticsDigest/);
    assert.match(callable, /db\.runTransaction/);
  }
});

test("post-assignment changes require participant-specific unanimous consent", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const proposalStart = source.indexOf("exports.proposeMaterialLogisticsChange");
  const responseStart = source.indexOf("exports.respondToMaterialLogisticsChange");
  const responseEnd = source.indexOf("exports.configureJobCoordination", responseStart);
  assert.ok(proposalStart > 0 && responseStart > proposalStart && responseEnd > responseStart);
  const proposal = source.slice(proposalStart, responseStart);
  const response = source.slice(responseStart, responseEnd);
  assert.match(proposal, /affectedScalerIds/);
  assert.match(proposal, /pending_acknowledgment/);
  assert.match(response, /acceptedScalerIds/);
  assert.match(response, /declinedScalerIds/);
  assert.match(response, /pendingScalerIds/);
  assert.match(response, /canRewriteMaterialHandoff/);
  assert.match(response, /status === "accepted"/);
  assert.doesNotMatch(proposal + response, /stripe\./i);
});

test("logistics digest is deterministic and changes with contract terms", () => {
  const base = operations.normalizeMaterialLogistics({
    fulfillmentType: "business_delivery",
    scheduledAt: "2030-09-03T12:30:00.000Z",
    location: "100 Staging Plaza",
    instructions: "Main entrance",
  });
  assert.equal(operations.materialLogisticsDigest(base),
    operations.materialLogisticsDigest({...base}));
  assert.notEqual(operations.materialLogisticsDigest(base),
    operations.materialLogisticsDigest({...base, location: "Different location"}));
});

test("group logistics change requires each affected participant", () => {
  const oneAccepted = operations.materialChangeConsentStatus({
    affectedScalerIds: ["a", "b", "c", "d"], acceptedScalerIds: ["a"],
  });
  assert.equal(oneAccepted.status, "pending_acknowledgment");
  assert.deepEqual(oneAccepted.pendingScalerIds, ["b", "c", "d"]);
  const allAccepted = operations.materialChangeConsentStatus({
    affectedScalerIds: ["a", "b", "c", "d"],
    acceptedScalerIds: ["d", "c", "b", "a"],
  });
  assert.equal(allAccepted.status, "accepted");
  assert.deepEqual(allAccepted.pendingScalerIds, []);
  const declined = operations.materialChangeConsentStatus({
    affectedScalerIds: ["a", "b"], acceptedScalerIds: ["a"], declinedScalerIds: ["b"],
  });
  assert.equal(declined.status, "declined");
});

test("Job Room projects required material state and viewer readiness authoritatively", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const start = source.indexOf("exports.getJobRoom");
  const end = source.indexOf("exports.sendJobMessage", start);
  const callable = source.slice(start, end);
  assert.match(callable, /materialsRequired \? "scheduled" : "not_required"/);
  assert.match(callable, /fulfillmentType: authoritativeLogistics\.fulfillmentType/);
  assert.match(callable, /viewerReadinessAcknowledged/);
  assert.match(callable, /participant\?\.readinessAcknowledged === true/);
  assert.match(callable, /viewerReadiness:/);
  assert.match(callable, /const receivedCount = group \? participantHandoffs\.filter/);
  assert.match(callable, /handoff\.status === "received" \? 1 : 0/);
});

test("readiness acknowledgment retries do not rewrite the deterministic notification", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const start = source.indexOf("exports.acknowledgeJobReadiness");
  const end = source.indexOf("exports.transitionMaterialHandoff", start);
  const callable = source.slice(start, end);
  assert.match(callable, /readinessSnapshot\.data\(\)\?\.readinessAcknowledged === true/);
  assert.match(callable, /participantSnapshot\.data\(\)\?\.readinessAcknowledged === true/);
  assert.match(callable, /return true;/);
  assert.match(callable, /ready_\$\{zoneId\}_\$\{context\.uid\}/);
  assert.match(callable, /alreadyAcknowledged/);
});

test("participant receipt uses handoff identity and remains operationally isolated", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const start = source.indexOf("exports.transitionMaterialHandoff");
  const end = source.indexOf("exports.createSupportCase", start);
  const callable = source.slice(start, end);
  assert.match(callable, /"zoneId", "handoffId", "nextStatus"/);
  assert.match(callable, /material_handoffs\/\$\{context\.uid\}\/\$\{requestedHandoffId\}\//);
  assert.match(callable, /handoff\.zoneId !== zoneId/);
  assert.match(callable, /currentStatus === "received"/);
  assert.match(callable, /businessConfirmedAt = FieldValue\.serverTimestamp/);
  assert.match(callable, /scalerConfirmedAt = FieldValue\.serverTimestamp/);
  assert.match(callable, /businessConfirmedBy = context\.uid/);
  assert.match(callable, /scalerConfirmedBy = context\.uid/);
  assert.match(callable, /material-received_\$\{handoffRef\.id\}/);
  assert.match(callable, /if \(verifiedProof\) update\.supportingProof = verifiedProof/);
  assert.doesNotMatch(callable, /Arrival proof is required before receipt/);
  assert.doesNotMatch(callable, /third-party handoff photo is required/);
  assert.doesNotMatch(callable, /trackingSessions|campaignCompletions|scalerTransfers/);
});
