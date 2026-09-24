// Firebase SDKs pin this platform interface; only the device transport is fake.
// ignore_for_file: depend_on_referenced_packages
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging_platform_interface/firebase_messaging_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'campaign_refresh_firebase.dart';

class MobileNotificationsFirebase {
  final backend = CampaignRefreshFirebase();
  final messaging = NotificationDeviceTransport();
  late FirebaseMessagingPlatform previous;

  Future<void> install() async {
    await backend.install();
    previous = FirebaseMessagingPlatform.instance;
    FirebaseMessagingPlatform.instance = messaging;
    SharedPreferences.setMockInitialValues({});
  }

  Future<void> restore() async {
    FirebaseMessagingPlatform.instance = previous;
    await messaging.refreshes.close();
    await backend.restore();
  }
}

class NotificationDeviceTransport extends FirebaseMessagingPlatform {
  AuthorizationStatus authorization = AuthorizationStatus.authorized;
  Future<String?> Function()? apns;
  Future<String?> Function()? fcm;
  Object? permissionError;
  final refreshes = StreamController<String>.broadcast();
  final calls = <String>[];
  bool autoInit = false;

  NotificationSettings get settings => NotificationSettings(
    alert: AppleNotificationSetting.enabled,
    announcement: AppleNotificationSetting.disabled,
    authorizationStatus: authorization,
    badge: AppleNotificationSetting.enabled,
    carPlay: AppleNotificationSetting.disabled,
    lockScreen: AppleNotificationSetting.enabled,
    notificationCenter: AppleNotificationSetting.enabled,
    showPreviews: AppleShowPreviewSetting.always,
    timeSensitive: AppleNotificationSetting.disabled,
    criticalAlert: AppleNotificationSetting.disabled,
    sound: AppleNotificationSetting.enabled,
    providesAppNotificationSettings: AppleNotificationSetting.disabled,
  );

  @override
  FirebaseMessagingPlatform delegateFor({required FirebaseApp app}) => this;
  @override
  FirebaseMessagingPlatform setInitialValues({bool? isAutoInitEnabled}) => this;
  @override
  bool get isAutoInitEnabled => autoInit;
  @override
  Future<void> setAutoInitEnabled(bool enabled) async {
    calls.add('autoInit:$enabled');
    autoInit = enabled;
  }

  @override
  Future<String?> getAPNSToken() async {
    calls.add('apns');
    return apns == null ? 'offline-apple-test-value' : await apns!();
  }

  @override
  Future<String?> getToken({
    String? vapidKey,
    String? serviceWorkerScriptPath,
  }) async {
    calls.add('fcm');
    return fcm == null
        ? 'offline-messaging-test-value-for-local-tests'
        : await fcm!();
  }

  @override
  Future<NotificationSettings> getNotificationSettings() async {
    calls.add('settings');
    return settings;
  }

  @override
  Future<NotificationSettings> requestPermission({
    bool alert = true,
    bool announcement = false,
    bool badge = true,
    bool carPlay = false,
    bool criticalAlert = false,
    bool provisional = false,
    bool sound = true,
    bool providesAppNotificationSettings = false,
  }) async {
    calls.add('requestPermission');
    if (permissionError != null) throw permissionError!;
    return settings;
  }

  @override
  Future<RemoteMessage?> getInitialMessage() async => null;
  @override
  Stream<String> get onTokenRefresh => refreshes.stream;
  @override
  Future<void> deleteToken() async {
    calls.add('deleteToken');
  }
}
