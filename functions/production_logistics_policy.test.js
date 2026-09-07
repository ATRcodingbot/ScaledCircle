'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {projection, locationAllowed} = require('../functions-logistics-access/policy');
const {productionValidZones} = require('../functions-campaign-funding/production_publish_compatibility');
const {activeAssignment,scalerResponse} = require('../functions-logistics-access/job_room_privacy');
const base = {businessId:'owner', campaignName:'Campaign', type:'neighborhoodCanvassing', status:'open',
  basePay:15, publicLogistics:{postalCode:'21061'}, materialFulfillmentType:'scaler_pickup_business'};
test('public projection allows only public fields and preserves type, unknown logistics and closure', () => {
  const result = projection('campaign', {...base, address:'PRIVATE', phone:'PRIVATE',
    description:'PRIVATE', materialHandoffAddress:'PRIVATE', location:{latitude:12,longitude:15},
    publicLogistics:{postalCode:'21061',address:'PRIVATE'}});
  assert.equal(result.document.campaignType,'neighborhoodCanvassing');
  assert.equal(result.document.materialLogistics.approximateDistanceMiles,null);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|latitude|longitude/);
  assert.equal(projection('campaign',{...base,status:'completed'}).document.status,'completed');
  assert.equal(projection('campaign',null).document,null);
  assert.equal(projection('campaign',{...base,type:null}).reason,'required_public_identity_missing');
});
test('exact active assigned-location scope and terminal revocation', () => {
  const l={campaignId:'campaign',businessId:'owner',assignedScalerId:'scaler',status:'assigned'};
  assert.equal(locationAllowed('scaler',l,base),true);
  for (const uid of ['other','applicant',null]) assert.equal(locationAllowed(uid,l,base),false);
  assert.equal(locationAllowed('scaler',{...l,businessId:'other'},base),false);
  for (const status of ['completed','submitted','cancelled','rejected']) assert.equal(locationAllowed('scaler',{...l,status},base),false);
  assert.equal(locationAllowed('scaler',l,{...base,status:'canceled'}),false);
});
test('production funding retains deployed filtering, without changing predicate or valid docs', () => {
  const good={data:()=>({campaignId:'campaign',businessId:'owner',mapped:true})};
  const legacyPoints={data:()=>({campaignId:'campaign',serviceAreaPointCount:3})};
  const bad={data:()=>({campaignId:'campaign',mapped:false,pointCount:2})};
  assert.deepEqual(productionValidZones([bad,good,legacyPoints],'campaign','owner'),[good,legacyPoints]);
  assert.deepEqual(productionValidZones([bad],'campaign','owner'),[]);
  assert.deepEqual(productionValidZones([good],'campaign','other'),[]);
});
test('Job Room terminal response cannot retain private payloads or restore cross-tenant access',()=>{
 const room={id:'zone',campaignId:'campaign',businessId:'owner',materialLogistics:{location:'PRIVATE'}};
 const zone={id:'zone',campaignId:'campaign',businessId:'owner',assignedScalerId:'scaler',status:'assigned'};
 assert.equal(activeAssignment('scaler',room,zone,base,null),true);
 assert.equal(activeAssignment('other',room,zone,base,null),false);
 assert.equal(activeAssignment('scaler',room,{...zone,status:'submitted'},base,null),false);
 assert.equal(activeAssignment('scaler',room,zone,{...base,businessId:'other'},null),false);
 const response={room,zone,campaign:{id:'campaign',...base,address:'PRIVATE'},compensation:{baseAmountCents:1500,acceptedMaterialLogistics:{location:'PRIVATE'}},messages:[{text:'PRIVATE'}]};
 const revoked=scalerResponse(response,false);
 assert.doesNotMatch(JSON.stringify(revoked),/PRIVATE/);
 assert.equal(revoked.compensation.baseAmountCents,1500);
 assert.equal(revoked.privateLogisticsAvailable,false);
 const active=scalerResponse(response,true);
 assert.equal(active.privateLogisticsAvailable,true);
 assert.equal(active.campaign.address,undefined);
});
