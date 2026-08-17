import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart';
import 'package:flutter_app/services/platform_billing_service.dart';

void main() {
  CampaignCostQuote quote({required double worker, int rateBps = 2000}) {
    final workerCents = (worker * 100).round();
    final feeCents = ((workerCents * rateBps + 5000) / 10000).floor();
    return CampaignCostQuote(
      workerCompensationCents: workerCents,
      platformFeeRateBps: rateBps,
      platformFeeCents: feeCents,
      estimatedTotalCents: workerCents + feeCents,
      currency: 'usd',
      policyVersion: 'CampaignCostQuoteV1',
    );
  }

  Widget app(Future<CampaignCostQuote> Function(double) loader) => MaterialApp(
    home: FlyerCampaignScreen(
      quoteLoader: loader,
      loadPreferences: () async => <String, dynamic>{},
    ),
  );

  Future<void> enterCompensation(
    WidgetTester tester, {
    String pay = '50',
    String bonus = '25',
  }) async {
    await tester.dragUntilVisible(
      find.text('Compensation'),
      find.byType(ListView),
      const Offset(0, -500),
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Base Pay per Scaler (\$)'),
      pay,
    );
    if (bonus.isNotEmpty) {
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Completion Bonus per Scaler (\$)'),
        bonus,
      );
    }
  }

  test('CampaignCostQuote validates the callable response contract', () {
    final value = CampaignCostQuote.fromCallable({
      'workerAmountCents': 7500,
      'platformFeeRateBasisPoints': 2000,
      'platformFeeCents': 1500,
      'businessChargeCents': 9000,
      'currency': 'usd',
      'quoteVersion': 1,
    });
    expect(value.workerCompensation, 75);
    expect(value.platformFee, 15);
    expect(value.estimatedTotal, 90);
    expect(value.platformFeeRateBps, 2000);
    expect(value.policyVersion, 'CampaignCostQuoteV1');
  });

  testWidgets('authoritative quote shows pay bonus dynamic rate and total', (
    tester,
  ) async {
    final requested = <double>[];
    await tester.pumpWidget(
      app((worker) async {
        requested.add(worker);
        return quote(worker: worker, rateBps: 1750);
      }),
    );
    await enterCompensation(tester);
    expect(find.text('Updating total...'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    await tester.dragUntilVisible(
      find.text('Campaign Cost'),
      find.byType(ListView),
      const Offset(0, -400),
    );
    expect(requested, [75]);
    expect(find.text('SCALER PAY'), findsOneWidget);
    expect(find.text('COMPLETION BONUS'), findsOneWidget);
    expect(find.text(r'$50.00'), findsOneWidget);
    expect(find.text(r'$25.00'), findsOneWidget);
    expect(find.text('PLATFORM FEE (17.5%)'), findsOneWidget);
    expect(find.text(r'$13.13'), findsOneWidget);
    expect(find.text('ESTIMATED TOTAL'), findsOneWidget);
    expect(find.text(r'$88.13'), findsOneWidget);
    expect(
      find.textContaining('confirmed again before funding'),
      findsOneWidget,
    );
  });

  testWidgets('pay edits are debounced and preserve quote while updating', (
    tester,
  ) async {
    final requested = <double>[];
    await tester.pumpWidget(
      app((worker) async {
        requested.add(worker);
        return quote(worker: worker);
      }),
    );
    await enterCompensation(tester, bonus: '');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    expect(find.text('PLATFORM FEE (20%)'), findsOneWidget);

    final pay = find.widgetWithText(TextFormField, 'Base Pay per Scaler (\$)');
    await tester.enterText(pay, '6');
    await tester.enterText(pay, '60');
    expect(find.text('Updating total...'), findsOneWidget);
    expect(find.text('PLATFORM FEE (20%)'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    expect(requested, [50, 60]);
    expect(find.text(r'$72.00'), findsOneWidget);
  });

  testWidgets('quote failure never fabricates a fee and supports retry', (
    tester,
  ) async {
    var fail = true;
    await tester.pumpWidget(
      app((worker) async {
        if (fail) throw Exception('offline');
        return quote(worker: worker);
      }),
    );
    await enterCompensation(tester, bonus: '');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pump();
    expect(
      find.text("We couldn't update the campaign total right now."),
      findsOneWidget,
    );
    expect(find.byKey(const Key('campaign-platform-fee')), findsNothing);
    expect(find.byKey(const Key('campaign-estimated-total')), findsNothing);
    fail = false;
    await tester.tap(find.text('Try Again'));
    await tester.pump();
    expect(find.text('PLATFORM FEE (20%)'), findsOneWidget);
    expect(find.text(r'$60.00'), findsOneWidget);
  });

  test('campaign UI has no hardcoded fee and review remains authoritative', () {
    final source = File(
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    ).readAsStringSync();
    expect(source, isNot(contains('PLATFORM FEE (20%)')));
    expect(source, contains('platformFeeRateBps'));
    expect(source, contains('fundCampaignWithCard'));
    expect(source, isNot(contains("'platformFeeCents':")));
    expect(source, isNot(contains("'businessChargeCents':")));

    final reviewSource = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();
    expect(reviewSource, contains('_billingService.campaignCostQuote(workerBudget)'));
    expect(reviewSource, contains('confirmed again before funding'));
    expect(reviewSource, contains('fundCampaignWithCard'));
    expect(reviewSource, isNot(contains('PLATFORM FEE (20%)')));
  });
}
