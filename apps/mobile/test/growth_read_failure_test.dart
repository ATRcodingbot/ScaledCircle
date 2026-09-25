import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/growth_read_failure.dart';

void main() {
  test('service failure does not accuse the signed-in account', () {
    final message = growthReadFailure(
      FirebaseFunctionsException(
        code: 'unavailable',
        message: 'private details',
      ),
      privateWorkspace: true,
    );
    expect(message, contains('temporarily unavailable'));
    expect(message, isNot(contains('private details')));
    expect(message, isNot(contains('Sign in')));
  });
  test(
    'authentication, denial, workspace, timeout and response failures differ',
    () {
      final codes = [
        'unauthenticated',
        'permission-denied',
        'not-found',
        'data-loss',
      ];
      final messages = codes
          .map(
            (code) => growthReadFailure(
              FirebaseFunctionsException(code: code, message: ""),
            ),
          )
          .toSet();
      messages.add(growthReadFailure(TimeoutException('private')));
      messages.add(growthReadFailure(const FormatException('private')));
      expect(messages.length, 6);
      expect(messages.every((message) => !message.contains('private')), isTrue);
    },
  );
}
