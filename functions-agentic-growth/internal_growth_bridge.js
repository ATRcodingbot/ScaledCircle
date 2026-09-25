'use strict';
// The internal dataset stays in its original project and namespace. Production
// receives only this operation-bound view; no cross-project Firestore IAM grant.
const OPERATIONS = new Set(['load','research','configure','preferences','review']);
function authorizeProductionActor({expectedUid,uid,tokenVerified,user,identity}) {
  if(!expectedUid || uid!==expectedUid || tokenVerified!==true || identity?.emailVerified!==true ||
      identity.disabled!==false || user?.role!=='admin') throw Error('Internal Admin authority required.');
  // The maintained Admin authority is role-based. users.active is a customer
  // access flag and is false on the existing production Admin; do not rewrite
  // that profile or mistake the flag for Firebase Auth's disabled status.
}
function validateEnvelope(body, expectedActor) {
  if(!expectedActor || !body || typeof body!=='object' || Array.isArray(body) ||
      Object.keys(body).some(k=>!['operation','input','actorUid'].includes(k)) ||
      body.actorUid!==expectedActor || !OPERATIONS.has(body.operation)) throw Error('Invalid internal workspace request.');
  if(['load','research'].includes(body.operation) && Object.keys(body.input||{}).length) throw Error('Scope is server maintained.');
  return body;
}
async function forward({url,actorUid,operation,input,auth}) {
  if(!/^https:\/\/internalgrowthworkspacebridgev1-[a-z0-9-]+\.a\.run\.app$/.test(url||'')) throw Error('Internal workspace bridge is not configured.');
  validateEnvelope({actorUid,operation,input},actorUid);
  let response;
  try {
    const client=await auth.getIdTokenClient(url);
    response=await client.request({url,method:'POST',data:{operation,input:input||{},actorUid},timeout:175000});
  } catch (cause) {
    const error=Error('The internal workspace service is unavailable. Retry to read saved activity.');
    error.code='unavailable';
    error.stage='internal_bridge_transport';
    error.providerStatus=Number.isInteger(cause?.response?.status)?cause.response.status:null;
    // Never propagate a credential-bearing HTTP client error or numeric HTTP code.
    throw error;
  }
  if(response.data?.error) {const e=Error(response.data.error.message);e.code=response.data.error.code;throw e;}
  if(!response.data?.result || typeof response.data.result!=='object' || Array.isArray(response.data.result)) {
    const error=Error('The internal workspace response is incompatible.');error.code='data-loss';throw error;
  }
  return response.data.result;
}
module.exports={validateEnvelope,forward,authorizeProductionActor};
