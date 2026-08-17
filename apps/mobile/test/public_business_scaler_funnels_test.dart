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
    expect(find.text('GROW YOUR BUSINESS LOCALLY.'), findsWidgets);
  });

  testWidgets('homepage opens the dedicated Scaler funnel', (tester) async {
    await tester.pumpWidget(app());
    await tester.tap(find.byKey(const Key('scaler-primary-cta')));
    await tester.pumpAndSettle();
    expect(find.text('FOR SCALERS'), findsWidgets);
    expect(find.text('FIND LOCAL WORK THAT FITS YOU.'), findsOneWidget);
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
    expect(find.textContaining('Connection requires approval'), findsOneWidget);
    expect(find.textContaining('Coming Soon'), findsOneWidget);
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
    expect(find.text('Limited rollout'), findsOneWidget);
    expect(find.text('Not yet verified'), findsOneWidget);
    expect(find.text('SAMPLE JOB • NOT A LIVE LISTING'), findsOneWidget);
  });

  testWidgets('both funnels remain single-column and overflow-free at 390px', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(app(home: const BusinessFunnelScreen()));
    expect(tester.takeException(), isNull);
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
}
