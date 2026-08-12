import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:geolocator/geolocator.dart';
import '../models/tracking_models.dart';
import 'native_tracking_bridge.dart';
import 'secure_function_service.dart';

abstract interface class TrackingSessionGateway {
  Future<Map<String, dynamic>> startSession({
    required String campaignId,
    required String zoneId,
  });
  Future<void> uploadChunk({
    required String sessionId,
    required TrackingChunk chunk,
  });
  Future<Map<String, dynamic>> completeSession({required String sessionId});
  Future<Map<String, dynamic>> getSessionState({required String sessionId});
  Future<void> cancelSession({
    required String sessionId,
    required String reason,
  });
}

class FirebaseTrackingSessionGateway implements TrackingSessionGateway {
  const FirebaseTrackingSessionGateway();
  final SecureFunctionService _functions = const SecureFunctionService();
  @override
  Future<Map<String, dynamic>> startSession({
    required String campaignId,
    required String zoneId,
  }) => _functions.call(
    functionName: 'startTrackingSession',
    data: {'campaignId': campaignId, 'zoneId': zoneId},
  );
  @override
  Future<void> uploadChunk({
    required String sessionId,
    required TrackingChunk chunk,
  }) async {
    await _functions.call(
      functionName: 'uploadTrackingChunk',
      data: {
        'sessionId': sessionId,
        'chunkId': chunk.id,
        'startSequence': chunk.startSequence,
        'endSequence': chunk.endSequence,
        'points': chunk.points.map((point) => point.toUploadMap()).toList(),
      },
    );
  }

  @override
  Future<Map<String, dynamic>> completeSession({required String sessionId}) =>
      _functions.call(
        functionName: 'completeTrackingSession',
        data: {'sessionId': sessionId},
      );
  @override
  Future<Map<String, dynamic>> getSessionState({required String sessionId}) =>
      _functions.call(
        functionName: 'getTrackingSessionState',
        data: {'sessionId': sessionId},
      );
  @override
  Future<void> cancelSession({
    required String sessionId,
    required String reason,
  }) async {
    await _functions.call(
      functionName: 'cancelTrackingSession',
      data: {'sessionId': sessionId, 'reason': reason},
    );
  }
}

class ActiveJobTrackingService {
  ActiveJobTrackingService({
    NativeTrackingBridge? nativeBridge,
    TrackingSessionGateway? gateway,
  }) : _native = nativeBridge ?? const MethodChannelNativeTrackingBridge(),
       _gateway = gateway ?? const FirebaseTrackingSessionGateway();
  final NativeTrackingBridge _native;
  final TrackingSessionGateway _gateway;
  Future<void>? _startOperation;
  Future<void>? _syncOperation;
  Future<ActiveTrackingState> recover({bool reconcileWithServer = true}) async {
    final state = await _native.getState();
    if (!reconcileWithServer || !state.active || state.sessionId == null) {
      return state;
    }
    try {
      final remote = await _gateway.getSessionState(
        sessionId: state.sessionId!,
      );
      if (remote['status']?.toString() == 'active') return state;
      await _native.stop(
        reason: 'server_${remote['status'] ?? 'closed'}',
        captureFinalPoint: false,
      );
      return _native.getState();
    } on FirebaseFunctionsException catch (error) {
      if (error.code == 'permission-denied' ||
          error.code == 'not-found' ||
          error.code == 'unauthenticated') {
        await _native.stop(
          reason: 'server_unavailable_session',
          captureFinalPoint: false,
        );
        return _native.getState();
      }
      return state;
    } catch (_) {
      // Connectivity failures must not terminate a legitimate offline job.
      // An explicit authorization/not-found response is represented by the
      // callable as a FirebaseFunctionsException and is reconciled on the
      // next successful connection/sync attempt.
      return state;
    }
  }

  Future<void> start({
    required String campaignId,
    required String zoneId,
    required String zoneName,
  }) {
    final existing = _startOperation;
    if (existing != null) return existing;
    final operation = _startInternal(
      campaignId: campaignId,
      zoneId: zoneId,
      zoneName: zoneName,
    );
    _startOperation = operation;
    return operation.whenComplete(() => _startOperation = null);
  }

  Future<void> _startInternal({
    required String campaignId,
    required String zoneId,
    required String zoneName,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw Exception('You must be logged in.');
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Turn on Location Services before starting this job.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw Exception(
        permission == LocationPermission.deniedForever
            ? 'Location permission is disabled in system settings.'
            : 'Location permission is required only while an active job is running.',
      );
    }
    await startAuthorized(
      scalerId: user.uid,
      campaignId: campaignId,
      zoneId: zoneId,
      zoneName: zoneName,
    );
  }

