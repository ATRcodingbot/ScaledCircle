"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const authority = require("./campaign_execution_authority");
const privacy = require("../functions-logistics-access/policy");
const parser = require("@babel/parser");
const generate = require("@babel/generator").default;

test("legacy absence and explicit marketplace preserve authority; own-team and malformed modes fail closed", () => {
  for (const campaign of [{}, {executionMode: "marketplace"}]) assert.doesNotThrow(() => authority.assertMarketplace(campaign));
  for (const campaign of [null, {executionMode: "own_team"}, {executionMode: null}, {executionMode: ""}, {executionMode: "MARKETPLACE"}]) {
    assert.throws(() => authority.assertMarketplace(campaign), error => error.code === "failed-precondition");
  }
});

test("review binds exact normalized territory and zone geometry while ignoring zone ordering", () => {
  const campaign = {serviceArea: [{latitude: 39, longitude: -76}], planningSchemaVersion: 1, planningStage: "review"};
  const zones = [{id: "z2", serviceArea: [{lat: 39, lng: -76}]}, {id: "z1", serviceArea: [{latitude: 40, longitude: -76}]}];
  campaign.materialsAreaDigest = authority.planningDigest(campaign, zones);
  assert.doesNotThrow(() => authority.assertPlanningReview(campaign, [...zones].reverse()));
  assert.throws(() => authority.assertPlanningReview(campaign, zones.slice(1)), /current mapped area/);
  assert.throws(() => authority.assertPlanningReview({...campaign, serviceArea: [{latitude: 38, longitude: -76}]}, zones));
  assert.throws(() => authority.assertPlanningReview({...campaign, planningStage: "materials"}, zones));
  assert.throws(() => authority.assertPlanningReview({...campaign, planningSchemaVersion: 99}, zones));
  assert.doesNotThrow(() => authority.assertPlanningReview({}, []));
});

test("private mode produces no public campaign projection even with a forged open status", () => {
  const campaign = {businessId: "owner", campaignName: "Private plan", campaignType: "flyerDistribution", status: "open"};
  assert.deepEqual(privacy.projection("campaign", campaign), privacy.projection("campaign", {...campaign, executionMode: "marketplace"}));
  for (const status of ["draft", "open", "own_team_scheduled", "own_team_completed"]) {
    assert.equal(privacy.projection("campaign", {...campaign, status, executionMode: "own_team"}).document, null);
  }
  assert.equal(privacy.projection("campaign", {...campaign, executionMode: "unknown"}).document, null);
  assert.equal(privacy.locationAllowed("scaler", {assignedScalerId: "scaler", status: "assigned", campaignId: "campaign", businessId: "owner"}, {...campaign, executionMode: "own_team"}), false);
});

test("own-team mapping never attaches the marketplace contract even if the paid opening flag changes", () => {
  const policy = require("./production_campaign_policy");
  const campaign = {executionMode: "own_team", campaignType: "neighborhoodCanvassing"};
  const old = process.env.CANVASSING_NEW_CONTRACTS_ENABLED;
  try {
    for (const value of ["false", "true"]) {
      process.env.CANVASSING_NEW_CONTRACTS_ENABLED = value;
      assert.equal(policy.prospective(campaign), false);
      const plan = {zones: [{geometry: []}]};
      assert.equal(policy.planWithRoutes({campaign}, plan, {}), plan);
      assert.deepEqual(policy.mappedZone({campaign}, {}, "zone", null, plan), {});
    }
  } finally { if (old === undefined) delete process.env.CANVASSING_NEW_CONTRACTS_ENABLED; else process.env.CANVASSING_NEW_CONTRACTS_ENABLED = old; }
});

