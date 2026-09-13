'use strict';

// One non-field TEST task. This is not a bypass in the ordinary GPS lifecycle.
// No zone exists until submission, and its first state is submitted (never startable).
const {createHash} = require('node:crypto');
const {quoteCampaignFunding} = require('./campaign_funding_quote');
const {createService: settlementService} = require('./campaign_reserve_settlement');
const {createReconciler} = require('./referral_scaler_reconciliation');
const {MANUAL_LAUNCH_POLICY, TERMS} = require('./referral_liability');
const VERSION = 'StagingNonGpsPaymentCertificationV1';
const IDS = Object.freeze({task: 'payment_flow_v1', campaign: 'staging_payment_certification_v1',
  zone: 'staging_payment_certification_job_v1', payment: 'staging_payment_certification_payment_v1',
  completion: 'staging_payment_certification_submission_v1'});
const TASK = 'Complete the ScaledCircle Scaler payment certification flow, verify the assigned task/completion experience, and confirm Wallet/cash-out behavior.';
const QUOTE = Object.freeze({...quoteCampaignFunding(500), workerCompensationCents: 500,
  totalChargeCents: 600, platformFeeBasisPoints: 2000, quoteVersion: 2});
const CONSENTS = {terms: 'terms-2026-08-v1', privacy: 'privacy-2026-08-v1', scaler_work: 'scaler-work-2026-08-v1'};
const fail = message => {throw Object.assign(Error(message), {code: 'failed-precondition'});};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assertRuntime(config) {
  if (config.project !== 'scaledcircle-staging' || config.appEnv !== 'staging' ||
      config.enabled !== 'true' || config.liveEnabled !== 'false') fail('staging_only');
  const uids = [config.adminUid, config.businessUid, config.scalerUid, config.referrerUid];
  if (uids.some(uid => !/^[A-Za-z0-9_-]{1,128}$/.test(uid || '')) || new Set(uids).size !== 4) fail('binding_unavailable');
}
function assertPayment(p, c, config) {
  if (!p || !c || !['paid', 'funded'].includes(p.status) || !p.paidAt ||
      p.stripeMode !== 'test' || !/^pi_/.test(p.stripePaymentIntentId || '') || p.currency !== 'usd' ||
      p.businessId !== config.businessUid || p.campaignId !== IDS.campaign || p.businessChargeCents !== 600 ||
      p.totalChargeCents !== 600 || p.workerAmountCents !== 500 || p.platformFeeCents !== 100 ||
      p.settlementFrozen === true || p.refundedTotalCents > 0 || c.fundingStatus !== 'funded' ||
      c.fundingPaymentId !== IDS.payment || c.businessId !== config.businessUid ||
      c.status !== 'certification_draft' || c.marketplaceVisible !== false || c.acceptingApplications !== false) fail('verified_test_funding_required');
}
function createService({db, auth, FieldValue, Timestamp, config, stripe, now = Date.now}) {
  const taskRef = db.doc('stagingPaymentCertifications/' + IDS.task);
  const campaignRef = db.doc('campaigns/' + IDS.campaign), paymentRef = db.doc('campaignPayments/' + IDS.payment);
  const contractRef = db.doc('assignmentCompensations/' + IDS.zone), zoneRef = db.doc('campaignZones/' + IDS.zone);
  const submissionRef = db.doc('campaignCompletions/' + IDS.completion);
  const at = () => FieldValue.serverTimestamp();
  const binding = () => digest([VERSION, config.businessUid, config.scalerUid, config.referrerUid, IDS, QUOTE]);
  function assertTask(t) {
    if (!t || t.version !== VERSION || t.bindingDigest !== binding() || t.immutable !== true) fail('task_binding_changed');
  }
  async function actor(uid) {
    assertRuntime(config); // Must precede Auth, Firestore or provider calls.
    if (![config.adminUid, config.businessUid, config.scalerUid].includes(uid)) fail('actor_not_authorized');
    const u = await auth.getUser(uid);
    if (u.disabled || !u.emailVerified) fail('verified_account_required');
    const role = uid === config.adminUid ? 'admin' : uid === config.businessUid ? 'business' : 'scaler';
    const p = (await db.doc('users/' + uid).get()).data();
    if (p?.role !== role || (role !== 'admin' && !(p.active === true || p.betaAccess === 'approved'))) fail('role_not_authorized');
    if (role !== 'admin') {
      for (const type of role === 'scaler' ? Object.keys(CONSENTS) : ['terms', 'privacy']) {
        const c = (await db.doc(`legalConsents/${uid}_${type}_${CONSENTS[type]}`).get()).data();
        if (c?.uid !== uid || c.agreementType !== type || c.agreementVersion !== CONSENTS[type] || !c.acceptedAt) fail('consent_required');
      }
    }
    return role;
  }
  async function get(uid) {
    const role = await actor(uid);
    const [t, p, c, s, settlement, wallet] = await Promise.all([taskRef, paymentRef, campaignRef, submissionRef,
      db.doc('campaignSettlements/' + IDS.zone), db.doc('wallets/' + config.scalerUid)].map(ref => ref.get()));
    if (t.exists) assertTask(t.data());
    const data = t.data() || {};
    return {role, exists: t.exists, ...IDS, task: TASK, status: data.status || 'not_created',
      quote: QUOTE, baseCents: 500, bonusCents: 0, gpsRequired: false, livePaymentsBlocked: true,
      fundingStatus: c.data()?.fundingStatus || 'unfunded', paymentStatus: p.data()?.status || 'none',
      applicationState: data.applicationState || 'none', assignmentState: data.assignmentState || 'none',
      notes: s.data()?.certificationNotes || '', approvedCents: settlement.data()?.earnedWorkerCents || 0,
      testWalletBalanceCents: Math.round(Number(wallet.data()?.availableBalance || 0) * 100),
      checkoutUrl: role === 'business' && p.data()?.status === 'payment_pending' ? p.data()?.stripeCheckoutUrl || null : null,
      actions: !t.exists ? (role === 'admin' ? ['create'] : []) :
        role === 'business' ? (data.status === 'created' && !['paid', 'funded'].includes(p.data()?.status) ? ['checkout'] :
          data.status === 'applied' ? ['assign'] : data.status === 'submitted' ? ['approve'] :
            ['approved','reversed'].includes(data.status) ? ['reverse'] : []) :
          role === 'scaler' && ['paid','funded'].includes(p.data()?.status) ?
            data.status === 'created' ? ['apply'] : data.status === 'assigned' ? ['accept'] :
              data.status === 'accepted' ? ['submit'] : [] : []};
  }
  async function verifiedFunding() {
    const [p, c] = await Promise.all([paymentRef.get(), campaignRef.get()]);
    assertPayment(p.data(), c.data(), config);
    // A browser return is never funding evidence. The normal signed webhook must
    // have reconciled the payment, followed by an independent TEST provider read.
    const provider = stripe(), intent = await provider.paymentIntents.retrieve(p.data().stripePaymentIntentId);
    if (intent.livemode !== false || intent.status !== 'succeeded' || intent.amount_received !== 600 ||
        intent.currency !== 'usd' || intent.metadata?.paymentId !== IDS.payment) fail('provider_funding_mismatch');
    const charge = await provider.charges.retrieve(typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id);
    if (charge.livemode !== false || charge.paid !== true || charge.disputed || charge.amount !== 600 ||
        charge.amount_refunded !== 0 || charge.payment_intent !== intent.id) fail('provider_funding_mismatch');
  }
  async function checkout(uid) {
    if (await actor(uid) !== 'business') fail('business_owner_required');
    const op = await db.runTransaction(async tx => {
      const [t, p] = await Promise.all([tx.get(taskRef), tx.get(paymentRef)]); assertTask(t.data());
      if (t.data().status !== 'created') fail('checkout_state_invalid');
      if (p.exists) return p.data();
      const createdMillis = now();
      const payment = {paymentId: IDS.payment, campaignId: IDS.campaign, businessId: uid, businessUid: uid,
        ...QUOTE, quoteDigest: digest(QUOTE), fundingVersion: 1, checkoutAttempt: 1,
        stripeMode: 'test', status: 'created', initiatedByActorUid: uid, createdMillis,
        expiresAtSeconds: Math.floor(createdMillis / 1000) + 3600, createdAt: at(), updatedAt: at()};
      tx.create(paymentRef, payment); return payment;
    });
    if (op.stripeCheckoutSessionId) return get(uid);
    // One immutable request/key, including expiry. Never mint a replacement after
    // expiry or Stripe's idempotency retention window following an unknown result.
    if (now() - op.createdMillis > 20 * 60 * 1000 || !['created','checkout_unknown'].includes(op.status)) fail('checkout_requires_review');
    const metadata = {paymentId: IDS.payment, campaignId: IDS.campaign, businessUid: uid, purchaseType: 'campaign_funding_test_v1'};
    let session;
    try {
      session = await stripe().checkout.sessions.create({mode: 'payment', client_reference_id: IDS.payment,
        metadata, payment_intent_data: {metadata}, expires_at: op.expiresAtSeconds,
        line_items: [{quantity: 1, price_data: {currency: 'usd', unit_amount: 600,
          product_data: {name: 'STAGING TEST — Scaler payment certification', description: '$5 worker compensation + $1 platform fee. No LIVE payment.'}}}],
        success_url: 'https://scaledcircle-staging.web.app/#/staging/payment-certification?funding=processing',
        cancel_url: 'https://scaledcircle-staging.web.app/#/staging/payment-certification'},
      {idempotencyKey: 'scaledcircle:staging-non-gps:' + IDS.payment});
    } catch (_) {
      await db.runTransaction(async tx => {const p = (await tx.get(paymentRef)).data();
        if (!p.stripeCheckoutSessionId && p.status === 'created') tx.update(paymentRef, {status: 'checkout_unknown', updatedAt: at()});});
      fail('checkout_outcome_pending');
    }
    if (session.livemode !== false || session.client_reference_id !== IDS.payment || session.amount_total !== 600 ||
        session.currency !== 'usd' || !/^cs_test_/.test(session.id || '') ||
        !/^https:\/\/checkout\.stripe\.com\//.test(session.url || '')) fail('provider_checkout_mismatch');
    await db.runTransaction(async tx => {
      const p = (await tx.get(paymentRef)).data();
      if (p.stripeCheckoutSessionId && p.stripeCheckoutSessionId !== session.id) fail('checkout_identity_changed');
      // Never overwrite an early signed webhook with a stale pending status.
      tx.update(paymentRef, {stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url,
        ...(['created','checkout_unknown'].includes(p.status) ? {status: 'payment_pending'} : {}), updatedAt: at()});
      if (['created','checkout_unknown'].includes(p.status)) tx.update(campaignRef, {fundingStatus: 'pending', fundingPaymentId: IDS.payment, fundingVersion: 1, updatedAt: at()});
    });
    return get(uid);
  }
  async function run(uid, input = {}) {
    const role = await actor(uid), action = input.action || 'get';
    if (Object.keys(input).some(k => !['action','notes','attested'].includes(k))) fail('unexpected_input');
    if (action === 'get') return get(uid);
    if (action === 'checkout') return checkout(uid);
    if (action === 'reverse') {
      if (role !== 'business') fail('action_not_authorized');
      if (input.attested !== true) fail('explicit_confirmation_required');
      await verifiedFunding();
      await db.runTransaction(async tx => {
        const t = (await tx.get(taskRef)).data(); assertTask(t);
        await require('./staging_certification_reversal').reverse({tx, db, FieldValue, config, ids: IDS, task: t, actorUid: uid});
      });
      // Canonical reconciliation appends the source reversal and liability delta.
      // Retries repair an interrupted mirror without another Wallet adjustment.
      await reconcileReferral();
      return get(uid);
    }
    const required = {create: 'admin', apply: 'scaler', assign: 'business', accept: 'scaler', submit: 'scaler', approve: 'business'}[action];
    if (!required || role !== required) fail('action_not_authorized');
    if (['accept','submit','approve'].includes(action) && input.attested !== true) fail('explicit_confirmation_required');
    const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
    if (action === 'submit' && (notes.length < 20 || notes.length > 2000)) fail('describe_actual_checks_required');
    if (action === 'create') {
      await actor(config.businessUid); await actor(config.scalerUid);
      const a = (await db.doc('scalerReferralAttributions/' + config.scalerUid).get()).data();
      if (a?.affiliateUid !== config.referrerUid || a.scalerUid !== config.scalerUid || !a.attributedAt || a.policyVersion !== 'ScalerReferralOnePercentV1') fail('referral_binding_required');
      const referrer = (await db.doc('scalerAffiliateProfiles/' + config.referrerUid).get()).data();
      if (referrer?.status !== 'active' || referrer.acceptedLaunchPolicyVersion !== TERMS) fail('referral_enrollment_required');
    } else await verifiedFunding();
    await db.runTransaction(async tx => {
      const authorityRef = db.doc('internalCertificationAuthorities/' + IDS.campaign);
      const [task, campaign, payment, contract, zone, submission, authority] = await Promise.all(
        [taskRef, campaignRef, paymentRef, contractRef, zoneRef, submissionRef, authorityRef].map(r => tx.get(r)));
      const t = task.data();
      if (action === 'create') {
        if (task.exists) {assertTask(t); return;}
        if ([campaign,payment,contract,zone,submission,authority].some(s => s.exists)) fail('namespace_conflict');
        tx.create(authorityRef, {projectId: config.project, immutable: true, certificationFixture: true,
          campaignId: IDS.campaign, zoneId: IDS.zone, businessUid: config.businessUid, scalerUid: config.scalerUid,
          purpose: VERSION, gpsRequired: false, createdAt: at()});
        tx.create(taskRef, {version: VERSION, immutable: true, bindingDigest: binding(), businessId: config.businessUid,
          scalerId: config.scalerUid, referrerId: config.referrerUid, ...IDS, taskDescription: TASK, status: 'created', createdAt: at(), createdBy: uid});
        tx.create(campaignRef, {businessId: config.businessUid, campaignName: 'Staging payment certification',
          description: TASK, campaignType: 'platformCertification', status: 'certification_draft', fundingStatus: 'unfunded',
          certificationFixture: true, certificationPurpose: VERSION, basePay: 5, bonus: 0, workerAmountCents: 500,
          marketplaceVisible: false, acceptingApplications: false, trackingEnabled: false, createdAt: at(), updatedAt: at()});
      } else {
        assertTask(t); assertPayment(payment.data(), campaign.data(), config);
        const expected = {apply: 'created', assign: 'applied', accept: 'assigned', submit: 'accepted', approve: 'submitted'}[action];
        const next = {apply: 'applied', assign: 'assigned', accept: 'accepted', submit: 'submitted', approve: 'approved'}[action];
        if (t.status === next) return;
        if (t.status !== expected) fail('task_state_changed');
        const base = {zoneId: IDS.zone, campaignId: IDS.campaign, businessId: config.businessUid, scalerId: config.scalerUid};
        if (action === 'assign') {
          if (contract.exists) fail('contract_conflict');
          tx.create(contractRef, {...base, immutable: true, baseAmountCents: 500, bonusAmountCents: 0,
            compensationSource: VERSION, compensationType: 'fixed', currency: 'usd', createdAt: at()});
        }
        if (['accept','submit','approve'].includes(action)) {
          const c = contract.data();
          if (!c || c.immutable !== true || c.baseAmountCents !== 500 || c.bonusAmountCents !== 0 ||
              Object.entries(base).some(([k,v]) => c[k] !== v) || c.compensationSource !== VERSION) fail('contract_changed');
        }
        if (action === 'submit') {
          if (zone.exists || submission.exists) fail('submission_conflict');
          tx.create(zoneRef, {...base, assignedScalerId: config.scalerUid, status: 'submitted', reviewStatus: 'pending',
            zoneName: 'Payment certification task', gpsTracking: false, evidenceType: 'authenticated_task_attestation',
            certificationFixture: true, certificationPurpose: VERSION, submittedAt: at(), createdAt: at()});
          tx.create(submissionRef, {...base, status: 'submitted', reviewStatus: 'pending', certificationNotes: notes,
            evidenceType: 'authenticated_task_attestation', submittedBy: uid, acceptedAt: t.acceptedAt,
            attestation: 'I performed the assigned checks and described the actual result.', submittedAt: at(), createdAt: at()});
        }
        if (action === 'approve') {
          if (submission.data()?.submittedBy !== config.scalerUid || zone.data()?.status !== 'submitted' ||
              submission.data()?.evidenceType !== 'authenticated_task_attestation' || !t.acceptedAt) fail('submission_required');
          await settlementService({db, FieldValue, project: config.project, stripe}).commit(tx, {
            zoneId: IDS.zone, zone: zone.data(), contract: contract.data(), paymentId: IDS.payment, payment: payment.data(),
            payout: {baseAmountCents: 500, bonusAmountCents: 0, transferAmountCents: 500}, actorUid: uid,
            completionId: IDS.completion, source: 'ordinary_review', evidence: {authority: VERSION,
              evidenceType: 'authenticated_task_attestation', submissionId: IDS.completion, gpsRequired: false}});
        }
        tx.update(taskRef, {status: next, updatedAt: at(),
          ...(action === 'apply' ? {applicationState: 'applied', appliedAt: at()} : {}),
          ...(action === 'assign' ? {applicationState: 'accepted', assignmentState: 'assigned', assignedAt: at()} : {}),
          ...(action === 'accept' ? {assignmentState: 'accepted', acceptedAt: at()} : {})});
      }
      tx.create(taskRef.collection('audit').doc(action), {action, actorUid: uid, version: VERSION, timestamp: at(), environment: 'staging'});
    });
    if (action === 'approve') {
      // The normal staging settlement triggers also create the source reward.
      // Reconcile it first so both paths share its earned notification before
      // the payable-liability mirror runs, including delayed trigger delivery.
      await reconcileReferral();
    }
    return get(uid);
  }
  async function reconcileReferral() {
    await require('./scaler_referral_rewards').createService({db, FieldValue, project: config.project}).reconcile(IDS.zone);
    await createReconciler({db, FieldValue, Timestamp, project: config.project, launchPolicy: MANUAL_LAUNCH_POLICY, now}).reconcile(IDS.zone);
  }
  return {run, get};
}
module.exports = {createService, assertRuntime, assertPayment, VERSION, IDS, TASK, QUOTE};
