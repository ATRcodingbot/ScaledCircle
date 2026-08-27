import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'firebase_options_local.dart';
import 'firebase_options_staging.dart';

enum AppEnvironment { local, staging, production }

/// Single source of truth for runtime environment selection.
///
/// APP_ENV is deliberately required. An omitted or unknown value must never
/// choose production implicitly.
abstract final class AppEnvironmentConfig {
  static const String _rawEnvironment = String.fromEnvironment('APP_ENV');
  static const String _configuredEmulatorHost = String.fromEnvironment(
    'FIREBASE_EMULATOR_HOST',
  );

  static const bool isLocal = _rawEnvironment == 'local';
  static const bool isStaging = _rawEnvironment == 'staging';
  static const bool isProduction = _rawEnvironment == 'production';
  static const bool responseTrackingEnabled = isStaging || isProduction;

  static AppEnvironment get environment => switch (_rawEnvironment) {
    'local' => AppEnvironment.local,
    'staging' => AppEnvironment.staging,
    'production' => AppEnvironment.production,
    _ => throw StateError(
      'APP_ENV must be exactly "local", "staging", or "production". '
      'Refusing to start with APP_ENV="$_rawEnvironment".',
    ),
  };

  static String get diagnosticsLabel => switch (environment) {
    AppEnvironment.local => 'LOCAL / TEST',
    AppEnvironment.staging => 'STAGING • TEST PAYMENTS',
    AppEnvironment.production => 'PRODUCTION',
  };
  static String get firebaseProjectId => switch (environment) {
    AppEnvironment.local => 'demo-scaledcircle',
    AppEnvironment.staging => 'scaledcircle-staging',
    AppEnvironment.production => 'scaled-circle',
  };
  static String get functionsRegion => 'us-east1';
  static Uri get publicBaseUrl => switch (environment) {
    AppEnvironment.local => Uri.parse('http://127.0.0.1:5000'),
    AppEnvironment.staging => Uri.parse('https://scaledcircle-staging.web.app'),
    AppEnvironment.production => Uri.parse('https://scaledcircle.com'),
  };

  static FirebaseOptions get firebaseOptions => switch (environment) {
    AppEnvironment.local => LocalFirebaseOptions.currentPlatform,
    AppEnvironment.staging => StagingFirebaseOptions.currentPlatform,
    AppEnvironment.production => DefaultFirebaseOptions.currentPlatform,
  };

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
    if (!isProduction && actual == 'scaled-circle') {
      throw StateError(
        'Non-production APP_ENV must never connect to scaled-circle.',
      );
    }
  }
}
