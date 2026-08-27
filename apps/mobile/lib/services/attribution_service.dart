import 'package:cloud_functions/cloud_functions.dart';

abstract interface class AttributionClient {
  Future<AttributionOverview> loadOverview({String? businessUid});

  Future<Map<String, dynamic>> createResponseAsset({
    required String label,
    required String type,
    required String destination,
    String source,
    String? campaignId,
  });
}

class AttributionService implements AttributionClient {
  AttributionService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;

  @override
  Future<AttributionOverview> loadOverview({String? businessUid}) async {
    final result = await _functions
        .httpsCallable('getAttributionOverview')
        .call<Map<Object?, Object?>>({
          'limit': 100,
          'businessUid': ?businessUid,
        });
    return AttributionOverview.fromMap(Map<String, dynamic>.from(result.data));
  }

  @override
  Future<Map<String, dynamic>> createResponseAsset({
    required String label,
    required String type,
    required String destination,
    String source = 'tracked_link',
    String? campaignId,
  }) async {
    final result = await _functions
        .httpsCallable('createResponseAsset')
        .call<Map<Object?, Object?>>({
          'label': label,
          'type': type,
          'destination': destination,
          'attribution': {'source': source, 'campaignId': ?campaignId},
        });
    return Map<String, dynamic>.from(result.data);
  }
}

class AttributionOverview {
  const AttributionOverview({
    required this.metrics,
    required this.assets,
    required this.dataStatus,
    this.campaigns = const [],
  });
  factory AttributionOverview.fromMap(Map<String, dynamic> value) {
    final rawMetrics = value['metrics'];
    final rawAssets = value['assets'];
    return AttributionOverview(
      metrics: rawMetrics is Map
          ? Map<String, dynamic>.from(rawMetrics)
          : const {},
      assets: rawAssets is List
          ? rawAssets
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
          : const [],
      dataStatus: value['dataStatus']?.toString() ?? 'insufficient_data',
      campaigns: value['campaigns'] is List
          ? (value['campaigns'] as List)
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
          : const [],
    );
  }
  final Map<String, dynamic> metrics;
  final List<Map<String, dynamic>> assets;
  final String dataStatus;
  final List<Map<String, dynamic>> campaigns;
  int metric(String key) => (metrics[key] as num?)?.toInt() ?? 0;
}
