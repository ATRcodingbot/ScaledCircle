import 'package:cloud_functions/cloud_functions.dart';

class ScaledCircleAiInterpretation {
  const ScaledCircleAiInterpretation({
    required this.status,
    required this.summary,
    required this.opportunities,
    required this.limitations,
    required this.unavailableFacts,
    required this.cached,
    required this.model,
    required this.knownData,
  });

  final String status;
  final String summary;
  final List<Map<String, String>> opportunities;
  final List<String> limitations;
  final List<String> unavailableFacts;
  final bool cached;
  final String? model;
  final Map<String, dynamic> knownData;

  bool get available => status == 'complete';

  factory ScaledCircleAiInterpretation.fromPayload(Map<String, dynamic> data) {
    final interpretation = Map<String, dynamic>.from(
      data['aiInterpretation'] as Map? ?? const {},
    );
    return ScaledCircleAiInterpretation(
      status: data['status']?.toString() ?? 'temporarily_unavailable',
      summary:
          interpretation['summary']?.toString() ??
          data['message']?.toString() ??
          'AI analysis is temporarily unavailable.',
      opportunities: (interpretation['opportunities'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) => Map<String, String>.fromEntries(
              item.entries.map(
                (entry) => MapEntry(
                  entry.key.toString(),
                  entry.value?.toString() ?? '',
                ),
              ),
            ),
          )
          .toList(growable: false),
      limitations: (interpretation['limitations'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(growable: false),
      unavailableFacts:
          (interpretation['unavailableFacts'] as List? ?? const [])
              .map((item) => item.toString())
              .toList(growable: false),
      cached: data['cached'] == true,
      model: data['modelSnapshot']?.toString() ?? data['model']?.toString(),
      knownData: Map<String, dynamic>.from(
        data['knownData'] as Map? ?? const {},
      ),
    );
  }
}

class ScaledCircleIntelligenceService {
  ScaledCircleIntelligenceService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  Future<ScaledCircleAiInterpretation> analyzeProperty({
    required String analysisId,
    required String geometryDigest,
    String businessObjective = '',
    String question = '',
  }) => _call({
    'mode': 'property',
    'analysisId': analysisId,
    'geometryDigest': geometryDigest,
    'businessObjective': businessObjective.trim(),
    'question': question.trim(),
  });

  Future<ScaledCircleAiInterpretation> analyzeWeather({
    required double latitude,
    required double longitude,
    String businessObjective = '',
    String question = '',
  }) => _call({
    'mode': 'weather',
    'latitude': latitude,
    'longitude': longitude,
    'businessObjective': businessObjective.trim(),
    'question': question.trim(),
  });

  Future<ScaledCircleAiInterpretation> analyzeCombined({
    required String analysisId,
    required String geometryDigest,
    required double latitude,
    required double longitude,
    String businessObjective = '',
    String question = '',
  }) => _call({
    'mode': 'combined',
    'analysisId': analysisId,
    'geometryDigest': geometryDigest,
    'latitude': latitude,
    'longitude': longitude,
    'businessObjective': businessObjective.trim(),
    'question': question.trim(),
  });

  Future<ScaledCircleAiInterpretation> _call(
    Map<String, dynamic> request,
  ) async {
    final response = await _functions
        .httpsCallable('analyzeScaleIntelligence')
        .call(request);
    return ScaledCircleAiInterpretation.fromPayload(
      Map<String, dynamic>.from(response.data as Map),
    );
  }
}
