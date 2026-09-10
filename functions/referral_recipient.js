'use strict';
const {createLedger,hash,assertRuntime}=require('./referral_liability');
const {assertRecipient}=require('./referral_payouts');
const {eligibility}=require('./scaler_cashout');
function createRecipientService({db,FieldValue,auth,stripe,provider,project,now=Date.now}){
  assertRuntime(project);const ledger=createLedger({db,FieldValue,project,now});
  const ref=uid=>db.doc('referralRecipients/'+uid);
  async function actor(uid){const account=await auth.getUser(uid);
    if(account.disabled||!account.emailVerified)throw Error('referral_identity_not_ready');
    const kind=await db.runTransaction(tx=>ledger.beneficiary(tx,uid));return {...kind,email:account.email};}
  async function current(uid){
    const who=await actor(uid);let record=(await ref(uid).get()).data();
    if(!record?.stripeAccountId && who.role==='scaler'){
      const maintained=(await db.doc('stripeConnectedAccounts/'+uid).get()).data();
      if(maintained){
        if(maintained.scalerId!==uid||maintained.mode!=='test'||!/^acct_/.test(maintained.stripeAccountId||''))throw Error('referral_existing_recipient_requires_review');
        await provider.getAccount(maintained.stripeAccountId);
        record={beneficiaryUid:uid,beneficiaryType:'scaler',mode:'test',stripeAccountId:maintained.stripeAccountId,reusedMaintainedRecipient:true};
        await db.runTransaction(async tx=>{const old=await tx.get(ref(uid));
          if(old.data()?.stripeAccountId && old.data().stripeAccountId!==record.stripeAccountId)throw Error('referral_recipient_conflict');
          if(!old.data()?.stripeAccountId)tx.set(ref(uid),{...record,createdAt:FieldValue.serverTimestamp()});});
      }
    }
    if(!record?.stripeAccountId)return {status:'not_setup',beneficiaryType:who.role};
    assertRecipient(record,uid);
    if(record.beneficiaryType!==who.role)throw Error('referral_recipient_role_mismatch');
    const state=eligibility(await provider.getAccount(record.stripeAccountId),record.stripeAccountId);
    return {...state,record,beneficiaryType:who.role};
  }
  async function setup(uid){
    const who=await actor(uid),dashboard=await ledger.dashboard(uid);
    if(!dashboard.history.length)throw Error('referral_earnings_required_for_onboarding');
    let status=await current(uid),accountId=status.record?.stripeAccountId;
    if(!accountId){
      const started=await db.runTransaction(async tx=>{const old=await tx.get(ref(uid));if(old.data()?.stripeAccountId)return old.data();
        if(old.exists)return old.data();const value={beneficiaryUid:uid,beneficiaryType:who.role,mode:'test',setupStartedAt:now()};tx.create(ref(uid),value);return value;});
      accountId=started.stripeAccountId;
      if(!accountId){
        if(started.beneficiaryUid!==uid||started.mode!=='test'||now()-started.setupStartedAt>20*3600000)throw Error('referral_recipient_reconciliation_required');
        const account=await stripe.v2.core.accounts.create({contact_email:who.email,dashboard:'express',identity:{country:'us'},
          defaults:{currency:'usd',responsibilities:{fees_collector:'application',losses_collector:'application'}},
          configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
          metadata:{beneficiaryUid:uid,purpose:'referral_payout',mode:'test'},include:['configuration.recipient']},
          {idempotencyKey:'referral-recipient-v1:'+hash(uid)});
        if(account.livemode!==false||account.metadata?.beneficiaryUid!==uid||account.metadata?.purpose!=='referral_payout')throw Error('referral_recipient_mismatch');
        accountId=account.id;
        const record={beneficiaryUid:uid,beneficiaryType:who.role,mode:'test',stripeAccountId:accountId};assertRecipient(record,uid);
        await db.runTransaction(async tx=>{const old=await tx.get(ref(uid));if(old.data()?.stripeAccountId&&old.data().stripeAccountId!==accountId)throw Error('referral_recipient_conflict');
          tx.set(ref(uid),{...record,createdAt:FieldValue.serverTimestamp()},{merge:true});});
        await stripe.balanceSettings.update({payments:{payouts:{schedule:{interval:'manual'}}}},
          {stripeAccount:accountId,idempotencyKey:'referral-manual:'+accountId});
      }
    }
    // Reused worker recipients keep their existing payout schedule/configuration.
    // A non-manual recipient requires review, never a silent change.
    const link=await stripe.v2.core.accountLinks.create({account:accountId,use_case:{type:'account_onboarding',
      account_onboarding:{configurations:['recipient'],refresh_url:'https://scaledcircle-staging.web.app/#/referral-portal',
        return_url:'https://scaledcircle-staging.web.app/#/referral-portal'}}});
    const url=new URL(link.url);if(url.protocol!=='https:'||url.hostname!=='connect.stripe.com')throw Error('referral_onboarding_url_invalid');
    return {url:url.href};
  }
  return {current,setup,actor};
}
module.exports={createRecipientService};
