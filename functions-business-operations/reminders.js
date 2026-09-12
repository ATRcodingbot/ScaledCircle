'use strict';
const m=require('./model');
// A scheduled in-app reminder is not a customer email or a marketplace action.
// Recheck membership, assignment and notification choice at delivery time.
function createReminders({db,FieldValue,authority,now=Date.now}){
 return async function deliver(){
  const roots=await db.collection('businessOperations').limit(1001).get();
  if(roots.size>1000)m.fail('resource-exhausted','Reminder workspace inventory requires pagination.');
  let created=0;
  for(const root of roots.docs){
   const items=await root.ref.collection('items').where('startMs','>=',now()).where('startMs','<=',now()+30*60000).limit(1001).get();
   if(items.size>1000)m.fail('resource-exhausted','Reminder item inventory exceeds its safe bound.');
   for(const d of items.docs){
    const item=d.data();if(item.type!=='estimate'||item.status!=='scheduled')continue;
    const roster=await root.ref.collection('resources').get(),links=new Map(roster.docs.map(x=>['crew:'+x.id,x.data().status==='active'?x.data().linkedUid:null]));
    const users=new Set(item.assignedPeople.map(p=>p.startsWith('user:')?p.slice(5):links.get(p)).filter(Boolean));
    for(const uid of users){
     try{const didCreate=await db.runTransaction(async tx=>{
      const a=await authority({auth:{uid},data:{businessId:root.id}},{transaction:tx});
      if(!a.activePaid||!a.permissions.includes('scheduleView'))return;
      const [current,pref,existing]=await Promise.all([tx.get(d.ref),tx.get(root.ref.collection('preferences').doc(uid)),tx.get(db.doc('notifications/business_estimate_'+m.hash([root.id,d.id,uid,item.startMs])))]);
      const latest=current.data();
      if(existing.exists||pref.data()?.choices?.estimateReminders===false||latest?.status!=='scheduled'||latest.startMs!==item.startMs||JSON.stringify(latest.assignedPeople)!==JSON.stringify(item.assignedPeople))return;
      tx.create(existing.ref,{userId:uid,type:'business_estimate_reminder',title:'Upcoming estimate',message:'An estimate assigned to you starts within 30 minutes. Open Schedule for the current details.',read:false,createdAt:FieldValue.serverTimestamp(),route:'/business/schedule',metadata:{businessId:root.id,itemId:d.id}});return true;
     });if(didCreate)created++;}catch(e){if(!['permission-denied','unauthenticated','failed-precondition'].includes(e.code))throw e;}
    }
   }
  }
  return {created,customerEmailsSent:0};
 };
}
module.exports={createReminders};
