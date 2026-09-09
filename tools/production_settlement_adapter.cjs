'use strict';
const {once}=require('./production_policy_patches.cjs');
function moduleSource(name,input){
 if(!['campaign_reserve_settlement.js','paused_work.js'].includes(name))return input;
 let s=input.replaceAll('\r','');
 if(name==='campaign_reserve_settlement.js'){
  s=once(s,"  function staging() { if (project !== 'scaledcircle-staging') fail('This settlement release is staging only.'); }",
   "  const authority=require('./production_work_settlement_policy');\n  function staging() { authority.environment(project); }");
  s=once(s,'    staging();\n    if (!funded(payment)',
   '    staging(); authority.contract(zoneId,zone,contract); authority.payment(payment,contract);\n    if (!funded(payment)');
  s=s.replaceAll("!== 'test'","!== 'live'").replaceAll("!=='test'","!=='live'")
   .replaceAll('Verified staging TEST funding','Verified production funding').replaceAll('verified TEST payment','verified production payment')
   .replaceAll('intent.livemode!==false','intent.livemode!==true').replaceAll('charge.livemode!==false','charge.livemode!==true')
   .replaceAll('refund.livemode===true','refund.livemode!==true');
  s=once(s,"    if(project!=='scaledcircle-staging')return false;","    authority.environment(project);");
  s=once(s,'    const provider=stripe();',`    const zone=(await db.doc('campaignZones/'+op.zoneId).get()).data();
    const accepted=(await db.doc('assignmentCompensations/'+op.zoneId).get()).data();
    authority.contract(op.zoneId,zone||{},accepted); authority.payment(payment,accepted);
    if(!op.createStarted&&!op.stripeRefundId&&!authority.createsEnabled())return {status:'held_pending_activation'};
    const provider=stripe();`);
 } else if(name==='paused_work.js'){
  s=once(s," function staging(){if(project!=='scaledcircle-staging')fail('failed-precondition','This work-pause release is staging only.');}",
   " const authority=require('./production_work_settlement_policy');\n function staging(){authority.environment(project);}");
  s=once(s,'  return {zone:z,campaign,contract};','  authority.contract(zoneId,z,contract);\n  return {zone:z,campaign,contract};');
 }
 return s;
}
function exportsSource(input){
 let s=input;
 s=once(s,"    if ((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)!=='scaledcircle-staging')\n      throw new HttpsError('failed-precondition','This work-pause release is staging only.');",
  "    require('./production_work_settlement_policy').environment(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT);");
 s=s.replaceAll("if((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)!=='scaledcircle-staging')return;",
  "require('./production_work_settlement_policy').environment(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT);");
 return s;
}
module.exports={moduleSource,exportsSource};
