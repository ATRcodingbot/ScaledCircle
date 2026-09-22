'use strict';
// Measurements reuse the exact publication account and current connection;
// they do not grant publishing authority or create provider objects.
async function permitted({db,job,approval,connection,config,environment,authorizeInternal,authorizeCustomer}) {
 if(!['facebook','instagram'].includes(job.provider)||approval?.businessUid!==job.businessUid||
   connection?.environment!==environment||connection?.status!=='connected_write'||
   connection?.tokenHealth!=='healthy'||connection?.providerUserId!==approval.providerAccounts?.[job.provider]?.providerUserId)
   throw Error('meta_measurement_identity_mismatch');
 if(job.businessUid===config?.metaDogfood?.businessUid){
   authorizeInternal(config,job.businessUid);
   if(connection.linkedPageId!==config.metaDogfood.pageId)throw Error('meta_measurement_identity_mismatch');
 }else{
   if(job.customerApproval!==true||approval.approvedByUid!==job.businessUid||
     !await authorizeCustomer({db,uid:job.businessUid}))throw Error('meta_measurement_customer_authority_required');
 }
 return true;
}
function scopes(granted){
 const oauth=require('./social_oauth');
 // Match the existing Meta connection normalization: only its implicit login
 // grant is excluded. Missing or additional explicit permissions still fail.
 return oauth.exactScopeSet((Array.isArray(granted)?granted:[]).filter(s=>s!=='public_profile'),oauth.META_PUBLISH_SCOPES);
}
module.exports={permitted,scopes};
