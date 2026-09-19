import 'package:cloud_functions/cloud_functions.dart';
import 'dart:typed_data';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'business_workspace_service.dart';

class SocialOperationsWorkspace {
  const SocialOperationsWorkspace(this.data);
  final Map<String, dynamic> data;

  bool get managedGrowth => data['managedGrowth'] == true;
  bool get internalDevelopmentAvailable =>
      data['internalDevelopmentAvailable'] == true;
  List<Map<String, dynamic>> get availableConnections => connections
      .where(
        (connection) =>
            internalDevelopmentAvailable ||
            ['facebook', 'instagram'].contains(connection['provider']),
      )
      .toList();
  bool get managedPublishingAvailable =>
      data['managedPublishingAvailable'] == true;
  bool get publishingEnabled => data['externalPublishingEnabled'] == true;
  bool get firstXCertificationAvailable =>
      data['firstXCertificationAvailable'] == true;
  List<Map<String, dynamic>> get connections => _maps(data['connections']);
  List<Map<String, dynamic>> get plans => _maps(data['plans']);
  List<Map<String, dynamic>> get emailPlans => _maps(data['emailPlans']);
  List<Map<String, dynamic>> get ads => _maps(data['ads']);
  Map<String, dynamic> get contentHealth =>
      Map<String, dynamic>.from(data['contentHealth'] as Map? ?? const {});
  Map<String, dynamic> get runtimeStatus =>
      Map<String, dynamic>.from(data['runtimeStatus'] as Map? ?? const {});
  Map<String, dynamic> get learning =>
      Map<String, dynamic>.from(data['weeklyLearning'] as Map? ?? const {});
  Map<String, dynamic>? get internalPlanAlignment =>
      data['internalPlanAlignment'] is Map
      ? Map<String, dynamic>.from(data['internalPlanAlignment'] as Map)
      : null;
  Map<String, dynamic>? get firstXPublish => data['firstXPublish'] is Map
      ? Map<String, dynamic>.from(data['firstXPublish'] as Map)
      : null;

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
}

class SocialOperationsService {
  Future<void> changeScheduledPost(Map<String, dynamic> input) async {
    await _functions
        .httpsCallable('changeScheduledSocialPostV1')
        .call(_workspace(input));
  }

  Future<Map<String, dynamic>> automaticPublishing(
    Map<String, dynamic> input,
  ) async {
    final result = await _functions
        .httpsCallable('manageAutomaticSocialPublishingV1')
        .call(_workspace(input));
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Uint8List?> previewCreative(Map<String, dynamic> candidate) =>
      FirebaseStorage.instance
          .ref(candidate['storagePath'].toString())
          .getData(8 * 1024 * 1024);
  SocialOperationsService({FirebaseFunctions? functions})
    : _providedFunctions = functions;

  final FirebaseFunctions? _providedFunctions;
  Map<String, dynamic> _workspace(Map<String, dynamic> input) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return {
      ...input,
      if (uid != null)
        'businessId': BusinessWorkspaceSession.businessIdFor(uid),
    };
  }

