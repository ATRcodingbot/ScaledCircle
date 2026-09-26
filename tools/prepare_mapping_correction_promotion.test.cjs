'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {patchIndex, declarations, declaration} = require('./prepare_mapping_correction_promotion.cjs');
const source = '// live preamble\r\nconst financialAuthority = Object.freeze({retained:true});\r\n' +
  declarations.map(name => `async function ${name}(input) { ${name === 'smartZoneCampaign' ? "liveAuthority(input); const selectedArea = true; " : ''}return 'old ${name}'; }`).join('\r\n// retained separator\r\n') +
  '\r\nexports.getSmartZonePlan = businessOperation("retained", existingGuard);\r\n// live suffix';
const maintained = declarations.map(name => `async function ${name}(input) { ${name === 'smartZoneCampaign' ? "missingMonolithDependency(input); const selectedArea = true; " : ''}return 'new ${name}'; }`).join('\n');
test('only the three reviewed declarations change; wrappers and all outside bytes remain exact', () => {
  const patched = patchIndex(source, maintained);
  assert.equal(patched, source.replaceAll("return 'old ", "return 'new "));
});
test('missing or duplicate declarations fail closed', () => {
  assert.throws(() => patchIndex(source.replace('function smartZoneCampaign', 'function other'), maintained), /one function/);
  assert.throws(() => patchIndex(source + '\nasync function smartZoneCampaign() {}', maintained), /already been declared|one function/);
});
test('malformed replacement source is rejected before producing an overlay', () => {
  assert.throws(() => patchIndex(source, maintained + '\nconst incomplete = ;'));
});

const root = path.resolve(__dirname, '..');
for (const target of ['getSmartZonePlan', 'applySmartZonePlan']) {
  const baseline = path.join(root, '.firebase/mapping-correction/baselines', target, 'base/index.js');
  test(`actual ${target} overlay preserves authorization negatives before area/provider work`, {skip: !fs.existsSync(baseline)}, async () => {
    const original = fs.readFileSync(baseline, 'utf8');
    const patched = patchIndex(original, fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'));
    const node = declaration(patched, 'smartZoneCampaign');
    const originalNode = declaration(original, 'smartZoneCampaign');
    const text = patched.slice(node.start, node.end), old = original.slice(originalNode.start, originalNode.end);
    assert.equal(text.split('const selectedArea')[0], old.split('const selectedArea')[0]);
    assert.doesNotMatch(text, /campaignExecution\./);
    class HttpsError extends Error {constructor(code, message) {super(message); this.code = code;}}
    for (const scenario of [
      {role: 'scaler', error: 'permission-denied'},
      {businessId: 'other', error: 'permission-denied'},
      {executionMode: 'marketplace', paid: false, error: 'permission-denied'},
      {executionMode: 'own_team', status: 'funded', error: 'failed-precondition'},
      {executionMode: 'own_team', paid: false},
      {executionMode: 'marketplace', paid: true},
    ]) {
      let areaCalls = 0;
      const campaign = {businessId: scenario.businessId || 'owner', executionMode: scenario.executionMode || 'own_team', status: scenario.status || 'draft'};
      const sandbox = {HttpsError, readText: value => value,
        authenticatedUserContext: async () => ({uid: 'owner', role: scenario.role || 'business'}),
        db: {collection: collection => ({doc: () => ({get: async () => ({exists: true,
          data: () => collection === 'campaigns' ? campaign : {paid: scenario.paid === true}})})})},
        subscriptionEntitlements: {hasActivePaidBusinessEntitlement: value => value.paid},
        smartZoneSelectedArea: async () => {areaCalls++; return {geometry: [{latitude: 1, longitude: 1}, {latitude: 1, longitude: 2}, {latitude: 2, longitude: 1}]};},
        smartZoneAnchor: () => ({latitude: 1, longitude: 1}), operations: {zoneGeometryDigest: () => 'digest'}};
      vm.createContext(sandbox);
      vm.runInContext(text + ';globalThis.run = smartZoneCampaign;', sandbox);
      if (scenario.error) {
        await assert.rejects(sandbox.run({data: {campaignId: 'test'}}), error => error.code === scenario.error);
        assert.equal(areaCalls, 0);
      } else {assert.equal((await sandbox.run({data: {campaignId: 'test'}})).sourceAreaDigest, 'digest'); assert.equal(areaCalls, 1);}
    }
  });
}
