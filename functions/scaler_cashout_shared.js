'use strict';

const crypto = require('node:crypto');
const fail = code => {
  throw Object.assign(new Error(code), {
    code
  });
};
const id = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) fail('cashout_amount_invalid');
  return value;
}
function projection(op) {
  return {
    operationId: op.id,
    amountCents: op.amountCents,
    mode: op.mode,
    payoutFailed: op.state === 'payout_failed',
    status: op.state === 'completed' ? 'completed' : ['failed', 'reversed'].includes(op.state) ? 'failed' : ['payout_failed', 'attention'].includes(op.state) ? 'needs_attention' : 'pending',
    message: op.state === 'completed' ? 'Paid' : op.state === 'platform_balance_pending' || op.state === 'balance_pending' ? 'Waiting for funds' : ['transfer_pending', 'payout_pending', 'confirming'].includes(op.state) ? 'Confirming payout' : op.state === 'payout_failed' ? 'Payout needs attention. Your funds remain reserved.' : ['failed', 'reversed'].includes(op.state) ? 'Funds returned to your available balance' : 'Processing'
  };
}
function liveEligibility(account, expectedId) {
  if (account?.id !== expectedId || account.livemode !== true || account.accountApi !== 'accounts_v2') fail('cashout_account_mismatch');
  const ready = account.transfersStatus === 'active' && account.payoutsStatus === 'active' && account.requirementsIncluded === true && !['currently_due', 'past_due'].includes(account.deadlineStatus) && account.payoutSchedule === 'manual';
  return {
    ready,
    status: ready ? 'ready' : 'needs_attention'
  };
}
module.exports = {
  fail,
  id,
  cents,
  projection,
  liveEligibility
};
