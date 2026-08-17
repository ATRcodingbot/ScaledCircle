import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_routes.dart';
import 'package:flutter_app/screens/public/business_funnel_screen.dart';
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
    expect(find.text('SAMPLE ACTIVE-WORK GPS TRACE'), findsOneWidget);
    expect(find.text('✓ Flyer Distribution'), findsOneWidget);
    expect(find.text('✓ Door Hanger Distribution'), findsOneWidget);
    expect(find.text('✓ Material Pickup'), findsOneWidget);
    expect(find.text('Door-to-Door Outreach'), findsOneWidget);
    expect(find.text('Off • explicit opt-in'), findsOneWidget);
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
    expect(registerSource, contains('EarlyAccessPendingScreen(email: email)'));
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
    final html = File('web/index.html').readAsStringSync();

    expect(components, contains("'web/icons/Icon-192.png'"));
    expect(components, contains('How do you want to use ScaledCircle?'));
    expect(business, contains('Service Area'));
    expect(business, contains('Campaign Target'));
    expect(business, contains('Scaler Zone'));
    expect(business, contains("ProductLine('Route', 'Not yet verified')"));
    expect(scaler, contains('SAMPLE ACTIVE-WORK GPS TRACE'));
    expect(scaler, contains('Recorded active-work evidence'));
    expect(scaler, contains('it is not a planned walking route'));
    expect(scaler, isNot(contains('Suggested Walking Route')));
    expect(scaler, isNot(contains('Optimized Route')));
    expect(html, contains('og:type'));
    expect(html, contains('og:url'));
    expect(html, contains('og:title'));
    expect(html, contains('og:description'));
    expect(html, contains('og:image'));
    expect(html, contains('twitter:card'));
    expect(html, contains('twitter:title'));
    expect(html, contains('twitter:description'));
    expect(html, contains('twitter:image'));
    expect(html, contains('icons/scaled-circle-mark.svg'));
    expect(
      html,
      contains(
        'ScaledCircle — Local Growth Intelligence + Verified Field Campaigns',
      ),
    );
  });
}
