import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_routes.dart';
import 'package:flutter_app/screens/public/business_funnel_screen.dart';
import 'package:flutter_app/screens/public/authentic_product_map.dart';
import 'package:flutter_app/screens/public/public_landing_screen.dart';
import 'package:flutter_app/screens/public/scaler_funnel_screen.dart';

void main() {
  Widget app({Widget? home}) => MaterialApp(
    home: home ?? const PublicLandingScreen(),
    routes: {
      AppRoutes.businesses: (_) => const BusinessFunnelScreen(),
      AppRoutes.scalers: (_) => const ScalerFunnelScreen(),
    },
  );

  testWidgets('homepage opens the dedicated Business funnel', (tester) async {
    await tester.pumpWidget(app());
    await tester.tap(find.byKey(const Key('business-primary-cta')));
    await tester.pumpAndSettle();
    expect(find.text('FOR LOCAL BUSINESSES'), findsOneWidget);
    expect(find.text('SEE WHERE GROWTH CAN HAPPEN.'), findsOneWidget);
    expect(find.text('Business Dashboard'), findsOneWidget);
    expect(find.text('Analyze Main Service Area'), findsOneWidget);
  });

  testWidgets('homepage restores authentic campaign-map hero and role paths', (
    tester,
  ) async {
    await tester.pumpWidget(app());
    expect(find.text('PLAN LOCAL GROWTH. PUT IT INTO ACTION.'), findsOneWidget);
    expect(find.text('CAMPAIGN OPPORTUNITY • EXAMPLE'), findsOneWidget);
    expect(find.textContaining('Zone 1 mapped'), findsOneWidget);
    expect(find.text('Grow My Business'), findsWidgets);
    expect(find.text('Earn as a Scaler'), findsWidgets);
  });

  testWidgets('homepage opens the dedicated Scaler funnel', (tester) async {
    await tester.pumpWidget(app());
    await tester.tap(find.byKey(const Key('scaler-primary-cta')));
    await tester.pumpAndSettle();
    expect(find.text('FOR SCALERS'), findsWidgets);
    expect(find.text('LOCAL WORK. CLEAR FROM THE START.'), findsOneWidget);
    expect(find.text('Flyer Distribution'), findsWidgets);
    expect(find.text('View Job'), findsOneWidget);
  });

  testWidgets('Business funnel preserves its sequential journey and plans', (
    tester,
  ) async {
    await tester.pumpWidget(app(home: const BusinessFunnelScreen()));
    final setup = tester
        .getTopLeft(find.byKey(const Key('business-step-setup')))
        .dy;
    final intelligence = tester
        .getTopLeft(find.byKey(const Key('business-step-intelligence')))
        .dy;
    final marketing = tester
        .getTopLeft(find.byKey(const Key('business-step-marketing')))
        .dy;
    final campaigns = tester
        .getTopLeft(find.byKey(const Key('business-step-campaigns')))
        .dy;
    expect(setup, lessThan(intelligence));
    expect(intelligence, lessThan(marketing));
    expect(marketing, lessThan(campaigns));
    expect(find.text('\$99/month'), findsOneWidget);
    expect(find.text('\$299/month'), findsOneWidget);
    expect(find.text('\$499/month'), findsOneWidget);
    expect(find.text('\$999/month'), findsOneWidget);
    expect(find.text('LIMITED BETA'), findsOneWidget);
    expect(find.textContaining('connection requires approval'), findsOneWidget);
    expect(find.text('Flyer Distribution Results'), findsOneWidget);
    expect(find.text('SAMPLE RESULTS'), findsOneWidget);
    expect(find.text('Weather Intelligence'), findsOneWidget);
    expect(find.text('SAMPLE SCENARIO'), findsOneWidget);
    expect(find.text('CAMPAIGN ZONES'), findsOneWidget);
    expect(find.text('1 Zone'), findsOneWidget);
    expect(find.text('1 Mapped'), findsOneWidget);
    expect(find.text('0 Assigned'), findsOneWidget);
    expect(find.text('PRELIMINARY ZONE INTELLIGENCE'), findsOneWidget);
    expect(find.text('Walking Route'), findsOneWidget);
    expect(find.text('Pending target analysis'), findsOneWidget);
    expect(find.text('Review Campaign'), findsOneWidget);
  });

  testWidgets('Scaler funnel is ordered and keeps capability claims truthful', (
    tester,
  ) async {
    await tester.pumpWidget(app(home: const ScalerFunnelScreen()));
    final preferences = tester
        .getTopLeft(find.byKey(const Key('scaler-step-preferences')))
        .dy;
    final jobs = tester
        .getTopLeft(find.byKey(const Key('scaler-step-jobs')))
        .dy;
    final area = tester
        .getTopLeft(find.byKey(const Key('scaler-step-area')))
        .dy;
    final proof = tester
        .getTopLeft(find.byKey(const Key('scaler-step-proof')))
        .dy;
    expect(preferences, lessThan(jobs));
    expect(jobs, lessThan(area));
    expect(area, lessThan(proof));
    expect(find.text('Coming Soon'), findsOneWidget);
    expect(find.textContaining('Limited rollout'), findsWidgets);
    expect(find.text('Not yet verified'), findsWidgets);
    expect(find.text('SAMPLE'), findsWidgets);
    expect(find.text('Job Room'), findsOneWidget);
    expect(find.text('ACTIVE WORK ONLY'), findsOneWidget);
    expect(find.text('EXAMPLE ACTIVE-WORK GPS EVIDENCE'), findsOneWidget);
    expect(find.text('✓ Flyer Distribution'), findsOneWidget);
    expect(find.text('✓ Door Hanger Distribution'), findsOneWidget);
    expect(find.text('✓ Material Pickup'), findsOneWidget);
    expect(find.text('Door-to-Door Outreach'), findsOneWidget);
    expect(find.text('Off • explicit opt-in'), findsOneWidget);
    expect(find.text('Your Assigned Work Area'), findsOneWidget);
    expect(find.text('ASSIGNED ZONE • Zone 1'), findsOneWidget);
    expect(find.text('GPS verification'), findsWidgets);
    expect(find.text('Active'), findsWidgets);
  });

  test('Scaler residential fixture keeps position inside a bounded Zone', () {
    expect(scalerResidentialZoneFixture, hasLength(greaterThanOrEqualTo(3)));
    expect(
      publicPointInsidePolygon(
        scalerResidentialPositionFixture,
        scalerResidentialZoneFixture,
      ),
      isTrue,
    );
    final latitudes = scalerResidentialZoneFixture.map(
      (point) => point.latitude,
    );
    final longitudes = scalerResidentialZoneFixture.map(
      (point) => point.longitude,
    );
    expect(
      latitudes.reduce((a, b) => a > b ? a : b) -
          latitudes.reduce((a, b) => a < b ? a : b),
      lessThan(.02),
    );
    expect(
      longitudes.reduce((a, b) => a > b ? a : b) -
          longitudes.reduce((a, b) => a < b ? a : b),
      lessThan(.02),
    );
  });

  testWidgets('both funnels remain single-column and overflow-free at 390px', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(app(home: const BusinessFunnelScreen()));
    final businessLayoutError = tester.takeException();
    expect(businessLayoutError, isNull);
    expect(
      find.bySemanticsLabel(RegExp('ScaledCircle for Local Businesses')),
      findsOneWidget,
    );

    await tester.pumpWidget(app(home: const ScalerFunnelScreen()));
    expect(tester.takeException(), isNull);
    expect(
      find.bySemanticsLabel(RegExp('ScaledCircle for Scalers')),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('Business funnel prioritizes account creation over waitlist', (
    tester,
  ) async {
    await tester.pumpWidget(app(home: const BusinessFunnelScreen()));
    await tester.scrollUntilVisible(
      find.byKey(const Key('funnel-create-account')),
      600,
    );
    expect(find.text('Create My Business Account'), findsWidgets);
    expect(find.text('Join Business Waitlist'), findsWidgets);
    expect(find.text('Log In'), findsWidgets);
    expect(
      find.textContaining('Marketplace access is being rolled out in stages'),
      findsOneWidget,
    );
  });

  testWidgets('Scaler funnel prioritizes account creation over waitlist', (
    tester,
  ) async {
    await tester.pumpWidget(app(home: const ScalerFunnelScreen()));
    await tester.scrollUntilVisible(
      find.byKey(const Key('funnel-create-account')),
      600,
    );
    expect(find.text('Create Scaler Account'), findsWidgets);
    expect(find.text('Join Scaler Waitlist'), findsWidgets);
    expect(find.text('Log In'), findsWidgets);
    expect(
      find.textContaining("we'll let you know as access becomes available"),
      findsOneWidget,
    );
  });

  test('account CTAs reuse pending registration without granting access', () {
    final funnelSource = File(
      'lib/screens/public/public_funnel_components.dart',
    ).readAsStringSync();
    final profileSource = File(
      'lib/services/user/user_service.dart',
    ).readAsStringSync();
    final registerSource = File(
      'lib/screens/auth/register_screen.dart',
    ).readAsStringSync();
    final loginSource = File(
      'lib/screens/auth/login_screen.dart',
    ).readAsStringSync();

    expect(funnelSource, contains('RegisterScreen('));
    expect(funnelSource, contains('UserRole.scaler : UserRole.business'));
    expect(funnelSource, contains('WaitlistScreen(initialRole: role)'));
    expect(profileSource, contains("'active': false"));
    expect(profileSource, contains("'betaAccess': 'pending'"));
    expect(registerSource, contains('EarlyAccessPendingScreen('));
    expect(registerSource, contains('role: UserProfile.roleValue(_role)'));
    expect(loginSource, contains("role == 'admin'"));
    expect(loginSource, contains("userData?['active'] == true"));
    expect(loginSource, contains("userData?['betaAccess'] == 'approved'"));
  });

  test('public previews use approved branding and truthful field evidence', () {
    final components = File(
      'lib/screens/public/public_funnel_components.dart',
    ).readAsStringSync();
    final business = File(
      'lib/screens/public/business_funnel_screen.dart',
    ).readAsStringSync();
    final scaler = File(
      'lib/screens/public/scaler_funnel_screen.dart',
    ).readAsStringSync();
    final maps = File(
      'lib/screens/public/authentic_product_map.dart',
    ).readAsStringSync();
    final landing = File(
      'lib/screens/public/public_landing_screen.dart',
    ).readAsStringSync();
    final html = File('web/index.html').readAsStringSync();

    expect(
      components,
      contains("'assets/brand/scaledcircle-lockup-dark-surface.png'"),
    );
    expect(components, contains('How do you want to use ScaledCircle?'));
    expect(business, contains('Service Area'));
    expect(business, contains('Campaign Target'));
    expect(business, contains('Scaler Zone'));
    expect(business, contains("ProductLine('Route', 'Not yet verified')"));
    expect(scaler, contains('EXAMPLE ACTIVE-WORK GPS EVIDENCE'));
    expect(scaler, contains('Recording during active work'));
    expect(scaler, isNot(contains('Suggested Walking Route')));
    expect(scaler, isNot(contains('Optimized Route')));
    expect(business, isNot(contains('_CampaignMapPainter')));
    expect(scaler, isNot(contains('_ScalerZonePainter')));
    expect(maps, contains('FlutterMap('));
    expect(maps, contains('PolygonLayer('));
    expect(maps, contains('MarkerLayer('));
    expect(maps, contains('© OpenStreetMap contributors'));
    expect(maps, isNot(contains('PolylineLayer(')));
    expect(maps, contains('InteractiveFlag.none'));
    expect(maps, isNot(contains('Geolocator')));
    expect(maps, isNot(contains('requestPermission')));
    expect(maps, isNot(contains('startTracking')));
    expect(landing, contains('ScaledCircleBrand'));
    expect(landing, contains('openPublicRoleChooser(context)'));
    expect(html, contains('og:type'));
    expect(html, contains('og:url'));
    expect(html, contains('og:title'));
    expect(html, contains('og:description'));
    expect(html, contains('og:image'));
    expect(html, contains('twitter:card'));
    expect(html, contains('twitter:title'));
    expect(html, contains('twitter:description'));
    expect(html, contains('twitter:image'));
    expect(html, contains('href="favicon.png"'));
    expect(html, isNot(contains('scaled-circle-mark.svg')));
    expect(
      html,
      contains(
        'ScaledCircle — Local Growth Intelligence + Verified Field Campaigns',
      ),
    );
  });
}
