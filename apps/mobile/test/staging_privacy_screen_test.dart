import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/staging_privacy_screen.dart';

class FakePrivacy extends StagingPrivacyService {
  bool present = false, failRead = false, failWrite = false;
  int writes = 0, reads = 0;
  @override
  Future<bool> load() async {
    reads++;
    if (failRead) throw StateError('read');
    return present;
  }

  @override
  Future<void> acknowledge() async {
    writes++;
    if (failWrite) throw StateError('write');
    present = true;
  }
}

void main() {
  Future<void> open(
    WidgetTester tester,
    FakePrivacy service, {
    bool enabled = true,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: StagingPrivacyScreen(service: service, enabled: enabled),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('missing Privacy shows unchecked form; no write on view', (
    t,
  ) async {
    final s = FakePrivacy();
    await open(t, s);
    expect(find.text('Privacy Policy — privacy-2026-08-v1'), findsOneWidget);
    expect(
      t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
      false,
    );
    expect(
      t
          .widget<ElevatedButton>(
            find.widgetWithText(ElevatedButton, 'Submit acknowledgment'),
          )
          .onPressed,
      isNull,
    );
    expect(s.writes, 0);
  });
  testWidgets('present Privacy has no duplicate prompt', (t) async {
    final s = FakePrivacy()..present = true;
    await open(t, s);
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(s.writes, 0);
  });
  testWidgets('explicit acknowledgment submits and refreshes server truth', (
    t,
  ) async {
    final s = FakePrivacy();
    await open(t, s);
    await t.tap(find.byType(CheckboxListTile));
    await t.pump();
    await t.tap(find.text('Submit acknowledgment'));
    await t.pumpAndSettle();
    expect(s.writes, 1);
    expect(s.reads, 2);
    expect(
      find.textContaining('Privacy acknowledgment verified'),
      findsOneWidget,
    );
  });
  testWidgets('call failure shows Retry without false success', (t) async {
    final s = FakePrivacy()..failWrite = true;
    await open(t, s);
    await t.tap(find.byType(CheckboxListTile));
    await t.pump();
    await t.tap(find.text('Submit acknowledgment'));
    await t.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(
      find.textContaining('Privacy acknowledgment verified'),
      findsNothing,
    );
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(s.writes, 1);
    expect(
      t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
      false,
    );
  });
  testWidgets('read rejection holds without prompt', (t) async {
    final s = FakePrivacy()..failRead = true;
    await open(t, s);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(s.writes, 0);
  });
  testWidgets('production unavailable without requests', (t) async {
    final s = FakePrivacy();
    await open(t, s, enabled: false);
    expect(s.reads, 0);
    expect(s.writes, 0);
  });
  test('client uses only authoritative Privacy write and server reads', () {
    final source = File(
      'lib/screens/auth/staging_privacy_screen.dart',
    ).readAsStringSync();
    expect(source, contains(".httpsCallable('recordLegalConsent')"));
    expect(source, contains("'agreementTypes': ['privacy']"));
    expect(source, contains('Source.server'));
    expect(source, isNot(contains('.set(')));
    expect(source, isNot(contains('.update(')));
  });
}
