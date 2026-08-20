import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('public early-access signup uses server finalization, not generic verification', () {
    final auth = File('lib/services/auth/auth_service.dart').readAsStringSync();
    final method = auth.substring(auth.indexOf('Future<User> signUpForEarlyAccess'),
      auth.indexOf('Future<User?> login'));
    expect(method, contains('finalizePublicSignup'));
    expect(method, isNot(contains('sendEmailVerification')));
    expect(method, isNot(contains('user.delete')));
  });

  test('branded verification screen handles success, expiry, invalid, and loading', () {
    final source = File('lib/screens/auth/verify_email_screen.dart').readAsStringSync();
    for (final value in ['Verifying your email', 'Email verified', 'expired',
      "couldn't verify", 'CircularProgressIndicator', 'SEND A NEW VERIFICATION EMAIL']) {
      expect(source, contains(value));
    }
    expect(source, contains('applyActionCode'));
    expect(source, isNot(contains('error.message')));
    expect(source, contains('success ? AppColors.textPrimary'));
    expect(source, contains('success ? const TextStyle(color: AppColors.textSecondary)'));
  });

  test('profile continuation preserves login destination and pending authority', () {
    final profile = File('lib/screens/auth/complete_scaler_profile_screen.dart').readAsStringSync();
    final login = File('lib/screens/auth/login_screen.dart').readAsStringSync();
    expect(profile, contains('returnRoute: AppRoutes.completeScalerProfile'));
    expect(profile, contains('loadPendingScaler'));
    expect(profile, contains('savePendingScaler'));
    expect(login, contains('widget.returnRoute'));
  });

  test('pending experience exposes throttled resend without generic Firebase send', () {
    final pending = File('lib/screens/public/early_access_pending_screen.dart').readAsStringSync();
    expect(pending, contains('Resend Verification Email'));
    expect(pending, contains('TransactionalEmailService().resendVerification'));
    expect(pending, isNot(contains('sendEmailVerification')));
  });
}
