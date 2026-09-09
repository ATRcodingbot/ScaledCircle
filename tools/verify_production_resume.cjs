'use strict';
// Pure pre-deployment verification: no Firebase/Stripe calls, writes or deployment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function verifyProductionResume({project, packageDir, expectedSource, expectedSeal, phase, selectors}) {
  assert.equal(project, 'scaled-circle', 'production_project_required');
  assert.match(expectedSource || '', /^[a-f0-9]{40}$/, 'exact_source_required');
  assert.match(expectedSeal || '', /^[a-f0-9]{64}$/, 'exact_seal_required');
  const base = path.resolve(packageDir);
  const sealPath = path.join(base, 'sealed-package-hashes.private.json');
  assert.equal(sha(fs.readFileSync(sealPath)), expectedSeal, 'package_seal_mismatch');
  const seal = read(sealPath);
  assert.equal(seal.source, expectedSource, 'package_source_mismatch');
  for (const [relative, digest] of Object.entries(seal.files)) {
    assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'invalid_package_path');
    assert.equal(sha(fs.readFileSync(path.join(base, relative))), digest, 'package_file_mismatch: ' + relative);
  }
  const manifest = read(path.join(base, 'promotion-manifest.private.json'));
  const resume = read(path.join(base, 'resume-manifest.private.json'));
  const config = read(path.join(base, 'firebase.candidate.private.json'));
  assert.equal(manifest.source, expectedSource);
  assert.equal(resume.source, expectedSource);
  assert.equal(resume.project, project);
  assert.ok(['5', '6'].includes(String(phase)), 'remaining_phase_required');
  const exact = resume.phases[String(phase)];
  assert.ok(exact?.length, 'missing_phase_selection');
  assert.ok(Array.isArray(selectors) && selectors.length > 0, 'exact_selectors_required');
  assert.equal(new Set(selectors).size, selectors.length, 'duplicate_selector');
  assert.deepEqual([...selectors].sort(), [...exact].sort(), 'selector_list_mismatch');
  const remaining = Object.values(resume.phases).flat();
  assert.equal(new Set(remaining).size, 31, 'remaining_inventory_mismatch');
  assert.equal(resume.completedSelectors.length, 61, 'completed_inventory_mismatch');
  assert.equal(new Set([...remaining, ...resume.completedSelectors]).size, 92, 'phase_overlap');
  assert.deepEqual([...remaining, ...resume.completedSelectors].sort(), manifest.functions.map(x => x.selector).sort());
  assert.ok(remaining.includes('functions:campaign-funding:publishFundedCampaign'), 'reviewed_publish_replacement_required');
  const codebases = [...new Set(selectors.map(x => x.split(':')[1]))];
  for (const codebase of codebases) {
    const group = config.functions.find(x => x.codebase === codebase);
    const directory = path.join(base, 'package', codebase);
    assert.ok(group, 'missing_codebase');
    assert.equal(path.resolve(group.source), directory, 'unsealed_source_directory');
    const envPath = 'package/' + codebase + '/.env.scaled-circle';
    assert.ok(seal.files[envPath], 'sealed_production_environment_required');
    const lines = fs.readFileSync(path.join(base, envPath), 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#'));
    const env = Object.fromEntries(lines.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    assert.equal(lines.filter(x => x.startsWith('APP_ENV=')).length, 1);
    assert.equal(env.APP_ENV, 'production', 'production_environment_required');
    for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) if (env[key]) assert.equal(env[key], project, 'firebase_project_mismatch');
    if (env.FIREBASE_CONFIG) assert.equal(JSON.parse(env.FIREBASE_CONFIG).projectId, project, 'firebase_project_mismatch');
    for (const key of ['CANVASSING_NEW_CONTRACTS_ENABLED', 'UNUSED_WORK_REFUNDS_ENABLED', 'INTERNAL_SUBSCRIPTION_CERTIFICATION_ENABLED']) {
      if (key in env) assert.equal(env[key], 'false', 'held_gate_changed: ' + key);
    }
    for (const relative of Object.keys(seal.files).filter(x => x.startsWith('package/' + codebase + '/') && /\.(js|json)$|\/\.env\./.test(x))) {
      const text = fs.readFileSync(path.join(base, relative), 'utf8');
      assert.ok(!/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|STRIPE_TEST_SECRET|STAGING_PHYSICAL/.test(text), 'forbidden_runtime_identity: ' + relative);
    }
    const actual = [];
    function walk(dir, prefix) {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        assert.ok(!entry.isSymbolicLink(), 'unexpected_runtime_link');
        const relative = prefix + entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), relative + '/');
        else actual.push(relative);
      }
    }
    walk(directory, 'package/' + codebase + '/');
    assert.deepEqual(actual.sort(), Object.keys(seal.files).filter(x => x.startsWith('package/' + codebase + '/')).sort(), 'unsealed_runtime_file');
  }
  return {status: 'PASS', project, source: expectedSource, seal: expectedSeal, phase: String(phase), selectors, codebases, sealedFiles: Object.keys(seal.files).length, mutations: 0};
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => i % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[i + 1]]], []));
  try {
    console.log(JSON.stringify(verifyProductionResume({project: args.project, packageDir: args.package, expectedSource: args.source, expectedSeal: args.seal, phase: args.phase, selectors: args.selectors?.split(',')})));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {verifyProductionResume};
