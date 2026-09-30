import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/registration_entry_gate.dart';
import 'package:flutter_app/navigation/startup_session_gate.dart';

const _registration = Scaffold(
  body: Column(children: [Text('Registration form'), TextField()]),
);

void main() {
  testWidgets('does not show signup until initial identity is resolved', (
    tester,
  ) async {
    final identity = Completer<bool>();
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationEntryGate(
          signedOut: _registration,
          initialIdentityCheck: () => identity.future,
        ),
      ),
    );
    expect(find.text('Registration form'), findsNothing);
    expect(find.text('Checking your session…'), findsOneWidget);
    identity.complete(false);
    await tester.pumpAndSettle();
    expect(find.text('Registration form'), findsOneWidget);
  });

  testWidgets('signed-out entry stays mounted through signup identity change', (
    tester,
  ) async {
    var signedIn = false;
    var checks = 0;
    var startupLoads = 0;
    Future<bool> check() async {
      checks++;
      return signedIn;
    }

    Widget app() => MaterialApp(
      home: RegistrationEntryGate(
        signedOut: _registration,
        initialIdentityCheck: check,
        startupLoad: () async {
          startupLoads++;
          return {'signedIn': true, 'emailVerified': false};
        },
      ),
    );
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Local unsaved form');
    final formState = tester.state(find.byType(TextField));

    // Account creation can authenticate before its server-side finalization.
    // A parent rebuild must not replace the in-progress form with startup.
    signedIn = true;
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(checks, 1);
    expect(startupLoads, 0);
    expect(find.byType(StartupSessionGate), findsNothing);
    expect(tester.state(find.byType(TextField)), same(formState));
    expect(find.text('Local unsaved form'), findsOneWidget);
  });

  for (final role in ['business', 'scaler']) {
    testWidgets('existing $role uses maintained startup and never signup', (
      tester,
    ) async {
      var startupLoads = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: RegistrationEntryGate(
            signedOut: _registration,
            initialIdentityCheck: () async => true,
            startupLoad: () async {
              startupLoads++;
              return {
                'signedIn': true,
                'emailVerified': true,
                'profile': {'role': role, 'active': true},
                'workspaceReady': role == 'business',
                'marketStateConfirmed': true,
                'workProfileComplete': true,
                'missingAgreements': <String>[],
              };
            },
          ),
          routes: {
            '/business': (_) => const Scaffold(body: Text('Business home')),
            '/scaler': (_) => const Scaffold(body: Text('Scaler home')),
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(startupLoads, 1);
      expect(find.text('Registration form'), findsNothing);
      expect(
        find.text(role == 'business' ? 'Business home' : 'Scaler home'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('existing unverified identity retains verification requirement', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationEntryGate(
          signedOut: _registration,
          initialIdentityCheck: () async => true,
          startupLoad: () async => {'signedIn': true, 'emailVerified': false},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Verify your email to continue.'), findsOneWidget);
    expect(find.text('Registration form'), findsNothing);
  });

  testWidgets('identity failure stays closed and Retry resolves the session', (
    tester,
  ) async {
    var checks = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationEntryGate(
          signedOut: _registration,
          initialIdentityCheck: () async {
            checks++;
            if (checks == 1) throw StateError('Fixture identity unavailable');
            return false;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Registration form'), findsNothing);
    expect(
      find.text('We could not verify your session. Please retry.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(checks, 2);
    expect(find.text('Registration form'), findsOneWidget);
  });

  testWidgets('initial identity timeout is bounded and late result ignored', (
    tester,
  ) async {
    final identity = Completer<bool>();
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationEntryGate(
          signedOut: _registration,
          initialIdentityCheck: () => identity.future,
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 20));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Registration form'), findsNothing);
    identity.complete(false);
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Registration form'), findsNothing);
  });
}
