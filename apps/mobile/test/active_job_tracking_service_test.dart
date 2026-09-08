import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/tracking_models.dart';
import 'package:flutter_app/services/active_job_tracking_service.dart';
import 'package:flutter_app/services/native_tracking_bridge.dart';

void main() {
  group('active job tracking coordinator', () {
    test(
      'intentional pause syncs, stops native tracking, preserves queue history and never completes',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        final gateway = _FakeGateway();
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );
        await Future.wait([
          service.pauseAndFinishLater(zoneId: 'zone'),
          service.pauseAndFinishLater(zoneId: 'zone'),
        ]);
        expect(gateway.pauseCount, 1);
        expect(gateway.completeCount, 0);
        expect(gateway.cancelCount, 0);
        expect(native.active, false);
        expect(native.purgeCount, 0);
        expect(native.sessionId, 'session');
        expect(native.stopReason, 'intentional_finish_later');
        expect(native.captureFinalPoint, true);
        await expectLater(service.complete(), throwsStateError);
      },
    );
    test(
      'lost pause response reconciles saved intentional pause without retry or purge',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        final gateway = _FakeGateway()..losePauseResponse = true;
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );
        expect(
          (await service.pauseAndFinishLater(zoneId: 'zone'))['status'],
          'paused',
        );
        expect(gateway.pauseCount, 1);
        expect(native.purgeCount, 0);
        expect(gateway.completeCount, 0);
      },
    );
    test(
      'normal recovery and synchronization never intentionally pause a live session',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        final gateway = _FakeGateway();
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );
        await service.recover();
        await service.syncPending();
        expect(gateway.pauseCount, 0);
        expect(native.active, true);
      },
    );
    test('concurrent completion taps share one finalization', () async {
      final native = _FakeNativeBridge()..seedActive();
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );
      expect(await Future.wait([service.complete(), service.complete()]), [
        'route',
        'route',
      ]);
      expect(gateway.completeCount, 1);
      expect(native.stopCount, 1);
      expect(await service.complete(), 'route');
      expect(gateway.completeCount, 1);
    });
    test(
      'lost completion response reconciles without a second request',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        final gateway = _FakeGateway()..loseCompletionResponse = true;
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );
        expect(await service.complete(), 'route');
        expect(gateway.completeCount, 1);
        expect(native.stopCount, 1);
      },
    );
    test('native final-fix hang exits without sending completion', () async {
      final native = _FakeNativeBridge()..seedActive();
      native.stopBlocker = Completer<void>();
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
        finalizationTimeout: const Duration(milliseconds: 5),
      );
      await expectLater(service.complete(), throwsA(isA<TimeoutException>()));
      native.stopBlocker!.complete();
      await Future<void>.delayed(Duration.zero);
      expect(gateway.completeCount, 0);
      expect(native.purgeCount, 0);
    });
    test(
      'server finalizing state holds without another completion request',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        final gateway = _FakeGateway()..remoteStatus = 'finalizing';
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );
        await expectLater(service.complete(), throwsStateError);
        expect(gateway.completeCount, 0);
        expect(native.purgeCount, 0);
      },
    );
    test('timed-out in-flight completion cannot be sent again', () async {
      final native = _FakeNativeBridge()..seedActive();
      final gateway = _FakeGateway()..completionBlocker = Completer<void>();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
        finalizationTimeout: const Duration(milliseconds: 5),
      );
      await expectLater(service.complete(), throwsA(isA<TimeoutException>()));
      await expectLater(service.complete(), throwsStateError);
      expect(gateway.completeCount, 1);
      gateway.completionBlocker!.complete();
      await Future<void>.delayed(Duration.zero);
      expect(await service.complete(), 'route');
      expect(gateway.completeCount, 1);
    });
    test('starting the same active job creates exactly one session', () async {
      final native = _FakeNativeBridge();
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      await service.startAuthorized(
        scalerId: 'scaler',
        campaignId: 'campaign',
        zoneId: 'zone',
        zoneName: 'Zone 1',
      );
      await service.startAuthorized(
        scalerId: 'scaler',
        campaignId: 'campaign',
        zoneId: 'zone',
        zoneName: 'Zone 1',
      );

      expect(gateway.startCount, 1);
      expect(native.startCount, 1);
    });

    test(
      'resumed native-start failure preserves the long-lived server session',
      () async {
        final native = _FakeNativeBridge()..failStart = true;
        final gateway = _FakeGateway()..resumedStart = true;
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );

        await expectLater(
          service.startAuthorized(
            scalerId: 'scaler',
            campaignId: 'campaign',
            zoneId: 'zone',
            zoneName: 'Zone 1',
          ),
          throwsException,
        );

        expect(gateway.cancelCount, 0);
      },
    );

    test('queued offline chunks upload once and are acknowledged', () async {
      final native = _FakeNativeBridge()..seedActive();
      native.chunks.add(_chunk(1, 2));
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      await service.syncPending();
      await service.syncPending();

      expect(gateway.uploadedChunkIds, ['session_1_2']);
      expect(native.chunks, isEmpty);
    });

    test(
      'reconnection retries an unacknowledged chunk without losing it',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        native.chunks.add(_chunk(1, 1));
        final gateway = _FakeGateway()..failNextUpload = true;
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );

        await expectLater(service.syncPending(), throwsException);
        expect(native.chunks, hasLength(1));
        await service.syncPending();
        expect(native.chunks, isEmpty);
      },
    );

    test(
      'completion captures final point, flushes, and stops collection',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        native.chunks.add(_chunk(1, 2));
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: _FakeGateway(),
        );

        final routeId = await service.complete();

        expect(routeId, 'route');
        expect(native.active, isFalse);
        expect(native.stopReason, 'completed');
        expect(native.captureFinalPoint, isTrue);
      },
    );

    test(
      'offline completion can retry finalization without restarting GPS',
      () async {
        final native = _FakeNativeBridge()..seedActive();
        native.chunks.add(_chunk(1, 2));
        final gateway = _FakeGateway()..failNextUpload = true;
        final service = ActiveJobTrackingService(
          nativeBridge: native,
          gateway: gateway,
        );

        await expectLater(service.complete(), throwsException);
        expect(native.active, isFalse);
        expect(native.startCount, 0);
        expect(native.chunks, hasLength(1));

        expect(await service.complete(), 'route');
        expect(native.startCount, 0);
        expect(native.chunks, isEmpty);
      },
    );

    test('an inactive device does not upload or collect anything', () async {
      final native = _FakeNativeBridge();
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      await service.syncPending();

      expect(gateway.uploadedChunkIds, isEmpty);
      expect(native.startCount, 0);
      expect(native.active, isFalse);
    });

    test('cancel stops collection and closes the server session', () async {
      final native = _FakeNativeBridge()..seedActive();
      final gateway = _FakeGateway();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      await service.cancel();

      expect(native.active, isFalse);
      expect(native.stopReason, 'cancelled_by_scaler');
      expect(gateway.cancelCount, 1);
    });

    test('recover returns persisted native active-job state', () async {
      final native = _FakeNativeBridge()..seedActive();
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: _FakeGateway(),
      );
      expect((await service.recover()).active, isTrue);
    });

    test('remote terminal state immediately stops native tracking', () async {
      final native = _FakeNativeBridge()..seedActive();
      final gateway = _FakeGateway()..remoteStatus = 'completed';
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      final recovered = await service.recover();

      expect(recovered.active, isFalse);
      expect(native.stopReason, 'server_completed');
    });

    test('offline reconciliation preserves an active native job', () async {
      final native = _FakeNativeBridge()..seedActive();
      final gateway = _FakeGateway()..failSessionLookup = true;
      final service = ActiveJobTrackingService(
        nativeBridge: native,
        gateway: gateway,
      );

      expect((await service.recover()).active, isTrue);
      expect(native.stopReason, isNull);
    });
  });
}

