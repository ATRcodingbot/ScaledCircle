'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createService}=require('../functions-mobile-notifications/service');
const {hash}=require('../functions-mobile-notifications/policy');
const enabled=!!process.env.FIRESTORE_EMULATOR_HOST;
const app=enabled?initializeApp({projectId:'demo-mobile-notifications'},'push-tests'):null,db=app?getFirestore(app):null;
let serial=0;
async function fixture(){const uid='push_user_'+(++serial),other='push_other_'+serial,secret=hash(uid),token='fcm_token_'+hash('token'+uid),clock={value:Date.now()},sent=[],identity={};
 await db.doc('users/'+uid).set({role:'scaler',active:true});await db.doc('users/'+other).set({role:'scaler',active:true});
 const auth={getUser:async u=>({uid:u,email:u+'@example.com',emailVerified:true,disabled:identity[u]===false})};
 const svc=createService({db,auth,FieldValue,Timestamp,messaging:{send:async m=>{sent.push(m);if(clock.error){const e=new Error();e.code=clock.error;throw e;}return 'provider_'+sent.length;}},project:'demo-mobile-notifications',environment:'local',now:()=>clock.value});
 const input={installationSecret:secret,token,platform:'android',environment:'local'};
 await svc.configure(uid,{enabled:true,growthDigest:true,categories:{}});await svc.register(uid,input);
 const notice=async(type='job_assignment',extra={})=>{const n=db.doc('notifications/'+uid+'_'+Math.random().toString(16).slice(2));await n.set({userId:uid,type,createdAt:Timestamp.fromMillis(clock.value),read:false,...extra});await svc.enqueue(n.id);return n;};
 return {uid,other,secret,token,clock,sent,identity,svc,input,notice};}
const t=(name,fn)=>test(name,{skip:!enabled},fn);
t('registration is bounded to authenticated user, environment and unique installation',async()=>{const f=await fixture();await assert.rejects(f.svc.register(f.uid,{...f.input,environment:'production'}),{code:'invalid-argument'});await assert.rejects(f.svc.register(f.other,{...f.input,installationSecret:hash('other')}),{code:'failed-precondition'});await f.svc.register(f.other,f.input);assert.equal((await db.doc('mobilePushDevices/'+hash(f.secret)).get()).data().uid,f.other);await f.svc.unregister({installationSecret:f.secret});assert.equal((await db.doc('mobilePushDevices/'+hash(f.secret)).get()).exists,false);});
t('same notification and Function retries produce one send per device',async()=>{const f=await fixture(),n=await f.notice();await Promise.all([f.svc.enqueue(n.id),f.svc.enqueue(n.id)]);await f.svc.sendGroup([await n.get()]);await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,1);assert.equal((await n.get()).data().push.status,'provider_accepted');});
t('concurrent workers and overlapping digest sets cannot repeat notification delivery',async()=>{const f=await fixture(),a=await f.notice('agent_daily_brief'),b=await f.notice('agent_weekly_report');const docs=[await a.get(),await b.get()];await Promise.all([f.svc.sendGroup(docs),f.svc.sendGroup(docs)]);assert.equal(f.sent.length,1);await f.svc.sendGroup([await b.get()]);assert.equal(f.sent.length,1);assert.equal(f.sent[0].notification.body.startsWith('2 updates'),true);});
t('ambiguous provider timeout records uncertainty, never blind retry',async()=>{const f=await fixture(),n=await f.notice();f.clock.error='network-timeout';await f.svc.sendGroup([await n.get()]);f.clock.error=null;await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,1);assert.equal((await n.get()).data().push.status,'confirmation_unknown');});
t('safe retry removes only stale token generation; expired device not pushed',async()=>{const f=await fixture(),n=await f.notice();f.clock.value+=31*86400000;await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,0);});
t('provider failure never deletes or marks the in-app event read',async()=>{const f=await fixture(),n=await f.notice();f.clock.error='messaging/server-unavailable';await f.svc.sendGroup([await n.get()]);assert.equal((await n.get()).data().push.status,'retry_pending');assert.equal((await n.get()).data().read,false);f.clock.error=null;await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,2);assert.equal((await n.get()).data().push.status,'provider_accepted');});
t('invalid token cleaned without removing notification or another device',async()=>{const f=await fixture(),n=await f.notice();f.clock.error='messaging/registration-token-not-registered';await f.svc.sendGroup([await n.get()]);assert.equal((await db.doc('mobilePushDevices/'+hash(f.secret)).get()).exists,false);assert.equal((await n.get()).exists,true);});
t('disabled and wrong recipients never resolve even when notification id is known',async()=>{const f=await fixture(),n=await f.notice();assert.deepEqual(await f.svc.open(f.other,n.id),{available:false});f.identity[f.uid]=false;assert.deepEqual(await f.svc.open(f.uid,n.id),{available:false});await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,0);});
t('user preferences suppress push, retain in-app event; required notice has no category toggle',async()=>{const f=await fixture(),n=await f.notice();await f.svc.configure(f.uid,{enabled:true,growthDigest:true,categories:{marketplace:false}});await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,0);const required=await f.notice('security_notice');await f.svc.sendGroup([await required.get()]);assert.equal(f.sent.length,1);});
t('harmless physical check is one identity within five minutes, contains no financial effect',async()=>{const f=await fixture(),a=await f.svc.check(f.uid,f.input),b=await f.svc.check(f.uid,f.input);assert.equal(a.notificationId,b.notificationId);const n=(await db.doc('notifications/'+a.notificationId).get()).data();assert.equal(n.type,'mobile_push_check');assert.equal(n.source.actorUid,f.uid);assert.equal(n.amount,undefined);});
t('revoked or limited members cannot receive billing, unrelated customer or Growth push',async()=>{const f=await fixture(),business='business_'+f.uid;await db.doc('users/'+business).set({role:'business',active:true});await db.doc('businessSubscriptions/'+business).set({status:'active',plan:'growth',planId:'growth',expiresAt:Timestamp.fromMillis(f.clock.value+86400000)});await db.doc('businessWorkspaces/'+business).set({ownerId:business});await db.doc(`businessWorkspaces/${business}/members/${f.uid}`).set({businessId:business,uid:f.uid,status:'active',seatIndex:1,permissions:['jobsAssigned']});
 for(const type of ['billing_payment_failed','business_email_reply','agent_daily_brief']){const n=await f.notice(type,{metadata:{businessId:business}});assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),false);}
 const item=db.doc(`businessOperations/${business}/items/task1`);await item.set({type:'job',assignedPeople:['user:'+f.uid]});const n=await f.notice('business_schedule_update',{metadata:{businessId:business,itemId:'task1'}});assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),true);await item.update({assignedPeople:[]});assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),false);await db.doc(`businessWorkspaces/${business}/members/${f.uid}`).update({status:'removed'});assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),false);
});

