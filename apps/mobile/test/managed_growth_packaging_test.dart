import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/subscription_plan_service.dart';

void main() {
  test('marketing packaging preserves Core OS and reserves Social/email for Managed Growth', () {
    for (final id in ['starter', 'growth', 'scale', 'managed_growth']) {
      final features = SubscriptionPlanService.plans[id]!['features'] as List;
      for (final feature in ['customers_leads', 'business_schedule', 'internal_jobs', 'business_tasks']) {
        expect(features, contains(feature), reason: id);
      }
      for (final feature in ['social_content_package', 'social_creative_generation', 'email_campaign_manager']) {
        expect(features.contains(feature), id == 'managed_growth', reason: '$id / $feature');
      }
      expect(features, isNot(contains('business_assistant')));
      expect(features, isNot(contains('lead_generation_research')));
    }
  });
}
