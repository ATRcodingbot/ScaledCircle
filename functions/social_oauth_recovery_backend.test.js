'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const admin=require('firebase-admin'),app=admin.initializeApp({projectId:'demo-meta-recovery'},'meta-recovery'),db=app.firestore();
const oauth=require('../functions-social-operations/social_oauth'),lifecycle=require('../functions-social-operations/social_oauth_lifecycle');
const key=Buffer.alloc(32,7).toString('base64'),source=path.resolve(__dirname,'../functions-social-operations/index.js');
const createRequire=require('module').createRequire,local=createRequire(source),exportsObject={};
const req=name=>{
 if(name==='firebase-admin/app')return {getApps:()=>[{}],initializeApp:()=>({})};
 if(name==='firebase-admin/firestore')return {getFirestore:()=>new Proxy(db,{get:(t,k)=>k==="runTransaction"?((fn)=>t.runTransaction(tx=>Promise.resolve(fn(tx)))):typeof t[k]==="function"?t[k].bind(t):t[k]}),FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp};
 if(name==='firebase-functions/v2')return {setGlobalOptions:()=>{}};
 if(name==='firebase-functions/v2/https')return {onCall:(_,h)=>h,onRequest:(_,h)=>h,HttpsError:require('firebase-functions/v2/https').HttpsError};
 if(name==='firebase-functions/v2/scheduler')return {onSchedule:(_,h)=>h};
 if(name==='firebase-functions/params')return {defineSecret:()=>({value:()=>key})};
 return local(name);
};
vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:req,exports:exportsObject,process:{env:{GCLOUD_PROJECT:'scaled-circle',SOCIAL_CUSTOMER_PUBLISHING_BETA_UIDS:'owner'}},console,Buffer,URL,Date,setTimeout,clearTimeout});
const call=(name,data={},uid='owner')=>exportsObject[name]({auth:{uid,token:{email_verified:true}},data});
beforeEach(async()=>{
 for(const c of ['users','businessSubscriptions','socialConnections','socialOAuthAttempts','socialProviderConfigs','socialConnectionCredentials','socialPlanningRuns','socialContentPlans','socialContentItems','socialContentVersions','businessGrowthProfiles','discoveryPreferences'])await db.recursiveDelete(db.collection(c));
 await db.doc('users/owner').set({role:'business'});await db.doc('users/other').set({role:'business'});
 for(const u of ['owner','other'])await db.doc('businessSubscriptions/'+u).set({planId:'managed_growth',status:'active',comped:true,expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+86400000)});
 await db.doc('socialProviderConfigs/production_meta').set({provider:'meta',environment:'production',enabled:true,writeScopesEnabled:false,externalPublishingEnabled:false,clientId:'fixture-app',redirectUri:oauth.callbackUrl({provider:'meta',environment:'production'})});
});
after(()=>app.delete());
async function begin(){return call('beginSocialOAuthConnectionV1',{provider:'meta'});}
async function ready(a,{scopes=oauth.PROVIDER_SCOPES.meta,expired=false}={}){
 const ref=db.doc('socialOAuthAttempts/'+a.attemptId),r=(await ref.get()).data(),candidates=[{provider:'meta',candidateId:'meta_page_123',accountId:'123',accountDisplayName:'Customer Page',accountType:'facebook_page',pageAccessToken:'test-page',userAccessToken:'test-user',capabilities:{profile:true,analytics:true}}];
 await ref.update({status:'identity_pending',grantedScopes:scopes,expiresAtMillis:expired?Date.now()-1:Date.now()+600000,candidateEnvelope:oauth.encryptJson({candidates},key,`${r.businessUid}:meta:${r.stateDigest}`)});
}
test('concurrent begin and Continue reuse one attempt; canceled retry creates one fresh attempt',async()=>{
 const [a,b]=await Promise.all([begin(),begin()]);assert.equal(a.attemptId,b.attemptId);
 assert.equal((await db.collection('socialOAuthAttempts').get()).size,1);
 assert.equal((await call('getSocialOAuthAttemptV1',{attemptId:a.attemptId})).status,'authorizing');
 await call('cancelSocialOAuthAttemptV1',{attemptId:a.attemptId});
 assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().status,'not_connected');
 const c=await begin();assert.notEqual(c.attemptId,a.attemptId);assert.equal((await begin()).attemptId,c.attemptId);
});
test('failed or expired Meta attempt clears only its pointer and cannot confirm',async()=>{
 for(const status of ['error','expired']){
  const a=await begin();await ready(a,{expired:status==='expired'});
  if(status==='error')await db.doc('socialOAuthAttempts/'+a.attemptId).update({status:'error'});
  await call('getSocialOAuthAttemptV1',{attemptId:a.attemptId});
  const c=(await db.doc('socialConnections/owner/providers/facebook').get()).data();assert.equal(c.status,'not_connected');assert.equal(c.pendingAttemptId,undefined);
  await assert.rejects(call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'}));
 }
 assert.equal((await db.collection('socialConnectionCredentials').get()).size,0);
});
test('late failure cannot clear a newer attempt; unrelated tenant cannot cancel or select',async()=>{
 const a=await begin();await call('cancelSocialOAuthAttemptV1',{attemptId:a.attemptId});const b=await begin();
 await lifecycle.recoverMetaPending(db,'owner',admin.firestore.FieldValue,{attemptId:a.attemptId,reason:'connection_failed'});
 assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().pendingAttemptId,b.attemptId);
 await assert.rejects(call('cancelSocialOAuthAttemptV1',{attemptId:b.attemptId},'other'));
 await ready(b);await assert.rejects(call('confirmSocialOAuthConnectionV1',{attemptId:b.attemptId,candidateId:'meta_page_123'},'other'));
});
test('extra remembered write grants do not block or enable writes; confirmation is once and tenant-bound',async()=>{
 const a=await begin();await ready(a,{scopes:[...oauth.PROVIDER_SCOPES.meta,'pages_manage_posts','instagram_content_publish','public_profile']});
 await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 const c=(await db.doc('socialConnections/owner/providers/facebook').get()).data();assert.equal(c.status,'connected_read_only');assert.equal(c.providerUserId,'123');assert.equal(c.capabilities.publishText,false);assert.equal(c.writeScopesGranted,false);assert.equal(c.pendingAttemptId,undefined);
 await assert.rejects(call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'}));
 assert.equal((await db.collection('socialConnectionCredentials').get()).size,1);
 await lifecycle.recoverMetaPending(db,'owner',admin.firestore.FieldValue,{attemptId:a.attemptId,reason:'connection_failed'});
 assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().status,'connected_read_only');
});
test('optional Instagram and analytics absence permits basic Page; required Page access fails closed and recovers',async()=>{
 const a=await begin();await ready(a,{scopes:['pages_show_list','pages_read_engagement']});
 await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().capabilities.analytics,false);
 assert.equal((await db.doc('socialConnections/owner/providers/instagram').get()).data().status,'not_connected');
 await db.recursiveDelete(db.collection('socialConnections'));
 const b=await begin();await ready(b,{scopes:['pages_show_list']});
 await assert.rejects(call('confirmSocialOAuthConnectionV1',{attemptId:b.attemptId,candidateId:'meta_page_123'}));
 assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().status,'not_connected');
});



