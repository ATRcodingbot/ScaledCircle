'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),binding=require('./settlement_funding_binding');
function fixture(){return {paymentId:'payment',campaignId:'campaign',zoneId:'zone',
 campaign:{businessId:'owner',fundingPaymentId:'payment',fundingVersion:1},
 zone:{campaignId:'campaign',businessId:'owner',assignedScalerId:'scaler'},
 contract:{zoneId:'zone',campaignId:'campaign',businessId:'owner',scalerId:'scaler',immutable:true},
 completion:{zoneId:'zone',campaignId:'campaign',businessId:'owner',scalerId:'scaler'},
 payment:{campaignId:'campaign',businessId:'owner',fundingVersion:1}};}
test('explicit campaign authority resolves absent zone pointer without changing any records',()=>{
 const f=fixture(),before=structuredClone(f);assert.equal(binding.resolve(f).shape,'campaign_reference_v1');binding.validate(f);assert.deepEqual(f,before);
});
test('matching dual reference and unversioned legacy zone reference remain supported',()=>{
 const f=fixture();f.zone.fundingPaymentId='payment';assert.equal(binding.resolve(f).shape,'campaign_and_zone_reference_v1');binding.validate(f);
 delete f.campaign.fundingPaymentId;delete f.campaign.fundingVersion;delete f.payment.fundingVersion;
 assert.equal(binding.resolve(f).shape,'legacy_zone_reference_v1');binding.validate(f);
});
test('missing, conflicting or malformed pointers never infer money relationships',()=>{
 for(const bad of ['different','../payment',' payment',42]){const f=fixture();f.zone.fundingPaymentId=bad;assert.throws(()=>binding.resolve(f));}
 const f=fixture();delete f.campaign.fundingPaymentId;assert.throws(()=>binding.resolve(f));
});
test('owner, assignment, completion, contract, payment and funding versions must all agree',()=>{
 for(const [part,key,value]of [['campaign','businessId','other'],['payment','campaignId','other'],['payment','businessUid','other'],['contract','immutable',false],['contract','scalerId','other'],['contract','fundingPaymentId','other'],['completion','zoneId','other'],['completion','businessId','other'],['payment','fundingVersion',2],['zone','fundingVersion','1'],['payment','fundingVersion',undefined]]){
  const f=fixture();f[part][key]=value;assert.throws(()=>binding.validate(f),{code:'failed-precondition'});
 }
});
