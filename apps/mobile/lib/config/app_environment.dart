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

  // Keep environment branches directly tied to compile-time constants. This
  // lets release compilers remove credentials and origins for other targets.
  static String get diagnosticsLabel {
    if (isProduction) return 'PRODUCTION';
    if (isStaging) return 'STAGING • TEST PAYMENTS';
    if (isLocal) return 'LOCAL / TEST';
    return environment.name; // Preserves the fail-closed invalid APP_ENV path.
  }

  static String get firebaseProjectId {
    if (isProduction) return 'scaled-circle';
    if (isStaging) return 'scaledcircle-staging';
    if (isLocal) return 'demo-scaledcircle';
    return environment.name;
  }

  static String get functionsRegion => 'us-east1';
  static Uri get publicBaseUrl {
    if (isProduction) return Uri.parse('https://scaledcircle.com');
    if (isStaging) return Uri.parse('https://scaledcircle-staging.web.app');
    if (isLocal) return Uri.parse('http://127.0.0.1:5000');
    throw StateError('Invalid APP_ENV: ${environment.name}');
  }

  static FirebaseOptions get firebaseOptions {
    if (isProduction) return DefaultFirebaseOptions.currentPlatform;
    if (isStaging) return StagingFirebaseOptions.currentPlatform;
    if (isLocal) return LocalFirebaseOptions.currentPlatform;
    throw StateError('Invalid APP_ENV: ${environment.name}');
  }

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

  static Uri socialOAuthCallback(String provider) {
    final functionName = switch (provider) {
      'x' => 'socialOAuthXCallbackV1',
      'meta' => 'socialOAuthMetaCallbackV1',
      _ => 'socialOAuthCallbackV1',
    };
    if (isProduction) {
      return Uri.parse(
        'https://us-east1-scaled-circle.cloudfunctions.net/$functionName',
      );
    }
    if (isStaging) {
      return Uri.parse(
        'https://us-east1-scaledcircle-staging.cloudfunctions.net/$functionName',
      );
    }
    if (isLocal) {
      return functionsBaseUrl.replace(
        path: '${functionsBaseUrl.path}/$functionName',
      );
    }
    throw StateError('Invalid APP_ENV: ${environment.name}');
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
