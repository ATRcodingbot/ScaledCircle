'use strict';

// This projection never touches campaign funding, contracts or Wallet balances.
const PRICES = {starter: 99, growth: 299, scale: 499, managed_growth: 999};
const terminal = new Set(['canceled', 'incomplete_expired']);
function subscriptionTerms(subscription, planForPrice, environment) {
  return require('./subscription_contract').providerTerms(subscription,{planForPrice,environment});
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
      const workspace=db.doc(`businessWorkspaces/${uid}`);
      const [seen, owner, w, e, workspaceSnapshot] = await Promise.all([
        tx.get(event), tx.get(db.doc(`users/${uid}`)), tx.get(wallet), tx.get(entitlement),tx.get(workspace),
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
      const pending=workspaceSnapshot.data()?.pendingMembershipSelection;
      const itemKey=items=>JSON.stringify(items.map(i=>({price:typeof i.price==='string'?i.price:i.price.id,quantity:i.quantity})).sort((a,b)=>a.price.localeCompare(b.price)));
      if(pending&&itemKey(pending.items)===itemKey(subscription.items.data)&&subscription.items.data.every(i=>Number(i.current_period_start||subscription.current_period_start)*1000>=pending.effectiveAtMs)){
        tx.update(workspace,{pendingSeatLimit:FieldValue.delete(),pendingMembershipSelection:FieldValue.delete(),revision:FieldValue.increment(1)});
      }
      // Release only this ended subscription's Checkout reservation. A delayed
      // event must never clear a newer reactivation request.
      const releaseCheckout = terminal.has(subscription.status) &&
        subscription.metadata?.checkoutRequestId &&
        w.data()?.pendingSubscriptionRequestId === subscription.metadata.checkoutRequestId;
      tx.set(wallet, {ownerId: uid, subscriptionPlan: terms.plan, subscriptionPrice: terms.price,
        subscriptionBundle:terms.bundle,subscriptionAddons:terms.bundle?['business_assistant','lead_generation_research']:terms.addons,
        subscriptionStatus: active ? 'active' : subscription.status, subscriptionExpiresAt: expiration,
        subscriptionComped: false, subscriptionSource: 'stripe', stripeSubscriptionId: subscription.id,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        ...(releaseCheckout ? {pendingSubscriptionRequestId: FieldValue.delete(),
          pendingSubscriptionPlan: FieldValue.delete(),pendingSubscriptionSelection:FieldValue.delete(), pendingSubscriptionExpiresMs: FieldValue.delete(),
          ...(w.data()?.pendingStarterIntroClaimId===subscription.metadata?.introClaimId && subscription.metadata?.introClaimId ? {pendingStarterIntroClaimId:FieldValue.delete()} : {}),
          ...(w.data()?.pendingSubscriptionCertificationIntentId===subscription.metadata?.certificationIntentId ? {pendingSubscriptionCertificationIntentId:FieldValue.delete()} : {})} : {}),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.set(entitlement, {businessId: uid, plan: terms.plan, planId: terms.plan, price: terms.price,
        bundle:terms.bundle,addons:terms.bundle?['business_assistant','lead_generation_research']:terms.addons,
        productEntitlements:terms.entitlements,seatLimit:terms.seats,monthlyCents:terms.monthlyCents,
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
