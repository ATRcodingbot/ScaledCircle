import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'package:flutter_app/widgets/zone_intelligence_summary.dart';
import 'own_team_time_comparison_test.dart' as c;
import 'campaign_mapping_interaction_test.dart' as h;

// Synthetic geometry; retained aggregate numbers exercise presentation only.
// Neither this fixture nor these widget actions are production acceptance.
Map<String, dynamic> reviewEvidence(dynamic geometry, {int crew = 2}) {
  final comparison = c.comparison()
    ..['version'] = 'OwnTeamFixedAreaTimeV3'
    ..['geometryDigest'] = CampaignAreaGeometry.savedDigest(geometry)
    ..['coveredTargetCount'] = 81
    ..['walkingMinutes'] = 76.4
    ..['handlingMinutes'] = 108
    ..['currentTeam'] = {
      'marketerCount': crew,
      'coveragePattern': 'stay_together',
    }
    ..['computation'] = {'connectedLocalSectionCount': 3}
    ..['unclassifiedCount'] = 152
    ..['unmatchedPropertyCount'] = 499;
  final binding = {
    'geometryDigest': comparison['geometryDigest'],
    'comparisonVersion': comparison['version'],
    'targetSetDigest': 'fixture-targets',
    'evidenceDigest': 'fixture-evidence',
    'sourceEvidenceVersion': 'fixture-source',
    'workloadModelVersion': 'fixture-model',
  };
  comparison['binding'] = binding;
  for (final row in comparison['rows'] as List) {
    final n = row['marketerCount'] as int;
    row['stayTogether'] = {
      'calculatedFieldMinutes': 185,
      'fieldMinutes': 185,
      'walkingMinutes': 76.4,
      'handlingMinutes': 108,
      'binding': {
        ...binding,
        'marketerCount': n,
        'coveragePattern': 'stay_together',
      },
    };
    row['splitUp'] = {
      'calculatedFieldMinutes': [185, 93, 66, 49][n - 1],
      'fieldMinutes': [185, 93, 66, 49][n - 1],
      'subdivisionEstablished': true,
      'binding': {
        ...binding,
        'marketerCount': n,
        'coveragePattern': 'split_streets',
      },
    };
  }
  return {
    'version': 'ZoneIntelligenceV1',
    'geometryDigest': comparison['geometryDigest'],
    'mode': 'manual',
    'status': 'partial',
    'mappedTargetCount': 82,
    'supportingStreetMeters': 3058,
    'unclassifiedMappedFeatureCount': 152,
    'propertyMix': {
      'classifiedCount': 16,
      'unknownCount': 66,
      'categories': [
        {'count': 16, 'label': 'Detached'},
      ],
    },
    'selectedAreaPropertyFacts': {
      'insideRecords': 760,
      'knownTypeRecords': 760,
      'knownYearRecords': 691,
      'constructionEra': '1940–1959',
      'source': 'Maryland public property data',
      'method': 'official_account_dedup_and_point_in_polygon',
      'scope': 'official parcel points inside this boundary',
      'sourceVersion': 'fixture-source',
      'dataUpdatedAt': null,
      'retrievedAt': '2026-10-01T10:31:24Z',
    },
    'teamCapacityAnalysis': {
      'sessionHours': 4,
      'marketerCount': crew,
      'coveragePattern': 'stay_together',
    },
    'teamTimeComparison': comparison,
    'source': {
      'name': 'OpenStreetMap',
      'dataTimestamp': '2026-09-25',
      'fetchedAt': '2026-09-26',
      'freshness': 'fresh',
    },
  };
}

String selectedTime(WidgetTester t) =>
    t.widget<Text>(find.byKey(const ValueKey('selected-team-time'))).data!;
Future<void> mode(WidgetTester t, String value) async {
  final finder = find.byKey(ValueKey('preview-mode-$value'));
  await t.ensureVisible(finder);
  await t.tap(finder);
  await t.pumpAndSettle();
}

Future<void> crew(WidgetTester t, int count) async {
  final finder = find.byKey(const ValueKey('preview-marketer-count'));
  await t.ensureVisible(finder);
  await t.enterText(finder, '$count');
  await t.pump();
}

