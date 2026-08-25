import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final wallet = File(
    'lib/screens/jobs/scaler_wallet_screen.dart',
  ).readAsStringSync();
  final jobs = File('lib/screens/jobs/my_jobs_screen.dart').readAsStringSync();
  final zones = File(
    'lib/screens/business/campaign_zones_screen.dart',
  ).readAsStringSync();
  final campaign = File(
    'lib/screens/campaigns/campaign_details_screen.dart',
  ).readAsStringSync();
  final room = File(
    'lib/screens/jobs/job_room_screen.dart',
  ).readAsStringSync();

  test('Business review records an earning without claiming payout', () {
    for (final source in [zones, campaign]) {
      expect(source, contains('Approve Work'));
      expect(source, contains('verified Scaler earning'));
      expect(source, isNot(contains('Approve Payment')));
      expect(source, isNot(contains('Approve & Pay')));
    }
  });

  test('submitted work clearly waits for Business review', () {
    expect(jobs, contains('Business Review Pending'));
    expect(jobs, contains('Review Pending'));
  });

  test('Wallet describes earnings without implying cash-out', () {
    expect(wallet, contains('Verified Earnings'));
    expect(wallet, contains('Cash-out is not yet available'));
    expect(wallet, contains('Verified work earnings will appear here'));
    expect(wallet, isNot(contains("'Available Balance'")));
  });

  test('Wallet errors are safe and do not render backend exceptions', () {
    expect(wallet, contains('Your balance has not been changed'));
    expect(wallet, isNot(contains(r'${walletSnapshot.error}')));
    expect(wallet, isNot(contains(r'${transactionSnapshot.error}')));
  });

  test('Job Room has no dead pickup button and guards repeated actions', () {
    expect(room, isNot(contains('onPressed: () {}')));
    expect(room, isNot(contains('View Pickup Details')));
    expect(room, contains('_savingLogistics'));
    expect(room, contains('_respondingToProposal'));
    expect(room, contains('_sendingMessage'));
    expect(room, contains('No job or earning state was changed'));
  });
}
