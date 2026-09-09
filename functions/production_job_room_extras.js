'use strict';
const policy=require('./production_campaign_policy');
const authority=require('./production_work_settlement_policy');
async function read({db,FieldValue,Timestamp,zoneId,uid,isAdmin,evidence}){
 const zone=(await db.doc('campaignZones/'+zoneId).get()).data();
 if(!zone)return {};
 const campaign=(await db.doc('campaigns/'+zone.campaignId).get()).data();
 if(!campaign||!policy.applies(campaign)||campaign.businessId!==zone.businessId)return {};
 if(!isAdmin&&uid!==zone.businessId&&uid!==zone.assignedScalerId)return {};
 const contract=(await db.doc('assignmentCompensations/'+zoneId).get()).data();
 authority.contract(zoneId,zone,contract);
 const result={},settlement=(await db.doc('campaignSettlements/'+zoneId).get()).data();
 if(settlement){
  // Explicit financial fields only. Provider IDs/audit internals stay private.
  result.reserveSettlement=Object.fromEntries(['policyVersion','maximumWorkerCents','maximumFeeCents','earnedWorkerCents',
   'earnedFeeCents','unusedWorkerCents','unusedFeeCents','businessReturnCents','finalCostCents','maximumCostCents','returnStatus']
   .map(k=>[k,settlement[k]??null]));
 }else if(Number.isSafeInteger(evidence?.policy?.payableAmountCents)&&evidence.policy.payableAmountCents>0){
  result.reserveSettlement={...require('./campaign_reserve_settlement').allocation(contract,evidence.policy.payableAmountCents),returnStatus:'preview'};
 }
 if(zone.intentionalPauseId)result.pausedWork=await require('./paused_work').createService({db,FieldValue,Timestamp,
  project:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT}).read(zoneId,{uid,isAdmin});
 return result;
}
module.exports={read};
