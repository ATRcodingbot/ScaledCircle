const {getStorage} = require("firebase-admin/storage");
const stagingPhysicalQa = require("./staging_physical_qa");


const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");


const { defineSecret } = require("firebase-functions/params");
const CENSUS_API_KEY = defineSecret("CENSUS_API_KEY");
const { initializeApp, getApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const {
  getFirestore,
  FieldPath,
  FieldValue,
  Timestamp
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const crypto = require("node:crypto");
const propertyIntelligence = require("./property_intelligence");
const PROPERTY_INTELLIGENCE_CACHE_COLLECTION = "propertyIntelligenceCache";



















const discoveryPreferences = require("./discovery_preferences");

const serviceAreaGeometryCodec = require("./service_area_geometry_codec");
const serviceAreaResolution = require("./service_area_resolution");
const smartZoneEntryContract = require("./smart_zone_entry_contract");









const operations = require("./operational_layer");
const smartZonePlanning = require("./smart_zone_planning");
const smartZoneGeography = require("./smart_zone_geography");






const groupAssignment = require("./group_assignment");

const subscriptionEntitlements = require("./subscription_entitlements");
const businessWorkspace = require("./business_workspace");
const workspaceAccess = require("./workspace_access");















initializeApp();












const db = getFirestore();

function businessWorkspaceService() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  return businessWorkspace.createWorkspaceService({ db, auth: getAuth(), FieldValue, Timestamp,
    origin: project === 'scaledcircle-staging' ? 'https://scaledcircle-staging.web.app' : 'https://scaledcircle.com' });
}
function businessOperation(name, handler) {
  return async (request) => {
    try {return await workspaceAccess.createAccessAdapter({ db, workspace: businessWorkspaceService(), FieldValue })(name, request, handler);}
    catch (error) {if (error instanceof HttpsError) throw error;
      if (['unauthenticated', 'permission-denied', 'invalid-argument', 'failed-precondition', 'already-exists', 'resource-exhausted', 'not-found', 'aborted', 'unavailable'].includes(error.code)) throw new HttpsError(error.code, error.message);
      throw new HttpsError('internal', 'The workspace operation could not complete. Please retry.');}
  };
}












































































































































































































































































































































































































setGlobalOptions({
  maxInstances: 10,
  region: "us-east1"
});

const OVERPASS_URL =
"https://overpass-api.de/api/interpreter";

const DEVELOPMENT_HOMES_PER_ACRE = 2.5;

























































async function authenticatedUserContext(request, message) {
  if (request[workspaceAccess.CONTEXT]) return request[workspaceAccess.CONTEXT];
  if (!request.auth) {
    throw new HttpsError("unauthenticated", message);
  }

  const userReference = db.collection("users").doc(request.auth.uid);
  const userSnapshot = await userReference.get();
  const user = userSnapshot.data() || {};
  const role = typeof user.role === "string" ? user.role.toLowerCase() : "";

  return {
    uid: request.auth.uid,
    user,
    role,
    isAdmin: role === "admin",
    emailVerified: request.auth.token.email_verified === true
  };
}

async function requireVerifiedUser(request, message) {
  const context = await authenticatedUserContext(request, message);
  if (!context.isAdmin && !context.emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Verify your email address before using billing or receiving payments."
    );
  }
  return context;
}































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































async function assertPhysicalQaRequest(request) {
  if (!stagingPhysicalQa.reserved(request.data?.campaignId, request.data?.zoneId)) return;
  const authority = await db.doc(stagingPhysicalQa.authorityPath(request.data?.campaignId, request.data?.zoneId)).get();
  try {
    stagingPhysicalQa.assertAccess({
      projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      authority: authority.data(), uid: request.auth?.uid,
      campaignId: request.data?.campaignId, zoneId: request.data?.zoneId,
      targetScalerUid: request.data?.applicationId || request.data?.scalerId
    });
  } catch (_) {
    throw new HttpsError("permission-denied", "This internal certification job is unavailable.");
  }
}





































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































/**
 * Analyze a mapped campaign zone.
 *
 * Strategy:
 * 1. Read saved geometry.
 * 2. Query OpenStreetMap through Overpass.
 * 3. Prefer residential address count.
 * 4. Fall back to residential building count.
 * 5. Fall back to area-density estimate if OSM data is sparse.
 */
