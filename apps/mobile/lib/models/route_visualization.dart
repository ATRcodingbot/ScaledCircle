import 'dart:math' as math;
import 'package:latlong2/latlong.dart';
import 'tracking_models.dart';

double routeSegmentDistance(LatLng p, LatLng a, LatLng b) {
  final scale = 111195 * math.cos(a.latitude * math.pi / 180);
  final x = (p.longitude - a.longitude) * scale;
  final y = (p.latitude - a.latitude) * 111195;
  final dx = (b.longitude - a.longitude) * scale;
  final dy = (b.latitude - a.latitude) * 111195;
  final t =
      ((x * dx + y * dy) / (dx * dx + dy * dy == 0 ? 1 : dx * dx + dy * dy))
          .clamp(0.0, 1.0);
  return math.sqrt(math.pow(x - t * dx, 2) + math.pow(y - t * dy, 2));
}

enum RoutePositionHint { none, accuracyAdjusting, offRoute }

/// Guidance only. It cannot award coverage or alter uploaded evidence.
/// Mirrors the accepted coverage tolerance: 10m + min(10m, accuracy).
/// A warning requires at least three distinct useful fixes spanning 30 seconds.
class RouteDeviationTracker {
  DateTime? _last;
  DateTime? _firstOutside;
  int _outsideCount = 0;
  RoutePositionHint _hint = RoutePositionHint.none;
  RoutePositionHint update(TrackingLocationSample? fix, List<LatLng> line) {
    if (fix == null || line.length < 2) return RoutePositionHint.none;
    if (_last == fix.recordedAt) return _hint;
    if (_last != null && fix.recordedAt.isBefore(_last!)) return _hint;
    if (_last != null && fix.recordedAt.difference(_last!).inSeconds > 45) {
      _firstOutside = null;
      _outsideCount = 0;
    }
    _last = fix.recordedAt;
    final accuracy = fix.horizontalAccuracy;
    if (!accuracy.isFinite || accuracy < 0 || accuracy > 35) {
      _firstOutside = null;
      _outsideCount = 0;
      return _hint = RoutePositionHint.accuracyAdjusting;
    }
    final p = LatLng(fix.latitude, fix.longitude);
    var distance = double.infinity;
    for (var i = 1; i < line.length; i++) {
      distance = math.min(
        distance,
        routeSegmentDistance(p, line[i - 1], line[i]),
      );
    }
    if (distance <= 10 + math.min(10, accuracy)) {
      _firstOutside = null;
      _outsideCount = 0;
      return _hint = RoutePositionHint.none;
    }
    _firstOutside ??= fix.recordedAt;
    _outsideCount++;
    return _hint =
        _outsideCount >= 3 &&
            fix.recordedAt.difference(_firstOutside!).inSeconds >= 30
        ? RoutePositionHint.offRoute
        : RoutePositionHint.accuracyAdjusting;
  }
}

/// Render-only simplification, max 3m deviation. Endpoints and long gaps remain.
/// Returns a new list of original coordinates: no interpolation or map snapping.
List<LatLng> displayRoute(List<LatLng> raw) {
  if (raw.length < 3) return List.of(raw);
  const distance = Distance();
  final result = <LatLng>[raw.first];
  var start = 0;
  while (start < raw.length - 1) {
    var end = start + 1;
    while (end + 1 < raw.length &&
        distance(raw[end], raw[end + 1]) <= 60 &&
        distance(raw[start], raw[end + 1]) <= 60) {
      final candidate = end + 1;
      var bounded = true;
      for (var i = start + 1; i < candidate; i++) {
        if (routeSegmentDistance(raw[i], raw[start], raw[candidate]) > 3) {
          bounded = false;
          break;
        }
      }
      if (!bounded) break;
      end = candidate;
    }
    result.add(raw[end]);
    start = end;
  }
  return result;
}
