'use strict';
// No public intent/discount creator. Private intent provisioning and activation
// require the separately reviewed, attended production certification runbook.
const crypto = require('node:crypto');
const contract = require('./subscription_contract');
const VERSION = 'FounderSubscriptionCertificationV1';
const PURPOSE = 'INTERNAL_LIVE_CERTIFICATION';
const COLLECTION = 'internalSubscriptionCertificationIntents';
const CONFIG = 'internalSubscriptionCertification/config';
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' ? value : value?.id;
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function requireValue(ok, message = 'The private certification binding needs review.') {
  if (!ok) fail('failed-precondition', message);
}
function rejectClientDiscounts(data = {}) {
  if (data == null) return;
  if (typeof data !== 'object' || Array.isArray(data)) fail('invalid-argument', 'Choose a valid subscription request.');
  if (['coupon', 'couponId', 'discount', 'discounts', 'promotionCode', 'promotion_code', 'allow_promotion_codes', 'quantity'].some(k => Object.hasOwn(data, k)))
    fail('invalid-argument', 'Discounts and quantities cannot be supplied by the client.');
}
function validateIntent(intent, {intentId, gate, runtime, uid, businessId, priceId, now}) {
  requireValue(runtime.environment === 'production' && runtime.projectId === 'scaled-circle' && runtime.enabled === true,
    'Internal subscription certification is disabled.');
  requireValue(gate?.enabled === true && gate.version === VERSION && gate.activeIntentId === intentId,
    'Internal subscription certification is disabled.');
  requireValue(/^[a-f0-9]{40}$/.test(runtime.sourceSha || '') && /^[a-f0-9]{64}$/.test(runtime.packageSeal || ''));
  requireValue(intent?.version === VERSION && intent.purpose === PURPOSE && intent.environment === 'production');
  requireValue(intent.ownerUid === uid && intent.businessId === businessId && uid === businessId,
    'Only the designated Business owner can use this certification.');
  requireValue(intent.sourceSha === runtime.sourceSha && intent.packageSeal === runtime.packageSeal &&
    gate.sourceSha === runtime.sourceSha && gate.packageSeal === runtime.packageSeal);
  requireValue(intent.priceId === priceId && gate.starterPriceId === priceId && intent.quantity === 1 &&
    intent.plan === 'starter' && intent.currency === 'usd' && intent.subtotalCents === 9900 && intent.totalDueCents === 0);
  requireValue(/^cus_[A-Za-z0-9]+$/.test(intent.customerId || '') && /^acct_[A-Za-z0-9]+$/.test(intent.accountId || '') && gate.accountId === intent.accountId);
  requireValue(Number.isSafeInteger(intent.createdAtMs) && Number.isSafeInteger(intent.expiresAtMs) &&
    intent.createdAtMs <= now && intent.expiresAtMs > now && intent.expiresAtMs - intent.createdAtMs <= MAX_WINDOW_MS);
  requireValue(['unused', 'reserved', 'consumed', 'hold'].includes(intent.status));
  return intent;
}
function couponValid(coupon, intent, {used = false} = {}) {
  requireValue(coupon && !coupon.deleted && coupon.id === intent.couponId && coupon.livemode === true &&
    coupon.percent_off === 100 && coupon.duration === 'once' && coupon.max_redemptions === 1 &&
    coupon.redeem_by === Math.floor(intent.expiresAtMs / 1000) &&
    coupon.applies_to?.products?.length === 1 && coupon.applies_to.products[0] === intent.productId &&
    coupon.metadata?.purpose === PURPOSE && coupon.metadata?.certificationIntentId === intent.intentId &&
    (used ? coupon.times_redeemed === 1 : coupon.times_redeemed === 0 && coupon.valid === true),
  'The certification discount needs provider reconciliation.');
}
function sessionValid(session, lines, intent, {complete = false} = {}) {
  const discount = session.discounts?.[0];
  requireValue(session.livemode === true && session.mode === 'subscription' && id(session.customer) === intent.customerId &&
    session.metadata?.purchaseType === 'subscription' && session.metadata?.firebaseUid === intent.businessId &&
    session.metadata?.certificationIntentId === intent.intentId && session.metadata?.purpose === PURPOSE &&
    session.currency === 'usd' && session.amount_subtotal === 9900 && session.amount_total === 0 &&
    session.total_details?.amount_discount === 9900 && (session.total_details.amount_tax || 0) === 0 &&
    session.discounts?.length === 1 && id(discount.coupon) === intent.couponId && !discount.promotion_code &&
    session.allow_promotion_codes !== true && session.payment_method_collection === 'if_required' && session.expires_at === intent.checkoutExpiresAt &&
    !lines.has_more && lines.data?.length === 1 && lines.data[0].price?.id === intent.priceId &&
    lines.data[0].quantity === 1 && lines.data[0].amount_subtotal === 9900 && lines.data[0].amount_total === 0 &&
    (complete ? session.status === 'complete' && ['paid', 'no_payment_required'].includes(session.payment_status) : session.status === 'open'),
  'The certification Checkout amount or identity needs reconciliation.');
}
function createService({db, FieldValue, workspace, legal, stripe, runtime, priceId, now = Date.now}) {
  const refFor = intentId => db.doc(`${COLLECTION}/${intentId}`);
  async function preflight(intent) {
    const [account, customer, subscriptions, invoices, items, methods] = await Promise.all([
      stripe.accounts.retrieve(), stripe.customers.retrieve(intent.customerId),
      stripe.subscriptions.list({customer: intent.customerId, status: 'all', limit: 100}),
      stripe.invoices.list({customer: intent.customerId, limit: 100}),
      stripe.invoiceItems.list({customer: intent.customerId, pending: true, limit: 1}),
      stripe.paymentMethods.list({customer: intent.customerId, limit: 1}),
    ]);
    requireValue(account.id === intent.accountId && customer.id === intent.customerId && !customer.deleted && customer.livemode === true &&
      customer.metadata?.firebaseUid === intent.businessId && customer.balance === 0 &&
      !customer.default_source && !customer.invoice_settings?.default_payment_method &&
      !methods.has_more && methods.data?.length === 0 && !items.has_more && items.data?.length === 0 &&
      !subscriptions.has_more && subscriptions.data.every(s => ['canceled', 'incomplete_expired'].includes(s.status)) &&
      !invoices.has_more && invoices.data.every(i => ['paid', 'void'].includes(i.status)),
    'Existing billing or payment-method state needs review before a zero-dollar certification.');
  }
  async function confirmedSession(sessionId, intent, complete = false) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {expand: ['discounts.coupon']});
    const lines = await stripe.checkout.sessions.listLineItems(sessionId, {limit: 100});
    sessionValid(session, lines, intent, {complete});
    return session;
  }
  async function readback(intent) {
    // Repeated invocations NEVER issue a provider create. A missing/unknown
    // Checkout remains HOLD for attended investigation, even after key expiry.
    if (!intent.checkoutSessionId) fail('unavailable', 'Certification is reserved. Reconcile the existing attempt; do not start another.');
    const session = await confirmedSession(intent.checkoutSessionId, intent, intent.status === 'consumed');
    if (intent.status === 'consumed') return {sessionId: session.id, url: null, alreadyCompleted: true};
    requireValue(session.expires_at * 1000 > now(), 'The certification Checkout has expired.');
    return {sessionId: session.id, url: session.url, plan: 'starter', monthlyCents: 9900, amountDueCents: 0, certification: true};
  }
  return {
    async checkout({uid, businessId, intentId, selection, data = {}}) {
      rejectClientDiscounts(data);
      if (!/^[A-Za-z0-9_-]{20,128}$/.test(intentId || '')) fail('invalid-argument', 'A valid private certification reference is required.');
      requireValue(runtime.enabled === true && runtime.environment === 'production' && runtime.projectId === 'scaled-circle',
        'Internal subscription certification is disabled.');
      const selected = contract.selectionTerms(selection);
      requireValue(selected.plan === 'starter' && !selected.bundle && selected.addons.length === 0 && selected.items.length === 1,
        'Only the designated Starter selection is permitted.');
      await workspace.actor(uid);
      const authority = await workspace.authority({uid, businessId, permission: 'billing', allowExpired: true});
      requireValue(authority.isOwner === true && authority.businessId === uid, 'Only the designated Business owner can use this certification.');
      await legal.requireCurrent({uid, agreementTypes: ['terms', 'privacy']});
      const ref = refFor(intentId), gateRef = db.doc(CONFIG), walletRef = db.doc(`wallets/${businessId}`);
      const check = (intent, gate) => validateIntent(intent, {intentId, gate, runtime, uid, businessId, priceId, now: now()});
      const gate = (await gateRef.get()).data(), original = check((await ref.get()).data(), gate);
      if (original.status !== 'unused') return readback(original);
      requireValue(original.expiresAtMs - now() >= 35 * 60 * 1000, 'The attended certification window is too short.');
      const {terms} = await contract.certifyPrice(stripe, priceId, {environment: 'production', requireActive: true, planForPrice: value => value === priceId ? 'starter' : null});
      await preflight(original);
      const attemptId = crypto.randomUUID(), couponId = 'internal_cert_' + digest(intentId).slice(0, 40);
      let intent, claimed = false;
      await db.runTransaction(async tx => {
        // Firestore may rerun the transaction callback after contention. A
        // tentative claim from an aborted attempt is never publication authority.
        claimed = false;
        const [snapshot, currentGate, wallet, inv] = await Promise.all([tx.get(ref), tx.get(gateRef), tx.get(walletRef), workspace.inventory(businessId, tx)]);
        intent = check(snapshot.data(), currentGate.data());
        if (intent.status !== 'unused') return;
        requireValue(digest(JSON.stringify(intent)) === digest(JSON.stringify(original)), 'The private intent changed during validation.');
        await workspace.authority({uid, businessId, permission: 'billing', allowExpired: true, transaction: tx});
        requireValue(inv.members.length === 0 && !inv.invitations.some(i => i.status === 'pending' && i.expiresAt?.toMillis() > now()), 'Starter certification requires the owner-only workspace.');
        const w = wallet.data() || {};
        requireValue(w.stripeCustomerId === intent.customerId && !w.pendingSubscriptionCertificationIntentId &&
          !(w.pendingSubscriptionExpiresMs > now()) && (!w.stripeSubscriptionId || ['canceled', 'incomplete_expired'].includes(w.subscriptionStatus)),
        'Existing membership or Checkout must be reconciled first.');
        intent = {...intent, intentId, status: 'reserved', phase: 'coupon_creating', attemptId, couponId, productId: terms.productId,
          checkoutExpiresAt: Math.floor(now() / 1000) + 31 * 60};
        tx.update(ref, {...intent, reservedAt: FieldValue.serverTimestamp()});
        tx.set(walletRef, {pendingSubscriptionCertificationIntentId: intentId, pendingSubscriptionRequestId: attemptId,
          pendingSubscriptionPlan: 'starter', pendingSubscriptionExpiresMs: intent.expiresAtMs}, {merge: true});
        claimed = true;
      });
      if (!claimed) return readback(intent);
      try {
        const metadata = {purpose: PURPOSE, certificationIntentId: intentId};
        const coupon = await stripe.coupons.create({id: couponId, name: PURPOSE, percent_off: 100, duration: 'once', max_redemptions: 1,
          redeem_by: Math.floor(intent.expiresAtMs / 1000), applies_to: {products: [terms.productId]}, metadata},
        {idempotencyKey: `certification_coupon_${attemptId}`});
        couponValid(coupon, intent);
        await ref.update({phase: 'checkout_creating', couponConfirmedAt: FieldValue.serverTimestamp()});
        const session = await stripe.checkout.sessions.create({mode: 'subscription', customer: intent.customerId,
          line_items: [{price: priceId, quantity: 1}], discounts: [{coupon: couponId}], allow_promotion_codes: false,
          payment_method_collection: 'if_required', expires_at: intent.checkoutExpiresAt,
          success_url: 'https://scaledcircle.com/?billing=success', cancel_url: 'https://scaledcircle.com/?billing=cancelled',
          metadata: {...metadata, firebaseUid: businessId, purchaseType: 'subscription', ...contract.selectionMetadata(selected)},
          subscription_data: {metadata: {...metadata, firebaseUid: businessId, ...contract.selectionMetadata(selected), checkoutRequestId: attemptId}}},
        {idempotencyKey: `certification_checkout_${attemptId}`});
        requireValue(/^cs_live_[A-Za-z0-9]+$/.test(session.id || ''), 'The certification Checkout identity needs reconciliation.');
        // Persist the known ID before any further request/validation.
        await ref.update({checkoutSessionId: session.id});
        intent.checkoutSessionId = session.id;
        const verified = await confirmedSession(session.id, intent);
        await ref.update({phase: 'checkout_ready', checkoutVerifiedAt: FieldValue.serverTimestamp()});
        return {url: verified.url, sessionId: verified.id, plan: 'starter', monthlyCents: 9900, amountDueCents: 0, certification: true};
      } catch (_) {
        await ref.update({status: 'hold', heldAt: FieldValue.serverTimestamp(), holdReason: 'provider_outcome_or_binding_requires_reconciliation'});
        fail('unavailable', 'Certification needs reconciliation. Do not create another Checkout or discount.');
      }
    },
  };
}

