import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/scaler_wallet_metrics.dart';

void main() {
  for (final width in [320.0, 800.0]) {
    testWidgets(
      'separate TEST availability and campaign totals at width $width',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: Center(
                  child: SizedBox(
                    width: width,
                    child: const ScalerWalletMetrics(
                      testUnreservedBalance: 5,
                      pendingEarnings: 0,
                      recordedEarnings: 88.51,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(find.byType(Card), findsNWidgets(3));
        for (final text in [
          'TEST balance',
          'Pending',
          'Total Recorded',
          '\$5.00',
          '\$0.00',
          '\$88.51',
          'Unreserved TEST funds',
        ]) {
          expect(find.text(text), findsOneWidget);
        }
        expect(find.text('\$93.51'), findsNothing);
        expect(find.text('Available'), findsNothing);
        expect(tester.takeException(), isNull);
        final available = tester.getTopLeft(find.text('TEST balance'));
        final pending = tester.getTopLeft(find.text('Pending'));
        expect(pending.dy > available.dy, width < 480);
      },
    );
  }
  testWidgets(
    'without TEST fixture no cash-out availability is inferred from earnings',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ScalerWalletMetrics(
              pendingEarnings: 0,
              recordedEarnings: 88.51,
            ),
          ),
        ),
      );
      expect(find.text('TEST balance'), findsNothing);
      expect(find.text('\$88.51'), findsOneWidget);
    },
  );
}
