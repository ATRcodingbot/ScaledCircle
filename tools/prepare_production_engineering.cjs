'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),modules=path.join(root,'functions','node_modules');
const parser=require(path.join(modules,'@babel/parser'));
const generate=require(path.join(modules,'@babel/generator')).default;
const {selectedProgram}=require('../functions/scripts/select_function_program');
const TRACKING=['startAssignedZone','startTrackingSession','getTrackingSessionState','uploadTrackingChunk',
  'completeTrackingSession','cancelTrackingSession','registerTrackingCheckpoint'];
const POLICY=['getSmartZonePlan','applySmartZonePlan','analyzeCampaignZone','applyToCampaign','assignScalerToZone',
  'initializeCampaignCompletion','submitZoneCompletion','reviewCampaignCompletion','finalizeZoneReview',
  'pauseAssignedWorkV1','reviewPausedWorkV1','expirePausedWorkV1'];
function replaceFunction(source,name,replacement) {
  const ast=parser.parse(source,{sourceType:'unambiguous'});
  const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  if(!node)throw Error('Missing maintained function '+name);
  return source.slice(0,node.start)+replacement+source.slice(node.end);
}
function prepareSource(){
  let source=fs.readFileSync(path.join(root,'functions','index.js'),'utf8');
  source=replaceFunction(source,'assertPhysicalQaRequest',`async function assertProductionEnvironment(request, scalerOnly=true) {
    const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
    const emulator=project==='demo-production-engineering' &&
      /^(127\\.0\\.0\\.1|localhost):\\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'') &&
      /^(127\\.0\\.0\\.1|localhost):\\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||'');
    if(project!=='scaled-circle'&&!emulator)throw new HttpsError('unavailable','Production authority is unavailable.');
    if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in to continue.');
    const authUser=await getAuth().getUser(request.auth.uid);
    const profile=(await db.doc('users/'+request.auth.uid).get()).data();
    let approved=profile?.active===true;
    if(!approved&&!scalerOnly&&profile?.activeBusinessId) {
      try {await businessWorkspaceService().authority({uid:request.auth.uid,businessId:profile.activeBusinessId,allowExpired:true});approved=true;}catch(_){}
    }
    if(authUser.disabled||!authUser.emailVerified||!profile||!approved||
        (scalerOnly?profile.role!=='scaler':!['business','scaler','admin'].includes(profile.role))) {
      throw new HttpsError('permission-denied','An enabled, verified approved Scaler is required.');
    }
  }`);
  source=source.replaceAll('assertPhysicalQaRequest(','assertProductionEnvironment(');
  source=replaceFunction(source,'businessWorkspaceService',`function businessWorkspaceService() {
    return require('./business_workspace').createWorkspaceService({db,auth:getAuth(),FieldValue,Timestamp,origin:'https://scaledcircle.com'});
  }`);
  source=source.replace(/const campaign = \(process\.env\.GCLOUD_PROJECT \|\| process\.env\.GOOGLE_CLOUD_PROJECT\) === 'scaledcircle-staging'\s*\? await db\.collection\('campaigns'\)\.doc\(session\.campaignId\)\.get\(\) : null;/,
    "const campaign = await db.collection('campaigns').doc(session.campaignId).get();");
  const startMarker='  const deadlineValue = zone.deadline || campaign.deadline || null;';
  source=source.replace(startMarker,`  if (canvassingCompletion.isCanvassing(campaign.campaignType || campaign.type)) {
    if(campaign.completionPolicyVersion !== 'CanvassingRoute80_95V1') {
      throw new HttpsError('failed-precondition','Regenerate and accept the current route and compensation terms before starting this work.');
    }
    try { require('./canvassing_route_authority').assertReady(zone,campaign); }
    catch(_) { throw new HttpsError('failed-precondition','The accepted route requires review before work can start.'); }
    const contract=(await transaction.get(db.doc('assignmentCompensations/'+zone.id))).data();
    if(!contract || contract.completionPolicyVersion!=='CanvassingRoute80_95V1' ||
        contract.scalerId!==context.uid || contract.campaignId!==zone.campaignId ||
        contract.businessId!==campaign.businessId || contract.immutable!==true ||
        contract.routeBinding?.routeHash!==zone.executionRoute.routeHash ||
        contract.routeBinding?.corridorHash!==zone.executionRoute.corridorHash) {
      throw new HttpsError('failed-precondition','The immutable assignment terms are unavailable.');
    }
  }
`+startMarker);
  const uploadMarker='    if (existing.exists) {\n      const existingData = existing.data() || {};';
  if(!source.replaceAll('\r','').includes(uploadMarker))throw Error('Upload patch anchor missing');
  source=source.replaceAll('\r','').replace(uploadMarker,`    const assigned = await transaction.get(db.doc('campaignZones/'+session.zoneId));
    if(!assigned.exists || assigned.data().assignedScalerId!==context.uid ||
        assigned.data().campaignId!==session.campaignId ||
        !['in_progress','paused_work_window'].includes(assigned.data().status)) {
      throw new HttpsError('permission-denied','This active assignment is unavailable.');
    }
`+uploadMarker);
  const finalizeMarker='    if (!freshZone.exists) throw new HttpsError("not-found", "The assigned zone is unavailable.");';
  source=source.replace(finalizeMarker,finalizeMarker+`
    if(freshZone.data().assignedScalerId!==context.uid || freshZone.data().campaignId!==session.campaignId ||
       !['in_progress','paused_work_window'].includes(freshZone.data().status)) {
      throw new HttpsError('permission-denied','This active assignment is unavailable.');
    }`);
  source=require('./production_policy_patches.cjs').patch(source);
  source=require('./production_settlement_adapter.cjs').exportsSource(source);
  source=source.replace('try {await assertProductionEnvironment(request);return await handler(request);}',
    'try {await assertProductionEnvironment(request,name!==\'reviewPausedWorkV1\');return await handler(request);}');
  source=source.replace('await assertProductionEnvironment(request);\n      return await handler(request);',
    `await assertProductionEnvironment(request, ${JSON.stringify([...TRACKING,'applyToCampaign'])}.includes(name));\n      return await handler(request);`);
  // Financial review has its own Business/zone authorization in the handler.
  const reviewStart=source.indexOf('function safeMarketplaceAuthorityCallable');
  source=source.slice(0,reviewStart)+source.slice(reviewStart).replace('await assertProductionEnvironment(request);','await assertProductionEnvironment(request,false);');
  return source;
}
function prepare(output=path.join(root,'.firebase','production-engineering','tracking')) {
  output=path.resolve(output);
  if(!output.startsWith(path.join(root,'.firebase')+path.sep))throw Error('Private output required');
  const source=prepareSource();
  const ast=selectedProgram(parser.parse(source,{sourceType:'unambiguous'}),new Set([...TRACKING,...POLICY]));
  const text=generate(ast,{comments:true}).code+'\n';
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.js'),text);
  const copied=new Set();
  function dependencies(text) {
    for(const match of text.matchAll(/require\(["'](\.\/[A-Za-z0-9_./-]+)["']\)/g)) {
      const name=match[1].slice(2).replace(/\.js$/,'')+'.js';
      if(name==='legacy-review.js')continue; // Pinned deployed archive, packaged below.
      if(copied.has(name))continue;copied.add(name);
      if(name.includes('staging')||name.includes('fixture'))throw Error('Forbidden dependency '+name);
      let content=fs.readFileSync(path.join(root,'functions',name),'utf8');
      content=require('./production_settlement_adapter.cjs').moduleSource(name,content);
      if(name==='canvassing_completion.js') {
        content=content.replace("const VERSION = 'StagingCanvassingLaunch80_95V1';","const VERSION = 'CanvassingRoute80_95V1';")
          .replace("return project === 'scaledcircle-staging' && isCanvassing(campaign.campaignType || campaign.type);",
            "return campaign.completionPolicyVersion === VERSION && isCanvassing(campaign.campaignType || campaign.type);");
      }
      fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});
      fs.writeFileSync(path.join(output,name),content);dependencies(content);
    }
  }
  dependencies(text);
  require('./prepare_production_legacy_guards.cjs').prepare();
  const sourcePackage=JSON.parse(fs.readFileSync(path.join(root,'functions','package.json')));
  fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({name:'scaledcircle-production-tracking',private:true,
    main:'index.js',engines:{node:'24'},dependencies:{'firebase-admin':sourcePackage.dependencies['firebase-admin'],
      'firebase-functions':sourcePackage.dependencies['firebase-functions']}},null,2)+'\n');
  const files={};for(const name of ['index.js','package.json',...copied]) {
    const bytes=fs.readFileSync(path.join(output,name));
    if(/scaledcircle-staging|stagingPhysicalQa|physical_qa_v[123]|StagingCanvassing|TEST funding/.test(bytes.toString()))throw Error('Forbidden production marker in '+name);
    files[name]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(output,'candidate-manifest.json'),JSON.stringify({exports:[...TRACKING,...POLICY],files,deployed:false},null,2));
  return {output,exports:[...TRACKING,...POLICY],files:Object.keys(files).length};
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2])));
module.exports={prepare,prepareSource,replaceFunction,TRACKING};
