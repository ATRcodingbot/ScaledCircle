const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");



const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const {
  getFirestore,
  FieldValue,
  Timestamp
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

















const discoveryPreferences = require("./discovery_preferences");

const serviceAreaGeometryCodec = require("./service_area_geometry_codec");










const operations = require("./operational_layer");




const groupAssignment = require("./group_assignment");












initializeApp();












const db = getFirestore();















































setGlobalOptions({
  maxInstances: 10,
  region: "us-east1"
});

const OVERPASS_URL =
"https://overpass-api.de/api/interpreter";

const DEVELOPMENT_HOMES_PER_ACRE = 2.5;











































async function authenticatedUserContext(request, message) {
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
  async (request) => {
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
      businessId !== request.auth.uid)
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
  }
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
