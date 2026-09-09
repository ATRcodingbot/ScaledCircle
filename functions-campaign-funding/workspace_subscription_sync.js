'use strict';

// This projection never touches campaign funding, contracts or Wallet balances.
const PRICES = {starter: 99, growth: 299, scale: 499, managed_growth: 999};
const terminal = new Set(['canceled', 'incomplete_expired']);
function subscriptionTerms(subscription, planForPrice, environment) {
  const items = subscription.items?.data || [];
  const price = items[0]?.price;
  const {plan}=require('./subscription_contract').priceTerms(price,{planForPrice,environment});
  require('./subscription_contract').assertMode(subscription,environment);
  if (subscription.metadata?.plan!==plan || items.length !== 1 || !PRICES[plan] || Number(items[0].quantity) !== 1 ||
      price?.currency !== 'usd' || price.unit_amount !== PRICES[plan] * 100 ||
      price.recurring?.interval !== 'month' || Number(price.recurring?.interval_count || 1) !== 1) {
    throw new Error('subscription_terms_mismatch');
  }
  const end = Number(items[0].current_period_end || subscription.current_period_end) * 1000;
  if (!Number.isFinite(end) || end <= 0) throw new Error('subscription_period_required');
  return {plan, price: PRICES[plan], end};
}
function createSubscriptionSync({db, FieldValue, Timestamp, planForPrice, environment}) {
  return async function sync(subscription, eventId) {
    const uid = subscription.metadata?.firebaseUid;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(uid || '')) return {ignored: 'unbound'};
    const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const terms = subscriptionTerms(subscription, planForPrice, environment);
    return db.runTransaction(async tx => {
      const event = db.doc(`stripeEvents/${eventId}`);
      const wallet = db.doc(`wallets/${uid}`), entitlement = db.doc(`businessSubscriptions/${uid}`);
      const [seen, owner, w, e] = await Promise.all([
        tx.get(event), tx.get(db.doc(`users/${uid}`)), tx.get(wallet), tx.get(entitlement),
      ]);
      if (seen.exists) return {duplicate: true};
      // Metadata alone cannot establish customer or workspace authority.
      if (!owner.exists || String(owner.data().role).toLowerCase() !== 'business' ||
          !customer || w.data()?.stripeCustomerId !== customer) return {ignored: 'customer_binding'};
      const previous = e.data()?.stripeSubscriptionId || w.data()?.stripeSubscriptionId;
      if (previous && previous !== subscription.id) {
        const oldStatus = e.data()?.status || w.data()?.subscriptionStatus;
        const requestId = subscription.metadata?.checkoutRequestId;
        if (!terminal.has(oldStatus) || !requestId || w.data()?.pendingSubscriptionRequestId !== requestId) {
          return {ignored: 'subscription_binding'};
        }
      }
      const active = ['active', 'trialing'].includes(subscription.status);
      const expiration = Timestamp.fromMillis(terms.end);
      // Release only this ended subscription's Checkout reservation. A delayed
      // event must never clear a newer reactivation request.
      const releaseCheckout = terminal.has(subscription.status) &&
        subscription.metadata?.checkoutRequestId &&
        w.data()?.pendingSubscriptionRequestId === subscription.metadata.checkoutRequestId;
      tx.set(wallet, {ownerId: uid, subscriptionPlan: terms.plan, subscriptionPrice: terms.price,
        subscriptionStatus: active ? 'active' : subscription.status, subscriptionExpiresAt: expiration,
        subscriptionComped: false, subscriptionSource: 'stripe', stripeSubscriptionId: subscription.id,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        ...(releaseCheckout ? {pendingSubscriptionRequestId: FieldValue.delete(),
          pendingSubscriptionPlan: FieldValue.delete(), pendingSubscriptionExpiresMs: FieldValue.delete()} : {}),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.set(entitlement, {businessId: uid, plan: terms.plan, planId: terms.plan, price: terms.price,
        status: active ? 'active' : subscription.status, expiresAt: expiration,
        stripeSubscriptionId: subscription.id, stripeCustomerId: customer, source: 'stripe',
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.create(event, {type: `customer.subscription.${subscription.status}`, businessId: uid,
        subscriptionId: subscription.id, processedAt: FieldValue.serverTimestamp()});
      return {synced: true};
    });
  };
}
module.exports = {PRICES, subscriptionTerms, createSubscriptionSync};
