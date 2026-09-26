'use strict';
const m=require('./model');
const BINDINGS=['paymentId','campaignPaymentId','fundingPaymentId','fundingReceiptId','stripePaymentIntentId','paymentIntentId','assignmentCompensationId','compensationContractId','assignedScalerId','groupAssignmentId','submittedCompletionId','activeTrackingSessionId','resumableTrackingSessionId','reserveSettlementId'];
function bound(row){
 return BINDINGS.some(k=>!!row[k])||row.funded===true||row.gpsTracking===true||
  ['funded','paid','partially_funded','processing','authorized','reserved'].includes(row.fundingStatus)||
  ['paid','funded','authorized','transfer_pending','transferred'].includes(row.paymentStatus)||
  (Array.isArray(row.assignedScalers)&&row.assignedScalers.length>0);
}
// Pass server-read query rows/snapshots, never request-supplied inventories.
function assertOwnTeamClean(campaign,zones,inventories={}){
 if(campaign.executionMode!=='own_team')m.fail('failed-precondition','Only My Own Team campaigns can use Business-reported completion.');
 if(bound(campaign)||zones.some(bound)||Object.values(inventories).some(x=>Array.isArray(x)?x.length>0:!!x?.size))
  m.fail('failed-precondition','This campaign has marketplace work or funding bindings and needs review before own-team execution.');
}
module.exports={assertOwnTeamClean};