t('reassignment and closed account invalidate an existing Job Room push',async()=>{
 const f=await fixture(),b='owner_'+f.uid,z='zone_'+f.uid,c='campaign_'+f.uid;
 await db.doc('campaigns/'+c).set({businessId:b});await db.doc('campaignZones/'+z).set({businessId:b,campaignId:c,assignedScalerId:f.uid,status:'assigned'});
 const n=await f.notice('job_assignment',{zoneId:z,campaignId:c});
 assert.equal((await f.svc.open(f.uid,n.id)).available,true);
 await db.doc('campaignZones/'+z).update({assignedScalerId:f.other});assert.equal((await f.svc.open(f.uid,n.id)).available,false);
 await db.doc('campaignZones/'+z).update({assignedScalerId:f.uid});await db.doc('users/'+f.uid).update({accountStatus:'closing'});
 assert.equal((await f.svc.open(f.uid,n.id)).available,false);await f.svc.sendGroup([await n.get()]);assert.equal(f.sent.length,0);
});
t('reply event replay creates one in-app identity and notification starts unread',async()=>{
 const f=await fixture(),record=require('../functions-mobile-notifications/signals').record;
 const input={db,FieldValue,kind:'reply',key:'thread/'+f.uid,after:{businessId:f.uid,operationId:'sent1',providerMessageId:'provider1'}};
 await Promise.all([record(input),record(input),record(input)]);
 const notices=await db.collection('notifications').where('userId','==',f.uid).get();assert.equal(notices.size,1);assert.equal(notices.docs[0].data().read,false);
 assert.equal(notices.docs[0].data().lifecycleStage,undefined);
});

test.after(async()=>{if(app)await deleteApp(app);});

