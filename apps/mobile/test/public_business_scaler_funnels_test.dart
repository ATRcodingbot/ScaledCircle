import 'dart:io';
import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_routes.dart';
import 'package:flutter_app/screens/public/business_funnel_screen.dart';
import 'package:flutter_app/screens/public/public_landing_screen.dart';
import 'package:flutter_app/screens/public/scaler_funnel_screen.dart';

void main() {
  testWidgets(
    'homepage explains real work without sample outcomes on narrow phones',
    (tester) async {
      final reportError = FlutterError.onError;
      FlutterError.onError = (details) {
        FlutterError.dumpErrorToConsole(details, forceReport: true);
        reportError?.call(details);
      };
      addTearDown(() => FlutterError.onError = reportError);
      await tester.binding.setSurfaceSize(const Size(320, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2.0)),
            child: child!,
          ),
          home: const PublicLandingScreen(),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Run your business.\nGrow locally.'), findsOneWidget);
      expect(find.textContaining('422 homes'), findsNothing);
      expect(find.textContaining('98% coverage'), findsNothing);
      expect(find.textContaining('THIS WEEK'), findsNothing);
      expect(
        find.textContaining(
          'Residential before-and-after photos are not required',
        ),
        findsOneWidget,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -1800));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  Widget app({Widget? home}) => MaterialApp(
    home: home ?? const PublicLandingScreen(),
    routes: {
      AppRoutes.businesses: (_) => const BusinessFunnelScreen(),
      AppRoutes.scalers: (_) => const ScalerFunnelScreen(),
    },
  );

  testWidgets('homepage opens the dedicated Business funnel', (tester) async {
    await tester.pumpWidget(app());
    await Scrollable.ensureVisible(
      tester.element(find.byKey(const Key('business-primary-cta'))),
      alignment: .5,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('business-primary-cta')));
    await tester.pumpAndSettle();
    expect(find.text('FOR LOCAL BUSINESSES'), findsOneWidget);
    expect(find.text('RUN YOUR BUSINESS. GROW LOCALLY.'), findsOneWidget);
    expect(find.text('Business Dashboard'), findsOneWidget);
    expect(find.text('Analyze Main Service Area'), findsOneWidget);
  });

  testWidgets(
    'homepage matches the Business workflow illustration without numeric claims',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(app());
      expect(find.text('Run your business.\nGrow locally.'), findsOneWidget);
      expect(
        find.textContaining('Connect with local gig workers—called Scalers'),
        findsOneWidget,
      );
      expect(find.textContaining('Results you can review'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp('Workflow illustration of an assigned area'),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp('validated Smart Zone')),
        findsNothing,
      );
      expect(find.text('One connected campaign'), findsOneWidget);
      expect(find.text('Example campaign area'), findsNothing);
      expect(find.textContaining('225 estimated homes'), findsNothing);
      expect(find.textContaining('5-hour'), findsNothing);
      expect(find.textContaining('Validated demo'), findsNothing);
      expect(find.text('VALIDATED SMART ZONE • DEMO'), findsNothing);
      expect(
        find.text('Illustrative boundary • Baltimore, Maryland'),
        findsNothing,
      );
      expect(find.text('How Scaled Circle works'), findsOneWidget);
      expect(find.text('Plan your local campaign'), findsOneWidget);
      expect(find.byKey(const Key('homepage-cost-separation')), findsOneWidget);
      expect(
        find.textContaining('Workflow illustration · not a live campaign'),
        findsOneWidget,
      );
      expect(find.text('Get Started for Business'), findsWidgets);
      expect(find.text('Join as a Scaler'), findsWidgets);
      semantics.dispose();
    },
  );

  testWidgets('homepage opens the dedicated Scaler funnel', (tester) async {
    await tester.pumpWidget(app());
    await Scrollable.ensureVisible(
      tester.element(find.byKey(const Key('scaler-primary-cta'))),
      alignment: .5,
    );
    await tester.pumpAndSettle();
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
    final marketing = kIsWeb
        ? tester.getTopLeft(find.byKey(const Key('business-step-marketing'))).dy
        : null;
    final campaigns = tester
        .getTopLeft(find.byKey(const Key('business-step-campaigns')))
        .dy;
    expect(setup, lessThan(intelligence));
    if (kIsWeb) {
      expect(intelligence, lessThan(marketing!));
      expect(marketing, lessThan(campaigns));
    } else {
      expect(find.byKey(const Key('business-step-marketing')), findsNothing);
      expect(intelligence, lessThan(campaigns));
    }
    for (final price in [99, 299, 499, 999]) {
      expect(
        find.text('\$$price/month'),
        kIsWeb ? findsOneWidget : findsNothing,
      );
    }
    expect(
      find.text('PRIVATE BETA / INVITE ONLY'),
      kIsWeb ? findsOneWidget : findsNothing,
    );
    expect(
      find.textContaining('connection requires approval'),
      kIsWeb ? findsOneWidget : findsNothing,
    );
    expect(find.text('Flyer Distribution Results'), findsOneWidget);
    expect(find.text('SAMPLE RESULTS'), findsOneWidget);
    expect(find.text('Weather Intelligence'), findsOneWidget);
    expect(find.text('SAMPLE SCENARIO'), findsOneWidget);
    expect(find.text('One connected campaign'), findsOneWidget);
    for (final label in [
      'Assigned area',
      'Field execution',
      'Campaign responses',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.textContaining('225'), findsNothing);
    expect(find.textContaining('5 hours'), findsNothing);
    expect(find.textContaining('VALIDATED SMART ZONE'), findsNothing);
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
      find.bySemanticsLabel(RegExp('Scaled Circle for Local Businesses')),
      findsOneWidget,
    );

    await tester.pumpWidget(app(home: const ScalerFunnelScreen()));
    expect(tester.takeException(), isNull);
    expect(
      find.bySemanticsLabel(RegExp('Scaled Circle for Scalers')),
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
    expect(find.text('Start Your Business'), findsWidgets);
    expect(find.text('Log In'), findsWidgets);
    expect(find.text('Join Business Waitlist'), findsNothing);
    expect(
      find.textContaining(
        'Campaign work depends on current eligibility, funding and assignment',
      ),
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
    expect(find.text('Join as a Scaler'), findsWidgets);
    expect(find.text('Join Scaler Waitlist'), findsWidgets);
    expect(find.text('Log In'), findsWidgets);
    expect(find.textContaining("work is not guaranteed"), findsOneWidget);
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
      'lib/navigation/startup_session_gate.dart',
    ).readAsStringSync();

    expect(funnelSource, contains('RegisterScreen('));
    expect(funnelSource, contains('UserRole.scaler : UserRole.business'));
    expect(funnelSource, contains('WaitlistScreen(initialRole: role)'));
    expect(profileSource, contains("'active': false"));
    expect(profileSource, contains("'betaAccess': 'pending'"));
    expect(registerSource, contains("AppNavigation.replace(context, '/')"));
    expect(loginSource, contains('StartupDestination.pending'));
    expect(loginSource, contains('EarlyAccessPendingScreen('));
    expect(registerSource, contains('role: UserProfile.roleValue(_role)'));
    expect(loginSource, contains("role == 'admin'"));
    expect(loginSource, contains("profile['active'] != true"));
    expect(loginSource, contains("profile['betaAccess'] != 'approved'"));
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
    final landing = File(
      'lib/screens/public/public_landing_screen.dart',
    ).readAsStringSync();
    final html = File('web/index.html').readAsStringSync();

    expect(
      components,
      contains(
        "'assets/brand/wordmark-20260928/scaledcircle-lockup-dark-surface.png'",
      ),
    );
    expect(components, contains('How do you want to use Scaled Circle?'));
    expect(business, contains('CampaignWorkflowIllustration('));
    expect(scaler, contains('EXAMPLE ACTIVE-WORK GPS EVIDENCE'));
    expect(scaler, contains('Recording during active work'));
    expect(scaler, isNot(contains('Suggested Walking Route')));
    expect(scaler, isNot(contains('Optimized Route')));
    expect(business, isNot(contains('_CampaignMapPainter')));
    expect(scaler, isNot(contains('_ScalerZonePainter')));
    expect(business, contains('CampaignWorkflowIllustration('));
    expect(scaler, contains('CampaignWorkflowIllustration('));
    expect(business, isNot(contains('AuthenticProductMap(')));
    expect(scaler, isNot(contains('AuthenticProductMap(')));
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
    // Web metadata stays on the independently deployed Hosting source.
  });
}
