import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'login_steps.dart';
import 'capture_driver.dart';

void main() {
  test('landing page opens login before any field operation', () async {
    final calls = <String>[];
    await runLoginSteps((step) async {
      calls.add(step);
      return step == 'login-entry' ? 'public' : 'done';
    }, (step, seconds, action) => action());
    expect(calls.indexOf('login-open'), lessThan(calls.indexOf('email-find')));
    expect(
      calls.indexOf('password-obscured'),
      lessThan(calls.indexOf('password-input')),
    );
    expect(
      calls.indexOf('login-submit'),
      greaterThan(calls.indexOf('password-input')),
    );
    expect(calls.last, 'workspace-initialize');
  });
  test('stalled finder records exact boundary without submitting', () async {
    final events = <Map<String, Object?>>[];
    final calls = <String>[];
    final progress = CaptureProgress(events.add);
    await expectLater(
      runLoginSteps(
        (step) async {
          calls.add(step);
          if (step == 'email-find') await Completer<void>().future;
          return step == 'login-entry' ? 'public' : 'done';
        },
        (step, seconds, action) => progress.stage(
          step,
          const Duration(milliseconds: 10),
          action,
          failureCategory: 'finder_failed',
        ),
      ),
      throwsA(isA<CaptureFailure>()),
    );
    expect(events.last['stage'], 'email-find');
    expect(events.last['outcome'], 'timeout');
    expect(calls, isNot(contains('login-submit')));
  });
  test('existing login route does not repeat public navigation', () async {
    final calls = <String>[];
    await runLoginSteps((step) async {
      calls.add(step);
      return step == 'login-entry' ? 'login' : 'done';
    }, (step, seconds, action) => action());
    expect(calls, isNot(contains('login-open')));
  });
}
