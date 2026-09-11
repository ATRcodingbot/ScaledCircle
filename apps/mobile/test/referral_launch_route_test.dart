import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/screens/public/referral_program_screen.dart';
import 'package:flutter_app/navigation/app_router.dart';

void main() {
  testWidgets(
    'public preview has Back and does not offer enrollment or payment',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const MaterialApp(home: ReferralProgramScreen()));
      expect(find.byType(BackButton), findsOneWidget);
      expect(
        find.textContaining('not generally available yet'),
        findsOneWidget,
      );
      expect(find.byType(Checkbox), findsNothing);
      expect(find.text('Cash Out'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'staging cold launch preserves referral policy, portal and coded signup destination',
    () {
      for (final path in [
        '/referrals',
        '/referral-portal',
        '/create-account?role=scaler',
      ]) {
        final uri = Uri.parse(
          'https://scaledcircle-staging.web.app/?ref=ABCD2345#$path',
        );
        expect(
          initialReferralRoute(uri, enabled: true)?.path,
          path.split('?').first,
        );
        expect(initialReferralRoute(uri, enabled: false), isNull);
      }
    },
  );
  test('referral entry rejects external and arbitrary destinations', () {
    for (final fragment in [
      'https://example.com/referrals',
      '//example.com/referrals',
      '/admin',
      '/create-account',
    ]) {
      expect(
        initialReferralRoute(
          Uri.parse('https://scaledcircle-staging.web.app/#$fragment'),
          enabled: true,
        ),
        isNull,
      );
    }
  });
}
