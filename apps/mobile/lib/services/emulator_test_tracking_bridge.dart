import 'dart:math' as math;

import '../models/tracking_models.dart';
import 'native_tracking_bridge.dart';
import 'tracking_runtime_policy.dart';

/// In-memory source adapter for local emulator QA. It deliberately implements
/// the same bridge contract as native Core Location / Android foreground GPS.
/// Session creation, chunk upload, sequencing, server normalization, hashing,
/// completion, and cancellation continue through ActiveJobTrackingService.
final class EmulatorTestTrackingBridge
    implements NativeTrackingBridge, EmulatorTrackingHarness {
  EmulatorTestTrackingBridge._();

  factory EmulatorTestTrackingBridge.create() {
    TrackingRuntimePolicy.requireEmulatorGpsHarness();
    return EmulatorTestTrackingBridge._();
  }

  ActiveTrackingState _state = ActiveTrackingState.inactive;
  final List<TrackingLocationSample> _pending = [];
  final List<TrackingLocationSample> _recorded = [];
  bool _paused = false;

  @override
  bool get paused => _paused;

  @override
  Future<ActiveTrackingState> getState() async => _stateWithCounts();

  ActiveTrackingState _stateWithCounts() => ActiveTrackingState(
    active: _state.active,
    sessionId: _state.sessionId,
    campaignId: _state.campaignId,
    zoneId: _state.zoneId,
    startedAt: _state.startedAt,
    lastLocation: _recorded.isEmpty ? null : _recorded.last,
    pointCount: _recorded.length,
    pendingPointCount: _pending.length,
    lastError: _state.lastError,
  );

  @override
  Future<void> start({
    required String sessionId,
    required String campaignId,
    required String zoneId,
    required String scalerId,
    required String zoneName,
    required int cutoffAtMs,
    required bool resume,
  }) async {
    TrackingRuntimePolicy.requireEmulatorGpsHarness();
    if (_state.active && _state.zoneId != zoneId) {
      throw StateError('A test tracking session is already active.');
    }
    _paused = false;
    _state = ActiveTrackingState(
      active: true,
      sessionId: sessionId,
      campaignId: campaignId,
      zoneId: zoneId,
      startedAt: DateTime.now().toUtc(),
      pointCount: _recorded.length,
      pendingPointCount: _pending.length,
    );
  }

  @override
  Future<int> runDeterministicRoute(List<TestRouteCoordinate> zone) async {
    TrackingRuntimePolicy.requireEmulatorGpsHarness();
    if (!_state.active || _state.sessionId == null) {
      throw StateError('Start the test job before adding route samples.');
    }
    if (_paused) throw StateError('Resume the test route before running it.');
    final samples = DeterministicEmulatorRoute.samplesInside(
      zone,
      firstSequence: _recorded.length + 1,
      endAt: DateTime.now().toUtc(),
    );
    _recorded.addAll(samples);
    _pending.addAll(samples);
    _state = _stateWithCounts();
    return samples.length;
  }

  @override
  void pause() => _paused = true;

  @override
  void resume() => _paused = false;

  @override
  Future<TrackingLocationSample?> captureCheckpointLocation() async {
    if (!_state.active || _recorded.isEmpty) return null;
    return _recorded.last;
  }

  @override
  Future<List<TrackingChunk>> pendingChunks({int maximumPoints = 50}) async {
    if (_pending.isEmpty) return const [];
    final points = _pending.take(maximumPoints.clamp(1, 100)).toList();
    final start = points.first.sequence;
    final end = points.last.sequence;
    String pad(int value) => value.toString().padLeft(9, '0');
    return [
      TrackingChunk(
        id: 'seq_${pad(start)}_${pad(end)}',
        startSequence: start,
        endSequence: end,
        points: points,
      ),
    ];
  }

  @override
  Future<void> acknowledgeChunk(TrackingChunk chunk) async {
    _pending.removeWhere(
      (point) =>
          point.sequence >= chunk.startSequence &&
          point.sequence <= chunk.endSequence,
    );
    _state = _stateWithCounts();
  }

  @override
  Future<bool> purgeAcknowledgedEvidence({required String sessionId}) async {
    if (_pending.isNotEmpty) return false;
    _recorded.clear();
    _state = ActiveTrackingState.inactive;
    return true;
  }

  @override
  Future<void> stop({
    required String reason,
    required bool captureFinalPoint,
  }) async {
    _paused = true;
    _state = ActiveTrackingState(
      active: false,
      sessionId: _state.sessionId,
      campaignId: _state.campaignId,
      zoneId: _state.zoneId,
      startedAt: _state.startedAt,
      lastLocation: _recorded.isEmpty ? null : _recorded.last,
      pointCount: _recorded.length,
      pendingPointCount: _pending.length,
    );
  }
}

abstract final class DeterministicEmulatorRoute {
  static const int sampleCount = 24;
  static const Duration cadence = Duration(seconds: 5);

