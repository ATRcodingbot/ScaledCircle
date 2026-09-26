'use strict';

// Offline overlays of separately downloaded, generation-pinned deployed source.
// Never regenerates or replaces a marketplace economic implementation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseEnv} = require('node:util');
const root = path.resolve(__dirname, '..');
const parser = require(path.join(root, 'functions/node_modules/@babel/parser'));
const base = path.join(root, '.firebase/campaign-authority');
const guarded = ['quoteCampaignFunding', 'createCampaignFundingCheckoutSession', 'publishFundedCampaign',
  'getCampaignFundingState', 'fundCampaign', 'applyToCampaign', 'assignScalerToZone',
  'assignScalerToCampaignLocations', 'configureZoneGroupAssignment', 'acceptZoneGroupSlot',
  'startTrackingSession', 'initializeCampaignCompletion', 'startCampaignCompletion',
  'appendCampaignCompletionEvidence', 'submitCampaignCompletion', 'submitZoneCompletion',
  'reviewCampaignCompletion', 'finalizeZoneReview', 'approveZonePayout'];
const planning = ['getSmartZonePlan', 'applySmartZonePlan', 'analyzeCampaignZone'];
const targets = [...guarded, ...planning, 'projectCampaignDiscoveryV1'];
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Deployed source anchor drift: ' + before.slice(0, 100));
  return source.replace(before, after);
}
function files(directory, prefix = '') {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(item => item.isDirectory()
    ? files(path.join(directory, item.name), prefix + item.name + '/') : [prefix + item.name]);
}
function overlay(output, file, transform) {
  const filename = path.join(output, file);
  const original = fs.readFileSync(filename, 'utf8');
  const result = transform(original);
  if (result === original) throw Error('No overlay for ' + file);
  fs.writeFileSync(filename, result);
}
function wrapHandler(output, name, file = 'index.js') {
  const filename = path.join(output, file), source = fs.readFileSync(filename, 'utf8');
  const ast = parser.parse(source);
  const exports = ast.program.body.filter(node => node.type === 'ExpressionStatement' &&
    node.expression?.left?.object?.name === 'exports' && node.expression?.left?.property?.name === name);
  const expression = exports.at(-1)?.expression?.right;
  if (expression?.type === 'MemberExpression' && expression.object?.callee?.name === 'require') {
    const dependency = expression.object.arguments[0]?.value;
    if (!/^\.\/[\w-]+$/.test(dependency)) throw Error('Unreviewed re-export: ' + name);
    const stem = path.join(path.dirname(file), dependency.slice(2));
    return wrapHandler(output, name, fs.existsSync(path.join(output, stem + '.js')) ? stem + '.js' : path.join(stem, 'index.js'));
  }
  if (expression?.type !== 'CallExpression' || expression.arguments.length < 1) throw Error('Callable missing: ' + name);
  const handler = expression.arguments.at(-1);
  const original = source.slice(handler.start, handler.end);
  let helper = path.relative(path.dirname(filename), path.join(output, 'campaign_execution_authority')).replaceAll('\\', '/');
  if (!helper.startsWith('.')) helper = './' + helper;
  const wrapped = `async request => {
    await require(${JSON.stringify(helper)}).assertRequestMarketplace({db, request, resource: ${JSON.stringify(name)}, ErrorType: HttpsError});
    return (${original})(request);
  }`;
  const result = source.slice(0, handler.start) + wrapped + source.slice(handler.end);
  parser.parse(result);
  // Only the original handler argument is surrounded; everything else is exact.
  if (result.replace(wrapped, () => original) !== source) throw Error('Unexpected source drift: ' + name);
  fs.writeFileSync(filename, result);
  return file.replaceAll('\\', '/');
}

