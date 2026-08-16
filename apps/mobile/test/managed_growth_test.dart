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
    expect(screen, contains('No ad launch'));
    expect(screen, contains('No scraped lists or automatic sending'));
    expect(screen, contains('printing, postage, fulfillment, vendor costs'));
    expect(screen, contains('Postcards / Direct Mail'));
    expect(screen, contains('Set Up Your Growth Profile'));
    expect(screen, contains("artifact == null ? 'Generate' : 'Regenerate'"));
    expect(screen, contains("const Text('View')"));
    expect(screen, contains("label: const Text('Copy All')"));
    expect(screen, contains("label: const Text('Download')"));
    expect(screen, contains("label: const Text('Download CSV')"));
    expect(screen, contains("label: const Text('Email')"));
    expect(screen, contains("const Text('Send File')"));
    expect(screen, contains('Generate Image — Coming Soon / Beta'));
  });

  test('Managed Growth uses backend profile and generation callables', () {
    final service = File(
      'lib/services/managed_growth_service.dart',
    ).readAsStringSync();
    expect(service, contains('saveBusinessGrowthProfile'));
    expect(service, contains('generateManagedGrowthArtifact'));
    expect(service, contains('suggestBusinessGrowthProfileFromWebsite'));
    expect(service, contains('deliverManagedGrowthArtifact'));
    expect(service, contains('saveArtifactDeliveryPreference'));
    expect(service, isNot(contains('OPENAI_API_KEY')));
  });

  test('Growth Profile wizard uses plain contractor language', () {
    final wizard = File(
      'lib/screens/business/business_growth_profile_wizard.dart',
    ).readAsStringSync();
    for (final question in [
      'What does your business do?',
      'Where do you want more customers?',
      'Which jobs do you want more of right now?',
      'What makes customers choose you?',
      'How should your business sound online?',
      'What should people do after seeing your marketing?',
      'Is there anything you NEVER want us to say?',
      'What do customers ask you all the time?',
    ]) {
      expect(wizard, contains(question));
    }
    expect(wizard, contains('Skip for Now'));
    expect(wizard, contains('Advanced Settings'));
    expect(wizard, contains('Yes, use this'));
    expect(wizard, contains('Let me change it'));
    expect(wizard, contains("Here's what ScaledCircle understands"));
    for (final jargon in [
      'service taxonomy',
      'geographic targeting parameters',
      'campaign conversion objective',
      'audience segmentation',
      'campaign funnel',
      'retargeting',
    ]) {
      expect(wizard.toLowerCase(), isNot(contains(jargon)));
    }
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
