import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/smart_zone_recommendation_evidence.dart';

Map<String, dynamic> failedPlan({int selected = 9, int successful = 2}) => {
  'recommendationStatus': 'manual_review_required',
  'zones': <Map<String, dynamic>>[],
  'targetEvidence': {'measure': 'mapped_target_features'},
  'searchRegion': {
    'selectedWindows': selected,
    'successfulWindows': successful,
  },
  'recommendationContext': {
    'requestedHours': 5,
    'goal': 'Residential flyer outreach',
    'locationLabel': '21061',
    'supportedMinutes': null,
    'signals': [],
    'limitations': [],
  },
};

void main() {
  testWidgets(
    'retained production shape explains partial acquisition without zero-property or workload claims',
    (tester) async {
      final plan = failedPlan();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SmartZoneRecommendationEvidence(plan: plan),
            ),
          ),
        ),
      );
      expect(find.textContaining('2 of 9 selected sections'), findsOneWidget);
      expect(
        find.textContaining("couldn't verify the requested 5 hours"),
        findsOneWidget,
      );
      expect(find.textContaining('0 mapped target'), findsNothing);
      expect(find.textContaining('Estimated field workload:'), findsNothing);
      expect(smartZonePlanCanApply(plan), false);
    },
  );

  test(
    'incomplete budget is not misrepresented as nine executed provider requests',
    () {
      final plan = failedPlan()..['reasonCode'] = 'bounded_search_time_budget';
      final message = intelligentAreaFailureMessage(plan);
      expect(message, contains('selected sections'));
      expect(message, isNot(contains('analyzed 9')));
      expect(message, isNot(contains('HTTP')));
    },
  );

  test(
    'all unavailable, fully analyzed, and invalid metadata remain distinct',
    () {
      expect(
        intelligentAreaFailureMessage(failedPlan(successful: 0)),
        contains('unavailable for all 9'),
      );
      final complete = intelligentAreaFailureMessage(failedPlan(successful: 9));
      expect(complete, contains('We analyzed 9 sections'));
      expect(complete, isNot(contains('Try again later')));
      for (final plan in [
        failedPlan(successful: 10),
        failedPlan(selected: 0, successful: 0),
        failedPlan(selected: 13),
      ]) {
        expect(
          intelligentAreaFailureMessage(plan),
          startsWith("We couldn't find enough reliable data"),
        );
      }
    },
  );

  testWidgets(
    'no alternate is explicit text, never an ambiguous disabled action',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: SmartZoneAlternativeAction(onAvailable: null)),
        ),
      );
      expect(
        find.text('No supported alternative from this search.'),
        findsOneWidget,
      );
      expect(find.byType(TextButton), findsNothing);
      expect(find.text('Try Another Recommendation'), findsNothing);
    },
  );

  testWidgets('supported alternate remains an actionable control', (
    tester,
  ) async {
    var used = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SmartZoneAlternativeAction(onAvailable: () => used = true),
        ),
      ),
    );
    await tester.tap(find.text('Try Another Recommendation'));
    expect(used, true);
    expect(
      find.text('No supported alternative from this search.'),
      findsNothing,
    );
  });
}
