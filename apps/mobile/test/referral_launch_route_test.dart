import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/screens/public/referral_program_screen.dart';
import 'package:flutter_app/navigation/app_router.dart';

void main() {
  testWidgets(
    'public Private Beta policy has Back and never enrolls or pays by viewing',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const MaterialApp(home: ReferralProgramScreen()));
      expect(find.byType(BackButton), findsOneWidget);
      expect(
        find.textContaining('Viewing this page does not enroll you'),
        findsOneWidget,
      );
      expect(find.byType(Checkbox), findsNothing);
      expect(find.text('Cash Out'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'production and staging cold launch preserve referral policy, portal and coded signup destination',
    () {
      for (final path in [
        '/referrals',
        '/referral-portal',
        '/create-account?role=scaler',
      ]) {
        for (final host in [
          'scaledcircle-staging.web.app',
          'scaledcircle.com',
        ]) {
          final uri = Uri.parse('https://$host/?ref=ABCD2345#$path');
          expect(
            initialReferralRoute(uri, enabled: true)?.path,
            path.split('?').first,
          );
          expect(initialReferralRoute(uri, enabled: false), isNull);
        }
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
