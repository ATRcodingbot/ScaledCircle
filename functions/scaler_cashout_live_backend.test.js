'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const Stripe=require('stripe'),{createRuntime,assertRuntime}=require('./scaler_cashout_live'),{VERSION}=require('./scaler_cashout_live_store');
const app=initializeApp({projectId:'demo-scaledcircle'},'live-cashout-offline'),db=getFirestore(app);
const uid='real-scaler',business='real-business',zoneId='real-zone',campaignId='real-campaign',earningId='earning_real-zone_v1',paymentId='real-payment',accountId='acct_recipient';
const config={project:'scaled-circle',appEnv:'production',mode:'live',platformId:'acct_platform',secretKey:'sk_live_offlinefixture',enabled:true};
let runtime,stripe,clock,controls,transfers,payouts,calls;
const get=async p=>(await db.doc(p).get()).data();
const req={requestId:'request_certification_one',amountCents:300};
beforeEach(async()=>{
 for(const name of ['users','wallets','walletTransactions','campaignZones','campaigns','assignmentCompensations','campaignSettlements','campaignCompletions','scalerTransfers','campaignPayments','financialOperations','scalerCashoutIndex','scalerCashoutAllocations','stripeConnectedAccounts','stripeConnectedRecipients','scalerCashoutEvents'])await db.recursiveDelete(db.collection(name));
 clock=1789308000000;controls={platformBalance:10000,connectedBalance:10000,transferError:null,payoutError:null,receiptLive:true,transfersReady:true};transfers=new Map();payouts=new Map();calls=[];
 const earning={type:'scaler_earnings',walletSide:'scaler',transferOperationId:'real-transfer',campaignId,zoneId,businessId:business,scalerId:uid,amount:3,amountCents:300,currency:'usd',status:'available',createdAt:1};
 const records={['users/'+uid]:{role:'scaler',active:true},['users/admin']:{role:'admin'},['wallets/'+uid]:{ownerId:uid,ownerType:'scaler',availableBalance:3},['wallets/'+uid+'/transactions/'+earningId]:earning,['walletTransactions/'+earningId]:earning,
  ['campaigns/'+campaignId]:{businessId:business,fundingStatus:'funded',fundingPaymentId:paymentId},['campaignZones/'+zoneId]:{campaignId,businessId:business,assignedScalerId:uid,status:'completed',reviewStatus:'approved',reviewedBy:business,reviewFinalizedAt:1,approvedTransferAmountCents:300,approvedBaseAmountCents:300,approvedBonusAmountCents:0,submittedCompletionId:'real-completion'},
  ['campaignCompletions/real-completion']:{zoneId,campaignId,scalerId:uid,status:'approved',reviewStatus:'approved',approvedTransferAmountCents:300,submittedAt:1},
  ['assignmentCompensations/'+zoneId]:{zoneId,campaignId,businessId:business,scalerId:uid,currency:'usd',immutable:true,acceptedAtMs:1,baseAmountCents:300,bonusAmountCents:0},
  ['campaignSettlements/'+zoneId]:{policyVersion:'EarnedWorkReserveReturnV1',zoneId,campaignId,businessId:business,scalerId:uid,paymentId,earnedWorkerCents:300,actorUid:business,createdAt:1,source:'ordinary_review',businessReturnCents:0,unusedWorkerCents:0},
  ['scalerTransfers/real-transfer']:{scalerId:uid,zoneId,campaignId,businessId:business,paymentId,amountCents:300,externalExecutionAuthorized:false,status:'transfer_pending'},
  ['campaignPayments/'+paymentId]:{businessId:business,campaignId,status:'paid',paidAt:1,stripeMode:'live',stripePaymentIntentId:'pi_real',currency:'usd',businessChargeCents:360,workerAmountCents:300,platformFeeCents:60,reservedWorkerAmountCents:300},
  ['stripeConnectedAccounts/'+uid]:{scalerId:uid,mode:'live',authorityVersion:VERSION,accountApi:'accounts_v2',stripeAccountId:accountId},['stripeConnectedRecipients/'+accountId]:{scalerId:uid,accountId,mode:'live',authorityVersion:VERSION}};
 for(const [p,v]of Object.entries(records))await db.doc(p).set(v);
 stripe={accounts:{retrieve:async()=>({id:'acct_platform',country:'US',capabilities:{transfers:'active'}})},balance:{retrieve:async(_a,o)=>({livemode:true,available:[{currency:'usd',amount:o?.stripeAccount?controls.connectedBalance:controls.platformBalance}]})},balanceSettings:{retrieve:async()=>({payments:{payouts:{schedule:{interval:'manual'}}}})},
  v2:{core:{accounts:{retrieve:async id=>({id,livemode:true,metadata:{scalerId:uid},configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:controls.transfersReady?'active':'inactive'},payouts:{status:'active'}}}}},requirements:{summary:{minimum_deadline:{status:'eventually_due'}}}})}}},
  paymentIntents:{retrieve:async()=>({id:'pi_real',livemode:true,status:'succeeded',amount_received:360,currency:'usd',metadata:{paymentId,campaignId,businessUid:business},latest_charge:'ch_real'})},charges:{retrieve:async()=>({id:'ch_real',livemode:true,paid:true,disputed:false,currency:'usd',payment_intent:'pi_real',amount_refunded:0})},
  transfers:{list:async()=>({data:[...transfers.values()],has_more:false}),retrieve:async id=>transfers.get(id),create:async(data,options)=>{calls.push({kind:'transfer',data,options});if(controls.transferError==='definitive')throw Object.assign(Error('declined'),{definitive:true});if(controls.transferError==='before')throw Error('timeout');const t={id:'tr_real',...data,livemode:controls.receiptLive,amount_reversed:0};transfers.set(t.id,t);if(controls.transferError==='after')throw Error('response lost');return t;}},
  payouts:{list:async()=>({data:[...payouts.values()],has_more:false}),retrieve:async id=>payouts.get(id),create:async(data,options)=>{calls.push({kind:'payout',data,options});const p={id:'po_real',...data,livemode:controls.receiptLive,status:'pending'};payouts.set(p.id,p);if(controls.payoutError)throw Error('response lost');return p;}},webhooks:new Stripe('sk_live_offlinefixture').webhooks};
 const auth={getUser:async id=>({uid:id,email:id+'@example.test',emailVerified:true,disabled:false})};runtime=createRuntime({db,auth,stripe,config,now:()=>clock});
});
after(async()=>{await db.terminate();await deleteApp(app);});
test('late bank failure reopens one obligation; repayment cannot debit funding twice',async()=>{
 const r=await runtime.request(uid,req);payouts.get('po_real').status='paid';await runtime.reconcile(uid,{operationId:r.operationId});payouts.get('po_real').status='failed';await runtime.reconcile(uid,{operationId:r.operationId});await runtime.reconcile(uid,{operationId:r.operationId});let w=await get('wallets/'+uid);assert.equal(w.cashoutPaidCents,0);assert.equal(w.cashoutPendingCents,300);assert.equal(w.availableBalance,0);await runtime.reconcile(uid,{operationId:r.operationId,retry:true});payouts.get('po_real').status='paid';await runtime.reconcile(uid,{operationId:r.operationId});w=await get('wallets/'+uid);assert.equal(w.cashoutPaidCents,300);assert.equal(w.cashoutPendingCents,0);assert.equal((await get('campaignPayments/'+paymentId)).transferredWorkerAmountCents,300);assert.equal(calls.filter(x=>x.kind==='transfer').length,1);
});
test('missing actual completion blocks reservation',async()=>{await db.doc('campaignCompletions/real-completion').delete();await assert.rejects(runtime.request(uid,req));assert.equal(calls.length,0);});
test('provider authenticated explicit rejection releases before money movement',async()=>{stripe.transfers.create=async()=>{throw {type:'StripeInvalidRequestError',statusCode:400,requestId:'req_provider',code:'transfers_not_allowed'};};const r=await runtime.request(uid,req);assert.equal(r.status,'failed');assert.equal((await get('wallets/'+uid)).availableBalance,3);});
test('Connect unknown create stops beyond the v2 idempotency replay window',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).delete();let creates=0;stripe.v2.core.accounts.create=async()=>{creates++;throw Error('lost response');};stripe.v2.core.accounts.list=async()=>({data:[],next_page_url:null});await assert.rejects(runtime.setup(uid));clock+=30*86400000;await assert.rejects(runtime.setup(uid));assert.equal(creates,1);
});
test('Connect recovers relative provider pagination and exact LIVE UID binding',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).set({scalerId:uid,mode:'live',authorityVersion:VERSION,accountApi:'accounts_v2',setupStartedAt:1});let pages=0;stripe.v2.core.accounts.list=async opts=>{pages++;return opts.page?{data:[{id:accountId,livemode:true,metadata:{scalerId:uid,mode:'live',authorityVersion:VERSION}}],next_page_url:null}:{data:[],next_page_url:'/v2/core/accounts?page=next_page'};};stripe.balanceSettings.update=async()=>{};stripe.v2.core.accountLinks={create:async()=>({url:'https://connect.stripe.com/setup/test'})};const r=await runtime.setup(uid);assert.equal(r.mode,'live');assert.equal(pages,2);assert.equal((await get('stripeConnectedAccounts/'+uid)).stripeAccountId,accountId);
});
test('LIVE mode requires exact production identity and LIVE key',()=>{assertRuntime(config);for(const p of [{project:'scaledcircle-staging'},{appEnv:'staging'},{mode:'test'},{secretKey:'sk_test_offlinefixture'},{platformId:''}])assert.throws(()=>assertRuntime({...config,...p}));});
test('real approved earning chain accepted; source earning and contract remain unchanged after paid withdrawal',async()=>{
 const original=await get('walletTransactions/'+earningId),contract=await get('assignmentCompensations/'+zoneId);
 const result=await runtime.request(uid,req);assert.equal(result.status,'pending');let w=await get('wallets/'+uid);assert.equal(w.availableBalance,0);assert.equal(w.cashoutPendingCents,300);
 payouts.get('po_real').status='paid';await runtime.reconcile(uid,{operationId:result.operationId});w=await get('wallets/'+uid);assert.equal(w.availableBalance,0);assert.equal(w.cashoutPendingCents,0);assert.equal(w.cashoutPaidCents,300);assert.equal((await get('campaignPayments/'+paymentId)).transferredWorkerAmountCents,300);
 assert.deepEqual(await get('walletTransactions/'+earningId),original);assert.deepEqual(await get('assignmentCompensations/'+zoneId),contract);assert.equal((await runtime.status(uid)).availableCents,0);assert.equal(calls.filter(c=>c.kind==='transfer').length,1);assert.equal(calls.filter(c=>c.kind==='payout').length,1);
 await runtime.request(uid,req);assert.equal(calls.length,2);
});
test('TEST fixture, missing settlement, client-like balance, wrong Wallet and changed accepted compensation fail closed',async()=>{
 for(const [path,patch,restore]of [['campaignPayments/'+paymentId,{stripeMode:'test'},{stripeMode:'live'}],['wallets/'+uid,{availableBalance:4},{availableBalance:3}],['wallets/'+uid,{ownerId:'other'},{ownerId:uid}],['assignmentCompensations/'+zoneId,{baseAmountCents:200},{baseAmountCents:300}],['campaignZones/'+zoneId,{reviewStatus:'submitted'},{reviewStatus:'approved'}]]){await db.doc(path).update(patch);await assert.rejects(runtime.request(uid,req));await db.doc(path).update(restore);}
 await db.doc('campaignSettlements/'+zoneId).delete();await assert.rejects(runtime.request(uid,req));assert.equal(calls.length,0);assert.equal((await db.collection('financialOperations').get()).size,0);
});
test('wrong Scaler, account substitution, over-available amount and unknown inputs denied',async()=>{
 await db.doc('users/other').set({role:'scaler',active:true});await assert.rejects(runtime.request('other',req));await assert.rejects(runtime.request(uid,{...req,amountCents:301}));await assert.rejects(runtime.request(uid,{...req,accountId:'acct_other'}));await db.doc('stripeConnectedAccounts/'+uid).update({scalerId:'other'});await assert.rejects(runtime.request(uid,req));assert.equal(calls.length,0);
});
test('concurrent double taps and differing request IDs for same in-flight amount reserve and execute once',async()=>{
 const results=await Promise.all([runtime.request(uid,req),runtime.request(uid,req),runtime.request(uid,{...req,requestId:'different_request_one'})]);assert.equal(new Set(results.map(r=>r.operationId)).size,1);assert.equal((await db.collection('financialOperations').get()).size,1);assert.equal(calls.filter(c=>c.kind==='transfer').length,1);assert.equal(calls.filter(c=>c.kind==='payout').length,1);assert.equal((await get('wallets/'+uid)).cashoutPendingCents,300);
});
test('insufficient provider funds retain reservation and resume without duplicate transfer',async()=>{
 controls.platformBalance=-69;const r=await runtime.request(uid,req);assert.equal(r.message,'Waiting for funds');assert.equal(calls.length,0);await runtime.sweep();assert.equal(calls.length,0);controls.platformBalance=1000;controls.connectedBalance=0;await runtime.sweep();assert.equal(calls.filter(c=>c.kind==='transfer').length,1);assert.equal(calls.filter(c=>c.kind==='payout').length,0);controls.connectedBalance=300;await runtime.sweep();await runtime.sweep();assert.equal(calls.length,2);
});
test('ambiguous transfer response never blindly creates again; provider receipt reconciliation recovers same operation',async()=>{
 controls.transferError='after';const r=await runtime.request(uid,req);assert.equal(r.status,'pending');assert.equal(calls.length,1);await runtime.reconcile(uid,{operationId:r.operationId});assert.equal(calls.length,1);await runtime.request(uid,req);assert.equal(calls.filter(c=>c.kind==='transfer').length,1);assert.equal(calls.filter(c=>c.kind==='payout').length,1);payouts.get('po_real').status='paid';await runtime.reconcile(uid,{operationId:r.operationId});assert.equal((await get('wallets/'+uid)).cashoutPaidCents,300);
});
test('unknown transfer with no provider receipt holds funds indefinitely rather than blind retry or unsafe release',async()=>{
 controls.transferError='before';const r=await runtime.request(uid,req);clock+=86400000;await runtime.request(uid,req);await runtime.sweep();assert.equal(calls.length,1);assert.equal((await get('wallets/'+uid)).cashoutPendingCents,300);assert.equal((await get('wallets/'+uid)).availableBalance,0);
});
test('definitive rejection before transfer releases once without changing earned compensation',async()=>{
 runtime.provider.createTransfer=async()=>{throw Object.assign(Error('provider declined'),{definitive:true});};const r=await runtime.request(uid,req);assert.equal(r.status,'failed');await runtime.request(uid,req);const w=await get('wallets/'+uid);assert.equal(w.availableBalance,3);assert.equal(w.cashoutPendingCents,0);assert.equal((await get('walletTransactions/'+earningId)).amountCents,300);
});
test('wrong LIVE receipt mode cannot finalize Wallet; payout failure preserves reserved funds',async()=>{
 controls.receiptLive=false;const r=await runtime.request(uid,req);assert.equal(calls.filter(c=>c.kind==='payout').length,0);assert.equal((await get('wallets/'+uid)).cashoutPaidCents,0);transfers.get('tr_real').livemode=true;controls.receiptLive=true;await runtime.request(uid,req);payouts.get('po_real').status='failed';await runtime.reconcile(uid,{operationId:r.operationId});assert.equal((await get('wallets/'+uid)).cashoutPendingCents,300);
});
test('signed payout webhook verifies account and LIVE mode; replay cannot double-debit',async()=>{
 const r=await runtime.request(uid,req);payouts.get('po_real').status='paid';const secret='whsec_offlinefixture';const event={id:'evt_paid',type:'payout.paid',livemode:true,account:accountId,data:{object:payouts.get('po_real')}};
 const send=async(e,sig)=>{const rawBody=Buffer.from(JSON.stringify(e)),signature=sig||stripe.webhooks.generateTestHeaderString({payload:rawBody.toString(),secret});return runtime.webhook({rawBody,signature,secret,scope:'connected'});};await assert.rejects(send(event,'bad'));await assert.rejects(send({...event,livemode:false}));await assert.rejects(send({...event,account:'acct_other'}));await send(event);assert.deepEqual(await send(event),{duplicate:true});assert.equal((await get('wallets/'+uid)).cashoutPaidCents,300);assert.equal(calls.length,2);assert.equal((await runtime.store.get(r.operationId,uid)).state,'completed');
});
test('normal Scaler cannot inspect or reconcile another Scaler; Admin read shows safe operation identity',async()=>{const r=await runtime.request(uid,req);await assert.rejects(runtime.adminList(uid));await assert.rejects(runtime.reconcile('other',{operationId:r.operationId}));const list=await runtime.adminList('admin');assert.equal(list.operations[0].scalerId,uid);assert.equal(JSON.stringify(list).includes('sk_live'),false);});

