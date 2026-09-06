import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/bootstrap/ios_startup_gate.dart';

void main() {
  Widget gate(Future<void> Function() initialize) => IosStartupGate(
    initialize: initialize,
    timeout: const Duration(seconds: 1),
    child: const MaterialApp(home: Text('Normal application')),
  );

  testWidgets('renders before initialization and preserves normal success', (
    tester,
  ) async {
    final pending = Completer<void>();
    await tester.pumpWidget(gate(() => pending.future));
    expect(find.text('Starting ScaledCircle…'), findsOneWidget);
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.text('Normal application'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('synchronous configuration failure is sanitized and retryable', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      gate(() {
        if (++calls == 1) throw StateError('private configuration details');
        return Future<void>.value();
      }),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('private configuration'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Normal application'), findsOneWidget);
  });

  testWidgets('async plugin failure renders recovery instead of blank root', (
    tester,
  ) async {
    await tester.pumpWidget(
      gate(() => Future<void>.error(Exception('private'))),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('timeout retry joins native work and never starts a duplicate', (
    tester,
  ) async {
    var calls = 0;
    final pending = Completer<void>();
    await tester.pumpWidget(
      gate(() {
        calls++;
        return pending.future;
      }),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Retry'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(calls, 1);
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.text('Normal application'), findsOneWidget);
  });

  testWidgets('late completion after disposal has no setState error', (
    tester,
  ) async {
    final pending = Completer<void>();
    await tester.pumpWidget(gate(() => pending.future));
    await tester.pumpWidget(const SizedBox());
    pending.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
