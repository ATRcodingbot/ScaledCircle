'use strict';
// Offline-only overlays onto independently captured, current deployed archives.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const parser = require(path.join(root, 'functions/node_modules/@babel/parser'));
const state = path.join(root, '.firebase/mapping-qa');
const modules = ['smart_zone_planning.js', 'smart_zone_geography.js', 'smart_zone_serviceability.js', 'smart_zone_entry_contract.js'];
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Unexpected live source anchor: ' + before.slice(0, 100));
  return source.replace(before, after);
}
function declaration(source, name) {
  const node = parser.parse(source).program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  if (!node) throw Error('Missing function: ' + name);
  return {start: node.start, end: node.end, text: source.slice(node.start, node.end)};
}
function patchIndex(source) {
  const name = 'generateSmartZonePlan';
  const original = declaration(source, name);
  const maintained = declaration(fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'), name);
  let result = source.slice(0, original.start) + maintained.text + source.slice(original.end);
  result = once(result, '} = await generateSmartZonePlan(input, request.data?.desiredHours));',
    '} = await generateSmartZonePlan(input, request.data?.desiredHours));\n    smartZonePlanning.assertApplicablePlan(plan);');
  result = once(result, 'const currentPlan = smartZonePlanning.generatePlan(smartZonePlanArguments(currentInput, request.data?.desiredHours, geographicSnapshot));',
    'const currentPlan = smartZonePlanning.generatePlan(smartZonePlanArguments(currentInput, request.data?.desiredHours, geographicSnapshot));\n    smartZonePlanning.assertApplicablePlan(currentPlan);');
  result = once(result, 'homeCountMethod: "smart_zone_conservative_density_v1",',
    'homeCountMethod: "osm_classified_mapped_features_v2",\n      smartZoneTargetEvidence: {...zone.targetEvidence, geometryDigest: operations.zoneGeometryDigest(zone.geometry)},\n      smartZoneQuality: zone.quality,\n      smartZonePlanningTargets: zone.planningTargets,\n      smartZonePlanningNetwork: zone.planningNetwork,');
  parser.parse(result);
  return result;
}
function inventory(directory) {
  const walk = (folder, prefix = '') => fs.readdirSync(folder, {withFileTypes: true}).flatMap(item => {
    if (item.isSymbolicLink()) throw Error('Source symlink is not accepted.');
    return item.isDirectory() ? walk(path.join(folder, item.name), prefix + item.name + '/') : [prefix + item.name];
  });
  return Object.fromEntries(walk(directory).sort().map(file => [file, hash(fs.readFileSync(path.join(directory, file)))]));
}
function prepare() {
  const entries = [];
  for (const name of ['getSmartZonePlan', 'applySmartZonePlan', 'businessOperationsV1']) {
    const baseline = path.join(state, 'base', name), output = path.join(state, 'packages', name);
    const beforeMetadataFile = path.join(state, name + '-before.private.json');
    const original = JSON.parse(fs.readFileSync(beforeMetadataFile, 'utf8').replace(/^\uFEFF/, ''));
    if (original.name !== `projects/scaled-circle/locations/us-east1/functions/${name}`) throw Error('Unexpected target metadata.');
    const before = inventory(baseline);
    fs.cpSync(baseline, output, {recursive: true});
    const operations = name === 'businessOperationsV1';
    if (operations) fs.copyFileSync(path.join(root, 'functions-business-operations/campaign_planning.js'), path.join(output, 'campaign_planning.js'));
    else {
      fs.writeFileSync(path.join(output, 'index.js'), patchIndex(fs.readFileSync(path.join(baseline, 'index.js'), 'utf8')));
      for (const file of modules) fs.copyFileSync(path.join(root, 'functions', file), path.join(output, file));
    }
    const files = inventory(output);
    if (Object.keys(before).some(file => !files[file])) throw Error('Source file removed unexpectedly.');
    const changed = Object.keys(files).filter(file => files[file] !== before[file]);
    if (changed.some(file => !(operations ? ['campaign_planning.js'] : ['index.js', ...modules]).includes(file))) throw Error('Unexpected source or dependency change.');
    entries.push({name, project: 'scaled-circle', region: 'us-east1', output, beforeMetadataFile,
      liveSource: original.buildConfig.source.storageSource, preservedRuntime: original.buildConfig.runtime,
      preservedServiceConfig: original.serviceConfig, files,
      archiveSha256: hash(fs.readFileSync(path.join(state, name + '-source.zip'))),
      changedFiles: changed.map(file => ({file, before: before[file] || null, after: files[file]}))});
  }
  const manifest = path.join(state, 'promotion-manifest.private.json');
  fs.writeFileSync(manifest, JSON.stringify({project: 'scaled-circle', deployed: false, entries}, null, 2));
  return {manifest, targets: entries.map(e => e.name), changedFiles: entries.map(e => ({name: e.name, files: e.changedFiles.map(f => f.file)}))};
}
if (require.main === module) console.log(JSON.stringify(prepare(), null, 2));
module.exports = {prepare, patchIndex, inventory, modules};
