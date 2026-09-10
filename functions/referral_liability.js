'use strict';

// Referral liabilities are platform obligations. No worker Wallet, campaign
// reserve or subscription balance is written by this adapter.
const crypto = require('node:crypto');
const VERSION = 'ReferralLiabilityV1';
const TERMS = 'referral-launch-v2-2026-09-10';
const DAY = 86400000;
const TYPES = Object.freeze({BUSINESS_SUBSCRIPTION_REFERRAL:{bps:1000,days:30},
  SCALER_COMPLETED_WORK_REFERRAL:{bps:100,days:7}});
const hash = (...v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = code => { throw Object.assign(new Error(code),{code}); };
const cents = n => { if(!Number.isSafeInteger(n)||n<0) fail('referral_amount_invalid'); return n; };
const reward = (basis,bps) => Number((BigInt(cents(basis))*BigInt(bps)+5000n)/10000n);
const money = n => `$${(n/100).toFixed(2)}`;
function assertRuntime(project) {
  if(project!=='scaledcircle-staging' && !(project==='demo-referral-authority' &&
    /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))) fail('referral_staging_only');
}
function summary(entries) {
  let pendingCents=0,availableCents=0,paidCents=0,reservedCents=0;
  for(const e of entries){
    for(const key of ['currentCents','paidCents','reservedCents']) cents(e[key]);
    const net=e.currentCents-e.paidCents-e.reservedCents;
    if(e.released || net<0) availableCents+=net; else pendingCents+=net;
    paidCents+=e.paidCents;reservedCents+=e.reservedCents;
  }
  return {pendingCents,availableCents,paidCents,reservedCents,cashoutMinimumCents:1000};
}
function state(e) {
  if(e.currentCents<e.grossCents) return e.currentCents===0?'REVERSED':'ADJUSTED';
  if(e.reservedCents) return 'PAYOUT_PENDING';
  if(e.paidCents===e.currentCents && e.paidCents>0) return 'PAID';
  return e.released?'AVAILABLE':'PENDING';
}
function createLedger({db,FieldValue,project,now=Date.now}) {
  assertRuntime(project);
  const ref=id=>db.doc('referralLiabilities/'+id), balance=uid=>db.doc('referralBalances/'+uid);
  const stamp=()=>FieldValue.serverTimestamp();
  async function beneficiary(tx,uid) {
    const [u,f,w]=await Promise.all([tx.get(db.doc('users/'+uid)),tx.get(db.doc('scalerAffiliateProfiles/'+uid)),tx.get(db.doc('businessWorkspaces/'+uid))]);
    const user=u.data(),affiliate=f.data();
    if(!user || user.disabled===true || affiliate?.status!=='active' || affiliate.acceptedLaunchPolicyVersion!==TERMS)
      fail('referral_beneficiary_ineligible');
    const scaler=require('./affiliate_program').isApprovedScaler(user);
    const owner=user.role==='business' && user.signupPurpose!=='team_invitation' &&
      (!user.activeBusinessId || user.activeBusinessId===uid) &&
      (!w.exists || !w.data().ownerId || w.data().ownerId===uid) &&
      (user.active===true || user.betaAccess==='approved');
    if(!scaler && !owner) fail('referral_beneficiary_ineligible');
    return {role:owner?'business_owner':'scaler'};
  }
  async function entries(tx,uid) {
    const snapshot=await tx.get(db.collection('referralLiabilities').where('beneficiaryUid','==',uid).limit(401));
    if(snapshot.size>400) fail('referral_history_requires_review');
    return snapshot.docs.map(d=>({id:d.id,...d.data()}));
  }
  function milestone(tx,key,uid,type,amountCents,extra={}) {
    const id=hash(VERSION,key,type), titles={earned:'Referral reward earned',available:'Referral reward available',
      paid:'Referral payment sent',adjusted:'Referral adjustment'};
    const messages={earned:`You earned ${money(amountCents)} from qualifying referral activity. It is pending its settlement hold.`,
      available:`${money(amountCents)} is now available in your referral balance. Cash out once your available balance reaches $10.`,
      paid:`Your referral payment of ${money(amountCents)} was sent.`,
      adjusted:`A previously qualifying economic event changed. Your referral balance was ${amountCents<0?'reduced':'increased'} by ${money(Math.abs(amountCents))}.`};
    const body={beneficiaryUid:uid,type,amountCents,title:titles[type],message:messages[type],...extra,createdAt:stamp()};
    tx.create(db.doc('referralMilestones/'+id),body);
    if(!extra.notificationAlreadyCreated)tx.create(db.doc('notifications/referral_'+id),{userId:uid,type:'referral_'+type,title:body.title,message:body.message,
      deepLink:{destination:'referrals'},read:false,createdAt:stamp()});
  }
  async function reconcile(e,{claimRef,claimToken,expectedDocuments=[]}={}) {
    const spec=TYPES[e.type];
    if(!spec || !e.beneficiaryUid || !e.referredId || !e.relationshipId || !e.sourceId ||
      !Number.isSafeInteger(e.paidAtMillis)||e.paidAtMillis<=0||e.paidAtMillis>now() ||
      !e.authorityDigest || e.currentBasisCents>e.grossBasisCents) fail('referral_economic_binding_invalid');
    const grossCents=reward(e.grossBasisCents,spec.bps),currentCents=reward(e.currentBasisCents,spec.bps);
    const id=hash(VERSION,e.type,e.sourceId);
    return db.runTransaction(async tx=>{
      const [doc,b,claim]=await Promise.all([tx.get(ref(id)),tx.get(balance(e.beneficiaryUid)),claimRef?tx.get(claimRef):null]);
      for(const expected of expectedDocuments){const current=await tx.get(expected.ref);
        if(current.exists!==expected.exists || (current.exists && !current.updateTime.isEqual(expected.updateTime)))fail('referral_stale_economic_read');}
      if(claimRef && (claim?.data()?.token!==claimToken || claim.data().until<now())) fail('referral_stale_economic_read');
      const prior=doc.data();
      if(!prior && grossCents===0) return {status:'no_reward'};
      if(prior && ['beneficiaryUid','referredId','relationshipId','sourceId','type','grossBasisCents','paidAtMillis']
        .some(k=>prior[k]!==e[k])) fail('referral_immutable_binding_changed');
      if(!prior){await beneficiary(tx,e.beneficiaryUid);}
      // A fresh authoritative economic read may adjust net liability. It never
      // rewrites the gross earning, prior payout or original paid receipt.
      if(prior?.authorityDigest===e.authorityDigest && prior.currentCents===currentCents){
        tx.update(ref(id),{lastVerifiedAtMillis:now()});
        tx.set(balance(e.beneficiaryUid),{revision:(b.data()?.revision||0)+1},{merge:true});
        return {id,status:state(prior),duplicate:true};
      }
      const revision=(prior?.revision||0)+1;
      const next=prior?{...prior,currentCents,authorityDigest:e.authorityDigest,revision,reason:e.reason||null,
        lastVerifiedAtMillis:now()}:{...e,id,version:VERSION,mode:'test',currency:'usd',rateBps:spec.bps,grossCents,currentCents,
        paidCents:0,reservedCents:0,released:false,holdUntilMillis:e.paidAtMillis+spec.days*DAY,
        fundingSource:'scaledcircle_platform_economics',revision,lastVerifiedAtMillis:now(),createdAt:stamp()};
      tx.set(ref(id),next);tx.set(balance(e.beneficiaryUid),{revision:(b.data()?.revision||0)+1,updatedAt:stamp()},{merge:true});
      if(!prior){
        tx.create(ref(id).collection('journal').doc('earned'),{action:'earned',amountCents:grossCents,
          debit:'platformReferralExpense',credit:'referralHeldLiability',at:stamp(),authorityDigest:e.authorityDigest});
        milestone(tx,id,e.beneficiaryUid,'earned',grossCents,{holdUntilMillis:next.holdUntilMillis,
          notificationAlreadyCreated:!!e.sourceNotificationId});
      }
      const delta=currentCents-(prior?.currentCents??grossCents);
      if(delta){
        tx.create(ref(id).collection('journal').doc('adjustment_'+revision),{action:'adjusted',amountCents:Math.abs(delta),deltaCents:delta,
          debit:delta<0?'referralLiability':'platformReferralExpense',credit:delta<0?'platformReferralExpense':'referralLiability',
          afterPayout:(prior?.paidCents||0)>0,authorityDigest:e.authorityDigest,at:stamp()});
        milestone(tx,id+'_'+revision,e.beneficiaryUid,'adjusted',delta);
      }
      return {id,status:state(next),currentCents};
    });
  }
  async function release(id,{providerHealthy,authorityDigest}) {
    if(providerHealthy!==true) fail('referral_recipient_not_ready');
    return db.runTransaction(async tx=>{
      const doc=await tx.get(ref(id)),e=doc.data();if(!e)fail('referral_reward_missing');
      await beneficiary(tx,e.beneficiaryUid);const b=await tx.get(balance(e.beneficiaryUid));
      if(e.authorityDigest!==authorityDigest || now()-e.lastVerifiedAtMillis>60000)fail('referral_release_recheck_required');
      if(e.released || e.currentCents===0 || now()<e.holdUntilMillis)return {released:e.released===true};
      tx.update(ref(id),{released:true,releasedAt:stamp()});
      tx.create(ref(id).collection('journal').doc('released'),{action:'released',amountCents:e.currentCents,
        debit:'referralHeldLiability',credit:'referralAvailableLiability',at:stamp()});
      tx.set(balance(e.beneficiaryUid),{revision:(b.data()?.revision||0)+1,updatedAt:stamp()},{merge:true});
      milestone(tx,id,e.beneficiaryUid,'available',e.currentCents);
      return {released:true};
    });
  }
  async function dashboard(uid){return db.runTransaction(async tx=>{
    await beneficiary(tx,uid);const list=await entries(tx,uid);
    return {...summary(list),history:list.map((e,i)=>({displayId:'Referral reward '+(i+1),type:e.type,
      status:state(e),grossCents:e.grossCents,currentCents:e.currentCents,paidCents:e.paidCents,
      adjustmentCents:e.currentCents-e.grossCents,expectedAvailabilityMillis:e.holdUntilMillis})),
      payoutAvailable:true};
  });}
  return {reconcile,release,dashboard,beneficiary,entries,balance,ref,milestone};
}
module.exports={VERSION,TERMS,TYPES,DAY,hash,cents,reward,summary,state,assertRuntime,createLedger};
