"use strict";
// This is the reviewed existing provider binding, not a provider credential.
const ORGANIZATION='org-RuydJ0TAcN3M520sgx2Vb0yQ';
const PROJECT='proj_1OMylHegOdhjnZm2TYywupjL';
function validReview(v){return v?.status==='verified'&&v.organization===ORGANIZATION&&v.project===PROJECT&&
 typeof v.approvedBy==='string'&&!!v.approvedBy&&typeof v.evidenceRef==='string'&&!!v.evidenceRef&&
 v.trainingSharingDisabled===true&&v.gmailProcessingPermitted===true&&v.loggingMode==='per_call_store_false'&&
 v.googleReviewDisposition==='processing_permitted'&&v.implementationVersion==='email_pilot_v1';}
module.exports={ORGANIZATION,PROJECT,validReview};
