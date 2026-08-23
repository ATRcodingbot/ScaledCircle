import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('all authenticated role shells expose the shared Sign Out action', () {
    final business = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    final scaler = File(
      'lib/screens/scaler/dashboard/scaler_dashboard_screen.dart',
    ).readAsStringSync();
    final admin = File(
      'lib/screens/admin/admin_dashboard_screen.dart',
    ).readAsStringSync();

    for (final shell in [business, scaler, admin]) {
      expect(shell, contains('AuthenticatedSignOutButton'));
    }
  });

  test('shared Sign Out ends Firebase Auth and returns to login', () {
    final source = File(
      'lib/widgets/authenticated_sign_out_button.dart',
    ).readAsStringSync();

    expect(source, contains('FirebaseAuth.instance.signOut()'));
    expect(source, contains('AppNavigation.replace(context, AppRoutes.login)'));
    expect(source, contains("tooltip: 'Sign Out'"));
    expect(source, isNot(contains('switchAccountView')));
  });

  test('protected routes still resolve from authoritative Auth/profile state', () {
    final gate = File(
      'lib/navigation/protected_route_gate.dart',
    ).readAsStringSync();

    expect(gate, contains('FirebaseAuth.instance.authStateChanges()'));
    expect(gate, contains('FirebaseFirestore.instance'));
    expect(gate, contains('if (user == null) return LoginScreen'));
  });

  test('Admin login records only a safe staging Auth error code', () {
    final source = File(
      'lib/screens/admin/admin_login_screen.dart',
    ).readAsStringSync();

    expect(source, contains('AppEnvironmentConfig.isStaging'));
    expect(source, contains("debugPrint('Admin Firebase Auth failed:"));
    expect(source, contains('error.code'));
    expect(source, isNot(contains('error.message')));
  });
}
