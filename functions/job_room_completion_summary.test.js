'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const summary=require('./job_room_completion_summary');
const room={businessId:'owner',campaignId:'campaign',scalerId:'scaler'};
const zone={businessId:'owner',campaignId:'campaign',status:'completed',reviewStatus:'approved'};
function harness({otherLedger=false}={}) {
 const calls=[];
 const db={collection(name){calls.push(name);return {
  doc(id){return {get:async()=>({id,data:()=>name==='users'?{displayName:'Avery',email:'PRIVATE'}:
    {type:'scaler_earnings',scalerId:otherLedger?'other':'scaler',zoneId:'zone',campaignId:'campaign',amountCents:1800,baseAmountCents:1500,bonusAmountCents:300}})};},
  where(){return {limit(){return {get:async()=>({docs:[
    {id:'completion',data:()=>({zoneId:'zone',campaignId:'campaign',scalerId:'scaler',status:'approved',gpsPointCount:35,scalerEmail:'PRIVATE',proofs:[{privateData:'PRIVATE'}]})},
    {id:'foreign',data:()=>({zoneId:'zone',campaignId:'other',scalerId:'scaler'})},
  ]})};}};},
 };}};
 return {db,calls};
}
test('completed presentation reads recorded coverage-independent amounts and safe identity',async()=>{
 const {db}=harness();const result=await summary.read({db,room,zone,zoneId:'zone',actor:{uid:'scaler'}});
 assert.equal(result.completions.length,1);assert.equal(result.completions[0].earning.amountCents,1800);
 assert.equal(result.completions[0].earning.baseAmountCents,1500);assert.equal(result.completions[0].earning.bonusAmountCents,300);
 assert.equal(result.participantLabels.participants[0].displayName,'Avery');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|scalerEmail/);
});
test('unrelated identity or cross-workspace binding fails before reads',async()=>{
 for(const args of [{actor:{uid:'other'},zone},{actor:{uid:'scaler'},zone:{...zone,businessId:'other'}}]){
  const {db,calls}=harness();await assert.rejects(summary.read({db,room,zoneId:'zone',...args}),/member_required/);assert.equal(calls.length,0);
 }
});
test('another Scaler ledger cannot become this completion payment',async()=>{
 const {db}=harness({otherLedger:true});const result=await summary.read({db,room,zone,zoneId:'zone',actor:{uid:'owner'}});
 assert.equal(result.completions[0].earning,null);
});
