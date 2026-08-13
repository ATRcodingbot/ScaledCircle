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

  String methodBody(String methodName) {
    final start = dashboardSource.indexOf('Future<void> $methodName(');
    expect(start, isNonNegative, reason: '$methodName must exist');

    final nextMethod = dashboardSource.indexOf('\n  Future<', start + 1);
    final end = nextMethod == -1 ? dashboardSource.length : nextMethod;
    return dashboardSource.substring(start, end);
  }

  group('Business dashboard lifecycle state safety', () {
    test('wallet initialization does not use a Future-returning setState', () {
      expect(
        dashboardSource,
        contains('Future<void> _initializeWallet() async'),
      );
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

    test(
      'wallet loading has mounted guards before successful state updates',
      () {
        final walletLoad = methodBody('_loadWallet');

        expect(walletLoad, contains('if (!mounted)'));
        expect(walletLoad, contains('_availableCredits = availableCredits;'));
        expect(walletLoad, contains('_reservedCredits = reservedCredits;'));
        expect(walletLoad, contains('_walletLoading = false;'));
      },
    );

    test('wallet failure is handled synchronously while mounted', () {
      final walletLoad = methodBody('_loadWallet');

      expect(walletLoad, contains('catch (e)'));
      expect(walletLoad, contains('if (!mounted)'));
      expect(
        walletLoad,
        contains("_walletError = 'Unable to load wallet: \$e';"),
      );
      expect(walletLoad, isNot(contains('setState(() async')));
    });

    test('initialization does not update state after disposal', () {
      final initialization = methodBody('_initializeWallet');

      expect(initialization, contains('if (!mounted)'));
      expect(initialization, contains('return;'));
      expect(initialization, isNot(contains('setState(() async')));
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
