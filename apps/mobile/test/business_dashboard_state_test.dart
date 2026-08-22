import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String dashboardSource;
  late String campaignAreaSource;
  late String createCampaignSource;

  setUpAll(() {
    dashboardSource = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    campaignAreaSource = File(
      'lib/screens/business/campaign_area_screen.dart',
    ).readAsStringSync();
    createCampaignSource = File(
      'lib/screens/business/create_campaign_screen.dart',
    ).readAsStringSync();
  });

  group('Business dashboard lifecycle and payment-model safety', () {
    test('weather initialization never returns a Future from setState', () {
      expect(dashboardSource, contains('Future<void> _loadWeather() async'));
      expect(dashboardSource, isNot(contains('setState(() async')));
      expect(dashboardSource, isNot(contains('setState(async')));
      expect(
        dashboardSource,
        isNot(contains('setState(() => _weather =')),
        reason:
            'Assigning a Future in an expression-bodied callback returns '
            'that Future to setState and triggers a Flutter framework error.',
      );
    });

    test('Business dashboard is Stripe-first and does not expose a wallet', () {
      expect(dashboardSource, contains('Campaign Payments'));
      expect(dashboardSource, contains('completed securely through Stripe'));
      expect(dashboardSource, isNot(contains('BusinessWalletScreen')));
      expect(dashboardSource, isNot(contains('Available Credits')));
      expect(dashboardSource, isNot(contains('Reserved Credits')));
      expect(dashboardSource, isNot(contains('1 credit equals')));
      expect(dashboardSource, isNot(contains('Retry Wallet')));
    });

    test('existing dashboard campaign status still renders', () {
      expect(dashboardSource, contains("'Active Campaigns'"));
      expect(dashboardSource, contains("'Needs Review'"));
      expect(dashboardSource, contains("'Create Another Campaign'"));
    });

    test('Property Intelligence navigation remains available', () {
      expect(dashboardSource, contains('CreateCampaignScreen'));
      expect(campaignAreaSource, contains("'Property Intelligence'"));
      expect(campaignAreaSource, contains("'Compare Property Intelligence'"));
    });

    test('Group Pay navigation remains available', () {
      expect(dashboardSource, contains('ScCampaignApplicantsScreen'));
      expect(createCampaignSource, contains("'Scalers for this area'"));
      expect(createCampaignSource, contains('Group worker pay'));
    });
  });
}
