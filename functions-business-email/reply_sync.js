'use strict';
const {randomUUID}=require('node:crypto');
// One bounded traversal for the existing five-minute worker. Cursor progress is
// independent of the UI's recent-history window and of model availability.
function createReplySync({db,root,sub,reconcile,now=Date.now}){
 return async a=>{
  const stateRef=sub(a.businessId,'private','replySync'),lease=randomUUID();
  const acquired=await db.runTransaction(async tx=>{
   const [mail,state]=await Promise.all([tx.get(root(a.businessId)),tx.get(stateRef)]);
   const c=mail.data(),s=state.data();
   if(c?.status!=='connected'||c.permissions?.read!==true||s?.leaseUntil>now())return null;
   tx.set(stateRef,{businessId:a.businessId,lease,leaseUntil:now()+150000},{merge:true});
   return {generation:c.generation,cursor:s?.generation===c.generation?s?.cursor:null};
  });
  if(!acquired)return {checked:0};
  let checked=0,attempted=0,scanned=0,cursor=null,wrapped=false;
  try{
   let query=root(a.businessId).collection('operations').orderBy('requestedAt','desc').limit(100);
   if(acquired.cursor){const d=await sub(a.businessId,'operations',acquired.cursor).get();if(d.exists)query=query.startAfter(d);}
   const page=await query.get();
   for(const d of page.docs){
    const op=d.data();scanned++;cursor=d.id;
    if(op.businessId!==a.businessId||!['sent','received'].includes(op.state)||op.replyMonitoring==='closed'||now()-(op.lastCheckedAt||0)<300000)continue;
    const claimed=await db.runTransaction(async tx=>{
     const [doc,mail,state]=await Promise.all([tx.get(d.ref),tx.get(root(a.businessId)),tx.get(stateRef)]);
     const v=doc.data(),c=mail.data();
     if(state.data()?.lease!==lease||c?.generation!==acquired.generation||c.status!=='connected'||c.permissions?.read!==true||
       !['sent','received'].includes(v?.state)||v?.replyMonitoring==='closed'||v.businessId!==a.businessId||now()-(v.lastCheckedAt||0)<300000)return false;
     tx.update(d.ref,{lastCheckedAt:now()});return true;
    });
    if(!claimed)continue;
    attempted++;
    try{await reconcile(a,{operationId:d.id});checked++;}
    catch(e){await d.ref.update({replyCheckStatus:e.code==='permission-denied'?'needs_permission':'needs_review'});}
    if(attempted>=3)break;
   }
   if(scanned===page.size&&page.size<100)wrapped=true;
   return {checked,attempted,scanned,wrapped};
  }finally{
   await db.runTransaction(async tx=>{const old=await tx.get(stateRef);if(old.data()?.lease!==lease)return;
    tx.set(stateRef,{generation:acquired.generation,cursor:wrapped?null:cursor||acquired.cursor||null,
     lease:null,leaseUntil:0,lastVisitAt:now(),checked,attempted,scanned},{merge:true});});
  }
 };
}
module.exports={createReplySync};
