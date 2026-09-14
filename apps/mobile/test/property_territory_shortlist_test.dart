import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/property_intelligence_service.dart';
import 'package:flutter_app/widgets/property_territory_shortlist.dart';

void main() {
  testWidgets(
    'large text refresh replaces fit, sampling and selection labels',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      Future<void> show(
        Map<String, dynamic> territory,
        Map<String, dynamic> sampling,
        String? selectedId,
      ) async {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(390, 1000),
                textScaler: TextScaler.linear(2),
              ),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: PropertyTerritoryShortlist(
                    report: {'sampling': sampling},
                    recommendations: [territory],
                    selectedId: selectedId,
                    onSelect: (_) {},
                    onSave: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
      }

      await show(
        {
          'id': 'old',
          'name': 'Previous territory',
          'fit': 80,
          'fitLabel': 'High',
        },
        {'message': 'Examined the first candidate sample.'},
        'old',
      );
      expect(find.text('Planning fit: High'), findsOneWidget);
      expect(find.text('Planning fit score: 80 / 100'), findsNothing);
      expect(find.text('Selected on map'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await show(
        {'id': 'new', 'name': 'Current territory', 'fit': 65},
        {'message': 'Examined another candidate sample.'},
        null,
      );
      expect(find.text('Planning fit score: 65 / 100'), findsOneWidget);
      expect(find.text('Planning fit: High'), findsNothing);
      expect(find.textContaining('Previous territory'), findsNothing);
      expect(find.text('Examined the first candidate sample.'), findsNothing);
      expect(find.text('Examined another candidate sample.'), findsOneWidget);
      expect(
        find.textContaining('not every property or possible area'),
        findsOneWidget,
      );
      expect(find.text('Selected on map'), findsNothing);
      expect(find.text('View on map'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'saved-area requests use server scope and stable retry identity without client geometry',
    () {
      final all = PropertyIntelligenceService.buildSavedAreasRequest(
        objective: ' Roof repair ',
        requestId: 'retry-1',
      );
      expect(all, {
        'scope': 'saved_service_areas',
        'objective': 'Roof repair',
        'requestId': 'retry-1',
      });
      expect(
        PropertyIntelligenceService.buildSavedAreasRequest(
          objective: 'Roof repair',
          requestId: 'retry-1',
          savedAreaId: 'county-a',
        ),
        {...all, 'savedAreaId': 'county-a'},
      );
      expect(all.keys, isNot(contains('geometry')));
      expect(all.keys, isNot(contains('uid')));
      expect(
        PropertyIntelligenceService.buildExploratoryRequest([
          {'latitude': 39, 'longitude': -76},
        ], objective: 'Roof repair'),
        {
          'geometry': [
            {'latitude': 39.0, 'longitude': -76.0},
          ],
          'objective': 'Roof repair',
        },
      );
    },
  );

  for (final width in [390.0, 1100.0]) {
    testWidgets(
      'ranked server results select exact geometry and save only on explicit action at $width',
      (tester) async {
        await tester.binding.setSurfaceSize(Size(width, 1100));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final recommendation = <String, dynamic>{
          'id': 'rec-2',
          'rank': 2,
          'name': 'North territory',
          'fit': 'Strong',
          'geometry': [
            {'latitude': 39.0, 'longitude': -76.0},
            {'latitude': 39.1, 'longitude': -76.0},
            {'latitude': 39.0, 'longitude': -76.1},
          ],
          'analysis': {
            'analysisId': 'analysis-2',
            'geometryDigest': 'verified-digest',
          },
          'reasons': ['Older housing stock'],
          'limitations': ['Sampled coverage'],
          'status': 'recommended',
          'nextAction': 'Review the mapped area',
        };
        Map<String, dynamic>? selected, saved;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: PropertyTerritoryShortlist(
                  report: {
                    'summary': 'A ranked result',
                    'examinedCount': 7,
                    'remainingCandidateCount': 2,
                    'overlapsExcludedCount': 1,
                    'failedSectionCount': 1,
                  },
                  recommendations: [recommendation],
                  onSelect: (value) => selected = value,
                  onSave: (value) => saved = value,
                ),
              ),
            ),
          ),
        );
        expect(find.text('2. North territory'), findsOneWidget);
        expect(find.text('Sampled coverage'), findsOneWidget);
        expect(find.textContaining('1 sections unavailable'), findsOneWidget);
        expect(saved, isNull);
        await tester.tap(find.text('View on map'));
        expect(selected, same(recommendation));
        expect(selected!['analysis']['geometryDigest'], 'verified-digest');
        expect(saved, isNull);
        await tester.tap(find.text('Save Territory'));
        expect(saved, same(recommendation));
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('empty result is visible and pending save is disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PropertyTerritoryShortlist(
            report: const {},
            recommendations: const [],
            onSelect: (_) => fail('unexpected selection'),
            onSave: (_) => fail('unexpected save'),
          ),
        ),
      ),
    );
    expect(find.textContaining('No territories are available'), findsOneWidget);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PropertyTerritoryShortlist(
            report: const {},
            recommendations: const [
              {'id': 'rec', 'name': 'Area'},
            ],
            busy: true,
            onSelect: (_) {},
            onSave: (_) => fail('duplicate save'),
          ),
        ),
      ),
    );
    final button = tester.widget<TextButton>(
      find.widgetWithText(TextButton, 'Save Territory'),
    );
    expect(button.onPressed, isNull);
  });
}
