import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/public/public_landing_screen.dart';
import 'package:flutter_app/services/subscription_plan_service.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';

void main() {
  final propertySource = File(
    'lib/screens/business/property_intelligence_center_screen.dart',
  ).readAsStringSync();
  final flyerSource = File(
    'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
  ).readAsStringSync();
  final zonesSource = File(
    'lib/screens/business/campaign_zones_screen.dart',
  ).readAsStringSync();
  final areaSource = File(
    'lib/screens/business/campaign_area_screen.dart',
  ).readAsStringSync();

  test('Campaign Zones continues only from persisted valid geometry', () {
    expect(campaignZonesCanContinue(const []), isFalse);
    expect(campaignZonesCanContinue(const [
      {'serviceAreaPointCount': 0},
      {'serviceAreaPointCount': 2},
    ]), isFalse);
    expect(campaignZonesCanContinue(const [
      {'serviceAreaPointCount': 3},
    ]), isTrue);
  });

  test('focused zone flow opens the maintained map before persistence', () {
    expect(zonesSource, contains('Choose where this campaign will run'));
    expect(zonesSource, contains('Choose Target Area'));
    expect(zonesSource, contains('Draw Custom Target'));
    expect(zonesSource, contains('pendingZoneData: pendingZoneData'));
    expect(zonesSource, isNot(contains("'workerPoolCents':")));
    expect(areaSource, contains("if (latestSnapshot?.exists == true)"));
    expect(areaSource, contains("widget.pendingZoneData == null"));
    expect(areaSource, contains("await widget.campaignReference.set(createData)"));
    expect(areaSource, contains('widget.campaignReference.set'));
    expect(areaSource, contains('Route not yet verified'));
  });

  test('authoritative plan configuration contains all four real plans', () {
    final plans = SubscriptionPlanService.plans;
    expect(plans.keys, <String>[
      'starter',
      'growth',
      'scale',
      'managed_growth',
    ]);
    expect(plans.values.map((plan) => plan['name']), <String>[
      'Starter',
      'Growth',
      'Scale',
      'Managed Growth',
    ]);
    expect(plans.values.map((plan) => plan['price']), <double>[
      99.0,
      299.0,
      499.0,
      999.0,
    ]);
  });

  for (final viewport in <({String name, Size size})>[
    (name: 'desktop', size: Size(1440, 1000)),
    (name: 'mobile', size: Size(390, 844)),
  ]) {
    testWidgets('public pricing renders all plans at ${viewport.name} width', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(viewport.size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const MaterialApp(home: PublicLandingScreen()));
      await tester.pump();

      for (final entry in SubscriptionPlanService.plans.entries) {
        final planId = entry.key;
        final plan = entry.value;
        expect(
          find.byKey(Key('public-plan-$planId'), skipOffstage: false),
          findsOneWidget,
        );
        expect(
          find.text(plan['name'].toString().toUpperCase(), skipOffstage: false),
          findsWidgets,
        );
        expect(
          find.text(
            '\$${(plan['price'] as num).toStringAsFixed(0)}/month',
            skipOffstage: false,
          ),
          findsOneWidget,
        );
      }
    });
  }

  test('Property modes retain a large map and distinct context behavior', () {
    expect(propertySource, contains("Key('property-map-workspace')"));
    expect(propertySource, contains('clamp(520.0, 760.0)'));
    expect(propertySource, contains('clamp(360.0, 560.0)'));
    expect(propertySource, contains('SegmentedButton<_PropertyDiscoveryMode>'));
    expect(propertySource, contains('_loadSavedArea(contextArea);'));
    expect(propertySource, contains('Future<void> _exploreAnywhere() async'));
    expect(propertySource, contains('_selectedSavedAreaName = null;'));
  });

  test('campaign CTA validates visibly and enters the area workspace once', () {
    expect(flyerSource, contains('_validateAndRevealFirstError'));
    expect(flyerSource, contains('Scrollable.ensureVisible'));
    expect(flyerSource, contains('startWithAreaBuilder: false'));
    expect(flyerSource, contains('publishing = true'));
    expect(flyerSource, contains('maxWidth: 1080'));
    expect(flyerSource, contains('_CampaignCreationSteps(currentStep: 1)'));
    expect(zonesSource, contains('class _OpenAreaBuilderOnce'));
    expect(zonesSource, contains('skipNamePrompt: true'));
    expect(areaSource, contains("Key('campaign-zone-map-workspace')"));
    expect(areaSource, contains('clamp(520.0, 760.0)'));
    expect(areaSource, contains('clamp(360.0, 560.0)'));
    expect(areaSource, contains('Step 3 of 4'));
  });
}
