import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_app/widgets/own_team_time_comparison.dart';
import 'package:flutter_app/widgets/zone_intelligence_summary.dart';

final geometry = [
  {'latitude': 39.0, 'longitude': -76.0},
  {'latitude': 39.001, 'longitude': -76.0},
  {'latitude': 39.001, 'longitude': -76.001},
];
Map<String, dynamic> comparison() => {
  'version': 'OwnTeamFixedAreaTimeV2',
  'geometryDigest': CampaignAreaGeometry.savedDigest(geometry),
  'status': 'supported_subset',
  'coveredTargetCount': 12,
  'walkingMinutes': 4.4,
  'handlingMinutes': 16,
  'fullAreaWorkloadEstablished': false,
  'unclassifiedCount': 7,
  'currentTeam': {'marketerCount': 2, 'coveragePattern': 'stay_together'},
  'rows': [
    for (final count in [1, 2, 3, 4])
      {
        'marketerCount': count,
        'stayTogether': {'fieldMinutes': 21, 'calculatedFieldMinutes': 21},
        'splitUp': {
          'fieldMinutes': count == 1 ? 21 : 15,
          'calculatedFieldMinutes': [21, 12, 9, 7][count - 1],
          'walkingMinutes': 4.4,
          'handlingMinutes': 16,
          'subdivisionEstablished': true,
          'idealizedEvenDivisionMinutes': 21 / count,
          'allocations': [
            {
              'targetCount': 12,
              'walkingMinutes': 4.4,
              'handlingMinutes': 16,
              'fieldMinutes': 21,
              'calculatedFieldMinutes': 21,
            },
          ],
        },
      },
  ],
};
Widget page(Widget child, {double scale = 1}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(scale)),
    child: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);
