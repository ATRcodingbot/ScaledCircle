import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/own_team_capacity.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/widgets/campaign_workload_summary.dart';
import 'campaign_mapping_interaction_test.dart' as h;

void main() {
  for (final n in [1, 2, 3, 4]) {
    test('four-hour session with $n marketers is explicit', () {
      final input = ownTeamCapacityInput(4, '$n', 'split_streets');
      expect(input['marketerCount'], n);
      expect(input['sessionHours'], 4);
      expect(
        ownTeamCapacityInput(4, '$n', 'stay_together')['coveragePattern'],
        'stay_together',
      );
    });
  }
  test(
    'blank, fractional headcount, missing pattern and short session rejected',
    () {
      for (final count in ['', '0', '-1', '1.5']) {
        expect(
          () => ownTeamCapacityInput(4, count, 'split_streets'),
          throwsFormatException,
        );
      }
      expect(
        () => ownTeamCapacityInput(.49, '2', 'split_streets'),
        throwsFormatException,
      );
      expect(() => ownTeamCapacityInput(4, '2', null), throwsFormatException);
    },
  );
  for (final narrow in [false, true]) {
    testWidgets(
      'actual own-team entry validates inputs (narrow and large text=$narrow)',
      (t) async {
        var calls = 0;
        Map<String, dynamic>? saved;
        await t.binding.setSurfaceSize(
          narrow ? const Size(390, 844) : const Size(1100, 1900),
        );
        addTearDown(() => t.binding.setSurfaceSize(null));
        await t.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(narrow ? 2 : 1)),
              child: child!,
            ),
            home: Scaffold(
              body: SingleChildScrollView(
                child: CampaignZoneAreaEntry(
                  executionMode: 'own_team',
                  recommendationEnabled: true,
                  locked: false,
                  hasSavedArea: false,
                  savedAreaName: '',
                  initialHours: 4,
                  initialSelection: h.glenBurnie,
                  onManualTeamCapacity: (input) => saved = input,
                  onSaveTeamCapacity: (_, _) async => throw StateError(
                    'Recommendation preview must not persist workload',
                  ),
                  onPlan: (_, hours, goal) async {
                    calls++;
                  },
                  onAdvancedEdit: (_) {},
                ),
              ),
            ),
          ),
        );
        await t.pump();
        await h.choose(t, 'Recommend an Area');
        expect(calls, 0);
        expect(saved, null);
        final count = find.widgetWithText(
          TextFormField,
          'How many marketers will work this area?',
        );
        await t.enterText(count, '3');
        await h.choose(t, 'Split up to cover different streets.');
        await t.pumpAndSettle();

        await t.pumpAndSettle();
        await h.choose(t, 'Recommend an Area');
        expect(calls, 1);
        expect(saved, {
          'sessionHours': 4.0,
          'marketerCount': 3,
          'coveragePattern': 'split_streets',
        });
        await t.pumpWidget(const SizedBox());
      },
    );
  }
  testWidgets(
    'team summary separates saved sections from marketplace required Zones',
    (t) async {
      await t.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CampaignWorkloadSummary(
              state: {
                'executionMode': 'own_team',
                'requestedHours': 4,
                'marketerCount': 3,
                'coveragePattern': 'split_streets',
                'requiredZoneCount': null,
                'validZoneCount': 2,
                'supportedMinutes': 45,
                'requestedMinutes': 720,
              },
            ),
          ),
        ),
      );
      expect(find.text('Supported team coverage sections: 2'), findsOneWidget);
      expect(find.textContaining('Required Zones:'), findsNothing);
    },
  );
}
