import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'pending Scaler setup reuses the existing preference screen and callables',
    () {
      final pending = File(
        'lib/screens/public/early_access_pending_screen.dart',
      ).readAsStringSync();
      final service = File(
        'lib/services/discovery_preferences_service.dart',
      ).readAsStringSync();
      expect(pending, contains("role: 'scaler'"));
      expect(pending, contains('AreasPreferencesScreen'));
      expect(pending, contains('Set Up Work Preferences'));
      expect(pending, contains('This does not grant marketplace access'));
      expect(service, contains("httpsCallable('getPendingScalerPreferences')"));
      expect(
        service,
        contains("httpsCallable('savePendingScalerPreferences')"),
      );
      expect(service, contains("'initialSetupCompleted': true"));
      expect(pending, contains('completePendingScalerSetup'));
      expect(pending, contains('onCompleted:'));
      final screen = File(
        'lib/screens/preferences/areas_preferences_screen.dart',
      ).readAsStringSync();
      expect(screen, contains('completePreferences'));
    },
  );

  test(
    'Scaler work types are loaded from the server taxonomy, not a Flutter list',
    () {
      final screen = File(
        'lib/screens/preferences/areas_preferences_screen.dart',
      ).readAsStringSync();
      final service = File(
        'lib/services/discovery_preferences_service.dart',
      ).readAsStringSync();
      expect(service, contains("httpsCallable('getMarketplaceWorkTypes')"));
      expect(screen, contains('type.scalerSelectable'));
      expect(screen, isNot(contains("'short_local'")));
      expect(screen, isNot(contains("'long_high_paying'")));
      expect(screen, isNot(contains("'crew_jobs'")));
    },
  );

  test('alerts and work-style traits remain separate and conservative', () {
    final screen = File(
      'lib/screens/preferences/areas_preferences_screen.dart',
    ).readAsStringSync();
    expect(screen, contains('Email me about matching jobs'));
    expect(screen, contains('Push notifications — Coming Soon'));
    expect(screen, contains('I am willing to do door-to-door outreach'));
    expect(screen, contains('Tell me about Scaler Crew jobs'));
    expect(screen, contains('Manual search stays open'));
  });

  test('other interests remain optional informational plain text', () {
    final screen = File(
      'lib/screens/preferences/areas_preferences_screen.dart',
    ).readAsStringSync();
    final backend = File(
      '../../functions/discovery_preferences.js',
    ).readAsStringSync();
    expect(screen, contains("Other work you're interested in (optional)"));
    expect(screen, contains('maxLength: 500'));
    expect(
      screen,
      contains('Informational only — not used for automatic job matching.'),
    );
    expect(backend, contains('MAX_OTHER_WORK_INTERESTS = 500'));
    expect(backend, contains('otherWorkInterests: sanitizeOtherWorkInterests'));
  });

  test('registration passes authoritative role into pending access', () {
    final register = File(
      'lib/screens/auth/register_screen.dart',
    ).readAsStringSync();
    final login = File('lib/screens/auth/login_screen.dart').readAsStringSync();
    expect(register, contains('role: UserProfile.roleValue(_role)'));
    expect(login, contains('betaAccess'));
    expect(login, contains('role == \'admin\''));
    expect(login, contains("userData?['active'] == true"));
  });
}
