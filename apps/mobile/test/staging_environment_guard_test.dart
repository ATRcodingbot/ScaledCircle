import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final environment = File(
    'lib/config/app_environment.dart',
  ).readAsStringSync();
  final stagingOptions = File(
    'lib/config/firebase_options_staging.dart',
  ).readAsStringSync();
  final mainSource = File('lib/main.dart').readAsStringSync();
  final trackingPolicy = File(
    'lib/services/tracking_runtime_policy.dart',
  ).readAsStringSync();

  test('staging is explicit and never falls through to production', () {
    expect(environment, contains("'staging' => AppEnvironment.staging"));
    expect(
      environment,
      contains("if (isStaging) return 'scaledcircle-staging'"),
    );
    expect(environment, contains('Non-production APP_ENV must never connect'));
    expect(environment, contains('APP_ENV must be exactly'));
  });

  test('OAuth callbacks are environment-derived and production-safe', () {
    expect(
      environment,
      contains(
        'https://us-east1-scaled-circle.cloudfunctions.net/\$functionName',
      ),
    );
    expect(
      environment,
      contains(
        'https://us-east1-scaledcircle-staging.cloudfunctions.net/\$functionName',
      ),
    );
    expect(environment, contains('if (isProduction)'));
    expect(environment, contains('if (isStaging)'));
  });

  test('staging uses its dedicated web Firebase app', () {
    expect(stagingOptions, contains("projectId: 'scaledcircle-staging'"));
    expect(
      stagingOptions,
      contains("authDomain: 'scaledcircle-staging.firebaseapp.com'"),
    );
    expect(stagingOptions, isNot(contains("projectId: 'scaled-circle'")));
  });

  test('staging indicator is persistent and production remains unmarked', () {
    expect(environment, contains('STAGING • TEST PAYMENTS'));
    expect(mainSource, contains('AppEnvironmentConfig.isProduction'));
    expect(mainSource, contains('AppEnvironmentConfig.isStaging'));
  });

  test('staging cannot enable the emulator GPS harness', () {
    expect(
      trackingPolicy,
      contains('AppEnvironmentConfig.isLocal && !kReleaseMode'),
    );
    expect(trackingPolicy, isNot(contains('isStaging')));
  });
}
