'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-social-enrollment'},'social-enrollment'),db=getFirestore(app);
const enrollment=require('../functions-social-operations/social_customer_enrollment');
after(async()=>{await db.terminate();await deleteApp(app);});
test('due-job inventory ignores empty subscribers and never creates approvals or publications',async()=>{
 const now=Date.now(),active={planId:'managed_growth',status:'active',expiresAt:Timestamp.fromMillis(now+86400000)};
 const batch=db.batch();
 for(let i=0;i<125;i++)batch.set(db.doc('businessSubscriptions/customer_'+String(i).padStart(3,'0')),active);
 for(const [uid,record] of Object.entries({lower:{...active,planId:'scale'},expired:{...active,expiresAt:Timestamp.fromMillis(now-1)},canceled:{...active,status:'canceled'}}))batch.set(db.doc('businessSubscriptions/'+uid),record);
 for(const [id,uid,offset,status,customerApproval] of [['due','customer_124',-60000,'approved',true],['future','customer_001',60000,'approved',true],['stale','customer_002',-16*60000,'approved',true],['internal','customer_003',-60000,'approved',false],['published','customer_004',-60000,'published',true],['unpaid','lower',-60000,'approved',true]])batch.set(db.doc('socialGrowthJobs/'+id),{id,businessUid:uid,scheduledFor:new Date(now+offset).toISOString(),status,customerApproval,provider:'facebook'});
 await batch.commit();
 const page=await enrollment.inventory({db,now});
 assert.deepEqual(page.uids,['customer_124','customer_002']);assert.deepEqual(page.jobIdsByBusiness.customer_124,['due']);
 assert.equal(page.inspected,3);
 await require('../functions-social-operations/social_meta_scheduler').run({db,businessUid:'customer_002',customerOnly:true,jobIds:['stale'],now,
  publisher:{inspect:async()=>{throw Error('expired_must_not_publish');}}});
 assert.equal((await db.doc('socialGrowthJobs/stale').get()).data().status,'authority_review_required');
 for(const uid of ['lower','expired','canceled','missing'])assert.equal(await enrollment.authorized({db,uid,now}),false);
 await db.doc('businessSubscriptions/customer_124').update({status:'canceled'});
 assert.equal((await enrollment.inventory({db,now})).uids.length,0);
 assert.equal((await db.collection('socialGrowthJobs').get()).size,6);
 for(const collection of ['socialGrowthApprovals','socialConnections'])assert.equal((await db.collection(collection).get()).size,0);
 const dueBatch=db.batch();
 for(let i=0;i<31;i++){const id='many_'+i,uid='customer_'+String(i).padStart(3,'0');dueBatch.set(db.doc('socialGrowthJobs/'+id),{id,businessUid:uid,scheduledFor:new Date(now-1000).toISOString(),status:'approved',customerApproval:true,provider:'facebook'});}
 await dueBatch.commit();assert.equal((await enrollment.inventory({db,now})).uids.length,31);
});
