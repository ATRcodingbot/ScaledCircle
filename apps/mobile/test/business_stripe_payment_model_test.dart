import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('maintained Business funding has no credit purchase or legacy CTA', () {
    final dashboard = source('lib/screens/business/business_dashboard.dart');
    final creator = source('lib/screens/business/create_campaign_screen.dart');
    final flyer = source(
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    );
    final billing = source('lib/services/platform_billing_service.dart');
    final details = source('lib/screens/campaigns/campaign_details_screen.dart');

    final maintainedBusinessFunding =
        '$dashboard\n$creator\n$flyer\n$billing\n$details';
    expect(maintainedBusinessFunding, isNot(contains('Fund with Credits')));
    expect(maintainedBusinessFunding, isNot(contains('Buy Credits')));
    expect(maintainedBusinessFunding, isNot(contains('1 credit =')));
    expect(maintainedBusinessFunding, isNot(contains('1 credit equals')));
    expect(maintainedBusinessFunding, isNot(contains('purchaseCredits')));
    expect(
      maintainedBusinessFunding,
      isNot(contains("functionName: 'createCreditCheckoutSession'")),
    );
    expect(maintainedBusinessFunding, contains('fundCampaignWithCard'));
    expect(maintainedBusinessFunding, contains('Approve & Continue to Funding'));
  });

  test('Business refund UI uses real-payment language', () {
    final details = source('lib/screens/campaigns/campaign_details_screen.dart');
    expect(details, contains('returned to the original payment method'));
    expect(details, contains('Refund Processing'));
    expect(details, contains('CANCELED / REFUNDED'));
    expect(details, isNot(contains('Refund Credits')));
    expect(details, isNot(contains('Unlock Credits')));
  });

  test('subscriptions remain dollar-priced', () {
    final subscriptions = source(
      'lib/screens/business/subscription_screen.dart',
    );
    expect(subscriptions, contains('price: 99'));
    expect(subscriptions, contains('price: 299'));
    expect(subscriptions, contains('price: 499'));
    expect(subscriptions, isNot(contains('credits/month')));
  });

  test('Scaler wallet and earnings remain intact', () {
    final wallet = source('lib/screens/jobs/scaler_wallet_screen.dart');
    final dashboard = source(
      'lib/screens/scaler/dashboard/scaler_dashboard_screen.dart',
    );
    expect(wallet, contains('Scaler Wallet'));
    expect(wallet, contains('Verified Earnings'));
    expect(wallet, contains('Cash-out is not yet available'));
    expect(dashboard, contains('Wallet'));
    expect(dashboard, contains('View wallet'));
  });

  test('social ad spend and direct-mail policies stay distinct', () {
    final managedGrowth = source('lib/screens/business/managed_growth_screen.dart');
    final pricing = source('../../functions/managed_growth.js');
    expect(managedGrowth, contains('advertising spend'));
    expect(managedGrowth, contains('no percentage markup'));
    expect(managedGrowth, contains('20% management fee'));
    expect(pricing, contains('percentageBasisPoints: 2000'));
    expect(pricing, contains('vendorPrintingCents'));
    expect(pricing, contains('postageCents'));
    expect(pricing, contains('vendorFulfillmentCents'));
  });

  test('no maintained client calls legacy fundCampaign', () {
    final callers = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'))
        .where(
          (file) => RegExp(
            r"functionName:\s*'fundCampaign'",
          ).hasMatch(file.readAsStringSync()),
        )
        .toList();
    expect(callers, isEmpty);
  });
}
