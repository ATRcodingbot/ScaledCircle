import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_attribution_screen.dart';
import 'package:flutter_app/services/attribution_service.dart';
import 'package:flutter_app/widgets/response_tracking_feature_card.dart';

void main() {
  testWidgets('production presentation remains unavailable and truthful', (
    tester,
  ) async {
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

  testWidgets('staging presentation enables only tracked link and QR Beta', (
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
    final client = _FakeAttributionClient();
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
    await tester.enterText(
      find.widgetWithText(TextField, 'Secure destination URL'),
      'https://scaledcircle-staging.web.app/#/business',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();

    expect(client.createCalls, 1);
    expect(client.lastType, 'tracked_link');
    expect(client.lastSource, 'tracked_link');
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
  _FakeAttributionClient({this.throwOnCreate = false});

  final bool throwOnCreate;
  int createCalls = 0;
  String? lastType;
  String? lastSource;

  @override
  Future<AttributionOverview> loadOverview({String? businessUid}) async =>
      const AttributionOverview(
        metrics: {
          'trackedInteractions': 0,
          'uniqueResponses': 0,
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
  }) async {
    createCalls += 1;
    lastType = type;
    lastSource = source;
    if (throwOnCreate) throw StateError('permission-denied internal detail');
    return {
      'trackedUrl':
          'https://scaledcircle-staging.web.app/r?code=abcdefghijklmnopqrstuvwx',
    };
  }
}
