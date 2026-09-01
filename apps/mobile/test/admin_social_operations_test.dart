import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Admin Social Operations exposes bounded health without secrets', () {
    final screen = File(
      'lib/screens/admin/admin_social_operations_screen.dart',
    ).readAsStringSync();
    expect(screen, contains('Provider-free operational health'));
    expect(screen, contains('External publishing'));
    expect(screen, contains('Ad mutations'));
    expect(screen, contains('Bulk email delivery'));
    expect(screen, contains('Tokens, passwords, private media'));
  });

  test('Admin service uses the bounded summary callable', () {
    final service = File(
      'lib/services/admin_operations_service.dart',
    ).readAsStringSync();
    expect(service, contains('getSocialOperationsAdminSummary'));
  });
}
