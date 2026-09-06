import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/config/firebase_options_staging.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('iOS uses the dedicated staging registration', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final options = StagingFirebaseOptions.currentPlatform;
    expect(options.appId, '1:998249478055:ios:e3e282258d5750db352882');
    expect(options.projectId, 'scaledcircle-staging');
    expect(options.iosBundleId, 'com.scaledcircle.app');
    expect(options.messagingSenderId, '998249478055');
  });

  test('Android uses its dedicated staging registration', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final options = StagingFirebaseOptions.currentPlatform;
    expect(options.appId, '1:998249478055:android:afe7b04c80155aa6352882');
    expect(options.projectId, 'scaledcircle-staging');
    expect(options.messagingSenderId, '998249478055');
  });

  test('unregistered native staging platforms still fail closed', () {
    for (final platform in [
      TargetPlatform.macOS,
      TargetPlatform.windows,
      TargetPlatform.linux,
    ]) {
      debugDefaultTargetPlatformOverride = platform;
      expect(
        () => StagingFirebaseOptions.currentPlatform,
        throwsUnsupportedError,
      );
    }
  });
}
