'use strict';
// Packaged only by prepare_staging_payment_certification.js. Never exported by
// the production/shared index or included in a production Firebase manifest.
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const {createService, assertRuntime} = require('./staging_payment_certification');
initializeApp();
const key = defineSecret('STRIPE_TEST_SECRET_KEY');
exports.stagingPaymentCertificationV1 = onCall({region: 'us-east1', maxInstances: 2,
  timeoutSeconds: 60, secrets: [key]}, async request => {
  const config = {project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    appEnv: process.env.APP_ENV, enabled: process.env.STAGING_PAYMENT_CERTIFICATION_ENABLED,
    liveEnabled: process.env.LIVE_PAID_WORK_ACTIVATION_ENABLED,
    adminUid: process.env.CERTIFICATION_ADMIN_UID, businessUid: process.env.CERTIFICATION_BUSINESS_UID,
    scalerUid: process.env.CERTIFICATION_SCALER_UID, referrerUid: process.env.CERTIFICATION_REFERRER_UID};
  try {
    assertRuntime(config);
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to the intended staging account.');
    const stripe = () => {
      assertRuntime(config);
      if (!/^sk_test_/.test(key.value())) throw Error('test_key_required');
      return new (require('stripe'))(key.value());
    };
    return await createService({db: getFirestore(), auth: getAuth(), FieldValue, Timestamp, config, stripe})
      .run(request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn('Staging payment certification held.', {reason: error.message, actorUid: request.auth?.uid || null});
    const messages = {staging_only: 'This path is disabled outside staging. LIVE payments remain blocked.',
      actor_not_authorized: 'This private staging task is not assigned to your account.',
      verified_account_required: 'Verify your email and sign in again.', consent_required: 'Current agreements are required.',
      task_state_changed: 'The task state changed. Refresh before continuing.',
      verified_test_funding_required: 'Waiting for signed TEST payment reconciliation.',
      describe_actual_checks_required: 'Describe the actual checks and observations in at least 20 characters.',
      checkout_outcome_pending: 'Checkout outcome is pending. Refresh before retrying; no second payment is required.',
      checkout_requires_review: 'The existing Checkout needs review. A replacement will not be created.',
      explicit_confirmation_required: 'Confirm this action after reviewing the task.'};
    throw new HttpsError(error.message === 'actor_not_authorized' ? 'permission-denied' : 'failed-precondition',
      messages[error.message] || 'This action could not be verified. Refresh the task; no success should be assumed.');
  }
});
