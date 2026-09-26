'use strict';
// Pure narrow source overlay; Python performs candidate/config/IAM checks.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const parser = require(path.join(root, 'functions/node_modules/@babel/parser'));
const declarations = ['smartZoneSelectedArea', 'smartZoneCampaign', 'generateSmartZonePlan'];
function declaration(source, name) {
  const found = parser.parse(source).program.body.filter(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  if (found.length !== 1) throw Error('Expected one function declaration: ' + name);
  return found[0];
}
function selectionStart(node) {
  const found = node.body.body.filter(item => item.type === 'VariableDeclaration' &&
    item.declarations.some(value => value.id.type === 'Identifier' && value.id.name === 'selectedArea'));
  if (found.length !== 1) throw Error('Expected one selectedArea declaration in smartZoneCampaign');
  return found[0].start;
}
function patchIndex(source, maintained) {
  // Resolve and apply from right to left so bytes outside these ranges stay exact.
  const edits = declarations.map(name => {
    const before = declaration(source, name), after = declaration(maintained, name);
    // Authorization is already deployed and remains byte-exact. The maintained
    // monolith has a different authority dependency from these live packages.
    return name === 'smartZoneCampaign' ?
      {start: selectionStart(before), end: before.end, text: maintained.slice(selectionStart(after), after.end)} :
      {start: before.start, end: before.end, text: maintained.slice(after.start, after.end)};
  }).sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of edits) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  parser.parse(result);
  return result;
}
if (require.main === module) {
  const [baseline, output] = process.argv.slice(2);
  if (!baseline || !output) throw Error('An exact baseline index and output index are required.');
  const result = patchIndex(fs.readFileSync(baseline, 'utf8'), fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'));
  fs.writeFileSync(output, result);
}
module.exports = {patchIndex, declarations, declaration};
