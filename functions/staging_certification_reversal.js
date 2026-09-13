'use strict';
// TEST ledger cleanup, not a provider refund or a deduction for referral funding.
// Only invoked inside the isolated certification authority after provider readback.
const {operationId} = require('./marketplace_finance');
const fail = () => {throw Error('test_reversal_requires_review');};
async function reverse({tx, db, FieldValue, config, ids, task, actorUid}) {
  if (config.project !== 'scaledcircle-staging' || config.appEnv !== 'staging' ||
      config.enabled !== 'true' || config.liveEnabled !== 'false' || actorUid !== config.businessUid ||
      !['approved','reversed'].includes(task.status)) fail();
  const earningId = `earning_${ids.zone}_v1`, reversalId = `test_reversal_${earningId}`;
  const walletRef = db.doc('wallets/' + config.scalerUid);
  const transferRef = db.doc('scalerTransfers/' + operationId('scaler-transfer', ids.zone, 1));
  const refs = [db.doc('walletTransactions/' + earningId), walletRef.collection('transactions').doc(earningId),
    db.doc('walletTransactions/' + reversalId), walletRef.collection('transactions').doc(reversalId),
    walletRef, transferRef, db.doc('assignmentCompensations/' + ids.zone), db.doc('campaignSettlements/' + ids.zone),
    db.doc('scalerCashoutBalances/' + config.scalerUid)];
  const snaps = await Promise.all(refs.map(r => tx.get(r)));
  const [global, nested, reversal, projection, wallet, transfer, contract, settlement, cashout] = snaps.map(s => s.data());
  if (task.status === 'reversed') {
    if (reversal?.amountCents !== -500 || projection?.amountCents !== -500 || transfer?.status !== 'reversed' ||
        reversal.originalEarningId !== earningId) fail();
    return;
  }
  if (reversal || projection || contract?.immutable !== true || contract.baseAmountCents !== 500 || contract.bonusAmountCents !== 0 ||
      settlement?.earnedWorkerCents !== 500 || settlement?.paymentId !== ids.payment ||
      Number(wallet?.availableBalance) !== 5 || Number(wallet?.pendingBalance || 0) !== 0 ||
      Object.entries(cashout || {}).some(([k,v]) => /Cents$/.test(k) && Number(v) !== 0) || cashout?.activeOperationId ||
      transfer?.status !== 'transfer_pending' || transfer.amountCents !== 500 || transfer.externalExecutionAuthorized !== false ||
      transfer.bankPayoutStatus !== 'not_observed' || transfer.stripeTransferId || transfer.stripePayoutId ||
      [global,nested].some(e => !e || e.amountCents !== 500 || e.amount !== 5 || e.scalerId !== config.scalerUid ||
        e.businessId !== config.businessUid || e.zoneId !== ids.zone || e.type !== 'scaler_earnings') ||
      [contract,settlement,transfer].some(e => e.scalerId !== config.scalerUid || e.businessId !== config.businessUid || e.campaignId !== ids.campaign)) fail();
  const at = FieldValue.serverTimestamp();
  const entry = {type:'test_earning_reversal', walletSide:'scaler', environment:'staging', stripeMode:'test',
    scalerId:config.scalerUid, businessId:config.businessUid, campaignId:ids.campaign, zoneId:ids.zone,
    originalEarningId:earningId, amount:-5, amountCents:-500, currency:'usd', status:'recorded',
    description:'TEST certification earning reversed. Original earning retained.',
    reason:'founder_authorized_test_account_cleanup', actorUid, createdAt:at};
  tx.create(refs[2],entry); tx.create(refs[3],entry);
  tx.update(walletRef,{availableBalance:FieldValue.increment(-5),updatedAt:at});
  tx.update(transferRef,{status:'reversed',reversedAmountCents:500,reversalLedgerId:reversalId,
    reversalType:'test_ledger_only',externalExecutionAuthorized:false,reversedAt:at,updatedAt:at});
  const taskRef = db.doc('stagingPaymentCertifications/' + ids.task);
  tx.update(taskRef,{status:'reversed',reversalLedgerId:reversalId,reversedAt:at,updatedAt:at});
  tx.create(taskRef.collection('audit').doc('reverse'),{action:'reverse',actorUid,environment:'staging',
    originalEarningId:earningId,reversalLedgerId:reversalId,amountCents:-500,providerRefundPerformed:false,timestamp:at});
}
module.exports = {reverse};
