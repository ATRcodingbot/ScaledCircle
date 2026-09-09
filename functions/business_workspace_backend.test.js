'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {createWorkspaceService,PLANS,seats}=require('./business_workspace');
const {ACTIONS,CONTEXT,createAccessAdapter}=require('./workspace_access');
const {createBillingService}=require('./workspace_billing');
let app,db,auth,service,adapter;const projectId='demo-business-workspace';
before(async()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,'Emulators required');app=initializeApp({projectId},'workspace-tests');db=getFirestore(app);auth=getAuth(app);service=createWorkspaceService({db,auth,FieldValue,Timestamp,origin:'https://scaledcircle-staging.web.app'});adapter=createAccessAdapter({db,workspace:service,FieldValue});});
after(async()=>{await db.terminate();await deleteApp(app);});
let sequence=0;
async function user(role='business',options={}){const uid=`user${++sequence}`;await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:true,...options});await db.doc(`users/${uid}`).set({role,active:true,email:`${uid}@example.test`,companyName:'Controlled Business',name:uid});for(const [type,version]of [['terms','terms-2026-08-v1'],['privacy','privacy-2026-08-v1']])await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid,agreementType:type,agreementVersion:version,acceptedAt:Timestamp.now()});return uid;}
async function owner(plan='growth'){const uid=await user();await db.doc(`businessSubscriptions/${uid}`).set({plan,status:'active',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});return uid;}
async function invitation(businessId,member,grants=['analytics']){const r=await service.invite({uid:businessId,businessId,data:{name:'Teammate',email:`${member}@example.test`,permissions:grants,preset:'custom'}});const job=await db.doc(`outboundEmailJobs/${r.emailJobId}`).get();const token=job.data().text.match(/[?&]token=([A-Za-z0-9_-]+)/)[1];return {...r,token};}
async function member(businessId,grants){const uid=await user();const i=await invitation(businessId,uid,grants);await service.accept({uid,businessId,invitationId:i.invitationId,token:i.token});return uid;}
test('exact paid plans include owner in 1/3/5/10 seats',()=>{assert.deepEqual(Object.values(PLANS).map(p=>[p.price,p.seats]),[[99,1],[299,3],[499,5],[999,10]]);for(const [plan,cap]of Object.entries(PLANS))assert.equal(seats({plan,status:'active',expiresAt:Timestamp.fromMillis(Date.now()+10000)}),cap.seats);assert.equal(seats({plan:'managed_growth',status:'canceled',expiresAt:Timestamp.now()}),1);});
test('Starter rejects an additional invitation, including owner seat',async()=>{const b=await owner('starter'),u=await user();await assert.rejects(invitation(b,u),{code:'resource-exhausted'});});
test('workspace and invitation use the maintained Business name when login profile has none',async()=>{const b=await owner(),u=await user();await db.doc(`users/${b}`).update({companyName:FieldValue.delete(),name:FieldValue.delete()});await db.doc(`businessGrowthProfiles/${b}`).set({businessName:'Named Business'});assert.equal((await service.list({uid:b,businessId:b})).businessName,'Named Business');const i=await invitation(b,u);assert.match((await db.doc(`outboundEmailJobs/${i.emailJobId}`).get()).data().subject,/Named Business/);});
test('concurrent invitations reserve only available Growth seats',async()=>{const b=await owner(),people=await Promise.all([user(),user(),user(),user()]);const results=await Promise.allSettled(people.map(u=>invitation(b,u)));assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal((await service.list({uid:b,businessId:b})).seatsReserved,2);});
test('concurrent acceptance and retries cannot duplicate or exceed seats',async()=>{const b=await owner(),u=await user(),v=await user(),a=await invitation(b,u),c=await invitation(b,v);const results=await Promise.all([service.accept({uid:u,businessId:b,invitationId:a.invitationId,token:a.token}),service.accept({uid:u,businessId:b,invitationId:a.invitationId,token:a.token}),service.accept({uid:v,businessId:b,invitationId:c.invitationId,token:c.token})]);assert.equal(results.filter(r=>r.duplicate===true).length,1);const members=(await service.list({uid:b,businessId:b})).members;assert.equal(members.length,2);assert.deepEqual(members.map(m=>m.seatIndex).sort(),[1,2]);assert.equal((await db.collection(`businessWorkspaces/${b}/activity`).where('action','==','team_invitation_accepted').get()).size,2);});
test('duplicate pending invitation and duplicate active membership rejected',async()=>{const b=await owner(),u=await user(),i=await invitation(b,u);await assert.rejects(invitation(b,u),{code:'already-exists'});await service.accept({uid:u,businessId:b,invitationId:i.invitationId,token:i.token});await assert.rejects(invitation(b,u),{code:'already-exists'});});
test('wrong email, revoked and expired invitations fail',async()=>{const b=await owner(),u=await user(),wrong=await user(),i=await invitation(b,u);await assert.rejects(service.accept({uid:wrong,businessId:b,invitationId:i.invitationId,token:i.token}),{code:'permission-denied'});await db.doc(`businessWorkspaces/${b}/invitations/${i.invitationId}`).update({expiresAt:Timestamp.fromMillis(Date.now()-1)});await assert.rejects(service.accept({uid:u,businessId:b,invitationId:i.invitationId,token:i.token}),{code:'failed-precondition'});const fresh=await invitation(b,u);await service.changeMember({uid:b,businessId:b,data:{action:'revoke',invitationId:fresh.invitationId}});await assert.rejects(service.accept({uid:u,businessId:b,invitationId:fresh.invitationId,token:fresh.token}),{code:'failed-precondition'});});
test('disabled account and missing consent cannot join',async()=>{const b=await owner(),u=await user(),i=await invitation(b,u);await auth.updateUser(u,{disabled:true});await assert.rejects(service.accept({uid:u,businessId:b,invitationId:i.invitationId,token:i.token}),{code:'permission-denied'});await auth.updateUser(u,{disabled:false});await db.doc(`legalConsents/${u}_privacy_privacy-2026-08-v1`).delete();await assert.rejects(service.accept({uid:u,businessId:b,invitationId:i.invitationId,token:i.token}),/legal_consent_required/);});
test('Analytics only cannot fund/publish/use intelligence/manage team/change billing',async()=>{const b=await owner(),u=await member(b,['analytics']);await service.authority({uid:u,businessId:b,permission:'analytics'});for(const permission of ['campaigns','authorizeCampaigns','payments','intelligence','teamManagement','billing'])await assert.rejects(service.authority({uid:u,businessId:b,permission}),{code:'permission-denied'});});
test('campaign creation permission does not authorize publication or spending',async()=>{const b=await owner(),u=await member(b,['campaigns']);await service.authority({uid:u,businessId:b,permission:'campaigns'});for(const permission of ['authorizeCampaigns','payments','billing'])await assert.rejects(service.authority({uid:u,businessId:b,permission}),{code:'permission-denied'});});
test('unrelated workspace and removed membership denied; owner cannot be removed',async()=>{const b=await owner(),other=await owner(),u=await member(b,['analytics']);await assert.rejects(service.authority({uid:u,businessId:other,permission:'analytics'}),{code:'permission-denied'});await assert.rejects(service.changeMember({uid:b,businessId:b,data:{memberId:b,action:'remove'}}),{code:'permission-denied'});await service.changeMember({uid:b,businessId:b,data:{memberId:u,action:'remove'}});await assert.rejects(service.authority({uid:u,businessId:b,permission:'analytics'}),{code:'permission-denied'});assert.equal((await db.doc(`businessWorkspaceAccess/${u}/workspaces/${b}`).get()).data().status,'removed');assert.equal((await db.collection(`businessWorkspaces/${b}/activity`).where('action','==','team_invitation_accepted').get()).size,1);});
test('Team Manager cannot escalate or grant their own billing privileges',async()=>{const b=await owner(),u=await member(b,['teamManagement']),v=await user();await assert.rejects(service.invite({uid:u,businessId:b,data:{name:'Other',email:`${v}@example.test`,permissions:['billing']}}),{code:'permission-denied'});await assert.rejects(service.changeMember({uid:u,businessId:b,data:{action:'edit',memberId:u,permissions:['billing']}}),{code:'permission-denied'});});
test('expired membership keeps owner historical/payment obligations and suspends team/new paid actions',async()=>{const b=await owner(),u=await member(b,['analytics']);await db.doc(`businessSubscriptions/${b}`).update({status:'canceled'});await service.authority({uid:b,businessId:b,permission:'payments',allowExpired:true});await service.authority({uid:b,businessId:b,permission:'analytics',allowExpired:true});await assert.rejects(service.authority({uid:b,businessId:b,permission:'campaigns'}),{code:'failed-precondition'});await assert.rejects(service.authority({uid:u,businessId:b,permission:'analytics'}),{code:'permission-denied'});});
test('adapter validates actual workspace action and preserves signed actor identity',async()=>{const b=await owner(),u=await member(b,['analytics']);await db.doc(`campaigns/c_${b}`).set({businessId:b,status:'open'});const request={auth:{uid:u,token:{email_verified:true}},data:{campaignId:`c_${b}`}};await assert.rejects(adapter('createCampaignFundingCheckoutSession',request,()=>{throw Error('must not execute');}),{code:'permission-denied'});const result=await adapter('getAttributionOverview',{...request,data:{businessId:b}},r=>({auth:r.auth.uid,resource:r[CONTEXT].uid,actor:r[CONTEXT].actorUid}));assert.deepEqual(result,{auth:u,resource:b,actor:u});assert.equal(ACTIONS.publishFundedCampaign,'authorizeCampaigns');});
test('provider-bound cancellation retains paid term, reactivation, no marketplace mutation',async()=>{const b=await owner();const end=Math.floor(Date.now()/1000)+86400;let provider={id:`sub_${b}`,customer:`cus_${b}`,metadata:{firebaseUid:b},status:'active',cancel_at_period_end:false,items:{data:[{id:'si_1',price:{id:'price_growth'},current_period_end:end}]}};await db.doc(`wallets/${b}`).set({stripeCustomerId:provider.customer,stripeSubscriptionId:provider.id,balance:1234});await db.doc(`businessSubscriptions/${b}`).update({stripeSubscriptionId:provider.id});await db.doc(`campaigns/funded_${b}`).set({businessId:b,status:'open',fundingStatus:'funded'});let updates=0;const billing=createBillingService({db,FieldValue,workspace:service,stripe:()=>({subscriptions:{retrieve:async()=>provider,update:async(id,params)=>{updates++;provider={...provider,...params};return provider;}}}),planForPrice:()=> 'growth',priceForPlan:()=> 'price_growth',sync:async()=>{}});const cancelled=await billing.change({uid:b,businessId:b,action:'cancel',requestId:'cancel_request_123456'});assert.equal(cancelled.cancelAtPeriodEnd,true);assert.equal(cancelled.paidAccess,true);assert.equal(cancelled.periodEndMs,end*1000);await billing.change({uid:b,businessId:b,action:'cancel',requestId:'cancel_request_123456'});assert.equal(updates,1);const resumed=await billing.change({uid:b,businessId:b,action:'reactivate',requestId:'resume_request_123456'});assert.equal(resumed.cancelAtPeriodEnd,false);assert.equal((await db.doc(`wallets/${b}`).get()).data().balance,1234);assert.equal((await db.doc(`campaigns/funded_${b}`).get()).data().fundingStatus,'funded');provider.customer='wrong';await assert.rejects(billing.get({uid:b,businessId:b}),{code:'permission-denied'});});

