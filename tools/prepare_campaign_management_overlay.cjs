'use strict';
// Apply only lifecycle deltas to generation-pinned deployed packages. Never
// replace the deployed engineering or financial package with repository copies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {parse} = require('../functions/node_modules/@babel/parser');
const root = path.resolve(__dirname, '..');
const guard = "require('./campaign_list_lifecycle').assertAcceptingWork(campaign, HttpsError);";
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Expected exactly one overlay anchor: ' + before.slice(0, 85));
  return source.replace(before, after);
}
function section(source, name, transform) {
  const statements = parse(source, {sourceType:'unambiguous'}).program.body.filter(n => {
    const e = n.expression;
    return e?.type === 'AssignmentExpression' && e.left?.object?.name === 'exports' && e.left.property?.name === name;
  });
  assert.equal(statements.length, 1, 'Expected one actual callable: ' + name);
  const n = statements[0];
  assert.equal(n.expression.right.type, 'CallExpression', 'Must patch the actual implementation, not a forwarding export');
  return source.slice(0,n.start) + transform(source.slice(n.start,n.end)) + source.slice(n.end);
}
function campaignGuard(source) {
  const match = [...source.matchAll(/const campaign = campaignSnapshot\.data\(\)(?: \|\| \{\})?;/g)];
  assert.equal(match.length, 1, 'Expected single campaign transaction binding');
  return once(source, match[0][0], match[0][0] + '\n    ' + guard);
}
function transition(source) {
  const n = parse(source, {sourceType:'unambiguous'}).program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'transition');
  assert.ok(n);
  const s = once(source.slice(n.start,n.end),
    'if (!(await transaction.get(campaignRef)).exists) throw new Error("campaign_missing");',
    `const campaignSnapshot = await transaction.get(campaignRef);
    if (!campaignSnapshot.exists) throw new Error("campaign_missing");
    if ((campaignSnapshot.data().workEntryClosed === true ||
        (campaignSnapshot.data().archived === true && campaignSnapshot.data().status === 'completed')) && campaignUpdate.status) {
      campaignUpdate = {...campaignUpdate, status: campaignSnapshot.data().status};
    }`);
  return source.slice(0,n.start) + s + source.slice(n.end);
}
function prepare(name, base, output) {
  assert.ok(!fs.existsSync(output), 'Never overwrite retained packages');
  fs.cpSync(base, output, {recursive:true});
  let leaf = name === 'deleteDraftCampaign' ? 'legacy-commerce-exports.js'
    : name === 'assignScalerToCampaignLocations' ? 'workspace-exports.js'
    : name === 'configureZoneGroupAssignment' ? 'legacy-group/index.js' : 'index.js';
  const target = path.join(output,leaf);
  let source = fs.readFileSync(target,'utf8');
  const changed = [];
  if (name === 'businessOperationsV1') {
    const p = path.join(output,'service.js'), original = fs.readFileSync(p,'utf8');
    const line = fs.readFileSync(path.join(root,'functions-business-operations/service.js'),'utf8').split('\n')
      .find(l => l.includes("if(['campaignListActions','changeCampaignListState']"));
    assert.ok(line);
    fs.writeFileSync(p,once(original, "  if(['createCampaignPlan'", line + "\n  if(['createCampaignPlan'"));
    const module = 'shared/campaign_list_lifecycle.js';
    fs.copyFileSync(path.join(root,'functions/campaign_list_lifecycle.js'),path.join(output,module));
    return ['service.js',module];
  }
  if (name === 'stripeWebhook' || name === 'cancelUnassignedFundedCampaign') {
    source = transition(source);
    if (name === 'cancelUnassignedFundedCampaign') {
      const p = path.join(output,'campaign_funding_lifecycle.js');
      const old = fs.readFileSync(p,'utf8');
      const anchor = 'if (!new Set(["open", "funded"]).has(String(campaign.status || "")) ||';
      fs.writeFileSync(p,once(old,anchor,
        "const policyStatus = campaign.status === 'closed' && campaign.workEntryClosed === true ? campaign.closedFromStatus : campaign.status;\n  if (!new Set([\"open\", \"funded\"]).has(String(policyStatus || \"\")) ||"));
      changed.push('campaign_funding_lifecycle.js');
    }
  } else if (name === 'deleteDraftCampaign') {
    const current = fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
    let replacement;
    section(current,name,s => {replacement=s;return s;});
    source = section(source,name,()=>replacement);
    assert.ok(!source.includes("const crypto ="));
    source = "const crypto = require('node:crypto');\n" + source;
  } else if (name === 'startCampaignCompletion') {
    source = section(source,name,s => once(s,'const completion = snapshot.data() || {};',
      `const completion = snapshot.data() || {};
      const campaign = (await transaction.get(db.collection('campaigns').doc(cleanId(completion.campaignId) || 'missing'))).data();
      ${guard}`));
  } else if (name === 'publishFundedCampaign') {
    source = section(source,name,s => once(s,'const campaign = (await transaction.get(input.ref)).data();',
      'const campaign = (await transaction.get(input.ref)).data();\n      '+guard));
  } else if (name === 'initializeCampaignCompletion') {
    source = section(source,name,s => {
      const bindings = [...s.matchAll(/const campaign = campaignSnapshot\.data\(\)(?: \|\| \{\})?;/g)];
      assert.equal(bindings.length,2);
      s = s.replace(/const campaign = campaignSnapshot\.data\(\)(?: \|\| \{\})?;/g, x => x + '\n    ' + guard);
      const anchor = 'const existing = await transaction.get(completionRef);';
      assert.equal(s.split(anchor).length,3);
      return s.replaceAll(anchor,`const campaign = (await transaction.get(db.collection('campaigns').doc(campaignId))).data();
      ${guard}
      ${anchor}`);
    });
  } else {
    assert.ok(['applyToCampaign','assignScalerToCampaignLocations','assignScalerToZone','configureZoneGroupAssignment','acceptZoneGroupSlot','startTrackingSession'].includes(name));
    source = section(source,name,campaignGuard);
  }
  parse(source,{sourceType:'unambiguous'});
  fs.writeFileSync(target,source);
  changed.push(leaf);
  if (!['stripeWebhook','cancelUnassignedFundedCampaign'].includes(name)) {
    const module = path.join(path.dirname(leaf),'campaign_list_lifecycle.js').replaceAll('\\','/');
    fs.copyFileSync(path.join(root,'functions/campaign_list_lifecycle.js'),path.join(output,module));
    changed.push(module);
  }
  return changed.sort();
}
module.exports = {prepare, section, once, transition};
if (require.main === module) {
  const [name,base,output] = process.argv.slice(2);
  console.log(JSON.stringify({name,changed:prepare(name,base,output)}));
}
