'use strict';
const {getApps,initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret}=require('firebase-functions/params');
const {createService,launchEnvironment}=require('./referral_launch');
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(),db=getFirestore(app),auth=getAuth(app);
const production=process.env.APP_ENV==='production';
const stripeKey=defineSecret(production?'STRIPE_LIVE_SECRET_KEY':'STRIPE_TEST_SECRET_KEY');
const planIds=production?Object.keys(require('./subscription_contract').ITEMS):['starter','growth','scale','managed_growth'];
const prices=Object.fromEntries(planIds.map(id=>[id,defineSecret('STRIPE_'+id.toUpperCase()+'_PRICE_ID')]));
const secrets=[stripeKey,...Object.values(prices)];
const options={region:'us-east1',maxInstances:2,timeoutSeconds:120};
function service(economics=false){
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT,environment=process.env.APP_ENV;
 launchEnvironment(project,environment);
 let stripe;
 if(economics){
  const key=require('./subscription_contract').credential(stripeKey.value(),environment);
  const client=new(require('stripe'))(key,{timeout:10000,maxNetworkRetries:0});
  // Expose only the exact provider reads used for retained-revenue calculation.
  stripe=Object.fromEntries(Object.entries({events:['retrieve'],invoices:['retrieve'],subscriptions:['retrieve'],prices:['retrieve'],products:['retrieve'],
   invoicePayments:['list'],paymentIntents:['retrieve'],charges:['retrieve'],refunds:['list'],disputes:['list'],creditNotes:['list']})
   .map(([resource,methods])=>[resource,Object.fromEntries(methods.map(method=>[method,(...args)=>client[resource][method](...args)]))]));
 }
 return createService({db,FieldValue,Timestamp,auth,project,environment,stripe,
  planForPrice:id=>Object.keys(prices).find(plan=>prices[plan].value()===id)});
}
function callable(method,{economic=false,argument=false}={}){
 return onCall({...options,...(economic?{secrets}:{})},async request=>{
  try{return await service(economic)[method](request.auth?.uid,...(argument?[request.data||{}]:[]));}
  catch(error){
   const code=['unauthenticated','permission-denied'].includes(error.code)?error.code:'failed-precondition';
   console.warn('Referral action held',{action:method,code:/^[a-z_-]{1,100}$/.test(error.code||'')?error.code:'verification_required'});
   throw new HttpsError(code,code==='unauthenticated'?'Sign in to use Referrals.':code==='permission-denied'?'This referral action is not available for this account.':'This referral action needs review. Refresh your referral status or contact support.');
  }
 });
}
exports.getReferralPortalV1=callable('dashboard');
exports.joinReferralProgramV1=callable('join',{argument:true});
exports.getReferralFinancialsV1=callable('financials');
exports.getScalerAffiliateDashboard=callable('dashboard');
exports.joinScalerAffiliateProgram=callable('join',{argument:true});
exports.adminGetScalerAffiliateOverview=callable('adminOverview');
exports.adminSetScalerAffiliateRate=callable('setRate',{argument:true});
exports.adminReviewReferralRewardV1=callable('reviewAdmin',{argument:true,economic:true});
for(const role of ['Business','Scaler'])exports['record'+role+'ReferralAttribution']=onCall(options,async request=>{
 try{return await service().attribute(request.auth?.uid,role.toLowerCase(),request.data||{});}
 catch(_){throw new HttpsError('failed-precondition','This referral could not be attributed. Existing referral history is unchanged.');}
});
async function trackFailure(key,work){
 try{const result=await work();await db.doc('referralLaunchChecks/'+key).set({status:'checked',checkedAt:FieldValue.serverTimestamp()});return result;}
 catch(error){
  const code=/^[a-z_]{1,100}$/.test(error.code||'')?error.code:'authority_unavailable';
  await db.doc('referralLaunchChecks/'+key).set({status:'under_review',code,checkedAt:FieldValue.serverTimestamp()});
  throw error;
 }
}
exports.reconcileReferralSubscriptionEventV1=onDocumentWritten({...options,secrets,document:'stripeCampaignEvents/{eventId}',retry:true},async event=>{
 const d=event.data?.after;if(!d?.exists||d.data()?.status!=='processed')return;
 if(!['invoice.paid','charge.refunded','refund.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','customer.subscription.updated','customer.subscription.deleted'].includes(d.data().type))return;
 return trackFailure('event_'+event.params.eventId,()=>service(true).event(event.params.eventId));
});
exports.reconcileReferralWorkSettlementV1=onDocumentWritten({...options,document:'campaignSettlements/{zoneId}',retry:true},event=>
 trackFailure('work_'+event.params.zoneId,()=>service().reconcileZone(event.params.zoneId)));
exports.reconcileReferralWorkEarningV1=onDocumentWritten({...options,document:'walletTransactions/{earningId}',retry:true},async event=>{
 const data=event.data?.after?.exists?event.data.after.data():event.data?.before?.data();
 if(data?.zoneId)return trackFailure('work_'+data.zoneId,()=>service().reconcileZone(data.zoneId));
});
exports.recheckReferralLiabilitiesV1=onSchedule({...options,secrets,schedule:'every 30 minutes',retryCount:0},async()=>{
 const result=await trackFailure('retained_economics',()=>service(true).reconcileExisting());
 // Recheck failed signed events without replaying all historical paid work.
 const failed=await db.collection('referralLaunchChecks').where('status','==','under_review').limit(20).get();
 for(const doc of failed.docs)if(doc.id.startsWith('event_evt_')){
  try{await trackFailure(doc.id,()=>service(true).event(doc.id.slice(6)));}catch(_){/* remains visible to Admin */}
 }
 return result;
});
