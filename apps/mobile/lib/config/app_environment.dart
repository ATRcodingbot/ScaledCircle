import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';

enum AppEnvironment { local, production }

/// Single source of truth for runtime environment selection.
///
/// APP_ENV is deliberately required. An omitted or unknown value must never
/// choose production implicitly.
abstract final class AppEnvironmentConfig {
  static const String _rawEnvironment = String.fromEnvironment('APP_ENV');
  static const String _configuredEmulatorHost = String.fromEnvironment(
    'FIREBASE_EMULATOR_HOST',
  );

  static AppEnvironment get environment => switch (_rawEnvironment) {
    'local' => AppEnvironment.local,
    'production' => AppEnvironment.production,
    _ => throw StateError(
      'APP_ENV must be exactly "local" or "production". '
      'Refusing to start with APP_ENV="$_rawEnvironment".',
    ),
  };

  static bool get isProduction => environment == AppEnvironment.production;
  static bool get isLocal => environment == AppEnvironment.local;
  static String get diagnosticsLabel => isLocal ? 'LOCAL / TEST' : 'PRODUCTION';
  static String get firebaseProjectId =>
      isLocal ? 'demo-scaledcircle' : 'scaled-circle';
  static String get functionsRegion => 'us-east1';
  static Uri get publicBaseUrl =>
      Uri.parse(isLocal ? 'http://127.0.0.1:5000' : 'https://scaledcircle.com');

  static FirebaseOptions get firebaseOptions =>
      isLocal ? _localFirebaseOptions : DefaultFirebaseOptions.currentPlatform;

  static String get emulatorHost {
    if (!isLocal) {
      throw StateError('Emulator host requested outside APP_ENV=local.');
    }
    if (_configuredEmulatorHost.trim().isNotEmpty) {
      return _configuredEmulatorHost.trim();
    }
    if (kIsWeb) return '127.0.0.1';
    return defaultTargetPlatform == TargetPlatform.android
        ? '10.0.2.2'
        : '127.0.0.1';
  }

  static Uri get functionsBaseUrl {
    if (isLocal) {
      return Uri.parse(
        'http://$emulatorHost:5001/$firebaseProjectId/$functionsRegion',
      );
    }
    return Uri.parse(
      'https://$functionsRegion-$firebaseProjectId.cloudfunctions.net',
    );
  }

  static void verifyInitializedProject(FirebaseApp app) {
    final actual = app.options.projectId;
    if (actual != firebaseProjectId) {
      throw StateError(
        'Firebase project mismatch for $diagnosticsLabel: expected '
        '"$firebaseProjectId", received "$actual". Startup stopped.',
      );
    }
    if (isLocal && actual == 'scaled-circle') {
      throw StateError(
        'APP_ENV=local must never connect to production project scaled-circle.',
      );
    }
  }

  static const FirebaseOptions _localFirebaseOptions = FirebaseOptions(
    apiKey: 'demo-api-key',
    appId: '1:000000000000:web:local-scaledcircle',
    messagingSenderId: '000000000000',
    projectId: 'demo-scaledcircle',
    authDomain: 'demo-scaledcircle.firebaseapp.com',
    storageBucket: 'demo-scaledcircle.appspot.com',
  );
}
