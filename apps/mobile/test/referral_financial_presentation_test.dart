import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/referral_financial_service.dart';
import 'package:flutter_app/widgets/referral_earnings_panel.dart';
import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter_app/navigation/startup_session_gate.dart';

class FakeReferralFinance implements ReferralFinancialGateway {
  int requests = 0;
  bool fail = false;
  Map<String, dynamic> data = {
    'pendingCents': 2990,
    'availableCents': 999,
    'paidCents': 0,
    'reservedCents': 0,
    'recipientReady': true,
    'executionEnabled': true,
    'history': <Map<String, dynamic>>[],
    'operations': <Map<String, dynamic>>[],
  };
  @override
  Future<Map<String, dynamic>> dashboard() async {
    if (fail) throw StateError('read failed');
    return data;
  }

  @override
  Future<String> setup() async => 'https://connect.stripe.com/setup/test';
  @override
  Future<void> cashOut(String requestId, int amountCents) async {
    requests++;
  }

  @override
  Future<void> reconcile(String operationId, {bool retry = false}) async {}
}

void main() {
  testWidgets(
    'held and below-minimum available stay distinct; no automatic payout',
    (tester) async {
      final service = FakeReferralFinance();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ReferralEarningsPanel(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Pending'), findsOneWidget);
      expect(find.text(r'$29.90'), findsOneWidget);
      expect(find.text(r'$9.99'), findsOneWidget);
      expect(
        find.text(
          'Cash out once your available referral balance reaches \$10.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Cash Out Referral Earnings'),
            )
            .onPressed,
        isNull,
      );
      expect(service.requests, 0);
    },
  );
  testWidgets(
    'cashout needs explicit confirmation and never labels the request paid',
    (tester) async {
      final service = FakeReferralFinance()..data['availableCents'] = 1000;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ReferralEarningsPanel(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Cash Out Referral Earnings'),
      );
      await tester.pumpAndSettle();
      expect(service.requests, 0);
      await tester.tap(find.text('Confirm cash out'));
      await tester.pumpAndSettle();
      expect(service.requests, 1);
      expect(find.text(r'$0.00'), findsOneWidget);
    },
  );
  testWidgets('failed authority read hides stale balances and gives Retry', (
    tester,
  ) async {
    final service = FakeReferralFinance()..fail = true;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: ReferralEarningsPanel(service: service)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Available'), findsNothing);
    expect(service.requests, 0);
  });
  testWidgets(
    'signed-out referral entry stays login-bound; eligible startup preserves the requested portal',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: StartupSessionGate(
            signedOut: const Text('Referral Login'),
            authenticatedChild: const Text('Referral Portal'),
            load: () async => {'signedIn': false},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Referral Login'), findsOneWidget);
      await tester.pumpWidget(
        MaterialApp(
          home: StartupSessionGate(
            key: UniqueKey(),
            signedOut: const Text('Referral Login'),
            authenticatedChild: const Text('Referral Portal'),
            load: () async => {
              'signedIn': true,
              'emailVerified': true,
              'workProfileComplete': true,
              'profile': {'role': 'scaler', 'active': true},
              'missingAgreements': <String>[],
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Referral Portal'), findsOneWidget);
    },
  );
  test('all referral milestones have an actual Referrals destination', () {
    for (final type in [
      'referral_signed_up',
      'referral_reward_earned',
      'referral_available',
      'referral_paid',
      'referral_adjusted',
    ]) {
      expect(
        notificationDestination({'type': type})?.route,
        '/referral-portal',
      );
    }
  });
}
