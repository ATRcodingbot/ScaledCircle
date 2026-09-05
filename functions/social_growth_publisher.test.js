"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {environment, contextFromRecords} = require("../functions-social-operations/social_growth_publisher");
const {publicationGate} = require("../functions-social-operations/social_growth_cycle");
const input = () => ({project: "scaled-circle", now: Date.parse("2030-01-02T12:00:00Z"),
  job: {id: "job", businessUid: "owner", approvalId: "approved", provider: "x", scheduledFor: "2030-01-02T12:00:00Z"},
  user: {role: "admin"}, state: {schemaVersion: "SocialPublisherSupervisorV1", businessUid: "owner",
    environment: "production", supervisorStatus: "healthy", killSwitchActive: false,
    externalPublishingEnabled: true, reviewed: true, mode: "approval_required", approvalId: "approved",
    jobIds: ["job"], providerUserId: "123", handle: "fixture"},
  connection: {environment: "production", provider: "x", providerUserId: "123", handle: "fixture", status: "connected_write",
    tokenHealth: "healthy", writeScopesGranted: true,
    grantedScopes: ["users.read", "tweet.read", "offline.access", "tweet.write", "media.write"]}});
const gate = value => publicationGate({job: value.job, ...contextFromRecords(value)});
test("normal Supervisor requires explicit tenant, environment, bounded job, mode and healthy identity", () => {
  assert.equal(gate(input()), "ready");
  for (const mutate of [v => v.state = null, v => v.state.businessUid = "other", v => v.state.jobIds = [],
    v => v.state.approvalId = "other", v => v.state.environment = "staging", v => v.connection.environment = "staging",
    v => v.state.killSwitchActive = true, v => v.state.supervisorStatus = "error", v => v.globalHealth = {killSwitchActive: true},
    v => v.state.externalPublishingEnabled = false, v => v.state.mode = "bounded_managed", v => v.user.role = "scaler",
    v => v.connection.providerUserId = "other", v => v.connection.grantedScopes.push("unexpected")]) {
    const value = input(); mutate(value); assert.notEqual(gate(value), "ready");
  }
  assert.throws(() => environment("unknown-production-project"));
});
test("publication requires certified write state in addition to scopes; invalid schedules fail closed", () => {
  const value = input(); value.connection.status = "connected_read_only";
  assert.equal(gate(value), "reconnect");
  value.connection.status = "connected_write";
  value.job.scheduledFor = "invalid"; assert.equal(gate(value), "schedule_invalid");
});
