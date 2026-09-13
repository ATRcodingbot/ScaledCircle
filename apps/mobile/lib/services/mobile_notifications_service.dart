import 'dart:async';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_environment.dart';

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
  String? _initialId;
  String? takeInitialId() {
    final id = _initialId;
    _initialId = null;
    return id;
  }

  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> input = const {},
  ]) async {
    final response =
        await FirebaseFunctions.instanceFor(
              region: AppEnvironmentConfig.functionsRegion,
            )
            .httpsCallable('mobileNotificationsV1')
            .call({'action': action, 'input': input})
            .timeout(const Duration(seconds: 25));
    return Map<String, dynamic>.from(response.data as Map);
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
    FirebaseMessaging.instance.onTokenRefresh.listen((_) => refresh());
    FirebaseAuth.instance.authStateChanges().listen((user) {
      final next = user?.uid;
      if (_uid == next && next != null) return;
      _uid = next;
      _queue = _queue
          .then((_) async {
            // Persisted installation revocation also handles a previous offline sign-out.
            if (next == null) {
              await disableDevice();
            } else {
              await call('unregister', {'installationSecret': await _secret()});
              if (_uid == next) await _register(next);
            }
          })
          .catchError((_) {});
    });
  }

  Future<void> _register(String uid) async {
    final pref = await call('settings');
    if (pref['enabled'] != true ||
        FirebaseAuth.instance.currentUser?.uid != uid) {
      return;
    }
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    if (!{
      AuthorizationStatus.authorized,
      AuthorizationStatus.provisional,
    }.contains(settings.authorizationStatus)) {
      return;
    }
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await FirebaseMessaging.instance.getAPNSToken() == null) {
      return;
    }
    await FirebaseMessaging.instance.setAutoInitEnabled(true);
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null || FirebaseAuth.instance.currentUser?.uid != uid) return;
    await call('register', {
      'installationSecret': await _secret(),
      'token': token,
      'platform': defaultTargetPlatform == TargetPlatform.iOS
          ? 'ios'
          : 'android',
      'environment': AppEnvironmentConfig.environment.name,
    });
  }

  Future<void> refresh() async {
    if (!supported) return;
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    try {
      await _register(uid);
    } catch (_) {
      /* In-app notifications remain available. */
    }
  }

  Future<String> enable() async {
    if (!supported) {
      return 'Install the current mobile app to enable device notifications.';
    }
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (!{
      AuthorizationStatus.authorized,
      AuthorizationStatus.provisional,
    }.contains(settings.authorizationStatus)) {
      return 'Notifications are off in device settings. You can enable them there.';
    }
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return 'Sign in to enable notifications.';
    final pref = await call('settings');
    await call('configure', {...pref, 'enabled': true});
    await _register(uid);
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await FirebaseMessaging.instance.getAPNSToken() == null) {
      return 'Permission saved. Apple registration is pending; reopen Notifications shortly.';
    }
    return 'Notifications enabled for this device.';
  }

  Future<void> disableDevice() async {
    if (!supported) return;
    try {
      await call('unregister', {'installationSecret': await _secret()});
    } finally {
      await FirebaseMessaging.instance.setAutoInitEnabled(false);
      await FirebaseMessaging.instance.deleteToken();
    }
  }

  Future<Map<String, dynamic>> check() async =>
      call('check', {'installationSecret': await _secret()});
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
