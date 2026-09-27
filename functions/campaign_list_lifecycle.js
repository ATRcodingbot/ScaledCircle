'use strict';

// Organizational lifecycle only. This module never cancels a Checkout Session,
// releases a reserve, settles work, or calls a payment provider.
const crypto = require('node:crypto');
const VERSION = 'CampaignListLifecycleV1';
const CAP = 250;
const OPEN = new Set(['open', 'funded', 'published', 'active', 'available', 'own_team_scheduled']);
const COMPLETED = new Set(['completed', 'own_team_completed']);
const TERMINAL = new Set(['closed', 'deleted', 'completed', 'own_team_completed', 'canceled', 'cancelled', 'canceling', 'archived']);
const WORK_COLLECTIONS = ['assignmentCompensations', 'campaignCompletions', 'trackingSessions',
  'zoneGroupAssignments', 'zoneParticipants', 'zoneScalerParticipations', 'materialHandoffs', 'jobRooms', 'campaignSettlements', 'scalerEarnings', 'earnings', 'payouts'];
const FINANCE_COLLECTIONS = ['campaignPayments', 'financialOperations', 'walletTransactions', 'scalerTransfers'];
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail('invalid-argument', 'Choose a valid campaign or request.');
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function assertAcceptingWork(campaign, ErrorType) {
  if (!campaign || TERMINAL.has(campaign.status) || campaign.workEntryClosed === true || campaign.deletedAt) {
    if (ErrorType) throw new ErrorType('failed-precondition', 'This campaign is closed to new work.');
    fail('failed-precondition', 'This campaign is closed to new work.');
  }
}
function workBound(row) {
  return ['assignedScalerId', 'scalerId', 'acceptedAt', 'startedAt', 'submittedAt',
    'assignmentCompensationId', 'compensationContractId', 'activeTrackingSessionId',
    'resumableTrackingSessionId', 'submittedCompletionId'].some(k => !!row[k]) ||
    ['assignedScalers', 'assignedScalerIds', 'assignedPeople'].some(k => Array.isArray(row[k]) && row[k].length > 0) ||
    ['assignedScalerCount', 'assignedZoneCount', 'completedZoneCount'].some(k => Number(row[k] || 0) > 0) ||
    ['assigned', 'accepted', 'in_progress', 'own_team_in_progress', 'started', 'submitted',
      'awaiting_review', 'pending_review', 'paused', 'paused_work_window', 'incomplete_review',
      'completed', 'done', 'approved'].includes(row.status);
}
function moneyBound(row) {
  return ['fundingPaymentId', 'campaignPaymentId', 'paymentId', 'stripeCheckoutSessionId',
    'stripePaymentIntentId', 'stripeChargeId', 'fundedAt', 'refundRequestedAt', 'transferOperationId'].some(k => !!row[k]) ||
    (row.fundingStatus && !['unfunded', 'not_funded'].includes(row.fundingStatus)) ||
    (row.paymentStatus && row.paymentStatus !== 'unpaid') || row.funded === true ||
    ['reservedWorkerBudget', 'reservedCredits', 'paidAmountCents', 'earnedAmountCents'].some(k => Number(row[k] || 0) > 0);
}
function rules(campaign, facts) {
  const acceptedApplication = facts.applications.some(a => !['pending', 'rejected', 'withdrawn', 'canceled', 'cancelled'].includes(a.status));
  const work = workBound(campaign) || facts.zones.some(workBound) || facts.locations.some(workBound) ||
    facts.assigned.length > 0 || acceptedApplication || facts.work.length > 0 || facts.items.some(workBound);
  const money = moneyBound(campaign) || facts.zones.some(moneyBound) || facts.finance.length > 0;
  const actions = [];
  let reason = '';
  if (campaign.status === 'deleted') reason = 'This draft was deleted. Its audit history is retained.';
  else if (campaign.archived === true) {
    if (COMPLETED.has(campaign.status) || ['canceled', 'cancelled'].includes(campaign.status)) actions.push('restore');
    else reason = 'This historical archive needs review before it can be restored.';
  } else if (COMPLETED.has(campaign.status)) actions.push('archive');
  else if (campaign.status === 'draft') {
    if (money) reason = 'Payment or checkout history needs reconciliation. Open campaign funding or contact support before deleting this draft.';
    else if (work) reason = 'This draft has assigned, accepted or recorded work. Manage that work before removing the campaign.';
    else actions.push('delete');
  } else if (OPEN.has(campaign.status)) {
    if (work) reason = 'Assigned, accepted or recorded work must be resolved through Manage work or support.';
    else actions.push('close');
  } else reason = 'This campaign has no ordinary list action in its current state. Open it to review work or funding.';
  return {actions, reason, financialNotice: money || facts.finance.length ?
    'Closing stops new work. Existing payment, refund and balance obligations remain. No refund is requested by this action; review funding for the applicable cancellation process.' :
    'Closing stops new applications, assignments and work. This action does not charge or refund money.'};
}
function createService({db, FieldValue, authorize}) {
  async function rows(tx, query) {
    const snapshot = await tx.get(query.limit(CAP + 1));
    if (snapshot.size > CAP) fail('failed-precondition', 'This campaign needs a support review before a list action. Nothing changed.');
    return snapshot.docs;
  }
  async function inspect(tx, a, campaignId) {
    const ref = db.doc('campaigns/' + id(campaignId)), snapshot = await tx.get(ref), campaign = snapshot.data();
    if (!campaign) fail('not-found', 'Campaign not found. Refresh the list.');
    if (campaign.businessId !== a.businessId || (campaign.certificationFixture === true && a.actorUid !== campaign.businessId)) fail('permission-denied', 'Choose a campaign in your authorized Business.');
    const queries = {
      zones: db.collection('campaignZones').where('campaignId', '==', campaignId),
      locations: db.collection('campaignLocations').where('campaignId', '==', campaignId),
      applications: ref.collection('applications'), assigned: ref.collection('assignedScalers'),
      items: db.collection(`businessOperations/${a.businessId}/items`).where('campaignId', '==', campaignId),
      legacyWallet: db.collection(`wallets/${a.businessId}/transactions`).where('campaignId', '==', campaignId),
    };
    for (const name of [...WORK_COLLECTIONS, ...FINANCE_COLLECTIONS]) queries[name] = db.collection(name).where('campaignId', '==', campaignId);
    const entries = await Promise.all(Object.entries(queries).map(async ([name, query]) => [name, await rows(tx, query)]));
    const inventories = Object.fromEntries(entries);
    // Follow maintained direct bindings as well as indexed parent queries.
    const bindings = [campaign.fundingPaymentId && `campaignPayments/${id(campaign.fundingPaymentId)}`,
      campaign.scheduleItemId && `businessOperations/${a.businessId}/items/${id(campaign.scheduleItemId)}`].filter(Boolean);
    const direct = await Promise.all(bindings.map(path => tx.get(db.doc(path))));
    if (direct.some(s => !s.exists || s.data().campaignId !== campaignId)) fail('failed-precondition', 'Campaign bindings need review before a list action. Nothing changed.');
    const data = name => inventories[name].map(s => s.data());
    const facts = {...Object.fromEntries(['zones', 'locations', 'applications', 'assigned', 'items'].map(k => [k, data(k)])),
      work: WORK_COLLECTIONS.flatMap(data), finance: [...FINANCE_COLLECTIONS.flatMap(data), ...data('legacyWallet')]};
    const version = digest([snapshot.updateTime.toMillis(), snapshot.updateTime.nanoseconds,
      entries.flatMap(([name, docs]) => docs.map(d => [name, d.id, d.updateTime.toMillis(), d.updateTime.nanoseconds])),
      direct.map(d => [d.ref.path, d.updateTime.toMillis(), d.updateTime.nanoseconds])]);
    return {ref, campaign, facts, version, inventories, ...rules(campaign, facts)};
  }
  async function execute(request) {
    const operation = request.data?.operation, input = request.data?.input || {};
    const campaignId = id(input.campaignId);
    if (!['campaignListActions', 'changeCampaignListState'].includes(operation)) fail('invalid-argument', 'Choose a supported campaign action.');
    return db.runTransaction(async tx => {
      const a = await authorize(request, tx);
      if (!a.permissions.includes('campaigns')) fail('permission-denied', 'Campaign management permission is required.');
      let receipt, fingerprint;
      if (operation === 'changeCampaignListState') {
        const requestId = id(request.data.requestId);
        if (requestId.length < 16 || !['delete', 'close', 'archive', 'restore'].includes(input.action)) fail('invalid-argument', 'Choose a valid campaign action and request.');
        fingerprint = digest([campaignId, input.action, input.expectedVersion || null]);
        receipt = db.doc(`businessOperations/${a.businessId}/requests/${digest([a.actorUid, requestId])}`);
        const previous = await tx.get(receipt);
        if (previous.exists) {
          if (previous.data().fingerprint !== fingerprint || previous.data().operation !== operation) fail('already-exists', 'This request already recorded another action. Refresh the list.');
          return {...previous.data().result, duplicate: true};
        }
      }
      const state = await inspect(tx, a, campaignId);
      const result = {campaignId, name: state.campaign.campaignName || 'Untitled Campaign',
        status: state.campaign.status, archived: state.campaign.archived === true,
        actions: state.actions, reason: state.reason, version: state.version, financialNotice: state.financialNotice};
      if (operation === 'campaignListActions') return result;
      if (!state.actions.includes(input.action)) fail('failed-precondition', state.reason || 'Campaign state changed. Refresh the list and review its current actions.');
      if (input.expectedVersion !== state.version) fail('aborted', 'This campaign changed while you were reviewing it. Nothing changed. Reopen its actions.');
      const stamp = FieldValue.serverTimestamp(), patch = {updatedAt: stamp};
      if (input.action === 'delete') Object.assign(patch, {status: 'deleted', deletedAt: stamp, deletedBy: a.actorUid,
        hiddenFromBusinessHistory: true, workEntryClosed: true, marketplaceVisible: false, acceptingApplications: false});
      if (input.action === 'close') Object.assign(patch, {status: 'closed', closedAt: stamp, closedBy: a.actorUid, closedFromStatus: state.campaign.status,
        workEntryClosed: true, marketplaceVisible: false, acceptingApplications: false});
      if (input.action === 'archive') Object.assign(patch, {archived: true, archivedAt: stamp, archivedBy: a.actorUid});
      if (input.action === 'restore') Object.assign(patch, {archived: false, hiddenFromBusinessHistory: false, restoredAt: stamp, restoredBy: a.actorUid});
      tx.update(state.ref, patch);
      // Cancel only the unassigned own-team schedule projection, preserving its
      // identity and history. Assignment/work presence was checked above.
      if (input.action === 'close') for (const item of state.inventories.items) {
        if (item.data().sourceKind === 'own_team_campaign') tx.update(item.ref, {status: 'canceled', campaignClosedAt: stamp,
          version: Number(item.data().version || 0) + 1, updatedBy: a.actorUid});
      }
      const saved = {campaignId, action: input.action, status: patch.status || state.campaign.status,
        archived: Object.hasOwn(patch, 'archived') ? patch.archived : state.campaign.archived === true, confirmed: true, financialEffect: false};
      tx.create(receipt, {operation, fingerprint, result: saved, actorUid: a.actorUid, businessId: a.businessId, createdAt: stamp});
      tx.create(db.doc(`businessWorkspaces/${a.businessId}/activity/${receipt.id}`), {version: VERSION,
        actorUid: a.actorUid, businessId: a.businessId, campaignId, previousStatus: state.campaign.status,
        previousArchived: state.campaign.archived === true, ...saved, action: 'campaign_' + input.action, historyPreserved: true, createdAt: stamp});
      return saved;
    });
  }
  return {execute};
}
module.exports = {VERSION, createService, rules, workBound, assertAcceptingWork};
