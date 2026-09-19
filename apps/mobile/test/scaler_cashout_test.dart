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
  int setups = 0;
  Object? setupError;
  bool loseResponse = false;
  final List<bool> reconciliationRetries = [];
  String url = 'https://connect.stripe.com/setup/fixture';
  @override
  Future<Map<String, dynamic>> status() async => data;
  @override
  Future<Map<String, dynamic>> setup() async {
    setups++;
    if (setupError != null) throw setupError!;
    return {'url': url, 'mode': 'test'};
  }

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
    'ready zero-balance account keeps management but disables withdrawal',
    (tester) async {
      final service = FakeCashout()
        ..data = {
          'mode': 'live',
          'status': 'ready',
          'executionEnabled': true,
          'availableCents': 0,
          'setupRetryAllowed': true,
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ScalerCashoutCard(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Payouts ready'), findsOneWidget);
      expect(find.text(r'Available to cash out: $0.00'), findsOneWidget);
      expect(
        find.textContaining('after approved earnings exist'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Cash out'))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Manage payouts'),
            )
            .onPressed,
        isNotNull,
      );
      expect(service.requests, 0);
      expect(service.setups, 0);
    },
  );
  testWidgets(
    'production activation failure remains visible and disables another setup attempt',
    (tester) async {
      final service = FakeCashout()
        ..data = {
          'mode': 'live',
          'status': 'setup_unavailable',
          'setupRetryAllowed': false,
          'executionEnabled': true,
          'availableCents': 0,
          'setupMessage':
              "We couldn't start payout setup. ScaledCircle needs to resolve an activation issue with its payout provider. Your earnings are unchanged.",
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ScalerCashoutCard(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining("We couldn't start payout setup."),
        findsOneWidget,
      );
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Payout setup unavailable'),
            )
            .onPressed,
        isNull,
      );
      expect(find.text('Set up payouts to get started.'), findsNothing);
      await tester.tap(find.text('Refresh'));
      await tester.pumpAndSettle();
      expect(service.setups, 0);
    },
  );
  testWidgets(
    'bound incomplete onboarding has a distinct continuation action',
    (tester) async {
      final service = FakeCashout()
        ..data = {
          'mode': 'live',
          'status': 'onboarding_incomplete',
          'setupRetryAllowed': true,
          'executionEnabled': true,
          'availableCents': 0,
          'setupMessage': 'Finish setting up payouts to receive your earnings.',
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ScalerCashoutCard(service: service)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Finish payout setup'), findsOneWidget);
      expect(
        find.text('Finish setting up payouts to receive your earnings.'),
        findsOneWidget,
      );
      expect(service.setups, 0);
    },
  );

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
  test(
    'production selects LIVE service while TEST remains explicitly gated',
    () {
      const environment = String.fromEnvironment('APP_ENV');
      if (environment == 'production') {
        expect(ScalerCashoutService.enabled, isTrue);
      } else if (environment == 'staging') {
        expect(
          ScalerCashoutService.enabled,
          const bool.fromEnvironment('ENABLE_TEST_CASHOUT'),
        );
      }
    },
  );
  testWidgets(
    'LIVE cash-out requires explicit amount confirmation and never claims TEST or Paid while processing',
    (tester) async {
      final service = FakeCashout()
        ..data = {
          'mode': 'live',
          'status': 'ready',
          'executionEnabled': true,
          'availableCents': 300,
        };
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ScalerCashoutCard(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Cash Out'), findsOneWidget);
      expect(find.textContaining('No real bank deposit'), findsNothing);
      await tester.enterText(find.byType(TextField), '3');
      await tester.tap(find.text('Cash out'));
      await tester.pumpAndSettle();
      expect(service.requests, 0);
      expect(find.text('Cash out \$3.00?'), findsOneWidget);
      await tester.tap(find.text('Confirm cash out'));
      await tester.pumpAndSettle();
      expect(service.requests, 1);
      expect(find.text('Cash-out processing'), findsOneWidget);
      expect(find.text('Paid'), findsNothing);
    },
  );
  testWidgets(
    'narrow large-text LIVE waiting state has truthful feedback and no duplicate cash-out control',
    (tester) async {
      tester.view.physicalSize = const Size(375, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = FakeCashout()
        ..data = {
          'mode': 'live',
          'status': 'ready',
          'executionEnabled': true,
          'availableCents': 0,
          'operation': {
            'operationId': 'op',
            'status': 'pending',
            'message': 'Waiting for funds',
          },
        };
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.8)),
            child: child!,
          ),
          home: Scaffold(
            body: SingleChildScrollView(
              child: ScalerCashoutCard(service: service),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Waiting for funds'), findsOneWidget);
      expect(find.text('Cash out'), findsNothing);
      expect(tester.takeException(), isNull);
      expect(service.requests, 0);
    },
  );
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
