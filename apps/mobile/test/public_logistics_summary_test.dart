import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/public_logistics_summary.dart';

void main() {
  testWidgets(
    'coarse logistics explain the handoff without exposing private fields',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PublicLogisticsSummary(
              logistics: {
                'materialsRequired': true,
                'postalCode': '21061',
                'approximateDistanceMiles': 3,
                'estimatedTravelMinutes': 12,
                'accessStatus': 'restricted_or_uncertain',
                'location': 'PRIVATE ADDRESS',
                'instructions': 'PRIVATE CODE',
              },
            ),
          ),
        ),
      );
      expect(find.text('Approximate area: ZIP 21061'), findsOneWidget);
      expect(find.textContaining('after assignment'), findsOneWidget);
      expect(find.textContaining('Confirm authorized access'), findsOneWidget);
      expect(find.textContaining('PRIVATE'), findsNothing);
    },
  );
  testWidgets('unknown travel does not become a fabricated zero', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PublicLogisticsSummary(logistics: {'materialsRequired': true}),
        ),
      ),
    );
    expect(find.textContaining('miles'), findsNothing);
    expect(find.textContaining('minutes'), findsNothing);
    expect(find.textContaining('after assignment'), findsOneWidget);
  });
}
