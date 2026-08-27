import 'package:cloud_functions/cloud_functions.dart';

class AttributionService {
  AttributionService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;

  Future<AttributionOverview> loadOverview({String? businessUid}) async {
    final result = await _functions
        .httpsCallable('getAttributionOverview')
        .call<Map<Object?, Object?>>({'limit': 100, 'businessUid': ?businessUid});
    return AttributionOverview.fromMap(Map<String, dynamic>.from(result.data));
  }

  Future<Map<String, dynamic>> createResponseAsset({
    required String label,
    required String type,
    required String destination,
    String source = 'tracked_link',
  }) async {
    final result = await _functions.httpsCallable('createResponseAsset').call<Map<Object?, Object?>>({
      'label': label,
      'type': type,
      'destination': destination,
      'attribution': {'source': source},
    });
    return Map<String, dynamic>.from(result.data);
  }
}

class AttributionOverview {
  const AttributionOverview({required this.metrics, required this.assets, required this.dataStatus});
  factory AttributionOverview.fromMap(Map<String, dynamic> value) {
    final rawMetrics = value['metrics'];
    final rawAssets = value['assets'];
    return AttributionOverview(
      metrics: rawMetrics is Map ? Map<String, dynamic>.from(rawMetrics) : const {},
      assets: rawAssets is List
          ? rawAssets.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
          : const [],
      dataStatus: value['dataStatus']?.toString() ?? 'insufficient_data',
    );
  }
  final Map<String, dynamic> metrics;
  final List<Map<String, dynamic>> assets;
  final String dataStatus;
  int metric(String key) => (metrics[key] as num?)?.toInt() ?? 0;
}
