'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const policy=require('./canvassing_completion'),route=require('./route_progress');
const a={latitude:39,longitude:-76}, b={latitude:39.001,longitude:-76};
const corridor=[a,b,{latitude:39.001,longitude:-75.9999}];
function zone(line=[a,b]) {return {serviceArea:corridor,executionRoute:{centerline:line,routeHash:route.hash(line),corridorHash:route.hash(corridor),denominatorMeters:line.slice(1).reduce((s,p,i)=>s+route.distance(line[i],p),0)}};}
const evidence=Array.from({length:12},(_,i)=>({latitude:39+i*.001/11,longitude:-76,accepted:true,horizontalAccuracy:5,timestampMs:100000+i*10000}));
test('economic eligibility stays held at every coverage, without linear base proration',()=>{
 for(const coveragePercentage of [0,10,20.7872,95,100]) {const d=policy.decision({coverage:{coveragePercentage},baseAmountCents:1500});assert.equal(d.baseAmountCents,1500);assert.equal(d.payableAmountCents,null);assert.equal(d.ordinarySubmissionAllowed,false);assert.equal(d.bonusAmountCents,null);}
});
test('production and non-canvassing authority unchanged',()=>{assert.equal(policy.applies('scaled-circle',{type:'neighborhoodCanvassing'}),false);assert.equal(policy.applies('scaledcircle-staging',{type:'yardCleanup'}),false);assert.equal(policy.applies('scaledcircle-staging',{type:'neighborhoodCanvassing'}),true);});
test('unique route cells never earn duplicate credit from repeat passes or return centerline',()=>{
 const single=policy.coverage(zone(),evidence),repeated=policy.coverage(zone([a,b,a]),[...evidence,...evidence.map(p=>({...p,timestampMs:p.timestampMs+200000}))]);
 assert.ok(Math.abs(single.denominatorMeters-repeated.denominatorMeters)<.01);assert.equal(single.coveragePercentage,repeated.coveragePercentage);assert.equal(single.householdCoverage,null);
});
test('realistic sidewalk offset gains bounded tolerance but distant evidence does not',()=>{
 const offset=evidence.map(p=>({...p,longitude:p.longitude+.0001}));assert.ok(policy.coverage(zone(),offset).coveragePercentage>90);
 assert.equal(policy.coverage(zone(),evidence.map(p=>({...p,longitude:p.longitude+.001}))).coveragePercentage,0);
});
test('outliers, missing accuracy, and rejected points do not earn credit',()=>{
 for(const override of [{accepted:false},{horizontalAccuracy:400},{horizontalAccuracy:undefined},{latitude:NaN}])assert.equal(policy.coverage(zone(),evidence.map(p=>({...p,...override}))).coveragePercentage,null);
});
test('long GPS gaps cannot interpolate a complete route',()=>{const points=[evidence[0],{...evidence.at(-1),timestampMs:1000000}];assert.ok(policy.coverage(zone(),points).coveragePercentage<40);});
test('binding mutation fails closed; missing centerline is unavailable',()=>{const z=zone();z.executionRoute.denominatorMeters++;assert.throws(()=>policy.coverage(z,evidence));assert.equal(policy.coverage({},evidence).state,'unavailable');});
test('evaluation is read-only and manual marks never gate canvassing eligibility',()=>{const z=zone(),before=JSON.stringify({z,evidence});const c=policy.coverage(z,evidence);assert.equal(JSON.stringify({z,evidence}),before);assert.equal(policy.decision({coverage:c,baseAmountCents:1500,checkpointCount:0,requiredCheckpointCount:2}).remainingCheckpoints,0);});

for (const [percent,base,bonus] of [[79.99,false,false],[80,true,false],[94.99,true,false],[95,true,true],[100,true,true]]) {
 test(`80/95 boundary ${percent}: full base=${base}, accepted bonus=${bonus}`,()=>{
  const d=policy.decision({coverage:{state:'available',coveragePercentage:percent},baseAmountCents:1500,bonusAmountCents:300,authorityValid:true,finalized:true});
  assert.equal(d.ordinarySubmissionAllowed,base);assert.equal(d.payableBaseAmountCents,base?1500:null);
  assert.equal(d.coverageBonusEligible,bonus);assert.equal(d.payableAmountCents,base?(bonus?1800:1500):null);
 });
}
test('technical fault protects held base but cannot manufacture a bonus or payment',()=>{
 const d=policy.decision({coverage:{state:'available',coveragePercentage:100},baseAmountCents:1500,bonusAmountCents:300,authorityValid:true,finalized:true,technicalIssue:'mapping_failure',technicalReviewSupported:true});
 assert.equal(d.baseEligibility,'Technical Review Required');assert.equal(d.baseProtected,true);assert.equal(d.payableAmountCents,null);assert.equal(d.coverageBonusEligible,false);
});
test('access report never adjusts denominator or auto-grants credit; historical receipts remain held',()=>{
 for(const reason of [{accessIssue:true},{historical:true}]) {const d=policy.decision({coverage:{state:'available',coveragePercentage:100},baseAmountCents:1500,authorityValid:true,finalized:true,...reason});assert.equal(d.payableAmountCents,null);assert.equal(d.ordinarySubmissionAllowed,false);}
});
test('no assignment, unfinished lifecycle, or unavailable confidence cannot earn base',()=>{
 for(const input of [{authorityValid:false},{finalized:false},{coverage:{state:'unavailable',coveragePercentage:100}}]){
  assert.equal(policy.decision({coverage:{state:'available',coveragePercentage:100},baseAmountCents:1500,authorityValid:true,finalized:true,...input}).payableAmountCents,null);
 }
});
test('parallel off-route walking and repeated endpoint loops cannot exploit GPS tolerance',()=>{
 for(const accuracy of [5,20,35]) {const away=evidence.map(p=>({...p,longitude:p.longitude+.0004,horizontalAccuracy:accuracy}));assert.equal(policy.coverage(zone(),away).coveragePercentage,0);}
 const stationary=Array.from({length:100},(_,i)=>({...evidence[0],timestampMs:100000+i*1000}));assert.ok(policy.coverage(zone(),stationary).coveragePercentage<30);
});
