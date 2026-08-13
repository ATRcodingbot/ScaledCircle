"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");

function callable(name, nextName) {
  const start = source.indexOf(`exports.${name}`);
  const end = source.indexOf(`exports.${nextName}`, start);
  assert.ok(start > 0 && end > start, `${name} source boundary`);
  return source.slice(start, end);
}

test("assignment and group progress notifications use deterministic recipients", () => {
  const single = callable("assignScalerToZone", "configureZoneGroupAssignment");
  const group = callable("acceptZoneGroupSlot", "confirmZoneGroupParticipantNoShow");
  assert.match(single, /assignment_\$\{zoneId\}_\$\{scalerId\}/);
  assert.match(single, /material-lock_\$\{zoneId\}_\$\{scalerId\}/);
  assert.match(group, /assignment_\$\{zoneId\}_\$\{scalerUid\}/);
  assert.match(group, /group-assignment_\$\{zoneId\}_\$\{scalerUid\}/);
  assert.match(group, /scheduledShareCents: share/);
});

test("Job Room message notifies every other member but never the sender", () => {
  const body = callable("sendJobMessage", "updateCampaignMaterialLogistics");
  assert.match(body, /uid && uid !== context\.uid/);
  assert.match(body, /job-message_\$\{messageRef\.id\}_\$\{recipientId\}/);
  assert.match(body, /deepLink: \{destination: "job_room", zoneId\}/);
  assert.doesNotMatch(body, /emailRequested: true/);
});

test("material proposal uses operational validation and accepts the shared coordinate payload", () => {
  const body = callable("proposeMaterialLogisticsChange",
    "respondToMaterialLogisticsChange");
  assert.match(body, /operationalCallable/);
  assert.match(body, /assertOperationalPayload/);
  assert.match(body, /"latitude", "longitude"/);
  assert.doesNotMatch(body, /trackingCallable|assertTrackingPayload/);
  assert.match(body, /material-change_\$\{proposalRef\.id\}_\$\{scalerId\}/);
});

test("participant responses and unanimous confirmation are separately notified", () => {
  const body = callable("respondToMaterialLogisticsChange", "configureJobCoordination");
  assert.match(body, /material-change-response_\$\{proposalId\}_\$\{responder\}/);
  assert.match(body, /material-change-confirmed_\$\{proposalId\}_\$\{recipientId\}/);
  assert.match(body, /if \(status === "accepted"\)/);
  assert.match(body, /acceptedCount/);
  assert.match(body, /pendingCount/);
  assert.match(body, /declinedCount/);
});

test("readiness receipt and issue events have distinct non-financial semantics", () => {
  const readiness = callable("acknowledgeJobReadiness", "transitionMaterialHandoff");
  const receipt = callable("transitionMaterialHandoff", "createSupportCase");
  const issue = callable("reportMaterialHandoffFailure", "resolveSupportCase");
  assert.match(readiness, /ready_\$\{zoneId\}_\$\{context\.uid\}/);
  assert.match(readiness, /attendanceConfirmed: false/);
  assert.match(readiness, /materialReceiptConfirmed: false/);
  assert.match(readiness, /alreadyAcknowledged/);
  assert.match(readiness, /readinessSnapshot\.data\(\)\?\.readinessAcknowledged/);
  assert.match(receipt, /material-received_\$\{handoffRef\.id\}/);
  assert.match(receipt, /material-\$\{businessConfirmed \? "business" : "scaler"\}-confirmed_\$\{handoffRef\.id\}/);
  assert.match(receipt, /priority: "low"/);
  assert.match(issue, /material-issue_\$\{handoffRef\.id\}_\$\{failureType\}/);
});

test("notification delivery is in-app only and has deterministic deep links", () => {
  const helperStart = source.indexOf("function inAppNotification");
  const helperEnd = source.indexOf("exports.saveLegacyTrackingRoute", helperStart);
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /channel: "in_app"/);
  assert.match(helper, /emailRequested: false/);
  assert.match(helper, /pushRequested: false/);
  assert.match(source, /destination: "material_change_review"/);
});
