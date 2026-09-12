'use strict';
const {test,before,beforeEach,after} = require('node:test');
const assert=require('node:assert/strict');
const requireFunctions=require('node:module').createRequire(require('node:path').join(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=requireFunctions('firebase-admin/app');
const {getFirestore,FieldValue}=requireFunctions('firebase-admin/firestore');
const {getAuth}=requireFunctions('firebase-admin/auth');
const {VERSION,createService,createDraftArchiveService}=require('./production_hygiene_admin.cjs');
let app,db,auth;
before(()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST);
  app=initializeApp({projectId:'demo-production-hygiene'});db=getFirestore(app);auth=getAuth(app);});
beforeEach(async()=>{for(const c of await db.listCollections())await db.recursiveDelete(c);
  const users=await auth.listUsers();for(const user of users.users)await auth.deleteUser(user.uid);
  await auth.createUser({uid:'synthetic',email:'test@example.invalid'});
  await db.doc('users/synthetic').set({role:'scaler',email:'test@example.invalid'});
  await db.doc('applications/pending').set({scalerId:'synthetic',status:'pending'});
  await db.doc('wallets/protected').set({balance:123,uid:'protected'});
});
after(()=>deleteApp(app));
function service(customAuth=auth){return createService({db,auth:customAuth,FieldValue,projectId:'scaled-circle',
  actor:{kind:'google_iam_admin',email:'admin@example.invalid'},
  readProvider:async()=>({mode:'live',accountId:'acct_fixture',complete:true,records:[]}),
  review:{version:VERSION,projectId:'scaled-circle',stripeAccountId:'acct_fixture',operatorEmail:'admin@example.invalid',
    reason:'Emulator-only safety proof',protectedEmails:['owner@example.invalid','admin@example.invalid','worker@example.invalid','billing@example.invalid'],
    protectedUids:['owner','admin','worker','billing'],accounts:[{uid:'synthetic',email:'test@example.invalid',reviewedSynthetic:true,evidence:'Emulator fixture'}],campaigns:[]}});}

test('Consistent Admin Auth/profile/application deletion; audit retained; Wallet unchanged; exactly once',async()=>{
  const svc=service(),beforeWallet=await db.doc('wallets/protected').get();
  const p=await svc.preview();assert.equal(p.plan.holds.length,0);
  assert.equal((await auth.getUser('synthetic')).disabled,false);
  const result=await svc.execute(p.plan.seal);assert.equal(result.accountsDeleted,1);assert.equal(result.documentsDeleted,2);
  await assert.rejects(auth.getUser('synthetic'),e=>e.code==='auth/user-not-found');
  assert.equal((await db.doc('users/synthetic').get()).exists,false);
  assert.equal((await db.doc('applications/pending').get()).exists,false);
  const wallet=await db.doc('wallets/protected').get();assert.deepEqual(wallet.data(),beforeWallet.data());
  assert.ok(wallet.updateTime.isEqual(beforeWallet.updateTime));
  const again=await svc.execute(p.plan.seal);assert.equal(again.alreadyComplete,true);
  assert.equal((await db.collection('adminAuditEvents').get()).size,3);
});
test('Economic relationship added after preview prevents all deletion',async()=>{
  const svc=service(),p=await svc.preview();await db.doc('wallets/synthetic').set({balance:0});
  await assert.rejects(svc.execute(p.plan.seal));
  assert.ok((await db.doc('users/synthetic').get()).exists);
  assert.equal((await auth.getUser('synthetic')).disabled,false);
});
test('Auth-tail failure is recoverable without re-deleting records or fabricating completion',async()=>{
  let fail=true;
  const wrapped=new Proxy(auth,{get(target,key){if(key==='deleteUser')return async uid=>{
    if(fail)throw Error('injected Auth outage');return target.deleteUser(uid);};
    const v=target[key];return typeof v==='function'?v.bind(target):v;}});
  const svc=service(wrapped),p=await svc.preview();await assert.rejects(svc.execute(p.plan.seal),/injected/);
  assert.equal((await auth.getUser('synthetic')).disabled,true);
  assert.equal((await db.doc('users/synthetic').get()).exists,false);
  assert.equal((await db.collection('adminAuditEvents').get()).size,2);
  fail=false;const result=await svc.execute(p.plan.seal);assert.equal(result.accountsDeleted,1);
  await assert.rejects(auth.getUser('synthetic'));assert.equal((await db.collection('adminAuditEvents').get()).size,3);
});
test('Late relationship during identity quiescence fails closed and remains a hold',async()=>{
  const wrapped=new Proxy(auth,{get(target,key){if(key==='revokeRefreshTokens')return async uid=>{
    await target.revokeRefreshTokens(uid);await db.doc('campaignZones/new').set({assignedScalerId:uid,status:'assigned'});};
    const v=target[key];return typeof v==='function'?v.bind(target):v;}});
  const svc=service(wrapped),p=await svc.preview();await assert.rejects(svc.execute(p.plan.seal));
  assert.ok((await db.doc('users/synthetic').get()).exists);
  assert.equal((await auth.getUser('synthetic')).disabled,true);
  assert.equal((await db.collection('adminAuditEvents').get()).size,1);
});
test('Unstarted draft archives exactly once while payment, assets, compensation and Wallet remain intact',async()=>{
  await db.doc('campaigns/draft').set({businessId:'owner',status:'draft',fundingStatus:'unfunded',basePay:15,bonus:3});
  await db.doc('marketingMaterials/m').set({campaignId:'draft',approved:true});
  await db.doc('responseAssets/qr').set({campaignId:'draft',destination:'https://example.invalid/history'});
  const asset=await db.doc('marketingMaterials/m').get(),wallet=await db.doc('wallets/protected').get();
  const qr=await db.doc('responseAssets/qr').get();
  const svc=createDraftArchiveService({db,auth,FieldValue,projectId:'scaled-circle',
    actor:{kind:'google_iam_admin',email:'admin@example.invalid'},
    readProvider:async()=>({mode:'live',accountId:'acct_fixture',complete:true,records:[]}),
    review:{projectId:'scaled-circle',operatorEmail:'admin@example.invalid',stripeAccountId:'acct_fixture',reason:'QA archive',
      archives:[{id:'draft',businessId:'owner',reviewedSynthetic:true,evidence:'Unfunded QA draft'}]}});
  const plan=await svc.preview();assert.equal((await db.doc('campaigns/draft').get()).data().status,'draft');
  const result=await svc.execute(plan.seal);assert.equal(result.campaignsArchived,1);
  const d=(await db.doc('campaigns/draft').get()).data();assert.equal(d.status,'archived');assert.equal(d.basePay,15);assert.equal(d.bonus,3);
  assert.ok((await db.doc('marketingMaterials/m').get()).updateTime.isEqual(asset.updateTime));
  assert.ok((await db.doc('responseAssets/qr').get()).updateTime.isEqual(qr.updateTime));
  assert.ok((await db.doc('wallets/protected').get()).updateTime.isEqual(wallet.updateTime));
  assert.equal((await auth.getUser('synthetic')).disabled,false);
  assert.equal((await svc.execute(plan.seal)).alreadyComplete,true);
  assert.equal((await db.collection('adminAuditEvents').get()).size,1);
});
