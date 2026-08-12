import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_model.dart';

void main() {
  test('single-Scaler campaign defaults remain compatible', () {
    final campaign = CampaignModel.fromMap('campaign', {'basePay': 400.0});
    expect(campaign.scalerCount, 1);
    expect(campaign.workerPoolCents, 40000);
  });

  test('group opportunity exposes one pool and individual scheduled share', () {
    final campaign = CampaignModel.fromMap('campaign', {
      'requiredScalerCount': 4,
      'workerPoolCents': 40000,
      'scheduledShareCents': 10000,
    });
    expect(campaign.scalerCount, 4);
    expect(campaign.workerPoolCents, 40000);
    expect(campaign.scheduledShareCents, 10000);
  });
}
