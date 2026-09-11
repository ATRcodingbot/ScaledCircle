'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const prefs=require('../functions-agentic-growth/growth_opportunity_preferences');
test('government and paid lead sellers require explicit opt-in',()=>{
  for(const type of ['public_bid','paid_lead_source'])assert.equal(prefs.enabled({opportunityType:type}),false);
  assert.equal(prefs.enabled({opportunityType:'public_bid'},{government:true}),true);
  assert.equal(prefs.enabled({opportunityType:'paid_lead_source'},{government:true}),false);
});
test('excluded historical evidence is preserved without approval or active recommendation',()=>{
  for(const id of ['RFQ-000859','RFQ-000775','RFQ-000864']){
    const row={id,opportunityType:'public_bid',draft:'Historical draft',sourceHash:'preserved',sourceEvidenceIds:['observation'],needsApproval:true};
    const original=JSON.stringify(row),result=prefs.project(row);
    assert.equal(JSON.stringify(row),original);assert.equal(result.sourceHash,row.sourceHash);
    assert.equal(result.draft,row.draft);assert.equal(result.needsApproval,false);
    assert.equal(result.preferenceStatus,'Excluded by Growth Preferences');
  }
});
test('workforce individuals and recruitment organizations are independent preferences',()=>{
  const settings={recruitmentPartners:false};
  assert.equal(prefs.enabled({kind:'scaler'},settings),true);
  assert.equal(prefs.enabled({kind:'referral_partner'},settings),false);
});
test('preferences cannot accept provider authority, spending or unknown values',()=>{
  for(const input of [{government:'true'},{publish:true},[],{paidLeadSources:1}])assert.throws(()=>prefs.normalize(input),{code:'invalid-argument'});
});
test('disabled evidence cannot enter active inventory even when highly ranked',()=>{
  const rows=[{opportunityType:'public_bid',ranking:{score:100}},{opportunityType:'commercial'},{opportunityType:'paid_lead_source'}];
  assert.deepEqual(prefs.active(rows),[rows[1]]);
});
