'use strict';
// Offline verification of the exact generation-pinned promotion packages.
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), parser = require('@babel/parser');
const root = path.resolve(__dirname,'..'), state = path.join(root,'.firebase/campaign-management');
const manifest = JSON.parse(fs.readFileSync(path.join(state,'promotion-manifest.private.json')));
const sha = v => require('node:crypto').createHash('sha256').update(v).digest('hex');
function tree(s) {return parser.parse(s,{sourceType:'unambiguous'});}
function declaration(source,name) {const n=tree(source).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(n);return source.slice(n.start,n.end);}
for (const e of manifest.entries) test(e.name+' exact package retains deployed files, locks and unrelated code',()=>{
  const changed=[];
  for(const [p,h] of Object.entries(e.files)) {
    const data=fs.readFileSync(path.join(e.output,p)); assert.equal(sha(data),h);
    if(h!==e.baseline.files[p])changed.push(p);
  }
  assert.deepEqual(changed.sort(),e.changedFiles);
  for(const p of Object.keys(e.baseline.files))assert.ok(e.files[p],p);
  assert.equal(e.files['package-lock.json'],e.baseline.files['package-lock.json']);
  assert.equal(e.files['package.json'],e.baseline.files['package.json']);
  if(e.name==='businessOperationsV1') {
    const original=fs.readFileSync(path.join(e.baseline.base,'service.js'),'utf8');
    const next=fs.readFileSync(path.join(e.output,'service.js'),'utf8');
    assert.equal(next.replace(/^.*if\(\['campaignListActions','changeCampaignListState'\].*\r?\n/m,''),original);
  }
});
for(const name of ['stripeWebhook','cancelUnassignedFundedCampaign']) test(name+' actual deployed transition keeps financial reconciliation and closed/completed identity',async()=>{
  const entry=manifest.entries.find(e=>e.name===name);
  const source=fs.readFileSync(path.join(entry.output,'index.js'),'utf8');
  for(const initial of [{status:'closed',workEntryClosed:true},{status:'completed',archived:true},{status:'open'}]) {
    const records={payment:{campaignId:'c',status:'paid',workerAmountCents:10000,fundingAllocation:{refundCapacity:{pending:{state:'unknown'}}}},campaign:{...initial}};
    const seen=[];
    const ref=key=>({key,get:async()=>({exists:true,data:()=>records[key]})});
    const db={collection:name=>({doc:()=>ref(name==='campaignPayments'?'payment':'campaign')}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,data)=>Object.assign(records[r.key],data)})};
    const mocks={
      './campaign_fund_allocation':{sourceState:()=>records.payment.fundingAllocation,persist:()=>seen.push('allocation')},
      './campaign_refund_capacity':{reconcile:async()=>seen.push('reconciliation')},
    };
    const fn=new Function('db','FieldValue','lifecycle','requirePaymentEnvironment','require','stripeClient','return ('+declaration(source,'transition')+')')(
      db,{serverTimestamp:()=>0},{transitionAllowed:()=>true},()=>{},name=>{assert.ok(mocks[name]);return mocks[name];},()=>({}));
    await fn('p',{status:'disputed'},{status:'funding_review_required',fundingStatus:'disputed'});
    assert.equal(records.campaign.status,initial.status==='open'?'funding_review_required':initial.status);
    assert.equal(records.campaign.fundingStatus,'disputed');
    assert.equal(records.payment.workerAmountCents,10000);
    assert.equal(records.payment.fundingAllocation.refundCapacity.pending.state,'unknown');
    assert.deepEqual(seen,['allocation','reconciliation']);
  }
});
test('cancel overlay retains all prior refund blockers for the pre-close status',()=>{
  const e=manifest.entries.find(e=>e.name==='cancelUnassignedFundedCampaign');
  const current=require(path.join(e.output,'campaign_funding_lifecycle.js'));
  const prior=require(path.join(e.baseline.base,'campaign_funding_lifecycle.js'));
  for(const status of ['open','funded','draft','completed'])for(const flags of [{},{hasAssignedZone:true},{hasAcceptedApplication:true},{hasTrackingSession:true},{hasCompletionEvidence:true},{hasWorkerEarning:true},{hasDispute:true}]) {
    const input={campaign:{status,fundingStatus:'funded'},payment:{status:'paid'},...flags};
    assert.deepEqual(current.cancelRefundEligibility({...input,campaign:{...input.campaign,status:'closed',workEntryClosed:true,closedFromStatus:status}}),prior.cancelRefundEligibility(input));
  }
});
test('work-entry overlays guard the campaign inside each committing transaction',()=>{
  const targets=['applyToCampaign','assignScalerToCampaignLocations','assignScalerToZone','configureZoneGroupAssignment','acceptZoneGroupSlot','startTrackingSession','initializeCampaignCompletion','startCampaignCompletion','publishFundedCampaign'];
  for(const name of targets) {
    const e=manifest.entries.find(e=>e.name===name),file=e.changedFiles.find(f=>f!=='campaign_list_lifecycle.js'&&!f.endsWith('/campaign_list_lifecycle.js'));
    const source=fs.readFileSync(path.join(e.output,file),'utf8');
    const node=tree(source).program.body.find(n=>n.expression?.left?.object?.name==='exports'&&n.expression.left.property?.name===name);
    assert.ok(node,name);
    let inside=0;
    function walk(n,transaction=false){
      if(!n||typeof n!=='object')return;
      const tx=transaction||(n.type==='CallExpression'&&n.callee?.property?.name==='runTransaction');
      if(tx&&n.type==='CallExpression'&&n.callee?.property?.name==='assertAcceptingWork')inside++;
      for(const value of Object.values(n))if(Array.isArray(value))value.forEach(x=>walk(x,tx));else if(value&&typeof value==='object')walk(value,tx);
    }
    walk(node); assert.ok(inside>0,name+' must participate in the closure/assignment conflict');
  }
});
