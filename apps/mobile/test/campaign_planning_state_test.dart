import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';
import 'package:flutter_app/screens/preferences/market_state_screen.dart';

void main() {
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
