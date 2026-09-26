'use strict';

// Add a precondition around the existing pinned handler. The original callable
// options and economic implementation stay byte-for-byte in the AST subtree.
function guardLegacyProgram(program, name, parser) {
  const declaration = program.program.body.find(node =>
    node.type === 'ExpressionStatement' && node.expression?.left?.object?.name === 'exports' &&
    node.expression?.left?.property?.name === name);
  const callable = declaration?.expression?.right;
  if (callable?.type !== 'CallExpression' || callable.arguments.length < 2) {
    throw Error('Missing pinned callable guard target: ' + name);
  }
  const original = callable.arguments[callable.arguments.length - 1];
  const wrapper = parser.parseExpression(`async request => {
    await require('./campaign_execution_authority').assertRequestMarketplace({
      db, request, resource: ${JSON.stringify(name)}, ErrorType: HttpsError
    });
    return ORIGINAL_HANDLER(request);
  }`);
  wrapper.body.body[1].argument.callee = original;
  callable.arguments[callable.arguments.length - 1] = wrapper;
  return program;
}

module.exports = {guardLegacyProgram};