test('provider rejection clears authorizing; workspace load recovers expiry without Check',async()=>{
 const a=await begin();const r=(await db.doc('socialOAuthAttempts/'+a.attemptId).get()).data();
 const envelope=oauth.decryptJson(r.authorizationEnvelope,key,`owner:meta:${r.stateDigest}:authorization`);
 const state=new URL(envelope.authorizationUrl).searchParams.get('state');let status;
 const response={set:()=>{},status:x=>{status=x;return response},type:()=>response,send:()=>{}};
 await exportsObject.socialOAuthMetaCallbackV1({query:{state,error:'access_denied'}},response);
 assert.equal(status,400);assert.equal((await db.doc('socialConnections/owner/providers/facebook').get()).data().status,'not_connected');
 const b=await begin();await db.doc('socialOAuthAttempts/'+b.attemptId).update({expiresAtMillis:Date.now()-1});
 const workspace=await call('getSocialOperationsWorkspace');assert.equal(workspace.connections.find(c=>c.provider==='facebook').status,'not_connected');
 assert.equal((await db.doc('socialOAuthAttempts/'+b.attemptId).get()).data().status,'expired');
});

test('customer permission update keeps working read access, reuses attempts, cancel is recoverable',async()=>{
 const a=await begin();await ready(a);await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 const ref=db.doc('socialConnections/owner/providers/facebook'),before=(await ref.get()).data();
 const b=await call('beginSocialOAuthConnectionV1',{provider:'meta',capability:'managed_publishing'});
 assert.equal((await call('beginSocialOAuthConnectionV1',{provider:'meta',capability:'managed_publishing'})).attemptId,b.attemptId);
 const during=(await ref.get()).data();assert.equal(during.status,'connected_read_only');assert.deepEqual(during.capabilities,before.capabilities);
 await call('cancelSocialOAuthAttemptV1',{attemptId:b.attemptId});const after=(await ref.get()).data();
 assert.equal(after.status,'connected_read_only');assert.deepEqual(after.capabilities,before.capabilities);assert.equal(after.credentialId,before.credentialId);
 await assert.rejects(call('beginSocialOAuthConnectionV1',{provider:'meta',capability:'managed_publishing'},'other'));
});
test('real customer write grant sets readiness only; no publication, global switch or job approval',async()=>{
 const a=await begin();await ready(a);await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 const b=await call('beginSocialOAuthConnectionV1',{provider:'meta',capability:'managed_publishing'});await ready(b,{scopes:oauth.META_PUBLISH_SCOPES});
 await call('confirmSocialOAuthConnectionV1',{attemptId:b.attemptId,candidateId:'meta_page_123'});
 const c=(await db.doc('socialConnections/owner/providers/facebook').get()).data();
 assert.equal(c.status,'connected_write');assert.equal(c.managedPublishingPermissionGranted,true);assert.equal(c.externalPublishingEnabled,false);assert.equal(c.approvalMode,'approval_required');
 assert.equal((await db.doc('socialProviderConfigs/production_meta').get()).data().writeScopesEnabled,false);
 assert.equal((await db.collection('socialPublishJobs').get()).size,0);
 await assert.rejects(call('confirmSocialOAuthConnectionV1',{attemptId:b.attemptId,candidateId:'meta_page_123'}));
});
test('customer missing optional publishing permission retains verified read connection',async()=>{
 const a=await begin();await ready(a);await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 const b=await call('beginSocialOAuthConnectionV1',{provider:'meta',capability:'managed_publishing'});await ready(b,{scopes:oauth.PROVIDER_SCOPES.meta});
 await call('confirmSocialOAuthConnectionV1',{attemptId:b.attemptId,candidateId:'meta_page_123'});
 const c=(await db.doc('socialConnections/owner/providers/facebook').get()).data();assert.equal(c.status,'connected_read_only');assert.equal(c.managedPublishingPermissionGranted,false);assert.equal(c.capabilities.analytics,true);
});

