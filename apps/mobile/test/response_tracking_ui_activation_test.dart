import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_attribution_screen.dart';
import 'package:flutter_app/services/attribution_service.dart';
import 'package:flutter_app/widgets/response_tracking_feature_card.dart';

void main() {
  test('Response Tracking uses the canonical authenticated browser route', () {
    final routes = File('lib/navigation/app_routes.dart').readAsStringSync();
    final main = File('lib/main.dart').readAsStringSync();
    final dashboard = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    final builder = File(
      'lib/screens/business/create_campaign_screen.dart',
    ).readAsStringSync();
    final attribution = File(
      'lib/screens/business/business_attribution_screen.dart',
    ).readAsStringSync();
    final flyer = File(
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    ).readAsStringSync();
    expect(routes, contains("businessAttribution = '/business/attribution'"));
    expect(main, contains('route?.path == AppRoutes.businessAttribution'));
    expect(main, contains('routeName: AppRoutes.businessAttribution'));
    expect(main, contains('audience: ProtectedRouteAudience.business'));
    expect(
      dashboard,
      contains('AppNavigation.push(context, AppRoutes.businessAttribution)'),
    );
    expect(builder, contains('AppRoutes.businessAttribution'));
    expect(dashboard, isNot(contains('BusinessAttributionScreen()')));
    for (final source in [dashboard, attribution, builder, flyer]) {
      expect(source, contains('AppEnvironmentConfig.responseTrackingEnabled'));
    }
    final environment = File(
      'lib/config/app_environment.dart',
    ).readAsStringSync();
    expect(
      environment,
      contains('responseTrackingEnabled = isStaging || isProduction'),
    );
  });

  testWidgets('unavailable presentation remains truthful', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ResponseTrackingFeatureCard(available: false)),
      ),
    );

    expect(find.text('Response tracking — Coming Soon'), findsOneWidget);
    expect(find.text('Tracked link — Coming Soon'), findsOneWidget);
    expect(find.text('QR code — Coming Soon'), findsOneWidget);
    expect(find.text('Landing pages — Coming Soon'), findsOneWidget);
    expect(find.text('Tracked calls — Coming Soon'), findsOneWidget);
    expect(find.text('Lead capture/forms — Coming Soon'), findsOneWidget);
    expect(find.text('Open tracked link + QR'), findsNothing);
  });

  testWidgets('enabled presentation exposes only tracked link and QR Beta', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ResponseTrackingFeatureCard(available: true, onOpen: () {}),
          ),
        ),
      ),
    );

    expect(find.text('Response tracking — Beta'), findsOneWidget);
    expect(find.text('Tracked link — Beta'), findsOneWidget);
    expect(find.text('QR code — Beta'), findsOneWidget);
    expect(find.text('Landing pages — Coming Soon'), findsOneWidget);
    expect(find.text('Tracked calls — Coming Soon'), findsOneWidget);
    expect(find.text('Lead capture/forms — Coming Soon'), findsOneWidget);
    expect(find.text('Open tracked link + QR'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('one create action returns one staging link used by the QR', (
    tester,
  ) async {
    final client = _FakeAttributionClient(
      overview: const AttributionOverview(
        metrics: {},
        assets: [],
        dataStatus: 'available',
        campaigns: [
          {
            'campaignId': 'campaign-1',
            'name': 'Annapolis launch',
            'status': 'open',
          },
        ],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessAttributionScreen(service: client, enabled: true),
      ),
    );
    await tester.pumpAndSettle();

    expect(client.createCalls, 0);
    await tester.tap(find.text('Create tracked link + QR'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Label'),
      'Internal QA',
    );
    await tester.tap(find.text('General testing — never live campaign data'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Annapolis launch · open').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Secure destination URL'),
      'https://scaledcircle-staging.web.app/#/business',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();

    expect(client.createCalls, 1);
    expect(client.lastType, 'tracked_link');
    expect(client.lastSource, 'tracked_link');
    expect(client.lastCampaignId, 'campaign-1');
    expect(
      find.text(
        'https://scaledcircle-staging.web.app/r?code=abcdefghijklmnopqrstuvwx',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining('https://scaledcircle.com/r?code='),
      findsNothing,
    );
    expect(find.bySemanticsLabel('Tracked response QR code'), findsOneWidget);
    expect(find.text('Copy link'), findsOneWidget);
  });

  testWidgets('pre-launch activity is visibly separate from live results', (
    tester,
  ) async {
    final client = _FakeAttributionClient(
      overview: const AttributionOverview(
        metrics: {
          'trackedInteractions': 2,
          'uniqueResponses': 1,
          'testInteractions': 3,
          'leads': 0,
          'conversions': 0,
        },
        assets: [
          {
            'type': 'tracked_link',
            'label': 'Proof link',
            'trackedUrl': 'https://scaledcircle-staging.web.app/r?code=proof',
            'analyticsClass': 'prelaunch',
          },
        ],
        dataStatus: 'available',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessAttributionScreen(service: client, enabled: true),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('2 live interactions'), findsOneWidget);
    expect(find.text('1 unique live responses'), findsOneWidget);
    expect(find.text('3 test / pre-launch visits'), findsOneWidget);
    expect(find.textContaining('Testing / Pre-launch'), findsOneWidget);
    expect(
      find.textContaining('Testing and pre-launch visits are kept separate'),
      findsOneWidget,
    );
  });

  testWidgets('asset creation failure is customer safe', (tester) async {
    final client = _FakeAttributionClient(throwOnCreate: true);
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessAttributionScreen(service: client, enabled: true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create tracked link + QR'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Label'),
      'Internal QA',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Secure destination URL'),
      'https://scaledcircle-staging.web.app/#/business',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();

    expect(client.createCalls, 1);
    expect(
      find.text(
        "We couldn't create that tracked response. Check the secure URL and try again.",
      ),
      findsOneWidget,
    );
    expect(find.textContaining('permission-denied'), findsNothing);
    expect(find.textContaining('FirebaseException'), findsNothing);
  });
}

class _FakeAttributionClient implements AttributionClient {
  _FakeAttributionClient({this.throwOnCreate = false, this.overview});

  final bool throwOnCreate;
  final AttributionOverview? overview;
  int createCalls = 0;
  String? lastType;
  String? lastSource;
  String? lastCampaignId;

  @override
  Future<AttributionOverview> loadOverview({String? businessUid}) async =>
      overview ??
      const AttributionOverview(
        metrics: {
          'trackedInteractions': 0,
          'uniqueResponses': 0,
          'testInteractions': 0,
          'leads': 0,
          'conversions': 0,
        },
        assets: [],
        dataStatus: 'insufficient_data',
      );

  @override
  Future<Map<String, dynamic>> createResponseAsset({
    required String label,
    required String type,
    required String destination,
    String source = 'tracked_link',
    String? campaignId,
  }) async {
    createCalls += 1;
    lastType = type;
    lastSource = source;
    lastCampaignId = campaignId;
    if (throwOnCreate) throw StateError('permission-denied internal detail');
    return {
      'trackedUrl':
          'https://scaledcircle-staging.web.app/r?code=abcdefghijklmnopqrstuvwx',
    };
  }
}
