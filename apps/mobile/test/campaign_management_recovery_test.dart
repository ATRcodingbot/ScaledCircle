import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/app_shell_identity.dart';
import 'package:flutter_app/navigation/campaign_route_content.dart';
import 'package:flutter_app/screens/campaigns/campaign_details_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'support/campaign_refresh_firebase.dart';

void main() {
  late CampaignRefreshFirebase backend;
  late AppRouterDelegate router;
  Future<Object?> Function(Map<String, dynamic>)? mutate;
  FirebaseException? loadError;
  setUp(() async {
    backend = CampaignRefreshFirebase();
    await backend.install();
    BusinessWorkspaceSession.value = {
      'actorUid': 'owner',
      'businessId': 'workspace',
      'permissions': ['campaigns'],
    };
    backend.documents['campaigns/fixture'] = {
      'businessId': 'workspace',
      'campaignName': 'Synthetic unfinished draft',
      'status': 'draft',
      'executionMode': 'marketplace',
      'basePay': 0,
      'bonus': 0,
    };
    mutate = null;
    loadError = null;
    backend.onCall = (name, data) async {
      if (name == 'businessOperationsV1') {
        expect(data['businessId'], 'workspace');
        if (data['operation'] == 'campaignListActions') {
          return {
            'name': 'Synthetic unfinished draft',
            'actions': ['delete'],
            'version': 'v1',
          };
        }
        return await mutate!(data);
      }
      if (name == 'quoteCampaignFunding') {
        return {
          'workerAmountCents': 0,
          'platformFeeCents': 0,
          'businessChargeCents': 0,
          'currency': 'usd',
        };
      }
      if (name == 'getCampaignFundingState') {
        return {'fundingStatus': 'unfunded'};
      }
      throw StateError('Unexpected callable $name');
    };
    router = AppRouterDelegate(
      (settings) => MaterialPageRoute(
        settings: settings,
        builder: (_) {
          if (settings.name == '/business/campaigns') {
            return const Scaffold(body: Text('Workspace campaign list'));
          }
          return CampaignRouteContent(
            campaignId: 'fixture',
            actorUid: 'owner',
            workspaceId: 'workspace',
            isAdmin: false,
            fallbackRoute: '/business',
            load: () => loadError == null
                ? FirebaseFirestore.instance.doc('campaigns/fixture').get()
                : Future.error(loadError!),
            builder: (doc) => CampaignDetailsScreen(campaign: doc),
          );
        },
      ),
    )..navigate('/campaign/fixture');
  });
  tearDown(() async {
    BusinessWorkspaceSession.clear();
    await backend.restore();
  });
  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1100, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      AppShellIdentity(
        uid: 'owner',
        profile: const {'role': 'business'},
        child: MaterialApp.router(
          routerDelegate: router,
          routeInformationProvider: PlatformRouteInformationProvider(
            initialRouteInformation: RouteInformation(
              uri: Uri.parse('/campaign/fixture'),
            ),
          ),
          routeInformationParser: const AppRouteInformationParser(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> confirm(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Delete Draft'));
    await tester.tap(find.text('Delete Draft'));
    await tester.pumpAndSettle();
    expect(find.text('Delete ‘Synthetic unfinished draft’?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete draft'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'confirmed removal replaces sole app page with same-workspace Campaigns; old link recovers',
    (tester) async {
      mutate = (data) async {
        backend.emitDocument('campaigns/fixture', {
          ...backend.documents['campaigns/fixture']!,
          'status': 'deleted',
        });
        return {'confirmed': true};
      };
      await open(tester);
      await confirm(tester);
      expect(router.currentConfiguration.path, '/business/campaigns');
      expect(find.text('Workspace campaign list'), findsOneWidget);
      await router.setNewRoutePath(Uri.parse('/campaign/fixture'));
      await tester.pumpAndSettle();
      expect(find.text('Campaign no longer available'), findsOneWidget);
      await tester.tap(find.text('Return to Campaigns'));
      await tester.pumpAndSettle();
      expect(find.text('Workspace campaign list'), findsOneWidget);
      expect(backend.writes, isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'confirmation Cancel and rejected deletion keep a usable detail route',
    (tester) async {
      mutate = (_) async => throw FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'Funding requires reconciliation.',
      );
      await open(tester);
      await tester.ensureVisible(find.text('Delete Draft'));
      await tester.tap(find.text('Delete Draft'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel').last);
      await tester.pumpAndSettle();
      expect(
        backend.callArguments.where(
          (r) => (r['data'] as Map)['operation'] == 'changeCampaignListState',
        ),
        isEmpty,
      );
      await confirm(tester);
      expect(find.text('Funding requires reconciliation.'), findsOneWidget);
      expect(router.currentConfiguration.path, '/campaign/fixture');
      expect(find.text('Retry safely'), findsOneWidget);
      expect(backend.writes, isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'lost response reuses logical receipt; no automatic second deletion',
    (tester) async {
      final ids = <Object?>[];
      mutate = (data) async {
        ids.add(data['requestId']);
        if (ids.length == 1) throw TimeoutException('fixture');
        return {'confirmed': true, 'duplicate': true};
      };
      await open(tester);
      await confirm(tester);
      expect(ids, hasLength(1));
      expect(router.currentConfiguration.path, '/campaign/fixture');
      await tester.tap(find.text('Retry safely'));
      await tester.pumpAndSettle();
      expect(ids[0], ids[1]);
      expect(router.currentConfiguration.path, '/business/campaigns');
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'switching account while delete is pending cannot navigate next workspace',
    (tester) async {
      final pending = Completer<Object?>();
      mutate = (_) => pending.future;
      await open(tester);
      await tester.ensureVisible(find.text('Delete Draft'));
      await tester.tap(find.text('Delete Draft'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Delete draft'));
      await tester.pump();
      backend.setUser('another');
      BusinessWorkspaceSession.value = {
        'actorUid': 'another',
        'businessId': 'other',
        'permissions': ['campaigns'],
      };
      pending.complete({'confirmed': true});
      await tester.pumpAndSettle();
      expect(router.currentConfiguration.path, '/campaign/fixture');
      expect(find.text('Workspace campaign list'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('already hard-deleted deep link offers Campaigns recovery', (
    tester,
  ) async {
    backend.documents.remove('campaigns/fixture');
    await open(tester);
    expect(find.text('Campaign no longer available'), findsOneWidget);
    expect(find.text('Return to Campaigns'), findsOneWidget);
    expect(backend.calls, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
  for (final code in ['permission-denied', 'not-found', 'unavailable']) {
    testWidgets('read $code recovers without exposing another workspace', (
      tester,
    ) async {
      loadError = FirebaseException(plugin: 'cloud_firestore', code: code);
      await open(tester);
      expect(
        find.text(
          code == 'unavailable'
              ? 'Campaign temporarily unavailable'
              : 'Campaign no longer available',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Return to Campaigns'));
      await tester.pumpAndSettle();
      expect(find.text('Workspace campaign list'), findsOneWidget);
      expect(backend.writes, isEmpty);
      expect(backend.calls, isEmpty);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
