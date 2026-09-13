import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/workspace_presentation.dart';
import 'package:flutter_app/screens/business/business_member_home.dart';
import 'package:flutter_app/screens/business/business_team_screen.dart';
import 'package:flutter_app/screens/auth/delete_account_screen.dart';
import 'package:flutter_app/screens/notifications/notifications_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter_app/theme/app_theme.dart';

const limited = <String, dynamic>{
  'actorUid': 'fresh-member',
  'isOwner': false,
  'businessName': 'Example Business',
  'permissions': ['scheduleView', 'scheduleEdit'],
};

class TeamService extends BusinessWorkspaceService {
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async => {
    'businessId': 'owner',
    'isOwner': true,
    'permissions': businessPermissionLabels.keys.toList(),
    'seatLimit': 10,
    'seatsUsed': 2,
    'seatsReserved': 0,
    'members': [],
    'invitations': [],
    'owner': {'name': 'Owner', 'email': 'owner@example.test'},
  };
}

void main() {
  setUpAll(() async {
    final font = Platform.environment['SC_QA_FONT_PATH'];
    if (font != null) {
      for (final family in ['Roboto', 'Ahem']) {
        final loader = FontLoader(family)
          ..addFont(
            Future.value(ByteData.sublistView(File(font).readAsBytesSync())),
          );
        await loader.load();
      }
    }
  });
  test('schedule-only presentation rejects all ungranted routes', () {
    final p = WorkspacePresentation(limited);
    expect(p.allowsRoute('/business/schedule'), isTrue);
    for (final route in [
      '/business/growth',
      '/business/campaigns',
      '/business/results',
      '/business/team',
      '/business/billing',
      '/business/attribution',
      '/campaign/private',
      '/job-room/private',
    ]) {
      expect(p.allowsRoute(route), isFalse, reason: route);
    }
  });
  testWidgets(
    'limited root creates Schedule and never constructs owner campaign subscriptions',
    (tester) async {
      var ownerBuilds = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessWorkspaceHome(
            workspace: limited,
            ownerBuilder: (_) {
              ownerBuilds++;
              throw StateError('Unauthorized owner queries');
            },
            scheduleBuilder: (_) => const Scaffold(body: Text('Schedule')),
          ),
        ),
      );
      expect(find.text('Schedule'), findsOneWidget);
      expect(ownerBuilds, 0);
      for (final text in [
        'Growth',
        'Campaigns',
        'Billing',
        'Team',
        'Customers',
      ]) {
        expect(find.text(text), findsNothing);
      }
    },
  );
  testWidgets('no responsibilities produces friendly workspace state', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessWorkspaceHome(
          workspace: {...limited, 'permissions': []},
          ownerBuilder: (_) => throw StateError('Owner query'),
          scheduleBuilder: (_) => throw StateError('Schedule query'),
        ),
      ),
    );
    expect(
      find.textContaining("hasn't assigned workspace responsibilities"),
      findsOneWidget,
    );
    expect(find.byTooltip('Account'), findsOneWidget);
    expect(find.byTooltip('Notifications'), findsOneWidget);
  });
  test(
    'notification targets obey responsibilities; own account notice stays informational',
    () {
      expect(
        workspaceNotificationDestination({
          'type': 'business_schedule_update',
        }, limited)?.label,
        'View Schedule',
      );
      for (final notice in [
        {'type': 'application_received', 'campaignId': 'private'},
        {'type': 'completion_submitted', 'zoneId': 'private'},
        {
          'deepLink': {'destination': 'business_growth_agents'},
        },
        {'type': 'worker_earning_established'},
      ]) {
        expect(workspaceNotificationDestination(notice, limited), isNull);
      }
      expect(
        workspaceNotificationDestination({'type': 'account_security'}, limited),
        isNull,
      );
    },
  );
  testWidgets('notification failures never render provider error strings', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationsScreen(
          currentUserId: 'fresh-member',
          workspace: limited,
          notificationsStream: Stream.error(
            Exception(
              '[cloud_firestore/permission-denied] Missing or insufficient permissions',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining("We couldn't load your notifications"),
      findsOneWidget,
    );
    expect(find.textContaining('permission-denied'), findsNothing);
    expect(find.textContaining('FirebaseException'), findsNothing);
  });
  testWidgets(
    'explicit Select All, Clear All and individual responsibility toggles',
    (tester) async {
      tester.view.physicalSize = const Size(1100, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessTeamScreen(businessId: 'owner', service: TeamService()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invite Team Member'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Adjust responsibilities'));
      await tester.pumpAndSettle();
      List<CheckboxListTile> boxes() => tester
          .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
          .toList();
      expect(
        boxes().where((b) => b.value == true).length,
        2,
      ); // unchanged Analyst preset
      await tester.tap(find.text('Select All'));
      await tester.pumpAndSettle();
      expect(boxes().length, businessPermissionLabels.length);
      expect(boxes().every((b) => b.value == true), isTrue);
      await tester.tap(find.text('Clear All'));
      await tester.pumpAndSettle();
      expect(boxes().every((b) => b.value == false), isTrue);
      await tester.tap(find.widgetWithText(CheckboxListTile, 'View schedule'));
      await tester.pumpAndSettle();
      expect(boxes().where((b) => b.value == true).length, 1);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
    },
  );
  for (final size in [
    const Size(320, 780),
    const Size(600, 850),
    const Size(1280, 960),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
        'Delete Account fields and help do not overlap ${size.width} at $scale',
        (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final boundary = GlobalKey();
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.darkTheme,
              builder: (_, child) => MediaQuery(
                data: MediaQueryData(
                  size: size,
                  textScaler: TextScaler.linear(scale),
                ),
                child: child!,
              ),
              home: RepaintBoundary(
                key: boundary,
                child: DeleteAccountScreen(
                  staging: true,
                  call: (_) async => {'canDelete': true, 'blockers': []},
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final field = find.byKey(const Key('delete-current-password')),
              help = find.byKey(const Key('delete-password-help'));
          await tester.scrollUntilVisible(
            field,
            150,
            scrollable: find.byType(Scrollable).last,
          );
          await tester.pumpAndSettle();
          double offset() => tester
              .state<ScrollableState>(find.byType(Scrollable).last)
              .position
              .pixels;
          final fieldBottom = tester.getRect(field).bottom + offset();
          await tester.scrollUntilVisible(
            help,
            150,
            scrollable: find.byType(Scrollable).last,
          );
          await tester.pumpAndSettle();
          expect(fieldBottom, lessThan(tester.getRect(help).top + offset()));
          expect(tester.takeException(), isNull);
          final dir = Platform.environment['SC_QA_RENDER_DIR'];
          if (dir != null) {
            await tester.runAsync(() async {
              final image =
                  await (boundary.currentContext!.findRenderObject()
                          as RenderRepaintBoundary)
                      .toImage();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              File(
                '$dir/delete-${size.width.toInt()}-$scale.png',
              ).writeAsBytesSync(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
          await tester.scrollUntilVisible(
            find.widgetWithText(FilledButton, 'Delete Account'),
            200,
            scrollable: find.byType(Scrollable).last,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
