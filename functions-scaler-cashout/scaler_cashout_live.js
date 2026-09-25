'use strict';

const {
  fail,
  id,
  cents,
  projection,
  liveEligibility
} = require('./scaler_cashout_shared');
const {
  createStore,
  assertAccount,
  VERSION
} = require('./scaler_cashout_live_store');
const PLATFORM_EVENTS = ['transfer.created', 'transfer.reversed'];
const CONNECT_EVENTS = ['account.updated', 'payout.created', 'payout.updated', 'payout.paid', 'payout.failed', 'payout.canceled'];
function assertRuntime(r) {
  if (r.appEnv !== 'production' || r.project !== 'scaled-circle' || r.mode !== 'live' || !/^sk_live_[A-Za-z0-9]+$/.test(r.secretKey || '') || !/^acct_[A-Za-z0-9]+$/.test(r.platformId || '')) fail('cashout_live_environment_required');
}
function createRuntime({
  db,
  auth,
  stripe,
  config,
  now = Date.now
}) {
  assertRuntime(config);
  const runtime = () => ({
    ...config,
    enabled: config.enabled === true
  });
  const store = createStore(db, now);
  const provider = require('./scaler_cashout_provider').createStripeProvider({
    stripe,
    runtime,
    assertRuntime,
    eligibility: liveEligibility,
    mode: 'live'
  });
  async function platform() {
    assertRuntime(config);
    const [account, balance] = await Promise.all([stripe.accounts.retrieve(), stripe.balance.retrieve()]);
    if (account.id !== config.platformId || account.country !== 'US' || balance.livemode !== true || account.capabilities?.transfers !== 'active') fail('cashout_platform_mismatch');
  }
  async function actor(uid, admin = false) {
    if (!uid) fail('cashout_sign_in_required');
    const [a, u] = await Promise.all([auth.getUser(uid), db.doc('users/' + uid).get()]);
    const user = u.data();
    if (a.disabled || !a.emailVerified || ['closing', 'deleted'].includes(user?.accountStatus)) fail('cashout_account_unavailable');
    if (admin) {
      if (user?.role !== 'admin') fail('cashout_admin_required');
    } else {
      if (user?.role !== 'scaler' || !(user.active === true || user.betaAccess === 'approved')) fail('cashout_scaler_required');
    }
    return a;
  }
  async function funding(op) {
    await platform();
    if (op.replacementFunding) {
      if (config.recoveryEnabled !== true) fail('cashout_recovery_not_enabled');
      await require('./scaler_cashout_recovery').verifyReplacement({stripe,platformId:config.platformId,topupId:op.replacementFunding.topupId,amountCents:op.amountCents,requireAvailableBalance:!op.transferId,now});
      return;
    }
    for (const s of op.allocations) {
      const intent = await stripe.paymentIntents.retrieve(s.paymentIntentId);
      if (intent.livemode !== true || intent.status !== 'succeeded' || intent.amount_received !== s.paymentAmountCents || intent.currency !== 'usd' || intent.metadata?.paymentId !== s.paymentId || intent.metadata?.campaignId !== s.campaignId || intent.metadata?.businessUid !== s.businessId) fail('cashout_live_payment_unverified');
      const charge = await stripe.charges.retrieve(typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id);
      if (charge.livemode !== true || !charge.paid || charge.disputed || charge.currency !== 'usd' || charge.payment_intent !== intent.id || charge.amount_refunded > (s.allowedReturnCents || 0)) fail('cashout_live_charge_unverified');
    }
  }
  const rawCreatePayout = provider.createPayout.bind(provider);
  provider.createPayout = async op => {
    await funding(op);
    return rawCreatePayout(op);
  };
  const rawCreateTransfer = provider.createTransfer.bind(provider);
  provider.createTransfer = async op => {
    await funding(op);
    return rawCreateTransfer(op);
  };
  const service = require('./scaler_cashout_engine').createService({
    store,
    provider,
    runtime,
    now,
    assertRuntime: r => {
      assertRuntime(r);
    },
    accountEligibility: liveEligibility,
    assertRecipient: assertAccount
  });
  const accountRef = uid => db.doc('stripeConnectedAccounts/' + uid);
  // Stripe v2 has a 30-day replay window. Leave a one-day safety margin.
  const setupReplayWindow = 29 * 86400000;
  const setupBlocked = () => config.setupBlockedReason === 'platform_activation_required';
  async function health(uid) {
    const r = (await accountRef(uid).get()).data();
    if (!r?.stripeAccountId) {
      if (setupBlocked()) return {
        status: 'setup_unavailable',
        ready: false,
        setupRetryAllowed: false,
        setupMessage: "We couldn't start payout setup. ScaledCircle needs to resolve an activation issue with its payout provider. Your earnings are unchanged."
      };
      if (!r?.setupStartedAt) return {
        status: 'not_setup',
        ready: false,
        setupRetryAllowed: true
      };
      return {
        status: r.setupState === 'rejected' ? 'setup_failed' : 'setup_confirming',
        ready: false,
        setupRetryAllowed: now() >= r.setupStartedAt && now() - r.setupStartedAt < setupReplayWindow && !(r.setupLeaseUntil > now()),
        setupMessage: r.setupState === 'rejected' ? "We couldn't start payout setup. Please try again later or contact support." : "We're confirming your payout setup. Check its status before continuing."
      };
    }
    assertAccount(r, uid);
    const a = await provider.getAccount(r.stripeAccountId);
    if (a.scalerId !== uid) fail('cashout_account_mismatch');
    const result = liveEligibility(a, r.stripeAccountId);
    if (!result.ready && r.setupState === 'onboarding_incomplete') return {
      ...result,
      status: 'onboarding_incomplete',
      setupRetryAllowed: true,
      setupMessage: 'Finish setting up payouts to receive your earnings.'
    };
    return {
      ...result,
      setupRetryAllowed: true
    };
  }
  async function status(uid) {
    await actor(uid);
    await platform();
    let funds,
      attention = false;
    try {
      funds = await store.available(uid);
    } catch (e) {
      attention = true;
      funds = {
        availableCents: 0,
        pendingCents: 0,
        paidCents: 0
      };
    }
    let h;
    try {
      h = await health(uid);
    } catch {
      h = {
        status: 'needs_attention',
        ready: false
      };
    }
    const w = (await db.doc('wallets/' + uid).get()).data();
    const op = w?.activeCashoutOperationId ? await store.get(w.activeCashoutOperationId, uid) : null;
    return {
      mode: 'live',
      ...h,
      availableCents: funds.availableCents,
      pendingCents: funds.pendingCents,
      paidCents: funds.paidCents,
      executionEnabled: config.enabled === true && !attention,
      earningReviewRequired: attention,
      minimumCents: 1,
      maximumCents: 10000,
      operation: op ? projection(op) : null,
      message: attention ? 'Your earnings need review. Your money has not been removed.' : !h.ready ? 'Complete payout setup before cashing out.' : funds.availableCents > 0 ? 'Ready to cash out' : 'Approved work will appear in your available balance.'
    };
  }
  async function setup(uid) {
    const a = await actor(uid);
    await platform();
    if (config.enabled !== true) fail('cashout_execution_paused');
    const prior = (await accountRef(uid).get()).data();
    if (!prior?.stripeAccountId && setupBlocked()) fail('cashout_setup_platform_blocked');
    const first = await db.runTransaction(async tx => {
      const r = await tx.get(accountRef(uid));
      if (r.exists) {
        const v = r.data();
        if (v.mode !== 'live' || v.scalerId !== uid || v.authorityVersion !== VERSION) fail('cashout_account_mismatch');
        return {
          record: v,
          create: false
        };
      }
      const v = {
        scalerId: uid,
        mode: 'live',
        authorityVersion: VERSION,
        accountApi: 'accounts_v2',
        setupStartedAt: now(),
        setupState: 'creating',
        setupLeaseUntil: now() + 60000
      };
      tx.create(accountRef(uid), v);
      return {
        record: v,
        create: true
      };
    });
    let accountId = first.record.stripeAccountId;
    if (!accountId) {
      let account;
      const requested = {
        contact_email: a.email,
        dashboard: 'express',
        identity: {
          country: 'us'
        },
        defaults: {
          currency: 'usd',
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application'
          }
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  requested: true
                }
              }
            }
          }
        },
        metadata: {
          scalerId: uid,
          mode: 'live',
          authorityVersion: VERSION
        },
        include: ['configuration.recipient']
      };
      if (!first.create) {
        const matches = [];
        let cursor;
        for (let page = 0; page < 50; page++) {
          const list = await stripe.v2.core.accounts.list({
            limit: 20,
            ...(cursor ? {
              page: cursor
            } : {})
          });
          matches.push(...list.data.filter(x => x.metadata?.scalerId === uid && x.metadata?.mode === 'live' && x.metadata?.authorityVersion === VERSION));
          if (!list.next_page_url) break;
          cursor = new URL(list.next_page_url, 'https://api.stripe.com').searchParams.get('page');
          if (!cursor || page === 49) fail('cashout_setup_confirming');
        }
        if (matches.length > 1) fail('cashout_account_mismatch');
        account = matches[0];
      }
      if (!account) {
        const parameters = await db.runTransaction(async tx => {
          const v = (await tx.get(accountRef(uid))).data();
          if (v.stripeAccountId || !Number.isSafeInteger(v.setupStartedAt) || now() < v.setupStartedAt || now() - v.setupStartedAt >= setupReplayWindow || !first.create && v.setupLeaseUntil > now()) fail('cashout_setup_confirming');
          // Legacy calls used this same payload and deterministic key. Freeze
          // parameters before replay; never rotate the key or rely on an empty,
          // eventually-consistent provider list as proof of a failed creation.
          const parameters = v.setupRequest || requested;
          tx.update(accountRef(uid), {
            setupRequest: parameters,
            setupState: 'creating',
            setupLeaseUntil: now() + 60000,
            setupLastAttemptAt: now()
          });
          return parameters;
        });
        try {
          account = await stripe.v2.core.accounts.create(parameters, {
            idempotencyKey: 'scaledcircle:live:cashout-account:' + id(uid)
          });
        } catch (error) {
          const code = error.code || error.raw?.code;
          const rejected = error.statusCode === 400 && /^req_[A-Za-z0-9]+$/.test(error.requestId || '') && ['account_create_activation_required', 'connect_profile_not_submitted', 'connect_identity_not_verified', 'accounts_v2_access_blocked'].includes(code);
          const evidence = {
            phase: 'account_creation',
            state: rejected ? 'rejected' : 'confirming',
            at: now(),
            ...(Number.isInteger(error.statusCode) ? {
              httpStatus: error.statusCode
            } : {}),
            ...(/^[a-z][a-z0-9_]{0,100}$/.test(code || '') ? {
              providerCode: code
            } : {}),
            ...(/^req_[A-Za-z0-9]+$/.test(error.requestId || '') ? {
              providerRequestId: error.requestId
            } : {})
          };
          await db.runTransaction(async tx => {
            const v = (await tx.get(accountRef(uid))).data();
            if (!v.stripeAccountId) tx.update(accountRef(uid), {
              setupState: evidence.state,
              setupLeaseUntil: 0,
              setupFailure: evidence
            });
            tx.set(accountRef(uid).collection('setupEvents').doc(id(evidence)), evidence);
          });
          fail(rejected ? 'cashout_setup_provider_rejected' : 'cashout_setup_confirming');
        }
      }
      if (account?.livemode !== true || account.metadata?.scalerId !== uid || account.metadata?.mode !== 'live' || account.metadata?.authorityVersion !== VERSION || !/^acct_[A-Za-z0-9]+$/.test(account.id || '')) fail('cashout_account_mismatch');
      accountId = account.id;
      await db.runTransaction(async tx => {
        const [r, b] = (await Promise.all([tx.get(accountRef(uid)), tx.get(db.doc('stripeConnectedRecipients/' + accountId))])).map(x => x.data());
        if (r?.scalerId !== uid || r.mode !== 'live' || r.stripeAccountId && r.stripeAccountId !== accountId || b && b.scalerId !== uid) fail('cashout_account_mismatch');
        tx.update(accountRef(uid), {
          stripeAccountId: accountId,
          createdAtMillis: now(),
          setupState: 'onboarding_incomplete',
          setupLeaseUntil: 0
        });
        tx.set(db.doc('stripeConnectedRecipients/' + accountId), {
          scalerId: uid,
          accountId,
          mode: 'live',
          authorityVersion: VERSION
        });
      });
    }
    const verified = await provider.getAccount(accountId);
    if (verified.scalerId !== uid) fail('cashout_account_mismatch');
    await stripe.balanceSettings.update({
      payments: {
        payouts: {
          schedule: {
            interval: 'manual'
          }
        }
      }
    }, {
      stripeAccount: accountId,
      idempotencyKey: 'scaledcircle:live:manual-payouts:' + accountId
    });
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: 'https://scaledcircle.com/?connect=refresh#/scaler',
          return_url: 'https://scaledcircle.com/?connect=return#/scaler'
        }
      }
    });
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.hostname !== 'connect.stripe.com') fail('cashout_onboarding_url_invalid');
    await accountRef(uid).update({
      setupState: 'onboarding_incomplete',
      setupLinkIssuedAt: now()
    });
    return {
      url: link.url,
      mode: 'live'
    };
  }
  async function request(uid, input) {
    await actor(uid);
    await platform();
    if (config.enabled !== true) fail('cashout_execution_paused');
    cents(input?.amountCents);
    if (input.amountCents > 10000) fail('cashout_amount_invalid');
    const funds = await store.available(uid);
    if (funds.availableCents < input.amountCents && !funds.pendingCents) {
      const key = `cashout_${id('v1', 'live', uid, input?.requestId)}`;
      const prior = await db.doc('financialOperations/' + key).get();
      if (!prior.exists) fail('cashout_insufficient_balance');
    }
    return service.request(uid, input, (await accountRef(uid).get()).data());
  }
  async function reconcile(uid, input, admin = false) {
    await actor(uid, admin);
    if (Object.keys(input || {}).some(k => !['operationId', 'retry'].includes(k)) || !/^cashout_[a-f0-9]{64}$/.test(input?.operationId || '') || input.retry != null && typeof input.retry !== 'boolean') fail('cashout_request_invalid');
    const op = admin ? await store.lookup(input.operationId) : await store.get(input.operationId, uid);
    if (input.retry && config.enabled !== true) fail('cashout_execution_paused');
    await platform();
    const result = await service.run(op.id, op.ownerId, {
      readOnly: input.retry !== true,
      retryPayout: input.retry === true
    });
    if (admin) {
      const h = await health(op.ownerId);
      await accountRef(op.ownerId).update({
        health: h.status,
        healthCheckedAt: now()
      });
      return {
        ...result,
        connectHealth: h.status
      };
    }
    return result;
  }
  // Prepared operator action; no public endpoint or production activation in this batch.
  // Authorization binds one verified operating-cash credit to one existing obligation.
  // Execution remains the existing separately authorized reconcile/retry action.
  async function authorizeReplacementFunding(uid,input) {
    await actor(uid,true);assertRuntime(config);
    if(config.recoveryEnabled!==true)fail('cashout_recovery_not_enabled');
    if(!input||Object.keys(input).some(k=>!['scalerId','requestId','amountCents','topupId','authorizationRef','reason','expectedVersion'].includes(k))||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||typeof input.authorizationRef!=='string'||!/^[A-Za-z0-9_-]{8,180}$/.test(input.authorizationRef)||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>500)fail('cashout_recovery_authorization_required');
    await actor(input.scalerId);
    const amountCents=cents(input.amountCents);
    if(!amountCents)fail('cashout_request_invalid');
    const prior=(await db.doc('financialOperations/cashout_'+id('v1','live',input.scalerId,input.requestId)).get()).data();
    if(prior?.replacementFunding){
      const r=prior.replacementFunding;
      if(prior.amountCents!==amountCents||r.topupId!==input.topupId||r.authorizationRef!==input.authorizationRef||r.authorizedBy!==uid||r.reason!==input.reason.trim())fail('cashout_replacement_already_allocated');
      return {...projection(prior),replacementAuthorized:true,executionPerformed:false};
    }
    const proof=await require('./scaler_cashout_recovery').verifyReplacement({stripe,platformId:config.platformId,topupId:input.topupId,amountCents,now});
    const account=(await accountRef(input.scalerId).get()).data();assertAccount(account,input.scalerId);
    const existing=(await db.doc('financialOperations/cashout_'+id('v1','live',input.scalerId,input.requestId)).get()).data();
    // A usable original source needs no replacement authority or reservation.
    if(!existing?.replacementFunding){
      const preview=await store.previewRecovery(input.scalerId);
      let remaining=amountCents;const selected=[];for(const source of preview.sources.sort((a,b)=>a.earningId.localeCompare(b.earningId))){if(source.availableCents>0&&remaining>0){selected.push(source);remaining-=Math.min(remaining,source.availableCents);}}
      if(!existing&&remaining>0)fail('cashout_insufficient_balance');
      try{await funding(existing||{allocations:selected});fail('cashout_original_funding_still_usable');}
      catch(e){if(!['cashout_live_charge_unverified','cashout_live_payment_unverified'].includes(e.code))throw e;}
    }
    const op=await store.request(input.scalerId,input.requestId,amountCents,account.stripeAccountId,true);
    const updated=await store.authorizeReplacement(op.id,input.expectedVersion,proof,{actorUid:uid,authorizationRef:input.authorizationRef,reason:input.reason.trim()});
    return {...projection(updated),replacementAuthorized:true,executionPerformed:false};
  }
  async function adminList(uid) {
    await actor(uid, true);
    const index = await db.collection('scalerCashoutIndex').orderBy('createdAt', 'desc').limit(100).get();
    const operations = await Promise.all(index.docs.map(async d => {
      const o = await store.lookup(d.id);
      const account = (await accountRef(o.ownerId).get()).data();
      return {
        ...projection(o),
        scalerId: o.ownerId,
        requestedAt: o.createdAt,
        providerTransferId: o.transferId,
        providerPayoutId: o.payoutId,
        providerState: o.state,
        reserved: o.settled !== true,
        authorityVersion: o.authorityVersion,
        connectHealth: account?.health || 'Check provider status'
      };
    }));
    return {
      operations
    };
  }
  async function webhook({
    rawBody,
    signature,
    secret,
    scope
  }) {
    assertRuntime(config);
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    // Stripe reports this legacy name alongside transfer.reversed. Both only
    // trigger a fresh authoritative receipt read; event payloads never pay.
    if (event.type === 'transfer.canceled') event.type = 'transfer.reversed';
    if (event.livemode !== true || (scope === 'connected' ? !event.account : Boolean(event.account))) fail('cashout_webhook_scope_mismatch');
    if (!(scope === 'connected' ? CONNECT_EVENTS : PLATFORM_EVENTS).includes(event.type)) return {
      ignored: true
    };
    if (event.type === 'account.updated') {
      const binding = (await db.doc('stripeConnectedRecipients/' + event.account).get()).data();
      if (!binding) return {
        ignored: true
      };
      if (binding.mode !== 'live' || binding.accountId !== event.account || event.data?.object?.id !== event.account) fail('cashout_account_mismatch');
      return store.event(event.id, async () => {
        const h = await health(binding.scalerId);
        await accountRef(binding.scalerId).update({
          health: h.status,
          healthCheckedAt: now()
        });
      });
    }
    const key = event.data?.object?.metadata?.cashoutId;
    if (!/^cashout_[a-f0-9]{64}$/.test(key || '')) return {
      ignored: true
    };
    const op = await store.lookup(key);
    if (scope === 'connected' && event.account !== op.accountId || scope === 'platform' && event.account) fail('cashout_webhook_account_mismatch');
    return store.event(event.id, () => service.run(key, op.ownerId, {
      readOnly: true
    }));
  }
  async function sweep() {
    assertRuntime(config);
    await platform();
    const rows = await db.collection('scalerCashoutIndex').where('pending', '==', true).limit(50).get();
    const results = [];
    for (const d of rows.docs) {
      const op = await store.lookup(d.id);
      if (op.mode !== 'live' || op.settled === true || op.leaseUntil > now()) continue;
      try {
        const safeResume = config.enabled === true && ['reserved', 'platform_balance_pending', 'balance_pending'].includes(op.state);
        results.push(await service.run(d.id, op.ownerId, {
          readOnly: !safeResume
        }));
      } catch {
        results.push({
          operationId: d.id,
          status: 'needs_attention'
        });
      }
    }
    return {
      checked: results.length,
      results
    };
  }
  return {
    status,
    setup,
    request,
    reconcile,
    adminList,
    authorizeReplacementFunding,
    webhook,
    sweep,
    store,
    provider,
    service
  };
}
const KIND = 'scaler_cashout_v1';
module.exports = {
  createRuntime,
  assertRuntime,
  PLATFORM_EVENTS,
  CONNECT_EVENTS
};
