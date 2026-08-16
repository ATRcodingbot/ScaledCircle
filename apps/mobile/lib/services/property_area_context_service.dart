import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

class SavedPropertyAreaContext {
  const SavedPropertyAreaContext({
    required this.id,
    required this.name,
    required this.type,
    required this.polygon,
  });

  final String id;
  final String name;
  final String type;
  final List<LatLng> polygon;
}

class PropertyAreaContextService {
  const PropertyAreaContextService();

  List<SavedPropertyAreaContext> resolveEnabledAreas(
    Map<String, dynamic>? preferences,
  ) => (preferences?['areas'] as List? ?? const [])
      .whereType<Map>()
      .where((area) => area['enabled'] != false)
      .map((area) => resolve(Map<String, dynamic>.from(area)))
      .whereType<SavedPropertyAreaContext>()
      .toList(growable: false);

  SavedPropertyAreaContext? resolve(Map<String, dynamic> area) {
    final name = area['name']?.toString().trim();
    final type = area['type']?.toString().trim() ?? '';
    final stored = _points(area['geometry']);
    if (stored.length >= 3) {
      return SavedPropertyAreaContext(
        id: area['id']?.toString() ?? name ?? 'saved-area',
        name: name?.isNotEmpty == true ? name! : 'Saved service area',
        type: type,
        polygon: stored,
      );
    }
    if (type == 'around_business' &&
        area['center'] is Map &&
        area['radiusMiles'] is num) {
      final center = _point(area['center']);
      final radius = (area['radiusMiles'] as num).toDouble();
      if (center == null || radius <= 0) return null;
      return SavedPropertyAreaContext(
        id: area['id']?.toString() ?? name ?? 'saved-area',
        name: name?.isNotEmpty == true ? name! : 'Saved service area',
        type: type,
        polygon: List.generate(48, (index) {
          final angle = 2 * math.pi * index / 48;
          return LatLng(
            center.latitude + radius / 69 * math.sin(angle),
            center.longitude +
                radius /
                    (69 * math.cos(center.latitude * math.pi / 180)) *
                    math.cos(angle),
          );
        }),
      );
    }
    return null;
  }

  bool overlapsSavedArea(
    List<LatLng> analysisGeometry,
    Iterable<SavedPropertyAreaContext> savedAreas,
  ) {
    if (analysisGeometry.length < 3) return false;
    final center = LatLng(
      analysisGeometry.map((point) => point.latitude).reduce((a, b) => a + b) /
          analysisGeometry.length,
      analysisGeometry
              .map((point) => point.longitude)
              .reduce((a, b) => a + b) /
          analysisGeometry.length,
    );
    return savedAreas.any((area) => _inside(center, area.polygon));
  }

  List<LatLng> _points(Object? value) => (value as List? ?? const [])
      .map(_point)
      .whereType<LatLng>()
      .toList(growable: false);

  LatLng? _point(Object? value) {
    if (value is! Map) return null;
    final latitude = value['latitude'];
    final longitude = value['longitude'];
    if (latitude is! num || longitude is! num) return null;
    return LatLng(latitude.toDouble(), longitude.toDouble());
  }

  bool _inside(LatLng target, List<LatLng> polygon) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final a = polygon[i];
      final b = polygon[j];
      if (((a.latitude > target.latitude) !=
              (b.latitude > target.latitude)) &&
          (target.longitude <
              (b.longitude - a.longitude) *
                      (target.latitude - a.latitude) /
                      (b.latitude - a.latitude) +
                  a.longitude)) {
        inside = !inside;
      }
    }
    return inside;
  }
}
