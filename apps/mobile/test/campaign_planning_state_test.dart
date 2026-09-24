import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';
import 'package:flutter_app/screens/preferences/market_state_screen.dart';

void main() {
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
      expect(find.text('6237'), findsOneWidget);
      expect(
        find.text('Housing units in intersecting Census block groups'),
        findsOneWidget,
      );
      expect(
        find.textContaining('U.S. Census Bureau ACS 5-Year'),
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
