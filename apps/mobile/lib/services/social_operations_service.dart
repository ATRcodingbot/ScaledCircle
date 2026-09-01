import 'package:cloud_functions/cloud_functions.dart';

class SocialOperationsWorkspace {
  const SocialOperationsWorkspace(this.data);
  final Map<String, dynamic> data;

  bool get managedGrowth => data['managedGrowth'] == true;
  bool get publishingEnabled => data['externalPublishingEnabled'] == true;
  List<Map<String, dynamic>> get connections => _maps(data['connections']);
  List<Map<String, dynamic>> get plans => _maps(data['plans']);
  List<Map<String, dynamic>> get emailPlans => _maps(data['emailPlans']);
  List<Map<String, dynamic>> get ads => _maps(data['ads']);
  Map<String, dynamic> get learning =>
      Map<String, dynamic>.from(data['weeklyLearning'] as Map? ?? const {});

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
}

class SocialOperationsService {
  SocialOperationsService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  Future<SocialOperationsWorkspace> load() async {
    final result = await _functions
        .httpsCallable('getSocialOperationsWorkspace')
        .call();
    return SocialOperationsWorkspace(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  Future<Map<String, dynamic>> createPlan({
    required String goal,
    required DateTime startsOn,
    required String automationMode,
  }) async {
    final days = [1, 4, 8, 11, 15, 18, 22, 26];
    final pillars = [
      'Education',
      'Customer problem',
      'Product capability',
      'Behind the business',
    ];
    final items = <Map<String, dynamic>>[];
    for (var index = 0; index < days.length; index += 1) {
      final scheduled = DateTime.utc(
        startsOn.year,
        startsOn.month,
        startsOn.day,
        14,
      ).add(Duration(days: days[index] - 1));
      final pillar = pillars[index % pillars.length];
      items.add({
        'itemKey': 'day_${days[index]}',
        'scheduledFor': scheduled.toIso8601String(),
        'goal': goal,
        'pillar': pillar,
        'variants': [
          {
            'provider': 'facebook',
            'format': 'feed',
            'copy':
                '$pillar: $goal. Review and tailor this draft before approval.',
            'callToAction': 'Learn more',
          },
          {
            'provider': 'instagram',
            'format': 'feed',
            'copy':
                '$goal — a visual-first $pillar draft ready for Business review.',
            'callToAction': 'Learn more',
          },
          {
            'provider': 'x',
            'format': 'post',
            'copy': '$goal. One concise $pillar idea for review.',
            'callToAction': 'Learn more',
          },
          {
            'provider': 'youtube',
            'format': 'shorts_concept',
            'copy':
                'Shorts concept: $goal. Open with one useful $pillar insight.',
            'callToAction': 'Learn more',
          },
        ],
      });
    }
    final result = await _functions
        .httpsCallable('createSocialContentPlanV1')
        .call({
          'goal': goal,
          'pillars': pillars,
          'items': items,
          'automationMode': automationMode,
          'managedAuthorization': false,
          'startsOn': DateTime.utc(
            startsOn.year,
            startsOn.month,
            startsOn.day,
          ).toIso8601String(),
        });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> approvePlan({
    required String planId,
    required int planVersion,
  }) => _functions.httpsCallable('approveSocialContentPlanV1').call({
    'planId': planId,
    'planVersion': planVersion,
  });

  Future<Map<String, dynamic>> createEmailPlan({
    required String goal,
    required DateTime startsOn,
  }) async {
    const themes = [
      'Education',
      'Useful guidance',
      'Frequently asked question',
      'Service awareness',
      'Seasonal relevance',
      'Re-engagement',
    ];
    final days = [2, 6, 10, 14, 18, 22, 26, 30];
    final entries = <Map<String, dynamic>>[];
    for (var index = 0; index < days.length; index += 1) {
      final theme = themes[index % themes.length];
      entries.add({
        'day': days[index],
        'theme': theme,
        'subject': '$theme: $goal',
        'previewText': 'A useful $theme message prepared for review.',
        'body':
            '$goal\n\nThis $theme draft must be reviewed and tailored before export or use.',
        'callToAction': 'Learn more',
        'segmentIntent': 'Existing consented audience only',
      });
    }
    final result = await _functions
        .httpsCallable('createEmailContentPlanV1')
        .call({
          'goal': goal,
          'startsOn': DateTime.utc(
            startsOn.year,
            startsOn.month,
            startsOn.day,
          ).toIso8601String(),
          'entries': entries,
        });
    return Map<String, dynamic>.from(result.data as Map);
  }
}
