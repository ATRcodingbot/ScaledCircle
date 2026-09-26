import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

class FreehandAreaResult {
  final List<LatLng> points;
  final String? error;
  final double areaSquareMeters;
  final double simplificationToleranceMeters;
  bool get isValid => error == null;

  const FreehandAreaResult({
    this.points = const [],
    this.error,
    this.areaSquareMeters = 0,
    this.simplificationToleranceMeters = 0,
  });
}

/// Local drawing support only. This does not establish targets, walking capacity,
/// funding or completion authority, and never modifies an existing saved area.
abstract final class CampaignFreehandGeometry {
  static const minimumAreaSquareMeters = 100.0;
  static const maximumAreaSquareMeters = 100000000.0;
  static const maximumRawPoints = 2048;
  static const maximumVertices = 100;
  static const maximumSimplificationMeters = 5.0;
  static const _earthMeters = 6371008.8;

  static FreehandAreaResult finish(List<LatLng> trace) {
    FreehandAreaResult fail(String message) =>
        FreehandAreaResult(error: message);
    if (trace.length > maximumRawPoints) {
      return fail(
        'This trace is too detailed. Draw the boundary again in one shorter stroke.',
      );
    }
    if (trace.length < 3) {
      return fail('Trace around an area before lifting your finger or mouse.');
    }
    if (trace.any(
      (p) =>
          !p.latitude.isFinite ||
          !p.longitude.isFinite ||
          p.latitude.abs() > 85 ||
          p.longitude.abs() > 180,
    )) {
      return fail('This boundary contains an unsupported map location.');
    }
    final latitudes = trace.map((p) => p.latitude);
    final longitudes = trace.map((p) => p.longitude);
    final latSpan = latitudes.reduce(math.max) - latitudes.reduce(math.min);
    final lonSpan = longitudes.reduce(math.max) - longitudes.reduce(math.min);
    if (lonSpan > 180) {
      return fail('Drawing across the date line is not supported.');
    }
    if (latSpan > .25 || lonSpan > .25) {
      return fail('This outline is too wide. Draw a smaller local territory.');
    }
    final latitude = latitudes.reduce((a, b) => a + b) / trace.length;
    final scaleX =
        _earthMeters * math.pi / 180 * math.cos(latitude * math.pi / 180);
    const scaleY = _earthMeters * math.pi / 180;
    final origin = trace.first;
    final raw = trace
        .map(
          (p) => _Point(
            p,
            (p.longitude - origin.longitude) * scaleX,
            (p.latitude - origin.latitude) * scaleY,
          ),
        )
        .toList();
    // Only sub-pixel jitter/near-consecutive repeats are removed before validating
    // topology. A meaningful loop is rejected, not repaired into a different area.
    final ring = <_Point>[];
    for (final p in raw) {
      if (ring.isEmpty || _distance(p, ring.last) > .2) ring.add(p);
    }
    while (ring.length > 1 && _distance(ring.first, ring.last) <= .2) {
      ring.removeLast();
    }
    if (ring.length < 3) return fail('Draw an area of at least 100 m².');
    if (!_simple(ring)) {
      return fail(
        'The boundary crosses or loops back over itself. Redraw that edge.',
      );
    }
    final originalArea = _signedArea(ring);
    if (originalArea.abs() < minimumAreaSquareMeters) {
      return fail('Draw an area of at least 100 m².');
    }
    if (originalArea.abs() > maximumAreaSquareMeters) {
      return fail('Freehand drawing supports up to 100 km² per territory.');
    }
    // Split a closed ring into two anchored arcs. Never sort vertices by angle:
    // doing that would erase concave neighborhood edges.
    var opposite = 1;
    for (var i = 2; i < ring.length; i++) {
      if (_distance(ring.first, ring[i]) >
          _distance(ring.first, ring[opposite])) {
        opposite = i;
      }
    }
    for (final tolerance in [.5, 1.0, 2.0, 3.0, 5.0]) {
      final first = _simplify(ring.sublist(0, opposite + 1), tolerance);
      final second = _simplify([
        ...ring.sublist(opposite),
        ring.first,
      ], tolerance);
      final candidate = [
        ...first.take(first.length - 1),
        ...second.take(second.length - 1),
      ];
      if (candidate.length < 3 ||
          candidate.length > maximumVertices ||
          !_simple(candidate)) {
        continue;
      }
      final area = _signedArea(candidate);
      if (area * originalArea <= 0 ||
          (area.abs() - originalArea.abs()).abs() / originalArea.abs() > .02 ||
          area.abs() < minimumAreaSquareMeters ||
          area.abs() > maximumAreaSquareMeters) {
        continue;
      }
      // Include discarded near-duplicates in the final deviation check.
      if (raw.any(
        (p) => _ringDistance(p, candidate) > maximumSimplificationMeters,
      )) {
        continue;
      }
      return FreehandAreaResult(
        points: List.unmodifiable(candidate.map((p) => p.geographic)),
        areaSquareMeters: area.abs(),
        simplificationToleranceMeters: tolerance,
      );
    }
    // A valid already-small ring need not be simplified at all.
    if (ring.length <= maximumVertices) {
      return FreehandAreaResult(
        points: List.unmodifiable(ring.map((p) => p.geographic)),
        areaSquareMeters: originalArea.abs(),
      );
    }
    return fail(
      'This boundary needs more detail than the safe drawing limit. Redraw a simpler edge; your area has not been replaced.',
    );
  }