test('invited signup prepares only a personal pending login, never another workspace or approval',async()=>{
 const b=await owner(),u=`invited_new_${++sequence}`;
 await auth.createUser({uid:u,email:`${u}@example.test`,emailVerified:false});
 const i=await invitation(b,u);
 await service.prepareInvitedAccount({uid:u,businessId:b,invitationId:i.invitationId,token:i.token,name:'Invited person'});
 const profile=(await db.doc(`users/${u}`).get()).data();
 assert.equal(profile.active,false);assert.equal(profile.betaAccess,'pending');assert.equal(profile.activeBusinessId,undefined);
 assert.equal((await db.doc(`businessWorkspaces/${u}`).get()).exists,false);
 assert.equal((await db.doc(`businessSubscriptions/${u}`).get()).exists,false);
 await assert.rejects(service.accept({uid:u,businessId:b,invitationId:i.invitationId,token:i.token}),{code:'permission-denied'});
 const wrong=await user();await assert.rejects(service.prepareInvitedAccount({uid:wrong,businessId:b,invitationId:i.invitationId,token:i.token,name:'Wrong'}),{code:'permission-denied'});
});

async function billingFixture(plan='growth') {
 const b=await owner(plan);let nowMs=Date.now(),updates=0,mode='normal';
 let provider={id:`sub_${b}`,customer:`cus_${b}`,metadata:{firebaseUid:b},status:'active',cancel_at_period_end:false,items:{data:[{id:'si_one',price:{id:`price_${plan}`},current_period_end:Math.floor(nowMs/1000)+86400}]}};
 await db.doc(`wallets/${b}`).set({stripeCustomerId:provider.customer,stripeSubscriptionId:provider.id,balance:0});
 await db.doc(`businessSubscriptions/${b}`).update({stripeSubscriptionId:provider.id});
 const keys=[];
 const billing=createBillingService({db,FieldValue,workspace:service,now:()=>nowMs,planForPrice:p=>p?.replace('price_',''),priceForPlan:p=>`price_${p}`,sync:async s=>db.doc(`businessSubscriptions/${b}`).update({plan:s.items.data[0].price.id.replace('price_',''),status:'active'}),stripe:()=>({invoices:{createPreview:async()=>({currency:'usd',amount_due:1234,total:1234})},subscriptions:{retrieve:async()=>provider,update:async(id,params,opts)=>{
  updates++;keys.push(opts.idempotencyKey);
  if(mode==='card-failed'){const e=Error('declined');e.type='StripeCardError';e.statusCode=402;throw e;}
  if(mode==='before-ambiguous')throw Error('connection failure');
  provider={...provider,...params,items:params.items?{data:params.items.map(i=>({...provider.items.data[0],id:i.id,price:{id:i.price}}))}:provider.items};
  if(mode==='after-ambiguous')throw Error('response lost');
  return provider;
 }}})});
 return {b,billing,keys,get updates(){return updates;},get provider(){return provider;},set mode(v){mode=v;},advance:ms=>nowMs+=ms};
}
test('plan change requires actor-bound current provider preview, invoice failure cannot grant a seat upgrade',async()=>{
 const f=await billingFixture();await assert.rejects(f.billing.change({uid:f.b,businessId:f.b,action:'changePlan',plan:'scale',requestId:'plan_preview_missing_123'}),{code:'invalid-argument'});
 const q=await f.billing.preview({uid:f.b,businessId:f.b,plan:'scale'});assert.equal(q.price,499);assert.equal(q.seatLimit,5);assert.equal(q.amountDueCents,1234);
 f.mode='card-failed';await assert.rejects(f.billing.change({uid:f.b,businessId:f.b,action:'changePlan',plan:'scale',quoteId:q.quoteId,requestId:'plan_card_failure_123'}),{code:'failed-precondition'});
 assert.equal((await service.authority({uid:f.b,businessId:f.b})).capacity,3);
 assert.equal((await db.doc(`businessWorkspaces/${f.b}`).get()).data().billingOperationId,undefined);
});
test('downgrade refuses excess active or reserved seats without deleting anyone',async()=>{
 const f=await billingFixture('scale');const u=await member(f.b,['analytics']),v=await member(f.b,['analytics']),w=await member(f.b,['analytics']);
 const q=await f.billing.preview({uid:f.b,businessId:f.b,plan:'growth'});
 await assert.rejects(f.billing.change({uid:f.b,businessId:f.b,action:'changePlan',plan:'growth',quoteId:q.quoteId,requestId:'downgrade_seat_hold_123'}),{code:'failed-precondition'});
 assert.equal(f.updates,0);for(const id of [u,v,w])assert.equal((await db.doc(`businessWorkspaces/${f.b}/members/${id}`).get()).data().status,'active');
});
test('downgrade and concurrent invitation cannot exceed reserved target capacity',async()=>{
 const f=await billingFixture('scale');await member(f.b,['analytics']);await member(f.b,['analytics']);const u=await user();
 const q=await f.billing.preview({uid:f.b,businessId:f.b,plan:'growth'});
 const results=await Promise.allSettled([f.billing.change({uid:f.b,businessId:f.b,action:'changePlan',plan:'growth',quoteId:q.quoteId,requestId:'concurrent_downgrade_123'}),invitation(f.b,u)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const inv=await service.inventory(f.b),a=await service.authority({uid:f.b,businessId:f.b});assert.ok(1+inv.members.length+inv.invitations.length<=a.capacity);
});
test('lost provider response reconciles with no second update or duplicate audit',async()=>{
 const f=await billingFixture();f.mode='after-ambiguous';await assert.rejects(f.billing.change({uid:f.b,businessId:f.b,action:'cancel',requestId:'cancel_lost_reply_123'}),{code:'unavailable'});
 const result=await f.billing.get({uid:f.b,businessId:f.b});assert.equal(result.cancelAtPeriodEnd,true);assert.equal(f.updates,1);
 await f.billing.change({uid:f.b,businessId:f.b,action:'cancel',requestId:'cancel_lost_reply_123'});assert.equal(f.updates,1);
 assert.equal((await db.collection(`businessWorkspaces/${f.b}/activity`).where('action','==','membership_cancel').get()).size,1);
});
test('explicit recovery uses original params/idempotency only within its validity window',async()=>{
 const f=await billingFixture();f.mode='before-ambiguous';const input={uid:f.b,businessId:f.b,action:'cancel',requestId:'cancel_not_sent_1234'};
 await assert.rejects(f.billing.change(input),{code:'unavailable'});assert.equal((await f.billing.get({uid:f.b,businessId:f.b})).changePending,true);
 await assert.rejects(f.billing.change(input),{code:'aborted'});f.advance(35000);f.mode='normal';await f.billing.change(input);assert.equal(f.keys[0],f.keys[1]);assert.equal(f.updates,2);
});
test('unrelated and non-Billing members cannot preview or cancel a subscription',async()=>{
 const f=await billingFixture(),u=await member(f.b,['analytics']);await assert.rejects(f.billing.preview({uid:u,businessId:f.b,plan:'scale'}),{code:'permission-denied'});
 await assert.rejects(f.billing.change({uid:u,businessId:f.b,action:'cancel',requestId:'unauthorized_cancel_123'}),{code:'permission-denied'});assert.equal(f.updates,0);
});
const {createSubscriptionSync}=require('./workspace_subscription_sync');
const {processDeliveryJob}=require('./transactional_email');
test('invitation is delivered once by maintained outbound-email worker',async()=>{
 const b=await owner(),u=await user(),i=await invitation(b,u);let sends=0;
 const input={db,FieldValue,reference:db.doc(`outboundEmailJobs/${i.emailJobId}`),jobId:i.emailJobId,smtpPassword:'emulator-only',createTransport:()=>({sendMail:async mail=>{sends++;assert.equal(mail.to,`${u}@example.test`);assert.match(mail.subject,/invited/);return {messageId:'local-accepted'};}})};
 assert.equal((await processDeliveryJob(input)).status,'sent');await processDeliveryJob(input);assert.equal(sends,1);
});
async function subscriptionFixture(){
 const b=await owner();const s={id:`sub_sync_${b}`,livemode:false,customer:`cus_sync_${b}`,metadata:{firebaseUid:b,plan:'growth'},status:'active',cancel_at_period_end:false,items:{data:[{quantity:1,price:{id:'price_growth',livemode:false,product:'scaledcircle_workspace_staging_v1',metadata:{plan:'growth',purpose:'workspace_membership_staging_v1'},currency:'usd',unit_amount:29900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}},current_period_end:Math.floor(Date.now()/1000)+86400}]}};
 await db.doc(`wallets/${b}`).set({stripeCustomerId:s.customer,balance:42});
 await db.doc(`campaigns/${b}_funded`).set({businessId:b,status:'open',fundingStatus:'funded'});
 await db.doc(`assignmentCompensations/${b}_accepted`).set({businessId:b,immutable:true,basePayCents:1500});
 return {b,s,sync:createSubscriptionSync({db,FieldValue,Timestamp,environment:'staging',planForPrice:id=>id==='price_growth'?'growth':null})};
}
test('subscription cancellation preserves paid term, balances and funded contracts',async()=>{
 const f=await subscriptionFixture();assert.equal((await f.sync(f.s,`created_${f.b}`)).synced,true);
 const first=(await db.doc(`campaigns/${f.b}_funded`).get()).updateTime;
 await f.sync({...f.s,cancel_at_period_end:true},`cancel_${f.b}`);assert.equal((await f.sync({...f.s,cancel_at_period_end:true},`cancel_${f.b}`)).duplicate,true);
 let e=(await db.doc(`businessSubscriptions/${f.b}`).get()).data();assert.equal(e.status,'active');assert.equal(e.cancelAtPeriodEnd,true);assert.ok(e.expiresAt.toMillis()>Date.now());
 await f.sync({...f.s,status:'canceled'},`ended_${f.b}`);e=(await db.doc(`businessSubscriptions/${f.b}`).get()).data();assert.equal(e.status,'canceled');assert.equal(seats(e),1);
 assert.equal((await db.doc(`wallets/${f.b}`).get()).data().balance,42);assert.ok(first.isEqual((await db.doc(`campaigns/${f.b}_funded`).get()).updateTime));assert.equal((await db.doc(`assignmentCompensations/${f.b}_accepted`).get()).data().basePayCents,1500);
});
test('unknown customer/workspace and stale subscription cannot overwrite membership',async()=>{
 const f=await subscriptionFixture();await f.sync(f.s,`bind_${f.b}`);
 assert.equal((await f.sync({...f.s,customer:'cus_wrong'},`wrong_${f.b}`)).ignored,'customer_binding');
 assert.equal((await f.sync({...f.s,metadata:{firebaseUid:'missing_workspace',plan:'growth'}},'unknown_owner')).ignored,'customer_binding');
 assert.equal((await f.sync({...f.s,id:'sub_other',status:'canceled'},`old_${f.b}`)).ignored,'subscription_binding');assert.equal((await db.doc(`businessSubscriptions/${f.b}`).get()).data().status,'active');
});
test('ended membership reactivation requires current Checkout binding',async()=>{
 const f=await subscriptionFixture();await f.sync(f.s,`bind_${f.b}`);await f.sync({...f.s,status:'canceled'},`end_${f.b}`);
 const replacement={...f.s,id:`${f.s.id}_new`,metadata:{...f.s.metadata,checkoutRequestId:'checkout_current'}};
 assert.equal((await f.sync(replacement,`new_${f.b}`)).ignored,'subscription_binding');await db.doc(`wallets/${f.b}`).update({pendingSubscriptionRequestId:'checkout_current'});assert.equal((await f.sync(replacement,`new_${f.b}`)).synced,true);assert.equal((await f.sync({...f.s,status:'canceled'},`late_${f.b}`)).ignored,'subscription_binding');
});
test('mismatched price/currency/period cannot grant membership',async()=>{
 const f=await subscriptionFixture();for(const price of [{...f.s.items.data[0].price,unit_amount:99},{...f.s.items.data[0].price,currency:'eur'},{...f.s.items.data[0].price,recurring:{interval:'year'}}])await assert.rejects(f.sync({...f.s,items:{data:[{...f.s.items.data[0],price}]}},`invalid_${f.b}`),/binding_mismatch/);
});
test('ended subscription releases its Checkout reservation without clearing a newer request',async()=>{
 const f=await subscriptionFixture();f.s.metadata.checkoutRequestId='old_checkout';
 const wallet=db.doc(`wallets/${f.b}`);
 await wallet.update({pendingSubscriptionRequestId:'old_checkout',pendingSubscriptionPlan:'growth',pendingSubscriptionExpiresMs:Date.now()+86400000});
 await f.sync(f.s,`active_${f.b}`);
 await f.sync({...f.s,status:'canceled'},`ended_${f.b}`);
 const ended=(await wallet.get()).data();
 for(const field of ['pendingSubscriptionRequestId','pendingSubscriptionPlan','pendingSubscriptionExpiresMs'])assert.equal(ended[field],undefined);
 assert.equal(ended.balance,42);
 await wallet.update({pendingSubscriptionRequestId:'new_checkout',pendingSubscriptionPlan:'scale',pendingSubscriptionExpiresMs:Date.now()+86400000});
 await f.sync({...f.s,status:'canceled'},`late_ended_${f.b}`);
 assert.equal((await wallet.get()).data().pendingSubscriptionRequestId,'new_checkout');
});
