import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final sourceRoot = Directory('lib');

  String maintainedSource() => sourceRoot
      .listSync(recursive: true)
      .whereType<File>()
      .where((file) => file.path.endsWith('.dart'))
      .map((file) => file.readAsStringSync())
      .join('\n');

  test('maintained UI exposes no Business or Scaler role switch', () {
    final source = maintainedSource();

    for (final forbidden in <String>[
      'AccountModeSwitchButton',
      'switchAccountView',
      'Switch to Business view',
      'Switch to Scaler view',
      'View as Business',
      'View as Scaler',
    ]) {
      expect(source, isNot(contains(forbidden)), reason: forbidden);
    }
  });

  test('role switch implementation is absent from release source', () {
    expect(
      File('lib/widgets/account_mode_switch_button.dart').existsSync(),
      isFalse,
    );
  });

  test('protected routes continue to use authoritative profile state', () {
    final gate = File(
      'lib/navigation/protected_route_gate.dart',
    ).readAsStringSync();

    expect(gate, contains("profile['role']"));
    expect(gate, contains('ProtectedRouteAudience.business'));
    expect(gate, contains('ProtectedRouteAudience.scaler'));
    expect(gate, contains('ProtectedRouteAudience.admin'));
  });
}
