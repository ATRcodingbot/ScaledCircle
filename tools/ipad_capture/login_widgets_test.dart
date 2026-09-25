import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';

void main() {
  testWidgets(
    'real login fields keep synthetic input exact and password obscured',
    (tester) async {
      tester.view.physicalSize = const Size(2064, 2752);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
      final email = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Email',
      );
      final password = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Password',
      );
      expect(find.bySemanticsLabel('Email'), findsOneWidget);
      expect(find.bySemanticsLabel('Password'), findsOneWidget);
      await tester.enterText(email, 'synthetic+review@example.invalid');
      await tester.enterText(password, r'synthetic !"$`+\\value');
      expect(
        tester.widget<TextField>(email).controller!.text,
        'synthetic+review@example.invalid',
      );
      expect(
        tester.widget<TextField>(password).controller!.text,
        r'synthetic !"$`+\\value',
      );
      expect(tester.widget<TextField>(password).obscureText, isTrue);
      await tester.ensureVisible(find.text('Login'));
      expect(
        tester
            .widget<ElevatedButton>(
              find.widgetWithText(ElevatedButton, 'Login'),
            )
            .onPressed,
        isNotNull,
      );
      // Do not dispatch a live Firebase request in this offline widget test.
      expect(tester.takeException(), isNull);
      semantics.dispose();
    },
  );
}
