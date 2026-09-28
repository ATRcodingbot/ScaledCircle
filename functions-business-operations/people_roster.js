'use strict';
const m=require('./model');
function createRoster({db}) {
 const root=b=>db.doc('businessOperations/'+m.id(b));
 async function bounded(query,tx) {const s=await(tx?tx.get(query.limit(1001)):query.limit(1001).get());if(s.size>1000)m.fail('resource-exhausted','People inventory is too large.');return s.docs.map(d=>({id:d.id,...d.data()}));}
 async function people(a,tx){
  const [members,crew]=await Promise.all([bounded(db.collection(`businessWorkspaces/${a.businessId}/members`).where('status','==','active'),tx),bounded(root(a.businessId).collection('resources'),tx)]);
  const owner=(await(tx?tx.get(db.doc('users/'+a.ownerUid)):db.doc('users/'+a.ownerUid).get())).data()||{};
  const users=[{id:'user:'+a.ownerUid,name:owner.displayName||owner.name||(a.actorUid===a.ownerUid?a.actorName:null)||owner.companyName||'Business owner',kind:'user',uid:a.ownerUid},...members.filter(x=>x.businessId===a.businessId&&Number.isInteger(x.seatIndex)&&x.seatIndex>0&&x.seatIndex<a.capacity).map(x=>({id:'user:'+x.uid,name:x.name||'Team member',kind:'user',uid:x.uid}))];
  return [...users,...crew.map(x=>({id:'crew:'+x.id,name:x.name,kind:'crew',status:x.status,linkedUid:x.linkedUid||null,version:x.version}))];
 }
 return people;
}
module.exports={createRoster};
