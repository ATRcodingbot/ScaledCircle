import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Complete Profile sends pending and approved Scalers to one setup UI', () {
    final source = File(
      'lib/screens/auth/complete_scaler_profile_screen.dart',
    ).readAsStringSync();
    expect(source, contains('AreasPreferencesScreen'));
    expect(source, contains('loadPreferences: approved'));
    expect(source, contains('preferences.load'));
    expect(source, contains('preferences.loadPendingScaler'));
    expect(source, contains('preferences.completeScalerSetup'));
    expect(source, contains('preferences.completePendingScalerSetup'));
    expect(
      source,
      isNot(
        contains(
          'if (approved) {\n      if (!mounted) return;\n      Navigator.of(context).pushReplacement',
        ),
      ),
    );
    final login = File('lib/screens/auth/login_screen.dart').readAsStringSync();
    expect('widget.returnRoute != null'.allMatches(login).length, 2);
  });

  test('final completion is distinct from intermediate preference saves', () {
    final source = File(
      'lib/screens/preferences/areas_preferences_screen.dart',
    ).readAsStringSync();
    expect(
      source,
      contains('final ValueChanged<Map<String, dynamic>>? onCompleted'),
    );
    expect(source, contains('widget.onCompleted?.call(saved)'));
    expect('widget.onCompleted?.call(saved)'.allMatches(source).length, 1);
    expect(source, contains("? 'Save & Continue'"));
  });

  test('dashboard exposes completion CTA and preserves affiliate entry', () {
    final source = File(
      'lib/screens/scaler/dashboard/scaler_dashboard_screen.dart',
    ).readAsStringSync();
    expect(source, contains('initialSetupCompletedAt'));
    expect(source, contains('FINISH SETTING UP YOUR WORK PREFERENCES'));
    expect(source, contains('COMPLETE SETUP'));
    expect(source, contains('Edit Work Preferences'));
    expect(source, contains('Earn with Referrals'));
  });

  test(
    'own profile separates reputation from authoritative Work Preferences',
    () {
      final source = File(
        'lib/screens/scaler/profile/scaler_profile_screen.dart',
      ).readAsStringSync();
      expect(source, contains('PROFILE & REPUTATION'));
      expect(source, contains('WORK PREFERENCES'));
      expect(source, contains("collection('discoveryPreferences')"));
      expect(source, contains('EDIT WORK PREFERENCES'));
      expect(source, isNot(contains('title: const Text("Service Area")')));
      expect(source, isNot(contains('Location not set')));
    },
  );
}