TrackingChunk _chunk(int start, int end) => TrackingChunk(
  id: 'session_${start}_$end',
  startSequence: start,
  endSequence: end,
  points: List.generate(
    end - start + 1,
    (index) => TrackingLocationSample(
      sequence: start + index,
      latitude: 39,
      longitude: -76,
      recordedAt: DateTime.utc(2026, 8, 10, 12, 0, index),
      horizontalAccuracy: 5,
      accepted: true,
    ),
  ),
);

class _FakeNativeBridge implements NativeTrackingBridge {
  bool active = false;
  String? sessionId;
  String? zoneId;
  int startCount = 0;
  String? stopReason;
  bool? captureFinalPoint;
  final List<TrackingChunk> chunks = [];
  int purgeCount = 0;
  bool failStart = false;
  Completer<void>? stopBlocker;
  int stopCount = 0;

  void seedActive() {
    active = true;
    sessionId = 'session';
    zoneId = 'zone';
  }

  @override
  Future<ActiveTrackingState> getState() async => ActiveTrackingState(
    active: active,
    sessionId: sessionId,
    campaignId: 'campaign',
    zoneId: zoneId,
    pointCount: 2,
    pendingPointCount: chunks.fold(
      0,
      (sum, chunk) => sum + chunk.points.length,
    ),
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
    startCount++;
    if (failStart) throw Exception('native start failed');
    active = true;
    this.sessionId = sessionId;
    this.zoneId = zoneId;
  }

