import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/starter_intro_offer_card.dart';

void main() {
  Future<void> mount(
    WidgetTester tester,
    IntroOfferCall call, {
    Future<bool> Function(Uri)? open,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: StarterIntroOfferCard(
              businessId: 'test-owner',
              call: call,
              openCheckout: open,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('non-pilot customers do not see the introductory offer', (
    tester,
  ) async {
    await mount(tester, (_, _) async => {'eligible': false});
    expect(find.text('Try your first month for \$1'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
  });
  testWidgets(
    'verified offer shows renewal terms and requires a second action to open Checkout',
    (tester) async {
      var creates = 0;
      var opens = 0;
      await mount(
        tester,
        (name, data) async {
          if (name == 'previewBusinessMembershipChange') {
            return {'eligible': true};
          }
          creates++;
          expect(data, {
            'businessId': 'test-owner',
            'offerId': 'starter_intro_1_dollar_v1',
            'plan': 'starter',
          });
          return {
            'offerId': 'starter_intro_1_dollar_v1',
            'amountDueCents': 100,
            'monthlyCents': 9900,
            'discountCents': 9800,
            'renewalPreviewAtMs': DateTime(2026, 10, 10).millisecondsSinceEpoch,
            'url': 'https://checkout.stripe.com/c/pay/test',
          };
        },
        open: (_) async {
          opens++;
          return true;
        },
      );
      expect(find.textContaining('Then \$99/month'), findsOneWidget);
      await tester.tap(find.text('Review \$1 Starter offer'));
      await tester.pumpAndSettle();
      expect(creates, 1);
      expect(opens, 0);
      expect(find.textContaining('Today: \$1.00'), findsOneWidget);
      expect(find.textContaining('Expected renewal:'), findsOneWidget);
      await tester.ensureVisible(find.text('Open secure Checkout — \$1 today'));
      await tester.tap(find.text('Open secure Checkout — \$1 today'));
      expect(opens, 1);
      expect(creates, 1);
    },
  );
  testWidgets('wrong amount is held and never redirects or retries creation', (
    tester,
  ) async {
    var calls = 0;
    await mount(tester, (name, _) async {
      if (name == 'previewBusinessMembershipChange') return {'eligible': true};
      calls++;
      return {'amountDueCents': 9900};
    });
    await tester.tap(find.text('Review \$1 Starter offer'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Checkout needs verification.'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    expect(calls, 1);
  });
}
