import 'package:flutter/foundation.dart';

import '../config/app_environment.dart';

/// Compile-time and Firebase-project boundary for the local GPS harness.
///
/// Identity, Firestore data, URLs, and runtime flags cannot enable this path.
abstract final class TrackingRuntimePolicy {
  static const bool emulatorGpsHarnessEnabled =
      AppEnvironmentConfig.isLocal && !kReleaseMode;

  static void requireEmulatorGpsHarness() {
    if (!emulatorGpsHarnessEnabled ||
        AppEnvironmentConfig.firebaseProjectId != 'demo-scaledcircle') {
      throw StateError(
        'Test location is available only in a non-release APP_ENV=local build '
        'connected to the demo Firebase emulators.',
      );
    }
    // Accessing the host also fails closed if APP_ENV is not local. main.dart
    // attaches Auth, Firestore, Functions, and Storage to this host before UI.
    if (AppEnvironmentConfig.emulatorHost.trim().isEmpty) {
      throw StateError('A Firebase emulator host is required.');
    }
  }
}
