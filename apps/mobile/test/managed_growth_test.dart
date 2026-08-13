import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_app/services/subscription_plan_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final plans = SubscriptionPlanService();
  final future = Timestamp.fromDate(
    DateTime.now().add(const Duration(days: 1)),
  );

  test(
    'Managed Growth inherits Scale features but Scale lacks managed package',
    () {
      expect(
        plans.hasFeature(
          plan: 'managed_growth',
          feature: 'property_intelligence',
        ),
        isTrue,
      );
      expect(
        plans.hasFeature(
          plan: 'managed_growth',
          feature: 'managed_growth_planning',
        ),
        isTrue,
      );
      expect(
        plans.hasFeature(plan: 'scale', feature: 'managed_growth_planning'),
        isFalse,
      );
      expect(
        plans.hasActiveScalePropertyIntelligence({
          'subscriptionPlan': 'managed_growth',
          'subscriptionStatus': 'active',
          'subscriptionExpiresAt': future,
        }),
        isTrue,
      );
    },
  );

  test('Managed Growth dashboard is honest about beta and external spend', () {
    final screen = File(
      'lib/screens/business/managed_growth_screen.dart',
    ).readAsStringSync();
    expect(screen, contains('LIMITED BETA'));
    expect(screen, contains('No automatic ad spend'));
    expect(screen, contains('No scraped lists or automatic sending'));
    expect(screen, contains('printing, postage, and third-party'));
    expect(screen, contains('Postcards / Direct Mail'));
    expect(screen, contains('Field Campaigns'));
    expect(screen, contains('do not require homeowner conversations'));
    expect(screen, contains('Door-to-Door Outreach'));
    expect(screen, contains('Scaler consent'));
    expect(screen, contains('right channel, area, and time'));
  });

  test('public and subscription copy disclose separate spend', () {
    final public = File(
      'lib/screens/public/public_landing_screen.dart',
    ).readAsStringSync();
    final subscription = File(
      'lib/screens/business/subscription_screen.dart',
    ).readAsStringSync();
    expect(public, contains('MANAGED GROWTH — LIMITED BETA'));
    expect(public, contains('vendor costs are separate'));
    expect(subscription, contains("plan: 'managed_growth'"));
    expect(subscription, contains('Advertising spend, printing, postage'));
  });
}
