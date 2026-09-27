import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

class FreehandAreaResult {
  final List<LatLng> points;
  final String? error;
  final double areaSquareMeters;
  final double simplificationToleranceMeters;
  final int repairedDefects;
  final double repairToleranceMeters;
  bool get isValid => error == null;
  bool get wasRepaired => repairedDefects > 0;

  const FreehandAreaResult({
    this.points = const [],
    this.error,
    this.areaSquareMeters = 0,
    this.simplificationToleranceMeters = 0,
    this.repairedDefects = 0,
    this.repairToleranceMeters = 0,
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
  static const unclearOutline =
      'We couldn’t make a clear area from that outline. Draw again.';
  static const maximumMinorRepairs = 8;
  static const _earthMeters = 6371008.8;

  static FreehandAreaResult finish(
    List<LatLng> trace, {
    double metersPerPixel = 1,
    bool repairMinorDefects = true,
  }) {
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
    // Three logical pixels, bounded to 0.75–5 geographic metres. Zooming out
    // cannot turn a meaningful block, hole or barrier into a removable defect.
    final repairTolerance =
        ((metersPerPixel.isFinite && metersPerPixel > 0 ? metersPerPixel : 1) *
                3)
            .clamp(.75, maximumSimplificationMeters)
            .toDouble();
    var ring = <_Point>[];
    for (final p in raw) {
      if (ring.isEmpty || _distance(p, ring.last) > .2) ring.add(p);
    }
    while (ring.length > 1 && _distance(ring.first, ring.last) <= .2) {
      ring.removeLast();
    }
    if (ring.length < 3) return fail('Draw an area of at least 100 m².');
    final repairs = repairMinorDefects
        ? _repairLocalDefects(ring, repairTolerance)
        : (ring: ring, count: 0, removedArea: 0.0);
    if (repairs == null) return fail(unclearOutline);
    ring = repairs.ring;
    if (!_simple(ring)) return fail(unclearOutline);
    final originalArea = _signedArea(ring);
    // Compare removed *simple* regions with the proposed simple region, never
    // a self-crossing stroke's signed area (opposite lobes can cancel).
    if (repairs.removedArea > originalArea.abs() * .02 ||
        (repairs.count > 0 &&
            (!_boundaryWithin(raw, ring, repairTolerance) ||
                !_boundaryWithin(ring, raw, repairTolerance)))) {
      return fail(unclearOutline);
    }
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
          ((area.abs() - originalArea.abs()).abs() + repairs.removedArea) /
                  originalArea.abs() >
              .02 ||
          area.abs() < minimumAreaSquareMeters ||
          area.abs() > maximumAreaSquareMeters) {
        continue;
      }
      // Symmetric whole-edge coverage, including discarded points. Checking
      // vertices alone could cut across a concavity between the vertices.
      if (!_boundaryWithin(raw, candidate, maximumSimplificationMeters) ||
          !_boundaryWithin(candidate, raw, maximumSimplificationMeters)) {
        continue;
      }
      return FreehandAreaResult(
        points: List.unmodifiable(candidate.map((p) => p.geographic)),
        areaSquareMeters: area.abs(),
        simplificationToleranceMeters: tolerance,
        repairedDefects: repairs.count,
        repairToleranceMeters: repairTolerance,
      );
    }
    // A valid already-small ring need not be simplified at all.
    if (ring.length <= maximumVertices) {
      return FreehandAreaResult(
        points: List.unmodifiable(ring.map((p) => p.geographic)),
        areaSquareMeters: originalArea.abs(),
        repairedDefects: repairs.count,
        repairToleranceMeters: repairTolerance,
      );
    }
    return fail(
      'This boundary needs more detail than the safe drawing limit. Redraw a simpler edge; your area has not been replaced.',
    );
  }

  static ({List<_Point> ring, int count, double removedArea})?
  _repairLocalDefects(List<_Point> input, double tolerance) {
    var ring = List<_Point>.of(input);
    var count = 0;
    var removedArea = 0.0;
    while (!_simple(ring)) {
      if (count >= maximumMinorRepairs) return null;
      var changed = false;
      // A short out-and-back on one edge has no region to polygonize.
      for (var i = 0; i < ring.length; i++) {
        final a = ring[i],
            b = ring[(i + 1) % ring.length],
            c = ring[(i + 2) % ring.length];
        final excess = _distance(a, b) + _distance(b, c) - _distance(a, c);
        if (_cross(a, b, c).abs() <= 1e-8 &&
            excess > 1e-6 &&
            excess <= 2 * tolerance &&
            _segmentDistance(b, a, c) <= tolerance) {
          ring.removeAt((i + 1) % ring.length);
          changed = true;
          break;
        }
      }
      if (!changed) {
        outer:
        for (var i = 0; i < ring.length; i++) {
          for (var j = i + 2; j < ring.length; j++) {
            if (i == 0 && j == ring.length - 1) continue;
            final at = _intersection(
              ring[i],
              ring[(i + 1) % ring.length],
              ring[j],
              ring[(j + 1) % ring.length],
            );
            if (at == null) continue;
            final first = _deduplicate([at, ...ring.sublist(i + 1, j + 1)]);
            final second = _deduplicate([
              at,
              ...ring.sublist(j + 1),
              ...ring.take(i + 1),
            ]);
            bool local(List<_Point> lobe) {
              if (lobe.any((p) => _distance(p, at) > tolerance)) return false;
              var perimeter = 0.0;
              for (var k = 0; k < lobe.length; k++) {
                perimeter += _distance(lobe[k], lobe[(k + 1) % lobe.length]);
              }
              return perimeter <= 8 * tolerance &&
                  (lobe.length < 3 || _simple(lobe));
            }

            final smallFirst = local(first), smallSecond = local(second);
            // Exactly one demonstrably local spur is allowed. Two substantial
            // lobes, multiple components or two tiny ambiguous lobes need redraw.
            if (smallFirst == smallSecond) return null;
            final removed = smallFirst ? first : second;
            ring = smallFirst ? second : first;
            if (ring.length < 3) return null;
            removedArea += _signedArea(removed).abs();
            changed = true;
            break outer;
          }
        }
      }
      if (!changed || ring.length < 3) return null;
      count++;
    }
    return (ring: ring, count: count, removedArea: removedArea);
  }

