'use strict';

const {
  initializeApp
} = require('firebase-admin/app');
const {
  getStorage
} = require('firebase-admin/storage');
const {
  getFirestore,
  FieldValue
} = require('firebase-admin/firestore');
const {
  getAuth
} = require('firebase-admin/auth');
const {
  onCall,
  onRequest,
  HttpsError
} = require('firebase-functions/v2/https');
const {
  onSchedule
} = require('firebase-functions/v2/scheduler');
const {
  defineSecret
} = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const Stripe = require('stripe');
initializeApp();
const key = defineSecret('STRIPE_LIVE_SECRET_KEY');
const platformSecret = defineSecret('STRIPE_CASHOUT_LIVE_PLATFORM_WEBHOOK_SECRET');
const connectSecret = defineSecret('STRIPE_CASHOUT_LIVE_CONNECT_WEBHOOK_SECRET');
const options = {
  region: 'us-east1',
  timeoutSeconds: 120,
  maxInstances: 3,
  invoker: 'public'
};
function runtime() {
  const secretKey = key.value();
  return require('./scaler_cashout_live').createRuntime({
    db: getFirestore(),
    auth: getAuth(),
    stripe: new Stripe(secretKey, {
      maxNetworkRetries: 0,
      timeout: 10000
    }),
    config: {
      appEnv: process.env.APP_ENV,
      project: process.env.GCLOUD_PROJECT,
      mode: 'live',
      secretKey,
      platformId: process.env.SCALEDCIRCLE_STRIPE_PLATFORM_ID,
      enabled: process.env.SCALEDCIRCLE_CASHOUT_LIVE_ENABLED === 'true'
    }
  });
}
function callable(fn) {
  return onCall({
    ...options,
    secrets: [key]
  }, async request => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
    try {
      return await fn(runtime(), request.auth.uid, request.data || {});
    } catch (error) {
      const reason = /^cashout_[a-z_]+$/.test(error?.code || '') ? error.code : 'cashout_review_required';
      logger.warn('Cash-out request requires review', {
        reason,
        actorUid: request.auth.uid
      });
      throw new HttpsError('failed-precondition', reason === 'cashout_setup_confirming' ? 'We are confirming your payout setup. Please check its status before trying again.' : 'This payout needs attention. Refresh its status; your earnings are preserved.', {
        reason
      });
    }
  });
}
const empty = data => {
  if (Object.keys(data).length) throw Object.assign(Error('Unexpected input'), {
    code: 'cashout_request_invalid'
  });
};
exports.getScalerCashoutV1 = callable((r, uid, d) => {
  empty(d);
  return r.status(uid);
});
exports.setupScalerPayoutsV1 = callable((r, uid, d) => {
  empty(d);
  return r.setup(uid);
});
exports.requestScalerCashoutV1 = callable((r, uid, d) => r.request(uid, d));
exports.reconcileScalerCashoutV1 = callable((r, uid, d) => r.reconcile(uid, d));
exports.adminScalerCashoutsV1 = callable((r, uid, d) => {
  empty(d);
  return r.adminList(uid);
});
exports.adminReconcileScalerCashoutV1 = callable((r, uid, d) => r.reconcile(uid, d, true));
function webhook(secret, scope) {
  return onRequest({
    ...options,
    secrets: [key, secret]
  }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    try {
      const result = await runtime().webhook({
        rawBody: req.rawBody,
        signature: req.headers['stripe-signature'],
        secret: secret.value(),
        scope
      });
      return res.status(200).json(result);
    } catch (error) {
      const reason = /^cashout_[a-z_]+$/.test(error?.code || '') ? error.code : 'cashout_event_unconfirmed';
      logger.warn('Cash-out event requires reconciliation', {
        reason,
        scope
      });
      return res.status(error?.type === 'StripeSignatureVerificationError' || reason.includes('mismatch') ? 400 : 503).send('Payout event awaiting verified reconciliation.');
    }
  });
}
exports.scalerCashoutLiveWebhookV1 = webhook(platformSecret, 'platform');
exports.scalerCashoutLiveConnectWebhookV1 = webhook(connectSecret, 'connected');
exports.recheckScalerCashoutsV1 = onSchedule({
  region: 'us-east1',
  schedule: 'every 5 minutes',
  timeZone: 'America/New_York',
  timeoutSeconds: 300,
  maxInstances: 1,
  secrets: [key]
}, async () => {
  const result = await runtime().sweep();
  logger.info('Cash-out reconciliation completed', {
    checked: result.checked
  });
});
function workRuntime() {
  const secretKey = key.value();
  const config = {
    appEnv: process.env.APP_ENV,
    project: process.env.GCLOUD_PROJECT,
    mode: 'live',
    secretKey,
    platformId: process.env.SCALEDCIRCLE_STRIPE_PLATFORM_ID,
    paidWorkEnabled: process.env.LIVE_PAID_WORK_ACTIVATION_ENABLED,
    permit: process.env.LIVE_WORK_CERTIFICATION_JSON
  };
  require('./scaler_cashout_live').assertRuntime(config);
  return require('./live_work_certification').createService({
    db: getFirestore(),
    auth: getAuth(),
    FieldValue,
    bucket: getStorage().bucket(),
    stripe: new Stripe(secretKey, {
      maxNetworkRetries: 0,
      timeout: 10000
    }),
    config,
    quoteForCampaign: require('./campaign_funding_lifecycle').quoteForCampaign
  });
}
exports.liveWorkCertificationV1 = callable((_r, uid, d) => {
  const service = workRuntime();
  return Object.keys(d).length ? service.run(uid, d) : service.get(uid);
});
