import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/screens/notifications/notification_preferences_screen.dart';
import 'package:flutter_app/services/mobile_notifications_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/mobile_notifications_firebase.dart';

Map<String, dynamic> preferences({bool enabled = false}) => {
  'enabled': enabled,
  'categories': {
    'work': true,
    'customers': false,
    'growth': false,
    'social': false,
    'email': false,
    'money': true,
    'marketplace': false,
  },
  'growthDigest': false,
};

void iosTest(String description, WidgetTesterCallback callback) => testWidgets(
  description,
  callback,
  variant: TargetPlatformVariant.only(TargetPlatform.iOS),
);

void main() {
  late MobileNotificationsFirebase fixture;
  late MobileNotificationsService service;
  late Map<String, dynamic> saved;
  Future<Object?> Function(String, Map<String, dynamic>)? override;
  List<String> actions() => fixture.backend.callArguments
      .map((data) => (data['data'] as Map)['action'] as String)
      .toList();

  setUp(() async {
    fixture = MobileNotificationsFirebase();
    await fixture.install();
    service = MobileNotificationsService();
    saved = preferences();
    override = null;
    fixture.backend.onCall = (name, data) async {
      if (name != 'mobileNotificationsV1') {
        throw StateError('Unexpected callable');
      }
      final action = data['action'] as String;
      final input = Map<String, dynamic>.from(data['input'] as Map);
      if (override != null) return override!(action, input);
      switch (action) {
        case 'settings':
          return saved;
        case 'configure':
          saved = Map<String, dynamic>.from(input);
          return saved;
        case 'register':
          return {'registered': true, 'platform': 'ios'};
        case 'check':
          return {'notificationId': 'offline-existing-check'};
        case 'unregister':
          return {'removed': true};
        default:
          throw StateError('Unexpected notification action');
      }
    };
  });
  tearDown(() async {
    await fixture.restore();
  });

  iosTest('null messaging token never claims this phone is registered', (
    tester,
  ) async {
    fixture.messaging.fcm = () async => null;
    final result = await service.enable();
    expect(result, isNot(contains('Notifications enabled for this device')));
    expect(actions(), isNot(contains('register')));
    expect(saved, preferences(enabled: true));
  });

  iosTest(
    'opt-in starts native APNs registration before waiting for its token',
    (tester) async {
      fixture.messaging.apns = () async =>
          fixture.messaging.autoInit ? 'offline-apple-test-value' : null;
      final result = await service.enable();
      expect(actions(), contains('register'));
      expect(result, contains('Notifications enabled for this device'));
      expect(
        fixture.messaging.calls.indexOf('autoInit:true'),
        lessThan(fixture.messaging.calls.indexOf('apns')),
      );
    },
  );

  iosTest('APNs arriving after skipped registration cannot claim readiness', (
    tester,
  ) async {
    var attempts = 0;
    fixture.messaging.apns = () async =>
        ++attempts == 1 ? null : 'offline-apple-test-value';
    final result = await service.enable();
    expect(result, isNot(contains('Notifications enabled for this device')));
    expect(actions(), isNot(contains('register')));
    expect(fixture.messaging.calls, isNot(contains('fcm')));
  });

  iosTest(
    'account change while token is pending never claims previous account ready',
    (tester) async {
      final token = Completer<String?>();
      fixture.messaging.fcm = () => token.future;
      final pending = expectLater(
        service.enable(),
        throwsA(
          isA<NotificationRequestFailure>().having(
            (e) => e.reference,
            'reference',
            'session/changed',
          ),
        ),
      );
      await tester.pump();
      fixture.backend.setUser('other');
      token.complete('offline-messaging-test-value-for-local-tests');
      await pending;
      expect(service.canCheck, false);
      expect(actions(), isNot(contains('register')));
    },
  );

  iosTest('check does not call endpoint before device readiness', (
    tester,
  ) async {
    fixture.messaging.apns = () async => null;
    saved = preferences(enabled: true);
    await expectLater(service.check(), throwsA(isA<Exception>()));
    expect(actions(), isNot(contains('check')));
  });

  iosTest(
    'confirmed enabled preference remains ON when device registration fails',
    (tester) async {
      override = (action, input) async {
        if (action == 'settings') return saved;
        if (action == 'configure') {
          saved = Map<String, dynamic>.from(input);
          return saved;
        }
        if (action == 'register') {
          throw FirebaseFunctionsException(
            code: 'unavailable',
            message: 'Offline transport fixture',
          );
        }
        throw StateError('Unexpected action');
      };
      await tester.pumpWidget(
        MaterialApp(home: NotificationPreferencesScreen(service: service)),
      );
      await tester.pumpAndSettle();
      final toggle = find.widgetWithText(
        SwitchListTile,
        'Mobile push notifications',
      );
      await tester.tap(toggle);
      await tester.pumpAndSettle();
      expect(saved['enabled'], true);
      expect(tester.widget<SwitchListTile>(toggle).value, true);
      expect(saved['categories'], preferences()['categories']);
      expect(find.textContaining('register/unavailable'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
    },
  );

  iosTest('failed preference read never presents default ON switches', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationPreferencesScreen(
          invoke: (_, _) async => throw StateError('offline'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SwitchListTile), findsNothing);
    expect(find.text('Retry preferences'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  iosTest(
    'failed category save keeps the confirmed value and has no rollback write',
    (tester) async {
      var writes = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationPreferencesScreen(
            invoke: (action, input) async {
              if (action == 'settings') return preferences(enabled: true);
              writes++;
              throw StateError('save failed');
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final toggle = find.widgetWithText(SwitchListTile, 'Leads & Replies');
      await tester.tap(toggle);
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(toggle).value, false);
      expect(writes, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );

  iosTest(
    'delayed APNs registration retries without rewriting saved preferences',
    (tester) async {
      saved = preferences(enabled: true);
      fixture.messaging.apns = () async => null;
      expect(
        await service.registerDevice(),
        contains('Apple registration is pending'),
      );
      expect(service.canCheck, false);
      expect(fixture.messaging.calls, isNot(contains('fcm')));
      fixture.messaging.apns = () async => 'offline-apple-test-value';
      expect(
        await service.registerDevice(),
        contains('Notifications enabled for this device'),
      );
      expect(service.canCheck, true);
      expect(actions().where((a) => a == 'configure'), isEmpty);
      expect(saved, preferences(enabled: true));
    },
  );

  iosTest(
    'denied device permission does not change saved account preferences',
    (tester) async {
      saved = preferences(enabled: true);
      fixture.messaging.authorization = AuthorizationStatus.denied;
      expect(
        await service.registerDevice(),
        contains('denied in device settings'),
      );
      expect(service.canCheck, false);
      expect(actions(), ['settings']);
      expect(fixture.messaging.calls, isNot(contains('fcm')));
      expect(saved, preferences(enabled: true));
    },
  );

  iosTest(
    'preference read failure stops enable before any save or registration',
    (tester) async {
      override = (_, _) async => throw FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Do not expose private server details',
      );
      await expectLater(
        service.enable(),
        throwsA(
          isA<NotificationRequestFailure>()
              .having((e) => e.reference, 'reference', 'settings/unavailable')
              .having(
                (e) => e.message,
                'safe message',
                isNot(contains('private server')),
              ),
        ),
      );
      expect(actions(), ['settings']);
      expect(saved, preferences());
    },
  );

  iosTest(
    'concurrent checks share one request and acknowledged ID survives restart',
    (tester) async {
      await service.enable();
      final response = Completer<Object?>();
      override = (action, _) async {
        if (action == 'check') return response.future;
        if (action == 'settings') return saved;
        if (action == 'register') return {'registered': true};
        if (action == 'open') {
          return {'available': true, 'type': 'mobile_push_check'};
        }
        throw StateError('Unexpected action');
      };
      final first = service.check();
      final second = service.check();
      await tester.pump();
      expect(actions().where((a) => a == 'check').length, 1);
      response.complete({'notificationId': 'offline-existing-check'});
      expect(await first, await second);
      service = MobileNotificationsService();
      await service.registerDevice();
      expect(await service.check(), {
        'notificationId': 'offline-existing-check',
      });
      expect(actions().where((a) => a == 'check').length, 1);
      await service.call('open', {'notificationId': 'different-check'});
      expect(await service.check(), {
        'notificationId': 'offline-existing-check',
      });
      expect(actions().where((a) => a == 'check').length, 1);
      await service.call('open', {'notificationId': 'offline-existing-check'});
      await service.check();
      expect(actions().where((a) => a == 'check').length, 2);
    },
  );

  iosTest(
    'uncertain check stays blocked after restart and remains account scoped',
    (tester) async {
      await service.enable();
      override = (action, _) async {
        if (action == 'check') {
          throw FirebaseFunctionsException(
            code: 'deadline-exceeded',
            message: 'Offline timeout',
          );
        }
        if (action == 'settings') return saved;
        if (action == 'register') return {'registered': true};
        if (action == 'open') {
          return {'available': true, 'type': 'mobile_push_check'};
        }
        throw StateError('Unexpected action');
      };
      final uncertain = throwsA(
        isA<NotificationRequestFailure>().having(
          (e) => e.reference,
          'reference',
          'check/unconfirmed',
        ),
      );
      await expectLater(service.check(), uncertain);
      service = MobileNotificationsService();
      await service.registerDevice();
      await expectLater(service.check(), uncertain);
      await service.call('open', {'notificationId': 'arbitrary-check'});
      await expectLater(service.check(), uncertain);
      expect(actions().where((a) => a == 'check').length, 1);
      fixture.backend.setUser('another-account');
      await service.registerDevice();
      expect(service.canCheck, true);
    },
  );

  iosTest(
    'account switch after sending a check retains original uncertain marker',
    (tester) async {
      await service.enable();
      const originalUid = 'owner';
      final response = Completer<Object?>();
      override = (action, _) async {
        if (action == 'check') return response.future;
        if (action == 'settings') return saved;
        if (action == 'register') return {'registered': true};
        throw StateError('Unexpected action');
      };
      final pending = expectLater(
        service.check(),
        throwsA(
          isA<NotificationRequestFailure>().having(
            (e) => e.reference,
            'reference',
            'check/unconfirmed',
          ),
        ),
      );
      await tester.pump();
      fixture.backend.setUser('another-account');
      response.complete({'notificationId': 'offline-existing-check'});
      await pending;
      fixture.backend.setUser(originalUid);
      service = MobileNotificationsService();
      await service.registerDevice();
      expect(service.canCheck, false);
      expect(actions().where((a) => a == 'check').length, 1);
    },
  );

  iosTest(
    'server rejection invalidates readiness without changing preferences',
    (tester) async {
      await service.enable();
      override = (action, _) async {
        if (action == 'check') {
          throw FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'Offline rejection',
          );
        }
        if (action == 'settings') return saved;
        if (action == 'register') return {'registered': true};
        throw StateError('Unexpected action');
      };
      await expectLater(
        service.check(),
        throwsA(
          isA<NotificationRequestFailure>().having(
            (e) => e.reference,
            'reference',
            'check/failed-precondition',
          ),
        ),
      );
      expect(service.canCheck, false);
      expect(saved, preferences(enabled: true));
      await service.registerDevice();
      expect(service.canCheck, true);
    },
  );

  iosTest(
    'pending registration coalesces and disable prevents stale readiness',
    (tester) async {
      saved = preferences(enabled: true);
      final token = Completer<String?>();
      fixture.messaging.fcm = () => token.future;
      final pending = expectLater(
        service.registerDevice(),
        throwsA(isA<NotificationRequestFailure>()),
      );
      final second = expectLater(
        service.registerDevice(),
        throwsA(isA<NotificationRequestFailure>()),
      );
      await tester.pump();
      final disabled = service.disableDevice();
      token.complete('offline-messaging-test-value-for-local-tests');
      await pending;
      await second;
      await disabled;
      expect(actions().where((a) => a == 'settings').length, 1);
      expect(actions(), isNot(contains('register')));
      expect(service.canCheck, false);
      expect(fixture.messaging.autoInit, false);
      expect(saved, preferences(enabled: true));
    },
  );

  iosTest('late server registration completes before device revocation', (
    tester,
  ) async {
    saved = preferences(enabled: true);
    final commit = Completer<void>();
    var bound = false;
    override = (action, _) async {
      if (action == 'settings') return saved;
      if (action == 'register') {
        await commit.future;
        bound = true;
        return {'registered': true};
      }
      if (action == 'unregister') {
        bound = false;
        return {'removed': true};
      }
      throw StateError('Unexpected action');
    };
    final pending = expectLater(
      service.registerDevice(),
      throwsA(isA<NotificationRequestFailure>()),
    );
    await tester.pump();
    expect(actions(), contains('register'));
    final disabled = service.disableDevice();
    await tester.pump();
    expect(actions(), isNot(contains('unregister')));
    commit.complete();
    await pending;
    await disabled;
    expect(bound, false);
    expect(actions().last, 'unregister');
    expect(service.canCheck, false);
    expect(fixture.messaging.autoInit, false);
  });

  iosTest('UI timeout does not let revocation overtake a late registration', (
    tester,
  ) async {
    saved = preferences(enabled: true);
    final commit = Completer<void>();
    var bound = false;
    override = (action, _) async {
      if (action == 'settings') return saved;
      if (action == 'register') {
        await commit.future;
        bound = true;
        return {'registered': true};
      }
      if (action == 'unregister') {
        bound = false;
        return {'removed': true};
      }
      throw StateError('Unexpected action');
    };
    final pending = expectLater(
      service.registerDevice(),
      throwsA(
        isA<NotificationRequestFailure>().having(
          (e) => e.reference,
          'reference',
          'register/deadline-exceeded',
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 26));
    await pending;
    final disabled = service.disableDevice();
    await tester.pump();
    expect(actions(), isNot(contains('unregister')));
    commit.complete();
    await disabled;
    expect(bound, false);
    expect(actions().last, 'unregister');
    expect(service.canCheck, false);
  });

  iosTest(
    'registration-only action is available while check stays disabled until ready',
    (tester) async {
      saved = preferences(enabled: true);
      fixture.messaging.apns = () async => null;
      await tester.pumpWidget(
        MaterialApp(home: NotificationPreferencesScreen(service: service)),
      );
      await tester.pumpAndSettle();
      final retry = find.widgetWithText(
        OutlinedButton,
        'Retry device registration',
      );
      final check = find.widgetWithText(
        OutlinedButton,
        'Send a notification check',
      );
      await tester.drag(find.byType(ListView), const Offset(0, -1000));
      await tester.pumpAndSettle();
      expect(tester.widget<OutlinedButton>(check).onPressed, isNull);
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Apple registration is pending'),
        findsWidgets,
      );
      expect(tester.widget<OutlinedButton>(check).onPressed, isNull);
      fixture.messaging.apns = () async => 'offline-apple-test-value';
      await tester.ensureVisible(retry);
      await tester.pumpAndSettle();
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(tester.widget<OutlinedButton>(check).onPressed, isNotNull);
      expect(actions().where((a) => a == 'configure'), isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'Android registers without requesting an Apple token',
    (tester) async {
      await service.enable();
      expect(service.canCheck, true);
      expect(fixture.messaging.calls, isNot(contains('apns')));
      expect(actions(), contains('register'));
      expect(saved, preferences(enabled: true));
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );

  iosTest(
    'token rotation during registration is refreshed before readiness settles',
    (tester) async {
      service = MobileNotificationsService();
      saved = preferences(enabled: true);
      service.start();
      await tester.pumpAndSettle();
      final token = Completer<String?>();
      fixture.messaging.fcm = () => token.future;
      final pending = service.refresh();
      await tester.pump();
      fixture.messaging.fcm = () async => 'offline-rotated-messaging-value';
      fixture.messaging.refreshes.add('offline-rotated-messaging-value');
      await tester.pump();
      token.complete('offline-prior-messaging-value');
      await pending;
      await tester.pumpAndSettle();
      for (var frame = 0; frame < 10 && !service.canCheck; frame++) {
        await tester.pump();
      }
      final registrations = fixture.backend.callArguments
          .where((call) => (call['data'] as Map)['action'] == 'register')
          .toList();
      expect(
        ((registrations.last['data'] as Map)['input'] as Map)['token'],
        'offline-rotated-messaging-value',
      );
      expect(service.canCheck, true);
    },
  );

  iosTest(
    'old device cleanup finishes before the new account obtains a token',
    (tester) async {
      await service.enable();
      final revoke = Completer<Object?>();
      override = (action, _) async {
        if (action == 'unregister') return revoke.future;
        if (action == 'settings') return saved;
        if (action == 'register') return {'registered': true};
        throw StateError('Unexpected action');
      };
      final disabled = service.disableDevice();
      await tester.pump();
      fixture.backend.setUser('new-account');
      final registered = service.registerDevice();
      await tester.pump();
      expect(fixture.messaging.calls.where((a) => a == 'fcm').length, 1);
      revoke.complete({'removed': true});
      await disabled;
      await registered;
      expect(
        fixture.messaging.calls.indexOf('deleteToken'),
        lessThan(fixture.messaging.calls.lastIndexOf('fcm')),
      );
      expect(fixture.messaging.autoInit, true);
      expect(service.canCheck, true);
      expect(saved, preferences(enabled: true));
    },
  );

  iosTest(
    'sign-out revokes a manually requested registration that completes late',
    (tester) async {
      service = MobileNotificationsService();
      saved = preferences(enabled: true);
      service.start();
      await tester.pumpAndSettle();
      final commit = Completer<void>();
      var bound = true;
      override = (action, _) async {
        if (action == 'settings') return saved;
        if (action == 'register') {
          await commit.future;
          bound = true;
          return {'registered': true};
        }
        if (action == 'unregister') {
          bound = false;
          return {'removed': true};
        }
        throw StateError('Unexpected action');
      };
      final registering = expectLater(
        service.registerDevice(),
        throwsA(isA<NotificationRequestFailure>()),
      );
      await tester.pump();
      fixture.backend.setUser(null);
      await tester.pump();
      expect(service.canCheck, false);
      commit.complete();
      await registering;
      for (var frame = 0; frame < 10; frame++) {
        await tester.pump();
      }
      expect(bound, false);
      expect(fixture.messaging.autoInit, false);
      expect(actions().last, 'unregister');
      expect(saved, preferences(enabled: true));
    },
  );
}
