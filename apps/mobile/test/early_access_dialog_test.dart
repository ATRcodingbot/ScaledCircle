import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/screens/public/early_access_dialog.dart';

Widget _testApp() {
  return MaterialApp(
    home: Builder(
      builder: (context) => Scaffold(
        body: Center(
          child: FilledButton(
            onPressed: () => showEarlyAccessDialog(context),
            child: const Text('Open'),
          ),
        ),
      ),
    ),
  );
}

Future<void> _open(WidgetTester tester) async {
  await tester.pumpWidget(_testApp());
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
  expect(find.text('Maryland Early Sign Up!'), findsOneWidget);
}

void main() {
  testWidgets('visible close button dismisses the modal', (tester) async {
    await _open(tester);
    final close = find.byTooltip('Close early sign up');
    expect(close, findsOneWidget);
    expect(tester.getSize(close), const Size(48, 48));

    await tester.tap(close);
    await tester.pumpAndSettle();
    expect(find.text('Maryland Early Sign Up!'), findsNothing);
  });

  testWidgets('backdrop and Escape dismiss without navigation', (tester) async {
    await _open(tester);
    await tester.tapAt(const Offset(2, 2));
    await tester.pumpAndSettle();
    expect(find.text('Maryland Early Sign Up!'), findsNothing);

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.text('Maryland Early Sign Up!'), findsNothing);
  });

  testWidgets('inside taps do not dismiss and mobile layout remains usable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _open(tester);
    await tester.tap(find.text('Maryland Early Sign Up!'));
    await tester.pump();
    expect(find.text('Join Email Alerts'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('personal referrals require the referrer name', (tester) async {
    await _open(tester);

    final sourceField = find.text('How did you hear about us?');
    expect(sourceField, findsOneWidget);
    await tester.ensureVisible(sourceField);
    await tester.tap(sourceField);
    await tester.pumpAndSettle();
    await tester.tap(find.text('A person referred me').last);
    await tester.pumpAndSettle();

    expect(find.text('Who referred you?'), findsOneWidget);
  });

  testWidgets('offers an optional contact number', (tester) async {
    await _open(tester);

    final contactField = find.text('Contact number (optional)');
    await tester.ensureVisible(contactField);
    expect(contactField, findsOneWidget);
  });
}
