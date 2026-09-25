import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_environment.dart';

enum NotificationDeviceState {
  unknown,
  checking,
  ready,
  preferencesOff,
  permissionRequired,
  permissionDenied,
  applePending,
  tokenPending,
  failed,
  signedOut,
}

class NotificationDeviceReadiness {
  const NotificationDeviceReadiness(this.state, this.message);
  final NotificationDeviceState state;
  final String message;
}

class NotificationRequestFailure implements Exception {
  const NotificationRequestFailure(this.stage, this.code);
  final String stage, code;
  String get reference => '$stage/$code';
  String get message {
    final next = switch (stage) {
      'settings' => 'Saved preferences could not be loaded. Retry preferences.',
      'configure' =>
        'Preferences were not confirmed saved. The last confirmed values are shown.',
      'authorization' =>
        'Device permission could not be checked. Retry device registration.',
      'apple-token' =>
        'Apple registration could not be checked. Retry device registration.',
      'messaging-token' || 'auto-init' || 'register' =>
        'This device is not confirmed registered. Retry device registration; your saved preferences are unchanged.',
      'device-readiness' =>
        'Finish device registration before requesting a notification check.',
      'check' when code == 'unconfirmed' =>
        'The check request outcome is unconfirmed. Open Notifications to look for the existing check. Another request is blocked to avoid sending a duplicate.',
      'check' when code == 'failed-precondition' =>
        'This device is not registered. Retry device registration before requesting a check.',
      'check' =>
        'The notification check was not accepted. Check device registration before trying again.',
      'session' =>
        'Your account changed. Reopen Notification preferences for the signed-in account.',
      _ =>
        'The device notification change could not be completed. Your saved preferences are shown separately.',
    };
    return '$next Reference: $reference.';
  }

  @override
  String toString() => message;
}

/// FCM carries a notification identity only. The server resolves current access.
class MobileNotificationsService {
  static final instance = MobileNotificationsService();
  static bool get supported =>
      !kIsWeb &&
      {
        TargetPlatform.iOS,
        TargetPlatform.android,
      }.contains(defaultTargetPlatform);
  final opened = StreamController<String>.broadcast();
  final foreground = StreamController<String>.broadcast();
  bool _started = false;
  String? _uid;
  Future<void> _queue = Future.value();
  Future<void>? _installationMutations;
  final readiness = ValueNotifier<NotificationDeviceReadiness>(
    const NotificationDeviceReadiness(
      NotificationDeviceState.unknown,
      'This device has not confirmed notification registration.',
    ),
  );
  String? _readyUid;
  int _deviceGeneration = 0;
  int _sessionGeneration = 0;
  Future<NotificationDeviceReadiness>? _registering;
  String? _registeringUid;
  Future<Map<String, dynamic>>? _checking;
  String? _checkingUid;
  final _unconfirmedChecks = <String, NotificationRequestFailure>{};
  String _checkKey(String uid) =>
      'push_check_outstanding_${AppEnvironmentConfig.environment.name}_$uid';
  bool get canCheck =>
      _readyUid != null &&
      _readyUid == FirebaseAuth.instance.currentUser?.uid &&
      readiness.value.state == NotificationDeviceState.ready &&
      !_unconfirmedChecks.containsKey(_readyUid);

  Future<T> _stage<T>(String stage, Future<T> Function() action) async {
    try {
      return await action();
    } on NotificationRequestFailure {
      rethrow;
    } catch (error) {
      const safeCodes = {
        'permission-denied',
        'unauthenticated',
        'failed-precondition',
        'unavailable',
        'deadline-exceeded',
        'resource-exhausted',
        'invalid-argument',
        'internal',
        'unknown',
        'apns-token-not-set',
        'token-not-set',
        'network-request-failed',
      };
      final raw = error is FirebaseException
          ? error.code
          : error is TimeoutException
          ? 'deadline-exceeded'
          : 'unknown';
      final failure = NotificationRequestFailure(
        stage,
        safeCodes.contains(raw) ? raw : 'unknown',
      );
      debugPrint('Notification request failed: ${failure.reference}');
      throw failure;
    }
  }