exports.analyzeCampaignZone = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5
  },
  businessOperation("analyzeCampaignZone", async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to analyze a campaign zone."
      );
    }

    const zoneId = request.data?.zoneId;

    if (
    typeof zoneId !== "string" ||
    zoneId.trim().length === 0)
    {
      throw new HttpsError(
        "invalid-argument",
        "A valid zoneId is required."
      );
    }

    const cleanZoneId = zoneId.trim();

    const zoneReference = db.
    collection("campaignZones").
    doc(cleanZoneId);

    try {
      const zoneSnapshot =
      await zoneReference.get();

      if (!zoneSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The requested campaign zone does not exist."
        );
      }

      const zoneData =
      zoneSnapshot.data() || {};

      const businessId =
      typeof zoneData.businessId === "string" ?
      zoneData.businessId :
      "";

      if (
      businessId.length === 0 ||
      businessId !== (request[workspaceAccess.CONTEXT]?.businessId || request.auth.uid))
      {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to analyze this zone."
        );
      }

      const serviceArea = Array.isArray(
        zoneData.serviceArea
      ) ?
      zoneData.serviceArea :
      [];

      const validPoints = serviceArea.filter(
        (point) =>
        point &&
        typeof point === "object" &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude)
      );

      if (validPoints.length < 3) {
        throw new HttpsError(
          "failed-precondition",
          "The zone must contain at least three valid map points."
        );
      }

      const serverWalkingEstimate =
      operations.calculateGeometryWalkingEstimate(validPoints);

      const areaSquareMeters =
      serverWalkingEstimate.areaSquareMeters;

      const areaAcres =
      areaSquareMeters / 4046.8564224;

      const areaSquareMiles =
      areaSquareMeters / 2589988.110336;

      const perimeterMeters =
      serverWalkingEstimate.perimeterMeters;

      const estimatedWalkingMiles = readNumber(
        zoneData.estimatedWalkingMiles
      );

      const estimatedMinutes = readInteger(
        zoneData.estimatedMinutes
      );

      // Zones are intentionally bounded for one Scaler. Parallel staffing is
      // optional, so the neutral server recommendation remains one unless a
      // future version has a separately reviewed scheduling policy.
      const recommendedScalerCount = 1;
      const suggestedBasePay = groupAssignment.recommendedWorkerPoolForMinutes(
        serverWalkingEstimate.estimatedWalkingMinutes
      ) / 100;
      const serverZoneGeometryDigest =
      operations.zoneGeometryDigest(validPoints);

      await zoneReference.update({
        analysisStatus: "analyzing",
        homeCountStatus: "analyzing",
        homeCountError: FieldValue.delete(),
        analysisRequestedBy: request.auth.uid,
        analysisRequestedAt:
        FieldValue.serverTimestamp(),
        analysisUpdatedAt:
        FieldValue.serverTimestamp()
      });

      let geographicResult;

      try {
        geographicResult =
        await analyzeResidentialGeography(
          validPoints
        );
      } catch (error) {
        logger.warn(
          "Geographic housing lookup failed; using fallback estimate.",
          {
            zoneId: cleanZoneId,
            error:
            error instanceof Error ?
            error.message :
            String(error)
          }
        );

        geographicResult = {
          addressCount: 0,
          residentialBuildingCount: 0,
          totalBuildingCount: 0,
          source: "overpass_failed"
        };
      }

      const homeEstimate =
      determineHomeEstimate({
        geographicResult,
        areaAcres
      });

      await zoneReference.update({
        estimatedHomes:
        homeEstimate.estimatedHomes,

        homeCountStatus:
        homeEstimate.estimatedHomes > 0 ?
        "estimated" :
        "unavailable",

        homeCountMethod:
        homeEstimate.method,

        homeCountConfidence:
        homeEstimate.confidence,

        homeCountConfidenceScore:
        homeEstimate.confidenceScore,

        geographicAddressCount:
        geographicResult.addressCount,

        geographicResidentialBuildingCount:
        geographicResult.
        residentialBuildingCount,

        geographicTotalBuildingCount:
        geographicResult.totalBuildingCount,

        geographicDataSource:
        geographicResult.source,

        homeCountError:
        FieldValue.delete(),

        analysisStatus:
        "complete",

        serverEstimatedWalkingMinutes:
        serverWalkingEstimate.estimatedWalkingMinutes,

        estimatedMinutes:
        serverWalkingEstimate.estimatedWalkingMinutes,

        estimatedWalkingMeters:
        serverWalkingEstimate.estimatedWalkingMeters,

        serverZoneMetricsVersion:
        serverWalkingEstimate.version,

        serverZoneGeometryDigest,

        analysisUpdatedAt:
        FieldValue.serverTimestamp(),

        updatedAt:
        FieldValue.serverTimestamp()
      });

      const response = {
        success: true,

        zoneId:
        cleanZoneId,

        analysisStatus:
        "complete",

        geometry: {
          pointCount:
          validPoints.length,

          shapeType:
          zoneData.serviceAreaType ||
          zoneData.shapeType ||
          "polygon",

          areaSquareMeters,
          areaAcres,
          areaSquareMiles,
          perimeterMeters
        },

        workload: {
          estimatedWalkingMiles,
          estimatedMinutes: serverWalkingEstimate.estimatedWalkingMinutes,
          recommendedScalerCount,
          suggestedBasePay
        },

        homes: {
          status:
          homeEstimate.estimatedHomes > 0 ?
          "estimated" :
          "unavailable",

          estimatedHomes:
          homeEstimate.estimatedHomes,

          method:
          homeEstimate.method,

          confidence:
          homeEstimate.confidence,

          confidenceScore:
          homeEstimate.confidenceScore,

          addressCount:
          geographicResult.addressCount,

          residentialBuildingCount:
          geographicResult.
          residentialBuildingCount,

          totalBuildingCount:
          geographicResult.totalBuildingCount,

          source:
          geographicResult.source
        }
      };

      logger.info(
        "Campaign zone geographic analysis completed.",
        {
          zoneId:
          cleanZoneId,

          businessId,

          pointCount:
          validPoints.length,

          areaAcres,

          addressCount:
          geographicResult.addressCount,

          residentialBuildingCount:
          geographicResult.
          residentialBuildingCount,

          estimatedHomes:
          homeEstimate.estimatedHomes,

          method:
          homeEstimate.method,

          confidence:
          homeEstimate.confidence
        }
      );

      return response;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        "Campaign zone analysis failed.",
        {
          zoneId:
          cleanZoneId,

          error:
          error instanceof Error ?
          error.message :
          String(error)
        }
      );

      try {
        await zoneReference.update({
          analysisStatus:
          "failed",

          homeCountStatus:
          "failed",

          homeCountError:
          error instanceof Error ?
          error.message :
          String(error),

          analysisUpdatedAt:
          FieldValue.serverTimestamp()
        });
      } catch (updateError) {
        logger.error(
          "Unable to store zone analysis failure.",
          {
            zoneId:
            cleanZoneId,

            error:
            updateError instanceof Error ?
            updateError.message :
            String(updateError)
          }
        );
      }

      throw new HttpsError(
        "internal",
        "Unable to analyze the campaign zone."
      );
    }
  })
);

function smartZoneAnchor(campaign = {}) {
  const points = Array.isArray(campaign.serviceArea) ? campaign.serviceArea.filter((item) =>
  Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)) : [];
  if (points.length < 3) return null;
  return {
    latitude: points.reduce((sum, item) => sum + item.latitude, 0) / points.length,
    longitude: points.reduce((sum, item) => sum + item.longitude, 0) / points.length
  };
}

async function smartZoneSelectedArea(request, campaign) {
  let analysisBoundary;
  try { analysisBoundary = smartZoneEntryContract.normalizeAnalysisBoundary(request.data?.analysisBoundary); }
  catch (_) { throw new HttpsError("invalid-argument", "Draw a simple area without crossing or retracing its boundary."); }
  if (analysisBoundary) {
    return {geometry: analysisBoundary, name: "Drawn analysis area",
      source: "explicit_drawn_analysis", boundaryKind: "drawn_analysis_boundary",
      resultId: "", resolutionVersion: ""};
  }
  let selection;
  try { selection = smartZoneEntryContract.normalizeAreaSelection(request.data?.areaSelection); }
  catch (_) { throw new HttpsError("invalid-argument", "Choose a valid campaign area."); }
  if (!selection) {
    const geometry = Array.isArray(campaign.serviceArea) ? campaign.serviceArea.filter((item) =>
      Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)) : [];
    if (geometry.length < 3) {
      throw new HttpsError("failed-precondition",
        "Search for a neighborhood, address, ZIP, or choose a saved Service Area.");
    }
    return {geometry,
      name: readText(campaign.serviceAreaTemplateName, 240) || "Selected campaign area",
      source: "saved_campaign_area", resultId: "", resolutionVersion: ""};
  }
  let resolution;
  try {
    resolution = await serviceAreaResolution.resolvePlace({query: selection.query, db,
      baseUrl: process.env.NOMINATIM_BASE_URL, tigerBase: process.env.TIGERWEB_BASE_URL,
      onCacheWriteError: (error) => logger.info("Campaign area cache write skipped.", {
        errorCode: String(error?.message || error).slice(0, 80),
    })});
    const selected = smartZoneEntryContract.selectResolvedArea(selection, resolution);
    if (selected.geometry.length >= 3) {
      return {...selected, source: "explicit_server_resolved_area",
        boundaryKind: "mapped_place_boundary"};
    }
    if (!selected.canUseAddressRadius) {
      return {...selected, geometry: [], source: "explicit_server_resolved_location",
        boundaryKind: "unresolved_place_boundary"};
    }
    const desiredHours = Math.max(1, Math.min(192, Number(request.data?.desiredHours || 5)));
    const spanMeters = Math.max(450, Math.min(5000, 600 * Math.sqrt(desiredHours / 5)));
    return {...selected,
      geometry: smartZonePlanning.rectangleAround(selected.center, spanMeters, spanMeters),
      source: "explicit_server_resolved_address", boundaryKind: "around_address"};
  } catch (error) {
    if (["invalid_area_selection", "area_boundary_unavailable"].includes(error?.message)) {
      throw new HttpsError("failed-precondition",
        "That place does not have a usable mapped boundary. Choose another area or use Advanced Edit.");
    }
    if (error?.message === "rate_limited") {
      throw new HttpsError("resource-exhausted", "Map search is busy. Try again in a moment.");
    }
    throw new HttpsError("unavailable", "We couldn't map that area automatically.");
  }
}

