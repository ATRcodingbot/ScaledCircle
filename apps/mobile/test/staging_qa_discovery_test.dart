import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both maintained marketplace entry points use isolated discovery', () {
    final service = File('lib/services/campaign_service.dart').readAsStringSync();
    final jobs = File('lib/screens/jobs/jobs_marketplace_screen.dart').readAsStringSync();
    final dashboard = File('lib/screens/scaler/campaigns/scaler_campaign_marketplace_screen.dart').readAsStringSync();
    expect(service, contains('marketplaceCampaigns(_firestore)'));
    expect(jobs, contains('marketplaceCampaigns(FirebaseFirestore.instance)'));
    expect(dashboard, contains('_campaignService.getOpenCampaigns()'));
    expect(dashboard.indexOf('snapshot.hasError'), lessThan(dashboard.indexOf('!snapshot.hasData')));
  });
}