test('customer draft strategy persists exactly once and creates no approval or publication jobs',async()=>{
 const a=await begin();await ready(a);await call('confirmSocialOAuthConnectionV1',{attemptId:a.attemptId,candidateId:'meta_page_123'});
 await db.doc('businessGrowthProfiles/owner').set({businessUid:'owner',businessName:'Example Builder',servicesOffered:['decks'],website:'example.com'});
 await db.doc('discoveryPreferences/owner').set({schemaVersion:'ServiceAreaPreferencesV1',role:'business',userUid:'owner',areas:[{id:'aa',type:'place',geographyType:'county',county:'Anne Arundel County',state:'Maryland',displayName:'Anne Arundel County'}]});
 const results=await Promise.all([call('prepareCustomerSocialPlanV1'),call('prepareCustomerSocialPlanV1')]);
 assert.equal(results[0].planId,results[1].planId);assert.equal((await db.collection('socialContentPlans').get()).size,1);
 assert.equal((await db.collection('socialContentItems').get()).size,8);assert.equal((await db.collection('socialContentVersions').get()).size,8);
 const plan=(await db.doc('socialContentPlans/'+results[0].planId).get()).data();assert.equal(plan.status,'ready_for_review');assert.equal(plan.approvedAt,null);
 assert.equal((await db.collection('socialGrowthJobs').get()).size,0);await assert.rejects(call('prepareCustomerSocialPlanV1',{},'other'));
});