async function smartZoneRecommendationContext(context, campaign, request, transaction = null) {
  const read = reference => transaction ? transaction.get(reference) : reference.get();
  const [profile, preferences] = await Promise.all([
    read(db.collection("businessGrowthProfiles").doc(context.uid)),
    read(db.collection("discoveryPreferences").doc(context.uid)),
  ]);
  if (request.data?.objective != null && (typeof request.data.objective !== "string" || request.data.objective.length > 800)) {
    throw new HttpsError("invalid-argument", "Keep the recommendation goal within 800 characters.");
  }
  try {
    const result = require('./property_service_area_analysis').buildMarketingContext({businessId: context.uid,
      profile: profile.data(), preferences: preferences.data(), objective: request.data?.objective,
      campaignType: readText(campaign.campaignType || campaign.type, 80) || "field_distribution"});
    const marketingHistory = await require('./smart_zone_intelligence_runtime').loadMarketingHistory({db,
      businessId: context.uid, transaction});
    result.context.marketingHistory = marketingHistory;
    result.contextVersion = crypto.createHash('sha256').update(JSON.stringify([result.contextVersion,
      marketingHistory.status, marketingHistory.records, marketingHistory.inventoryComplete,
      new Date(marketingHistory.checkedAtMs).toISOString().slice(0, 10)])).digest('hex');
    return result;
  } catch (error) {
    if (error?.code) throw new HttpsError(error.code, error.message);
    throw new HttpsError("failed-precondition", "Save your Business services and eligible service areas before requesting an intelligent recommendation.");
  }
}

