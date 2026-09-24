import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/material_work_scope.dart';
import 'package:flutter_app/widgets/campaign_planning_cost.dart';
import 'package:flutter_app/services/platform_billing_service.dart';

CampaignCostQuote quote(double worker) => CampaignCostQuote(
  workerCompensationCents: (worker * 100).round(),
  platformFeeRateBps: 2000,
  platformFeeCents: (worker * 20).round(),
  estimatedTotalCents: (worker * 120).round(),
  currency: 'usd',
  policyVersion: 'test',
  quoteDigest: '',
);
Widget app(Widget child) => MaterialApp(
  home: Scaffold(body: SingleChildScrollView(child: child)),
);
void main() {
  test(
    'sample material quantity does not become inventory or approved work',
    () {
      final value = materialWorkScopeSummary({'materialQuantity': 500});
      expect(value, contains('Entered material quantity: 500'));
      expect(value, contains('does not confirm inventory'));
      expect(value, contains('not established by the quantity'));
      expect(value, contains('No coverage percentage'));
    },
  );
  testWidgets(
    'planning quote renders 120 with scope caveat, error is retryable, stale total removed',
    (tester) async {
      var calls = 0;
      final pending = Completer<CampaignCostQuote>();
      Future<CampaignCostQuote> load(double amount) async {
        calls++;
        if (calls == 1) throw Exception('offline');
        if (amount == 100) return quote(amount);
        return pending.future;
      }

      await tester.pumpWidget(
        app(CampaignPlanningCost(workerBudget: 100, load: load)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry planning quote'), findsOneWidget);
      await tester.tap(find.text('Retry planning quote'));
      await tester.pumpAndSettle();
      expect(find.text('Planning total: \$120.00'), findsOneWidget);
      expect(
        find.textContaining('does not price or promise coverage'),
        findsOneWidget,
      );
      await tester.pumpWidget(
        app(CampaignPlanningCost(workerBudget: 200, load: load)),
      );
      await tester.pump();
      expect(find.text('Planning total: \$120.00'), findsNothing);
      await tester.pump(const Duration(seconds: 26));
      await tester.pump();
      expect(find.text('Retry planning quote'), findsOneWidget);
      pending.complete(quote(200));
      await tester.pump();
    },
  );
}
