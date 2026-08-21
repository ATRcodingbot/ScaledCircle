import 'package:flutter_app/services/emulator_test_tracking_bridge.dart';
import 'package:flutter_app/models/tracking_models.dart';
import 'package:flutter_app/services/active_job_tracking_service.dart';
import 'package:flutter_app/services/native_tracking_bridge.dart';
import 'package:flutter_app/services/tracking_runtime_policy.dart';
import 'package:flutter_test/flutter_test.dart';

const zone = <TestRouteCoordinate>[
  TestRouteCoordinate(39.2900, -76.6130),
  TestRouteCoordinate(39.2910, -76.6130),
  TestRouteCoordinate(39.2910, -76.6115),
  TestRouteCoordinate(39.2900, -76.6115),
];

void main() {
  test('production/default build cannot instantiate the test bridge', () {
    if (TrackingRuntimePolicy.emulatorGpsHarnessEnabled) {
      expect(EmulatorTestTrackingBridge.create(), isNotNull);
    } else {
      expect(EmulatorTestTrackingBridge.create, throwsStateError);
    }
  });

  test('deterministic samples stay inside the Zone and remain realistic', () {
    final endAt = DateTime.utc(2026, 8, 21, 12);
    final samples = DeterministicEmulatorRoute.samplesInside(
      zone,
      firstSequence: 1,
      endAt: endAt,
    );
    expect(samples, hasLength(24));
    expect(samples.first.sequence, 1);
    expect(samples.last.sequence, 24);
    expect(samples.last.recordedAt, endAt);
    for (final sample in samples) {
      expect(
        DeterministicEmulatorRoute.contains(
          TestRouteCoordinate(sample.latitude, sample.longitude),
          zone,
        ),
        isTrue,
      );
      expect(sample.horizontalAccuracy, lessThanOrEqualTo(100));
      expect(sample.speed, lessThan(15));
    }
    for (var index = 1; index < samples.length; index += 1) {
      expect(
        samples[index].recordedAt.difference(samples[index - 1].recordedAt),
        DeterministicEmulatorRoute.cadence,
      );
    }
  });

  test('local bridge requires Start Job and uses normal chunks', () async {
    if (!TrackingRuntimePolicy.emulatorGpsHarnessEnabled) return;
    final bridge = EmulatorTestTrackingBridge.create();
    await expectLater(bridge.runDeterministicRoute(zone), throwsStateError);
    await bridge.start(
      sessionId: 'session',
      campaignId: 'campaign',
      zoneId: 'zone',
      scalerId: 'scaler',
      zoneName: 'Zone 1',
      cutoffAtMs: DateTime.now()
          .add(const Duration(hours: 1))
          .millisecondsSinceEpoch,
      resume: false,
    );
    bridge.pause();
    await expectLater(bridge.runDeterministicRoute(zone), throwsStateError);
    bridge.resume();
    expect(await bridge.runDeterministicRoute(zone), 24);
    final chunks = await bridge.pendingChunks(maximumPoints: 10);
    expect(chunks.single.id, 'seq_000000001_000000010');
    expect(chunks.single.startSequence, 1);
    expect(chunks.single.endSequence, 10);
    await bridge.acknowledgeChunk(chunks.single);
    expect((await bridge.getState()).pendingPointCount, 14);
    await bridge.stop(reason: 'completed', captureFinalPoint: true);
    expect((await bridge.getState()).active, isFalse);
  });

  test(
    'local samples use coordinator sync, retry, completion, and cancellation',
    () async {
      if (!TrackingRuntimePolicy.emulatorGpsHarnessEnabled) return;
      final bridge = EmulatorTestTrackingBridge.create();
      final gateway = _Gateway();
      final service = ActiveJobTrackingService(
        nativeBridge: bridge,
        gateway: gateway,
      );
      await service.startAuthorized(
        scalerId: 'scaler',
        campaignId: 'campaign',
        zoneId: 'zone',
        zoneName: 'Zone 1',
      );
      await bridge.runDeterministicRoute(zone);
      gateway.failUpload = true;
      await expectLater(service.syncPending(), throwsException);
      expect((await bridge.getState()).pendingPointCount, 24);
      await service.syncPending();
      expect((await bridge.getState()).pendingPointCount, 0);
      await expectLater(
        service.startAuthorized(
          scalerId: 'scaler',
          campaignId: 'campaign-2',
          zoneId: 'zone-2',
          zoneName: 'Zone 2',
        ),
        throwsException,
      );
      expect(await service.complete(), 'route');
      expect(gateway.completed, 1);

      final cancelBridge = EmulatorTestTrackingBridge.create();
      final cancelGateway = _Gateway();
      final cancelService = ActiveJobTrackingService(
        nativeBridge: cancelBridge,
        gateway: cancelGateway,
      );
      await cancelService.startAuthorized(
        scalerId: 'scaler',
        campaignId: 'campaign',
        zoneId: 'zone',
        zoneName: 'Zone 1',
      );
      await cancelService.cancel();
      expect((await cancelBridge.getState()).active, isFalse);
      expect(cancelGateway.cancelled, 1);
    },
  );
}

class _Gateway implements TrackingSessionGateway {
  bool failUpload = false;
  int completed = 0;
  int cancelled = 0;

  @override
  Future<Map<String, dynamic>> startSession({
    required String campaignId,
    required String zoneId,
  }) async => {
    'sessionId': 'session-$zoneId',
    'workWindowCutoffAtMs': DateTime.now()
        .add(const Duration(hours: 1))
        .millisecondsSinceEpoch,
    'resumed': false,
  };

  @override
  Future<void> uploadChunk({
    required String sessionId,
    required TrackingChunk chunk,
  }) async {
    if (failUpload) {
      failUpload = false;
      throw Exception('offline');
    }
  }

  @override
  Future<Map<String, dynamic>> completeSession({
    required String sessionId,
  }) async {
    completed += 1;
    return {'routeId': 'route'};
  }

  @override
  Future<Map<String, dynamic>> getSessionState({
    required String sessionId,
  }) async => {'status': 'active'};

  @override
  Future<void> cancelSession({
    required String sessionId,
    required String reason,
  }) async {
    cancelled += 1;
  }
}