  Future<void> startAuthorized({
    required String scalerId,
    required String campaignId,
    required String zoneId,
    required String zoneName,
  }) async {
    final current = await _native.getState();
    if (current.active) {
      if (current.zoneId == zoneId) return;
      throw Exception(
        'Complete or stop the active job before starting another.',
      );
    }
    final session = await _gateway.startSession(
      campaignId: campaignId,
      zoneId: zoneId,
    );
    final sessionId = session['sessionId']?.toString() ?? '';
    final cutoffAtMs = session['workWindowCutoffAtMs'] as int? ?? 0;
    if (sessionId.isEmpty) {
      throw Exception('The tracking session was not created.');
    }
    if (cutoffAtMs <= DateTime.now().millisecondsSinceEpoch) {
      throw Exception('This job is outside its allowed work window.');
    }
    final resumed = session['resumed'] == true;
    try {
      await _native.start(
        sessionId: sessionId,
        campaignId: campaignId,
        zoneId: zoneId,
        scalerId: scalerId,
        zoneName: zoneName,
        cutoffAtMs: cutoffAtMs,
        resume: resumed,
      );
    } catch (_) {
      // A native failure on the first segment may safely close the empty
      // session. A resumed segment belongs to a long-lived job with existing
      // immutable evidence, so it must remain recoverable rather than be
      // terminally cancelled.
      if (!resumed) {
        await _gateway.cancelSession(
          sessionId: sessionId,
          reason: 'native_start_failed',
        );
      }
      rethrow;
    }
  }

  Future<void> syncPending() {
    final existing = _syncOperation;
    if (existing != null) return existing;
    final operation = _syncPendingInternal();
    _syncOperation = operation;
    return operation.whenComplete(() => _syncOperation = null);
  }

  Future<void> _syncPendingInternal() async {
    final stateBeforeReconciliation = await _native.getState();
    final state = await recover();
    // A server-terminal active session is stopped locally by recover(). Its
    // remaining queue is retained as evidence, but must not be uploaded to a
    // finalizing/completed/cancelled session.
    if (stateBeforeReconciliation.active && !state.active) return;
    if (!state.active && state.pendingPointCount == 0) return;
    final sessionId = state.sessionId;
    if (sessionId == null || sessionId.isEmpty) return;
    while (true) {
      final chunks = await _native.pendingChunks();
      if (chunks.isEmpty) return;
      for (final chunk in chunks) {
        await _gateway.uploadChunk(sessionId: sessionId, chunk: chunk);
        await _native.acknowledgeChunk(chunk);
      }
    }
  }

  Future<String> complete() async {
    final state = await _native.getState();
    final sessionId = state.sessionId;
    if (sessionId == null || sessionId.isEmpty) {
      throw Exception('There is no tracking session to finalize.');
    }
    // If network finalization fails, the durable queue and session ID remain
    // available for a safe retry without restarting location collection.
    if (state.active) {
      await _native.stop(reason: 'completed', captureFinalPoint: true);
    }
    await syncPending();
    final result = await _gateway.completeSession(sessionId: sessionId);
    await _native.purgeAcknowledgedEvidence(sessionId: sessionId);
    return result['routeId']?.toString() ?? sessionId;
  }

  Future<void> cancel({String reason = 'cancelled_by_scaler'}) async {
    final state = await _native.getState();
    final sessionId = state.sessionId;
    await _native.stop(reason: reason, captureFinalPoint: false);
    if (sessionId != null && sessionId.isNotEmpty) {
      // GPS is already stopped. A network failure must never restart it.
      try {
        await syncPending();
      } catch (_) {
        // Unsynced evidence remains in the native audit queue.
      }
      await _gateway.cancelSession(sessionId: sessionId, reason: reason);
      await _native.purgeAcknowledgedEvidence(sessionId: sessionId);
    }
  }

  Future<TrackingLocationSample?> captureCheckpointLocation() =>
      _native.captureCheckpointLocation();

  Future<void> registerCheckpoint({
    required String sessionId,
    required String storagePath,
    required TrackingLocationSample location,
  }) async {
    await const SecureFunctionService().call(
      functionName: 'registerTrackingCheckpoint',
      data: {
        'sessionId': sessionId,
        'storagePath': storagePath,
        'location': location.toUploadMap(),
      },
    );
  }
}
