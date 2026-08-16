import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_app/screens/public/public_landing_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late String homepage;
  late String dashboard;
  late String managedGrowth;
  late String property;

  setUpAll(() {
    homepage = File(
      'lib/screens/public/public_landing_screen.dart',
    ).readAsStringSync();
    dashboard = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    managedGrowth = File(
      'lib/screens/business/managed_growth_screen.dart',
    ).readAsStringSync();
    property = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
  });

  test('homepage follows the outcome-led product hierarchy', () {
    final headings = [
      'GROW YOUR BUSINESS LOCALLY.',
      'HOW SCALEDCIRCLE WORKS',
      'FOR BUSINESSES',
      'MANAGED GROWTH',
      'VERIFIED FIELD CAMPAIGNS',
      'FOR SCALERS',
      'SIMPLE PRICING',
      'READY TO GROW LOCALLY?',
    ];
    var previous = -1;
    for (final heading in headings) {
      final current = homepage.indexOf(heading);
      expect(
        current,
        greaterThan(previous),
        reason: '$heading must appear in order',
      );
      previous = current;
    }
  });

  test(
    'Business and Scaler primary actions have consistent semantic colors',
    () {
      expect(homepage, contains("Key('business-primary-cta')"));
      expect(homepage, contains('backgroundColor: _green'));
      expect(homepage, contains("Key('scaler-primary-cta')"));
      expect(homepage, contains('backgroundColor: _blue'));
      expect(homepage, contains("Key('scaler-blue-section')"));
    },
  );

  test('public examples are honest and confusing launch copy is removed', () {
    expect(homepage, contains('PROPERTY OPPORTUNITY • EXAMPLE'));
    expect(homepage, contains('WEATHER OPPORTUNITY • ILLUSTRATION'));
    expect(
      homepage,
      contains('You review it before anything is published or launched.'),
    );
    expect(homepage, isNot(contains('test credits')));
    expect(homepage, isNot(contains('Business Early Access')));
    expect(homepage, isNot(contains('Scaler Early Access')));
    expect(homepage, isNot(contains('No active NWS alerts right now')));
  });

  test('authenticated Business home is organized around four goals', () {
    for (final label in [
      'FIND AN OPPORTUNITY',
      'CREATE MARKETING',
      'LAUNCH A CAMPAIGN',
      'REVIEW RESULTS',
    ]) {
      expect(dashboard, contains(label));
    }
    for (final destination in [
      'Home',
      'Grow',
      'Campaigns',
      'Results',
      'Account',
    ]) {
      expect(dashboard, contains("Text('$destination')"));
    }
    expect(
      dashboard,
      contains(
        'if (activeCampaigns.isNotEmpty || submittedCampaigns.isNotEmpty)',
      ),
    );
  });

  test(
    'Managed Growth starts with plain-language goals and keeps tools secondary',
    () {
      expect(managedGrowth, contains('WHAT DO YOU WANT TO WORK ON?'));
      expect(managedGrowth, contains('Create this week’s marketing'));
      expect(managedGrowth, contains('Review my social posts'));
      expect(managedGrowth, contains('Build a 30-day plan'));
      expect(managedGrowth, contains('More Marketing Tools'));
      expect(managedGrowth, contains('Preview & Approve'));
    },
  );

  test(
    'Property modes explain saved territory versus unrestricted exploration',
    () {
      expect(property, contains('SegmentedButton<_PropertyDiscoveryMode>'));
      expect(property, contains("label: Text('My Service Areas')"));
      expect(property, contains("label: Text('Explore Anywhere')"));
      expect(property, contains('Analyzing:'));
      expect(property, contains("Key('property-map-workspace')"));
      expect(property, contains('manual exploration is always available'));
    },
  );

  test('responsive and accessibility primitives remain present', () {
    expect(homepage, contains('LayoutBuilder'));
    expect(homepage, contains('Semantics'));
    expect(dashboard, contains('Semantics('));
    expect(dashboard, contains('BoxConstraints(minHeight: 170)'));
    expect(property, contains('viewport.maxWidth >= 760'));
    expect(property, contains('clamp(520.0, 760.0)'));
    expect(property, contains('clamp(360.0, 560.0)'));
  });

  for (final viewport in <({String name, Size size})>[
    (name: 'desktop', size: Size(1280, 900)),
    (name: 'mobile', size: Size(390, 844)),
  ]) {
    testWidgets('homepage primary actions render at ${viewport.name} width', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(viewport.size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const MaterialApp(home: PublicLandingScreen()));
      await tester.pump();

      expect(find.byKey(const Key('homepage-hero-title')), findsOneWidget);
      expect(find.byKey(const Key('business-primary-cta')), findsOneWidget);
      expect(find.byKey(const Key('scaler-primary-cta')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
