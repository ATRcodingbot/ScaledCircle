'use strict';

const {
  fail,
  id,
  cents,
  projection
} = require('./scaler_cashout_shared');
const KIND = 'scaler_cashout_v1',
  VERSION = 'ProductionApprovedEarningCashoutV1';
const sid = value => {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(value || '')) fail('cashout_source_invalid');
  return value;
};
const money = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fail('cashout_wallet_unverified');
  return cents(Math.round(value * 100));
};
function assertAccount(r, uid) {
  if (r?.scalerId !== uid || r.mode !== 'live' || r.authorityVersion !== VERSION || r.accountApi !== 'accounts_v2' || !/^acct_[A-Za-z0-9]+$/.test(r.stripeAccountId || '')) fail('cashout_account_mismatch');
}
function createStore(db, now = Date.now) {
  const opRef = key => db.doc('financialOperations/' + sid(key)),
    walletRef = uid => db.doc('wallets/' + sid(uid));
  const validOp = (op, uid) => {
    if (!op || op.kind !== KIND || op.mode !== 'live' || op.authorityVersion !== VERSION || uid && op.ownerId !== uid) fail('cashout_operation_mismatch');
    return op;
  };
  async function owner(tx, uid) {
    const u = (await tx.get(db.doc('users/' + sid(uid)))).data();
    if (u?.role !== 'scaler' || u.disabled === true || u.accountStatus === 'closing' || u.accountStatus === 'deleted' || !(u.active === true || u.betaAccess === 'approved')) fail('cashout_scaler_required');
  }
  async function available(tx, uid, recoveryPreparation = false) {
    await owner(tx, uid);
    const [w, rows] = await Promise.all([tx.get(walletRef(uid)), tx.get(walletRef(uid).collection('transactions').limit(501))]);
    const wallet = w.data();
    if (!wallet) return {
      wallet: null,
      availableCents: 0,
      pendingCents: 0,
      paidCents: 0,
      sources: []
    };
    if (wallet.ownerId !== uid || wallet.ownerType !== 'scaler' || wallet.cashoutMode === 'test' || wallet.settlementFrozen === true || rows.size > 500) fail('cashout_wallet_unverified');
    const sources = [];
    let earned = 0,
      reserved = 0,
      paid = 0;
    for (const row of rows.docs) {
      const e = row.data();
      if (e.type === 'withdrawal') {
        if (e.mode !== 'live' || e.authorityVersion !== VERSION) fail('cashout_historical_withdrawal_review');
        continue;
      }
      if (e.type !== 'scaler_earnings') continue;
      if (e.mode === 'test' || e.currency !== 'usd' || e.status !== 'available' || e.scalerId !== uid || e.walletSide !== 'scaler' || e.amountCents !== money(e.amount) || e.amountCents <= 0) fail('cashout_earning_unverified');
      const zoneId = sid(e.zoneId),
        campaignId = sid(e.campaignId),
        transferId = sid(e.transferOperationId);
      if (row.id !== `earning_${zoneId}_v1`) fail('cashout_earning_unverified');
      const refs = [db.doc('walletTransactions/' + row.id), db.doc('campaignZones/' + zoneId), db.doc('campaigns/' + campaignId), db.doc('assignmentCompensations/' + zoneId), db.doc('campaignSettlements/' + zoneId), db.doc('scalerTransfers/' + transferId), db.doc('scalerCashoutAllocations/' + row.id)];
      const [g, z, c, a, s, t, allocated] = (await Promise.all(refs.map(r => tx.get(r)))).map(x => x.data());
      if (!g || id(g) !== id(e) || !z || !c || !a || !s || !t) fail('cashout_earning_source_missing');
      if (z.assignedScalerId !== uid || z.campaignId !== campaignId || z.businessId !== e.businessId || z.status !== 'completed' || z.reviewStatus !== 'approved' || !z.reviewedBy || !z.reviewFinalizedAt || z.approvedTransferAmountCents !== e.amountCents || z.settlementBlocked === true || z.disputeOpen === true) fail('cashout_approval_unverified');
      if (c.businessId !== e.businessId || (c.fundingStatus !== 'funded' && !recoveryPreparation && !allocated?.recoveryFundingId) || c.environment === 'staging' || c.stripeMode === 'test' || c.qaIsolation === true || c.stagingOnly === true) fail('cashout_campaign_unverified');
      if (a.immutable !== true || a.zoneId !== zoneId || a.campaignId !== campaignId || a.scalerId !== uid || a.businessId !== e.businessId || a.currency !== 'usd' || !(a.acceptedAtMs || a.acceptedAt) || cents(a.baseAmountCents) < cents(z.approvedBaseAmountCents) || cents(a.bonusAmountCents || 0) < cents(z.approvedBonusAmountCents || 0) || z.approvedBaseAmountCents + (z.approvedBonusAmountCents || 0) !== e.amountCents) fail('cashout_contract_unverified');
      if (s.policyVersion !== 'EarnedWorkReserveReturnV1' || s.scalerId !== uid || s.zoneId !== zoneId || s.campaignId !== campaignId || s.businessId !== e.businessId || s.earnedWorkerCents !== e.amountCents || s.actorUid !== z.reviewedBy || !s.createdAt || !['ordinary_review', 'partial_settlement', 'completed_task_review'].includes(s.source)) fail('cashout_settlement_unverified');
      if (t.scalerId !== uid || t.zoneId !== zoneId || t.campaignId !== campaignId || t.businessId !== e.businessId || t.paymentId !== s.paymentId || t.amountCents !== e.amountCents || t.externalExecutionAuthorized !== false || t.stripeTransferId || !['transfer_pending', 'cashout_completed'].includes(t.status)) fail('cashout_transfer_conflict');
      const p = (await tx.get(db.doc('campaignPayments/' + sid(s.paymentId)))).data();
      const completion = (await tx.get(db.doc('campaignCompletions/' + sid(z.submittedCompletionId)))).data();
      if (!completion || completion.zoneId !== zoneId || completion.campaignId !== campaignId || completion.scalerId !== uid || completion.status !== 'approved' || completion.reviewStatus !== 'approved' || completion.approvedTransferAmountCents !== e.amountCents || !(completion.submittedAt || completion.completedAt) || c.fundingPaymentId !== s.paymentId) fail('cashout_completion_unverified');
      if (!p || p.stripeMode !== 'live' || !p.paidAt || !/^pi_/.test(p.stripePaymentIntentId || '') || p.currency !== 'usd' || p.campaignId !== campaignId || p.businessId !== e.businessId || p.businessChargeCents !== p.workerAmountCents + p.platformFeeCents) fail('cashout_funding_unverified');
      const originalUsable = p.status === 'paid' && !p.settlementFrozen && !p.disputeOpen && !p.fundingReviewRequired && !p.refundRequestedAt && !(p.refundedWorkerAmountCents > s.unusedWorkerCents);
      const replacement = allocated?.recoveryFundingId ? (await tx.get(opRef(allocated.recoveryFundingId))).data() : null;
      const recovered = replacement?.kind === 'scaler_replacement_funding_v1' && replacement.mode === 'live' && replacement.ownerId === uid && replacement.authorizedBy && replacement.authorizationRef && replacement.allocations?.some(x => x.earningId === row.id && x.amountCents + (x.priorPaidCents || 0) >= allocated.reservedCents + allocated.paidCents);
      if (!originalUsable && !recoveryPreparation && !recovered) fail('cashout_funding_unverified');
      const used = allocated || {
        scalerId: uid,
        earningId: row.id,
        reservedCents: 0,
        paidCents: 0,
        mode: 'live'
      };
      if (used.scalerId !== uid || used.earningId !== row.id || used.mode !== 'live' || cents(used.reservedCents) + cents(used.paidCents) > e.amountCents) fail('cashout_allocation_conflict');
      earned += e.amountCents;
      reserved += used.reservedCents;
      paid += used.paidCents;
      sources.push({
        earningId: row.id,
        zoneId,
        campaignId,
        businessId: e.businessId,
        paymentId: s.paymentId,
        transferId,
        amountCents: e.amountCents,
        availableCents: e.amountCents - used.reservedCents - used.paidCents,
        paymentIntentId: p.stripePaymentIntentId,
        paymentAmountCents: p.businessChargeCents,
        allowedReturnCents: s.businessReturnCents || 0,
        allocation: used
      });
    }
    const balance = money(wallet.availableBalance || 0);
    if (balance !== earned - reserved - paid || cents(wallet.cashoutPendingCents || 0) !== reserved || cents(wallet.cashoutPaidCents || 0) !== paid) fail('cashout_wallet_ledger_mismatch');
    return {
      wallet,
      availableCents: balance,
      pendingCents: reserved,
      paidCents: paid,
      sources
    };
  }
  function audit(tx, op, action) {
    tx.set(db.doc('scalerCashoutIndex/' + op.id), {
      operationId: op.id,
      ownerId: op.ownerId,
      mode: 'live',
      createdAt: op.createdAt,
      pending: op.settled !== true
    });
    tx.create(opRef(op.id).collection('audit').doc(String(op.version)), {
      action,
      version: op.version,
      mode: 'live',
      state: op.state,
      ownerId: op.ownerId,
      amountCents: op.amountCents,
      at: now()
    });
  }
  function ledger(tx, op, initial = false) {
    const value = {
      type: 'withdrawal',
      walletSide: 'scaler',
      scalerId: op.ownerId,
      operationId: op.id,
      authorityVersion: VERSION,
      mode: 'live',
      currency: 'usd',
      amount: op.amountCents / 100,
      amountCents: op.amountCents,
      status: projection(op).status,
      description: 'Cash out',
      createdAtMillis: op.createdAt
    };
    for (const r of [walletRef(op.ownerId).collection('transactions').doc(op.id), db.doc('walletTransactions/' + op.id)]) {
      if (initial) tx.create(r, value);else tx.set(r, value);
    }
  }
  return {
    previewRecovery: uid => db.runTransaction(tx => available(tx, uid, true), {readOnly:true}),
    available: uid => db.runTransaction(tx => available(tx, uid), {
      readOnly: true
    }),
    async lookup(key) {
      return validOp((await opRef(key).get()).data());
    },
    async get(key, uid) {
      return validOp((await opRef(key).get()).data(), uid);
    },
    async request(uid, requestId, amountCents, accountId, recoveryPreparation = false) {
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId || '') || cents(amountCents) === 0) fail('cashout_request_invalid');
      const key = `cashout_${id('v1', 'live', uid, requestId)}`;
      return db.runTransaction(async tx => {
        await owner(tx, uid);
        const [accountDoc, existing] = await Promise.all([tx.get(db.doc('stripeConnectedAccounts/' + uid)), tx.get(opRef(key))]);
        const account = accountDoc.data();
        assertAccount(account, uid);
        if (account.stripeAccountId !== accountId) fail('cashout_account_mismatch');
        if (existing.exists) {
          const op = validOp(existing.data(), uid);
          if (op.accountId !== accountId || op.amountCents !== amountCents) fail('cashout_input_conflict');
          return op;
        }
        const funds = await available(tx, uid, recoveryPreparation);
        if (funds.pendingCents > 0) {
          const active = validOp((await tx.get(opRef(funds.wallet.activeCashoutOperationId))).data(), uid);
          if (active.amountCents === amountCents && active.accountId === accountId) return active;
          fail('cashout_already_pending');
        }
        if (!funds.wallet || amountCents > funds.availableCents) fail('cashout_insufficient_balance');
        let remaining = amountCents;
        const allocations = [];
        for (const source of funds.sources.sort((a, b) => a.earningId.localeCompare(b.earningId))) {
          const used = Math.min(remaining, source.availableCents);
          if (used) {
            allocations.push({
              ...source,
              allocatedCents: used
            });
            remaining -= used;
          }
          if (!remaining) break;
        }
        if (remaining) fail('cashout_earning_unverified');
        const op = {
          id: key,
          kind: KIND,
          authorityVersion: VERSION,
          ownerId: uid,
          mode: 'live',
          currency: 'usd',
          accountId,
          amountCents,
          state: 'reserved',
          recoveryHold: recoveryPreparation,
          version: 1,
          createdAt: now(),
          transferId: null,
          payoutId: null,
          payoutAttempt: 1,
          leaseUntil: 0,
          allocations: allocations.map(({
            allocation,
            availableCents,
            ...s
          }) => s)
        };
        for (const source of allocations) tx.set(db.doc('scalerCashoutAllocations/' + source.earningId), {
          ...source.allocation,
          reservedCents: source.allocation.reservedCents + source.allocatedCents
        });
        tx.update(walletRef(uid), {
          availableBalance: (funds.availableCents - amountCents) / 100,
          cashoutPendingCents: funds.pendingCents + amountCents,
          cashoutPaidCents: funds.paidCents,
          activeCashoutOperationId: key
        });
        tx.create(opRef(key), op);
        audit(tx, op, 'reserved');
        ledger(tx, op, true);
        return op;
      });
    },
    async authorizeReplacement(key, expectedVersion, proof, approval) {
      return db.runTransaction(async tx => {
        const op = validOp((await tx.get(opRef(key))).data());
        const fundingId = 'replacement_funding_' + id(proof.topupId);
        const fundingRef = opRef(fundingId), existing = (await tx.get(fundingRef)).data();
        if (existing) {
          if (existing.operationId === key && existing.authorizationRef === approval.authorizationRef && existing.authorizedBy === approval.actorUid && existing.reason === approval.reason && op.replacementFunding?.fundingId === fundingId) return op;
          fail('cashout_replacement_already_allocated');
        }
        if (op.version !== expectedVersion || op.leaseUntil > now()) fail('cashout_stale_claim');
        // No absence inference from a lost provider response. Reconcile it first.
        if (op.settled || op.transferStartedAt || op.transferId || op.payoutStartedAt || op.payoutId || !['reserved','platform_balance_pending','attention'].includes(op.state)) fail('cashout_original_attempt_requires_reconciliation');
        if (proof.netCents < op.amountCents || proof.availableCents < op.amountCents) fail('cashout_replacement_funds_unavailable');
        const funds = await available(tx, op.ownerId, true);
        const allocated = await Promise.all(op.allocations.map(a => tx.get(db.doc('scalerCashoutAllocations/' + a.earningId))));
        if (funds.wallet.activeCashoutOperationId !== key || funds.pendingCents !== op.amountCents) fail('cashout_allocation_conflict');
        for (const [i,a] of op.allocations.entries()) if (allocated[i].data()?.reservedCents !== a.allocatedCents || allocated[i].data()?.paidCents > a.amountCents - a.allocatedCents || allocated[i].data()?.recoveryFundingId) fail('cashout_allocation_conflict');
        const replacement = {...proof, fundingId, operationId:key, authorizedBy:approval.actorUid, authorizationRef:approval.authorizationRef, reason:approval.reason, authorizedAt:now()};
        tx.create(fundingRef, {...replacement, kind:'scaler_replacement_funding_v1', mode:'live', ownerId:op.ownerId, reservedCents:op.amountCents, consumedCents:0, allocations:op.allocations.map((a,i)=>({earningId:a.earningId,amountCents:a.allocatedCents,priorPaidCents:allocated[i].data().paidCents}))});
        for (const a of allocated) tx.update(a.ref,{recoveryFundingId:fundingId});
        const updated={...op,replacementFunding:replacement,recoveryHold:false,version:op.version+1};
        tx.set(opRef(key),updated);audit(tx,updated,'replacement_funding_authorized');
        return updated;
      });
    },
    async claim(key, uid, readOnly = false) {
      return db.runTransaction(async tx => {
        const op = validOp((await tx.get(opRef(key))).data(), uid);
        if (op.leaseUntil > now() || ['failed', 'reversed'].includes(op.state) || op.settled && op.state === 'completed' && !readOnly) return null;
        const account = (await tx.get(db.doc('stripeConnectedAccounts/' + uid))).data();
        assertAccount(account, uid);
        if (account.stripeAccountId !== op.accountId) fail('cashout_account_mismatch');
        if (!readOnly && op.recoveryHold) fail('cashout_recovery_authorization_required');
        if (!readOnly) await available(tx, uid); // Fresh funding/reversal authority before further movement.
        const claimed = {
          ...op,
          version: op.version + 1,
          leaseUntil: now() + 120000
        };
        tx.set(opRef(key), claimed);
        audit(tx, claimed, 'claimed');
        return claimed;
      });
    },
    async save(claim, patch, movement = 'none') {
      return db.runTransaction(async tx => {
        const op = validOp((await tx.get(opRef(claim.id))).data(), claim.ownerId);
        if (op.version !== claim.version) fail('cashout_stale_claim');
        const wallet = (await tx.get(walletRef(op.ownerId))).data();
        if (wallet?.ownerId !== op.ownerId || wallet.ownerType !== 'scaler') fail('cashout_wallet_mismatch');
        const allocated = await Promise.all(op.allocations.map(s => tx.get(db.doc('scalerCashoutAllocations/' + s.earningId))));
        const paymentIds = [...new Set(op.allocations.map(s => s.paymentId))];
        const payments = await Promise.all(paymentIds.map(p => tx.get(db.doc('campaignPayments/' + p))));
        const allocationContracts = await Promise.all(op.allocations.map(s => tx.get(db.doc('assignmentCompensations/'+sid(s.zoneId)))));
        const recoveryRef=op.replacementFunding ? opRef(op.replacementFunding.fundingId) : null;
        const recovery=recoveryRef ? (await tx.get(recoveryRef)).data() : null;
        const campaignAllocationUpdates = new Map();
        if (['paid','reopen'].includes(movement)) {
          const funds=require('./campaign_fund_allocation');
          for(const [i,s] of op.allocations.entries()) {
            const snapshot=payments[paymentIds.indexOf(s.paymentId)],p=snapshot.data();
            if(!p?.fundingAllocation)continue; // Preserve existing historical settlement authority.
            const current=campaignAllocationUpdates.get(s.paymentId)?.next || p.fundingAllocation;
            const input={...p,fundingAllocation:current},contract=allocationContracts[i].data();
            const next=movement==='paid'?funds.paid(s.paymentId,input,contract,{operationId:op.id,
              amountCents:s.allocatedCents,replacementFundingId:op.replacementFunding?.fundingId||null}):
              funds.reopen(s.paymentId,input,contract,op.id);
            campaignAllocationUpdates.set(s.paymentId,{ref:snapshot.ref,before:p.fundingAllocation,next});
          }
        }
        if (movement !== 'none') {
          if (movement === 'reopen') {
            if (!op.settled || op.state !== 'completed' || cents(wallet.cashoutPaidCents || 0) < op.amountCents) fail('cashout_settlement_conflict');
          } else if (op.settled || cents(wallet.cashoutPendingCents || 0) < op.amountCents || !['paid', 'release'].includes(movement)) fail('cashout_settlement_conflict');
          op.allocations.forEach((s, i) => {
            const a = allocated[i].data();
            if (a?.scalerId !== op.ownerId || a.mode !== 'live' || cents(movement === 'reopen' ? a.paidCents : a.reservedCents) < s.allocatedCents) fail('cashout_allocation_conflict');
          });
          if (movement === 'paid' && !op.fundingTransferRecorded && !op.replacementFunding) for (const [i, pid] of paymentIds.entries()) {
            const amount = op.allocations.filter(s => s.paymentId === pid).reduce((n, s) => n + s.allocatedCents, 0);
            if (cents(payments[i].data()?.reservedWorkerAmountCents || 0) < amount) fail('cashout_funding_allocation_conflict');
          }
        }
        const updated = {
          ...op,
          ...patch,
          id: op.id,
          kind: op.kind,
          authorityVersion: VERSION,
          ownerId: op.ownerId,
          mode: 'live',
          accountId: op.accountId,
          amountCents: op.amountCents,
          currency: 'usd',
          allocations: op.allocations,
          createdAt: op.createdAt,
          version: op.version + 1,
          ...(movement !== 'none' ? {
            settled: movement !== 'reopen'
          } : {}),
          ...(movement === 'paid' ? {
            fundingTransferRecorded: true
          } : {})
        };
        if (movement !== 'none') {
          op.allocations.forEach((s, i) => {
            const a = allocated[i].data();
            tx.set(allocated[i].ref, {
              ...a,
              reservedCents: a.reservedCents + (movement === 'reopen' ? s.allocatedCents : -s.allocatedCents),
              paidCents: a.paidCents + (movement === 'paid' ? s.allocatedCents : movement === 'reopen' ? -s.allocatedCents : 0)
            });
          });
          tx.update(walletRef(op.ownerId), {
            availableBalance: (money(wallet.availableBalance) + (movement === 'release' ? op.amountCents : 0)) / 100,
            cashoutPendingCents: wallet.cashoutPendingCents + (movement === 'reopen' ? op.amountCents : -op.amountCents),
            cashoutPaidCents: (wallet.cashoutPaidCents || 0) + (movement === 'paid' ? op.amountCents : movement === 'reopen' ? -op.amountCents : 0)
          });
          if (movement === 'paid' && !op.fundingTransferRecorded && !op.replacementFunding) for (const [i, pid] of paymentIds.entries()) {
            const p = payments[i].data(),
              amount = op.allocations.filter(s => s.paymentId === pid).reduce((n, s) => n + s.allocatedCents, 0);
            tx.update(payments[i].ref, {
              reservedWorkerAmountCents: p.reservedWorkerAmountCents - amount,
              transferredWorkerAmountCents: (p.transferredWorkerAmountCents || 0) + amount
            });
          }
        }
        if (movement === 'paid' && !op.fundingTransferRecorded && op.replacementFunding) {
          if (recovery?.operationId !== op.id || recovery.reservedCents !== op.amountCents || recovery.consumedCents !== 0) fail('cashout_replacement_allocation_conflict');
          tx.update(recoveryRef,{reservedCents:0,consumedCents:op.amountCents,settledAt:now()});
        }
        for(const item of campaignAllocationUpdates.values()) require('./campaign_fund_allocation').persist(
          tx,item.ref,item.before,item.next,'cashout_'+movement,now());
        tx.set(opRef(op.id), updated);
        audit(tx, updated, movement === 'none' ? 'reconciled' : movement);
        ledger(tx, updated);
        return updated;
      });
    },
    async event(eventId, action) {
      if (!/^evt_[A-Za-z0-9]+$/.test(eventId || '')) fail('cashout_event_invalid');
      const ref = db.doc('scalerCashoutEvents/live_' + eventId),
        lease = id(eventId, now(), Math.random());
      const claimed = await db.runTransaction(async tx => {
        const e = (await tx.get(ref)).data();
        if (e?.done || e?.until > now()) return false;
        tx.set(ref, {
          mode: 'live',
          eventId,
          lease,
          until: now() + 120000,
          done: false
        });
        return true;
      });
      if (!claimed) return {
        duplicate: true
      };
      try {
        await action();
        await db.runTransaction(async tx => {
          if ((await tx.get(ref)).data()?.lease === lease) tx.update(ref, {
            done: true,
            until: 0
          });
        });
      } catch (e) {
        await db.runTransaction(async tx => {
          if ((await tx.get(ref)).data()?.lease === lease) tx.update(ref, {
            until: 0
          });
        });
        throw e;
      }
      return {
        received: true
      };
    }
  };
}
module.exports = {
  createStore,
  assertAccount,
  VERSION
};
