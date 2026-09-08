'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const policy = require('./production_canvassing_contract');
const shared = require('./canvassing_completion');
const {hash, distance} = require('./route_progress');

function fixture(bonusAmountCents=2400) {
  // Synthetic geometry only; never a customer or physical QA route.
  const a={latitude:40,longitude:-75}, b={latitude:40.001,longitude:-75};
  const corridor=[a,b,{latitude:40.001,longitude:-74.9999}];
  const zone={id:'zone',campaignId:'campaign',businessId:'business',status:'unassigned',
    serviceArea:corridor,executionRoute:{centerline:[a,b],routeHash:hash([a,b]),
      corridorHash:hash(corridor),denominatorMeters:distance(a,b)}};
  zone.executionRoute.uniqueRouteMeters=shared.coverage(zone,[]).denominatorMeters;
  const authority={version:policy.ROUTE_AUTHORITY_VERSION,zoneId:zone.id,
    campaignId:zone.campaignId,routeHash:zone.executionRoute.routeHash,
    corridorHash:zone.executionRoute.corridorHash,sourceSnapshotDigest:hash('synthetic-road-source'),
    state:'approved',accessReviewed:true,uniqueRouteMeters:zone.executionRoute.uniqueRouteMeters};
  const input={project:'scaled-circle',campaign:{id:'campaign',businessId:'business',
    campaignType:'neighborhoodCanvassing',status:'draft',createdAtMs:2000},zones:[zone],
    routeAuthorities:{zone:authority},baseAmountCents:18000,bonusAmountCents,
    effectiveFromMs:1000,createdAtMs:2000};
  const offer=policy.prepareOffer(input);
  const acceptance={offer,zone,routeAuthority:authority,serverAcceptedAtMs:3000,
    application:{campaignId:'campaign',zoneId:'zone',scalerId:'scaler',status:'pending',acceptedOfferDigest:offer.offerDigest},
    payment:{campaignId:'campaign',businessId:'business',status:'funded',currency:'usd',
      workerAmountCents:18000+bonusAmountCents,offerDigest:offer.offerDigest}};
  const contract=policy.acceptOffer(acceptance);
  const points=Array.from({length:12},(_,i)=>({latitude:40+i*.001/11,longitude:-75,
    accepted:true,horizontalAccuracy:5,timestampMs:100000+i*10000,sequence:i+1}));
  const chunk={sessionId:'session',zoneId:'zone',scalerId:'scaler',startSequence:1,endSequence:12,
    payloadDigest:hash(points),points};
  const session={sessionId:'session',routeId:'session',zoneId:'zone',campaignId:'campaign',scalerId:'scaler',
    status:'completed',endedAt:220000,chunkCount:1,pointCount:12,finalPointCount:12,finalAcceptedPointCount:12};
  const route={trackingSessionId:'session',zoneId:'zone',campaignId:'campaign',scalerId:'scaler',
    tracking:false,simulated:false,evidenceDigest:crypto.createHash('sha256').update(`1:12:${chunk.payloadDigest}`).digest('hex')};
  const evaluation={contract,zone:{...zone,status:'submitted',assignedScalerId:'scaler',routeId:'session'},
    routeAuthority:authority,session,chunks:[chunk],route};
  return {input,offer,acceptance,evaluation};
}