async function smartZoneCampaign(request, {requireCached = false} = {}) {
  const context = await authenticatedUserContext(
    request, "Sign in as a Business to plan campaign Zones.");
  if (context.role !== "business" || context.isAdmin) {
    throw new HttpsError("permission-denied", "Business access is required.");
  }
  const campaignId = readText(request.data?.campaignId, 160);
  if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
  const reference = db.collection("campaigns").doc(campaignId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
  const campaign = snapshot.data() || {};
  if (campaign.businessId !== context.uid) {
    throw new HttpsError("permission-denied", "This campaign does not belong to you.");
  }
  const entitlement = (await db.collection("businessSubscriptions")
    .doc(context.uid).get()).data();
  if (!subscriptionEntitlements.hasActiveScaleEntitlement(entitlement)) {
    throw new HttpsError("permission-denied",
      "Intelligent area recommendations are included with an active Scale plan. You can still draw your own area.");
  }
  if (!Array.isArray(context.permissions) || !context.permissions.includes("intelligence") || !context.permissions.includes("campaigns")) {
    throw new HttpsError("permission-denied", "Campaign and Intelligence permissions are required for intelligent area recommendations.");
  }
  if (String(campaign.status || "draft") !== "draft") {
    throw new HttpsError("failed-precondition", "Smart Zone planning is available before funding.");
  }
  const executionMode=require('./campaign_execution_authority').executionMode(campaign);
  if(!executionMode)throw new HttpsError('failed-precondition','Review this campaign’s execution mode before requesting a recommendation.');
  let teamCapacity=null;
  if(executionMode==='own_team') {
    if(campaign.campaignWorkload?.version!==require('./own_team_capacity').VERSION)
      throw new HttpsError('failed-precondition','Review team session duration, marketer count and coverage pattern before recommending an area.');
    teamCapacity=require('./own_team_capacity').requirement(campaign.campaignWorkload);
  }
  let desiredHours;
  try { desiredHours = smartZoneEntryContract.workloadHours(request.data?.desiredHours); }
  catch (error) { throw new HttpsError('invalid-argument', error.message); }
  const alternativeIndex = request.data?.alternativeIndex ?? 0;
  if (!Number.isSafeInteger(alternativeIndex) || alternativeIndex < 0 || alternativeIndex > 2) {
    throw new HttpsError("invalid-argument", "Choose an available area recommendation.");
  }
  const intelligence = await smartZoneRecommendationContext(context, campaign, request);
  const runtimeModule = require('./smart_zone_intelligence_runtime');
  let requestFingerprint = runtimeModule.requestFingerprint({campaignId, campaign, data: request.data || {},
    desiredHours, objective: intelligence.context.goal});
  if (request.data?.resumeSavedPlan === true) {
    const retained = (await db.doc(`propertyRecommendationWorkspaces/${context.uid}/mappingRuns/${campaign.smartZoneRecommendationRunId || 'missing'}`).get()).data();
    if (!retained || retained.businessId !== context.uid || retained.campaignId !== campaignId ||
        retained.contextVersion !== intelligence.contextVersion ||
        retained.searchEvidence?.requestedHours !== desiredHours ||
        retained.searchEvidence?.goal !== intelligence.context.goal) {
      throw new HttpsError('failed-precondition', 'The saved recommendation context changed. Review your location and workload.');
    }
    requestFingerprint = retained.requestFingerprint;
  }
  const cacheAuthority = {businessId: context.uid, actorUid: context.actorUid || context.uid, campaignId,
    contextVersion: intelligence.contextVersion, requestFingerprint};
  let cachedRecommendation = null;
  // Frozen native clients repeat their Get inputs and planId, but omit runId.
  // Apply may recover only the exact completed actor/input-bound run. It must
  // never resolve the place again or initiate acquisition for compatibility.
  const runId = request.data?.resumeSavedPlan === true ? campaign.smartZoneRecommendationRunId :
    request.data?.recommendationRunId || (requireCached ? runtimeModule.recommendationRunId(cacheAuthority) : null);
  try { if (runId) cachedRecommendation = await runtimeModule.createRuntime({db}).load({...cacheAuthority, runId}); }
  catch (error) { throw new HttpsError(error.code || 'failed-precondition', error.message); }
  if (alternativeIndex > 0 && !cachedRecommendation) {
    throw new HttpsError("failed-precondition", "Review the first recommendation before requesting an alternative.");
  }
  const selectedArea = cachedRecommendation?.selectedArea || await smartZoneSelectedArea(request, campaign);
  const anchor = smartZoneAnchor({serviceArea: selectedArea.geometry}) || selectedArea.center;
  return {context, campaignId, reference, campaign, anchor, selectedArea, desiredHours, alternativeIndex, executionMode,teamCapacity,
    intelligenceContext: intelligence.context, contextVersion: intelligence.contextVersion,
    eligibleGeography: intelligence.eligibleGeography, cacheAuthority, cachedRecommendation,
    selectionIds: request.data?.selectionIds ??
      (request.data?.resumeSavedPlan === true &&
        campaign.smartZoneSelectionIds?.length <= require('./campaign_workload_authority').requirement(desiredHours).requiredZoneCount
        ? campaign.smartZoneSelectionIds : null),
    replaceZoneIndex: request.data?.replaceZoneIndex,
    selectedBoundary: selectedArea.geometry,
    sourceAreaDigest: selectedArea.geometry.length >= 3 ? operations.zoneGeometryDigest(selectedArea.geometry) :
      crypto.createHash("sha256").update(JSON.stringify({unresolvedResultId: selectedArea.resultId,
        center: selectedArea.center})).digest("hex")};
}

function smartZonePlanArguments(input, desiredHours, geographicSnapshot) {
  return {
    anchor: input.anchor, executionMode: input.executionMode,teamCapacity: input.teamCapacity,
    selectedBoundary: input.selectedBoundary,
    geographicSnapshot,
    desiredHours: desiredHours ?? 5,
    workType: readText(input.campaign.campaignType || input.campaign.type, 80) ||
      "field_distribution",
    workerBasePayCents: Math.round(Number(input.campaign.basePay || 0) * 100),
    completionBonusCents: Math.round(Number(input.campaign.bonus || 0) * 100),
    qualityBonusCents: Math.round(Number(input.campaign.qualityBonus || 0) * 100),
    label: readText(input.selectedArea?.name, 120) || "Recommended Area",
    sourceAreaDigest: input.sourceAreaDigest,
    intelligenceContext: input.intelligenceContext, contextVersion: input.contextVersion,
    eligibleGeography: input.eligibleGeography, alternativeIndex: input.alternativeIndex,
    selectionIds: input.selectionIds, replaceZoneIndex: input.replaceZoneIndex,
  };
}

async function generateSmartZonePlan(input, desiredHours) {
  desiredHours = smartZoneEntryContract.workloadHours(desiredHours);
  const intelligence = require('./smart_zone_intelligence');
  const args = smartZonePlanArguments(input, desiredHours, null);
  // The maintained PI analyzer/cache is the primary evidence source. Only Get
  // may acquire public property evidence; Apply replays the authorized run.
  const loadPropertyAnalysis = input.cachedRecommendation ? null :
    require('./property_service_area_runtime').createAnalyzer({db,
      FieldValue, apiKey: CENSUS_API_KEY.value(), budgetMs: 45000});
  const record = input.cachedRecommendation || await require('./smart_zone_intelligence_runtime').createRuntime({db}).obtain(
    {...input.cacheAuthority, selectedArea: input.selectedArea, sourceAreaDigest: input.sourceAreaDigest},
    () => intelligence.search(args, {fetchSnapshot: require('./smart_zone_public_cache_runtime').createAcquirer({
      db, bucket: getStorage().bucket(), liveFetch: smartZoneGeography.fetchSnapshot}),
      endpoint: OVERPASS_URL, loadPropertyAnalysis}));
  const plan = intelligence.generate(args, record.searchEvidence);
  logger.info("Smart Zone intelligence evidence", {sourceAreaDigest: input.sourceAreaDigest,
    recommendationStatus: plan.recommendationStatus, reasonCode: plan.reasonCode || null,
    selectedCandidateFeatureCount: plan.totalEstimatedProperties, candidateCount: plan.zones.length,
    cached: record.cached === true, alternativeIndex: input.alternativeIndex});
  return {plan: {...plan, recommendationRunId: record.runId,
    alternativeIndex: input.alternativeIndex}, searchEvidence: record.searchEvidence};
}

exports.getSmartZonePlan = onCall(
  {enforceAppCheck: false, maxInstances: 10, timeoutSeconds: 180, secrets: [CENSUS_API_KEY]},
  businessOperation("getSmartZonePlan", async (request) => {
    if (stagingPhysicalQa.reserved(request.data?.campaignId)) {
      throw new HttpsError("failed-precondition", "The certification territory is server-bound.");
    }
    const input = await smartZoneCampaign(request);
    try {
      return (await generateSmartZonePlan(input, request.data?.desiredHours)).plan;
    } catch (error) {
      logger.warn("Smart Zone planning failed", {campaignId: input.campaignId,
        reason: String(error?.message || 'unknown').slice(0, 160)});
      if (['aborted', 'resource-exhausted', 'failed-precondition', 'permission-denied'].includes(error?.code)) {
        throw new HttpsError(error.code, error.message);
      }
      const failure = smartZoneEntryContract.planningFailure(error);
      throw new HttpsError(failure.code, failure.message);
    }
  }),
);

exports.applySmartZonePlan = onCall(
  {enforceAppCheck: false, maxInstances: 5},
  businessOperation("applySmartZonePlan", async (request) => {
    if (stagingPhysicalQa.reserved(request.data?.campaignId)) {
      throw new HttpsError("failed-precondition", "The certification territory is server-bound.");
    }
    const input = await smartZoneCampaign(request, {requireCached: true});
    if (input.campaign.executionMode === 'own_team' && request.data?.useRecommendedPay === true) {
      throw new HttpsError('failed-precondition', 'Own-team planning cannot set Scaler compensation.');
    }
    let plan;
    let searchEvidence;
    try {
      ({plan, searchEvidence} = await generateSmartZonePlan(input, request.data?.desiredHours));
      if(input.executionMode==='own_team'){if(!plan.zones.length)throw Object.assign(Error('manual_zone_review_required'),{code:'failed-precondition'});}else smartZonePlanning.assertApplicablePlan(plan);
    } catch (error) {
      logger.warn("Smart Zone preparation failed", {campaignId: input.campaignId,
        reason: String(error?.message || 'unknown').slice(0, 160)});
      const failure = smartZoneEntryContract.planningFailure(error);
      throw new HttpsError(failure.code, failure.message);
    }
    if (request.data?.planId !== plan.planId) {
      throw new HttpsError("failed-precondition", "The recommendation changed. Review it again.");
    }
    let preparedZones;
    try {
      preparedZones = plan.zones.map((zone) => {
        const geometryEstimate = operations.calculateGeometryWalkingEstimate(zone.geometry);
        operations.assertZoneDuration(geometryEstimate.estimatedWalkingMinutes);
        return {zone, geometryEstimate, reference: db.collection("campaignZones").doc()};
      });
    } catch (error) {
      logger.error("Smart Zone plan failed authoritative geometry validation.", {
        campaignId: input.campaignId,
        planId: plan.planId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("failed-precondition",
        "We couldn't apply this Smart Zone plan. Refresh the recommendation and try again.");
    }
    const result = await db.runTransaction(async (transaction) => {
      const currentCampaignSnapshot = await transaction.get(input.reference);
      const currentCampaign = currentCampaignSnapshot.data() || {};
      if (!currentCampaignSnapshot.exists || String(currentCampaign.status || "draft") !== "draft" ||
          currentCampaign.businessId !== input.context.uid || currentCampaign.executionMode !== input.campaign.executionMode) {
        throw new HttpsError("failed-precondition", "The campaign changed. Review the plan again.");
      }
      if ((currentCampaign.workloadVersion || 0) !== (input.campaign.workloadVersion || 0) ||
          (currentCampaign.campaignWorkload && currentCampaign.campaignWorkload.requestedHours !== input.desiredHours)) {
        throw new HttpsError('aborted', 'The requested workload changed. Review the current campaign Zones.');
      }
      const currentWorkspace = await businessWorkspaceService().authority({uid: input.context.actorUid || input.context.uid,
        businessId: input.context.uid, permission: 'campaigns', transaction, allowExpired: true});
      if (!currentWorkspace.permissions.includes('intelligence')) {
        throw new HttpsError('permission-denied', 'Intelligence permission is required to apply this recommendation.');
      }
      if (!subscriptionEntitlements.hasActiveScaleEntitlement(currentWorkspace.entitlement)) {
        throw new HttpsError("permission-denied", "Intelligent area recommendations require an active Scale plan.");
      }
      const currentIntelligence = await smartZoneRecommendationContext(input.context, currentCampaign, request, transaction);
      const runtimeModule = require('./smart_zone_intelligence_runtime');
      const currentAuthority = {...input.cacheAuthority, contextVersion: currentIntelligence.contextVersion,
        requestFingerprint: request.data?.resumeSavedPlan === true ? input.cacheAuthority.requestFingerprint : runtimeModule.requestFingerprint({campaignId: input.campaignId, campaign: currentCampaign,
          data: request.data || {}, desiredHours: input.desiredHours, objective: currentIntelligence.context.goal}),
        runId: input.cachedRecommendation.runId};
      await runtimeModule.createRuntime({db}).load(currentAuthority, transaction);
      const currentInput = {...input, campaign: currentCampaign, intelligenceContext: currentIntelligence.context,
        contextVersion: currentIntelligence.contextVersion, eligibleGeography: currentIntelligence.eligibleGeography};
      const currentPlan = require('./smart_zone_intelligence').generate(
        smartZonePlanArguments(currentInput, request.data?.desiredHours, null), searchEvidence);
      if(input.executionMode==='own_team'){if(!currentPlan.zones.length)throw Object.assign(Error('manual_zone_review_required'),{code:'failed-precondition'});}else smartZonePlanning.assertApplicablePlan(currentPlan);
      if (currentPlan.planId !== plan.planId) {
        throw new HttpsError("failed-precondition", "The recommendation changed. Review it again.");
      }
      const existing = await transaction.get(db.collection("campaignZones")
        .where("campaignId", "==", input.campaignId));
      const protectedContracts = await transaction.get(db.collection("assignmentCompensations").where("campaignId", "==", input.campaignId).limit(1));
      const protectedPayments = await transaction.get(db.collection("campaignPayments").where("campaignId", "==", input.campaignId).limit(1));
      if (!protectedContracts.empty || !protectedPayments.empty) throw new HttpsError('failed-precondition',
        'A campaign with payment or compensation records cannot replace its planning Zones.');
      const replacingOne = request.data?.replaceZoneIndex != null;
      if ((currentCampaign.executionMode || 'marketplace') === 'marketplace' &&
          !currentCampaign.campaignWorkload && existing.size > plan.campaignWorkload.requiredZoneCount) {
        throw new HttpsError('failed-precondition',
          `This saved draft has ${existing.size} areas, but ${input.desiredHours} hours requires ${plan.campaignWorkload.requiredZoneCount} Scaler Zone(s). Confirm the requested workload and choose which areas to keep before replacing this plan. Saved areas are unchanged.`,
          {reason:'LEGACY_ZONE_ADJUSTMENT_REQUIRED'});
      }
      if(replacingOne && currentCampaign.smartZonePlanId===plan.planId &&
          existing.docs.length===plan.zones.length &&
          plan.selectionIds.every((id,index)=>existing.docs.some(doc=>
            doc.data().smartZoneCandidateId===id && doc.data().serverZoneGeometryDigest===
              operations.zoneGeometryDigest(plan.zones[index].geometry)))) {
        return {success:true,campaignId:input.campaignId,planId:plan.planId,zoneCount:existing.docs.length,replay:true};
      }
      if (replacingOne && existing.docs.length) {
        if (request.data?.resumeSavedPlan !== true || existing.docs.length !== plan.zones.length ||
            currentCampaign.smartZonePlanId !== input.campaign.smartZonePlanId) {
          throw new HttpsError('failed-precondition', 'Reopen the current saved Zones before replacing one area.');
        }
        const byCandidate = new Map(existing.docs.map(doc => [doc.data().smartZoneCandidateId, doc]));
        preparedZones = preparedZones.map((entry, index) => {
          const old = byCandidate.get(currentCampaign.smartZoneSelectionIds?.[index]);
          if (!old) throw new HttpsError('failed-precondition', 'The saved Zone identity changed. Reopen the campaign.');
          if(index !== request.data.replaceZoneIndex &&
              plan.selectionIds[index] !== currentCampaign.smartZoneSelectionIds[index])
            throw new HttpsError('failed-precondition', 'Apply one Zone change before replacing another.');
          return {...entry, reference:old.ref, preserve:index !== request.data.replaceZoneIndex};
        });
      }
      if (existing.docs.length && existing.docs.every((doc) =>
        doc.data()?.smartZonePlanId === plan.planId)) {
        if (request.data?.useRecommendedPay === true) {
          transaction.set(input.reference, {
            basePay: plan.compensation.recommendedBasePayCents / 100,
            compensationRecommendationPolicyVersion: plan.compensation?.policyVersion||null,
            compensationEstimatedWorkMinutes: plan.compensation?.estimatedWorkMinutes||null,
            compensationRecommendedBasePayCents: plan.compensation?.recommendedBasePayCents||null,
            compensationMinimumEffectiveRateCentsPerHour:
              plan.compensation?.minimumEffectiveCompensationCentsPerHour||null,
            compensationRecommendationAccepted: true,
            compensationRecommendationAcceptedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
        return {success: true, campaignId: input.campaignId, planId: plan.planId,
          zoneCount: existing.docs.length, replay: true,
          recommendedPayApplied: request.data?.useRecommendedPay === true,
          recommendedBasePayCents: plan.compensation?.recommendedBasePayCents||null};
      }
      if (existing.docs.some((doc) => {
        const zone = doc.data() || {};
        return zone.assignedScalerId || !["", "unassigned"].includes(String(zone.status || ""));
      })) {
        throw new HttpsError("failed-precondition",
          "Existing assigned or active Zones cannot be replaced by a recommendation.");
      }
      if (!replacingOne) for (const document of existing.docs) transaction.delete(document.ref);
      for (const [index, {zone, geometryEstimate, reference, preserve}] of preparedZones.entries()) {
        if (preserve) continue;
        transaction.set(reference, {
        campaignId: input.campaignId,
        businessId: currentCampaign.businessId,
        zoneName: zone.name,
        zoneNumber: index + 1,
        smartZoneCandidateId: plan.selectionIds[index],
        status: "unassigned",
        assignedScalerId: null,
        mapped: true,
        serviceArea: zone.geometry,
        serviceAreaType: zone.serviceability === "serviceable_geography" ?
          "serviceable_territory" : "basic_area_estimate",
        serviceAreaPointCount: zone.geometry.length,
        estimatedHomes: zone.workload.estimatedProperties,
        homeCountStatus: "estimated",
        homeCountMethod: "osm_classified_mapped_features_v2",
        smartZoneTargetEvidence: {...zone.targetEvidence, geometryDigest: operations.zoneGeometryDigest(zone.geometry)},
        zoneIntelligence: zone.zoneIntelligence,
        smartZoneQuality: zone.quality,
        smartZonePlanningTargets: zone.planningTargets,
        smartZonePlanningNetwork: zone.planningNetwork,
        homeCountConfidence: zone.workload.confidence,
        analysisStatus: "complete",
        estimatedWorkMinutes: zone.workload.estimatedMinutes,
        estimatedWorkHours: zone.workload.estimatedHours,
        workloadConfidence: zone.workload.confidence,
        workability: zone.workability,
        smartZonePlanId: plan.planId,
        smartZonePolicyVersion: plan.policyVersion,
        smartZoneGeometryVersion: plan.geometryVersion,
        smartZoneServiceabilityMode: plan.serviceabilityMode,
        serverEstimatedWalkingMinutes: geometryEstimate.estimatedWalkingMinutes,
        estimatedMinutes: geometryEstimate.estimatedWalkingMinutes,
        estimatedWalkingMeters: geometryEstimate.estimatedWalkingMeters,
        serverZoneMetricsVersion: geometryEstimate.version,
        serverZoneGeometryDigest: operations.zoneGeometryDigest(zone.geometry),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      }
      transaction.create(input.reference.collection('planningAudit').doc(`workload_${(currentCampaign.workloadVersion || 0) + 1}`), {
        type:'recommendation_zones_applied', businessId:currentCampaign.businessId,
        actorUid:input.context.actorUid || input.context.uid,
        campaignWorkload:plan.campaignWorkload, previous:currentCampaign.campaignWorkload || null,
        planId:plan.planId, zoneIds:preparedZones.map(entry=>entry.reference.id),
        replacedZoneIndex:request.data?.replaceZoneIndex ?? null,
        at:FieldValue.serverTimestamp(), financialEffect:false,
      });
      transaction.set(input.reference, {
      serviceArea: plan.zones.length === 1 ? plan.zones[0].geometry : [],
      geometryParts: plan.zones.map(zone => ({points: zone.geometry})),
      geometryEncoding: "map-parts-v1",
      serviceAreaPointCount: plan.zones.length === 1 ? plan.zones[0].geometry.length : 0,
      serviceAreaType: "intelligence_recommended_territory",
      smartZoneSearchRegion: {geometry: input.selectedBoundary, name: input.selectedArea.name,
        geometryDigest: input.sourceAreaDigest, source: input.selectedArea.resolutionSource || input.selectedArea.source,
        resultId: input.selectedArea.resultId || null},
      smartZoneRecommendationRunId: input.cachedRecommendation.runId,
      smartZoneIntelligenceContextVersion: input.contextVersion,
      serviceAreaTemplateName: input.selectedArea.name,
      serviceAreaResolutionSource: input.selectedArea.resolutionSource || input.selectedArea.source,
      serviceAreaResolutionVersion: input.selectedArea.resolutionVersion || null,
      serviceAreaResultId: input.selectedArea.resultId || null,
      estimatedHomes: plan.totalEstimatedProperties,
      smartZonePlanId: plan.planId,
      campaignWorkload: plan.campaignWorkload,
      ...(input.executionMode==='own_team'?{teamCapacityPlan:plan.teamCapacity}:{}),
      workloadVersion: (currentCampaign.workloadVersion || 0) + 1,
      smartZoneSelectionIds: plan.selectionIds,
      smartZoneObjective: input.intelligenceContext.goal,
      workloadUpdatedBy: input.context.actorUid || input.context.uid,
      workloadUpdatedAt: FieldValue.serverTimestamp(),
      smartZonePolicyVersion: plan.policyVersion,
      recommendedScalerCount: plan.recommendedScalerCount,
      compensationRecommendationPolicyVersion: plan.compensation?.policyVersion||null,
      compensationEstimatedWorkMinutes: plan.compensation?.estimatedWorkMinutes||null,
      compensationRecommendedBasePayCents: plan.compensation?.recommendedBasePayCents||null,
      compensationMinimumEffectiveRateCentsPerHour:
        plan.compensation?.minimumEffectiveCompensationCentsPerHour||null,
      ...(request.data?.useRecommendedPay === true ? {
        basePay: plan.compensation.recommendedBasePayCents / 100,
        compensationRecommendationAccepted: true,
        compensationRecommendationAcceptedAt: FieldValue.serverTimestamp(),
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {success: true, campaignId: input.campaignId, planId: plan.planId,
        zoneCount: plan.zones.length, replay: false,
        recommendedPayApplied: request.data?.useRecommendedPay === true,
        recommendedBasePayCents: plan.compensation?.recommendedBasePayCents||null};
    });
    return result;
  }),
);

/** Server-authoritative, industry-neutral property/housing-stock analysis. */
































































































































































































































































































































































































































































































































































































































































































































































/** Saves owner preferences without changing identity, entitlement, or search authority. */
exports.saveDiscoveryPreferences = onCall(
  { enforceAppCheck: false, maxInstances: 4 },
  async (request) => {
    const context = await requireVerifiedUser(request, "Sign in to save Areas & Preferences.");
    if (!["business", "scaler"].includes(context.role)) {
      throw new HttpsError("permission-denied", "A Business or Scaler account is required.");
    }
    let value;
    try {value = discoveryPreferences.sanitizePreferences(request.data?.preferences, context.role);}
    catch (_) {throw new HttpsError("invalid-argument", "Check the saved areas and preferences.");}
    const reference = db.collection("discoveryPreferences").doc(context.uid);
    let preferenceVersion;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      preferenceVersion = Number(existing.data()?.preferenceVersion || 0) + 1;
      const storedValue = serviceAreaGeometryCodec.encodeDiscoveryPreferencesForFirestore(value);
      if (serviceAreaGeometryCodec.containsDirectNestedArray(storedValue)) {
        throw new Error("invalid_nested_array_storage");
      }
      const initialSetupCompletedAt = existing.data()?.initialSetupCompletedAt || (
      request.data?.initialSetupCompleted === true ? FieldValue.serverTimestamp() : null);
      transaction.set(reference, { ...storedValue, userUid: context.uid, preferenceVersion,
        initialSetupCompletedAt,
        updatedBy: context.uid, updatedAt: FieldValue.serverTimestamp(),
        createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp() });
    });
    const savedSnapshot = await reference.get();
    const authoritative = discoveryPreferences.sanitizePreferences(savedSnapshot.data(), context.role);
    if (context.role === "scaler" && request.data?.initialSetupCompleted === true) {
      const authUser = await getAuth().getUser(context.uid);
      await require("./scaler_profile_notifications").queueScalerProfileCompletion({
        db, serverTimestamp: FieldValue.serverTimestamp(), uid: context.uid,
        authUser, profile: context.user, preferences: authoritative,
        occurredAt: new Date().toISOString()
      });
    }
    return { preferences: { ...authoritative, userUid: context.uid, preferenceVersion,
        initialSetupCompleted: savedSnapshot.data()?.initialSetupCompletedAt != null } };
  }
);

/** Returns the one server-authored taxonomy projection used by Scaler setup. */



























































/** Resolves user-submitted places through a cached, globally throttled provider boundary. */
exports.resolveServiceAreaPlace = onCall(
  { enforceAppCheck: false, maxInstances: 4, timeoutSeconds: 15 },
  async (request) => {
    await requireVerifiedUser(request, "Sign in to find a service area.");
    try {
      return await serviceAreaResolution.resolvePlace({
        query: request.data?.query,
        db,
        baseUrl: process.env.NOMINATIM_BASE_URL,
        tigerBase: process.env.TIGERWEB_BASE_URL,
        onCacheWriteError: (error) => logger.info("Service area cache write skipped.", {
          errorCode: String(error?.message || error).slice(0, 80),
          cacheVersion: serviceAreaResolution.CACHE_VERSION
        })
      });
    } catch (error) {
      if (error?.message === "invalid_query") {
        throw new HttpsError("invalid-argument", "Enter a city, county, or ZIP.");
      }
      if (error?.message === "rate_limited") {
        throw new HttpsError("resource-exhausted", "Map search is busy. Try again in a moment.");
      }
      logger.info("Service area resolution unavailable.", {
        errorCode: String(error?.message || error).slice(0, 80)
      });
      throw new HttpsError("unavailable", "We couldn't map that area automatically.");
    }
  }
);

/** Returns deterministic, explainable relevance; manual search always remains open. */






























































































































































































































































































































/**
 * Query OpenStreetMap via Overpass.
 */
async function analyzeResidentialGeography(
points)
{
  const polygon = points.
  map(
    (point) =>
    `${point.latitude} ${point.longitude}`
  ).
  join(" ");

  const query = `
[out:json][timeout:25];

(
  nwr["addr:housenumber"](poly:"${polygon}");

  nwr["building"](poly:"${polygon}");
);

out tags center;
`;

  const body =
  new URLSearchParams();

  body.set(
    "data",
    query
  );

  const controller =
  new AbortController();

  const timeout =
  setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const response =
    await fetch(
      OVERPASS_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
          "application/x-www-form-urlencoded",

          "User-Agent":
          "ScaledCircle-Development/1.0"
        },

        body:
        body.toString(),

        signal:
        controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `Overpass returned HTTP ${response.status}.`
      );
    }

    const payload =
    await response.json();

    const elements =
    Array.isArray(payload.elements) ?
    payload.elements :
    [];

    const addressKeys =
    new Set();

    const residentialBuildings =
    new Set();

    const totalBuildings =
    new Set();

    for (const element of elements) {
      const tags =
      element.tags || {};

      const elementKey =
      `${element.type}:${element.id}`;

      if (
      typeof tags["addr:housenumber"] ===
      "string" &&
      tags["addr:housenumber"].trim().
      length > 0)
      {
        const houseNumber =
        tags["addr:housenumber"].trim();

        const street =
        typeof tags["addr:street"] ===
        "string" ?
        tags["addr:street"].trim() :
        "";

        const postcode =
        typeof tags["addr:postcode"] ===
        "string" ?
        tags["addr:postcode"].trim() :
        "";

        addressKeys.add(
          `${houseNumber}|${street}|${postcode}|${elementKey}`
        );
      }

      const building =
      tags.building;

      if (
      typeof building === "string" &&
      building.length > 0 &&
      building !== "no")
      {
        totalBuildings.add(
          elementKey
        );

        if (
        isResidentialBuildingType(
          building
        ))
        {
          residentialBuildings.add(
            elementKey
          );
        }
      }
    }

    return {
      addressCount:
      addressKeys.size,

      residentialBuildingCount:
      residentialBuildings.size,

      totalBuildingCount:
      totalBuildings.size,

      source:
      "openstreetmap_overpass"
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

function isResidentialBuildingType(
building)
{
  const residentialTypes =
  new Set([
  "apartments",
  "bungalow",
  "cabin",
  "detached",
  "dormitory",
  "farm",
  "house",
  "residential",
  "semidetached_house",
  "static_caravan",
  "terrace"]
  );

  return residentialTypes.has(
    building
  );
}

function determineHomeEstimate({
  geographicResult,
  areaAcres
}) {
  const addressCount =
  geographicResult.addressCount;

  const residentialBuildingCount =
  geographicResult.
  residentialBuildingCount;

  if (addressCount >= 5) {
    return {
      estimatedHomes:
      addressCount,

      method:
      "osm_address_points_v1",

      confidence:
      "high",

      confidenceScore:
      0.85
    };
  }

  if (
  residentialBuildingCount >= 3)
  {
    return {
      estimatedHomes:
      residentialBuildingCount,

      method:
      "osm_residential_buildings_v1",

      confidence:
      "medium",

      confidenceScore:
      0.65
    };
  }

  const fallbackHomes =
  calculateDevelopmentHomeEstimate({
    areaAcres
  });

  return {
    estimatedHomes:
    fallbackHomes,

    method:
    "development_area_density_fallback_v1",

    confidence:
    "low",

    confidenceScore:
    fallbackHomes > 0 ?
    0.35 :
    0.0
  };
}

function calculateDevelopmentHomeEstimate({
  areaAcres
}) {
  if (
  !Number.isFinite(areaAcres) ||
  areaAcres <= 0)
  {
    return 0;
  }

  return Math.max(
    1,
    Math.round(
      areaAcres *
      DEVELOPMENT_HOMES_PER_ACRE
    )
  );
}






















































































































































































































































function readText(value, maximumLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}














































































































































































































































































































































function readNumber(
value,
fallback = 0)
{
  if (
  typeof value === "number" &&
  Number.isFinite(value))
  {
    return value;
  }

  return fallback;
}

function readInteger(
value,
fallback = 0)
{
  const number = readNumber(
    value,
    fallback
  );

  return Math.round(
    number
  );
}

// Native active-job tracking -------------------------------------------------


































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































async function refreshStagingPublicCampaign(campaignId) {
  if ((process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) !== 'scaledcircle-staging') {
    throw new HttpsError('failed-precondition', 'This projection is staging-only.');
  }
  // Re-read current state transactionally: delayed/replayed triggers cannot restore stale content.
  return db.runTransaction(async (transaction) => {
    const source = await transaction.get(db.collection('campaigns').doc(campaignId));
    const target = db.collection('campaignDiscovery').doc(campaignId);
    if (!source.exists) {transaction.delete(target);return;}
    transaction.set(target, operations.publicCampaignDocument(campaignId, source.data()));
  });
}

exports.projectStagingCampaignDiscovery = onDocumentWritten({ document: 'campaigns/{campaignId}', region: 'us-east1' }, async (event) => {
  await refreshStagingPublicCampaign(event.params.campaignId);
});

exports.refreshStagingCampaignDiscovery = onCall({ region: 'us-east1', maxInstances: 1 }, async (request) => {
  const context = await requireVerifiedUser(request, 'Sign in as an administrator.');
  if (!context.isAdmin) throw new HttpsError('permission-denied', 'Administrator authority required.');
  if (!request.data || Object.keys(request.data).some((key) => key !== 'campaignIds')) {
    throw new HttpsError('invalid-argument', 'Only campaign IDs are accepted.');
  }
  const ids = request.data?.campaignIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 ||
  ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new HttpsError('invalid-argument', 'Provide one to fifty exact campaign IDs.');
  }
  for (const id of new Set(ids)) await refreshStagingPublicCampaign(id);
  return { refreshed: new Set(ids).size, sourceRecordsChanged: 0 };
});

// IDs only. Exact addresses still require the existing per-document Rules check.
exports.listStagingAssignedLocationIds = onCall({ region: 'us-east1', maxInstances: 2 }, async (request) => {
  if (process.env.GCLOUD_PROJECT !== 'scaledcircle-staging') {
    throw new HttpsError('failed-precondition', 'Available in staging only.');
  }
  const context = await requireVerifiedUser(request, 'Sign in to view assigned work.');
  if (context.role !== 'scaler' || context.user.active !== true) {
    throw new HttpsError('permission-denied', 'An active Scaler account is required.');
  }
  if (request.data && Object.keys(request.data).length) {
    throw new HttpsError('invalid-argument', 'No target identity or filters are accepted.');
  }
  const rows = await db.collection('campaignLocations').where('assignedScalerId', '==', context.uid).limit(501).get();
  if (rows.size > 500) throw new HttpsError('resource-exhausted', 'Contact support to load this assignment history.');
  const ids = [];
  const campaigns = new Map();
  for (const row of rows.docs) {
    const data = row.data();
    if (!['assigned', 'in_progress'].includes(data.status)) continue;
    if (typeof data.campaignId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.campaignId)) continue;
    if (!campaigns.has(data.campaignId)) campaigns.set(data.campaignId, await db.doc(`campaigns/${data.campaignId}`).get());
    const campaign = campaigns.get(data.campaignId);
    if (!campaign.exists || !data.businessId || campaign.data().businessId !== data.businessId) continue;
    if (stagingPhysicalQa.reserved(data.campaignId)) {
      try {await assertPhysicalQaRequest({ ...request, data: { campaignId: data.campaignId } });}
      catch (_) {continue;}
    }
    ids.push(row.id);
  }
  return { locationIds: ids.sort() };
});

exports.getCampaignZoneIntelligence = onCall(
  {enforceAppCheck: false, maxInstances: 5, timeoutSeconds: 60},
  businessOperation("getCampaignZoneIntelligence", async (request) => {
    const context = await authenticatedUserContext(request, "Sign in to review your campaign area.");
    if (context.role !== "business" || context.isAdmin || !context.permissions?.includes("campaigns")) {
      throw new HttpsError("permission-denied", "Business campaign access is required.");
    }
    try {
      return await require('./zone_intelligence_runtime').preview({db, context, data:request.data || {},onDiagnostic:trace=>logger.info('Manual Zone evidence',trace),
        fetchSnapshot:require('./smart_zone_public_cache_runtime').createAcquirer({
          db, bucket:getStorage().bucket(), liveFetch:smartZoneGeography.fetchSnapshot,allowPartialRegional:true}), endpoint:OVERPASS_URL});
    } catch (error) {
      const known = ["unauthenticated", "permission-denied", "not-found", "invalid-argument", "failed-precondition"].includes(error.code);
      throw new HttpsError(known ? error.code : "unavailable", known ? error.message :
        "Area evidence is temporarily unavailable. Your boundary has not changed.");
    }
  }),
);

exports.confirmCampaignZoneIntelligence = onCall(
  {enforceAppCheck:false,maxInstances:5,timeoutSeconds:65},
  businessOperation("confirmCampaignZoneIntelligence", async request => {
    const context=await authenticatedUserContext(request,"Sign in to review your campaign Zone.");
    if(context.role!=='business'||context.isAdmin||!context.permissions?.includes('campaigns'))
      throw new HttpsError('permission-denied','Business campaign access is required.');
    return require('./zone_intelligence_runtime').confirm({db,FieldValue,context,data:request.data||{},
      reauthorize:transaction=>businessWorkspaceService().authority({uid:context.actorUid||context.uid,
        businessId:context.uid,permission:'campaigns',transaction,allowExpired:true}),
      fetchSnapshot:require('./smart_zone_public_cache_runtime').createAcquirer({
        db,bucket:getStorage().bucket(),liveFetch:smartZoneGeography.fetchSnapshot,allowPartialRegional:true}),endpoint:OVERPASS_URL});
  }),
);
