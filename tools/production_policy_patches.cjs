'use strict';
// Exact source anchors intentionally fail when the maintained implementation
// changes. Each emitted handler is exercised in the production demo emulator.
function once(source,from,to) {
  if(source.split(from).length!==2)throw Error('Expected one production patch anchor: '+from.slice(0,100));
  return source.replace(from,to);
}
function section(source,name,transform) {
  const start=source.indexOf('exports.'+name+' =');
  if(start<0)throw Error('Missing export '+name);
  const next=source.indexOf('\nexports.',start+1),end=next<0?source.length:next;
  return source.slice(0,start)+transform(source.slice(start,end))+source.slice(end);
}
function patch(source) {
  source=source.replaceAll('\r','');
  source="const productionPolicy = require('./production_campaign_policy');\n"+source;
  source=once(source,'async function smartZoneCampaign(request) {',
    'async function smartZoneCampaign(request) {\n  await assertProductionEnvironment(request,false);');
  source=once(source,'async function requireVerifiedUser(request, message) {',
    'async function requireVerifiedUser(request, message) {\n  await assertProductionEnvironment(request,false);');
  source=source.replaceAll('stagingPhysicalQa.reserved(request.data?.campaignId)','false');
  source=section(source,'analyzeCampaignZone',s=>once(s,'    const cleanZoneId = zoneId.trim();',
    `    const cleanZoneId = zoneId.trim();
    await assertProductionEnvironment(request,false);
    const initial=(await db.doc('campaignZones/'+cleanZoneId).get()).data();
    const campaign=initial?(await db.doc('campaigns/'+initial.campaignId).get()).data():null;
    if(canvassingCompletion.isCanvassing(campaign?.campaignType||campaign?.type)) {
      try { return await require('./production_mapping_service').analyze({db,FieldValue,zoneId:cleanZoneId,
        uid:request[workspaceAccess.CONTEXT]?.businessId||request.auth.uid,reviewDigest:request.data?.routeReviewDigest,endpoint:OVERPASS_URL,estimateHomes:determineHomeEstimate}); }
      catch(error) { throw new HttpsError('failed-precondition',
        'Review or regenerate an unworked, unfunded public route before funding. '+String(error.message).replaceAll('_',' ')); }
    }`));
  source=once(source,'  return {plan: smartZonePlanning.generatePlan(\n    smartZonePlanArguments(input, desiredHours, geographicSnapshot)), geographicSnapshot};',
    `  const base = smartZonePlanning.generatePlan(smartZonePlanArguments(input, desiredHours, geographicSnapshot));
  return {plan:productionPolicy.planWithRoutes(input,base,geographicSnapshot), geographicSnapshot};`);
  source=section(source,'applySmartZonePlan',s=>{
    s=once(s,'return {zone, geometryEstimate, reference: db.collection("campaignZones").doc()};',
      `const reference = db.collection('campaignZones').doc();
        const authority = productionPolicy.mappedZone(input,zone,reference.id,request.data?.routeReviewDigest,plan);
        return {zone,geometryEstimate,reference,authority};`);
    s=once(s,'const currentPlan = smartZonePlanning.generatePlan(\n        smartZonePlanArguments(currentInput, request.data?.desiredHours, geographicSnapshot));',
      `const currentPlan = productionPolicy.planWithRoutes(currentInput,smartZonePlanning.generatePlan(
        smartZonePlanArguments(currentInput, request.data?.desiredHours, geographicSnapshot)),geographicSnapshot);`);
    s=once(s,'for (const {zone, geometryEstimate, reference} of preparedZones) transaction.set(reference, {',
      'for (const {zone, geometryEstimate, reference, authority} of preparedZones) transaction.set(reference, {\n        ...authority,');
    s=once(s,'      serviceArea: input.selectedBoundary,',
      `      ...(plan.completionPolicyVersion?{completionPolicyVersion:productionPolicy.version}:{}),
      serviceArea: input.selectedBoundary,`);
    s=once(s,'      const existing = await transaction.get(db.collection("campaignZones")',
      `      if (!['','unfunded','payment_failed','checkout_expired'].includes(String(currentCampaign.fundingStatus||''))) {
        throw new HttpsError('failed-precondition','A funding attempt has locked this route.');
      }
      const existing = await transaction.get(db.collection("campaignZones")`);
    return s;
  });
  source=section(source,'applyToCampaign',s=>{
    s=once(s,'new Set(["campaignId"])','new Set(["campaignId", "acceptedOfferDigest"])');
    s=once(s,'    transaction.create(applicationRef, {',`    let acceptedTerms;
    try { acceptedTerms=productionPolicy.applicationFields(campaign,request.data||{}); }
    catch(_) { throw new HttpsError('failed-precondition','Review and accept the current compensation terms before applying.'); }
    transaction.create(applicationRef, {
      ...acceptedTerms,`);
    return s;
  });
  source=section(source,'assignScalerToZone',s=>{
    s=once(s,'await assertProductionEnvironment({...request, data: {...request.data, applicationId: scalerId}});',
      `await assertProductionEnvironment({...request, data: {...request.data, applicationId: scalerId}},false);
    const scalerAuth=await getAuth().getUser(scalerId);
    const scalerProfile=(await transaction.get(db.doc('users/'+scalerId))).data();
    if(scalerAuth.disabled||!scalerAuth.emailVerified||scalerProfile?.role!=='scaler'||scalerProfile.active!==true) {
      throw new HttpsError('permission-denied','The intended Scaler is not eligible.');
    }`);
    s=once(s,'    transaction.create(compensationRef, {',
      `    const fundingPaymentId=cleanId(campaign.fundingPaymentId);
    const payment=(await transaction.get(db.doc('campaignPayments/'+(fundingPaymentId||'missing')))).data();
    const acceptedPolicy=productionPolicy.assignment(campaignId,campaign,{...zone,id:zoneId},application,payment,Date.now());
    transaction.create(compensationRef, {
      ...(acceptedPolicy||{}),`);
    // Contract policy binds the base and bonus; the local amounts must agree.
    s=once(s,'    transaction.create(compensationRef, {\n      ...(acceptedPolicy||{}),',
      `    if(acceptedPolicy&&(acceptedPolicy.baseAmountCents!==baseAmountCents||acceptedPolicy.bonusAmountCents!==bonusAmountCents)) {
      throw new HttpsError('failed-precondition','Compensation changed after acceptance.');
    }
    transaction.create(compensationRef, {
      ...(acceptedPolicy||{}),`);
    s=once(s,'      compensationContractId: compensationRef.id,','      compensationContractId: compensationRef.id, fundingPaymentId,');
    return s;
  });
  source=once(source,'  return {...assessment,policy};',
    `  if(contract.completionPolicyVersion==='CanvassingRoute80_95V1') {
    let evaluated=require('./production_canvassing_contract').evaluate({contract,zone:{...zone,id:zoneId},
      routeAuthority:zone.coverageAuthority,session:{...(sessionSnapshot.data()||{}),sessionId:sessionSnapshot.exists?sessionId:null},
      chunks:chunkSnapshot.docs.map(d=>d.data()),route,accessIssue:options.accessIssue===true});
    if(!authorityValid||pointer.data()?.sessionId===sessionId) {
      evaluated=canvassingCompletion.decision({coverage:assessment.estimate,
        baseAmountCents:contract.baseAmountCents,bonusAmountCents:contract.bonusAmountCents,
        authorityValid:false,finalized:false,technicalIssue:'assignment_not_finalized'});
    }
    return {...assessment,policy:evaluated};
  }
  return {...assessment,policy};`);
  source=section(source,'reviewCampaignCompletion',s=>once(s,'    if (decision === "approve") {',
    `    const reviewedCampaign=await transaction.get(db.doc('campaigns/'+completion.campaignId));
    if(reviewedCampaign.data()?.completionPolicyVersion)throw new HttpsError('failed-precondition','Open the current Job Room evidence review for this versioned assignment.');
    if (decision === "approve") {`));
  source=section(source,'submitZoneCompletion',s=>{
    s=once(s,'        const route = routeSnapshot.data() || {};',
      `        const route = routeSnapshot.data() || {};
        if(contractSnapshot.data()?.completionPolicyVersion &&
          (contractSnapshot.data().completionPolicyVersion!==productionPolicy.version||campaign.completionPolicyVersion!==productionPolicy.version)) {
          throw new HttpsError('failed-precondition','The accepted compensation policy requires support review.');
        }`);
    return once(s,'const receipt = {policyVersion:canvassingCompletion.VERSION,',
      'const receipt = {contractDigest:contractSnapshot.data()?.contractDigest || null,policyVersion:canvassingCompletion.VERSION,');
  });
  source=section(source,'finalizeZoneReview',s=>{
    s=once(s,'  const zoneRef = db.collection("campaignZones").doc(zoneId);',
      `  const legacyZone=(await db.doc('campaignZones/'+zoneId).get()).data();
  const legacyCampaign=legacyZone?(await db.doc('campaigns/'+legacyZone.campaignId).get()).data():null;
  if(legacyCampaign && !legacyCampaign.completionPolicyVersion) {
    return require('./legacy-review').finalizeZoneReview.run(request);
  }
  const zoneRef = db.collection("campaignZones").doc(zoneId);`);
    s=once(s,"    const canvassingReview = canvassingCompletion.applies",
      `    if(reviewCampaign.data()?.completionPolicyVersion!=='CanvassingRoute80_95V1') {
      throw new HttpsError('failed-precondition','Use the original review authority for historical contracts.');
    }
    const canvassingReview = canvassingCompletion.applies`);
    s=once(s,"payment.status !== marketplace.PAYMENT_STATES.funded || payment.settlementFrozen === true",
      "payment.status !== 'paid' || payment.stripeMode !== 'live' || payment.offerDigest !== contractSnapshot.data()?.offerDigest || payment.settlementFrozen === true");
    s=once(s,'!receipt || receipt.policyVersion !== canvassingCompletion.VERSION',
      "!receipt || completion.status!=='submitted' || receipt.contractDigest!==contractSnapshot.data()?.contractDigest || receipt.policyVersion !== canvassingCompletion.VERSION");
    return s;
  });
  return source;
}
module.exports={patch,once,section};