test('new production offer/acceptance pins real offered amounts and route identity',()=>{
  const f=fixture(); const original=JSON.stringify(f);
  const result=policy.evaluate(f.evaluation);
  assert.equal(result.policyVersion,policy.VERSION);
  assert.equal(result.payableBaseAmountCents,18000);
  assert.equal(result.bonusAmountCents,2400); // Never copies the physical QA $3.
  assert.equal(result.payableAmountCents,20400);
  assert.equal(result.householdCoverage,null);
  assert.equal(result.requiredCheckpointCount,0);
  assert.equal(result.disposition,'eligible_for_business_review');
  assert.equal(JSON.stringify(f),original);
});
test('older or assigned campaigns cannot be silently migrated',()=>{
  const f=fixture();
  assert.throws(()=>policy.prepareOffer({...f.input,createdAtMs:500}),/prospective/);
  assert.throws(()=>policy.prepareOffer({...f.input,campaign:{...f.input.campaign,status:'open'}}),/new_draft/);
  assert.throws(()=>policy.acceptOffer({...f.acceptance,existingContract:{baseAmountCents:50}}),/preserved/);
  assert.deepEqual(policy.evaluate({contract:{baseAmountCents:50}}),{disposition:'legacy_contract_preserved'});
});
test('a polygon/workload estimate cannot stand in for a serviceable route',()=>{
  const f=fixture();
  assert.throws(()=>policy.prepareOffer({...f.input,zones:[{...f.input.zones[0],executionRoute:null}]}),/route_binding/);
  assert.throws(()=>policy.prepareOffer({...f.input,routeAuthorities:{zone:{...f.input.routeAuthorities.zone,accessReviewed:false}}}),/serviceable_route/);
});
test('funding/offer/identity drift and missing explicit acceptance fail closed',()=>{
  const f=fixture();
  for(const mutate of [a=>{a.payment.workerAmountCents=18000;},a=>{a.application.acceptedOfferDigest='different';},
    a=>{a.payment.businessId='other';},a=>{a.payment.status='pending';},
    a=>{a.offer.bonusAmountCents=99999;},a=>{a.zone.businessId='other';}]) {
    const a=structuredClone(f.acceptance);mutate(a);assert.throws(()=>policy.acceptOffer(a));
  }
});
test('technical fault preserves base HOLD and cannot grant bonus/payment',()=>{
  const f=fixture();delete f.evaluation.zone.executionRoute;
  const result=policy.evaluate(f.evaluation);
  assert.equal(result.baseEligibility,'Technical Review Required');
  assert.equal(result.baseProtected,true);
  assert.equal(result.payableAmountCents,null);
  assert.equal(result.coverageBonusEligible,false);
  assert.equal(result.coverage.coveragePercentage,null);
});
test('access exception and unfinished finalization cannot become ordinary payment',()=>{
  for(const modify of [e=>{e.accessIssue=true;},e=>{e.session.status='active';}]) {
    const e=fixture().evaluation;modify(e);
    assert.equal(policy.evaluate(e).ordinarySubmissionAllowed,false);
    assert.equal(policy.evaluate(e).payableAmountCents,null);
  }
});
test('contract tampering and cross-assignment evidence fail closed',()=>{
  for(const modify of [e=>{e.contract.baseAmountCents=1;},e=>{e.zone.assignedScalerId='other';}]) {
    const e=structuredClone(fixture().evaluation);modify(e);assert.throws(()=>policy.evaluate(e),/immutable_assignment/);
  }
});
test('production prospective core shares certified exact 80/95 boundaries without proration',()=>{
  for(const [coveragePercentage,base,bonus] of [[79.99,false,false],[80,true,false],[94.99,true,false],[95,true,true],[100,true,true]]) {
    const d=shared.decision({coverage:{state:'available',coveragePercentage},baseAmountCents:18000,
      bonusAmountCents:2400,authorityValid:true,finalized:true});
    assert.equal(d.payableBaseAmountCents,base?18000:null);
    assert.equal(d.payableAmountCents,base?(bonus?20400:18000):null);
  }
});
test('unsupported future policies reject rather than falling back to legacy proration',()=>{
  const e=structuredClone(fixture().evaluation);e.contract.completionPolicyVersion='unknown';
  assert.throws(()=>policy.evaluate(e),/unsupported_compensation/);
});
test('zero accepted bonus earns the full base without inventing an extra payment',()=>{
 const result=policy.evaluate(fixture(0).evaluation);
 assert.equal(result.payableBaseAmountCents,18000);assert.equal(result.payableAmountCents,18000);
 assert.equal(result.bonusAmountCents,0);assert.equal(result.bonusStatus,'No accepted coverage bonus');
});
