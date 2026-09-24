import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';
import 'package:flutter_app/screens/preferences/market_state_screen.dart';

void main() {
  testWidgets(
    'regional zero, unavailable and small-area estimates retain scope on narrow large-text layouts',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final count in <int?>[0, null, 1402]) {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(1.4)),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: ZoneIntelligenceCard(
                    zoneName: 'Fixture',
                    data: {
                      'targetPlanning': {
                        'status': count == null ? 'partial' : 'complete',
                        'sourceVersion': 'ACS_2024_5YR_B25034',
                        'censusGeographiesUsed': ['a', 'a', 'b'],
                        'residentialProperties': count,
                        'checkedAtMs': 100,
                      },
                    },
                  ),
                ),
              ),
            ),
          ),
        );
        expect(
          find.text(
            count == 0
                ? '0 units'
                : count == null
                ? 'Unavailable'
                : '1,402 units',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('2 Census block groups'), findsOneWidget);
        expect(
          find.textContaining('includes locations outside'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      }
    },
  );
  testWidgets(
    'completed Census planning takes precedence over unavailable exact-home legacy field',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ZoneIntelligenceCard(
                zoneName: 'Zone 1',
                data: {
                  'homeCountStatus': 'unavailable',
                  'analysisStatus': 'complete',
                  'targetPlanning': {
                    'status': 'complete',
                    'metric':
                        'Housing units in intersecting Census block groups',
                    'source': 'U.S. Census Bureau ACS 5-Year',
                    'dataDate': '2024',
                    'sourceVersion': 'ACS_2024_5YR_B25034',
                    'boundaryVersion':
                        'TIGERweb_tigerWMS_ACS2024_BlockGroups_Layer10',
                    'censusGeographiesUsed': [
                      '1',
                      '2',
                      '3',
                      '4',
                      '5',
                      '6',
                      '7',
                      '8',
                      '9',
                    ],
                    'areaSquareMeters': 97263807,
                    'residentialProperties': 6237,
                    'materialsAvailable': 500,
                    'checkedAtMs': 100,
                    'limitations': [
                      'Counts include housing units outside the selected polygon.',
                    ],
                    'workloadReason':
                        'Plan smaller worker-sized Zones; keep the saved territory.',
                  },
                },
              ),
            ),
          ),
        ),
      );
      expect(find.text('6,237 units'), findsOneWidget);
      expect(find.text('Regional housing estimate'), findsOneWidget);
      expect(find.textContaining('9 Census block groups'), findsOneWidget);
      expect(find.textContaining('includes locations outside'), findsOneWidget);
      await tester.tap(find.text('Census source and uncertainty details'));
      await tester.pumpAndSettle();
      expect(find.textContaining('2020–2024'), findsOneWidget);
      expect(
        find.textContaining('Margin-of-error variables were not retained'),
        findsOneWidget,
      );
      expect(find.text('500'), findsOneWidget);
      expect(find.text('Requires route/stop review'), findsOneWidget);
      expect(find.text('Analyzing...'), findsNothing);
      expect(find.text('Not assigned'), findsOneWidget);
    },
  );
  testWidgets(
    'pending saved target does not claim an analysis is still running',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ZoneIntelligenceCard(
              zoneName: 'Zone 1',
              data: {'homeCountStatus': 'pending', 'analysisStatus': 'waiting'},
            ),
          ),
        ),
      );
      expect(find.text('Analysis needed'), findsOneWidget);
      expect(find.text('Analyzing...'), findsNothing);
      expect(find.text('Not assigned'), findsOneWidget);
    },
  );
  testWidgets(
    'bounded planning reports metric source limitations and materials without inventing doors',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ZoneIntelligenceCard(
                zoneName: 'Zone 1',
                data: {
                  'targetPlanning': {
                    'status': 'partial',
                    'metric': 'Residential property records',
                    'source': 'Maryland Open Data',
                    'dataDate': '2024',
                    'residentialProperties': 42,
                    'materialsAvailable': 500,
                    'checkedAtMs': 100,
                    'limitations': ['Not accessible doors.'],
                  },
                },
              ),
            ),
          ),
        ),
      );
      expect(find.text('Residential property records'), findsOneWidget);
      expect(find.text('42'), findsOneWidget);
      expect(find.text('500'), findsOneWidget);
      expect(find.textContaining('Partial coverage'), findsOneWidget);
      expect(find.text('Not accessible doors.'), findsOneWidget);
      expect(find.text('Requires route/stop review'), findsOneWidget);
    },
  );
  testWidgets('state loading times out to an actionable retry route', (
    tester,
  ) async {
    final pending = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: MarketStatusCard(load: () => pending.future)),
      ),
    );
    await tester.pump(const Duration(seconds: 21));
    await tester.pump();
    expect(find.textContaining('Open Your state to retry'), findsOneWidget);
    expect(find.text('Checking state availability…'), findsNothing);
  });
}