  static List<_Point> _simplify(List<_Point> points, double tolerance) {
    if (points.length < 3) return points;
    final keep = <int>{0, points.length - 1};
    final pending = <(int, int)>[(0, points.length - 1)];
    while (pending.isNotEmpty) {
      final (start, end) = pending.removeLast();
      var farthest = tolerance;
      var index = -1;
      for (var i = start + 1; i < end; i++) {
        final distance = _segmentDistance(
          points[i],
          points[start],
          points[end],
        );
        if (distance > farthest) {
          farthest = distance;
          index = i;
        }
      }
      if (index >= 0) {
        keep.add(index);
        pending.add((start, index));
        pending.add((index, end));
      }
    }
    return (keep.toList()..sort()).map((i) => points[i]).toList();
  }

  static double _distance(_Point a, _Point b) =>
      math.sqrt(math.pow(a.x - b.x, 2) + math.pow(a.y - b.y, 2));
  static double _segmentDistance(_Point p, _Point a, _Point b) {
    final dx = b.x - a.x, dy = b.y - a.y;
    final denominator = dx * dx + dy * dy;
    if (denominator == 0) return _distance(p, a);
    final t = (((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator).clamp(
      0.0,
      1.0,
    );
    return math.sqrt(
      math.pow(p.x - (a.x + t * dx), 2) + math.pow(p.y - (a.y + t * dy), 2),
    );
  }

  static double _ringDistance(_Point p, List<_Point> ring) {
    var result = double.infinity;
    for (var i = 0; i < ring.length; i++) {
      result = math.min(
        result,
        _segmentDistance(p, ring[i], ring[(i + 1) % ring.length]),
      );
    }
    return result;
  }

  static double _signedArea(List<_Point> ring) {
    var area = 0.0;
    for (var i = 0; i < ring.length; i++) {
      final a = ring[i], b = ring[(i + 1) % ring.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  static double _cross(_Point a, _Point b, _Point c) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  static bool _onSegment(_Point a, _Point b, _Point p) =>
      p.x >= math.min(a.x, b.x) - 1e-8 &&
      p.x <= math.max(a.x, b.x) + 1e-8 &&
      p.y >= math.min(a.y, b.y) - 1e-8 &&
      p.y <= math.max(a.y, b.y) + 1e-8;
  static bool _simple(List<_Point> ring) {
    for (var i = 0; i < ring.length; i++) {
      final a = ring[i],
          b = ring[(i + 1) % ring.length],
          c = ring[(i + 2) % ring.length];
      if (_cross(a, b, c).abs() <= 1e-8 &&
          (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) > 0) {
        return false;
      }
      for (var j = i + 2; j < ring.length; j++) {
        if (i == 0 && j == ring.length - 1) continue;
        final d = ring[j], e = ring[(j + 1) % ring.length];
        if (math.max(a.x, b.x) < math.min(d.x, e.x) ||
            math.max(d.x, e.x) < math.min(a.x, b.x) ||
            math.max(a.y, b.y) < math.min(d.y, e.y) ||
            math.max(d.y, e.y) < math.min(a.y, b.y)) {
          continue;
        }
        final abD = _cross(a, b, d),
            abE = _cross(a, b, e),
            deA = _cross(d, e, a),
            deB = _cross(d, e, b);
        if ((abD * abE < 0 && deA * deB < 0) ||
            (abD.abs() <= 1e-8 && _onSegment(a, b, d)) ||
            (abE.abs() <= 1e-8 && _onSegment(a, b, e)) ||
            (deA.abs() <= 1e-8 && _onSegment(d, e, a)) ||
            (deB.abs() <= 1e-8 && _onSegment(d, e, b))) {
          return false;
        }
      }
    }
    return true;
  }
}

class _Point {
  final LatLng geographic;
  final double x, y;
  const _Point(this.geographic, this.x, this.y);
}
