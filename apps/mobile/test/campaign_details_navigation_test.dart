import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';

void main() {
  test('launch-critical deep links use the declarative Router', () {
    final main = File('lib/main.dart').readAsStringSync();
    final router = File('lib/navigation/app_router.dart').readAsStringSync();

    expect(main, contains('MaterialApp.router('));
    expect(main, contains('routerDelegate: _routerDelegate'));
    expect(main, contains('AppRouteInformationParser'));
    expect(router, contains('Navigator('));
    expect(router, contains('pages: <Page<dynamic>>['));
    expect(main, contains('fallbackRoute: fallbackRoute'));
    expect(main, contains('? AppRoutes.adminDashboard'));
    expect(main, contains(': AppRoutes.businessDashboard'));
  });

  test('Campaign Details uses its canonical role-aware app Back target', () {
    final details = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();

    expect(
      details,
      contains('AppNavigation.push(context, widget.fallbackRoute)'),
    );
    expect(
      details,
      contains('leading: BackButton(onPressed: _leaveCampaignDetails)'),
    );
    expect(details, isNot(contains("pushNamed(context, '/campaign')")));
  });

  test('route parser preserves path and query identity', () async {
    const parser = AppRouteInformationParser();
    final campaign = await parser.parseRouteInformation(
      RouteInformation(uri: Uri.parse('/campaign/campaign%201?source=qa')),
    );

    expect(campaign.pathSegments, ['campaign', 'campaign 1']);
    expect(campaign.queryParameters['source'], 'qa');
    expect(parser.restoreRouteInformation(campaign).uri, campaign);
  });

  test('router delegate exposes app navigation as current configuration', () {
    final delegate = AppRouterDelegate(
      (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const SizedBox(),
      ),
    );

    delegate.navigate('/business');
    expect(delegate.currentConfiguration, Uri.parse('/business'));
    delegate.navigate('/campaign/campaign-1');
    expect(delegate.currentConfiguration, Uri.parse('/campaign/campaign-1'));
  });

  testWidgets('route changes replace the rendered top-level page', (
    tester,
  ) async {
    final delegate = AppRouterDelegate(
      (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => Text(settings.name ?? 'missing'),
      ),
    );

    await tester.pumpWidget(
      MaterialApp.router(
        routerDelegate: delegate,
        routeInformationParser: const AppRouteInformationParser(),
      ),
    );
    delegate.navigate('/business');
    await tester.pumpAndSettle();
    expect(find.text('/business'), findsOneWidget);

    delegate.navigate('/campaign/campaign-1');
    await tester.pumpAndSettle();
    expect(find.text('/campaign/campaign-1'), findsOneWidget);
    expect(find.text('/business'), findsNothing);
  });
}
