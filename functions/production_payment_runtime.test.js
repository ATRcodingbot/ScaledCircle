'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {prepare} = require('../tools/prepare_production_funding.cjs');
const {FUNDING_EXPORTS} = require('../tools/production_payment_runtime.cjs');
const candidate = process.env.PRODUCTION_FUNDING_CANDIDATE || prepare().output;
const source = fs.readFileSync(path.join(candidate, 'index.js'), 'utf8');
const localRequire = createRequire(path.join(candidate, 'index.js'));

function load(env) {
  const effects = {guards: 0, provider: 0, secrets: 0, reads: 0, writes: 0};
  const blocked = kind => () => { effects[kind]++; throw Error('Unexpected ' + kind); };
  const db = {collection: blocked('reads'), doc: blocked('reads'), runTransaction: blocked('writes'), batch: blocked('writes')};
  const lifecycle = localRequire('./campaign_funding_lifecycle');
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const definition = (options, handler) => { handler.__endpoint = {options}; return handler; };
  const mocks = {
    stripe: class Stripe { constructor() { effects.provider++; throw Error('Unexpected provider'); } },
    'firebase-admin/app': {initializeApp: () => ({}), getApps: () => []},
    'firebase-admin/auth': {getAuth: () => ({getUser: blocked('reads')})},
    'firebase-admin/firestore': {getFirestore: () => db, FieldValue: {serverTimestamp: blocked('writes')}, Timestamp: class Timestamp {}},
    'firebase-functions/v2/https': {onCall: definition, onRequest: definition, HttpsError},
    'firebase-functions/v2/scheduler': {onSchedule: definition},
    'firebase-functions/params': {defineSecret: () => ({value: blocked('secrets')})},
    'firebase-functions/logger': {error() {}, warn() {}, info() {}},
    './campaign_funding_lifecycle': {...lifecycle, paymentEnvironment(value) { effects.guards++; return lifecycle.paymentEnvironment(value); }},
  };
  const module = {exports: {}};
  vm.runInNewContext(source, {module, exports: module.exports, process: {env}, Buffer, console,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name)}, {filename: path.join(candidate, 'index.js')});
  return {handlers: module.exports, effects, env};
}

test('production exports are static with no APP_ENV, secret reads, provider calls or financial access', () => {
  const {handlers, effects} = load({GCLOUD_PROJECT: 'scaled-circle', FUNCTIONS_CONTROL_API: 'true'});
  assert.deepEqual(Object.keys(handlers).sort(), [...FUNDING_EXPORTS].sort());
  assert.deepEqual(effects, {guards: 0, provider: 0, secrets: 0, reads: 0, writes: 0});
});

for (const [name, env] of [
  ['missing APP_ENV', {GCLOUD_PROJECT: 'scaled-circle'}],
  ['staging APP_ENV', {GCLOUD_PROJECT: 'scaled-circle', APP_ENV: 'staging'}],
  ['wrong project', {GCLOUD_PROJECT: 'scaledcircle-staging', APP_ENV: 'production'}],
]) {
  for (const handler of FUNDING_EXPORTS) test(handler + ': ' + name + ' rejects before any authority access', async () => {
    const loaded = load(env);
    await assert.rejects(loaded.handlers[handler]({method: 'POST', data: {}, auth: {uid: 'someone', token: {email_verified: true}}}, {}), /production_environment_required/);
    assert.deepEqual(loaded.effects, {guards: 1, provider: 0, secrets: 0, reads: 0, writes: 0});
  });
}

for (const name of ['quoteCampaignFunding', 'createCampaignFundingCheckoutSession', 'publishFundedCampaign']) {
  test(name + ': correct production environment reaches unchanged authentication', async () => {
    const loaded = load({GCLOUD_PROJECT: 'scaled-circle', APP_ENV: 'production'});
    await assert.rejects(loaded.handlers[name]({data: {}}), {code: 'unauthenticated'});
    assert.deepEqual(loaded.effects, {guards: 1, provider: 0, secrets: 0, reads: 0, writes: 0});
  });
}

test('production webhook retains method validation after runtime guard', async () => {
  const loaded = load({GCLOUD_PROJECT: 'scaled-circle', APP_ENV: 'production'});
  let status;
  await loaded.handlers.stripeWebhook({method: 'GET'}, {status(value) { status = value; return this; }, send() {}});
  assert.equal(status, 405);
  assert.deepEqual(loaded.effects, {guards: 1, provider: 0, secrets: 0, reads: 0, writes: 0});
});

test('runtime identity is revalidated on every invocation, never cached at import', async () => {
  const loaded = load({GCLOUD_PROJECT: 'scaled-circle', APP_ENV: 'production'});
  await assert.rejects(loaded.handlers.quoteCampaignFunding({data: {}}), {code: 'unauthenticated'});
  delete loaded.env.APP_ENV;
  await assert.rejects(loaded.handlers.quoteCampaignFunding({data: {}}), /production_environment_required/);
  assert.deepEqual(loaded.effects, {guards: 2, provider: 0, secrets: 0, reads: 0, writes: 0});
});

test('runtime guard is first in every handler, provider factory and financial transition', () => {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const seen = [];
  traverse(parser.parse(source), {
    AssignmentExpression(p) {
      if (p.node.left?.object?.name !== 'exports') return;
      const first = p.node.right.arguments.at(-1).body.body[0];
      const call = first.type === 'VariableDeclaration' ? first.declarations[0].init : first.expression;
      assert.equal(call.callee.name, 'requirePaymentEnvironment');
      seen.push(p.node.left.property.name);
    },
    FunctionDeclaration(p) {
      if (!['stripeClient', 'transition'].includes(p.node.id.name)) return;
      const first = p.node.body.body[0];
      const call = first.type === 'VariableDeclaration' ? first.declarations[0].init : first.expression;
      assert.equal(call.callee.name, 'requirePaymentEnvironment');
      seen.push(p.node.id.name);
    },
  });
  assert.equal(seen.length, 7);
});
