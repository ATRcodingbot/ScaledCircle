'use strict';

// Production launch uses read-only provider clients and a separate held liability
// ledger. It has no transfer, payout, worker Wallet or subscription writer.
const policy=require('./referral_liability'),program=require('./affiliate_program');
const contract=require('./subscription_contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
const millis=value=>value?.toMillis?.()||0;
function launchEnvironment(project,environment){
 if(!((project==='scaled-circle'&&environment==='production')||
      (project==='scaledcircle-staging'&&environment==='staging')||
      (project==='demo-referral-authority'&&environment==='staging'&&/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))))fail('referral_launch_environment_mismatch');
 return environment==='production'?'live':'test';
}
function manualPresentation(data,now){
 let pendingCents=0,heldCents=0;
 const history=(data.history||[]).map(row=>{
  const remaining=row.currentCents-row.paidCents;
  if(remaining>0){if(row.reviewAfterMillis<=now)heldCents+=remaining;else pendingCents+=remaining;}
  return {...row,status:row.status==='PAID'||['REVERSED','ADJUSTED'].includes(row.status)?row.status:row.reviewAfterMillis<=now?'UNDER_REVIEW':'PENDING'};
 });
 return {...data,history,pendingCents,heldCents,availableCents:0,executionEnabled:false,
  payoutAvailable:false,payoutMode:'manual_review',recipientReady:false,operations:[]};
}
function createService({db,FieldValue,Timestamp,auth,project,environment,stripe,planForPrice,now=Date.now}){
 const mode=launchEnvironment(project,environment),options={db,FieldValue,project,launchPolicy:policy.MANUAL_LAUNCH_POLICY,now};
 const ledger=policy.createLedger(options),affiliate=program.createAffiliateService({db,FieldValue,Timestamp});
 const workspace=require('./business_workspace').createWorkspaceService({db,FieldValue,Timestamp,auth});
 const business=require('./referral_business_reconciliation').createReconciler({...options,stripe,planForPrice});
 const scaler=require('./referral_scaler_reconciliation').createReconciler(options);
 async function actor(uid,{admin=false,signup=false}={}){
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid||''))fail('unauthenticated');
  const [identity,snapshot]=await Promise.all([auth.getUser(uid),db.doc('users/'+uid).get()]);
  const user=snapshot.data();if(identity.disabled||!user||user.disabled===true||(!signup&&!identity.emailVerified))fail('permission-denied');
  if(admin){if(user.role!=='admin')fail('permission-denied');return {uid,user,identity};}
  if(signup){if(!['business','scaler'].includes(user.role))fail('permission-denied');return {uid,user,identity};}
  let businessOwnerVerified=false;
  if(user.role==='business'){
   const a=await workspace.authority({uid,businessId:uid,allowExpired:true});businessOwnerVerified=a.isOwner===true;
   if(!businessOwnerVerified||user.signupPurpose==='team_invitation')fail('permission-denied');
  }else if(!program.isApprovedScaler(user))fail('permission-denied');
  return {uid,user,identity,businessOwnerVerified};
 }
 async function dashboard(uid){
  await actor(uid);const data=await affiliate.dashboard(uid,{financialLifecycle:true});
  return {...data,referralPayoutAvailable:false,payoutMode:'manual_review',referrals:(data.referrals||[]).map(r=>({
   ...r,availableCents:0,status:r.status==='AVAILABLE'?'UNDER_REVIEW':r.status==='EARNING'?'PENDING':r.status})),
   commissionSummary:{...data.commissionSummary,availableCents:0}};
 }
 async function join(uid,input){
  const a=await actor(uid);
  if(input?.termsVersion!==program.LAUNCH_TERMS_VERSION||Object.keys(input).some(k=>k!=='termsVersion'))fail('referral_terms_required');
  await affiliate.join({...a,acceptedTermsVersion:program.LAUNCH_TERMS_VERSION});
  await db.runTransaction(async tx=>{
   const ref=db.doc('scalerAffiliateProfiles/'+uid),p=await tx.get(ref);
   if(p.data()?.acceptedLaunchPolicyVersion===program.LAUNCH_TERMS_VERSION)return;
   tx.create(db.doc('referralPolicyAcceptances/'+uid+'_'+program.LAUNCH_TERMS_VERSION),{
    uid,version:program.LAUNCH_TERMS_VERSION,acceptedAt:FieldValue.serverTimestamp()});
   tx.update(ref,{acceptedLaunchPolicyVersion:program.LAUNCH_TERMS_VERSION,launchPolicyAcceptedAt:FieldValue.serverTimestamp()});
  });return dashboard(uid);
 }
 async function attribute(uid,role,input){
  const a=await actor(uid,{signup:true});
  if(a.user.role!==role||Object.keys(input||{}).some(k=>!['referralCode','capturedAtMillis'].includes(k)))fail('referral_signup_required');
  const existing=await db.doc((role==='business'?'businessReferralAttributions/':'scalerReferralAttributions/')+uid).get();
  if(existing.exists)return {attributed:true,reused:true};
  const created=Date.parse(a.identity.metadata?.creationTime),captured=Number(input?.capturedAtMillis);
  if(!Number.isFinite(created)||now()-created>30*86400000||created>now()+300000||captured>created+300000||!program.attributionIsFresh(captured,now()))fail('referral_new_signup_required');
  if(role==='scaler'){
   if(!(await db.collection('scalerTransfers').where('scalerId','==',uid).limit(1).get()).empty)fail('referral_prior_work');
   return affiliate.attributeScaler({scalerUid:uid,scalerUser:a.user,code:input.referralCode,capturedAtMillis:captured});
  }
  const [subscription,payments]=await Promise.all([db.doc('businessSubscriptions/'+uid).get(),db.collection('subscriptionPaymentReceipts').where('businessId','==',uid).limit(1).get()]);
  if(subscription.exists||!payments.empty)fail('referral_prior_membership');
  return affiliate.attributeBusiness({businessUid:uid,businessUser:a.user,code:input.referralCode,capturedAtMillis:captured});
 }
 async function reconcileExisting(){
  const rows=await db.collection('referralLiabilities').limit(401).get();if(rows.size>400)fail('referral_inventory_requires_review');
  const results=[];
  for(const d of rows.docs){const e=d.data();if(e.mode!==mode)fail('referral_ledger_mode_mismatch');
   results.push(e.type==='BUSINESS_SUBSCRIPTION_REFERRAL'?await business.reconcile(e.sourceId):await scaler.reconcile(e.sourceId));}
  return {checked:results.length};
 }
 async function event(eventId){
  if(!/^evt_[A-Za-z0-9]+$/.test(eventId||''))fail('referral_event_invalid');
  const ref=db.doc('stripeCampaignEvents/'+eventId),receipt=await ref.get(),proof=receipt.data();
  if(proof?.status!=='processed'||proof.eventId!==eventId||proof.stripeMode!==mode||proof.livemode!==(mode==='live'))fail('referral_signed_event_required');
  const supported=['invoice.paid','charge.refunded','refund.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','customer.subscription.updated','customer.subscription.deleted'];
  if(!supported.includes(proof.type))return {ignored:true};
  const providerEvent=await stripe.events.retrieve(eventId);contract.assertMode(providerEvent,environment);
  if(providerEvent.id!==eventId||providerEvent.type!==proof.type||providerEvent.account)fail('referral_signed_event_mismatch');
  if(proof.type!=='invoice.paid')return reconcileExisting();
  const invoiceId=providerEvent.data?.object?.id,paid=await db.doc('subscriptionPaymentReceipts/'+invoiceId).get(),p=paid.data();
  if(!p)return {ignored:true}; // Non-subscription invoice: no referral authority.
  if(p.eventId!==eventId||p.invoiceId!==invoiceId||p.stripeMode!==mode)fail('referral_subscription_receipt_mismatch');
  const relationship=await db.doc('businessReferralAttributions/'+p.businessId).get();
  if(!relationship.exists)return {status:'not_referred'};
  const out=await business.handleSignedEvent(providerEvent);
  return out;
 }
 async function reviewAdmin(uid,input){
  await actor(uid,{admin:true});
  if(!/^[a-f0-9]{64}$/.test(input?.rewardId||'')||!['review','hold'].includes(input.action)||
    typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>500||
    Object.keys(input).some(k=>!['rewardId','action','reason','expectedDigest'].includes(k)))fail('referral_review_invalid');
  const ref=ledger.ref(input.rewardId),old=(await ref.get()).data();if(!old)fail('referral_reward_missing');
  if(old.type==='BUSINESS_SUBSCRIPTION_REFERRAL')await business.reconcile(old.sourceId);else await scaler.reconcile(old.sourceId);
  return db.runTransaction(async tx=>{
   const record=await tx.get(ref),reward=record.data();
   if(reward.authorityDigest!==input.expectedDigest||reward.mode!==mode||reward.currentCents<=reward.paidCents||
     reward.reservedCents||reward.released||now()-reward.lastVerifiedAtMillis>60000)fail('referral_review_stale');
   await ledger.beneficiary(tx,reward.beneficiaryUid);
   const key=policy.hash(input.rewardId,input.action,reward.authorityDigest,uid),audit=db.doc('referralAdminReviews/'+key),prior=await tx.get(audit);
   if(!prior.exists)tx.create(audit,{rewardId:record.id,beneficiaryUid:reward.beneficiaryUid,actorUid:uid,action:input.action,
    reason:input.reason.trim(),verifiedCents:reward.currentCents-reward.paidCents,authorityDigest:reward.authorityDigest,
    reviewAfterMillis:reward.holdUntilMillis,mode,status:'UNDER_REVIEW',moneyMoved:false,createdAt:FieldValue.serverTimestamp()});
   return {reviewId:key,status:'UNDER_REVIEW',amountCents:reward.currentCents-reward.paidCents,
    paymentExecutionEnabled:false,nextStep:'An attended provider payout requires a separate verified recipient and financial checkpoint.'};
  });
 }
 return {actor,dashboard,join,attribute,event,reconcileExisting,reviewAdmin,
  async financials(uid){await actor(uid);return manualPresentation(await ledger.dashboard(uid),now());},
  async adminOverview(uid){await actor(uid,{admin:true});const rewards=await db.collection('referralLiabilities').limit(401).get();
   if(rewards.size>400)fail('referral_inventory_requires_review');
   const checks=await db.collection('referralLaunchChecks').where('status','==','under_review').limit(50).get();
   return {affiliates:await affiliate.adminOverview(),payoutAutomation:false,checks:checks.docs.map(d=>({id:d.id,...d.data()})),rewards:rewards.docs.map(d=>({
    rewardId:d.id,beneficiaryUid:d.data().beneficiaryUid,type:d.data().type,sourceId:d.data().sourceId,
    currentCents:d.data().currentCents,paidCents:d.data().paidCents,authorityDigest:d.data().authorityDigest,
    status:policy.state(d.data()),reviewAfterMillis:d.data().holdUntilMillis}))};},
  async setRate(uid,input){await actor(uid,{admin:true});
   if(Object.keys(input||{}).some(k=>!['affiliateUid','rateBps','reason'].includes(k)))fail('referral_review_invalid');
   return affiliate.setRate({...input,adminUid:uid});},
  async reconcileZone(zoneId){return scaler.reconcile(zoneId);},
 };
}
module.exports={launchEnvironment,manualPresentation,createService};
