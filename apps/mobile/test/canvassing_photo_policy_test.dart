import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_model.dart';
import 'package:flutter_app/models/canvassing_photo_policy.dart';

void main() {
  test('canvassing aliases override legacy before/after flags', () {
    for (final type in [
      'neighborhoodCanvassing',
      'flyerDistribution',
      'doorHangerDistribution',
    ]) {
      final campaign = CampaignModel.fromMap('qa', {
        'type': type,
        'verification': {
          'beforePhotoRequired': true,
          'afterPhotoRequired': true,
        },
        'tracking': {'gpsRequired': true},
      });
      expect(prohibitsResidentialPhotos(type), isTrue);
      expect(campaign.beforePhotoRequired, isFalse);
      expect(campaign.afterPhotoRequired, isFalse);
      expect(campaign.gpsRequired, isTrue);
    }
  });
  test('task-specific non-canvassing photos remain available', () {
    final campaign = CampaignModel.fromMap('cleanup', {
      'campaignType': 'yardCleanup',
      'verification': {'beforePhotoRequired': true, 'afterPhotoRequired': true},
    });
    expect(campaign.beforePhotoRequired, isTrue);
    expect(campaign.afterPhotoRequired, isTrue);
    expect(prohibitsResidentialPhotos(null), isFalse);
  });
}
