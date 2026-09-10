'use strict';
// Deploy-time adapter for an older certified staging billing runtime. Retains
// its provider implementation and secret bindings; adds only purchase gating.
function wrap({original,db,project,HttpsError}) {
  return async request=>{
    if(project!=='scaledcircle-staging')throw new HttpsError('failed-precondition','This compatibility boundary is staging only.');
    if(!request.auth)throw new HttpsError('unauthenticated','Sign in to manage your membership.');
    const data=request.data||{};
    let selection=data.selection||{plan:data.plan},businessId=data.businessId||request.auth.uid;
    if(data.action==='changeSelection'||data.action==='changePlan'){
      if(typeof data.quoteId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.quoteId))throw new HttpsError('invalid-argument','Review the membership preview first.');
      const q=(await db.doc('businessBillingQuotes/'+data.quoteId).get()).data();
      if(!q||q.actorUid!==request.auth.uid||q.businessId!==businessId)throw new HttpsError('permission-denied','The preview is not available to this account.');
      selection=q.selection||{plan:q.plan};
    }
    try{await require('./product_availability').assertPurchase({db,businessId,selection});}
    catch(e){throw new HttpsError(e.code||'failed-precondition',e.message);}
    return original.run(request);
  };
}
module.exports={wrap};
