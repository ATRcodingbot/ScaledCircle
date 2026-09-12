'use strict';
// New production financial commitments stay closed until an attended LIVE
// recipient/transfer/payout certification is recorded and separately enabled.
// This gate is never used on existing work, settlements or reconciliation.
function assertNewPaidWork({project, enabled=process.env.LIVE_PAID_WORK_ACTIVATION_ENABLED}={}) {
  if (project==='scaled-circle' && enabled!=='true') {
    const error=Error('Paid work is not open yet. You can save your campaign draft while ScaledCircle completes payout readiness.');
    error.code='failed-precondition'; error.reason='LIVE_PAYOUT_READINESS_REQUIRED'; throw error;
  }
  if (!['scaled-circle','scaledcircle-staging'].includes(project) && !/^demo-/.test(project||'')) {
    const error=Error('Paid-work environment is unavailable.');error.code='failed-precondition';throw error;
  }
}
module.exports={assertNewPaidWork};
