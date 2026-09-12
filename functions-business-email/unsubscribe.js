'use strict';
const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function createUnsubscribe({db,now=Date.now}){
 return async(token,{confirm=false}={})=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('invalid_link');
  const ref=db.doc('businessEmailUnsubscribeLinks/'+hash(token));
  return db.runTransaction(async tx=>{
   const link=(await tx.get(ref)).data();if(!link||!link.businessId||!link.recipient)throw Error('invalid_link');
   const root=db.doc('businessMailboxes/'+link.businessId),restriction=root.collection('suppression').doc(hash(link.recipient));
   const old=(await tx.get(restriction)).data(),audit=root.collection('contactHistory').doc('unsubscribe_'+hash(token)),prior=await tx.get(audit);
   if(!confirm)return {valid:true,unsubscribed:old?.active===true};
   if(!prior.exists)tx.create(audit,{businessId:link.businessId,recipient:link.recipient,action:'unsubscribed',source:'recipient_link',recordedAt:now()});
   if(old?.active!==true||old.reason!=='unsubscribed')tx.set(restriction,{businessId:link.businessId,recipient:link.recipient,reason:'unsubscribed',active:true,source:'recipient_link',updatedAt:now()},{merge:true});
   return {valid:true,unsubscribed:true};
  });
 };
}
module.exports={createUnsubscribe};
