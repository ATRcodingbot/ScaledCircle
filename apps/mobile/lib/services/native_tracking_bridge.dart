import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../models/tracking_models.dart';

abstract interface class NativeTrackingBridge {
  Future<ActiveTrackingState> getState();
  Future<void> start({
    required String sessionId,
    required String campaignId,
    required String zoneId,
    required String scalerId,
    required String zoneName,
    required int cutoffAtMs,
    required bool resume,
  });
  Future<TrackingLocationSample?> captureCheckpointLocation();
  Future<List<TrackingChunk>> pendingChunks({int maximumPoints = 50});
  Future<void> acknowledgeChunk(TrackingChunk chunk);
  Future<bool> purgeAcknowledgedEvidence({required String sessionId});
  Future<void> stop({required String reason, required bool captureFinalPoint});
}

class TestRouteCoordinate {
  const TestRouteCoordinate(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

/// Capability implemented only by the APP_ENV=local, non-release bridge.
abstract interface class EmulatorTrackingHarness {
  bool get paused;
  Future<int> runDeterministicRoute(List<TestRouteCoordinate> zone);
  void pause();
  void resume();
}

class MethodChannelNativeTrackingBridge implements NativeTrackingBridge {
  const MethodChannelNativeTrackingBridge();
  static const MethodChannel _channel = MethodChannel(
    'com.scaledcircle/active_job_tracking',
  );
  bool get _isSupportedNative =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);
  void _requireNative() {
    if (!_isSupportedNative) {
      throw UnsupportedError(
        'Locked-screen GPS tracking requires the Scaled Circle iOS or Android app.',
      );
    }
  }

  @override
  Future<ActiveTrackingState> getState() async {
    if (!_isSupportedNative) return ActiveTrackingState.inactive;
    final value = await _channel.invokeMapMethod<Object?, Object?>('getState');
    return ActiveTrackingState.fromMap(value ?? const <Object?, Object?>{});
  }

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
    _requireNative();
    await _channel.invokeMethod<void>('start', <String, Object?>{
      'sessionId': sessionId,
      'campaignId': campaignId,
      'zoneId': zoneId,
      'scalerId': scalerId,
      'zoneName': zoneName,
      'cutoffAtMs': cutoffAtMs,
      'resume': resume,
    });
  }

  @override
  Future<TrackingLocationSample?> captureCheckpointLocation() async {
    _requireNative();
    final value = await _channel.invokeMapMethod<Object?, Object?>(
      'captureCheckpointLocation',
    );
    return value == null ? null : TrackingLocationSample.fromMap(value);
  }

  @override
  Future<List<TrackingChunk>> pendingChunks({int maximumPoints = 50}) async {
    _requireNative();
    final values = await _channel.invokeListMethod<Object?>('pendingChunks', {
      'maximumPoints': maximumPoints,
    });
    return (values ?? const <Object?>[])
        .whereType<Map>()
        .map(
          (value) => TrackingChunk.fromMap(Map<Object?, Object?>.from(value)),
        )
        .where((chunk) => chunk.id.isNotEmpty && chunk.points.isNotEmpty)
        .toList(growable: false);
  }

  @override
  Future<void> acknowledgeChunk(TrackingChunk chunk) async {
    _requireNative();
    await _channel.invokeMethod<void>('acknowledgeChunk', {
      'chunkId': chunk.id,
      'endSequence': chunk.endSequence,
    });
  }

  @override
  Future<bool> purgeAcknowledgedEvidence({required String sessionId}) async {
    _requireNative();
    return await _channel.invokeMethod<bool>('purgeAcknowledgedEvidence', {
          'sessionId': sessionId,
        }) ??
        false;
  }

  @override
  Future<void> stop({
    required String reason,
    required bool captureFinalPoint,
  }) async {
    _requireNative();
    await _channel.invokeMethod<void>('stop', {
      'reason': reason,
      'captureFinalPoint': captureFinalPoint,
    });
  }
}
