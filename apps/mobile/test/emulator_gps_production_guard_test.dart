import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('legacy production web tracker exposes no simulated route action', () {
    final source = File(
      'lib/screens/jobs/job_tracking_screen.dart',
    ).readAsStringSync();
    expect(source, isNot(contains('Simulate Walking Route')));
    expect(source, isNot(contains('_simulateMovement')));
    expect(source, isNot(contains("'simulated':")));
  });

  test('test harness selection is compile-time local and identity-neutral', () {
    final policy = File(
      'lib/services/tracking_runtime_policy.dart',
    ).readAsStringSync();
    final service = File(
      'lib/services/active_job_tracking_service.dart',
    ).readAsStringSync();
    final details = File(
      'lib/screens/jobs/job_details_screen.dart',
    ).readAsStringSync();
    expect(policy, contains('AppEnvironmentConfig.isLocal && !kReleaseMode'));
    expect(policy, contains("firebaseProjectId != 'demo-scaledcircle'"));
    expect(
      service,
      contains('TrackingRuntimePolicy.emulatorGpsHarnessEnabled'),
    );
    expect(
      details,
      contains('TrackingRuntimePolicy.emulatorGpsHarnessEnabled'),
    );
    expect('$policy$service$details', isNot(contains('skotiatrades')));
    expect('$policy$service$details', isNot(contains('isQa')));
  });

  test(
    'test harness has no URL, Firestore, Remote Config, or callable switch',
    () {
      final policy = File(
        'lib/services/tracking_runtime_policy.dart',
      ).readAsStringSync();
      final bridge = File(
        'lib/services/emulator_test_tracking_bridge.dart',
      ).readAsStringSync();
      final combined = '$policy$bridge';
      expect(combined, isNot(contains('queryParameters')));
      expect(combined, isNot(contains('FirebaseRemoteConfig')));
      expect(combined, isNot(contains('FirebaseFirestore')));
      expect(combined, isNot(contains('HttpsCallable')));
    },
  );
}
