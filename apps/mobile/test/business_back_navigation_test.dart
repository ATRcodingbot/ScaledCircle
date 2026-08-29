import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/business_back_button.dart';

void main() {
  testWidgets('Business Back returns to the previous maintained screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => Scaffold(
                    appBar: AppBar(leading: const BusinessBackButton()),
                  ),
                ),
              ),
              child: const Text('Open Landing Pages'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Landing Pages'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('business-page-back-button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Open Landing Pages'), findsOneWidget);
  });

  testWidgets('direct Business page Back uses the safe dashboard fallback', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        routes: {
          '/business': (_) => const Scaffold(body: Text('Business dashboard')),
        },
        home: Scaffold(
          appBar: AppBar(leading: const BusinessBackButton()),
          body: const Text('Direct-linked Business page'),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Business dashboard'), findsOneWidget);
    expect(find.text('Direct-linked Business page'), findsNothing);
  });

  testWidgets(
    'direct-link fallback synchronizes rendered route and route information',
    (tester) async {
      final delegate = AppRouterDelegate(
        (settings) => MaterialPageRoute<void>(
          settings: settings,
          builder: (context) => Scaffold(
            appBar: settings.name == '/business/landing-pages'
                ? AppBar(leading: const BusinessBackButton())
                : null,
            body: Text(settings.name ?? 'missing'),
          ),
        ),
      );
      final provider = PlatformRouteInformationProvider(
        initialRouteInformation: RouteInformation(
          uri: Uri.parse('/business/landing-pages'),
        ),
      );

      await tester.pumpWidget(
        MaterialApp.router(
          routeInformationProvider: provider,
          routeInformationParser: const AppRouteInformationParser(),
          routerDelegate: delegate,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('/business/landing-pages'), findsOneWidget);

      await tester.tap(find.byKey(const Key('business-page-back-button')));
      await tester.pumpAndSettle();

      expect(find.text('/business'), findsOneWidget);
      expect(delegate.currentConfiguration, Uri.parse('/business'));
      expect(provider.value.uri, Uri.parse('/business'));
    },
  );

  testWidgets('stacked Business Back returns to the prior Business route', (
    tester,
  ) async {
    final delegate = AppRouterDelegate(
      (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (context) => Scaffold(
          appBar: settings.name == '/business/landing-pages'
              ? AppBar(leading: const BusinessBackButton())
              : null,
          body: Text(settings.name ?? 'missing'),
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp.router(
        routeInformationParser: const AppRouteInformationParser(),
        routerDelegate: delegate,
      ),
    );
    delegate.navigate('/business/attribution');
    await tester.pumpAndSettle();
    delegate.navigate(
      '/business/landing-pages',
      context: tester.element(find.text('/business/attribution')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();

    expect(find.text('/business/attribution'), findsOneWidget);
    expect(delegate.currentConfiguration, Uri.parse('/business/attribution'));
  });

  testWidgets('guard can keep unsaved work in place', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            leading: BusinessBackButton(beforeNavigate: () async => false),
          ),
          body: const Text('Unsaved Landing Page'),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved Landing Page'), findsOneWidget);
  });

  testWidgets('Back control keeps a mobile-safe touch target and tooltip', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            leading: const BusinessBackButton(
              tooltip: 'Back to Business dashboard',
            ),
            title: const Text('Landing Page — Beta'),
          ),
        ),
      ),
    );

    final size = tester.getSize(
      find.byKey(const Key('business-page-back-button')),
    );
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));
    expect(find.text('Landing Page — Beta'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('Landing Page workspace uses guarded canonical Business navigation', () {
    final source = File(
      'lib/screens/business/landing_page_builder_screen.dart',
    ).readAsStringSync();
    expect(source, contains('leading: BusinessBackButton('));
    expect(source, contains('PopScope('));
    expect(source, contains('_confirmLeaveWithUnsavedChanges'));
    expect(source, contains("'Leave without saving?'"));
    expect(source, isNot(contains('AppRoutes.businessDashboard')));
  });

  test(
    'router replacement publishes route information without Router.neglect',
    () {
      final source = File('lib/navigation/app_router.dart').readAsStringSync();
      expect(source, isNot(contains('Router.neglect')));
      expect(source, contains('Router.navigate(context, update)'));
      expect(source, contains('popPreviousBusinessRoute'));
    },
  );
}
