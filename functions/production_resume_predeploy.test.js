'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {verifyProductionResume} = require('../tools/verify_production_resume.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = 'a'.repeat(40);
function fixture(change = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-resume-'));
  const runtime = path.join(dir, 'package/campaign-funding'); fs.mkdirSync(runtime, {recursive: true});
  const phase5 = ['functions:campaign-funding:publishFundedCampaign', ...Array.from({length: 29}, (_, i) => 'functions:campaign-funding:pending' + i)];
  const phase6 = ['functions:campaign-funding:stripeWebhook'];
  const completed = Array.from({length: 61}, (_, i) => 'functions:completed:done' + i);
  const contents = {
    'package/campaign-funding/index.js': "exports.example = () => 'static';\n",
    'package/campaign-funding/.env.scaled-circle': 'APP_ENV=production\nINTERNAL_SUBSCRIPTION_CERTIFICATION_ENABLED=false\n',
    'promotion-manifest.private.json': JSON.stringify({source, functions: [...phase5, ...phase6, ...completed].map(selector => ({selector}))}),
    'resume-manifest.private.json': JSON.stringify({source, project: 'scaled-circle', phases: {5: phase5, 6: phase6}, completedSelectors: completed}),
    'firebase.candidate.private.json': JSON.stringify({functions: [{codebase: 'campaign-funding', source: runtime}]}),
  };
  change(contents);
  for (const [n, content] of Object.entries(contents)) fs.writeFileSync(path.join(dir, n), content);
  const seal = JSON.stringify({source, files: Object.fromEntries(Object.entries(contents).map(([n, content]) => [n, sha(content)]))});
  fs.writeFileSync(path.join(dir, 'sealed-package-hashes.private.json'), seal);
  return {dir, options: {project: 'scaled-circle', packageDir: dir, expectedSource: source, expectedSeal: sha(seal), phase: '5', selectors: phase5}};
}
function cleanup(dir) {
  const target = path.resolve(dir);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('production-resume-'));
  fs.rmSync(target, {recursive: true, force: true});
}
function check(name, mutation, pattern, change) { test(name, () => { const f = fixture(change); try { mutation(f); assert.throws(() => verifyProductionResume(f.options), pattern); } finally { cleanup(f.dir); } }); }
test('exact pinned remaining selection and production environment pass read-only', () => {
  const f = fixture(); try { const result = verifyProductionResume(f.options); assert.equal(result.status, 'PASS'); assert.equal(result.mutations, 0); assert.equal(result.selectors.length, 30); } finally { cleanup(f.dir); }
});
check('wrong project rejected', f => { f.options.project = 'scaledcircle-staging'; }, /production_project_required/);
check('wrong source rejected', f => { f.options.expectedSource = 'b'.repeat(40); }, /package_source_mismatch/);
check('wrong seal rejected', f => { f.options.expectedSeal = 'b'.repeat(64); }, /package_seal_mismatch/);
check('tampered package rejected', f => { fs.appendFileSync(path.join(f.dir, 'package/campaign-funding/index.js'), 'changed'); }, /package_file_mismatch/);
check('blanket functions selector rejected', f => { f.options.selectors = ['functions']; }, /selector_list_mismatch/);
check('completed selector replay rejected', f => { f.options.selectors[0] = 'functions:completed:done0'; }, /selector_list_mismatch/);
check('missing deployment APP_ENV rejected even with otherwise valid seal', () => {}, /strictly equal|production_environment_required/, c => { c['package/campaign-funding/.env.scaled-circle'] = ''; });
check('staging deployment environment rejected', () => {}, /production_environment_required/, c => { c['package/campaign-funding/.env.scaled-circle'] = 'APP_ENV=staging\n'; });
check('conflicting Firebase identity rejected', () => {}, /firebase_project_mismatch/, c => { c['package/campaign-funding/.env.scaled-circle'] += 'GCLOUD_PROJECT=scaledcircle-staging\n'; });
check('unsealed runtime addition rejected', f => { fs.writeFileSync(path.join(f.dir, 'package/campaign-funding/extra.js'), ''); }, /unsealed_runtime_file/);
check('certification activation rejected', () => {}, /held_gate_changed/, c => { c['package/campaign-funding/.env.scaled-circle'] = 'APP_ENV=production\nINTERNAL_SUBSCRIPTION_CERTIFICATION_ENABLED=true\n'; });
