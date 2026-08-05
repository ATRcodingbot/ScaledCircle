const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "us-east1",
});

/**
 * Starts backend analysis for a campaign zone.
 *
 * Expected request:
 * {
 *   zoneId: "campaignZones document ID"
 * }
 */
exports.analyzeCampaignZone = onCall(
  {
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to analyze a campaign zone.",
      );
    }

    const zoneId = request.data?.zoneId;

    if (
      typeof zoneId !== "string" ||
      zoneId.trim().length === 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid zoneId is required.",
      );
    }

    const cleanZoneId = zoneId.trim();
    const zoneReference = db
      .collection("campaignZones")
      .doc(cleanZoneId);

    try {
      const zoneSnapshot = await zoneReference.get();

      if (!zoneSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The requested campaign zone does not exist.",
        );
      }

      const zoneData = zoneSnapshot.data() || {};

      const businessId =
        typeof zoneData.businessId === "string"
          ? zoneData.businessId
          : "";

      if (
        businessId.length === 0 ||
        businessId !== request.auth.uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to analyze this zone.",
        );
      }

      const serviceArea = Array.isArray(
        zoneData.serviceArea,
      )
        ? zoneData.serviceArea
        : [];

      const validPoints = serviceArea.filter(
        (point) =>
          point &&
          typeof point === "object" &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude),
      );

      if (validPoints.length < 3) {
        throw new HttpsError(
          "failed-precondition",
          "The zone must contain at least three valid map points.",
        );
      }

      const areaSquareMeters = readNumber(
        zoneData.zoneAreaSquareMeters,
      );

      const areaAcres = readNumber(
        zoneData.zoneAreaAcres,
      );

      const areaSquareMiles = readNumber(
        zoneData.zoneAreaSquareMiles,
      );

      const perimeterMeters = readNumber(
        zoneData.zonePerimeterMeters,
      );

      const estimatedWalkingMiles = readNumber(
        zoneData.estimatedWalkingMiles,
      );

      const estimatedMinutes = readInteger(
        zoneData.estimatedMinutes,
      );

      const recommendedScalerCount = Math.max(
        1,
        readInteger(
          zoneData.recommendedScalerCount,
          1,
        ),
      );

      const suggestedBasePay = readNumber(
        zoneData.suggestedBasePay,
      );

      await zoneReference.update({
        homeCountStatus: "pending",
        homeCountMethod: "awaiting_geographic_data",
        homeCountConfidence: null,
        homeCountConfidenceScore: null,
        homeCountError: FieldValue.delete(),
        analysisStatus: "geometry_complete",
        analysisRequestedBy: request.auth.uid,
        analysisRequestedAt:
          FieldValue.serverTimestamp(),
        analysisUpdatedAt:
          FieldValue.serverTimestamp(),
      });

      const response = {
        success: true,
        zoneId: cleanZoneId,
        analysisStatus: "geometry_complete",
        geometry: {
          pointCount: validPoints.length,
          shapeType:
            zoneData.serviceAreaType ||
            zoneData.shapeType ||
            "polygon",
          areaSquareMeters,
          areaAcres,
          areaSquareMiles,
          perimeterMeters,
        },
        workload: {
          estimatedWalkingMiles,
          estimatedMinutes,
          recommendedScalerCount,
          suggestedBasePay,
        },
        homes: {
          status: "pending",
          estimatedHomes: null,
          method: "awaiting_geographic_data",
          confidence: null,
        },
      };

      logger.info(
        "Campaign zone geometry analysis completed.",
        {
          zoneId: cleanZoneId,
          businessId,
          pointCount: validPoints.length,
        },
      );

      return response;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(
        "Campaign zone analysis failed.",
        {
          zoneId: cleanZoneId,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );

      try {
        await zoneReference.update({
          analysisStatus: "failed",
          homeCountStatus: "failed",
          homeCountError:
            error instanceof Error
              ? error.message
              : String(error),
          analysisUpdatedAt:
            FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        logger.error(
          "Unable to store zone analysis failure.",
          {
            zoneId: cleanZoneId,
            error:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
          },
        );
      }

      throw new HttpsError(
        "internal",
        "Unable to analyze the campaign zone.",
      );
    }
  },
);

function readNumber(
  value,
  fallback = 0,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return fallback;
}

function readInteger(
  value,
  fallback = 0,
) {
  const number = readNumber(
    value,
    fallback,
  );

  return Math.round(number);
}