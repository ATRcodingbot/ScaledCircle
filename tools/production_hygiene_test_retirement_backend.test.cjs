'use strict';
const {test,before,after,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').join(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore,FieldValue}=req('firebase-admin/firestore');
const {fixture}=require('./production_hygiene_test_retirement.test.cjs');
const {createTestRetirementService,TEST_RETIREMENT_PATHS:P,TEST_RETIREMENT_ID:I,TEST_RETIREMENT_AUDIT:A}=require('./production_hygiene_admin.cjs');
let app,db,f;
before(()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST);app=initializeApp({projectId:'demo-scaledcircle'});db=getFirestore(app);});
beforeEach(async()=>{for(const c of await db.listCollections())await db.recursiveDelete(c);f=fixture();
 for(const row of f.state.rows)await db.doc(row.path).set(row.data);});
after(()=>deleteApp(app));
const service=()=>createTestRetirementService({db,FieldValue,projectId:'scaled-circle',review:f.review,actor:f.actor});
test('Atomic exact retirement, immutable original history, unchanged financials and idempotent replay',async()=>{
 const preserved=await Promise.all([P.wallet,P.reserve,P.grant,P.subscription,P.payout,P.route,P.application,P.owner,P.scaler].map(p=>db.doc(p).get()));
 const svc=service(),p=await svc.preview(),results=await Promise.all([svc.execute(p.seal),svc.execute(p.seal)]);
 assert.equal(results.filter(r=>r.alreadyComplete).length,1);
 assert.equal((await db.doc(P.campaign).get()).data().status,'archived');
 assert.equal((await db.doc(P.zone).get()).data().status,'test_retired');
 assert.equal((await db.doc(P.completion).get()).data().status,'test_retired');
 for(const before of preserved){const after=await before.ref.get();assert.deepEqual(after.data(),before.data());assert.ok(after.updateTime.isEqual(before.updateTime));}
 const audit=await db.doc(A).get();assert.equal(audit.data().plan.before.find(r=>r.path===P.zone).data.status,'submitted');
 assert.equal((await db.collection('adminAuditEvents').get()).size,1);
 await assert.rejects(svc.execute('a'.repeat(64)),/Different retirement/);
});
test('Concurrent new obligation after preview holds all retirement',async()=>{
 const svc=service(),p=await svc.preview();await db.doc('scalerEarnings/new').set({campaignId:I.campaign,amountCents:2500});
 await assert.rejects(svc.execute(p.seal));assert.equal((await db.doc(P.campaign).get()).data().status,'accepted');
 assert.equal((await db.doc(A).get()).exists,false);
});
test('Zone-only financial binding is detected and held',async()=>{
 await db.doc('assignmentCompensations/new').set({zoneId:I.zone,baseAmountCents:2500});await assert.rejects(service().preview());
});
test('Changed route/source and ongoing work hold without touching queues',async()=>{
 const svc=service(),p=await svc.preview();await db.doc(P.route).update({tracking:true});
 await assert.rejects(svc.execute(p.seal));assert.equal((await db.doc(P.zone).get()).data().status,'submitted');
});