  @override
  Future<List<TrackingChunk>> pendingChunks({int maximumPoints = 50}) async =>
      List.of(chunks);
  @override
  Future<void> acknowledgeChunk(TrackingChunk chunk) async =>
      chunks.removeWhere((candidate) => candidate.id == chunk.id);

  @override
  Future<bool> purgeAcknowledgedEvidence({required String sessionId}) async {
    purgeCount++;
    return chunks.isEmpty;
  }

  @override
  Future<void> stop({
    required String reason,
    required bool captureFinalPoint,
  }) async {
    stopCount++;
    if (stopBlocker != null) await stopBlocker!.future;
    active = false;
    stopReason = reason;
    this.captureFinalPoint = captureFinalPoint;
  }

  @override
  Future<TrackingLocationSample?> captureCheckpointLocation() async => null;
}

class _FakeGateway implements TrackingSessionGateway, IntentionalPauseGateway {
  int pauseCount = 0;
  bool losePauseResponse = false;
  @override
  Future<Map<String, dynamic>> pauseSession({
    required String zoneId,
    required String sessionId,
    required int expectedPointCount,
  }) async {
    pauseCount++;
    expect(expectedPointCount, 2);
    remoteStatus = 'paused';
    if (losePauseResponse) throw StateError('response lost');
    return {'status': 'paused'};
  }

  int startCount = 0;
  int cancelCount = 0;
  bool failNextUpload = false;
  final List<String> uploadedChunkIds = [];
  String remoteStatus = 'active';
  bool failSessionLookup = false;
  bool resumedStart = false;
  bool loseCompletionResponse = false;
  int completeCount = 0;
  Completer<void>? completionBlocker;
  @override
  Future<Map<String, dynamic>> startSession({
    required String campaignId,
    required String zoneId,
  }) async {
    startCount++;
    return {
      'sessionId': 'session',
      'workWindowCutoffAtMs': DateTime.now()
          .add(const Duration(hours: 1))
          .millisecondsSinceEpoch,
      'resumed': resumedStart,
    };
  }

  @override
  Future<void> uploadChunk({
    required String sessionId,
    required TrackingChunk chunk,
  }) async {
    if (failNextUpload) {
      failNextUpload = false;
      throw Exception('offline');
    }
    uploadedChunkIds.add(chunk.id);
  }

  @override
  Future<Map<String, dynamic>> completeSession({
    required String sessionId,
  }) async {
    completeCount++;
    if (completionBlocker != null) await completionBlocker!.future;
    remoteStatus = 'completed';
    if (loseCompletionResponse) throw Exception('response lost');
    return {'routeId': 'route'};
  }

  @override
  Future<Map<String, dynamic>> getSessionState({
    required String sessionId,
    bool includeProgress = false,
  }) async {
    if (failSessionLookup) throw Exception('offline');
    return {
      'sessionId': sessionId,
      'status': remoteStatus,
      if (remoteStatus == 'paused') 'pauseReason': 'intentional_finish_later',
      if (remoteStatus == 'completed') 'routeId': 'route',
    };
  }

  @override
  Future<void> cancelSession({
    required String sessionId,
    required String reason,
  }) async {
    cancelCount++;
  }
}
