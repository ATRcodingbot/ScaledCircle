class TrackingLocationSample {
  const TrackingLocationSample({
    required this.sequence,
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    required this.horizontalAccuracy,
    required this.accepted,
    this.speed,
    this.heading,
    this.flags = const <String>[],
  });
  final int sequence;
  final double latitude;
  final double longitude;
  final DateTime recordedAt;
  final double horizontalAccuracy;
  final double? speed;
  final double? heading;
  final bool accepted;
  final List<String> flags;

  factory TrackingLocationSample.fromMap(Map<Object?, Object?> value) {
    final rawFlags = value['flags'];
    return TrackingLocationSample(
      sequence: (value['sequence'] as num?)?.toInt() ?? 0,
      latitude: (value['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (value['longitude'] as num?)?.toDouble() ?? 0,
      recordedAt: DateTime.fromMillisecondsSinceEpoch(
        (value['timestampMs'] as num?)?.toInt() ?? 0,
        isUtc: true,
      ),
      horizontalAccuracy:
          (value['horizontalAccuracy'] as num?)?.toDouble() ?? double.infinity,
      speed: (value['speed'] as num?)?.toDouble(),
      heading: (value['heading'] as num?)?.toDouble(),
      accepted: value['accepted'] == true,
      flags: rawFlags is List
          ? rawFlags.map((item) => item.toString()).toList(growable: false)
          : const <String>[],
    );
  }

  Map<String, dynamic> toMap() => <String, dynamic>{
    'sequence': sequence,
    'latitude': latitude,
    'longitude': longitude,
    'timestampMs': recordedAt.toUtc().millisecondsSinceEpoch,
    'horizontalAccuracy': horizontalAccuracy,
    if (speed != null) 'speed': speed,
    if (heading != null) 'heading': heading,
    'accepted': accepted,
    'flags': flags,
  };

  /// Only raw device measurements cross the backend trust boundary. The
  /// server calculates accepted/rejected and suspicious evidence flags.
  Map<String, dynamic> toUploadMap() => <String, dynamic>{
    'sequence': sequence,
    'latitude': latitude,
    'longitude': longitude,
    'timestampMs': recordedAt.toUtc().millisecondsSinceEpoch,
    'horizontalAccuracy': horizontalAccuracy,
    if (speed != null) 'speed': speed,
    if (heading != null) 'heading': heading,
  };
}

class TrackingChunk {
  const TrackingChunk({
    required this.id,
    required this.startSequence,
    required this.endSequence,
    required this.points,
  });
  final String id;
  final int startSequence;
  final int endSequence;
  final List<TrackingLocationSample> points;

  factory TrackingChunk.fromMap(Map<Object?, Object?> value) {
    final rawPoints = value['points'];
    return TrackingChunk(
      id: value['id']?.toString() ?? '',
      startSequence: (value['startSequence'] as num?)?.toInt() ?? 0,
      endSequence: (value['endSequence'] as num?)?.toInt() ?? 0,
      points: rawPoints is List
          ? rawPoints
                .whereType<Map>()
                .map(
                  (point) => TrackingLocationSample.fromMap(
                    Map<Object?, Object?>.from(point),
                  ),
                )
                .toList(growable: false)
          : const <TrackingLocationSample>[],
    );
  }
}

class ActiveTrackingState {
  const ActiveTrackingState({
    required this.active,
    required this.pointCount,
    required this.pendingPointCount,
    this.sessionId,
    this.campaignId,
    this.zoneId,
    this.startedAt,
    this.lastLocation,
    this.lastError,
  });
  final bool active;
  final String? sessionId;
  final String? campaignId;
  final String? zoneId;
  final DateTime? startedAt;
  final TrackingLocationSample? lastLocation;
  final int pointCount;
  final int pendingPointCount;
  final String? lastError;
  static const inactive = ActiveTrackingState(
    active: false,
    pointCount: 0,
    pendingPointCount: 0,
  );

  factory ActiveTrackingState.fromMap(Map<Object?, Object?> value) {
    final rawLocation = value['lastLocation'];
    return ActiveTrackingState(
      active: value['active'] == true,
      sessionId: value['sessionId']?.toString(),
      campaignId: value['campaignId']?.toString(),
      zoneId: value['zoneId']?.toString(),
      startedAt: value['startedAtMs'] is num
          ? DateTime.fromMillisecondsSinceEpoch(
              (value['startedAtMs'] as num).toInt(),
              isUtc: true,
            )
          : null,
      lastLocation: rawLocation is Map
          ? TrackingLocationSample.fromMap(
              Map<Object?, Object?>.from(rawLocation),
            )
          : null,
      pointCount: (value['pointCount'] as num?)?.toInt() ?? 0,
      pendingPointCount: (value['pendingPointCount'] as num?)?.toInt() ?? 0,
      lastError: value['lastError']?.toString(),
    );
  }
}