void main() {
  for (final scale in [1.0, 2.0]) {
    testWidgets('fixed-area comparison readable at 390 px and ${scale}x text', (
      t,
    ) async {
      await t.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        page(
          OwnTeamTimeComparison(data: comparison(), geometry: geometry),
          scale: scale,
        ),
      );
      expect(find.text('1 marketer'), findsOneWidget);
      for (final n in [2, 3, 4]) {
        expect(find.text('$n marketers'), findsOneWidget);
      }
      expect(find.text('Stay together: ~21 min'), findsNWidgets(4));
      for (final min in [21, 12, 9, 7]) {
        expect(find.text('Split up: ~$min min'), findsOneWidget);
      }
      expect(
        find.textContaining('With 15-minute planning minimum'),
        findsNWidgets(4),
      );
      expect(find.text('Current setting: Stay together'), findsOneWidget);
      expect(
        find.textContaining('7 unclassified mapped features'),
        findsOneWidget,
      );
      expect(
        find.text(
          'Known-target subset only. Full area completion time: Not established.',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('4.4 min walking + 16.0 min handling'),
        findsOneWidget,
      );
      await t.ensureVisible(
        find.text('View included work and allocation').first,
      );
      await t.tap(find.text('View included work and allocation').first);
      await t.pumpAndSettle();
      expect(find.textContaining('not a practical allocation'), findsWidgets);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('changed geometry never displays stale comparison times', (
    t,
  ) async {
    final changed = geometry
        .map((p) => {...p, 'latitude': p['latitude']! + .01})
        .toList();
    await t.pumpWidget(
      page(OwnTeamTimeComparison(data: comparison(), geometry: changed)),
    );
    expect(
      find.text('Area changed. Recompute team times for this boundary.'),
      findsOneWidget,
    );
    expect(find.text('Stay together: ~21 min'), findsNothing);
  });
  testWidgets(
    'missing subdivision remains explicit and does not invent speed-up',
    (t) async {
      final data = comparison();
      for (final row in data['rows'] as List) {
        row['splitUp']['subdivisionEstablished'] = false;
        row['splitUp']['fieldMinutes'] = 21;
        row['splitUp']['calculatedFieldMinutes'] = 21;
      }
      await t.pumpWidget(
        page(OwnTeamTimeComparison(data: data, geometry: geometry)),
      );
      expect(find.text('Split up: ~21 min'), findsNWidgets(4));
      expect(
        find.textContaining(
          'Extra marketers do not establish a shorter finish.',
        ),
        findsNWidgets(4),
      );
    },
  );
  testWidgets(
    'existing Zone summary exposes comparison without save or assignment controls',
    (t) async {
      final data = <String, dynamic>{
        'version': 'ZoneIntelligenceV1',
        'geometryDigest': CampaignAreaGeometry.savedDigest(geometry),
        'status': 'partial',
        'mode': 'recommended',
        'mappedTargetCount': 12,
        'supportingStreetMeters': 177,
        'workload': null,
        'teamTimeComparison': comparison(),
      };
      await t.pumpWidget(
        page(ZoneIntelligenceSummary(data: data, geometry: geometry)),
      );
      expect(find.text('Estimated time for supported targets'), findsOneWidget);
      expect(find.text('Not established'), findsOneWidget);
      expect(find.text('Save'), findsNothing);
      expect(find.text('Assign'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );

  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'V3 separate local sections stay honest at 320px and ${scale}x',
      (t) async {
        await t.binding.setSurfaceSize(const Size(320, 900));
        addTearDown(() => t.binding.setSurfaceSize(null));
        final data = comparison()
          ..['version'] = 'OwnTeamFixedAreaTimeV3'
          ..['coveredTargetCount'] = 231
          ..['walkingMinutes'] = 210.236
          ..['handlingMinutes'] = 308
          ..['unclassifiedCount'] = 806
          ..['unmatchedPropertyCount'] = 708
          ..['computation'] = {'connectedLocalSectionCount': 12};
        for (final row in data['rows'] as List) {
          row['stayTogether']['calculatedFieldMinutes'] = 519;
          row['stayTogether']['fieldMinutes'] = 519;
          row['splitUp']['calculatedFieldMinutes'] = [
            519,
            265,
            183,
            140,
          ][row['marketerCount'] - 1];
          row['splitUp']['fieldMinutes'] =
              row['splitUp']['calculatedFieldMinutes'];
          row['splitUp']['criticalWalkingMinutes'] = [
            210.236,
            115.647,
            57.370,
            64.966,
          ][row['marketerCount'] - 1];
          row['splitUp']['criticalHandlingMinutes'] = [
            308,
            149.333,
            125.333,
            74.667,
          ][row['marketerCount'] - 1];
          row['splitUp']['allocatedPersonWorkMinutes'] = 518.236;
          row['splitUp']['allocations'][0]['localSection'] = 1;
        }
        await t.pumpWidget(
          page(
            OwnTeamTimeComparison(data: data, geometry: geometry),
            scale: scale,
          ),
        );
        expect(
          find.textContaining('12 separate local street sections'),
          findsOneWidget,
        );
        expect(
          find.textContaining('overall team finish is not established'),
          findsOneWidget,
        );
        expect(
          find.text('Split up · local field subtotal: ~265 min'),
          findsOneWidget,
        );
        expect(
          find.textContaining(
            'Split calculation: 210.2 min walking + 308.0 min handling',
          ),
          findsOneWidget,
        );
        expect(
          find.text('Stay together · local field subtotal: ~519 min'),
          findsNWidgets(4),
        );
        expect(
          find.text('Field-only finish for the included targets'),
          findsNothing,
        );
        await t.ensureVisible(
          find.text('View included work and allocation').first,
        );
        await t.tap(find.text('View included work and allocation').first);
        await t.pumpAndSettle();
        expect(
          find.textContaining('Total modeled person-work: 518.2 min'),
          findsOneWidget,
        );
        expect(
          find.textContaining(
            'local times are added for sequential field work',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('Local section 1'), findsOneWidget);
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'V3 allocation budget retains baseline and explicit incomplete result',
    (t) async {
      final data = comparison()
        ..['version'] = 'OwnTeamFixedAreaTimeV3'
        ..['status'] = 'allocation_incomplete'
        ..['reason'] = 'The bounded allocation-work budget was reached.'
        ..['rows'] = [];
      await t.pumpWidget(
        page(OwnTeamTimeComparison(data: data, geometry: geometry)),
      );
      expect(
        find.textContaining('bounded allocation-work budget'),
        findsOneWidget,
      );
      expect(find.textContaining('12 street-supported'), findsOneWidget);
      expect(find.textContaining('One-person baseline:'), findsOneWidget);
      expect(find.text('Split up: ~0 min'), findsNothing);
    },
  );
}
