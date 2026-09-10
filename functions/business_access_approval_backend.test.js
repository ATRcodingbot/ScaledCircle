'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const admin=require('firebase-admin');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,updateDoc,setDoc}=require('firebase/firestore');
const approval=require('./business_access_approval'),onboarding=require('./business_onboarding');
const {createLegalConsentService}=require('./legal_consent');
const {createWorkspaceService}=require('./business_workspace');
const entitlement=require('./subscription_entitlements');
let app,db,auth,service,setup,legal,workspace,rules,actor,seq=0;
const input={businessName:'Test Business',contactName:'Owner',businessDescription:'Repairs',servicesOffered:['Repair'],serviceAreas:['Test County']};
before(async()=>{
  for(const k of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[k]||'',/^(127\.0\.0\.1|localhost):\d+$/);
  app=admin.initializeApp({projectId:'demo-business-access'},'business-access');db=app.firestore();auth=app.auth();
  const deps={db,auth,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp};
  service=approval.createService({...deps,environment:'test'});legal=createLegalConsentService(deps);workspace=createWorkspaceService(deps);
  setup=onboarding.createService({...deps,resolvePlace:async()=>({results:[{id:'relation-1',fullAddress:'Test County, Maryland, United States',latitude:39,longitude:-77,geographyType:'county',resolutionSource:'openstreetmap_nominatim',geometry:[{latitude:39,longitude:-77},{latitude:39.1,longitude:-77},{latitude:39.1,longitude:-76.9},{latitude:39,longitude:-77}]}]})});
  await auth.createUser({uid:'approval-admin',email:'admin@example.test',emailVerified:true});await db.doc('users/approval-admin').set({role:'admin'});
  actor={uid:'approval-admin',role:'admin',isAdmin:true,emailVerified:true};
  rules=await initializeTestEnvironment({projectId:'demo-business-access',firestore:{rules:fs.readFileSync('../firestore.production.rules','utf8')}});
});
after(async()=>{await rules?.cleanup();await db?.terminate();await app?.delete();});
async function fixture(){
  const uid='approve_business_'+(++seq);await auth.createUser({uid,email:uid+'@example.test',emailVerified:true});
  await db.doc('users/'+uid).set({role:'business',active:false,betaAccess:'pending',preserved:'unchanged'});
  const p=(await setup.search({uid,query:'Test County',kind:'base'})).results[0];
  await setup.save({uid,input,geography:{baseSelectionId:p.selectionId,serviceAreaSelectionIds:[p.selectionId]}});
  await legal.accept({uid,role:'business',data:{agreementTypes:['terms','privacy'],source:'authenticated_legal'}});return uid;
}
const approve=uid=>service.approve({actor,input:{uid}});
const snapshot=async()=>{
  const paths=['users','businessGrowthProfiles','businessOnboarding','legalConsents','businessSubscriptions','wallets','stripeCustomers','businessWorkspaces','businessBillingOperations','campaigns','payments','earnings'];
  const result={};for(const col of paths)result[col]=(await db.collection(col).get()).docs.map(d=>({id:d.id,data:d.data()}));return result;
};
test('valid approval is atomic/idempotent with exactly one audit and notification; no financial or profile mutation',async()=>{
  const uid=await fixture();await db.doc('businessSubscriptions/preserved-comped-business').set({plan:'managed_growth',comped:true,source:'internal_qa',status:'active'});
  const before=await snapshot(),preview=await service.load({actor,input:{email:uid+'@example.test'}});
  assert.equal(preview.eligible,true);assert.equal(preview.state,'Pending');
  const results=await Promise.all([approve(uid),approve(uid)]);assert.equal(results.filter(r=>r.changed).length,1);
  const after=await snapshot(),u=after.users.find(d=>d.id===uid).data;
  assert.equal(u.active,true);assert.equal(u.betaAccess,'approved');assert.ok(u.updatedAt);
  const old=before.users.find(d=>d.id===uid).data;delete u.updatedAt;u.active=old.active;u.betaAccess=old.betaAccess;assert.deepEqual(after,before);
  assert.equal((await approve(uid)).changed,false);
  const audits=await db.collection('adminAuditEvents').where('targetUid','==',uid).get();assert.equal(audits.size,1);
  assert.equal(audits.docs[0].data().performedBy,actor.uid);assert.equal(audits.docs[0].data().schemaVersion,approval.VERSION);
  assert.deepEqual(audits.docs[0].data().previousState,{active:false,betaAccess:'pending'});
  assert.deepEqual(audits.docs[0].data().resultingState,{active:true,betaAccess:'approved'});
  const notifications=await db.collection('notifications').where('userId','==',uid).get();assert.equal(notifications.size,1);
  assert.match(notifications.docs[0].data().message,/account has been approved/);assert.equal(notifications.docs[0].data().emailRequested,false);
  assert.equal((await db.collection('outboundEmailJobs').get()).size,0);
});
test('approval allows unpaid owner Billing/Team/profile authority but never paid campaigns/intelligence or add-ons',async()=>{
  const uid=await fixture();await approve(uid);
  for(const permission of ['billing','teamManagement','analytics']){const a=await workspace.authority({uid,businessId:uid,permission});assert.equal(a.capacity,1);assert.deepEqual(a.entitlement,{});}
  assert.equal((await setup.load({uid})).approved,true);
  for(const permission of ['intelligence','campaigns','authorizeCampaigns'])await assert.rejects(workspace.authority({uid,businessId:uid,permission}),{code:'failed-precondition'});
  const e=(await db.doc('businessSubscriptions/'+uid).get()).data();
  assert.equal(entitlement.hasActivePaidBusinessEntitlement(e),false);assert.equal(entitlement.hasActiveManagedGrowthEntitlement(e),false);
  for(const p of ['business_assistant','lead_generation_research'])assert.equal(entitlement.hasActiveProductEntitlement(e,p),false);
  const other=await fixture();await assert.rejects(workspace.authority({uid:other,businessId:uid,permission:'billing'}),{code:'permission-denied'});
});
for(const [label,change] of [
  ['Scaler',async uid=>db.doc('users/'+uid).update({role:'scaler'})],
  ['unverified owner',async uid=>auth.updateUser(uid,{emailVerified:false})],
  ['disabled Auth',async uid=>auth.updateUser(uid,{disabled:true})],
  ['disabled profile',async uid=>db.doc('users/'+uid).update({disabled:true})],
  ['rejected',async uid=>db.doc('users/'+uid).update({betaAccess:'rejected'})],
  ['suspended',async uid=>db.doc('users/'+uid).update({betaAccess:'suspended'})],
  ['inconsistent state',async uid=>db.doc('users/'+uid).update({active:true})],
  ['missing profile',async uid=>db.doc('businessGrowthProfiles/'+uid).delete()],
  ['incomplete profile',async uid=>db.doc('businessGrowthProfiles/'+uid).update({servicesOffered:[]})],
  ['missing onboarding',async uid=>db.doc('businessOnboarding/'+uid).delete()],
  ['unconfirmed geography',async uid=>db.doc('businessOnboarding/'+uid).update({'geography.confirmedAt':admin.firestore.FieldValue.delete()})],
  ['forged geography',async uid=>db.doc('businessOnboarding/'+uid).update({'geography.base.displayLabel':'Forged'})],
  ['cross-owned onboarding',async uid=>db.doc('businessOnboarding/'+uid).update({ownerUid:'another'})],
  ['cross-owned workspace',async uid=>db.doc('businessWorkspaces/'+uid).set({ownerId:'another'})],
  ['invited team member',async uid=>db.doc('users/'+uid).update({signupPurpose:'team_invitation'})],
  ['missing Terms',async uid=>db.doc(`legalConsents/${uid}_terms_terms-2026-08-v1`).delete()],
  ['missing Privacy',async uid=>db.doc(`legalConsents/${uid}_privacy_privacy-2026-08-v1`).delete()],
])test(label+' fails without approval effects',async()=>{const uid=await fixture();await change(uid);const before=await snapshot();await assert.rejects(approve(uid));assert.deepEqual(await snapshot(),before);assert.equal((await db.collection('adminAuditEvents').where('targetUid','==',uid).get()).size,0);});
test('non-Admin, forged Admin context, disabled/revoked Admin and client field injection fail',async()=>{
  const uid=await fixture();
  for(const bad of [null,{uid,role:'business',isAdmin:false,emailVerified:true},{uid,role:'admin',isAdmin:true,emailVerified:true}])await assert.rejects(service.approve({input:{uid},actor:bad}));
  for(const input of [{uid,active:true},{uid,email:'another@example.test'},{uid:'../target'},{}])await assert.rejects(service.approve({actor,input}),{code:'invalid-argument'});
  await auth.updateUser(actor.uid,{disabled:true});await assert.rejects(approve(uid),{code:'permission-denied'});await auth.updateUser(actor.uid,{disabled:false});
  await db.doc('users/'+actor.uid).update({role:'business'});await assert.rejects(approve(uid),{code:'permission-denied'});await db.doc('users/'+actor.uid).update({role:'admin'});
});
test('approval replay cannot restore revoked or regressed access',async()=>{
  const uid=await fixture();await approve(uid);await db.doc('users/'+uid).update({active:false,betaAccess:'revoked'});await assert.rejects(approve(uid));
  await db.doc('users/'+uid).update({active:false,betaAccess:'pending'});await assert.rejects(approve(uid));assert.equal((await db.doc('users/'+uid).get()).data().active,false);
});
test('production Rules deny direct owner/cross-user access changes and fabricated audit/notification writes',async()=>{
  const uid=await fixture(),other=await fixture();
  for(const who of [uid,other,null]){
    const client=who?rules.authenticatedContext(who,{email_verified:true}).firestore():rules.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(client,'users/'+uid),{active:true,betaAccess:'approved'}));
    await assertFails(setDoc(doc(client,'adminAuditEvents/forged'),{targetUid:uid}));
    await assertFails(setDoc(doc(client,'notifications/forged'),{userId:uid,title:'Approved'}));
  }
});
test('approval module contains no provider client or entitlement writer',()=>{
  const source=fs.readFileSync('business_access_approval.js','utf8');assert.doesNotMatch(source,/require\(['"]stripe|customers\.create|businessSubscriptions|wallets\/|grantInternalBeta|outboundEmailJobs/);
});