  static List<TrackingLocationSample> samplesInside(
    List<TestRouteCoordinate> polygon, {
    required int firstSequence,
    required DateTime endAt,
  }) {
    if (polygon.length < 3) {
      throw ArgumentError('A mapped test Zone requires at least three points.');
    }
    final interior = _interiorPoint(polygon);
    final clearanceMeters = _minimumBoundaryDistanceMeters(interior, polygon);
    if (clearanceMeters < 2) {
      throw ArgumentError(
        'The mapped test Zone is too small for a route fixture.',
      );
    }
    final radiusMeters = math.min(22.0, clearanceMeters * 0.35);
    final end = endAt.toUtc();
    final start = end.subtract(cadence * (sampleCount - 1));
    final latitudeRadians = interior.latitude * math.pi / 180;
    final longitudeMeters = 111320.0 * math.cos(latitudeRadians).abs();
    final result = <TrackingLocationSample>[];
    for (var index = 0; index < sampleCount; index += 1) {
      final angle = (2 * math.pi * index) / sampleCount;
      final point = TestRouteCoordinate(
        interior.latitude + math.sin(angle) * radiusMeters / 111320.0,
        interior.longitude + math.cos(angle) * radiusMeters / longitudeMeters,
      );
      if (!_contains(point, polygon)) {
        throw StateError('Deterministic route escaped its assigned test Zone.');
      }
      result.add(
        TrackingLocationSample(
          sequence: firstSequence + index,
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: start.add(cadence * index),
          horizontalAccuracy: 5,
          speed: index == 0
              ? 0
              : _distanceMeters(
                      TestRouteCoordinate(
                        result.last.latitude,
                        result.last.longitude,
                      ),
                      point,
                    ) /
                    cadence.inSeconds,
          heading: (angle * 180 / math.pi + 90) % 360,
          accepted: true,
        ),
      );
    }
    return List.unmodifiable(result);
  }

  static TestRouteCoordinate _interiorPoint(List<TestRouteCoordinate> polygon) {
    final minLat = polygon.map((p) => p.latitude).reduce(math.min);
    final maxLat = polygon.map((p) => p.latitude).reduce(math.max);
    final minLng = polygon.map((p) => p.longitude).reduce(math.min);
    final maxLng = polygon.map((p) => p.longitude).reduce(math.max);
    TestRouteCoordinate? best;
    var bestClearance = -1.0;
    for (var row = 1; row < 20; row += 1) {
      for (var column = 1; column < 20; column += 1) {
        final candidate = TestRouteCoordinate(
          minLat + (maxLat - minLat) * row / 20,
          minLng + (maxLng - minLng) * column / 20,
        );
        if (!_contains(candidate, polygon)) continue;
        final clearance = _minimumBoundaryDistanceMeters(candidate, polygon);
        if (clearance > bestClearance) {
          best = candidate;
          bestClearance = clearance;
        }
      }
    }
    if (best == null) {
      throw ArgumentError('The test Zone has no usable interior.');
    }
    return best;
  }

  static bool contains(
    TestRouteCoordinate point,
    List<TestRouteCoordinate> polygon,
  ) => _contains(point, polygon);

  static bool _contains(
    TestRouteCoordinate point,
    List<TestRouteCoordinate> polygon,
  ) {
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final a = polygon[i];
      final b = polygon[j];
      final intersects =
          ((a.latitude > point.latitude) != (b.latitude > point.latitude)) &&
          (point.longitude <
              (b.longitude - a.longitude) *
                      (point.latitude - a.latitude) /
                      (b.latitude - a.latitude) +
                  a.longitude);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  static double _minimumBoundaryDistanceMeters(
    TestRouteCoordinate point,
    List<TestRouteCoordinate> polygon,
  ) {
    var minimum = double.infinity;
    for (var index = 0; index < polygon.length; index += 1) {
      final distance = _segmentDistanceMeters(
        point,
        polygon[index],
        polygon[(index + 1) % polygon.length],
      );
      minimum = math.min(minimum, distance);
    }
    return minimum;
  }

  static double _segmentDistanceMeters(
    TestRouteCoordinate point,
    TestRouteCoordinate start,
    TestRouteCoordinate end,
  ) {
    final latitudeScale = 111320.0;
    final longitudeScale =
        latitudeScale * math.cos(point.latitude * math.pi / 180).abs();
    final px = (point.longitude - start.longitude) * longitudeScale;
    final py = (point.latitude - start.latitude) * latitudeScale;
    final ex = (end.longitude - start.longitude) * longitudeScale;
    final ey = (end.latitude - start.latitude) * latitudeScale;
    final lengthSquared = ex * ex + ey * ey;
    final t = lengthSquared == 0
        ? 0.0
        : ((px * ex + py * ey) / lengthSquared).clamp(0.0, 1.0);
    final dx = px - ex * t;
    final dy = py - ey * t;
    return math.sqrt(dx * dx + dy * dy);
  }

  static double _distanceMeters(TestRouteCoordinate a, TestRouteCoordinate b) {
    final dLat = (b.latitude - a.latitude) * math.pi / 180;
    final dLng = (b.longitude - a.longitude) * math.pi / 180;
    final lat1 = a.latitude * math.pi / 180;
    final lat2 = b.latitude * math.pi / 180;
    final value =
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return 6371000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value));
  }
}
