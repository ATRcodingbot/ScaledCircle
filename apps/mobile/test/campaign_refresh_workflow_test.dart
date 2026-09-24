import 'dart:async';
import 'dart:math' as math;

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/main.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/business_workspace_gate.dart';
import 'package:flutter_app/navigation/campaign_route_content.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/screens/business/edit_campaign_screen.dart';
import 'package:flutter_app/screens/campaigns/campaign_details_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'package:flutter_app/widgets/campaign_planning_cost.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/campaign_refresh_firebase.dart';

// Only Firebase transport is replaced. The named route, permission timer,
// campaign read/cache, live draft, editor, zone list and map are production UI.
// Unexpected writes/callables fail instead of reaching a real project.
const _draftPath = 'campaigns/refresh-draft';
const _zonePath = 'campaignZones/refresh-zone';
const _route = '/campaign/refresh-draft';
const _unavailable =
    'This workspace is unavailable or your access changed. No private information is shown.';

Map<String, dynamic> _workspace({
  String actor = 'owner',
  String business = 'owner',
  bool owner = true,
  List<String> permissions = const ['campaigns', 'analytics'],
}) => {
  'actorUid': actor,
  'businessId': business,
  'isOwner': owner,
  'businessName': 'Local refresh regression',
  'permissions': permissions,
};

Map<String, dynamic> _quote() => {
  'workerAmountCents': 10000,
  'platformFeeRateBasisPoints': 2000,
  'platformFeeCents': 2000,
  'businessChargeCents': 12000,
  'currency': 'usd',
  'quoteVersion': 1,
  'quoteDigest': 'local-amount-only-quote',
};

void _seed(CampaignRefreshFirebase backend) {
  // Synthetic read-only geometry represents the existing 48-point / 97.26 km²
  // test case; none of these fixtures updates or resizes the real test draft.
  final radius = math.sqrt(97263807 / (24 * math.sin(2 * math.pi / 48)));
  final points = List.generate(48, (i) {
    final angle = 2 * math.pi * i / 48;
    return <String, double>{
      'latitude': 39 + radius * math.sin(angle) / 111320,
      'longitude':
          -76.5 +
          radius * math.cos(angle) / (111320 * math.cos(39 * math.pi / 180)),
    };
  });
  backend.documents.addAll({
    'users/owner': {'role': 'business', 'active': true},
    'users/other': {'role': 'business', 'active': true},
    'businessWorkspaces/owner/members/owner': {'status': 'active'},
    _draftPath: {
      'businessId': 'owner',
      'campaignName': 'Refresh draft',
      'campaignType': 'flyer_distribution',
      'description': 'Saved description',
      'status': 'draft',
      'fundingStatus': 'not_reserved',
      'basePay': 75.0,
      'bonus': 25.0,
      'maximumWorkerBudget': 100.0,
      'scalerCount': 1,
      'materialQuantity': 500,
      'serviceArea': points,
      'serviceAreaPointCount': 48,
      'serviceAreaName': 'Saved test territory',
    },
    _zonePath: {
      'businessId': 'owner',
      'campaignId': 'refresh-draft',
      'zoneName': 'Zone 1',
      'status': 'unassigned',
      'serviceArea': points,
      'serviceAreaType': 'polygon',
      'serviceAreaPointCount': 48,
      'areaSquareMeters': 97263807,
      'homeCountStatus': 'unavailable',
      'analysisStatus': 'complete',
      'serverZoneMetricsVersion': 'geometry_v1_server',
      'targetPlanning': {
        'status': 'complete',
        'metric': 'Housing units in intersecting Census block groups',
        'source': 'U.S. Census Bureau ACS 5-Year',
        'sourceVersion': 'ACS_2024_5YR_B25034',
        'censusGeographiesUsed': List.generate(9, (i) => '$i'),
        'residentialProperties': 6237,
        'materialsAvailable': 500,
        'areaSquareMeters': 97263807,
        'checkedAtMs': 100,
      },
    },
  });
}

