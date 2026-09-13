'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),{createService}=require('./account_closure');
const app=admin.initializeApp({projectId:'demo-referral-authority'},'closure'),db=app.firestore();
const {FieldValue}=admin.firestore;
let accounts,calls,service;
const uid='closing_worker', now=()=>Date.now(), confirmation={confirmation:'DELETE',authTime:Math.floor(Date.now()/1000)};
beforeEach(async()=>{
  for(const c of ['users','accountClosures','wallets','scalerCashoutBalances','stripeConnectedAccounts','businessWorkspaces',
    'businessSubscriptions','scalerAffiliateProfiles','activeTrackingSessions','campaignZones','scalerTransfers',
    'financialOperations','referralLiabilities','businessWorkspaceAccess','notifications','discoveryPreferences','marketProfiles',
    'walletTransactions','assignmentCompensations','referralRewards'])for(const ref of await db.collection(c).listDocuments())await db.recursiveDelete(ref);
  accounts=new Map([[uid,{uid,emailVerified:true,disabled:false}]]);calls=[];
  const auth={getUser:async id=>{if(!accounts.has(id))throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return accounts.get(id);},
    updateUser:async(id,data)=>{calls.push('disable');Object.assign(accounts.get(id),data);},
    revokeRefreshTokens:async()=>{calls.push('revoke');},deleteUser:async id=>{calls.push('delete');accounts.delete(id);}};
  service=createService({db,auth,FieldValue,project:process.env.CLOSURE_PRODUCTION_RULES?'scaled-circle':'scaledcircle-staging',appEnv:process.env.CLOSURE_PRODUCTION_RULES?'production':'staging',now});
  await db.doc('users/'+uid).set({role:'scaler',active:true,email:'personal@example.com',pushToken:'personal-token'});
});
after(async()=>{await db.terminate();await app.delete();});
test('recent auth and explicit confirmation required, client cannot override obligations',async()=>{
  await assert.rejects(service.close(uid,{...confirmation,authTime:1}),/Sign in again/);
  await assert.rejects(service.close(uid,{...confirmation,confirmation:'yes'}),/Type DELETE/);
  await db.doc('wallets/'+uid).set({availableBalance:5});
  assert.equal((await service.preflight(uid)).canDelete,false);
  await assert.rejects(service.close(uid,confirmation),/Wallet/);
  assert.deepEqual(calls,[]);assert.equal((await db.doc('accountClosures/'+uid).get()).exists,false);
});
test('final Business owner cannot orphan workspace; account remains usable',async()=>{
  await db.doc('users/'+uid).update({role:'business'});
  assert.match((await service.preflight(uid)).blockers.join(),/ownership/);
  await assert.rejects(service.close(uid,confirmation),/ownership/);assert.deepEqual(calls,[]);
});
test('work, pending payouts, referral liability, and provider binding each block closure',async()=>{
  for(const [path,body]of [['campaignZones/zone',{assignedScalerId:uid,status:'submitted'}],
    ['scalerTransfers/transfer',{scalerId:uid,status:'transfer_pending'}],
    ['referralLiabilities/reward',{referredId:uid,currentCents:5,reservedCents:0}],
    ['stripeConnectedAccounts/'+uid,{stripeAccountId:'acct_test'}]]){
    await db.doc(path).set(body);assert.equal((await service.preflight(uid)).canDelete,false,path);
    await assert.rejects(service.close(uid,confirmation));await db.doc(path).delete();
  }
  assert.deepEqual(calls,[]);
});
test('deletion removes personal data and Auth while retaining original and reversal financial history',async()=>{
  const history={'walletTransactions/original':{scalerId:uid,amountCents:500},'walletTransactions/reversal':{scalerId:uid,amountCents:-500},
    'assignmentCompensations/contract':{scalerId:uid,baseAmountCents:500},'referralRewards/source':{referredScalerUid:uid,amountCents:5},
    'referralLiabilities/reward':{referredId:uid,grossCents:5,currentCents:0,reservedCents:0}};
  for(const[p,d]of Object.entries(history))await db.doc(p).set(d);
  await db.doc('wallets/'+uid).set({availableBalance:0,pendingBalance:0});
  await db.doc('discoveryPreferences/'+uid).set({areas:['private']});
  await db.doc('marketProfiles/'+uid).set({stateId:'MD'});
  assert.equal((await service.preflight(uid)).canDelete,true);
  await service.close(uid,confirmation);assert.deepEqual(calls,['disable','revoke','delete']);assert.equal(accounts.has(uid),false);
  const tombstone=(await db.doc('users/'+uid).get()).data();assert.equal(tombstone.role,'deleted');assert.equal(tombstone.email,undefined);assert.equal(tombstone.pushToken,undefined);
  for(const[p,d]of Object.entries(history))assert.deepEqual((await db.doc(p).get()).data(),d);
  assert.equal((await db.doc('marketProfiles/'+uid).get()).exists,false);
  assert.equal((await db.doc('discoveryPreferences/'+uid).get()).exists,false);
  await service.finish(uid);assert.deepEqual(calls,['disable','revoke','delete']);
});
test('normal member deletion revokes its seat without changing owner or historical attribution',async()=>{
  await db.doc('users/'+uid).update({role:'business',signupPurpose:'team_invitation',activeBusinessId:'business'});
  await db.doc('businessWorkspaces/business').set({ownerId:'business',revision:1});
  await db.doc('businessWorkspaces/business/members/'+uid).set({uid,businessId:'business',status:'active',seatIndex:1});
  await db.doc('businessWorkspaceAccess/'+uid+'/workspaces/business').set({businessId:'business',status:'active'});
  await db.doc('businessWorkspaces/business/activity/original').set({actorUid:uid,action:'created_schedule_item'});
  await service.close(uid,confirmation);
  assert.equal((await db.doc('businessWorkspaces/business').get()).data().ownerId,'business');
  assert.equal((await db.doc('businessWorkspaces/business/members/'+uid).get()).data().status,'removed');
  assert.equal((await db.doc('businessWorkspaces/business/activity/original').get()).data().actorUid,uid);
});
test('mismatched environment fails before touching Auth; durable closure can resume after provider failure',async()=>{
  await assert.rejects(createService({db,auth:{},FieldValue,project:'scaled-circle',appEnv:'staging'}).preflight(uid),/not enabled/);
  let failOnce=true;
  const recovering=createService({db,FieldValue,project:'scaledcircle-staging',appEnv:'staging',auth:{getUser:async()=>accounts.get(uid),
    updateUser:async()=>{},revokeRefreshTokens:async()=>{},deleteUser:async()=>{if(failOnce){failOnce=false;throw Error('transient');}accounts.delete(uid);}}});
  await assert.rejects(recovering.close(uid,confirmation),/transient/);
  assert.equal((await db.doc('accountClosures/'+uid).get()).data().status,'closing');
  await recovering.finish(uid);assert.equal(accounts.has(uid),false);
  assert.equal((await db.doc('accountClosures/'+uid).get()).data().status,'completed');
});

test('unresolved earning protects zero-wallet user and retains the earning',async()=>{await db.doc(`wallets/${uid}/transactions/pending`).set({type:'scaler_earnings',status:'pending',amount:5});await assert.rejects(service.close(uid,confirmation),/Wallet/);assert.equal((await db.doc(`wallets/${uid}/transactions/pending`).get()).exists,true);});

test('authoritatively transferred owner can close without removing workspace or subscription history',async()=>{await db.doc('users/'+uid).update({role:'business'});await db.doc('businessWorkspaces/'+uid).set({ownerId:'new_owner',businessName:'Retained'});await db.doc('businessSubscriptions/'+uid).set({plan:'starter'});await service.close(uid,confirmation);assert.equal((await db.doc('businessWorkspaces/'+uid).get()).data().ownerId,'new_owner');assert.equal((await db.doc('businessSubscriptions/'+uid).get()).exists,true);});
