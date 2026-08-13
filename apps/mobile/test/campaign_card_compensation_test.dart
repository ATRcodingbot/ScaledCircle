import 'package:flutter_app/models/campaign_card_compensation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('single-Scaler campaign retains its normal base-pay display', () {
    final result = CampaignCardCompensation.fromCampaign({
      'estimatedHomes': 125,
      'basePay': 100.0,
      'bonus': 10.0,
    });
    expect(result.isGroupCampaign, isFalse);
    expect(result.primaryText, '125 homes \u2022 \$100.00 base pay \u2022 \$10.00 bonus');
    expect(result.secondaryText, isNull);
  });

  test('group campaign displays one authoritative worker pool', () {
    final result = CampaignCardCompensation.fromCampaign({
      'workerPoolCents': 40000,
      'requestedScalerCount': 4,
    });
    expect(result.isGroupCampaign, isTrue);
    expect(result.primaryText, '\$400.00 group worker pay \u2022 4 Scalers');
    expect(result.secondaryText, '\$100.00 scheduled share per Scaler');
    expect(result.primaryText, isNot(contains('\$0.00 base pay')));
    expect('${result.primaryText} ${result.secondaryText}', isNot(contains('\$1,600')));
  });

  test('legitimate draft campaigns retain the normal projection', () {
    final result = CampaignCardCompensation.fromCampaign({
      'status': 'draft',
      'estimatedHomes': 20,
      'basePay': 50,
    });
    expect(result.primaryText, '20 homes \u2022 \$50.00 base pay');
  });
}
