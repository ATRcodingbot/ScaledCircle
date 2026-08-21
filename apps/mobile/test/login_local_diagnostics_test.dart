import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('local login exposes only the sanitized Firebase Auth error code', () {
    final source = File(
      'lib/screens/auth/login_screen.dart',
    ).readAsStringSync();

    expect(source, contains('Firebase Auth error: \${error.code}'));
    expect(source, contains('LOCAL Firebase Auth error code=\${e.code}'));
    expect(source, isNot(contains('error.stackTrace')));
    expect(source, isNot(contains('accessToken')));
    expect(source, isNot(contains('idToken')));
    expect(source, isNot(contains('refreshToken')));
  });

  test('production login messages remain user friendly', () {
    final source = File(
      'lib/screens/auth/login_screen.dart',
    ).readAsStringSync();

    expect(source, contains('if (AppEnvironmentConfig.isLocal)'));
    expect(source, contains("return 'Incorrect password.'"));
    expect(
      source,
      contains("return 'Network error. Check your internet connection.'"),
    );
  });

  test('local Firebase options are complete and demo-project isolated', () {
    final environmentSource = File(
      'lib/config/app_environment.dart',
    ).readAsStringSync();
    final source = File(
      'lib/config/firebase_options_local.dart',
    ).readAsStringSync();

    expect(source, contains("apiKey: 'fake-api-key'"));
    expect(source, contains("appId: '1:000000000000:web:local-scaledcircle'"));
    expect(source, contains("projectId: 'demo-scaledcircle'"));
    expect(source, contains("authDomain: 'demo-scaledcircle.firebaseapp.com'"));
    expect(source, contains("storageBucket: 'demo-scaledcircle.appspot.com'"));
    expect(environmentSource, contains("actual == 'scaled-circle'"));
    expect(
      environmentSource,
      contains('Non-production APP_ENV must never connect to scaled-circle'),
    );
  });

  test('all Firebase emulators attach before the widget tree starts', () {
    final source = File('lib/main.dart').readAsStringSync();
    final initialize = source.indexOf('Firebase.initializeApp');
    final clearHint = source.indexOf('clearRetainedAuthEmulatorOrigin');
    final verify = source.indexOf('verifyInitializedProject');
    final connect = source.indexOf('await _connectToFirebaseEmulators()');
    final runApp = source.indexOf('runApp(const ScaledCircleApp())');

    expect(initialize, greaterThanOrEqualTo(0));
    expect(verify, greaterThan(initialize));
    expect(connect, greaterThan(verify));
    expect(runApp, greaterThan(connect));
    expect(source, contains('useAuthEmulator(host, 9099)'));
    expect(source, contains('setPersistence(Persistence.NONE)'));
    expect(
      source.indexOf('useAuthEmulator(host, 9099)'),
      lessThan(source.indexOf('setPersistence(Persistence.NONE)')),
    );
    expect(source, contains('useFirestoreEmulator(host, 8080)'));
    expect(source, contains('useFunctionsEmulator(host, 5001)'));
    expect(source, contains('useStorageEmulator(host, 9199)'));
    expect(clearHint, greaterThan(initialize));
    expect(clearHint, lessThan(source.indexOf('FirebaseAuth.instance')));
  });

  test('local application code has no production Auth REST endpoint', () {
    final dartSources = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'));

    for (final file in dartSources) {
      expect(
        file.readAsStringSync(),
        isNot(contains('identitytoolkit.googleapis.com')),
        reason: file.path,
      );
    }
  });

  test('127.0.0.1 reload clears the stale FlutterFire emulator hint', () {
    final source = File(
      'lib/config/firebase_auth_emulator_session_web.dart',
    ).readAsStringSync();

    expect(source, contains('sessionStorage.removeItem'));
    expect(source, contains(r'$appName-firebaseEmulatorOrigin'));
    expect(source, contains('127.0.0.1'));
    expect(source, isNot(contains('localStorage.clear')));
    expect(source, isNot(contains('sessionStorage.clear')));
  });
}
