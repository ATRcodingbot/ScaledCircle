'use strict';
// Included only by the held production assembler. No callable or provider client.
const contracts=require('./production_canvassing_contract');
const {hash}=require('./route_progress');
function fail(message){const e=new Error(message);e.code='failed-precondition';throw e;}
function environment(project){
 const local=project==='demo-production-engineering' &&
  ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'].every(k=>/^(localhost|127\.0\.0\.1):\d+$/.test(process.env[k]||''));
 if(process.env.APP_ENV!=='production'||(!local&&project!=='scaled-circle'))fail('Production settlement environment required.');
}
function contract(zoneId,zone,value){
 const fields=['completionPolicyVersion','campaignId','businessId','zoneId','scalerId','currency',
  'baseAmountCents','bonusAmountCents','offerDigest','routeBinding','acceptedAtMs','immutable'];
 if(value?.completionPolicyVersion!==contracts.VERSION||value.immutable!==true||
  value.contractDigest!==hash(Object.fromEntries(fields.map(k=>[k,value[k]])))||value.zoneId!==zoneId||
  value.campaignId!==zone.campaignId||value.businessId!==zone.businessId||value.scalerId!==zone.assignedScalerId)
  fail('Only an intact versioned assignment can use this settlement authority.');
 if(hash({zoneId,...contracts.routeBinding({...zone,id:zoneId},zone.coverageAuthority)})!==hash(value.routeBinding))
  fail('Accepted route authority changed. Technical review is required.');
}
function payment(value,accepted){
 if(value?.status!=='paid'||!value.paidAt||value.stripeMode!=='live'||!/^pi_/.test(value.stripePaymentIntentId||'')||
  value.offerDigest!==accepted.offerDigest||value.acceptedOffer?.offerDigest!==accepted.offerDigest||
  value.settlementFrozen===true)fail('Signed funding for the accepted offer is required.');
 contracts.validateOffer(value.acceptedOffer);
}
function createsEnabled(){return process.env.UNUSED_WORK_REFUNDS_ENABLED==='true';}
module.exports={environment,contract,payment,createsEnabled};
