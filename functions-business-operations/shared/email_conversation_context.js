'use strict';
const hash=v=>require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function read({db,businessId,operationId,tx=null}){
 const root=db.doc('businessMailboxes/'+businessId),get=r=>tx?tx.get(r):r.get();
 const op=(await get(root.collection('operations').doc(operationId))).data();
 if(op?.businessId!==businessId)throw Object.assign(Error('Choose this Business conversation.'),{code:'permission-denied'});
 const own=await get(root.collection('replies').where('operationId','==',operationId).limit(101));
 const thread=op.providerThreadId?await get(root.collection('replies').where('providerThreadId','==',op.providerThreadId).limit(101)):null;
 const rows=[...new Map([...own.docs,...(thread?.docs||[])].map(d=>[d.id,{id:d.id,...d.data()}])).values()];
 if(rows.length>100)throw Object.assign(Error('This conversation needs a bounded review.'),{code:'failed-precondition'});
 if(rows.some(r=>r.businessId!==businessId||r.from!==op.recipient||r.to&&r.to!==op.from))throw Object.assign(Error('Conversation identity needs checking.'),{code:'permission-denied'});
 rows.sort((a,b)=>a.id.localeCompare(b.id));
 return {operation:op,rows,digest:hash(rows.map(r=>[r.id,r.providerMessageId,r.receivedAt,r.body,r.classification||'substantive']))};
}
module.exports={read};
