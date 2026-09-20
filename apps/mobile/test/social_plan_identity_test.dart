import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/social_plan_presentation.dart';

void main() {
  test(
    'separate legacy channel plans remain distinct and are not current authority',
    () {
      Map plan(String id, String channel) => {
        'id': id,
        'startsOn': '2026-09-07T04:00:00Z',
        'planVersion': 1,
        'items': [
          {
            'variants': [
              {'provider': channel},
            ],
          },
        ],
      };
      expect(socialPlanChannelLabel(plan('fb', 'facebook')), 'Facebook');
      expect(socialPlanChannelLabel(plan('ig', 'instagram')), 'Instagram');
      expect(socialPlanChannelLabel(plan('x', 'x')), 'X');
      expect(
        socialPlanIdentityLabel(plan('fb', 'facebook')),
        '2026-09-07 · Version 1 · Saved plan',
      );
      expect(
        socialPlanIdentityLabel(plan('fb', 'facebook'), currentPlanId: 'fb'),
        contains('Current automatic strategy'),
      );
      expect(
        socialPlanIdentityLabel(plan('x', 'x'), currentPlanId: 'fb'),
        contains('Saved plan'),
      );
    },
  );
}
