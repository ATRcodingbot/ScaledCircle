import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final details = File(
    'lib/screens/campaigns/campaign_details_screen.dart',
  ).readAsStringSync();
  final applicants = File(
    'lib/screens/campaigns/campaign_applicants_screen.dart',
  ).readAsStringSync();
  final dashboard = File(
    'lib/screens/business/business_dashboard.dart',
  ).readAsStringSync();
  final server = File('../../functions/index.js').readAsStringSync();

  test(
    'eligible Business sees explicit cancel and original-method refund copy',
    () {
      expect(details, contains('Cancel Campaign & Refund'));
      expect(details, contains('Cancel & Request Refund'));
      expect(details, contains('returned to the original payment method'));
      expect(details, isNot(contains('Unlock Credits')));
    },
  );

  test('assigned campaign explains why instant refund is unavailable', () {
    expect(details, contains('A Scaler has already been assigned'));
    expect(details, contains('different review process'));
  });

  test(
    'refund processing and archive remain truthful soft lifecycle states',
    () {
      expect(details, contains('Refund Processing'));
      expect(details, contains('CANCELED / REFUNDED'));
      expect(details, contains('Remove from My Campaigns'));
      expect(details, contains('archiveCanceledCampaign'));
      expect(dashboard, contains("data['hiddenFromBusinessHistory'] != true"));
    },
  );

  test(
    'assignment delegates cancellation-sensitive checks to server authority',
    () {
      expect(applicants, contains("'assignScalerToZone'"));
      expect(
        applicants,
        contains("functionName: 'assignScalerToCampaignLocations'"),
      );
      expect(applicants, isNot(contains('runTransaction')));
      expect(applicants, isNot(contains("latestCampaignStatus != 'open'")));
      expect(
        server,
        contains('This campaign is no longer accepting Scaler assignments.'),
      );
      expect(server, contains('exports.assignScalerToZone'));
      expect(server, contains('exports.assignScalerToCampaignLocations'));
    },
  );

  test('financial action uses isolated campaign-funding callables', () {
    expect(details, contains('cancelUnassignedFundedCampaign'));
    expect(details, isNot(contains("functionName: 'fundCampaign'")));
    expect(details, isNot(contains('wallet credit')));
  });
}