  FirebaseFunctions get _functions =>
      _providedFunctions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  Future<Map<String, dynamic>> generationAvailability() async {
    try {
      final data = Map<String, dynamic>.from(
        (await _functions
                    .httpsCallable('getGeneratedServiceVisualWorkspace')
                    .call(_workspace({})))
                .data
            as Map,
      );
      return {'availability': data['availability'], 'usage': data['usage']};
    } catch (_) {
      return {
        'availability': {
          'available': false,
          'state': 'provider_temporarily_unavailable',
          'message': 'Creative generation is temporarily unavailable.',
        },
      };
    }
  }

  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> input) async {
    final result = Map<String, dynamic>.from(
      (await _functions
                  .httpsCallable(
                    'prepareCustomerSocialPostV1',
                    options: HttpsCallableOptions(
                      timeout: const Duration(seconds: 120),
                    ),
                  )
                  .call(_workspace(input)))
              .data
          as Map,
    );
    // Reuse the budgeted, moderated generation authority. Stable request identity
    // prevents another provider generation when this review is reopened.
    if (['auto', 'regenerate'].contains(input['action']) &&
        result['generationRequest'] is Map) {
      try {
        final requested = Map<String, dynamic>.from(
          (await _functions
                      .httpsCallable('requestGeneratedServiceVisual')
                      .call(
                        _workspace(
                          Map<String, dynamic>.from(
                            result['generationRequest'] as Map,
                          ),
                        ),
                      ))
                  .data
              as Map,
        );
        final generated = requested['status'] == 'queued'
            ? Map<String, dynamic>.from(
                (await _functions
                            .httpsCallable(
                              'processGeneratedServiceVisual',
                              options: HttpsCallableOptions(
                                timeout: const Duration(seconds: 120),
                              ),
                            )
                            .call(_workspace({'jobId': requested['jobId']})))
                        .data
                    as Map,
              )
            : requested;
        result['generatedCreative'] = generated;
        if (generated['status'] == 'review_required') {
          final prepared = await _functions
              .httpsCallable('prepareCustomerSocialPostV1')
              .call(
                _workspace({
                  ...input,
                  'action': 'auto',
                  'version': result['version'] ?? input['version'],
                }),
              );
          result.addAll(Map<String, dynamic>.from(prepared.data as Map));
        }
        if (generated['status'] == 'review_required') {
          result['creativeStatus'] = result['reviewCandidate'] != null
              ? 'concept_needs_review'
              : 'needs_creative';
        } else if (['queued', 'processing'].contains(generated['status'])) {
          result['creativeStatus'] = 'preparing';
          result['generationMessage'] =
              'Preparing new creative. Your saved image is preserved; check the preview again shortly.';
        } else {
          result['creativeStatus'] = 'needs_attention';
          result['generationMessage'] =
              'Creative generation could not finish. Your saved post is preserved. Try again later or choose another image.';
        }
      } on FirebaseFunctionsException catch (error) {
        result['creativeStatus'] = 'needs_creative';
        result['generationMessage'] =
            error.message ??
            'Generation could not be completed. Review the saved status before retrying.';
      }
    }
    return result;
  }

  Future<Map<String, dynamic>> previewPost(Map<String, dynamic> post) async =>
      Map<String, dynamic>.from(
        (await _functions
                    .httpsCallable('previewCustomerSocialPostV1')
                    .call(_workspace(post)))
                .data
            as Map,
      );
  Future<Map<String, dynamic>> approveAndSchedulePost(
    Map<String, dynamic> post,
  ) async => Map<String, dynamic>.from(
    (await _functions
                .httpsCallable('approveAndScheduleCustomerSocialPostV1')
                .call(_workspace(post)))
            .data
        as Map,
  );

  Future<SocialOperationsWorkspace> load() async {
    final result = await _functions
        .httpsCallable('getSocialOperationsWorkspace')
        .call(_workspace({}));
    return SocialOperationsWorkspace(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  Future<Map<String, dynamic>> beginReadOnlyConnection(
    String provider, {
    bool managedPublishing = false,
  }) async {
    final result = await _functions
        .httpsCallable('beginSocialOAuthConnectionV1')
        .call({
          'provider': provider,
          if (managedPublishing) 'capability': 'managed_publishing',
        });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> connectionAttempt(String attemptId) async {
    final result = await _functions
        .httpsCallable('getSocialOAuthAttemptV1')
        .call({'attemptId': attemptId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> cancelConnectionAttempt(String attemptId) async {
    await _functions.httpsCallable('cancelSocialOAuthAttemptV1').call({
      'attemptId': attemptId,
    });
  }

  Future<Map<String, dynamic>> confirmReadOnlyConnection({
    required String attemptId,
    required String candidateId,
  }) async {
    final result = await _functions
        .httpsCallable('confirmSocialOAuthConnectionV1')
        .call({'attemptId': attemptId, 'candidateId': candidateId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> syncReadOnlyPerformance(String provider) async {
    final callableName = switch (provider) {
      'x' => 'syncXSocialReadOnlyPerformanceV1',
      'youtube' => 'syncSocialReadOnlyPerformanceV1',
      'facebook' || 'instagram' => 'syncMetaSocialReadOnlyPerformanceV1',
      _ => throw ArgumentError.value(
        provider,
        'provider',
        'Read-only performance sync is not available for this provider.',
      ),
    };
    final result = await _functions.httpsCallable(callableName).call({
      'provider': provider,
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> reviewScheduledContent() async {
    final result = await _functions
        .httpsCallable('reviewScheduledSocialContentV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> ratePastPosts(int lookbackDays) async {
    final result = await _functions
        .httpsCallable('rateHistoricalSocialContentV1')
        .call({'lookbackDays': lookbackDays});
    return Map<String, dynamic>.from(result.data as Map);
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

  Future<Map<String, dynamic>> ingestScaledCircleLaunchPlan() async {
    final result = await _functions
        .httpsCallable('ingestScaledCircleLaunchPlanV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> prepareCustomerPlan() async {
    await _functions.httpsCallable('prepareCustomerSocialPlanV1').call({});
  }

  Future<Map<String, dynamic>> prepareFirstXPublishFoundation() async {
    final result = await _functions
        .httpsCallable('prepareFirstXPublishFoundationV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> createFirstXPublishVersion({
    required String responseAssetId,
  }) async {
    final result = await _functions
        .httpsCallable('createFirstXPublishVersionV3')
        .call({'responseAssetId': responseAssetId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> firstXPublishCertification() async {
    final result = await _functions
        .httpsCallable('getFirstXPublishCertificationV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> beginFirstXPublishAuthorization() async {
    final result = await _functions
        .httpsCallable('beginFirstXPublishAuthorizationV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> recordFirstXFounderApproval() async {
    final result = await _functions
        .httpsCallable('recordFirstXFounderApprovalV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> confirmFirstXPublishAuthorization({
    required String attemptId,
    required String candidateId,
  }) async {
    final result = await _functions
        .httpsCallable('confirmFirstXPublishAuthorizationV1')
        .call({'attemptId': attemptId, 'candidateId': candidateId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> createFirstXPublishApproval() async {
    final result = await _functions
        .httpsCallable('createFirstXPublishApprovalV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> executeFirstXPublish(String publishJobId) async {
    final result = await _functions
        .httpsCallable('executeFirstXPublishV1')
        .call({'publishJobId': publishJobId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> reconcileFirstXPublish(
    String publishJobId,
  ) async {
    final result = await _functions
        .httpsCallable('reconcileFirstXPublishV1')
        .call({'publishJobId': publishJobId});
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