Future<void> _open(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(1100, 3600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final router = AppRouterDelegate(ScaledCircleApp.generateRoute)
    ..navigate(_route);
  await tester.pumpWidget(
    MaterialApp.router(
      routerDelegate: router,
      routeInformationParser: const AppRouteInformationParser(),
      routeInformationProvider: PlatformRouteInformationProvider(
        initialRouteInformation: RouteInformation(uri: Uri.parse(_route)),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byType(BusinessWorkspaceGate), findsOneWidget);
  expect(find.byType(CampaignRouteContent), findsOneWidget);
  expect(find.byType(CampaignDetailsScreen), findsOneWidget);
  expect(find.text(r'Planning total: $120.00'), findsOneWidget);
}

Future<void> _reveal(WidgetTester tester, Finder finder) async {
  final lists = find.byType(ListView);
  for (final offset in [const Offset(0, -700), const Offset(0, 700)]) {
    for (var i = 0; i < 20; i++) {
      if (finder.evaluate().isNotEmpty) {
        await tester.ensureVisible(finder);
        await tester.pumpAndSettle();
        return;
      }
      await tester.drag(lists.last, offset);
      await tester.pumpAndSettle();
    }
  }
  fail('Could not reveal $finder');
}

Future<void> _edit(WidgetTester tester) async {
  await _reveal(tester, find.text('Edit Campaign'));
  await tester.tap(find.text('Edit Campaign'));
  await tester.pumpAndSettle();
  expect(find.byType(EditCampaignScreen), findsOneWidget);
  for (final entry in {
    'Campaign Name': 'Unsaved refresh choice',
    'Base Pay': '80',
    'Bonus': '20',
  }.entries) {
    final field = find.widgetWithText(TextFormField, entry.key);
    await _reveal(tester, field);
    await tester.enterText(field, entry.value);
  }
}

void _unchangedEffects(CampaignRefreshFirebase backend, {int quoteCalls = 1}) {
  expect(backend.writes, isEmpty);
  expect(
    backend.calls.where((name) => name == 'quoteCampaignFunding'),
    hasLength(quoteCalls),
  );
  expect(
    backend.calls.where(
      (name) =>
          name != 'quoteCampaignFunding' &&
          name != 'getBusinessWorkspaceContext',
    ),
    isEmpty,
  );
  expect(backend.documents[_draftPath]!['campaignName'], 'Refresh draft');
  expect(backend.documents[_zonePath]!['serviceAreaPointCount'], 48);
  expect(backend.documents[_zonePath]!['areaSquareMeters'], 97263807);
}

void main() {
  late CampaignRefreshFirebase backend;
  late Map<String, dynamic> workspace;
  Future<Object?> Function()? refresh;

  setUp(() async {
    backend = CampaignRefreshFirebase();
    await backend.install();
    _seed(backend);
    workspace = _workspace();
    refresh = null;
    backend.onCall = (name, data) async {
      if (name == 'getBusinessWorkspaceContext') {
        return refresh == null ? workspace : await refresh!();
      }
      if (name == 'quoteCampaignFunding') return _quote();
      throw StateError('Unexpected callable: $name');
    };
  });
  tearDown(() async {
    BusinessWorkspaceSession.clear();
    await backend.restore();
  });

  testWidgets(
    'real campaign route keeps draft/editor/quote at 30, 60, 90s, then territory and resume',
    (tester) async {
      await _open(tester);
      final details = tester.state(find.byType(CampaignDetailsScreen));
      final quote = tester.state(find.byType(CampaignPlanningCost));
      await _edit(tester);
      final editor = tester.state(find.byType(EditCampaignScreen));
      final editorRoute = ModalRoute.of(
        tester.element(find.byType(EditCampaignScreen)),
      );
      for (final seconds in [30, 60, 90]) {
        await tester.pump(const Duration(seconds: 30));
        await tester.pumpAndSettle();
        expect(
          tester.state(find.byType(EditCampaignScreen)),
          same(editor),
          reason: '$seconds seconds',
        );
        expect(
          ModalRoute.of(tester.element(find.byType(EditCampaignScreen))),
          same(editorRoute),
        );
        expect(
          tester.state(find.byType(CampaignDetailsScreen, skipOffstage: false)),
          same(details),
        );
        expect(
          tester.state(find.byType(CampaignPlanningCost, skipOffstage: false)),
          same(quote),
        );
        expect(
          tester
              .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Base Pay'),
              )
              .controller!
              .text,
          '80',
        );
        expect(
          tester
              .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Bonus'),
              )
              .controller!
              .text,
          '20',
        );
        _unchangedEffects(backend);
      }
      await _reveal(
        tester,
        find.widgetWithText(TextFormField, 'Campaign Name'),
      );
      expect(find.text('Unsaved refresh choice'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await _reveal(tester, find.text('Manage Campaign Zones'));
      await tester.tap(find.text('Manage Campaign Zones'));
      await tester.pumpAndSettle();
      await _reveal(tester, find.byType(ZoneIntelligenceCard));
      expect(find.text('Regional housing estimate'), findsOneWidget);
      expect(find.text('6,237 units'), findsOneWidget);
      expect(find.text('Requires route/stop review'), findsOneWidget);
      expect(find.text('500'), findsOneWidget);
      await _reveal(tester, find.text('Edit Zone'));
      await tester.tap(find.text('Edit Zone'));
      await tester.pumpAndSettle();
      expect(find.byType(CampaignAreaScreen), findsOneWidget);
      final area = tester.state(find.byType(CampaignAreaScreen));
      final polygon = tester
          .widget<PolygonLayer>(find.byType(PolygonLayer))
          .polygons
          .first
          .points
          .toList();
      expect(polygon, hasLength(48));
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 30));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(CampaignAreaScreen)), same(area));
      expect(
        tester
            .widget<PolygonLayer>(find.byType(PolygonLayer))
            .polygons
            .first
            .points,
        polygon,
      );
      expect(
        tester
            .widget<CampaignAreaScreen>(find.byType(CampaignAreaScreen))
            .campaignReference
            .path,
        _zonePath,
      );
      _unchangedEffects(backend);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(CampaignZonesScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await _reveal(tester, find.byType(CampaignPlanningCost));
      expect(find.text(r'Planning total: $120.00'), findsOneWidget);
      expect(find.text(r'Maximum Scaler pay: $100.00'), findsOneWidget);
      expect(find.text(r'Platform fee (20%): $20.00'), findsOneWidget);
      expect(backend.gets.where((path) => path == _draftPath), hasLength(1));
      expect(
        backend.calls
            .where((name) => name == 'getBusinessWorkspaceContext')
            .length,
        greaterThanOrEqualTo(6),
      );
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'equivalent permission order does not pop the real unsaved editor',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      final editor = tester.state(find.byType(EditCampaignScreen));
      workspace = _workspace(permissions: ['analytics', 'campaigns']);
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsOneWidget);
      expect(tester.state(find.byType(EditCampaignScreen)), same(editor));
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'slow refresh retains editor; failed refresh closes private overlays and retry recovers saved draft',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      final editor = tester.state(find.byType(EditCampaignScreen));
      final pending = Completer<Object?>();
      refresh = () => pending.future;
      await tester.pump(const Duration(seconds: 30));
      await tester.pump(const Duration(seconds: 20));
      expect(tester.state(find.byType(EditCampaignScreen)), same(editor));
      pending.complete(workspace);
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(EditCampaignScreen)), same(editor));
      refresh = () async => throw FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'Access changed',
      );
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsNothing);
      expect(find.text(_unavailable), findsOneWidget);
      expect(BusinessWorkspaceSession.value, isNull);
      _unchangedEffects(backend);
      refresh = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Refresh draft'), findsOneWidget);
      expect(find.text(r'Planning total: $120.00'), findsOneWidget);
      _unchangedEffects(backend, quoteCalls: 2);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'membership revocation invalidates an older in-flight successful refresh',
    (tester) async {
      workspace = _workspace(owner: false);
      await _open(tester);
      await _edit(tester);
      final pending = Completer<Object?>();
      refresh = () => pending.future;
      await tester.pump(const Duration(seconds: 30));
      backend.emitDocument('businessWorkspaces/owner/members/owner', {
        'status': 'revoked',
      });
      await tester.pumpAndSettle();
      expect(find.text(_unavailable), findsOneWidget);
      expect(find.byType(EditCampaignScreen), findsNothing);
      pending.complete(workspace);
      await tester.pumpAndSettle();
      expect(find.text(_unavailable), findsOneWidget);
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      expect(BusinessWorkspaceSession.value, isNull);
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'workspace identity change removes the previous workspace campaign',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      workspace = _workspace(business: 'other-business');
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsNothing);
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      expect(
        find.text("You don't have access to this campaign."),
        findsOneWidget,
      );
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('prior-account refresh result cannot populate the next account', (
    tester,
  ) async {
    await _open(tester);
    await _edit(tester);
    final pending = Completer<Object?>();
    refresh = () => pending.future;
    await tester.pump(const Duration(seconds: 30));
    workspace = _workspace(actor: 'other', business: 'other');
    refresh = null;
    backend.setUser('other');
    await tester.pumpAndSettle();
    expect(find.byType(EditCampaignScreen), findsNothing);
    expect(find.byType(CampaignDetailsScreen), findsNothing);
    expect(
      find.text("You don't have access to this campaign."),
      findsOneWidget,
    );
    pending.complete(_workspace());
    await tester.pumpAndSettle();
    expect(find.byType(CampaignDetailsScreen), findsNothing);
    expect(BusinessWorkspaceSession.value?['actorUid'], 'other');
    expect(backend.writes, isEmpty);
    backend.setUser(null);
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(CampaignDetailsScreen), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'real permission loss closes the editor and denies the campaign route',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      workspace = _workspace(owner: false, permissions: []);
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsNothing);
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      expect(
        find.text('Your workspace responsibilities do not include this page.'),
        findsOneWidget,
      );
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'active membership permission change supersedes a pending older response',
    (tester) async {
      workspace = _workspace(owner: false);
      await _open(tester);
      await _edit(tester);
      final pending = Completer<Object?>();
      refresh = () => pending.future;
      await tester.pump(const Duration(seconds: 30));
      final oldWorkspace = workspace;
      workspace = _workspace(owner: false, permissions: []);
      refresh = null;
      backend.emitDocument('businessWorkspaces/owner/members/owner', {
        'status': 'active',
        'permissions': <String>[],
      });
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsNothing);
      expect(
        find.text('Your workspace responsibilities do not include this page.'),
        findsOneWidget,
      );
      pending.complete(oldWorkspace);
      await tester.pumpAndSettle();
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      expect(BusinessWorkspaceSession.value?['permissions'], isEmpty);
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'retry reattaches a terminated membership listener and enforces later revocation',
    (tester) async {
      workspace = _workspace(owner: false);
      await _open(tester);
      await _edit(tester);
      const memberPath = 'businessWorkspaces/owner/members/owner';
      expect(
        backend.subscriptions.where((path) => path == memberPath),
        hasLength(1),
      );
      backend.emitDocumentError(
        memberPath,
        StateError('Membership listener terminated'),
      );
      await tester.pumpAndSettle();
      expect(find.text(_unavailable), findsOneWidget);
      expect(find.byType(EditCampaignScreen), findsNothing);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byType(CampaignDetailsScreen), findsOneWidget);
      expect(
        backend.subscriptions.where((path) => path == memberPath),
        hasLength(2),
      );
      backend.emitDocument(memberPath, {'status': 'revoked'});
      await tester.pumpAndSettle();
      expect(find.text(_unavailable), findsOneWidget);
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      _unchangedEffects(backend, quoteCalls: 2);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'timed-out refresh remains closed until retry and ignores late result',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      final pending = Completer<Object?>();
      refresh = () => pending.future;
      await tester.pump(const Duration(seconds: 30));
      await tester.pump(const Duration(seconds: 26));
      await tester.pumpAndSettle();
      expect(find.text(_unavailable), findsOneWidget);
      expect(find.byType(EditCampaignScreen), findsNothing);
      refresh = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      final details = tester.state(find.byType(CampaignDetailsScreen));
      pending.complete(_workspace(business: 'stale-workspace'));
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(CampaignDetailsScreen)), same(details));
      expect(BusinessWorkspaceSession.value?['businessId'], 'owner');
      _unchangedEffects(backend, quoteCalls: 2);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'sign-out removes a private editor and rejects its pending refresh',
    (tester) async {
      await _open(tester);
      await _edit(tester);
      final pending = Completer<Object?>();
      refresh = () => pending.future;
      await tester.pump(const Duration(seconds: 30));
      backend.setUser(null);
      await tester.pumpAndSettle();
      expect(find.byType(EditCampaignScreen), findsNothing);
      expect(find.byType(LoginScreen), findsOneWidget);
      pending.complete(workspace);
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(CampaignDetailsScreen), findsNothing);
      expect(BusinessWorkspaceSession.value, isNull);
      _unchangedEffects(backend);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
