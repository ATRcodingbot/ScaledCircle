import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_results_overview.dart';

void main() {
  testWidgets(
    'Results isolates inventory and never converts reserved budget to spend',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BusinessResultsOverview(
              campaigns: [
                {
                  'id': 'one',
                  'campaignName': 'Real campaign',
                  'status': 'active',
                  'budget': 999,
                },
              ],
              zones: [
                {
                  'id': 'zone-one',
                  'campaignId': 'one',
                  'zoneName': 'Reviewed work',
                  'reviewStatus': 'approved',
                },
                {
                  'id': 'other',
                  'campaignId': 'other',
                  'zoneName': 'Private other workspace',
                  'status': 'submitted',
                },
              ],
            ),
          ),
        ),
      );
      expect(find.text('Zones approved'), findsOneWidget);
      expect(find.text('Private other workspace'), findsNothing);
      expect(find.textContaining('999'), findsNothing);
      expect(
        find.textContaining('aggregate data not available'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(find.text('Real campaign'), 150);
      await tester.tap(find.text('Real campaign'));
      await tester.pumpAndSettle();
      expect(find.text('Approved work'), findsOneWidget);
      expect(find.text('Create Campaign'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Results narrow large text has truthful empty outcome state', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: const Scaffold(
          body: BusinessResultsOverview(campaigns: [], zones: []),
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.textContaining('No work outcomes yet'),
      200,
    );
    expect(tester.takeException(), isNull);
  });
}