void main() {
  for (final accept in [true, false]) {
    testWidgets(
      'explicit area acceptance forwards selected settings; authority accepts=$accept',
      (t) async {
        final ref = h.SavedDraftReference();
        final events = <String>[];
        Map<String, dynamic>? sent;
        var reads = 0;
        await h.surface(
          t,
          CampaignAreaScreen(
            campaignReference: ref,
            pendingZoneData: const {
              'zoneName': 'Fixture',
              'campaignId': 'fixture',
            },
            initialArea: c.geometry,
            tileProvider: h.MapTiles(),
            teamCapacity: const {
              'sessionHours': 4,
              'marketerCount': 2,
              'coveragePattern': 'stay_together',
            },
            zoneEvidenceIdentity: () => 'fixture-owner/fixture-workspace',
            zoneEvidenceLoader: (input) async {
              reads++;
              return reviewEvidence(input['geometry']);
            },
            beforeAccept: () async {
              events.add('existing gate');
              return true;
            },
            saveTeamCapacity: (input) async {
              events.add('server workload validation');
              sent = input;
              return accept;
            },
            analyzePersistedZone: () async {
              events.add('analyze saved area');
              return true;
            },
          ),
        );
        await t.pump(const Duration(seconds: 1));
        await t.pumpAndSettle();
        await crew(t, 3);
        await mode(t, 'split_streets');
        expect(selectedTime(t), '~1 hr 6 min');
        expect(sent, isNull);
        expect(ref.saved, isNull);
        expect(reads, 1);
        await h.choose(t, 'Use This Area');
        await t.pumpAndSettle();
        expect(sent, {
          'sessionHours': 4,
          'marketerCount': 3,
          'coveragePattern': 'split_streets',
        });
        expect(events.take(2), ['existing gate', 'server workload validation']);
        expect(ref.saved != null, accept);
        if (accept) expect(events.last, 'analyze saved area');
        expect(reads, 1);
        expect(t.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'invalid preview setting cannot save an older valid crew choice',
    (t) async {
      final ref = h.SavedDraftReference();
      var writes = 0;
      await h.surface(
        t,
        CampaignAreaScreen(
          campaignReference: ref,
          pendingZoneData: const {
            'zoneName': 'Fixture',
            'campaignId': 'fixture',
          },
          initialArea: c.geometry,
          tileProvider: h.MapTiles(),
          zoneEvidenceIdentity: () => 'fixture-owner/fixture-workspace',
          zoneEvidenceLoader: (input) async =>
              reviewEvidence(input['geometry']),
          saveTeamCapacity: (_) async {
            writes++;
            return true;
          },
        ),
      );
      await t.pump(const Duration(seconds: 1));
      await t.pumpAndSettle();
      await crew(t, 3);
      await t.enterText(
        find.byKey(const ValueKey('preview-marketer-count')),
        '',
      );
      await h.choose(t, 'Use This Area');
      await t.pumpAndSettle();
      expect(writes, 0);
      expect(ref.saved, isNull);
      expect(t.takeException(), isNull);
    },
  );

  for (final complete in [true, false]) {
    testWidgets(
      'complete=$complete keeps field coverage separate from whole session',
      (t) async {
        final data = reviewEvidence(c.geometry);
        data['teamTimeComparison']['fullAreaWorkloadEstablished'] = complete;
        await t.pumpWidget(
          c.page(ZoneIntelligenceSummary(data: data, geometry: c.geometry)),
        );
        expect(
          find.textContaining(
            complete
                ? 'supported mapped inventory; total session time is unverified'
                : 'Known-target subset only.',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('overall completion time remains unknown'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Requested session: 4 hr per person'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Planning duration with the 15-minute minimum'),
          findsNothing,
        );
      },
    );
  }
  testWidgets(
    'unavailable fields remain unknown with no diagnostic wall or zero claims',
    (t) async {
      final data = reviewEvidence(c.geometry)
        ..['status'] = 'unavailable'
        ..['mappedTargetCount'] = 0
        ..['propertyMix'] = null
        ..['teamTimeComparison'] = null
        ..['supportingStreetMeters'] = null
        ..['selectedAreaPropertyFacts'] = {'insideRecords': 8}
        ..['limitations'] = ['internal_provider_diagnostic'];
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: data, geometry: c.geometry)),
      );
      expect(find.text('Mapped target count unavailable'), findsOneWidget);
      expect(
        find.text('Construction-year coverage is unavailable.'),
        findsOneWidget,
      );
      expect(
        find.text('Construction-era summary is unavailable.'),
        findsOneWidget,
      );
      expect(find.textContaining('internal_provider_diagnostic'), findsNothing);
      expect(find.textContaining('0 mapped'), findsNothing);
      expect(find.textContaining('null of'), findsNothing);
    },
  );
  testWidgets(
    'real selectors use fixed evidence, all 1–4 rows and both modes without acquisition',
    (t) async {
      final data = reviewEvidence(c.geometry);
      final before = jsonEncode(data), geometryBefore = jsonEncode(c.geometry);
      var calls = 0;
      await t.pumpWidget(
        c.page(
          ZoneIntelligencePreview(
            geometry: c.geometry,
            campaignId: 'fixture',
            identity: () => 'owner/workspace',
            initialEvidence: data,
            loader: (_) async {
              calls++;
              throw StateError('No refetch');
            },
          ),
        ),
      );
      expect(selectedTime(t), '~3 hr 5 min');
      expect(
        find.text('Current setting: 2 marketers · Stay together'),
        findsOneWidget,
      );
      for (final n in [1, 2, 3, 4]) {
        await crew(t, n);
        expect(selectedTime(t), '~3 hr 5 min');
        await mode(t, 'split_streets');
        expect(
          selectedTime(t),
          ['~3 hr 5 min', '~1 hr 33 min', '~1 hr 6 min', '~49 min'][n - 1],
        );
        expect(
          find.textContaining('81 street-supported mapped targets included;'),
          findsOneWidget,
        );
        expect(find.textContaining('3 disconnected sections'), findsOneWidget);
        expect(
          find.textContaining('Full area completion time: Not established'),
          findsOneWidget,
        );
        await mode(t, 'stay_together');
      }
      await t.pump(const Duration(seconds: 1));
      expect(calls, 0);
      expect(jsonEncode(data), before);
      expect(jsonEncode(c.geometry), geometryBefore);
      expect(find.text('Save'), findsNothing);
      expect(find.text('Assign'), findsNothing);
    },
  );
  testWidgets(
    'existing larger headcount is retained, not clamped or assigned invented times',
    (t) async {
      final data = reviewEvidence(c.geometry, crew: 12);
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: data, geometry: c.geometry)),
      );
      expect(
        t
            .widget<TextFormField>(
              find.byKey(const ValueKey('preview-marketer-count')),
            )
            .controller!
            .text,
        '12',
      );
      expect(selectedTime(t), 'Not established');
      await mode(t, 'split_streets');
      expect(selectedTime(t), 'Not established');
      expect(find.textContaining('Your selection is retained'), findsOneWidget);
      await crew(t, 9007199254740991);
      expect(
        find.textContaining('Current setting: 9007199254740991 marketers'),
        findsOneWidget,
      );
      await t.enterText(
        find.byKey(const ValueKey('preview-marketer-count')),
        '0',
      );
      await t.pump();
      expect(
        find.text('Enter a positive whole number of marketers.'),
        findsOneWidget,
      );
      expect(selectedTime(t), 'Enter a valid crew size to see its estimate.');
    },
  );
  for (final invalid in [
    'targetSetDigest',
    'evidenceDigest',
    'workloadModelVersion',
    'sourceEvidenceVersion',
    'comparisonVersion',
    'geometryDigest',
    'coveragePattern',
    'marketerCount',
  ]) {
    testWidgets('mismatched row $invalid fails closed', (t) async {
      final data = reviewEvidence(c.geometry);
      final rows = data['teamTimeComparison']['rows'] as List;
      rows[1]['splitUp']['binding'][invalid] = 'old';
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: data, geometry: c.geometry)),
      );
      await mode(t, 'split_streets');
      expect(selectedTime(t), 'Not established');
    });
  }
  testWidgets(
    'V3 without bindings or inconsistent row coverage cannot supply a selected time',
    (t) async {
      final data = reviewEvidence(c.geometry);
      data['teamTimeComparison']['binding'] = null;
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: data, geometry: c.geometry)),
      );
      expect(selectedTime(t), 'Not established');
      final next = reviewEvidence(c.geometry);
      next['teamTimeComparison']['rows'][1]['coveredTargetCount'] = 80;
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: next, geometry: c.geometry)),
      );
      expect(selectedTime(t), 'Not established');
    },
  );
  testWidgets(
    'property denominators, plurality and technical nesting are truthful',
    (t) async {
      await t.pumpWidget(
        c.page(
          ZoneIntelligenceSummary(
            data: reviewEvidence(c.geometry),
            geometry: c.geometry,
          ),
        ),
      );
      expect(
        find.textContaining('760 property records fall within this boundary'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          '691 of 760 records have a usable construction year; 69 do not.',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('16 of 82 mapped observations'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'Largest recorded construction-year group: 1940–1959',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Predominantly'), findsNothing);
      expect(find.textContaining('official_account_dedup'), findsNothing);
      await t.ensureVisible(find.text('About these estimates'));
      await t.tap(find.text('About these estimates'));
      await t.pumpAndSettle();
      for (final label in [
        'What is included',
        'What is still missing',
        'Where the information comes from',
        'What to check before starting',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.textContaining('September 25, 2026'), findsOneWidget);
      expect(
        find.textContaining('Record source date: Not supplied'),
        findsOneWidget,
      );
      expect(find.textContaining('official_account_dedup'), findsNothing);
      await t.ensureVisible(find.text('Technical source details'));
      await t.tap(find.text('Technical source details'));
      await t.pumpAndSettle();
      expect(find.textContaining('official_account_dedup'), findsOneWidget);
      expect(find.text('targetSetDigest: fixture-targets'), findsOneWidget);
      expect(find.textContaining('2026-10-01T10:31:24Z'), findsOneWidget);
    },
  );
  testWidgets(
    'response replacement resets local choices and drops old model rows',
    (t) async {
      final first = reviewEvidence(c.geometry);
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: first, geometry: c.geometry)),
      );
      await crew(t, 4);
      await mode(t, 'split_streets');
      expect(selectedTime(t), '~49 min');
      final next = reviewEvidence(c.geometry, crew: 3);
      next['teamTimeComparison']['binding']['workloadModelVersion'] =
          'new-model';
      await t.pumpWidget(
        c.page(ZoneIntelligenceSummary(data: next, geometry: c.geometry)),
      );
      expect(
        find.text('Current setting: 3 marketers · Stay together'),
        findsOneWidget,
      );
      expect(selectedTime(t), 'Not established');
    },
  );
  testWidgets(
    'rapid local choices survive harmless parent rebuild, old workspace response cannot reappear',
    (t) async {
      var owner = 'first';
      final old = Completer<Map<String, dynamic>>();
      final current = Completer<Map<String, dynamic>>();
      var calls = 0;
      Widget preview() => c.page(
        ZoneIntelligencePreview(
          geometry: c.geometry,
          campaignId: 'fixture',
          identity: () => owner,
          loader: (_) => ++calls == 1 ? old.future : current.future,
        ),
      );
      await t.pumpWidget(preview());
      await t.pump(const Duration(milliseconds: 501));
      owner = 'second';
      await t.pumpWidget(preview());
      await t.pump(const Duration(milliseconds: 501));
      current.complete(reviewEvidence(c.geometry));
      await t.pump();
      await crew(t, 1);
      await crew(t, 3);
      await crew(t, 4);
      await mode(t, 'split_streets');
      old.complete(reviewEvidence(c.geometry, crew: 1));
      await t.pump();
      await t.pumpWidget(preview());
      await t.pump();
      expect(selectedTime(t), '~49 min');
      expect(calls, 2);
    },
  );
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      '320px ${scale}x selectors expose selected state and keyboard activation',
      (t) async {
        await t.binding.setSurfaceSize(const Size(320, 900));
        addTearDown(() => t.binding.setSurfaceSize(null));
        await t.pumpWidget(
          c.page(
            ZoneIntelligenceSummary(
              data: reviewEvidence(c.geometry),
              geometry: c.geometry,
            ),
            scale: scale,
          ),
        );
        final semantics = t.ensureSemantics();
        try {
          await mode(t, 'split_streets');
          expect(
            t
                .widget<RadioListTile<String>>(
                  find.byKey(const ValueKey('preview-mode-split_streets')),
                )
                .selected,
            true,
          );
          expect(
            t.getSemantics(
              find.byKey(const ValueKey('preview-mode-split_streets')),
            ),
            matchesSemantics(
              isChecked: true,
              hasCheckedState: true,
              hasSelectedState: true,
              isSelected: true,
              isEnabled: true,
              isFocusable: true,
              isInMutuallyExclusiveGroup: true,
              hasEnabledState: true,
              hasTapAction: true,
              hasFocusAction: true,
              label: 'Split up — cover different properties',
            ),
          );
          await crew(t, 3);
          final target = t.element(
            find.byKey(const ValueKey('preview-mode-split_streets')),
          );
          bool focusOnTarget() {
            final focused =
                FocusManager.instance.primaryFocus?.context as Element?;
            var found = identical(focused, target);
            focused?.visitAncestorElements((e) {
              found |= identical(e, target);
              return !found;
            });
            return found;
          }

          for (var i = 0; i < 12 && !focusOnTarget(); i++) {
            await t.sendKeyEvent(LogicalKeyboardKey.tab);
            await t.pump();
          }
          expect(focusOnTarget(), true);
          await t.sendKeyEvent(LogicalKeyboardKey.arrowDown);
          await t.pump();
          expect(
            t
                .widget<RadioListTile<String>>(
                  find.byKey(const ValueKey('preview-mode-stay_together')),
                )
                .selected,
            true,
          );
          expect(selectedTime(t), '~3 hr 5 min');
          expect(t.takeException(), isNull);
        } finally {
          semantics.dispose();
        }
      },
    );
  }
  testWidgets(
    'actual editor switches locally then Cancel/reopen restores original inputs with no record calls',
    (t) async {
      final reference = h.DraftReference();
      var reads = 0;
      final original = {
        'sessionHours': 4,
        'marketerCount': 2,
        'coveragePattern': 'stay_together',
      };
      final before = jsonEncode(original);
      await h.surface(
        t,
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              child: const Text('Open preview'),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => CampaignAreaScreen(
                    campaignReference: reference,
                    pendingZoneData: const {
                      'campaignId': 'fixture',
                      'zoneName': 'Fixture',
                    },
                    initialArea: h.glenBurnie.geometry,
                    tileProvider: h.MapTiles(),
                    teamCapacity: original,
                    zoneEvidenceIdentity: () => 'owner/workspace',
                    zoneEvidenceLoader: (input) async {
                      reads++;
                      expect(input['teamCapacity'], original);
                      return reviewEvidence(input['geometry']);
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await h.choose(t, 'Open preview');
      await t.pump(const Duration(milliseconds: 700));
      await t.pump();
      expect(selectedTime(t), '~3 hr 5 min');
      final originalBoundary = h
          .boundary(t)
          .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
          .toList();
      await crew(t, 4);
      await mode(t, 'split_streets');
      expect(selectedTime(t), '~49 min');
      expect(
        CampaignAreaGeometry.savedDigest(
          h
              .boundary(t)
              .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
              .toList(),
        ),
        CampaignAreaGeometry.savedDigest(originalBoundary),
      );
      expect(reads, 1);
      expect(reference.calls, 0);
      await h.choose(t, 'Cancel');
      await t.pump(const Duration(milliseconds: 400));
      await h.choose(t, 'Open preview');
      await t.pump(const Duration(milliseconds: 700));
      await t.pump();
      expect(
        find.text('Current setting: 2 marketers · Stay together'),
        findsOneWidget,
      );
      expect(selectedTime(t), '~3 hr 5 min');
      expect(reference.calls, 0);
      expect(jsonEncode(original), before);
      await t.pumpWidget(const SizedBox());
    },
  );
}