test("legacy extraction preserves its economic handler and only prepends parent mode authority", async () => {
  const {guardLegacyProgram} = require("../tools/campaign_execution_source_guard.cjs");
  for (const name of ["approveZonePayout", "configureZoneGroupAssignment", "finalizeZoneReview"]) {
    const ast = parser.parse(`exports.${name}=onCall({region:'us-east1'}, async request=>({legacyEconomicValue: request.data.amount}));`);
    const previous = generate(ast.program.body[0].expression.right.arguments[1]).code;
    guardLegacyProgram(ast, name, parser);
    const wrapped = ast.program.body[0].expression.right.arguments[1];
    assert.equal(generate(wrapped.body.body[1].argument.callee).code, previous);
    assert.match(generate(ast).code, /assertRequestMarketplace/);
  }
});

test("pinned legacy request guard resolves server resource parent, not a spoofed campaignId", async () => {
  const documents = new Map([["campaignZones/zone", {campaignId: "own"}], ["payouts/payout", {campaignId: "own"}], ["campaigns/own", {executionMode: "own_team"}], ["campaigns/market", {}]]);
  const db = {collection: collection => ({doc: id => ({get: async () => ({data: () => documents.get(`${collection}/${id}`)})})})};
  for (const resource of ["approveZonePayout", "configureZoneGroupAssignment", "finalizeZoneReview"]) {
    await assert.rejects(authority.assertRequestMarketplace({db, resource, request: {auth: {uid: "owner"}, data: {zoneId: "zone", payoutId: "payout", campaignId: "market"}}}), /own team/);
  }
  documents.set("campaigns/own", {});
  await assert.doesNotReject(authority.assertRequestMarketplace({db, resource: "finalizeZoneReview", request: {auth: {uid: "owner"}, data: {zoneId: "zone"}}}));
});

test("funding deployment replacement retains review/mode guards and shared copies stay identical", () => {
  const source = fs.readFileSync(path.join(__dirname, "../tools/prepare_production_funding.cjs"), "utf8");
  assert.match(source, /campaignExecution\.assertMarketplace\(fresh,HttpsError\)/);
  assert.match(source, /campaignExecution\.assertPlanningReview\(fresh,currentZones\.docs/);
  assert.match(source, /campaignExecution\.assertMarketplace\(campaign,HttpsError\)/);
  assert.match(source, /campaignExecution\.assertPlanningReview\(campaign,docs\.map/);
  const canonical = fs.readFileSync(path.join(__dirname, "campaign_execution_authority.js"), "utf8");
  for (const file of ["../functions-campaign-funding/campaign_execution_authority.js", "../functions-business-operations/shared/campaign_execution_authority.js"]) {
    assert.equal(fs.readFileSync(path.join(__dirname, file), "utf8"), canonical);
  }
});

test('new workload planning does not repartition paid/accepted history; financial and area-review gates remain independent',()=>{
 const draft={id:'c',businessId:'b',status:'draft'},zones=[{id:'a',campaignId:'c',businessId:'b'},{id:'b',campaignId:'c',businessId:'b'}];
 assert.throws(()=>authority.assertPlanningReview(draft,zones),/requested campaign workload/);
 assert.throws(()=>authority.assertPlanningReview({...draft,fundingStatus:'funded'},zones));
 const paid={...draft,fundingStatus:'funded',fundingPaymentId:'server-payment'};
 assert.doesNotThrow(()=>authority.assertPlanningReview(paid,zones));
 assert.doesNotThrow(()=>authority.assertPlanningReview(draft,[{...zones[0],assignedScalerId:'worker',status:'assigned'},zones[1]]));
 assert.throws(()=>authority.assertPlanningReview(draft,[{...zones[0],campaignId:'foreign',assignedScalerId:'worker',status:'assigned'}]));
 assert.throws(()=>authority.assertPlanningReview({...paid,planningSchemaVersion:1,planningStage:'materials'},zones),/current mapped area/);
 for(const status of ['open','in_progress','completed'])assert.doesNotThrow(()=>authority.assertPlanningReview({...draft,status,campaignWorkload:{version:'historical'}},zones));
});