test('zero Wallet setup persists provider activation rejection without claiming an account',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).delete();await db.doc('wallets/'+uid).set({ownerId:uid,ownerType:'scaler',availableBalance:0});
 stripe.v2.core.accounts.create=async()=>{throw {statusCode:400,requestId:'req_activation',code:'account_create_activation_required'};};
 await assert.rejects(runtime.setup(uid),{code:'cashout_setup_provider_rejected'});
 const record=await get('stripeConnectedAccounts/'+uid);assert.equal(record.setupState,'rejected');assert.equal(record.setupFailure.providerRequestId,'req_activation');assert.equal(record.setupFailure.phase,'account_creation');assert.equal(record.stripeAccountId,undefined);
 assert.equal((await runtime.status(uid)).status,'setup_failed');assert.equal((await db.collection('financialOperations').get()).size,0);assert.equal((await get('wallets/'+uid)).availableBalance,0);
});
test('platform setup hold preserves the original failed attempt and blocks creation at zero balance',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).set({scalerId:uid,mode:'live',authorityVersion:VERSION,accountApi:'accounts_v2',setupStartedAt:clock-1000});
 const original=await get('stripeConnectedAccounts/'+uid);let creates=0;stripe.v2.core.accounts.create=async()=>{creates++;};
 const blocked=createRuntime({db,auth:{getUser:async()=>({emailVerified:true,disabled:false})},stripe,config:{...config,setupBlockedReason:'platform_activation_required'},now:()=>clock});
 const status=await blocked.status(uid);assert.equal(status.status,'setup_unavailable');assert.equal(status.setupRetryAllowed,false);await assert.rejects(blocked.setup(uid),{code:'cashout_setup_platform_blocked'});assert.equal(creates,0);assert.deepEqual(await get('stripeConnectedAccounts/'+uid),original);
});
test('unbound v2 replay uses the exact original key and parameters, never a second account',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).delete();await db.doc('wallets/'+uid).set({ownerId:uid,ownerType:'scaler',availableBalance:0});
 let attempts=0,unique=0,remembered;stripe.v2.core.accounts.list=async()=>({data:[],next_page_url:null});
 stripe.v2.core.accounts.create=async(parameters,options)=>{attempts++;if(!remembered){remembered={parameters,options};unique++;throw Error('response lost after creation');}assert.deepEqual(parameters,remembered.parameters);assert.deepEqual(options,remembered.options);return {id:accountId,livemode:true,metadata:{scalerId:uid,mode:'live',authorityVersion:VERSION}};};
 stripe.balanceSettings.update=async()=>{};stripe.v2.core.accountLinks={create:async()=>({url:'https://connect.stripe.com/setup/existing'})};
 await assert.rejects(runtime.setup(uid));clock+=60001;await runtime.setup(uid);await runtime.setup(uid);
 assert.equal(attempts,2);assert.equal(unique,1);assert.equal((await get('stripeConnectedAccounts/'+uid)).stripeAccountId,accountId);assert.equal((await get('wallets/'+uid)).availableBalance,0);assert.equal(calls.length,0);
});
test('concurrent setup requests cannot launch a second account creation',async()=>{
 await db.doc('stripeConnectedAccounts/'+uid).delete();let release,started;const began=new Promise(r=>started=r);const wait=new Promise(r=>release=r);let creates=0;
 stripe.v2.core.accounts.list=async()=>({data:[],next_page_url:null});stripe.v2.core.accounts.create=async()=>{creates++;started();await wait;return {id:accountId,livemode:true,metadata:{scalerId:uid,mode:'live',authorityVersion:VERSION}};};stripe.balanceSettings.update=async()=>{};stripe.v2.core.accountLinks={create:async()=>({url:'https://connect.stripe.com/setup/existing'})};
 const first=runtime.setup(uid);await began;await assert.rejects(runtime.setup(uid),{code:'cashout_setup_confirming'});release();await first;assert.equal(creates,1);
});
test('onboarding-link failure retains the bound account and retry resumes that account',async()=>{
 const original=await get('stripeConnectedAccounts/'+uid);await db.doc('stripeConnectedAccounts/'+uid).update({setupState:'onboarding_incomplete'});let creates=0,links=0;stripe.v2.core.accounts.create=async()=>{creates++;throw Error('unexpected');};stripe.balanceSettings.update=async()=>{};stripe.v2.core.accountLinks={create:async()=>{links++;if(links===1)throw Error('link unavailable');return {url:'https://connect.stripe.com/setup/existing'};}};
 await assert.rejects(runtime.setup(uid));assert.equal((await get('stripeConnectedAccounts/'+uid)).stripeAccountId,original.stripeAccountId);await runtime.setup(uid);assert.equal(creates,0);assert.equal(links,2);
});