  static List<_Point> _deduplicate(List<_Point> points) {
    final result = <_Point>[];
    for (final p in points) {
      if (result.isEmpty || _distance(result.last, p) > 1e-6) result.add(p);
    }
    if (result.length > 1 && _distance(result.first, result.last) <= 1e-6) {
      result.removeLast();
    }
    return result;
  }

  static _Point? _intersection(_Point a, _Point b, _Point c, _Point d) {
    final dx = b.x - a.x, dy = b.y - a.y;
    final ex = d.x - c.x, ey = d.y - c.y;
    final determinant = dx * ey - dy * ex;
    if (determinant.abs() < 1e-8) {
      if (_cross(a, b, c).abs() > 1e-8) return null;
      for (final p in [a, b, c, d]) {
        if (_onSegment(a, b, p) && _onSegment(c, d, p)) return p;
      }
      return null;
    }
    final t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / determinant;
    final u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / determinant;
    if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) {
      return null;
    }
    final along = t.clamp(0.0, 1.0);
    return _Point(
      LatLng(
        a.geographic.latitude +
            along * (b.geographic.latitude - a.geographic.latitude),
        a.geographic.longitude +
            along * (b.geographic.longitude - a.geographic.longitude),
      ),
      a.x + along * dx,
      a.y + along * dy,
    );
  }

  /// Proves entire edges lie in the union of radius-tolerance capsules around
  /// the other boundary. Analytic interval coverage avoids vertex-only or
  /// unbounded dense-grid comparisons; O(n*m), bounded by the input cap.
  static bool _boundaryWithin(
    List<_Point> from,
    List<_Point> to,
    double tolerance,
  ) {
    final radius = tolerance + 1e-6;
    for (var i = 0; i < from.length; i++) {
      final a = from[i], b = from[(i + 1) % from.length];
      final dx = b.x - a.x, dy = b.y - a.y;
      final lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1e-12) continue;
      final intervals = <(double, double)>[];
      for (var j = 0; j < to.length; j++) {
        final c = to[j], d = to[(j + 1) % to.length];
        if (math.max(a.x, b.x) + radius < math.min(c.x, d.x) ||
            math.max(c.x, d.x) + radius < math.min(a.x, b.x) ||
            math.max(a.y, b.y) + radius < math.min(c.y, d.y) ||
            math.max(c.y, d.y) + radius < math.min(a.y, b.y)) {
          continue;
        }
        for (final p in [c, d]) {
          final projection =
              -((a.x - p.x) * dx + (a.y - p.y) * dy) / lengthSquared;
          final perpendicularSquared =
              math.pow(a.x + projection * dx - p.x, 2) +
              math.pow(a.y + projection * dy - p.y, 2);
          if (perpendicularSquared <= radius * radius) {
            final half = math.sqrt(
              (radius * radius - perpendicularSquared) / lengthSquared,
            );
            intervals.add((
              math.max(0, projection - half),
              math.min(1, projection + half),
            ));
          }
        }
        final ex = d.x - c.x, ey = d.y - c.y;
        final length = math.sqrt(ex * ex + ey * ey);
        if (length <= 1e-8) continue;
        var low = 0.0, high = 1.0;
        void clip(double origin, double slope, double minimum, double maximum) {
          if (slope.abs() < 1e-12) {
            if (origin < minimum || origin > maximum) high = -1;
          } else {
            final t1 = (minimum - origin) / slope,
                t2 = (maximum - origin) / slope;
            low = math.max(low, math.min(t1, t2));
            high = math.min(high, math.max(t1, t2));
          }
        }

        clip(
          ((a.x - c.x) * ex + (a.y - c.y) * ey) / length,
          (dx * ex + dy * ey) / length,
          0,
          length,
        );
        clip(
          ((a.x - c.x) * -ey + (a.y - c.y) * ex) / length,
          (-dx * ey + dy * ex) / length,
          -radius,
          radius,
        );
        if (high >= low) intervals.add((low, high));
      }
      intervals.sort((x, y) => x.$1.compareTo(y.$1));
      var covered = 0.0;
      for (final interval in intervals) {
        if (interval.$2 < interval.$1) continue;
        if (interval.$1 > covered + 1e-8) return false;
        covered = math.max(covered, interval.$2);
        if (covered >= 1 - 1e-8) break;
      }
      if (covered < 1 - 1e-8) return false;
    }
    return true;
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
