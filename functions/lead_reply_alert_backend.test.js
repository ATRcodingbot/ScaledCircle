'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-owner-email-alert'},'owner-alert'),db=app.firestore();
const {createAlerts,quietUntil,validJob}=require('./lead_reply_alert');let clock,alerts;
const policy=db.doc('agentPermissions/owner_lead_generator/authorizations/business_email');
beforeEach(async()=>{for(const c of ['agentPermissions','businessMailboxes','outboundEmailJobs'])for(const r of await db.collection(c).listDocuments())await db.recursiveDelete(r);
 clock=Date.parse('2026-09-21T01:00:00Z');alerts=createAlerts({db,now:()=>clock,getOwner:async()=>({email:'owner@example.test',emailVerified:true,disabled:false})});
 await policy.set({businessId:'owner',status:'active',approvedAt:clock-1000,policy:{expiresAt:clock+7*86400000,timeZone:'America/New_York',notifications:{email:true,push:true,quietStartMinute:1200,quietEndMinute:480}}});
 await db.doc('businessMailboxes/owner').set({status:'connected',generation:'g1',permissions:{read:true}});
 await db.doc('businessMailboxes/owner/operations/op').set({businessId:'owner',state:'sent',certification:false});
 await db.doc('businessMailboxes/owner/replies/reply').set({businessId:'owner',operationId:'op',classification:'substantive',receivedAt:clock-1,body:'PRIVATE NOT IN QUEUE'});
});
after(()=>app.delete());
test('one owner email per burst; quiet hours defer; queue carries no mailbox body; permission rechecked',async()=>{
 const results=await Promise.all([alerts.enqueue('owner','op'),alerts.enqueue('owner','op')]);assert.equal(results.filter(r=>r.queued).length,1);
 assert.equal((await alerts.drain('owner')).queued,0);clock=Date.parse('2026-09-21T12:01:00Z');
 assert.equal((await alerts.drain('owner')).queued,1);assert.equal((await alerts.drain('owner')).queued,0);
 const docs=await db.collection('outboundEmailJobs').get();assert.equal(docs.size,1);const job=docs.docs[0].data();
 assert.ok(validJob(job));assert.ok(!JSON.stringify(job).includes('PRIVATE'));assert.ok(await alerts.permitted(job));
 assert.equal(await alerts.permitted({...job,to:'other@example.test'}),false);
 await policy.update({'policy.notifications.email':false});assert.equal(await alerts.permitted(job),false);
});
test('automated and historical mail do not create owner alerts; quiet-hours changes defer an unattempted job safely',async()=>{
 await db.doc('businessMailboxes/owner/replies/reply').update({classification:'automated_reply'});assert.equal((await alerts.enqueue('owner','op')).queued,false);
 await db.doc('businessMailboxes/owner/replies/reply').update({classification:'substantive',receivedAt:clock-2000});assert.equal((await alerts.enqueue('owner','op')).queued,false);
 clock=Date.parse('2026-09-21T12:01:00Z');await db.doc('businessMailboxes/owner/replies/reply').update({receivedAt:clock-1});await alerts.enqueue('owner','op');clock+=300001;await alerts.drain('owner');
 const d=(await db.collection('outboundEmailJobs').get()).docs[0];
 await policy.update({'policy.notifications.quietStartMinute':480,'policy.notifications.quietEndMinute':540});
 assert.equal(await alerts.permitted(d.data()),false);assert.equal(await alerts.permitted(d.data(),{ignoreQuiet:true}),true);
 await alerts.defer(d.data(),d.ref);assert.equal((await d.ref.get()).data().status,'held_quiet');
 clock=Date.parse('2026-09-21T13:01:00Z');await alerts.drain('owner');assert.equal((await d.ref.get()).data().status,'retry_requested');
 assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
});
test('quiet hours use the explicit zone across overnight intervals; no geographic inference',()=>{
 const at=Date.parse('2026-09-21T01:00:00Z');assert.equal(quietUntil({quietStartMinute:1200,quietEndMinute:480},'America/New_York',at),Date.parse('2026-09-21T12:00:00Z'));
 assert.throws(()=>quietUntil({quietStartMinute:1200,quietEndMinute:480},'invalid',at));
});

test('the real transactional sender delivers one minimal owner alert and rejects revoked preferences',async()=>{
 clock=Date.parse('2026-09-21T15:00:00Z');await db.doc('businessMailboxes/owner/replies/reply').update({receivedAt:clock-1});
 await alerts.enqueue('owner','op');clock+=300001;await alerts.drain('owner');
 const reference=(await db.collection('outboundEmailJobs').get()).docs[0].ref;let sent=0;
 const invoke=()=>require('./transactional_email').processDeliveryJob({db,reference,jobId:reference.id,FieldValue:admin.firestore.FieldValue,smtpPassword:'fixture',now:()=>clock,getOwner:async()=>({email:'owner@example.test',emailVerified:true}),createTransport:()=>({sendMail:async message=>{sent++;assert.equal(message.to,'owner@example.test');assert.ok(!message.text.includes('PRIVATE'));return {messageId:'fixture-receipt'};}})});
 assert.equal((await invoke()).status,'sent');await invoke();assert.equal(sent,1);
 assert.equal((await reference.get()).data().providerResult,'accepted');
});

test('controlled operational alert remains eligible; unclaimed packaging failure recovers same job once',async()=>{
 clock=Date.parse('2026-09-21T15:00:00Z');
 await db.doc('businessMailboxes/owner/replies/reply').update({receivedAt:clock-1,controlledTest:true});
 await db.doc('businessMailboxes/owner/operations/op').update({controlledTest:true});
 await alerts.enqueue('owner','op');clock+=300001;await alerts.drain('owner');
 const d=(await db.collection('outboundEmailJobs').get()).docs[0];clock+=600001;
 await Promise.all([alerts.drain('owner'),alerts.drain('owner')]);
 assert.equal((await d.ref.get()).data().status,'retry_requested');assert.equal((await db.collection('outboundEmailJobs').get()).size,1);
 assert.equal((await db.collection('businessMailboxes/owner/ownerAlertReceipts').get()).size,1);
 await d.ref.update({status:'queued',attempts:1});await alerts.drain('owner');assert.equal((await d.ref.get()).data().status,'queued');
});

test('new intake uses inquiry wording; later replies retain reply classification and never include content',async()=>{
 await db.doc('businessMailboxes/owner/operations/op').update({state:'received',source:'authorized_inbox_inquiry'});
 await alerts.enqueue('owner','op');clock=Date.parse('2026-09-21T12:01:00Z');await alerts.drain('owner');
 const job=(await db.collection('outboundEmailJobs').get()).docs[0].data();assert.equal(job.subject,'New Business inquiry received');assert(!job.text.includes('PRIVATE'));
 await db.doc('businessMailboxes/owner/replies/reply2').set({businessId:'owner',operationId:'op',classification:'substantive',receivedAt:clock,body:'PRIVATE'});
 await alerts.enqueue('owner','op');clock+=300001;await alerts.drain('owner');
 assert.deepEqual((await db.collection('outboundEmailJobs').get()).docs.map(d=>d.data().subject).sort(),['A customer replied','New Business inquiry received'].sort());
});
