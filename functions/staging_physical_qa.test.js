"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const qa = require("./staging_physical_qa");
const authority = {projectId: "scaledcircle-staging", immutable: true,
  certificationFixture: true, campaignId: qa.CAMPAIGN_ID, zoneId: qa.ZONE_ID,
  businessUid: "business", scalerUid: "scaler"};
const input = {projectId: "scaledcircle-staging", authority};
test("only bound actors access QA and only the bound Scaler can be assigned", () => {
  for (const uid of ["business", "scaler"]) {
    assert.equal(qa.assertAccess({...input, uid}).scalerUid, "scaler");
  }
  assert.throws(() => qa.assertAccess({...input, uid: "other"}), /identity_denied/);
  assert.throws(() => qa.assertAccess({...input, uid: "business", targetScalerUid: "other"}), /identity_denied/);
  assert.equal(qa.assertAccess({...input, uid: "business", targetScalerUid: "scaler"}).businessUid, "business");
});
test("production and malformed authority cannot activate QA", () => {
  for (const projectId of ["scaled-circle", "", "demo-scaledcircle"]) {
    assert.throws(() => qa.assertAccess({...input, projectId, uid: "scaler"}), /authority_unavailable/);
  }
  for (const change of [{immutable: false}, {campaignId: "other"}, {zoneId: "other"},
    {projectId: "scaled-circle"}, {scalerUid: "business"}, {certificationFixture: false}]) {
    assert.throws(() => qa.assertAccess({...input, authority: {...authority, ...change}, uid: "scaler"}));
  }
});
test("QA suppresses broad notification fan-out; ordinary jobs remain unchanged", () => {
  assert.equal(qa.suppressOpportunity(qa.CAMPAIGN_ID, {}), true);
  assert.equal(qa.suppressOpportunity("other", {certificationFixture: true}), true);
  assert.equal(qa.suppressOpportunity("ordinary", {}), false);
  assert.equal(qa.reserved("ordinary", "ordinary-zone"), false);
});

test('exactly two reserved fixtures deny cross-access and cross-assignment',()=>{
 assert.equal(qa.FIXTURES.length,4);
 for(const f of qa.FIXTURES){const own={...authority,...f,scalerUid:f.purpose};
  const args={projectId:'scaledcircle-staging',authority:own,campaignId:f.campaignId,zoneId:f.zoneId};
  assert.equal(qa.assertAccess({...args,uid:f.purpose}).scalerUid,f.purpose);
  const other=qa.FIXTURES.find(x=>x.purpose!==f.purpose);
  assert.throws(()=>qa.assertAccess({...args,uid:other.purpose}),/identity_denied/);
  assert.throws(()=>qa.assertAccess({...args,uid:'business',targetScalerUid:other.purpose}),/identity_denied/);
  assert.throws(()=>qa.assertAccess({...args,uid:f.purpose,zoneId:other.zoneId}),/identity_denied/);
  assert.throws(()=>qa.assertAccess({...args,uid:f.purpose,projectId:'scaled-circle'}),/authority_unavailable/);
  assert.equal(qa.suppressOpportunity(f.campaignId,{}),true);
  assert.equal(qa.authorityPath(f.campaignId),`internalCertificationAuthorities/${f.campaignId}`);
 }
});