function prepare() {
  const metadata = JSON.parse(fs.readFileSync(path.join(base, 'live-functions.private.json'), 'utf8').replace(/^\uFEFF/, ''));
  const entries = [];
  for (const name of targets) {
    const live = metadata.find(entry => entry.name === `projects/scaled-circle/locations/us-east1/functions/${name}`);
    if (!live?.buildConfig?.source?.storageSource) throw Error('No generation-pinned live function: ' + name);
    const source = path.join(base, 'base', name), output = path.join(base, 'packages', name);
    fs.cpSync(source, output, {recursive: true});
    const baseline = Object.fromEntries(files(source).map(file => [file, hash(fs.readFileSync(path.join(source, file)))]));
    let guardedFile;
    if (guarded.includes(name)) {
      guardedFile = wrapHandler(output, name);
      fs.copyFileSync(path.join(root, 'functions/campaign_execution_authority.js'), path.join(output, 'campaign_execution_authority.js'));
    }
    if (name === 'startTrackingSession') overlay(output, 'index.js', current => once(current,
      "        const campaign = (await db.doc('campaigns/' + zone.campaignId).get()).data();",
      "        const campaign = (await db.doc('campaigns/' + zone.campaignId).get()).data();\n        require('./campaign_execution_authority').assertMarketplace(campaign, HttpsError);"));
    if (['quoteCampaignFunding', 'createCampaignFundingCheckoutSession', 'publishFundedCampaign'].includes(name)) {
      overlay(output, 'index.js', current => {
        let result = once(current, "  const valid = require('./production_publish_compatibility').productionValidZones(docs, input.campaignId, input.uid);",
          "  require('./campaign_execution_authority').assertMarketplace(input.campaign, HttpsError);\n  require('./campaign_execution_authority').assertPlanningReview(input.campaign, docs.map(d => ({...d.data(), id: d.id})), HttpsError);\n  const valid = require('./production_publish_compatibility').productionValidZones(docs, input.campaignId, input.uid);");
        result = once(result, "    const currentZones = await transaction.get(db.collection('campaignZones').where('campaignId', '==', input.campaignId));",
          "    const currentZones = await transaction.get(db.collection('campaignZones').where('campaignId', '==', input.campaignId));\n    require('./campaign_execution_authority').assertMarketplace(fresh, HttpsError);\n    require('./campaign_execution_authority').assertPlanningReview(fresh, currentZones.docs.map(d => ({...d.data(), id: d.id})), HttpsError);");
        return once(result, "    if (campaign.status === 'open') return {",
          "    require('./campaign_execution_authority').assertMarketplace(campaign, HttpsError);\n    if (campaign.status !== 'open') require('./campaign_execution_authority').assertPlanningReview(campaign, docs.map(d => ({...d.data(), id: d.id})), HttpsError);\n    if (campaign.status === 'open') return {");
      });
    }
    if (planning.includes(name)) {
      overlay(output, 'workspace_access.js', current => {
        let result = once(current, 'const NEW_PAID=new Set(', "const OWN_TEAM_PLANNING=new Set(['getSmartZonePlan','applySmartZonePlan','analyzeCampaignZone']);\nconst NEW_PAID=new Set(");
        result = once(result, 'if(target?.businessId)businessId=target.businessId;', `if(target?.businessId)businessId=target.businessId;
  let planningCampaign=target;
  if(OWN_TEAM_PLANNING.has(name)&&data.zoneId&&target?.campaignId){
    planningCampaign=(await db.doc('campaigns/'+resourceId(target.campaignId)).get()).data();
    if(!planningCampaign||planningCampaign.businessId!==target.businessId){const e=new Error('Campaign authority is unavailable.');e.code='permission-denied';throw e;}
  }
  const ownTeamPlanning=OWN_TEAM_PLANNING.has(name)&&planningCampaign?.executionMode==='own_team';`);
        return once(result, 'allowExpired:!NEW_PAID.has(name)', 'allowExpired:ownTeamPlanning||!NEW_PAID.has(name)');
      });
      if (name !== 'analyzeCampaignZone') overlay(output, 'index.js', current => once(current,
        'if (!subscriptionEntitlements.hasActivePaidBusinessEntitlement(entitlement)) {',
        "if (campaign.executionMode !== 'own_team' && !subscriptionEntitlements.hasActivePaidBusinessEntitlement(entitlement)) {"));
      if (name === 'applySmartZonePlan') overlay(output, 'index.js', current => {
        const begin = current.indexOf('exports.applySmartZonePlan =');
        if (begin < 0) throw Error('Missing live Smart Zone application');
        return current.slice(0, begin) + once(current.slice(begin), '  const input = await smartZoneCampaign(request);',
          "  const input = await smartZoneCampaign(request);\n  if (input.campaign.executionMode === 'own_team' && request.data?.useRecommendedPay === true) throw new HttpsError('failed-precondition', 'Own-team planning cannot set Scaler compensation.');");
      });
      if (name === 'analyzeCampaignZone') overlay(output, 'production_mapping_service.js', current => once(current,
        "if(process.env.CANVASSING_NEW_CONTRACTS_ENABLED!=='true') {",
        "if(campaign.executionMode==='own_team'||process.env.CANVASSING_NEW_CONTRACTS_ENABLED!=='true') {"));
    }
    if (name === 'projectCampaignDiscoveryV1') overlay(output, 'policy.js', current => once(current,
      "if (!source) return {document: null, reason: 'source_absent'};",
      "if (!source) return {document: null, reason: 'source_absent'};\n  if (Object.hasOwn(source, 'executionMode') && source.executionMode !== 'marketplace') return {document: null, reason: 'private_execution_mode'};"));
    const envFile = path.join(output, '.env.scaled-circle');
    const env = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
    const liveEnvironment = live.serviceConfig.environmentVariables || {};
    const archivedEnvironmentDrift = Object.keys(env).filter(key => liveEnvironment[key] !== env[key]);
    const platformKeys = new Set(['FIREBASE_CONFIG', 'GCLOUD_PROJECT', 'FUNCTION_REGION', 'FUNCTION_TARGET', 'FUNCTION_SIGNATURE_TYPE', 'LOG_EXECUTION_ID', 'EVENTARC_CLOUD_EVENT_SOURCE']);
    const customEnvironment = Object.fromEntries(Object.entries(liveEnvironment).filter(([key]) => !platformKeys.has(key)));
    if (Object.keys(customEnvironment).length || fs.existsSync(envFile)) {
      const body = Object.entries(customEnvironment).map(([key, value]) => {
        if (value.includes("'")) throw Error('Unsupported environment quoting: ' + name + ':' + key);
        return `${key}='${value}'`;
      }).join('\n') + '\n';
      if (JSON.stringify(parseEnv(body)) !== JSON.stringify(customEnvironment)) throw Error('Environment preservation failure: ' + name);
      fs.writeFileSync(envFile, body);
    }
    const changed = files(output).filter(file => !baseline[file] || baseline[file] !== hash(fs.readFileSync(path.join(output, file))));
    if (changed.some(file => ![guardedFile, 'index.js', 'campaign_execution_authority.js', 'workspace_access.js', 'production_mapping_service.js', 'policy.js', '.env.scaled-circle'].includes(file))) throw Error('Unreviewed dependency drift: ' + name);
    const codebase = live.labels?.['firebase-functions-codebase'] || 'default';
    const config = path.join(base, 'configs', name + '.json');
    fs.mkdirSync(path.dirname(config), {recursive: true});
    fs.writeFileSync(config, JSON.stringify({functions: [{source: path.relative(path.dirname(config), output).replaceAll('\\', '/'), codebase, ignore: ['node_modules', '.git', '*.test.js']}]}, null, 2));
    entries.push({name, project: 'scaled-circle', region: 'us-east1', codebase, deployTarget: `functions:${codebase}:${name}`,
      config, output, liveSource: live.buildConfig.source.storageSource,
      archiveSha256: hash(fs.readFileSync(path.join(base, 'archives', name + '.zip'))),
      preservedRuntime: live.buildConfig.runtime, preservedServiceConfig: live.serviceConfig,
      archivedEnvironmentDrift, deployMethod: 'gcloud functions deploy with --source only; omit environment, secret, trigger, IAM and service configuration flags',
      changedFiles: changed.map(file => ({file, before: baseline[file] || null, after: hash(fs.readFileSync(path.join(output, file)))})),
      files: Object.fromEntries(files(output).map(file => [file, hash(fs.readFileSync(path.join(output, file)))])), deployed: false});
  }
  const report = path.join(base, 'promotion-manifest.private.json');
  fs.writeFileSync(report, JSON.stringify({project: 'scaled-circle', deployed: false, entries}, null, 2));
  return {report, targets: entries.map(entry => entry.deployTarget)};
}
if (require.main === module) console.log(JSON.stringify(prepare(), null, 2));
module.exports = {prepare, wrapHandler, targets, guarded, planning};
