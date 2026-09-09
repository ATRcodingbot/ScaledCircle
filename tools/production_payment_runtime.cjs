'use strict';
// Production-only source preparation. Never executes a handler or contacts a provider.
const assert = require('node:assert/strict');
const parser = require('../functions/node_modules/@babel/parser');
const traverse = require('../functions/node_modules/@babel/traverse').default;

const FUNDING_EXPORTS = Object.freeze([
  'quoteCampaignFunding', 'createCampaignFundingCheckoutSession',
  'publishFundedCampaign', 'stripeWebhook', 'reconcileUnusedWorkReservesV1',
]);

function deferProductionPaymentEnvironment(source) {
  const ast = parser.parse(source);
  let declaration;
  const guarded = new Map();
  const exports = [];
  traverse(ast, {
    Program(program) {
      const binding = program.scope.getBinding('PAYMENT_ENVIRONMENT');
      assert.ok(binding && binding.path.isVariableDeclarator(), 'Missing import-time payment environment');
      const init = binding.path.node.init;
      assert.equal(init?.callee?.object?.name, 'lifecycle');
      assert.equal(init?.callee?.property?.name, 'paymentEnvironment');
      assert.equal(init.arguments?.[0]?.object?.name, 'process');
      assert.equal(init.arguments?.[0]?.property?.name, 'env');
      declaration = binding.path.parentPath.node;
      assert.equal(declaration.declarations.length, 1);
      for (const reference of binding.referencePaths) {
        const fn = reference.getFunctionParent();
        assert.ok(fn?.node.body?.type === 'BlockStatement', 'Payment environment used during discovery');
        guarded.set(fn.node, true);
      }
    },
    AssignmentExpression(p) {
      const {left, right} = p.node;
      if (left?.object?.name !== 'exports') return;
      const name = left.property?.name;
      assert.ok(FUNDING_EXPORTS.includes(name), 'Unexpected production funding export: ' + name);
      assert.ok(['onCall', 'onRequest', 'onSchedule'].includes(right.callee?.name));
      const fn = right.arguments.at(-1);
      assert.equal(fn?.body?.type, 'BlockStatement');
      exports.push(name);
      if (!guarded.has(fn)) guarded.set(fn, false);
    },
    FunctionDeclaration(p) {
      // Defense in depth: validate before secrets/provider initialization and economic writes.
      if (['stripeClient', 'transition'].includes(p.node.id.name) && !guarded.has(p.node)) {
        guarded.set(p.node, false);
      }
    },
  });
  assert.deepEqual(exports.sort(), [...FUNDING_EXPORTS].sort());
  const edits = [{start: declaration.start, end: declaration.end,
    text: 'function requirePaymentEnvironment() {\n  return lifecycle.paymentEnvironment(process.env);\n}'}];
  for (const [fn, usesValue] of guarded) edits.push({start: fn.body.start + 1, end: fn.body.start + 1,
    text: usesValue ? '\n  const PAYMENT_ENVIRONMENT = requirePaymentEnvironment();' : '\n  requirePaymentEnvironment();'});
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

module.exports = {deferProductionPaymentEnvironment, FUNDING_EXPORTS};
