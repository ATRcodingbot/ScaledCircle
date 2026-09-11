import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_capability_status.dart';

void main() {
  testWidgets('premium Betas stay visible and fulfillment cannot be ordered', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: CustomerCapabilityStatus()),
        ),
      ),
    );
    for (final title in [
      'Social Manager — Beta',
      'Lead Generation Research — Private Beta',
      'Business Assistant — Beta / Coming Soon',
      'Ad Manager — Beta',
      'Printing — Coming Soon',
      'Postcard Campaigns — Private Beta',
    ]) {
      expect(find.text(title), findsOneWidget);
    }
    expect(
      find.textContaining('Printing orders are not available yet.'),
      findsOneWidget,
    );
    expect(
      find.textContaining('General ordering is not open.'),
      findsOneWidget,
    );
    expect(find.byType(FilledButton), findsNothing);
    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.byType(TextButton), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('availability explanations remain readable on narrow mobile', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CustomerCapabilityStatus(),
            ),
          ),
        ),
      ),
    );
    await tester.ensureVisible(
      find.text('Postcard Campaigns — Private Beta'),
    );
    expect(tester.takeException(), isNull);
  });
}
