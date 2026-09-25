import 'dart:async';
import 'package:flutter/foundation.dart';
// Snapshot test doubles only; no Firestore SDK implementation is shipped.
// ignore_for_file: subtype_of_sealed_class
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter_app/screens/notifications/notifications_screen.dart';

class _Document implements QueryDocumentSnapshot {
  _Document(this.value);
  final Map<String, dynamic> value;
  @override
  String get id => "notice-one";
  @override
  Map<String, dynamic> data() => {'userId': 'self', ...value};
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Snapshot implements QuerySnapshot {
  _Snapshot(this.docs);
  @override
  final List<QueryDocumentSnapshot> docs;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('account switch rejects old list and late detail result', (
    tester,
  ) async {
    final account = ValueNotifier('self');
    final resolve = Completer<Map<String, dynamic>>();
    var reads = 0;
    final rows = _Snapshot([
      _Document({
        'type': 'agent_daily_brief',
        'title': 'Private saved brief',
        'message': 'Private summary',
        'deepLink': {'destination': 'business_growth_agents'},
      }),
    ]);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<String>(
          valueListenable: account,
          builder: (_, uid, _) => NotificationsScreen(
            currentUserId: uid,
            notificationsStream: Stream.value(rows),
            resolveNotification: (_) => resolve.future,
            markNotificationRead: (_) async {
              reads++;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Private saved brief'));
    await tester.pump();
    account.value = 'other';
    await tester.pumpAndSettle();
    expect(find.text('Private saved brief'), findsNothing);
    resolve.complete({
      'available': true,
      'type': 'agent_daily_brief',
      'deepLink': {'destination': 'business_growth_agents'},
    });
    await tester.pumpAndSettle();
    expect(find.text('Private summary'), findsNothing);
    expect(reads, 0);
    account.value = 'self';
    await tester.pumpAndSettle();
    expect(find.text('Private saved brief'), findsOneWidget);
  });
  testWidgets('open summary closes on account switch and old tap is denied', (
    tester,
  ) async {
    final account = ValueNotifier('self');
    var reads = 0;
    final rows = _Snapshot([
      _Document({
        'type': 'agent_daily_brief',
        'title': 'Original brief',
        'message': 'Recipient-only summary',
        'deepLink': {'destination': 'business_growth_agents'},
      }),
    ]);
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<String>(
          valueListenable: account,
          builder: (_, uid, _) => NotificationsScreen(
            currentUserId: uid,
            notificationsStream: Stream.value(rows),
            resolveNotification: (_) async => {
              'available': uid == 'self',
              'type': 'agent_daily_brief',
              'deepLink': {'destination': 'business_growth_agents'},
            },
            markNotificationRead: (_) async {
              reads++;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Original brief'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(reads, 1);
    account.value = 'other';
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Original brief'), findsNothing);
    expect(reads, 1);
  });
  test('official weather notice opens its exact saved alert', () {
    final target = notificationDestination({
      'type': 'weather_opportunity',
      'deepLink': {
        'destination': 'weather_alert',
        'alertId': 'owner_event_revision',
      },
    });
    expect(target?.route, '/business/weather?alert=owner_event_revision');
    expect(target?.kind, 'route');
  });
  test(
    'Email, Schedule, Job Room and Earnings retain their shared destinations',
    () {
      expect(
        notificationDestination({
          'deepLink': {
            'destination': 'business_email',
            'operationId': 'original',
          },
        })?.route,
        '/business/email-connection?operation=original',
      );
      expect(
        notificationDestination({
          'deepLink': {
            'destination': 'business_schedule',
            'businessId': 'owner',
            'itemId': 'appointment',
            'startMs': 123,
          },
        })?.route,
        '/business/schedule?workspace=owner&item=appointment&at=123',
      );
      expect(
        notificationDestination({
          'type': 'zone_completion_submitted',
          'zoneId': 'zone',
          'campaignId': 'campaign',
        })?.route,
        '/job-room/zone',
      );
      expect(
        notificationDestination({'type': 'earnings_available'})?.kind,
        'earnings',
      );
    },
  );
  for (final width in [390.0, 1280.0]) {
    testWidgets(
      'Social card and CTA open current authorized state with Back at $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var receipts = 0;
        await tester.pumpWidget(
          MaterialApp(
            onGenerateRoute: (settings) {
              expect(
                settings.name,
                '/business/social-operations?item=post&provider=instagram',
              );
              return MaterialPageRoute(
                builder: (_) => Scaffold(
                  appBar: AppBar(title: const Text('Current post')),
                  body: const Text('Scheduled'),
                ),
              );
            },
            home: NotificationsScreen(
              currentUserId: 'owner',
              resolveNotification: (_) async => {
                'available': true,
                'userId': 'owner',
                'type': 'social_drafts_ready',
                'title': 'Instagram post — scheduled',
                'message': 'Current post state',
                'deepLink': {
                  'destination': 'social_draft',
                  'itemId': 'post',
                  'provider': 'instagram',
                },
              },
              markNotificationRead: (_) async {
                receipts++;
                throw StateError('receipt offline');
              },
              notificationsStream: Stream.value(
                _Snapshot([
                  _Document({
                    'userId': 'owner',
                    'type': 'social_drafts_ready',
                    'title': 'Old review',
                    'read': false,
                    'deepLink': {'destination': 'social_review'},
                  }),
                ]),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (!kIsWeb) {
          expect(find.text('Old review'), findsOneWidget);
          expect(find.text('View Social Post'), findsNothing);
          expect(find.text('View Social'), findsNothing);
          expect(receipts, 0);
          return;
        }
        expect(find.text('Old review'), findsNothing);
        await tester.tap(find.text('Instagram post — scheduled'));
        await tester.pumpAndSettle();
        expect(find.text('Scheduled'), findsOneWidget);
        await tester.pageBack();
        await tester.pumpAndSettle();
        await tester.tap(find.text('View Social Post'));
        await tester.pumpAndSettle();
        expect(find.text('Scheduled'), findsOneWidget);
        expect(receipts, 2);
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.text('Notifications'), findsOneWidget);
      },
    );
  }
  testWidgets('failed route is retryable without an opened receipt', (
    tester,
  ) async {
    var receipts = 0;
    await tester.pumpWidget(
      MaterialApp(
        onGenerateRoute: (_) => throw StateError('route unavailable'),
        home: NotificationsScreen(
          currentUserId: 'owner',
          resolveNotification: (_) async => {
            'available': true,
            'deepLink': {'destination': 'business_schedule'},
          },
          markNotificationRead: (_) async {
            receipts++;
          },
          notificationsStream: Stream.value(
            _Snapshot([
              _Document({
                'userId': 'owner',
                'title': 'Open notice',
                'read': false,
                'deepLink': {'destination': 'business_schedule'},
              }),
            ]),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open notice'));
    await tester.pumpAndSettle();
    expect(receipts, 0);
    expect(find.text('Retry'), findsOneWidget);
  });
  test(
    'verified work opens Earnings without requiring campaign/private logistics reads',
    () {
      for (final type in [
        'worker_earning_established',
        'payout_approved',
        'earnings_available',
      ]) {
        final target = notificationDestination({'type': type});
        expect(target?.kind, 'earnings');
        expect(target?.label, 'View Earnings');
      }
    },
  );
  test(
    'submitted/canceled work and assignments have maintained details destinations',
    () {
      for (final type in [
        'completion_submitted',
        'zone_completion_submitted',
        'campaign_canceled',
        'campaign_cancelled',
      ]) {
        expect(
          notificationDestination({
            'type': type,
            'zoneId': 'zone',
            'campaignId': 'campaign',
          })?.route,
          '/job-room/zone',
        );
        expect(
          notificationDestination({
            'type': type,
            'campaignId': 'campaign',
          })?.route,
          '/campaign/campaign',
        );
      }
    },
  );
  test('unknown or incomplete destinations remain informational', () {
    for (final data in [
      {},
      {'type': 'unknown', 'campaignId': 'campaign'},
      {'type': 'job_assignment'},
      {
        'deepLink': {'destination': 'job_room'},
      },
      {'type': 'job_assignment', 'zoneId': 'bad/path'},
    ]) {
      expect(notificationDestination(Map<String, dynamic>.from(data)), isNull);
    }
  });
  testWidgets('phone notifications show no fake action and handle long titles', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationsScreen(
          currentUserId: 'self',
          resolveNotification: (_) async => {
            'available': true,
            'type': 'worker_earning_established',
          },
          notificationsStream: Stream.value(
            _Snapshot([
              _Document({
                'title': 'Work verified — earnings available',
                'type': 'worker_earning_established',
                'read': true,
              }),
              _Document({
                'title':
                    'An informational message with a longer title that should wrap on a small screen',
                'type': 'information',
                'read': true,
              }),
            ]),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('View Earnings'), findsOneWidget);
    expect(find.text('View'), findsNothing);
    expect(find.byIcon(Icons.arrow_forward), findsOneWidget);
    final informational = find.ancestor(
      of: find.textContaining('An informational message'),
      matching: find.byType(InkWell),
    );
    expect(tester.widget<InkWell>(informational).onTap, isNull);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('View Earnings'));
    await tester.pumpAndSettle();
    expect(find.text('Earnings'), findsOneWidget);
    expect(find.text('Notifications'), findsNothing);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('View Earnings'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'Core native daily brief opens same authorized saved summary and marks only it read',
    (tester) async {
      var reads = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationsScreen(
            currentUserId: 'self',
            resolveNotification: (_) async => {
              'available': true,
              'type': 'agent_daily_brief',
              'deepLink': {
                'destination': 'business_growth_agents',
                'reportId': 'report-one',
              },
            },
            markNotificationRead: (_) async {
              reads++;
            },
            notificationsStream: Stream.value(
              _Snapshot([
                _Document({
                  'type': 'agent_daily_brief',
                  'title': 'Daily research summary',
                  'message': 'No new leads. Last run 2026-09-25T13:00:00Z',
                  'read': false,
                  'deepLink': {
                    'destination': 'business_growth_agents',
                    'reportId': 'report-one',
                  },
                }),
              ]),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('2026-09-25T13:00:00Z'), findsNothing);
      await tester.tap(find.text('Read summary'));
      await tester.pumpAndSettle();
      expect(find.textContaining('2026-09-25T13:00:00Z'), findsOneWidget);
      expect(
        find.textContaining('Full Growth reports are available on the web'),
        findsOneWidget,
      );
      expect(reads, 1);
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(reads, 1);
    },
  );
  for (final available in [true, false]) {
    testWidgets(
      'server destination authority available=$available survives read failure',
      (tester) async {
        var resolutions = 0;
        var readAttempts = 0;
        String? opened;
        await tester.pumpWidget(
          MaterialApp(
            onGenerateRoute: (settings) {
              opened = settings.name;
              return MaterialPageRoute(
                builder: (_) => const Scaffold(body: Text('Authorized record')),
              );
            },
            home: NotificationsScreen(
              currentUserId: 'self',
              resolveNotification: (id) async {
                expect(id, 'notice-one');
                resolutions++;
                return {
                  'available': available,
                  'deepLink': {
                    'destination': 'business_inquiry',
                    'leadId': 'current-lead',
                    'businessId': 'business-one',
                  },
                };
              },
              markNotificationRead: (_) async {
                readAttempts++;
                throw StateError('receipt unavailable');
              },
              notificationsStream: Stream.value(
                _Snapshot([
                  _Document({
                    'title': 'New inquiry',
                    'read': false,
                    'deepLink': {
                      'destination': 'business_inquiry',
                      'leadId': 'stale-lead',
                      'businessId': 'business-one',
                    },
                  }),
                ]),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('New inquiry'));
        await tester.pumpAndSettle();
        expect(resolutions, 1);
        expect(readAttempts, available ? 1 : 0);
        if (available) {
          expect(Uri.parse(opened!).queryParameters['lead'], 'current-lead');
          expect(find.text('Authorized record'), findsOneWidget);
        } else {
          expect(opened, isNull);
          expect(find.textContaining('no longer available'), findsOneWidget);
        }
      },
    );
  }
}
