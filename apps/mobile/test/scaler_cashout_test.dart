import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/scaler_cashout_service.dart';
import 'package:flutter_app/widgets/scaler_cashout_card.dart';

class FakeCashout implements ScalerCashoutService {
  Map<String, dynamic> data = {
    'mode': 'test',
    'status': 'ready',
    'executionEnabled': true,
    'availableCents': 1000,
  };
  final List<String> ids = [];
  int requests = 0;
  bool loseResponse = false;
  final List<bool> reconciliationRetries = [];
  String url = 'https://connect.stripe.com/setup/fixture';
  @override
  Future<Map<String, dynamic>> status() async => data;
  @override
  Future<Map<String, dynamic>> setup() async => {'url': url, 'mode': 'test'};
  @override
  Future<Map<String, dynamic>> request(
    String requestId,
    int amountCents,
  ) async {
    requests++;
    ids.add(requestId);
    if (loseResponse) throw StateError('Lost response');
    data = {
      ...data,
      'operation': {'operationId': 'fixture', 'status': 'pending'},
    };
    return {'mode': 'test', 'status': 'pending'};
  }

  @override
  Future<Map<String, dynamic>> reconcile(
    String operationId, {
    bool retry = false,
  }) async {
    reconciliationRetries.add(retry);
    return {'mode': 'test'};
  }
}

void main() {
  testWidgets(
    'failed payout stays reserved and checking status never retries provider creation',
    (tester) async {
      final service = FakeCashout()
        ..data['operation'] = {
          'operationId': 'fixture',
          'status': 'needs_attention',
          'payoutFailed': true,
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ScalerCashoutCard(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Cash-out failed. Funds remain reserved.'),
        findsOneWidget,
      );
      expect(find.text('Payouts ready'), findsOneWidget);
      expect(find.textContaining('Payouts need attention'), findsNothing);
      expect(find.text('Cash out'), findsNothing);
      await tester.tap(find.text('Check status'));
      await tester.pumpAndSettle();
      expect(service.reconciliationRetries, [false]);
      expect(service.requests, 0);
    },
  );
  test('amount uses integer cents and rejects invalid or excessive values', () {
    expect(ScalerCashoutService.parseCents('5.01'), 501);
    for (final value in ['0', '-1', '1.001', '1e2', '100.01', 'NaN']) {
      expect(ScalerCashoutService.parseCents(value), isNull);
    }
  });
  test('production cannot enable TEST cash-out', () {
    const environment = String.fromEnvironment('APP_ENV');
    if (environment == 'production') {
      expect(ScalerCashoutService.enabled, isFalse);
    } else if (environment == 'staging') {
      expect(ScalerCashoutService.enabled, const bool.fromEnvironment('ENABLE_TEST_CASHOUT'));
    }
  });
  testWidgets(
    'ready Wallet cash-out validates balance and reuses request ID after lost response',
    (tester) async {
      final service = FakeCashout()..loseResponse = true;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ScalerCashoutCard(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Payouts ready'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '11');
      await tester.tap(find.text('Cash out'));
      await tester.pumpAndSettle();
      expect(service.requests, 0);
      await tester.enterText(find.byType(TextField), '5');
      await tester.tap(find.text('Cash out'));
      await tester.pumpAndSettle();
      expect(find.text('Payouts ready'), findsOneWidget);
      expect(find.textContaining('Payouts need attention'), findsNothing);
      service.loseResponse = false;
      await tester.tap(find.text('Cash out'));
      await tester.pumpAndSettle();
      expect(service.ids[0], service.ids[1]);
      expect(find.text('Cash-out processing'), findsOneWidget);
      expect(find.text('Cash out'), findsNothing);
    },
  );
  testWidgets('setup opens Stripe-hosted onboarding only', (tester) async {
    final service = FakeCashout()
      ..data = {'mode': 'test', 'status': 'not_setup'};
    Uri? opened;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ScalerCashoutCard(
            service: service,
            openOnboarding: (url) async {
              opened = url;
              return true;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Set up payouts'));
    await tester.pumpAndSettle();
    expect(opened?.host, 'connect.stripe.com');
    opened = null;
    service.url = 'https://example.invalid/bank';
    await tester.tap(find.text('Set up payouts'));
    await tester.pumpAndSettle();
    expect(opened, isNull);
  });
  testWidgets('completed and failed states are simple customer labels', (
    tester,
  ) async {
    for (final state in ['completed', 'failed']) {
      final service = FakeCashout()
        ..data = {
          'mode': 'test',
          'status': 'ready',
          'executionEnabled': true,
          'availableCents': 500,
          'operation': {'operationId': 'fixture', 'status': state},
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ScalerCashoutCard(key: ValueKey(state), service: service),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          state == 'completed'
              ? 'Completed'
              : 'Cash-out failed. Funds returned to your balance.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('acct_'), findsNothing);
    }
  });
  testWidgets(
    'healthy account with paused execution stays ready without attention warning',
    (tester) async {
      final service = FakeCashout()..data['executionEnabled'] = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ScalerCashoutCard(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Payouts ready'), findsOneWidget);
      expect(
        find.text('TEST cash-out is paused for certification.'),
        findsOneWidget,
      );
      expect(find.textContaining('Payouts need attention'), findsNothing);
      expect(find.text('Cash out'), findsNothing);
      expect(find.text('Manage payouts'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Manage payouts'),
            )
            .onPressed,
        isNotNull,
      );
      service.data['executionEnabled'] = true;
      await tester.tap(find.text('Refresh'));
      await tester.pumpAndSettle();
      expect(find.text('Cash out'), findsOneWidget);
      expect(
        find.text('TEST cash-out is paused for certification.'),
        findsNothing,
      );
    },
  );
  test(
    'LIVE account attention includes support without enabling LIVE execution',
    () {
      expect(
        ScalerCashoutService.attentionMessage('live'),
        contains('contact support@scaledcircle.com'),
      );
      expect(
        ScalerCashoutService.attentionMessage('test'),
        isNot(contains('contact support')),
      );
    },
  );
  testWidgets(
    'operation progress never labels the healthy payout account unhealthy',
    (tester) async {
      for (final state in ['pending', 'needs_attention', 'failed']) {
        final service = FakeCashout()
          ..data['operation'] = {'operationId': 'fixture', 'status': state};
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ScalerCashoutCard(key: ValueKey(state), service: service),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Payouts ready'), findsOneWidget);
        expect(find.text('Needs attention'), findsNothing);
        expect(find.textContaining('Payouts need attention'), findsNothing);
        expect(
          find.text(
            state == 'pending'
                ? 'Cash-out processing'
                : state == 'failed'
                ? 'Cash-out failed. Funds returned to your balance.'
                : 'Cash-out awaiting confirmation',
          ),
          findsOneWidget,
        );
      }
    },
  );
}
