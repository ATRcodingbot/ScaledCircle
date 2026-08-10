import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/subscription_plan_service.dart';

void main() {
  group('Weather Intelligence entitlement', () {
    final plans = SubscriptionPlanService();

    test('is excluded from Starter and Growth', () {
      expect(
        plans.hasFeature(plan: 'starter', feature: 'weather_intelligence'),
        isFalse,
      );
      expect(
        plans.hasFeature(plan: 'growth', feature: 'weather_intelligence'),
        isFalse,
      );
    });

    test('is included with Scale', () {
      expect(
        plans.hasFeature(plan: 'scale', feature: 'weather_intelligence'),
        isTrue,
      );
    });
  });
}
