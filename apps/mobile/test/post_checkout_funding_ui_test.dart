import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Stripe return route listens to authoritative campaign funding', () {
    final mainSource = File('lib/main.dart').readAsStringSync();
    final returnSource = File(
      'lib/screens/campaigns/campaign_funding_return_screen.dart',
    ).readAsStringSync();
    expect(mainSource, contains('AppRoutes.campaignFundingReturn'));
    expect(returnSource, contains("collection('campaigns')"));
    expect(returnSource, contains('.snapshots()'));
    expect(returnSource, contains("fundingStatus == 'funded'"));
    expect(returnSource, contains('Confirming payment...'));
    expect(returnSource, contains('Payment confirmed'));
    expect(returnSource, contains('Campaign funded'));
    expect(returnSource, contains('your browser return does not mark the campaign funded'));
  });

  test('Checkout return includes campaign identity but no payment authority', () {
    final backend = File('../../functions-campaign-funding/index.js')
        .readAsStringSync();
    expect(
      backend,
      contains('campaign-funding-return?status=processing&campaignId='),
    );
    expect(backend, isNot(contains('status=funded')));
    expect(backend, isNot(contains('paymentStatus=paid')));
  });

  test('funded Campaign Details avoids stale quote and exposes publish step', () {
    final details = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();
    expect(details, contains("fundingStatus == 'funded'"));
    expect(details, contains("title: Text('Payment confirmed')"));
    expect(details, contains("'Publish Funded Campaign'"));
    expect(details, contains('publishFundedCampaign'));
  });
}
