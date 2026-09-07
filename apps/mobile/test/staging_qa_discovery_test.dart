import 'dart:io';
import 'package:flutter_app/services/staging_qa_discovery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both maintained marketplace entry points use isolated discovery', () {
    final service = File(
      'lib/services/campaign_service.dart',
    ).readAsStringSync();
    final jobs = File(
      'lib/screens/jobs/jobs_marketplace_screen.dart',
    ).readAsStringSync();
    final dashboard = File(
      'lib/screens/scaler/campaigns/scaler_campaign_marketplace_screen.dart',
    ).readAsStringSync();
    expect(service, contains('marketplaceCampaigns(_firestore)'));
    expect(jobs, contains('marketplaceCampaigns(FirebaseFirestore.instance)'));
    expect(dashboard, contains('_campaignService.getOpenCampaigns()'));
    expect(
      dashboard.indexOf('snapshot.hasError'),
      lessThan(dashboard.indexOf('!snapshot.hasData')),
    );
  });
  test('only the three approved pairs are separately discovered', () {
    expect(physicalQaCampaignIds, [
      'ios_physical_qa_v1',
      'android_physical_qa_v1',
      'ios_physical_qa_v2',
      'android_physical_qa_v2',
      'ios_physical_qa_v3',
      'android_physical_qa_v3',
    ]);
    expect(physicalQaCampaignIds.toSet().length, 6);
  });
}
