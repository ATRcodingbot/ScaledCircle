import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/areas_preferences_screen.dart';

void main() {
  Future<void> open(
    WidgetTester tester,
    Future<Map<String, dynamic>?> Function() load,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: AreasPreferencesScreen(
          role: 'scaler',
          onboarding: true,
          loadPreferences: load,
          loadWorkTypes: () async => [],
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('first-time pending Scaler reaches blank form without writes', (
    tester,
  ) async {
    await open(tester, () async => null);
    await tester.pumpAndSettle();
    expect(find.text('Where do you want to work?'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
  testWidgets('existing work interests are preserved', (tester) async {
    await open(
      tester,
      () async => {'otherWorkInterests': 'Existing preference'},
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('other-work-interests-block')),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Existing preference'), findsOneWidget);
  });
  testWidgets('failed pending read exits loading and Retry reaches form', (
    tester,
  ) async {
    var calls = 0;
    await open(tester, () async {
      if (calls++ == 0) {
        throw StateError('internal provider diagnostic must stay private');
      }
      return null;
    });
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(
      find.text('Unable to load work preferences. Please try again.'),
      findsOneWidget,
    );
    expect(find.textContaining('provider diagnostic'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Where do you want to work?'), findsOneWidget);
  });
  testWidgets('unresolved request times out to recoverable error', (
    tester,
  ) async {
    await open(tester, () => Completer<Map<String, dynamic>?>().future);
    await tester.pump(const Duration(seconds: 21));
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
  });
}