t('five distinct Social posts create one window record; replays and tenants stay isolated',async()=>{
 const f=await fixture(),record=require('../functions-mobile-notifications/signals').record;
 const args=i=>({db,FieldValue,kind:'social',key:'assessment_'+i,now:()=>f.clock.value,
 after:{businessUid:f.uid,contentItemId:'post_'+i,provider:'facebook',readyToPublish:true,contentVersion:1}});
 await Promise.all([0,1,2,3,4].map(i=>db.doc('socialContentItems/post_'+i).set({businessUid:f.uid,currentVersion:1})));
 await Promise.all([0,1,2,3,4,0,1].map(i=>record(args(i))));
 const docs=await db.collection('notifications').where('userId','==',f.uid).get();assert.equal(docs.size,1);
 const n=docs.docs[0];assert.equal(n.data().aggregateCount,5);assert.equal(n.data().deepLink.destination,'social_review');
 await n.ref.update({read:true});await record(args(4));assert.equal((await n.ref.get()).data().read,true);
 await db.doc('socialContentItems/post_5').set({businessUid:f.uid,currentVersion:1});await record(args(5));
 assert.equal((await n.ref.get()).data().read,false);assert.equal((await n.ref.get()).data().aggregateCount,6);
 await f.svc.enqueue(n.id);assert.ok((await n.ref.get()).data().push.nextAttemptMs>f.clock.value);
 const other=args(0);other.after.businessUid=f.other;await record(other);
 assert.equal((await db.collection('notifications').where('userId','==',f.other).get()).size,1);
 await f.svc.sendGroup([await n.ref.get()]);await f.svc.sendGroup([await n.ref.get()]);assert.equal(f.sent.length,1);
});

t('scheduler attention is exactly once and cannot alert for an unrelated or published job',async()=>{
 const f=await fixture(),record=require('../functions-social-operations/social_attention_notifications').record;
 await db.doc('socialGrowthJobs/'+f.uid).set({businessUid:f.uid,customerApproval:true,status:'scheduled'});
 const args={db,FieldValue,businessUid:f.uid,results:[{jobId:f.uid,status:'reconciliation_required'}]};
 await Promise.all([record(args),record(args)]);
 assert.equal((await db.collection('notifications').where('userId','==',f.uid).get()).size,1);
 await db.doc('socialGrowthJobs/'+f.other).set({businessUid:f.other,customerApproval:true,status:'published'});
 await record({...args,results:[{jobId:f.other,status:'needs_attention'}]});
 assert.equal((await db.collection('notifications').where('userId','==',f.uid).get()).size,1);
 assert.equal((await db.doc('socialGrowthJobs/'+f.uid).get()).data().status,'scheduled');
});

t('historical publication remains openable without restoring publication push',async()=>{
 const f=await fixture(),n=await f.notice('social_post_published',{businessId:f.uid,deepLink:{destination:'social_published',jobId:'job'}});
 assert.equal((await n.get()).data().push.status,'in_app_only');
 assert.equal((await f.svc.open(f.uid,n.id)).available,true);
 assert.equal((await f.svc.open(f.other,n.id)).available,false);
});

t('review push is suppressed when owner already approved the queued post',async()=>{
 const f=await fixture(),record=require('../functions-mobile-notifications/signals').record;
 const itemId='approved_'+f.uid;
 await db.doc('socialContentItems/'+itemId).set({businessUid:f.uid,currentVersion:1,platformApprovals:{facebook:{version:1,status:'scheduled'}}});
 await record({db,FieldValue,kind:'social',key:itemId,after:{businessUid:f.uid,contentItemId:itemId,provider:'facebook',readyToPublish:true,versionId:itemId+'_v1'}});
 const notices=await db.collection('notifications').where('userId','==',f.uid).get();
 await f.svc.sendGroup(notices.docs);assert.equal(f.sent.length,0);
 assert.equal((await notices.docs[0].ref.get()).data().push.status,'suppressed');
});

t('Email attention uses communications access, not an unrelated intelligence permission',async()=>{
 const f=await fixture(),business='email_business_'+f.uid;
 await db.doc('users/'+business).set({role:'business',active:true});
 await db.doc('businessSubscriptions/'+business).set({status:'active',plan:'managed_growth',expiresAt:Timestamp.fromMillis(f.clock.value+86400000)});
 await db.doc('businessWorkspaces/'+business).set({ownerId:business});
 const member=db.doc(`businessWorkspaces/${business}/members/${f.uid}`);
 await member.set({businessId:business,uid:f.uid,status:'active',seatIndex:1,permissions:['communicationsRead']});
 const n=await f.notice('email_campaign_attention',{businessId:business});
 assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),true);
 await member.update({permissions:['intelligence']});assert.equal(await f.svc.authorized(f.uid,(await n.get()).data()),false);
});