// Called only after the maintained signed webhook has retrieved and certified
// provider subscription state. No synthetic invoice/entitlement is created here.
async function reconcile({db, FieldValue, stripe, subscription, invoice, session}) {
  if (subscription.metadata?.purpose !== PURPOSE) return false;
  const intentId = subscription.metadata.certificationIntentId;
  requireValue(/^[A-Za-z0-9_-]{20,128}$/.test(intentId || ''));
  const ref = db.doc(`${COLLECTION}/${intentId}`), intent = (await ref.get()).data();
  requireValue(intent && ['reserved', 'hold', 'consumed'].includes(intent.status) && intent.ownerUid === intent.businessId &&
    subscription.livemode === true && subscription.metadata.firebaseUid === intent.businessId && id(subscription.customer) === intent.customerId &&
    subscription.metadata.checkoutRequestId === intent.attemptId && subscription.items.data.length === 1 &&
    subscription.items.data[0].price.id === intent.priceId && subscription.items.data[0].quantity === 1 &&
    (!intent.subscriptionId || intent.subscriptionId === subscription.id));
  requireValue(session?.id || intent.checkoutSessionId, 'The existing Checkout identity needs reconciliation.');
  const current = await stripe.checkout.sessions.retrieve(session?.id || intent.checkoutSessionId, {expand: ['discounts.coupon']});
  const lines = await stripe.checkout.sessions.listLineItems(current.id, {limit: 100});
  sessionValid(current, lines, intent, {complete: true});
  requireValue((!intent.checkoutSessionId || current.id === intent.checkoutSessionId) && id(current.subscription) === subscription.id);
  const coupon = await stripe.coupons.retrieve(intent.couponId);
  couponValid(coupon, intent, {used: true});
  requireValue(coupon.valid === false, 'The one-use certification discount has not been exhausted.');
  if (invoice && invoice.billing_reason === 'subscription_create') {
    requireValue(invoice.status === 'paid' && invoice.subtotal === 9900 && invoice.total === 0 && invoice.amount_paid === 0 &&
      invoice.amount_due === 0 && invoice.amount_remaining === 0 && invoice.total_discount_amounts?.reduce((sum, d) => sum + d.amount, 0) === 9900,
    'The certification invoice amount needs reconciliation.');
  }
  await db.runTransaction(async tx => {
    const [snapshot, gate] = await Promise.all([tx.get(ref), tx.get(db.doc(CONFIG))]);
    const prior = snapshot.data();
    requireValue(prior.attemptId === intent.attemptId && (!prior.subscriptionId || prior.subscriptionId === subscription.id) &&
      (!prior.checkoutSessionId || prior.checkoutSessionId === current.id));
    if (prior.status === 'consumed') return;
    tx.update(ref, {status: 'consumed', phase: 'provider_reconciled', checkoutSessionId:current.id,
      subscriptionId: subscription.id, couponExhausted: true, consumedAt: FieldValue.serverTimestamp()});
    if (gate.data()?.activeIntentId === intentId) tx.update(db.doc(CONFIG), {enabled: false, completedIntentId: intentId, disabledAt: FieldValue.serverTimestamp()});
  });
  return true;
}
module.exports = {VERSION, PURPOSE, COLLECTION, CONFIG, rejectClientDiscounts, validateIntent, couponValid, sessionValid, createService, reconcile};
