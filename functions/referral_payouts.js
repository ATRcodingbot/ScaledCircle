'use strict';
const core=require('./scaler_cashout');
const {createLedger,hash,summary,cents,assertRuntime}=require('./referral_liability');
const KIND='referral_cashout_v1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function assertRecipient(record,uid){
  if(record?.beneficiaryUid!==uid || !['scaler','business_owner'].includes(record.beneficiaryType) ||
    record.mode!=='test' || !/^acct_[A-Za-z0-9]+$/.test(record.stripeAccountId||'')) fail('referral_recipient_mismatch');
}
function createStore({db,FieldValue,project,now=Date.now,signedPayout=null}) {
  assertRuntime(project);const ledger=createLedger({db,FieldValue,project,now});
  const opRef=id=>db.doc('financialOperations/'+id),recipient=uid=>db.doc('referralRecipients/'+uid);
  const stamp=()=>FieldValue.serverTimestamp();
  function check(op,uid){if(op?.kind!==KIND||op.ownerId!==uid||op.mode!=='test')fail('referral_operation_mismatch');}
  function audit(tx,op,action){tx.create(opRef(op.id).collection('audit').doc(String(op.version)),{
    action,state:op.state,amountCents:op.amountCents,at:stamp(),version:op.version,
    ...(signedPayout?{signedEventId:signedPayout.eventId}:{}),kind:KIND});}
  async function get(id,uid){const op=(await opRef(id).get()).data();check(op,uid);return op;}
  return {
    get,async lookup(id){const op=(await opRef(id).get()).data();check(op,op?.ownerId);return op;},
    async request(uid,requestId,amountCents,accountId){
      if(!/^[A-Za-z0-9_-]{16,80}$/.test(requestId||'')||cents(amountCents)<1000)fail('referral_cashout_minimum');
      const id='referral_'+hash(KIND,uid,requestId);
      return db.runTransaction(async tx=>{
        await ledger.beneficiary(tx,uid);
        const [r,existing,b,list]=await Promise.all([tx.get(recipient(uid)),tx.get(opRef(id)),tx.get(ledger.balance(uid)),ledger.entries(tx,uid)]);
        assertRecipient(r.data(),uid);if(r.data().stripeAccountId!==accountId)fail('referral_recipient_mismatch');
        if(existing.exists){const e=existing.data();check(e,uid);if(e.accountId!==accountId||e.amountCents!==amountCents)fail('referral_request_conflict');return e;}
        const totals=summary(list);
        if(totals.reservedCents>0)fail('referral_payout_already_pending');
        if(totals.availableCents<amountCents)fail('referral_insufficient_available');
        if(list.some(e=>e.released && now()-e.lastVerifiedAtMillis>60000))fail('referral_economics_recheck_required');
        let remaining=amountCents;const allocations=[];
        for(const e of list.sort((a,b)=>a.id.localeCompare(b.id))){
          if(!e.released)continue;const available=e.currentCents-e.paidCents-e.reservedCents;
          const amount=Math.min(Math.max(0,available),remaining);if(!amount)continue;
          allocations.push({rewardId:e.id,amountCents:amount,authorityDigest:e.authorityDigest});remaining-=amount;
        }
        if(remaining)fail('referral_allocation_invalid');
        const op={id,kind:KIND,ownerId:uid,beneficiaryType:r.data().beneficiaryType,accountId,amountCents,
          allocations,mode:'test',currency:'usd',state:'reserved',version:1,createdAt:now(),
          transferId:null,payoutId:null,payoutAttempt:1,leaseUntil:0};
        for(const a of allocations){
          tx.update(ledger.ref(a.rewardId),{reservedCents:FieldValue.increment(a.amountCents)});
          tx.create(ledger.ref(a.rewardId).collection('journal').doc(id+'_reserved'),{action:'reserved',amountCents:a.amountCents,
            payoutOperationId:id,debit:'referralAvailableLiability',credit:'referralReservedLiability',at:stamp()});
        }
        tx.set(ledger.balance(uid),{revision:(b.data()?.revision||0)+1,updatedAt:stamp()},{merge:true});
        tx.create(opRef(id),op);audit(tx,op,'reserved');return op;
      });
    },
    async claim(id,uid,readOnly=false){return db.runTransaction(async tx=>{
      const [snapshot,r,b,list]=await Promise.all([tx.get(opRef(id)),tx.get(recipient(uid)),tx.get(ledger.balance(uid)),ledger.entries(tx,uid)]);
      const op=snapshot.data();check(op,uid);assertRecipient(r.data(),uid);
      if(r.data().stripeAccountId!==op.accountId)fail('referral_recipient_mismatch');
      if(['failed','reversed'].includes(op.state)||(op.state==='completed'&&op.settled)||op.leaseUntil>now())return null;
      if(!readOnly){
        await ledger.beneficiary(tx,uid);if(summary(list).availableCents<0)fail('referral_adjustment_requires_review');
        if(op.allocations.some(a=>{const e=list.find(e=>e.id===a.rewardId);
          return !e||e.currentCents-e.paidCents<a.amountCents||e.reservedCents<a.amountCents;}))fail('referral_reserved_source_adjusted');
      }
      const claimed={...op,version:op.version+1,leaseUntil:now()+120000};
      tx.set(opRef(id),claimed);tx.set(ledger.balance(uid),{revision:(b.data()?.revision||0)+1},{merge:true});audit(tx,claimed,'claimed');return claimed;
    });},
    async save(claim,patch,movement='none'){return db.runTransaction(async tx=>{
      const [snapshot,b,docs]=await Promise.all([tx.get(opRef(claim.id)),tx.get(ledger.balance(claim.ownerId)),
        Promise.all(claim.allocations.map(a=>tx.get(ledger.ref(a.rewardId))))]);
      const op=snapshot.data();check(op,claim.ownerId);if(op.version!==claim.version)fail('cashout_stale_claim');
      if(movement==='paid' && !(signedPayout?.payoutId===patch.payoutId && signedPayout.accountId===op.accountId &&
          /^evt_[A-Za-z0-9]+$/.test(signedPayout.eventId||''))){
        movement='none';patch={...patch,state:'awaiting_signed_reconciliation'};
      }
      if(!['none','release','paid'].includes(movement))fail('referral_movement_invalid');
      if(movement!=='none'){
        if(op.settled)fail('referral_already_settled');
        op.allocations.forEach((a,i)=>{
          const e=docs[i].data();if(e?.beneficiaryUid!==op.ownerId||e.reservedCents<a.amountCents)fail('referral_reservation_mismatch');
        });
        op.allocations.forEach(a=>{
          tx.update(ledger.ref(a.rewardId),{reservedCents:FieldValue.increment(-a.amountCents),
            ...(movement==='paid'?{paidCents:FieldValue.increment(a.amountCents)}:{})});
          tx.create(ledger.ref(a.rewardId).collection('journal').doc(op.id+'_'+movement),{
            action:movement,amountCents:a.amountCents,payoutOperationId:op.id,
            debit:'referralReservedLiability',credit:movement==='paid'?'platformCash':'referralAvailableLiability',at:stamp()});
        });
        if(movement==='paid')ledger.milestone(tx,op.id,op.ownerId,'paid',op.amountCents);
      }
      const next={...op,...patch,id:op.id,kind:op.kind,ownerId:op.ownerId,accountId:op.accountId,
        amountCents:op.amountCents,allocations:op.allocations,mode:'test',currency:'usd',createdAt:op.createdAt,
        version:op.version+1,...(movement!=='none'?{settled:true}:{}),
        ...(movement==='paid'?{paidEventId:signedPayout.eventId,paidAt:stamp()}:{} )};
      tx.set(opRef(op.id),next);tx.set(ledger.balance(op.ownerId),{revision:(b.data()?.revision||0)+1,updatedAt:stamp()},{merge:true});
      audit(tx,next,'updated');return next;
    });},
    async event(eventId,action){
      if(!/^evt_[A-Za-z0-9]+$/.test(eventId||''))fail('referral_event_invalid');
      const ref=db.doc('referralPayoutEvents/'+eventId),token=hash(eventId,now(),Math.random());
      const acquired=await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.data()?.done)return false;
        if(s.data()?.until>now())fail('referral_event_busy');
        tx.set(ref,{token,until:now()+120000,done:false});return true;});
      if(!acquired)return {duplicate:true};
      try{await action();await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.token===token)tx.update(ref,{done:true,until:0});});}
      catch(error){await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.token===token)tx.update(ref,{until:0});});throw error;}
      return {received:true};
    },
  };
}
function createService(options){const store=createStore(options);
  return {store,service:core.createService({...options,store,assertRecipient})};}
module.exports={KIND,assertRecipient,createStore,createService};
