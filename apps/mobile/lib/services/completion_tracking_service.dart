import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:latlong2/latlong.dart';

class CompletionTrackingService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final Distance _distance = const Distance();

  Future<Map<String, dynamic>> calculateCompletion({
    required String zoneId,
    required List<LatLng> routePoints,
  }) async {
    final zoneReference = _firestore.collection('campaignZones').doc(zoneId);

    final zoneSnapshot = await zoneReference.get();

    if (!zoneSnapshot.exists) {
      throw Exception('Zone not found.');
    }

    final zoneData = zoneSnapshot.data();

    if (zoneData == null) {
      throw Exception('Zone data is invalid.');
    }

    /*
     * Prefer the workload that was frozen when
     * the Scaler was assigned.
     *
     * estimatedHomes remains as a fallback for
     * older development/test zones.
     */
    final assignedHomes =
        (zoneData['assignedHomes'] as num?)?.toInt() ??
        (zoneData['estimatedHomes'] as num?)?.toInt() ??
        0;

    if (assignedHomes <= 0) {
      throw Exception('Zone does not have a valid assigned home count.');
    }

    if (routePoints.length < 2) {
      return {
        'assignedHomes': assignedHomes,
        'completedHomes': 0,
        'completionPercentage': 0.0,
        'eligibleForPayment': false,
        'routeDistanceMeters': 0.0,
        'insideZoneDistanceMeters': 0.0,
        'expectedWalkingMeters': 0.0,
        'routePointCount': routePoints.length,
        'calculationMethod': 'gps_route_distance_v1',
      };
    }

    final serviceArea = _parsePoints(zoneData['serviceArea']);

    if (serviceArea.length < 3) {
      throw Exception('Zone does not have a valid mapped service area.');
    }

    /*
     * This is the expected amount of walking needed
     * to service the zone.
     *
     * campaign_area_screen.dart already calculates
     * estimatedWalkingMeters when the zone is mapped.
     */
    var expectedWalkingMeters =
        (zoneData['estimatedWalkingMeters'] as num?)?.toDouble() ?? 0.0;

    /*
     * Backward compatibility for zones where only
     * estimatedWalkingMiles exists.
     */
    if (expectedWalkingMeters <= 0.0) {
      final estimatedWalkingMiles =
          (zoneData['estimatedWalkingMiles'] as num?)?.toDouble() ?? 0.0;

      expectedWalkingMeters = estimatedWalkingMiles * 1609.344;
    }

    if (expectedWalkingMeters <= 0.0) {
      throw Exception('Zone does not have a valid expected walking distance.');
    }

    double totalRouteMeters = 0.0;

    double insideZoneMeters = 0.0;

    int acceptedSegments = 0;

    int ignoredSegments = 0;

    /*
     * Measure the route segment-by-segment.
     *
     * We use the midpoint of each segment to decide
     * whether that piece of travel occurred inside
     * the assigned service area.
     *
     * Very tiny movements are ignored as GPS jitter.
     *
     * Extremely large jumps are also ignored so a
     * bad GPS reading or simulation teleport does
     * not create artificial completion.
     */
    for (int i = 1; i < routePoints.length; i++) {
      final previous = routePoints[i - 1];

      final current = routePoints[i];

      final segmentMeters = _distance.as(LengthUnit.Meter, previous, current);

      /*
       * Less than 2 meters:
       * likely stationary GPS drift.
       */
      if (segmentMeters < 2.0) {
        ignoredSegments++;

        continue;
      }

      /*
       * More than 250 meters between consecutive
       * samples is treated as an unrealistic jump
       * for canvassing/walking completion.
       */
      if (segmentMeters > 250.0) {
        ignoredSegments++;

        continue;
      }

      acceptedSegments++;

      totalRouteMeters += segmentMeters;

      final midpoint = LatLng(
        (previous.latitude + current.latitude) / 2.0,
        (previous.longitude + current.longitude) / 2.0,
      );

      if (_isPointInsidePolygon(midpoint, serviceArea)) {
        insideZoneMeters += segmentMeters;
      }
    }

    /*
     * Completion comes from usable GPS distance
     * traveled INSIDE the assigned zone.
     *
     * Example:
     *
     * Expected walking = 4,000 meters
     * GPS inside zone  = 3,000 meters
     *
     * Completion = 75%
     */
    var completionRatio = insideZoneMeters / expectedWalkingMeters;

    completionRatio = completionRatio.clamp(0.0, 1.0);

    final completionPercentage = completionRatio * 100.0;

    /*
     * Homes are derived from GPS coverage.
     *
     * The Scaler never enters this number.
     *
     * If 65 homes were assigned and GPS coverage
     * indicates 75% completion:
     *
     * 65 × .75 ≈ 49 homes covered.
     */
    var completedHomes = (assignedHomes * completionRatio).round();

    completedHomes = completedHomes.clamp(0, assignedHomes);

    final eligibleForPayment = completionPercentage >= 10.0;

    return {
      'assignedHomes': assignedHomes,

      'completedHomes': completedHomes,

      'completionPercentage': completionPercentage,

      'eligibleForPayment': eligibleForPayment,

      'routeDistanceMeters': totalRouteMeters,

      'insideZoneDistanceMeters': insideZoneMeters,

      'expectedWalkingMeters': expectedWalkingMeters,

      'insideZonePercentage': totalRouteMeters <= 0.0
          ? 0.0
          : (insideZoneMeters / totalRouteMeters) * 100.0,

      'routePointCount': routePoints.length,

      'acceptedRouteSegments': acceptedSegments,

      'ignoredRouteSegments': ignoredSegments,

      'calculationMethod': 'gps_route_distance_v1',
    };
  }

  List<LatLng> _parsePoints(dynamic rawPoints) {
    if (rawPoints is! List) {
      return [];
    }

    final points = <LatLng>[];

    for (final item in rawPoints) {
      if (item is! Map) {
        continue;
      }

      final latitude = item['latitude'];

      final longitude = item['longitude'];

      if (latitude is num && longitude is num) {
        points.add(LatLng(latitude.toDouble(), longitude.toDouble()));
      }
    }

    return points;
  }

  bool _isPointInsidePolygon(LatLng point, List<LatLng> polygon) {
    if (polygon.length < 3) {
      return false;
    }

    bool inside = false;

    int j = polygon.length - 1;

    for (int i = 0; i < polygon.length; i++) {
      final current = polygon[i];

      final previous = polygon[j];

      final crossesLatitude =
          (current.latitude > point.latitude) !=
          (previous.latitude > point.latitude);

      if (crossesLatitude) {
        final longitudeAtCrossing =
            (previous.longitude - current.longitude) *
                (point.latitude - current.latitude) /
                (previous.latitude - current.latitude) +
            current.longitude;

        if (point.longitude < longitudeAtCrossing) {
          inside = !inside;
        }
      }

      j = i;
    }

    return inside;
  }
}
