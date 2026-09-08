'use strict';
// This adapter scopes legacy resource-owner fields to the workspace. It never
// changes request.auth: actorUid remains the authenticated person, not the owner.
const CONTEXT=Symbol('authoritativeBusinessWorkspace');
const ACTIONS=Object.freeze({
 getPostcardWorkspaceV1:'campaigns',createPostcardCampaignV1:'campaigns',requestPostcardQuoteV1:'authorizeCampaigns',createPostcardCheckoutV1:'payments',reconcilePostcardPaymentV1:'payments',requestPostcardCancellationV1:'payments',downloadPostcardArtifactV1:'campaigns',
 getSmartZonePlan:'campaigns',applySmartZonePlan:'campaigns',analyzeCampaignZone:'campaigns',deleteDraftCampaign:'campaigns',
 createCampaignLocation:'campaigns',deleteCampaignLocation:'campaigns',updateCampaignMaterialLogistics:'campaigns',proposeMaterialLogisticsChange:'campaigns',configureJobCoordination:'campaigns',
 publishFundedCampaign:'authorizeCampaigns',assignScalerToZone:'authorizeCampaigns',assignScalerToCampaignLocations:'authorizeCampaigns',configureZoneGroupAssignment:'authorizeCampaigns',rejectCampaignApplication:'authorizeCampaigns',requestZoneRedo:'authorizeCampaigns',dropZoneScaler:'authorizeCampaigns',
 fundCampaign:'payments',quoteCampaignFunding:'payments',createCampaignFundingCheckoutSession:'payments',createCreditCheckoutSession:'payments',finalizeZoneReview:'payments',approveZonePayout:'payments',reviewCampaignCompletion:'payments',settleZoneGroupAssignment:'payments',requestCampaignCancellationRefund:'payments',
 createSubscriptionCheckoutSession:'billing',createBillingPortalSession:'billing',purchaseSubscription:'billing',ensureBillingEntitlement:'billing',createStarterFreeMonthPromotion:'billing',
 analyzeScaleIntelligence:'intelligence',analyzePropertyIntelligence:'intelligence',saveBusinessGrowthProfile:'intelligence',suggestBusinessGrowthProfileFromWebsite:'intelligence',generateManagedGrowthArtifact:'intelligence',saveArtifactDeliveryPreference:'intelligence',deliverManagedGrowthArtifact:'intelligence',
 getBusinessMediaWorkspace:'intelligence',createBusinessMediaUploadIntent:'intelligence',finalizeBusinessMediaUpload:'intelligence',updateBusinessMediaRevisionMetadata:'intelligence',approveBusinessMediaRevision:'intelligence',rejectBusinessMediaRevision:'intelligence',removeBusinessMediaAsset:'intelligence',updateBusinessBrandProfile:'intelligence',getGeneratedServiceVisualWorkspace:'intelligence',requestGeneratedServiceVisual:'intelligence',processGeneratedServiceVisual:'intelligence',approveGeneratedServiceVisual:'intelligence',rejectGeneratedServiceVisual:'intelligence',
 getAttributionOverview:'analytics',getJobRoom:'analytics',getTrackingPhoneWorkspace:'analytics',getLandingPageWorkspace:'intelligence',mutateLandingPageDraft:'campaigns',transitionLandingPage:'authorizeCampaigns',reconcileLandingPageInquiryDelivery:'intelligence',createResponseAsset:'campaigns',bridgeResponseLead:'intelligence',getPhysicalMarketingWorkspace:'intelligence',mutatePhysicalMarketingMaterial:'campaigns',preparePhysicalMarketingVersion:'campaigns',approvePhysicalMarketingVersion:'authorizeCampaigns',
});
const NEW_PAID=new Set(['getSmartZonePlan','applySmartZonePlan','analyzeCampaignZone','publishFundedCampaign','createSubscriptionCheckoutSession',
 'analyzeScaleIntelligence','analyzePropertyIntelligence','generateManagedGrowthArtifact','requestGeneratedServiceVisual']);
function createAccessAdapter({db,workspace,FieldValue}) {
 return async function run(name,request,handler) {
  const permission=ACTIONS[name];
  if(!permission||!request.auth)return handler(request);
  const uid=request.auth.uid,profile=(await db.doc(`users/${uid}`).get()).data()||{};
  if(profile.role==='admin')return handler(request);
  // Existing Scaler authorities retain their assignment and consent checks.
  await workspace.actor(uid);
  let businessId=request.data?.businessId||profile.activeBusinessId||uid;
  const data=request.data||{};
  const resourceId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value)){const e=new Error('Choose a valid resource.');e.code='invalid-argument';throw e;}return value;};
  let target;
  if(data.zoneId)target=(await db.doc(`campaignZones/${resourceId(data.zoneId)}`).get()).data();
  else if(data.campaignId)target=(await db.doc(`campaigns/${resourceId(data.campaignId)}`).get()).data();
  // Scaler Job Room reads retain their original assignment checks.
  if(name==='getJobRoom'&&profile.role==='scaler'&&(target?.assignedScalerId===uid || target?.assignedScalerIds?.includes(uid)))return handler(request);
  if(target?.businessId)businessId=target.businessId;
  const a=await workspace.authority({uid,businessId,permission:name==='getJobRoom'?null:permission,allowExpired:!NEW_PAID.has(name)||name==='createSubscriptionCheckoutSession'||(name==='publishFundedCampaign'&&target?.fundingStatus==='funded')});
  if(name==='getJobRoom'&&!a.permissions.some(p=>['analytics','payments'].includes(p))){const e=new Error('Results or completion payment authority is required.');e.code='permission-denied';throw e;}
  if(target?.certificationFixture===true && uid!==businessId){const e=new Error('This certification job is private.');e.code='permission-denied';throw e;}
  const scoped={...request,[CONTEXT]:{uid:a.businessId,actorUid:uid,businessId:a.businessId,user:a.owner,role:'business',isAdmin:false,emailVerified:request.auth.token?.email_verified===true,permissions:a.permissions}};
  // Only adapter-consumed routing metadata is removed; the signed Auth object
  // and payload's action/resource fields are preserved for maintained checks.
  if(data.workspaceId)scoped.data=Object.fromEntries(Object.entries(data).filter(([key])=>key!=='workspaceId'));
  if(permission==='analytics'||name.startsWith('get'))return handler(scoped);
  const record=db.collection(`businessWorkspaces/${a.businessId}/activity`).doc();
  await record.create({businessId:a.businessId,actorUid:uid,action:name,status:'requested',createdAt:FieldValue.serverTimestamp()});
  try { const result=await handler(scoped);await record.update({status:'completed',completedAt:FieldValue.serverTimestamp()});return result; }
  catch(e){await record.update({status:'not_confirmed',updatedAt:FieldValue.serverTimestamp()});throw e;}
 };
}
module.exports={ACTIONS,NEW_PAID,CONTEXT,createAccessAdapter};
