import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/business_back_button.dart';

void main() {
  testWidgets('Business Back returns to the previous maintained screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => Scaffold(
                    appBar: AppBar(leading: const BusinessBackButton()),
                  ),
                ),
              ),
              child: const Text('Open Landing Pages'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Landing Pages'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('business-page-back-button')), findsOneWidget);

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Open Landing Pages'), findsOneWidget);
  });

  testWidgets('direct Business page Back uses the safe dashboard fallback', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        routes: {
          '/business': (_) => const Scaffold(body: Text('Business dashboard')),
        },
        home: Scaffold(
          appBar: AppBar(leading: const BusinessBackButton()),
          body: const Text('Direct-linked Business page'),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Business dashboard'), findsOneWidget);
    expect(find.text('Direct-linked Business page'), findsNothing);
  });

  testWidgets('guard can keep unsaved work in place', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            leading: BusinessBackButton(beforeNavigate: () async => false),
          ),
          body: const Text('Unsaved Landing Page'),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved Landing Page'), findsOneWidget);
  });

  testWidgets('Back control keeps a mobile-safe touch target and tooltip', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            leading: const BusinessBackButton(
              tooltip: 'Back to Business dashboard',
            ),
            title: const Text('Landing Page — Beta'),
          ),
        ),
      ),
    );

    final size = tester.getSize(
      find.byKey(const Key('business-page-back-button')),
    );
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));
    expect(find.text('Landing Page — Beta'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('Landing Page workspace uses guarded canonical Business navigation', () {
    final source = File(
      'lib/screens/business/landing_page_builder_screen.dart',
    ).readAsStringSync();
    expect(source, contains('leading: BusinessBackButton('));
    expect(source, contains('PopScope('));
    expect(source, contains('_confirmLeaveWithUnsavedChanges'));
    expect(source, contains("'Leave without saving?'"));
    expect(source, isNot(contains('AppRoutes.businessDashboard')));
  });
}
