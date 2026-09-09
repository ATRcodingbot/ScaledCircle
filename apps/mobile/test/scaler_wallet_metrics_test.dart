import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/jobs/scaler_wallet_screen.dart';

Map<String, dynamic> summary({
  bool staging = true,
  bool approved = false,
  int payout = 0,
}) => {
  'currency': 'usd',
  'environment': staging ? 'staging' : 'production',
  'availableCents': approved ? 2064 : 264,
  'lifetimeCents': approved ? 2064 : 264,
  'awaitingReviewCents': approved ? 0 : 1800,
  'payoutPendingCents': payout,
  'cashout': {
    'eligible': false,
    'message': 'Cash out is not available for this account yet.',
  },
  'activity': [
    {
      'kind': approved ? 'approved' : 'awaiting_review',
      'title': staging
          ? 'iOS Physical Certification — Retest V3'
          : 'Garden campaign',
      'amountCents': 1800,
      'coveragePercentage': 98.58515,
      'baseCents': 1500,
      'bonusCents': 300,
    },
  ],
};
void main() {
  testWidgets(
    'historical estimate never implies the full accepted base was posted or calculated',
    (tester) async {
      final data = summary();
      (data['activity'] as List).first['amountCents'] = 311;
      (data['activity'] as List).first['bonusCents'] = 0;
      data['awaitingReviewCents'] = 311;
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerWalletScreen(
            staging: true,
            loadSummary: () async => data,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Previous estimate. Final payment requires review.'),
        150,
      );
      expect(find.text('\$15.00 base + \$0.00 bonus'), findsNothing);
      expect(find.text('\$3.11 expected'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  for (final width in [320.0, 390.0, 1024.0]) {
    testWidgets('available balance is primary; plain states at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerWalletScreen(
            staging: true,
            loadSummary: () async => summary(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Earnings'), findsOneWidget);
      expect(find.text('Verified Earnings'), findsNothing);
      expect(find.text('Total Recorded'), findsNothing);
      expect(find.text('TEST display only'), findsNothing);
      expect(find.text('Staging · Test funds only'), findsOneWidget);
      final hero = tester.widget<Text>(
        find.byKey(const ValueKey('available-balance')),
      );
      expect(hero.data, '\$2.64');
      expect(hero.style!.fontSize, 44);
      expect(
        tester.getTopLeft(find.byKey(const ValueKey('available-balance'))).dy,
        lessThan(tester.getTopLeft(find.text('Lifetime Earnings')).dy),
      );
      expect(find.text('\$18.00 expected'), findsOneWidget);
      expect(find.text('Payout Pending'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Cash Out'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets(
    'embedded screen has only parent page title; production has no test copy',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(title: const Text('Earnings')),
            body: ScalerWalletScreen(
              embedded: true,
              staging: false,
              loadSummary: () async => summary(staging: false),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Earnings'), findsOneWidget);
      expect(
        find.textContaining(RegExp('staging|test', caseSensitive: false)),
        findsNothing,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'server approval snapshot replaces pending state without local addition or duplication',
    (tester) async {
      var approved = false;
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerWalletScreen(
            staging: true,
            loadSummary: () async => summary(approved: approved),
          ),
        ),
      );
      await tester.pumpAndSettle();
      approved = true;
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('available-balance')))
            .data,
        '\$20.64',
      );
      expect(find.text('\$18.00 expected'), findsNothing);
      expect(find.text('+\$18.00'), findsOneWidget);
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('available-balance')))
            .data,
        '\$20.64',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'payout pending is distinct; read failure shows Retry, never invented zero',
    (tester) async {
      var fail = true;
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerWalletScreen(
            staging: true,
            loadSummary: () async {
              if (fail) throw Exception('read failed');
              return summary(payout: 500);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byKey(const ValueKey('available-balance')), findsNothing);
      fail = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Payout Pending'), findsOneWidget);
      expect(find.text('\$5.00'), findsOneWidget);
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('available-balance')))
            .data,
        '\$2.64',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
