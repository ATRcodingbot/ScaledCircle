import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/campaign_list_actions.dart';
import 'package:flutter_app/screens/business/business_campaigns_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'support/campaign_refresh_firebase.dart';

void main() {
  Future<void> mount(
    WidgetTester tester,
    CampaignActionCall call, {
    String action = 'delete',
    VoidCallback? open,
    Object? Function()? session,
    bool useRealSession = false,
    double scale = 1,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(
          body: ListTile(
            title: const Text('Synthetic campaign'),
            onTap: open,
            trailing: CampaignListActions(
              businessId: 'owner',
              campaignId: 'fixture',
              call: call,
              sessionKey: useRealSession
                  ? null
                  : session ?? () => 'owner-session',
              onManage: open ?? () {},
            ),
          ),
        ),
      ),
    );
  }

  Map<String, dynamic> state(String action) => {
    'name': 'Synthetic campaign',
    'version': 'authoritative_version',
    'actions': [action],
    'reason': '',
    'financialNotice': 'Stops new work. No refund is requested.',
  };
  Future<void> choose(WidgetTester tester, String action) async {
    await tester.tap(find.byTooltip('Campaign actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(campaignActionLabels[action]!));
    await tester.pumpAndSettle();
  }

  for (final action in campaignActionLabels.keys) {
    testWidgets(
      '$action uses current server preview, named confirmation and confirmed success',
      (tester) async {
        final calls = <String>[];
        var opens = 0;
        await mount(tester, (op, input, key) async {
          calls.add(op);
          if (op == 'campaignListActions') return state(action);
          expect(input, {
            'campaignId': 'fixture',
            'action': action,
            'expectedVersion': 'authoritative_version',
          });
          expect(key!.length, greaterThan(16));
          return {'confirmed': true};
        }, open: () => opens++);
        await choose(tester, action);
        expect(calls, ['campaignListActions']);
        expect(opens, 0);
        expect(find.textContaining('‘Synthetic campaign’'), findsOneWidget);
        await tester.tap(
          find.widgetWithText(FilledButton, campaignActionLabels[action]!),
        );
        await tester.pumpAndSettle();
        expect(find.text('The server confirmed this change.'), findsOneWidget);
        expect(calls, ['campaignListActions', 'changeCampaignListState']);
        expect(opens, 0);
        await tester.tap(find.text('Done'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Synthetic campaign'));
        expect(opens, 1);
      },
    );
  }
  testWidgets(
    'Cancel never submits; assigned work receives only maintained manage path',
    (tester) async {
      var mutations = 0, opens = 0;
      await mount(tester, (op, input, key) async {
        if (op != 'campaignListActions') mutations++;
        return {
          ...state('close'),
          'actions': [],
          'reason': 'Assigned work must be resolved.',
        };
      }, open: () => opens++);
      await tester.tap(find.byTooltip('Campaign actions'));
      await tester.pumpAndSettle();
      expect(find.text('Cancel campaign'), findsNothing);
      expect(find.text('Delete draft'), findsNothing);
      await tester.tap(find.text('Open campaign / Manage work'));
      await tester.pumpAndSettle();
      expect(opens, 1);
      expect(mutations, 0);
    },
  );
  testWidgets(
    'uncertain reply keeps card, retry reuses logical request, no early success',
    (tester) async {
      final ids = <String?>[];
      await mount(tester, (op, input, key) async {
        if (op == 'campaignListActions') return state('delete');
        ids.add(key);
        if (ids.length == 1) throw TimeoutException('synthetic lost response');
        return {'confirmed': true, 'duplicate': true};
      });
      await choose(tester, 'delete');
      await tester.tap(find.widgetWithText(FilledButton, 'Delete draft'));
      await tester.pumpAndSettle();
      expect(find.text('The server confirmed this change.'), findsNothing);
      expect(find.text('Synthetic campaign'), findsOneWidget);
      await tester.tap(find.text('Retry safely'));
      await tester.pumpAndSettle();
      expect(ids.length, 2);
      expect(ids[0], ids[1]);
      expect(find.text('The server confirmed this change.'), findsOneWidget);
    },
  );
  testWidgets(
    'stale eligibility displays server reason without claiming success',
    (tester) async {
      await mount(tester, (op, input, key) async {
        if (op == 'campaignListActions') return state('close');
        throw FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'This Zone now has accepted work.',
        );
      });
      await choose(tester, 'close');
      await tester.tap(find.widgetWithText(FilledButton, 'Cancel campaign'));
      await tester.pumpAndSettle();
      expect(find.text('This Zone now has accepted work.'), findsOneWidget);
      expect(find.text('The server confirmed this change.'), findsNothing);
    },
  );
  testWidgets(
    'late preview and mutation response cannot update switched account UI',
    (tester) async {
      var session = 'first';
      final preview = Completer<Map<String, dynamic>>();
      await mount(
        tester,
        (_, input, key) => preview.future,
        session: () => session,
      );
      await tester.tap(find.byTooltip('Campaign actions'));
      await tester.pump();
      session = 'second';
      preview.complete(state('delete'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      final result = Completer<Map<String, dynamic>>();
      await mount(
        tester,
        (op, input, key) async =>
            op == 'campaignListActions' ? state('delete') : result.future,
        session: () => session,
      );
      await choose(tester, 'delete');
      await tester.tap(find.widgetWithText(FilledButton, 'Delete draft'));
      await tester.pump();
      session = 'third';
      result.complete({'confirmed': true});
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('The server confirmed this change.'), findsNothing);
    },
  );
  testWidgets('keyboard overflow and narrow 2x confirmation remain reachable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await mount(tester, (op, input, key) async => state('close'), scale: 2);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Cancel campaign'), findsOneWidget);
    await tester.ensureVisible(find.text('Cancel campaign'));
    await tester.tap(find.text('Cancel campaign'));
    await tester.pumpAndSettle();
    expect(
      find.widgetWithText(FilledButton, 'Cancel campaign').hitTestable(),
      findsOneWidget,
    );
    expect(find.text('Cancel').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test(
    'current/archived filtering never reopens completed work or exposes deleted drafts',
    () {
      expect(campaignInList({'status': 'deleted'}, archived: false), false);
      expect(
        campaignInList({
          'status': 'completed',
          'archived': true,
        }, archived: true),
        true,
      );
      expect(
        campaignInList({
          'status': 'completed',
          'archived': true,
        }, archived: false),
        false,
      );
      expect(
        campaignInList({
          'status': 'completed',
          'archived': false,
        }, archived: false),
        true,
      );
      expect(
        campaignInList({
          'status': 'closed',
          'fundingStatus': 'refund_pending',
        }, archived: false),
        true,
      );
    },
  );
  testWidgets(
    'equivalent real workspace refresh retains confirmation and permits server recheck',
    (tester) async {
      final backend = CampaignRefreshFirebase();
      await backend.install();
      var submitted = false;
      BusinessWorkspaceSession.value = {
        'actorUid': 'owner',
        'businessId': 'owner',
        'isOwner': true,
        'permissions': ['campaigns', 'analytics'],
      };
      await mount(tester, (op, input, key) async {
        if (op == 'campaignListActions') return state('delete');
        submitted = true;
        return {'confirmed': true};
      }, useRealSession: true);
      await choose(tester, 'delete');
      BusinessWorkspaceSession.value = {
        'actorUid': 'owner',
        'businessId': 'owner',
        'isOwner': true,
        'permissions': ['analytics', 'campaigns'],
      };
      await tester.tap(find.widgetWithText(FilledButton, 'Delete draft'));
      await tester.pumpAndSettle();
      expect(submitted, true);
      expect(find.text('The server confirmed this change.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await backend.restore();
      BusinessWorkspaceSession.clear();
    },
  );
  testWidgets(
    'actual list updates from server stream; Archived remains reachable when empty and survives Back',
    (tester) async {
      final backend = CampaignRefreshFirebase();
      await backend.install();
      BusinessWorkspaceSession.value = {
        'actorUid': 'owner',
        'businessId': 'owner',
        'permissions': ['campaigns'],
      };
      backend.documents.addAll({
        'campaigns/one': {
          'businessId': 'owner',
          'campaignName': 'One',
          'status': 'draft',
        },
        'campaigns/two': {
          'businessId': 'owner',
          'campaignName': 'Two',
          'status': 'completed',
          'archived': true,
        },
      });
      backend.onCall = (name, data) async => {'ids': <String>[]};
      final bucket = PageStorageBucket();
      await tester.pumpWidget(
        MaterialApp(
          home: PageStorage(
            bucket: bucket,
            child: BusinessCampaignsScreen(
              businessId: 'owner',
              onCreateCampaign: () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('One'), findsOneWidget);
      expect(find.text('Two'), findsNothing);
      await tester.tap(find.text('Archived'));
      await tester.pumpAndSettle();
      expect(find.text('Two'), findsOneWidget);
      expect(find.text('One'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        MaterialApp(
          home: PageStorage(
            bucket: bucket,
            child: BusinessCampaignsScreen(
              businessId: 'owner',
              onCreateCampaign: () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Two'), findsOneWidget);
      backend.emitDocument('campaigns/two', {
        ...backend.documents['campaigns/two']!,
        'archived': false,
      });
      await tester.pumpAndSettle();
      expect(find.text('No archived campaigns'), findsOneWidget);
      await tester.tap(find.text('Current'));
      await tester.pumpAndSettle();
      expect(find.text('Two'), findsOneWidget);
      backend.emitDocument('campaigns/one', {
        ...backend.documents['campaigns/one']!,
        'status': 'deleted',
        'hiddenFromBusinessHistory': true,
      });
      await tester.pumpAndSettle();
      expect(find.text('One'), findsNothing);
      expect(backend.writes, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await backend.restore();
      BusinessWorkspaceSession.clear();
    },
  );
}
