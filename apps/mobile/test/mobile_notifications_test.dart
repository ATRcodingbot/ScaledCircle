import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/mobile_notifications_service.dart';
import 'package:flutter_app/screens/notifications/notification_preferences_screen.dart';

void main() {
  test('push only accepts environment-matched notification identity', () {
    expect(
      pushNotificationIdentity({
        'notificationId': 'notice_1',
        'environment': 'production',
      }, 'production'),
      'notice_1',
    );
    expect(
      pushNotificationIdentity({
        'notificationId': 'notice_1',
        'environment': 'staging',
      }, 'production'),
      isNull,
    );
    expect(
      pushNotificationIdentity({
        'notificationId': '../private',
        'environment': 'production',
      }, 'production'),
      isNull,
    );
    expect(
      pushNotificationIdentity({
        'route': '/billing',
        'environment': 'production',
      }, 'production'),
      isNull,
    );
  });
  test('server-resolved links retain exact authorized event targets', () {
    final cases = <Map<String, dynamic>>[
      {
        'deepLink': {
          'destination': 'business_schedule',
          'businessId': 'workspace',
          'itemId': 'item1',
          'startMs': 1234,
        },
      },
      {
        'deepLink': {'destination': 'business_email', 'operationId': 'send1'},
      },
      {
        'deepLink': {
          'destination': 'business_email_campaign',
          'campaignId': 'campaign1',
        },
      },
      {
        'deepLink': {
          'destination': 'social_draft',
          'itemId': 'post1',
          'provider': 'instagram',
        },
      },
      {
        'deepLink': {'destination': 'social_published', 'jobId': 'published1'},
      },
      {'type': 'job_opportunity', 'campaignId': 'work1'},
    ];
    final expected = [
      'item=item1',
      'operation=send1',
      'campaign=campaign1',
      'item=post1',
      'published=published1',
      '/campaign/work1',
    ];
    for (var i = 0; i < cases.length; i++) {
      expect(notificationDestination(cases[i])?.route, contains(expected[i]));
    }
    expect(
      workspaceNotificationDestination(cases[2], {
        'isOwner': false,
        'permissions': ['jobsAssigned'],
      }),
      isNull,
    );
  });
  testWidgets(
    'preferences show outcome groups, honest mobile gate and no security suppression',
    (tester) async {
      tester.view.resetPhysicalSize();
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationPreferencesScreen(
            invoke: (action, input) async => {
              'enabled': false,
              'categories': {
                'work': true,
                'customers': true,
                'growth': true,
                'money': true,
                'marketplace': true,
              },
              'growthDigest': true,
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Work & Schedule'), findsOneWidget);
      expect(find.text('Leads & Replies'), findsOneWidget);
      expect(find.text('Marketplace Work'), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Security / Account: required notices'),
        findsOneWidget,
      );
      expect(find.text('Mute security notices'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('successful preference retry clears prior failure', (
    tester,
  ) async {
    var attempts = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationPreferencesScreen(
          invoke: (action, input) async {
            if (++attempts == 1) throw StateError('temporary');
            return {
              'enabled': false,
              'categories': <String, bool>{},
              'growthDigest': true,
            };
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('could not load'), findsOneWidget);
    await tester.tap(find.text('Retry preferences'));
    await tester.pumpAndSettle();
    expect(find.textContaining('could not load'), findsNothing);
    expect(find.text('Work & Schedule'), findsOneWidget);
    expect(attempts, 2);
  });
}
