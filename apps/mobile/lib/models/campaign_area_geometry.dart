import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

enum CampaignAreaShape { polygon, rectangle, circle, triangle }

abstract final class CampaignAreaGeometry {
  static List<LatLng> fromInput(CampaignAreaShape shape, List<LatLng> points) {
    switch (shape) {
      case CampaignAreaShape.polygon:
        return _orderedPolygon(points);
      case CampaignAreaShape.triangle:
        return points.length == 3 ? _orderedPolygon(points) : [];
      case CampaignAreaShape.rectangle:
        return points.length == 2 ? rectangle(points[0], points[1]) : [];
      case CampaignAreaShape.circle:
        return points.length == 2 ? circle(points[0], points[1]) : [];
    }
  }

  static bool isComplete(CampaignAreaShape shape, List<LatLng> generated) {
    return switch (shape) {
      CampaignAreaShape.polygon => generated.length >= 3,
      CampaignAreaShape.triangle => generated.length == 3,
      CampaignAreaShape.rectangle => generated.length == 4,
      CampaignAreaShape.circle => generated.length == 48,
    };
  }

  static int maximumInputPoints(CampaignAreaShape shape) => switch (shape) {
    CampaignAreaShape.polygon => 100,
    CampaignAreaShape.triangle => 3,
    CampaignAreaShape.rectangle || CampaignAreaShape.circle => 2,
  };

  static List<LatLng> rectangle(LatLng first, LatLng second) => [
    LatLng(first.latitude, first.longitude),
    LatLng(first.latitude, second.longitude),
    LatLng(second.latitude, second.longitude),
    LatLng(second.latitude, first.longitude),
  ];

  static List<LatLng> circle(LatLng center, LatLng edge) {
    final distance = const Distance();
    final radiusMeters = distance.as(LengthUnit.Meter, center, edge);
    return List<LatLng>.generate(
      48,
      (index) => distance.offset(center, radiusMeters, (360 / 48) * index),
      growable: false,
    );
  }

  static List<LatLng> _orderedPolygon(List<LatLng> points) {
    if (points.length < 3) return List<LatLng>.from(points);
    final latitude =
        points.fold<double>(0, (sum, p) => sum + p.latitude) / points.length;
    final longitude =
        points.fold<double>(0, (sum, p) => sum + p.longitude) / points.length;
    return List<LatLng>.from(points)..sort(
      (a, b) => math
          .atan2(a.latitude - latitude, a.longitude - longitude)
          .compareTo(
            math.atan2(b.latitude - latitude, b.longitude - longitude),
          ),
    );
  }

  static String value(CampaignAreaShape shape) => shape.name;

  static String label(CampaignAreaShape shape) => switch (shape) {
    CampaignAreaShape.polygon => 'Polygon',
    CampaignAreaShape.rectangle => 'Rectangle',
    CampaignAreaShape.circle => 'Circle',
    CampaignAreaShape.triangle => 'Triangle',
  };
}
