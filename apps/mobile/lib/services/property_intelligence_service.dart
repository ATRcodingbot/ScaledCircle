import 'package:cloud_functions/cloud_functions.dart';

class PropertyIntelligenceAnalysis {
  final Map<String, dynamic> data;

  const PropertyIntelligenceAnalysis(this.data);

  int? get signal => (data['propertyAgeSignal'] as num?)?.toInt();
  String get category =>
      data['propertyAgeSignalCategory']?.toString() ?? 'INSUFFICIENT DATA';
  int get propertyCount => (data['propertyCount'] as num?)?.toInt() ?? 0;
  String get analyzedUnitLabel =>
      data['analyzedUnitLabel']?.toString() ?? 'Properties analyzed';
  int get residentialCount =>
      (data['residentialStructureCount'] as num?)?.toInt() ?? 0;
  String get predominantEra =>
      data['predominantConstructionEra']?.toString() ?? 'Unavailable';
  double get pre1980 => (data['percentPre1980'] as num?)?.toDouble() ?? 0;
  double get pre2000 => (data['percentPre2000'] as num?)?.toDouble() ?? 0;
  bool get ageMetricsAreEstimated =>
      data['ageMetricPrecision'] == 'estimated_from_acs_buckets';
  double get age20Plus =>
      ((data['percent20PlusYearsOld'] ?? data['estimatedPercent20PlusYearsOld'])
              as num?)
          ?.toDouble() ??
      0;
  double get age30Plus =>
      ((data['percent30PlusYearsOld'] ?? data['estimatedPercent30PlusYearsOld'])
              as num?)
          ?.toDouble() ??
      0;
  double get age40Plus =>
      ((data['percent40PlusYearsOld'] ?? data['estimatedPercent40PlusYearsOld'])
              as num?)
          ?.toDouble() ??
      0;
  String get inputGranularity =>
      data['inputGranularity']?.toString() ?? 'unknown';
  String get signalPrecision =>
      data['signalPrecision']?.toString() ?? 'unknown';
  int get intersectingGeographyCount =>
      (data['intersectingGeographyCount'] as num?)?.toInt() ?? 0;
  String get source => data['source']?.toString() ?? 'Unavailable';
  String get sourceVersion => data['sourceVersion']?.toString() ?? '';
  String get dataUpdatedAt =>
      data['dataUpdatedAt']?.toString() ?? 'Unavailable';
  String get confidence => data['confidence']?.toString() ?? 'INSUFFICIENT';
  double get coverage => (data['dataCoverage'] as num?)?.toDouble() ?? 0;
  String get summary =>
      data['aiSummary']?.toString() ?? 'Property Intelligence is unavailable.';
  List<String> get limitations => (data['limitations'] as List? ?? const [])
      .map((item) => item.toString())
      .toList(growable: false);
  Map<String, num> get propertyTypes => Map<String, dynamic>.from(
    data['propertyTypeDistribution'] as Map? ?? const {},
  ).map((key, value) => MapEntry(key, value is num ? value : 0));
  Map<String, dynamic> get physicalChannelSuitability =>
      Map<String, dynamic>.from(
        data['physicalChannelSuitability'] as Map? ?? const {},
      );
}

class PropertyIntelligenceService {
  final FirebaseFunctions _functions;

  PropertyIntelligenceService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  static Map<String, dynamic> buildSavedAreasRequest({
    required String objective,
    required String requestId,
    String? savedAreaId,
  }) => {
    'scope': 'saved_service_areas',
    'objective': objective.trim(),
    'requestId': requestId,
    'savedAreaId': ?savedAreaId,
  };

  Future<Map<String, dynamic>> analyzeSavedAreas({
    required String objective,
    required String requestId,
    String? savedAreaId,
  }) async {
    final response = await _functions
        .httpsCallable(
          'analyzePropertyIntelligence',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 180)),
        )
        .call(
          buildSavedAreasRequest(
            objective: objective,
            requestId: requestId,
            savedAreaId: savedAreaId,
          ),
        );
    return Map<String, dynamic>.from((response.data as Map)['report'] as Map);
  }

  Future<List<Map<String, dynamic>>> territoryHistory() async {
    final response = await _functions
        .httpsCallable('analyzePropertyIntelligence')
        .call({'scope': 'saved_service_areas', 'action': 'history'});
    return ((response.data as Map)['history'] as List? ?? [])
        .whereType<Map>()
        .map((value) => Map<String, dynamic>.from(value))
        .toList();
  }

  Future<Map<String, dynamic>> saveTerritory(String recommendationId) async {
    final response = await _functions
        .httpsCallable('analyzePropertyIntelligence')
        .call({
          'scope': 'saved_service_areas',
          'action': 'save_territory',
          'recommendationId': recommendationId,
        });
    return Map<String, dynamic>.from(
      (response.data as Map)['recommendation'] as Map,
    );
  }

  Future<PropertyIntelligenceAnalysis> analyzeZone(
    String zoneId, {
    String objective = '',
  }) async {
    final response = await _functions
        .httpsCallable('analyzePropertyIntelligence')
        .call({
          'zoneId': zoneId,
          if (objective.trim().isNotEmpty) 'objective': objective.trim(),
        });
    final payload = Map<String, dynamic>.from(response.data as Map);
    return PropertyIntelligenceAnalysis(
      Map<String, dynamic>.from(payload['analysis'] as Map),
    );
  }

  Future<PropertyIntelligenceAnalysis> analyzeArea(
    List<Map<String, double>> geometry, {
    String objective = '',
  }) async {
    final response = await _functions
        .httpsCallable('analyzePropertyIntelligence')
        .call(buildExploratoryRequest(geometry, objective: objective));
    final payload = Map<String, dynamic>.from(response.data as Map);
    return PropertyIntelligenceAnalysis(
      Map<String, dynamic>.from(payload['analysis'] as Map),
    );
  }

  static Map<String, dynamic> buildExploratoryRequest(
    List<Map<String, double>> geometry, {
    String objective = '',
  }) => <String, dynamic>{
    'geometry': geometry
        .map(
          (point) => <String, double>{
            'latitude': point['latitude']!,
            'longitude': point['longitude']!,
          },
        )
        .toList(growable: false),
    if (objective.trim().isNotEmpty) 'objective': objective.trim(),
  };
}
