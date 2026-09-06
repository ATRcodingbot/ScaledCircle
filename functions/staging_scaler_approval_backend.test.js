"use strict";
const assert=require('node:assert/strict');
const {test,beforeEach,after}=require('node:test');
if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local emulator required');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createApprovalService,AGREEMENTS}=require('../functions-staging-admin/scaler_approval');
const app=initializeApp({projectId:'demo-staging-approval'});const db=getFirestore(app);
let users;
const run=(projectId='scaledcircle-staging',actorUid='admin')=>createApprovalService({db,FieldValue,projectId,auth:{getUser:async uid=>{if(!users[uid])throw Error('missing');return users[uid];}}})({actorUid,targetUid:'scaler'});
beforeEach(async()=>{
 for(const collection of ['users','discoveryPreferences','legalConsents','adminAuditEvents']){const docs=await db.collection(collection).get();const batch=db.batch();docs.forEach(d=>batch.delete(d.ref));await batch.commit();}
 users={admin:{emailVerified:true,disabled:false},scaler:{emailVerified:true,disabled:false}};
 await db.doc('users/admin').set({role:'admin'});
 await db.doc('users/scaler').set({role:'scaler',active:false,betaAccess:'pending',displayName:'Unchanged',postalCode:'unchanged',createdAt:Timestamp.fromMillis(1000)});
 await db.doc('discoveryPreferences/scaler').set({userUid:'scaler',role:'scaler',initialSetupCompletedAt:Timestamp.fromMillis(1000),preferences:'unchanged'});
 for(const [type,v]of Object.entries(AGREEMENTS))await db.doc(`legalConsents/scaler_${type}_${v}`).set({uid:'scaler',agreementType:type,agreementVersion:v,acceptedAt:Timestamp.fromMillis(1000)});
});
after(()=>deleteApp(app));
test('concurrent approval and replay cause one atomic transition and audit; unrelated fields untouched',async()=>{
 const before=(await db.doc('users/scaler').get()).data();const results=await Promise.all([run(),run()]);
 assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal((await db.collection('adminAuditEvents').get()).size,1);
 const current=(await db.doc('users/scaler').get()).data();assert.equal(current.active,true);assert.equal(current.betaAccess,'approved');
 for(const k of ['role','displayName','postalCode','createdAt'])assert.deepEqual(current[k],before[k]);
 assert.equal((await db.doc('discoveryPreferences/scaler').get()).data().preferences,'unchanged');
 const audit=(await db.collection('adminAuditEvents').get()).docs[0].data();assert.equal(audit.actorUid,'admin');assert.equal(audit.environment,'staging');assert.ok(audit.createdAt);
});
for(const [name,change,error]of [
 ['missing profile',()=>db.doc('users/scaler').delete(),'profile_missing'],
 ['missing consent',()=>db.doc('legalConsents/scaler_terms_'+AGREEMENTS.terms).delete(),'consent_required'],
 ['wrong role',()=>db.doc('users/scaler').update({role:'business'}),'scaler_required'],
 ['incomplete work profile',()=>db.doc('discoveryPreferences/scaler').delete(),'profile_incomplete'],
 ['rejected state',()=>db.doc('users/scaler').update({betaAccess:'rejected'}),'pending_required'],
 ['disabled',async()=>{users.scaler.disabled=true;},'target_disabled'],
 ['email unverified',async()=>{users.scaler.emailVerified=false;},'email_unverified'],
 ['non-admin',()=>db.doc('users/admin').update({role:'scaler'}),'admin_required'],
 ['disabled admin',async()=>{users.admin.disabled=true;},'admin_required'],
 ['missing Auth',async()=>{delete users.scaler;},'target_missing'],
 ])test(name+' fails closed',async()=>{await change();await assert.rejects(run(),new RegExp(error));assert.equal((await db.collection('adminAuditEvents').get()).size,0);});
test('production fails before any eligibility access or write',async()=>{await assert.rejects(run('scaled-circle'),/staging_only/);assert.equal((await db.doc('users/scaler').get()).data().active,false);});
