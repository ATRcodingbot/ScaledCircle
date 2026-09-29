import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/smart_zone_recommendation_evidence.dart';

Map<String, dynamic> evidencePlan({
  String status = 'review_required',
  List<Map<String, dynamic>> zones = const [{}],
  int count = 19,
}) => {
  'recommendationStatus': status,
  'zones': zones,
  'totalEstimatedHours': .7,
  'targetEvidence': <String, dynamic>{
    'measure': 'mapped_target_features',
    'eligibleMappedFeatureCount': count,
    'source': 'OpenStreetMap',
    'dataTimestamp': '2026-09-26T19:12:49Z',
    'fetchedAt': '2026-09-26T19:15:00Z',
  },
};

Future<void> showPlan(WidgetTester tester, Map<String, dynamic> plan) =>
    tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: SmartZoneRecommendationEvidence(plan: plan)),
      ),
    );

void main() {
  testWidgets('missing provider snapshot is unavailable, not an observed zero', (
    tester,
  ) async {
    final plan =
        evidencePlan(status: 'manual_review_required', zones: [], count: 0)
          ..['geographicSource'] = null
          ..['explanation'] =
              'Reliable classified targets and local-road linework are unavailable.';
    (plan['targetEvidence'] as Map)['dataTimestamp'] = null;
    (plan['targetEvidence'] as Map)['fetchedAt'] = null;
    await showPlan(tester, plan);
    expect(find.text('Manual review required'), findsOneWidget);
    expect(find.text('Target count unavailable.'), findsOneWidget);
    expect(find.text('0 mapped target features'), findsNothing);
    expect(find.text('Source: OpenStreetMap'), findsNothing);
    expect(find.textContaining('Source date:'), findsNothing);
    expect(find.textContaining('Estimated workload:'), findsNothing);
    expect(smartZonePlanCanApply(plan), false);
  });

  testWidgets(
    'observed features rejected from candidate Zones are not displayed as zero observations',
    (tester) async {
      final plan = evidencePlan(
        status: 'manual_review_required',
        zones: [],
        count: 0,
      )..['geographicSource'] = 'openstreetmap_bounded_snapshot_v1';
      (plan['targetEvidence'] as Map)['observedEligibleFeatureCount'] = 60;
      await showPlan(tester, plan);
      expect(
        find.text('Target count for a recommended Zone is unavailable.'),
        findsOneWidget,
      );
      expect(find.text('0 mapped target features'), findsNothing);
      expect(find.text('Source: OpenStreetMap'), findsOneWidget);
      expect(find.text('Source date: 2026-09-26T19:12:49Z'), findsOneWidget);
      expect(find.text('Retrieved: 2026-09-26T19:15:00Z'), findsOneWidget);
      expect(smartZonePlanCanApply(plan), false);
    },
  );

  testWidgets('explicit failed acquisition suppresses a numeric inventory', (
    tester,
  ) async {
    final plan = evidencePlan(
      status: 'manual_review_required',
      zones: [],
      count: 0,
    )..['geographicAcquisition'] = {'status': 'unavailable'};
    await showPlan(tester, plan);
    expect(find.text('Target count unavailable.'), findsOneWidget);
    expect(find.text('0 mapped target features'), findsNothing);
    expect(find.text('Source: OpenStreetMap'), findsNothing);
    // An explicitly provided source date remains distinct from retrieval time.
    expect(
      find.text('Incomplete source date: 2026-09-26T19:12:49Z'),
      findsOneWidget,
    );
    expect(
      find.text('Retrieval attempt: 2026-09-26T19:15:00Z'),
      findsOneWidget,
    );
    expect(smartZonePlanCanApply(plan), false);
  });

  testWidgets(
    'partial provider response retains a dated warning without establishing observations',
    (tester) async {
      final plan =
          evidencePlan(status: 'manual_review_required', zones: [], count: 0)
            ..['geographicSource'] = null
            ..['geographicAcquisition'] = {
              'status': 'unavailable',
              'stage': 'parse',
              'reasonCode': 'provider_partial_response',
              'sourceDataTimestamp': '2026-09-26T19:12:49Z',
              'fetchedAt': null,
            };
      (plan['targetEvidence'] as Map)['dataTimestamp'] = null;
      (plan['targetEvidence'] as Map)['fetchedAt'] = null;
      await showPlan(tester, plan);
      expect(find.text('Target count unavailable.'), findsOneWidget);
      expect(
        find.text('Incomplete source date: 2026-09-26T19:12:49Z'),
        findsOneWidget,
      );
      expect(find.text('0 mapped target features'), findsNothing);
      expect(find.text('Source: OpenStreetMap'), findsNothing);
      expect(find.textContaining('Retrieved:'), findsNothing);
      expect(smartZonePlanCanApply(plan), false);
    },
  );

  testWidgets(
    'no accepted Zones cannot imply a count even without manual status',
    (tester) async {
      final plan = evidencePlan(zones: [], count: 0);
      await showPlan(tester, plan);
      expect(find.text('0 mapped target features'), findsNothing);
      expect(
        find.text('Target count for a recommended Zone is unavailable.'),
        findsOneWidget,
      );
      expect(smartZonePlanCanApply(plan), false);
    },
  );

  for (final withAcquisition in [false, true]) {
    testWidgets(
      'positive candidate inventory preserves display and source dates (acquisition=$withAcquisition)',
      (tester) async {
        final plan = evidencePlan();
        if (withAcquisition) {
          plan['geographicAcquisition'] = {'status': 'success'};
          plan['geographicSource'] = 'openstreetmap_bounded_snapshot_v1';
        }
        await showPlan(tester, plan);
        expect(find.text('19 mapped target features'), findsOneWidget);
        expect(find.text('Review Recommended Area'), findsOneWidget);
        expect(find.text('Estimated workload: 0.7 hours'), findsOneWidget);
        expect(find.text('Source: OpenStreetMap'), findsOneWidget);
        expect(find.text('Source date: 2026-09-26T19:12:49Z'), findsOneWidget);
        expect(find.text('Retrieved: 2026-09-26T19:15:00Z'), findsOneWidget);
        expect(smartZonePlanCanApply(plan), true);
      },
    );
  }
}