  String? _initialId;
  String? takeInitialId() {
    final id = _initialId;
    _initialId = null;
    return id;
  }

  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> input = const {},
  ]) {
    if (action != 'register' && action != 'unregister') {
      return _call(action, input);
    }
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final generation = _deviceGeneration;
    final pending = _serializeInstallation(() {
      if (action == 'register' &&
          (generation != _deviceGeneration ||
              FirebaseAuth.instance.currentUser?.uid != uid)) {
        throw const NotificationRequestFailure('session', 'changed');
      }
      return _call(action, input, waitForTransport: true);
    });
    // Keep revocation ordered behind the actual transport completion even when
    // the UI stops waiting. A local timeout cannot cancel a server write.
    return _stage(action, () => pending.timeout(const Duration(seconds: 25)));
  }

  Future<T> _serializeInstallation<T>(Future<T> Function() operation) {
    final previous = _installationMutations;
    final pending = previous == null
        ? operation()
        : previous.then((_) => operation());
    _installationMutations = pending.then<void>((_) {}, onError: (_) {});
    return pending;
  }

  Future<Map<String, dynamic>> _call(
    String action,
    Map<String, dynamic> input, {
    bool waitForTransport = false,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final sessionGeneration = _sessionGeneration;
    final response = await _stage(action, () {
      final request =
          FirebaseFunctions.instanceFor(
            region: AppEnvironmentConfig.functionsRegion,
          ).httpsCallable('mobileNotificationsV1').call({
            'action': action,
            'input': input,
          });
      return waitForTransport
          ? request
          : request.timeout(const Duration(seconds: 25));
    });
    if (action != 'unregister' &&
        (FirebaseAuth.instance.currentUser?.uid != uid ||
            sessionGeneration != _sessionGeneration)) {
      throw const NotificationRequestFailure('session', 'changed');
    }
    final result = Map<String, dynamic>.from(response.data as Map);
    if (action == 'open' &&
        uid != null &&
        result['available'] == true &&
        result['type'] == 'mobile_push_check') {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_checkKey(uid));
      if (stored != null &&
          (jsonDecode(stored) as Map)['notificationId'] ==
              input['notificationId']) {
        await prefs.remove(_checkKey(uid));
      }
    }
    return result;
  }

  Future<String> _secret() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString('push_installation_secret');
    if (existing != null) return existing;
    final random = Random.secure();
    final value = List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    await prefs.setString('push_installation_secret', value);
    return value;
  }

  String? identity(RemoteMessage message) => pushNotificationIdentity(
    message.data,
    AppEnvironmentConfig.environment.name,
  );
  void start() {
    if (_started || !supported) return;
    _started = true;
    FirebaseMessaging.onMessageOpenedApp.listen((m) {
      final id = identity(m);
      if (id != null) opened.add(id);
    });
    FirebaseMessaging.onMessage.listen((m) {
      final id = identity(m);
      if (id != null) foreground.add(id);
    });
    FirebaseMessaging.instance
        .getInitialMessage()
        .then((m) {
          if (m == null) return;
          final id = identity(m);
          if (id != null) {
            _initialId = id;
            opened.add(id);
          }
        })
        .catchError((_) {});
    FirebaseMessaging.instance.onTokenRefresh.listen((_) => _tokenChanged());
    FirebaseAuth.instance.authStateChanges().listen((user) {
      final next = user?.uid;
      if (_uid == next && next != null) return;
      _uid = next;
      _sessionGeneration++;
      _deviceGeneration++;
      _readyUid = null;
      _registering = null;
      _registeringUid = null;
      readiness.value = const NotificationDeviceReadiness(
        NotificationDeviceState.unknown,
        'This device must confirm notification registration for the signed-in account.',
      );
      _queue = _queue
          .then((_) async {
            // Persisted installation revocation also handles a previous offline sign-out.
            if (next == null) {
              await disableDevice();
            } else {
              await call('unregister', {'installationSecret': await _secret()});
              if (_uid == next) await _prepareDevice(next);
            }
          })
          .catchError((_) {});
    });
  }

  Future<void> _tokenChanged() async {
    final pending = _registering;
    if (pending != null) {
      _deviceGeneration++;
      _readyUid = null;
      try {
        await pending;
      } catch (_) {}
      if (identical(_registering, pending)) {
        _registering = null;
        _registeringUid = null;
      }
    }
    await refresh();
  }

  Future<NotificationDeviceReadiness> _prepareDevice(String uid) {
    if (_registeringUid == uid && _registering != null) return _registering!;
    _registeringUid = uid;
    final generation = ++_deviceGeneration;
    final raw = _serializeInstallation(() => _register(uid, generation));
    final pending = _stage(
      'register',
      () => raw.timeout(const Duration(seconds: 25)),
    );
    _registering = pending;
    pending.whenComplete(() {
      if (identical(_registering, pending)) _registering = null;
    }).ignore();
    return pending;
  }

  Future<NotificationDeviceReadiness> _register(
    String uid,
    int generation,
  ) async {
    bool current() =>
        generation == _deviceGeneration &&
        FirebaseAuth.instance.currentUser?.uid == uid;
    void requireCurrent() {
      if (!current()) {
        throw const NotificationRequestFailure('session', 'changed');
      }
    }

    NotificationDeviceReadiness state(
      NotificationDeviceState value,
      String message,
    ) {
      requireCurrent();
      _readyUid = value == NotificationDeviceState.ready ? uid : null;
      return readiness.value = NotificationDeviceReadiness(value, message);
    }

    state(
      NotificationDeviceState.checking,
      'Checking registration for this device…',
    );
    try {
      final pref = await call('settings');
      requireCurrent();
      final local = await SharedPreferences.getInstance();
      requireCurrent();
      final outstanding = local.getString(_checkKey(uid));
      if (outstanding != null &&
          (jsonDecode(outstanding) as Map)['notificationId'] == null) {
        _unconfirmedChecks[uid] = const NotificationRequestFailure(
          'check',
          'unconfirmed',
        );
      }
      if (pref['enabled'] != true) {
        return state(
          NotificationDeviceState.preferencesOff,
          'Saved mobile push preference is off.',
        );
      }
      final settings = await _stage(
        'authorization',
        () => FirebaseMessaging.instance.getNotificationSettings(),
      );
      requireCurrent();
      if (!{
        AuthorizationStatus.authorized,
        AuthorizationStatus.provisional,
      }.contains(settings.authorizationStatus)) {
        return state(
          settings.authorizationStatus == AuthorizationStatus.denied
              ? NotificationDeviceState.permissionDenied
              : NotificationDeviceState.permissionRequired,
          settings.authorizationStatus == AuthorizationStatus.denied
              ? 'Notifications are denied in device settings. Allow notifications there, then retry device registration.'
              : 'Allow notifications for this device to finish registration.',
        );
      }
      // The pinned iOS plugin starts APNs registration when auto-init is enabled.
      // Do this only after saved opt-in and OS authorization, before awaiting APNs.
      await _stage(
        'auto-init',
        () => FirebaseMessaging.instance.setAutoInitEnabled(true),
      );
      requireCurrent();
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final apple = await _stage(
          'apple-token',
          () => FirebaseMessaging.instance.getAPNSToken(),
        );
        requireCurrent();
        if (apple == null) {
          return state(
            NotificationDeviceState.applePending,
            'Saved preferences are on. Apple registration is pending on this device; retry device registration shortly.',
          );
        }
      }
      final token = await _stage(
        'messaging-token',
        () => FirebaseMessaging.instance.getToken(),
      );
      requireCurrent();
      if (token == null) {
        return state(
          NotificationDeviceState.tokenPending,
          'Saved preferences are on. Device messaging registration is pending; retry device registration shortly.',
        );
      }
      final secret = await _secret();
      requireCurrent();
      final result = await _call('register', {
        'installationSecret': secret,
        'token': token,
        'platform': defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios'
            : 'android',
        'environment': AppEnvironmentConfig.environment.name,
      }, waitForTransport: true);
      requireCurrent();
      if (result['registered'] != true) {
        throw const NotificationRequestFailure('register', 'unconfirmed');
      }
      return state(
        NotificationDeviceState.ready,
        _unconfirmedChecks[uid]?.message ??
            'Notifications enabled for this device.',
      );
    } on NotificationRequestFailure catch (failure) {
      if (current()) state(NotificationDeviceState.failed, failure.message);
      rethrow;
    }
  }

  Future<String> registerDevice() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      throw const NotificationRequestFailure('session', 'signed-out');
    }
    final settings = await _stage(
      'authorization',
      () => FirebaseMessaging.instance.getNotificationSettings(),
    );
    if (settings.authorizationStatus == AuthorizationStatus.notDetermined) {
      await _stage(
        'authorization',
        () => FirebaseMessaging.instance.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        ),
      );
    }
    if (FirebaseAuth.instance.currentUser?.uid != uid) {
      throw const NotificationRequestFailure('session', 'changed');
    }
    return (await _prepareDevice(uid)).message;
  }

  Future<void> refresh() async {
    if (!supported) return;
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    try {
      await _prepareDevice(uid);
    } catch (_) {
      /* In-app notifications remain available. */
    }
  }

  Future<String> enable() async {
    if (!supported) {
      return 'Install the current mobile app to enable device notifications.';
    }
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return 'Sign in to enable notifications.';
    final settings = await _stage(
      'authorization',
      () => FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      ),
    );
    if (FirebaseAuth.instance.currentUser?.uid != uid) {
      throw const NotificationRequestFailure('session', 'changed');
    }
    if (!{
      AuthorizationStatus.authorized,
      AuthorizationStatus.provisional,
    }.contains(settings.authorizationStatus)) {
      return 'Notifications are off in device settings. You can enable them there.';
    }
    final pref = await call('settings');
    await call('configure', {...pref, 'enabled': true});
    return (await _prepareDevice(uid)).message;
  }

  Future<void> disableDevice() async {
    if (!supported) return;
    _deviceGeneration++;
    _readyUid = null;
    _registering = null;
    _registeringUid = null;
    readiness.value = const NotificationDeviceReadiness(
      NotificationDeviceState.unknown,
      'This device is not registered for notifications.',
    );
    final pending = _serializeInstallation(() async {
      try {
        await _call('unregister', {
          'installationSecret': await _secret(),
        }, waitForTransport: true);
      } finally {
        await _stage(
          'device-disable',
          () => FirebaseMessaging.instance.setAutoInitEnabled(false),
        );
        await _stage(
          'device-disable',
          () => FirebaseMessaging.instance.deleteToken(),
        );
      }
    });
    await _stage(
      'device-disable',
      () => pending.timeout(const Duration(seconds: 25)),
    );
  }

  Future<Map<String, dynamic>> check() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null && _unconfirmedChecks.containsKey(uid)) {
      return Future.error(_unconfirmedChecks[uid]!);
    }
    if (!canCheck || uid == null) {
      return Future.error(
        const NotificationRequestFailure('device-readiness', 'not-ready'),
      );
    }
    if (_checkingUid == uid && _checking != null) return _checking!;
    _checkingUid = uid;
    final pending = _requestCheck(uid);
    _checking = pending;
    pending.whenComplete(() {
      if (identical(_checking, pending)) _checking = null;
    }).ignore();
    return pending;
  }

  Future<Map<String, dynamic>> _requestCheck(String uid) async {
    final secret = await _secret();
    if (!canCheck || FirebaseAuth.instance.currentUser?.uid != uid) {
      throw const NotificationRequestFailure('session', 'changed');
    }
    final prefs = await SharedPreferences.getInstance();
    final key = _checkKey(uid);
    final stored = prefs.getString(key);
    if (stored != null) {
      final marker = Map<String, dynamic>.from(jsonDecode(stored) as Map);
      if (marker['notificationId'] != null) {
        return {'notificationId': marker['notificationId']};
      }
      throw const NotificationRequestFailure('check', 'unconfirmed');
    }
    if (FirebaseAuth.instance.currentUser?.uid != uid) {
      throw const NotificationRequestFailure('session', 'changed');
    }
    final persisted = await prefs.setString(key, jsonEncode({'pending': true}));
    if (!persisted) {
      throw const NotificationRequestFailure('check', 'local-storage');
    }
    try {
      if (FirebaseAuth.instance.currentUser?.uid != uid) {
        await prefs.remove(key);
        throw const NotificationRequestFailure('session', 'changed');
      }
      final result = await call('check', {'installationSecret': secret});
      if (result['notificationId'] is! String) {
        throw const NotificationRequestFailure('check', 'unknown');
      }
      await prefs.setString(
        key,
        jsonEncode({'notificationId': result['notificationId']}),
      );
      return result;
    } on NotificationRequestFailure catch (failure) {
      if (failure.stage == 'session' ||
          failure.stage == 'check' &&
              {
                'unavailable',
                'deadline-exceeded',
                'internal',
                'unknown',
              }.contains(failure.code)) {
        final uncertain = const NotificationRequestFailure(
          'check',
          'unconfirmed',
        );
        _unconfirmedChecks[uid] = uncertain;
        throw uncertain;
      }
      await prefs.remove(key);
      if (failure.stage == 'check' &&
          failure.code == 'failed-precondition' &&
          FirebaseAuth.instance.currentUser?.uid == uid) {
        _readyUid = null;
        readiness.value = NotificationDeviceReadiness(
          NotificationDeviceState.failed,
          failure.message,
        );
      }
      rethrow;
    }
  }
}

String? pushNotificationIdentity(
  Map<String, dynamic> data,
  String environment,
) {
  final id = data['notificationId'];
  return data['environment'] == environment &&
          id is String &&
          RegExp(r'^[A-Za-z0-9_-]{1,200}$').hasMatch(id)
      ? id
      : null;
}
