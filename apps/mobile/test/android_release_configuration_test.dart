import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('release build uses canonical package and non-debug signing', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();

    expect(gradle, contains('namespace = "com.scaledcircle.app"'));
    expect(gradle, contains('applicationId = "com.scaledcircle.app"'));
    expect(gradle, contains('create("release")'));
    expect(gradle, contains('signingConfigs.getByName("release")'));
    expect(gradle, isNot(contains('signingConfigs.getByName("debug")')));
    expect(gradle, contains('Debug signing is never permitted'));
    expect(gradle, contains('id("com.google.gms.google-services")'));
  });

  test('canonical Firebase Android registration is effective', () {
    final googleServices = jsonDecode(
      File('android/app/google-services.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final clients = googleServices['client'] as List<dynamic>;
    final client = clients.single as Map<String, dynamic>;
    final clientInfo = client['client_info'] as Map<String, dynamic>;
    final androidClientInfo =
        clientInfo['android_client_info'] as Map<String, dynamic>;

    expect(
      clientInfo['mobilesdk_app_id'],
      '1:1010956217112:android:e873d8470260ec09e70c6d',
    );
    expect(androidClientInfo['package_name'], 'com.scaledcircle.app');

    final options = File('lib/firebase_options.dart').readAsStringSync();
    expect(
      options,
      contains('1:1010956217112:android:e873d8470260ec09e70c6d'),
    );
    expect(options, contains("projectId: 'scaled-circle'"));
  });

  test('release manifest has bounded production permissions', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(manifest, contains('android.permission.INTERNET'));
    expect(manifest, contains('android.permission.ACCESS_COARSE_LOCATION'));
    expect(manifest, contains('android.permission.ACCESS_FINE_LOCATION'));
    expect(manifest, contains('android.permission.FOREGROUND_SERVICE'));
    expect(
      manifest,
      contains('android.permission.FOREGROUND_SERVICE_LOCATION'),
    );
    expect(manifest, contains('android.permission.POST_NOTIFICATIONS'));
    expect(manifest, isNot(contains('ACCESS_BACKGROUND_LOCATION')));
    expect(manifest, contains('android:foregroundServiceType="location"'));
  });

  test('standard Gradle wrapper is source-controlled', () {
    expect(File('android/gradlew').existsSync(), isTrue);
    expect(File('android/gradlew.bat').existsSync(), isTrue);
    expect(File('android/gradle/wrapper/gradle-wrapper.jar').existsSync(), isTrue);
    expect(
      File('android/gradle/wrapper/gradle-wrapper.properties')
          .readAsStringSync(),
      contains('gradle-9.1.0-all.zip'),
    );
  });
}
