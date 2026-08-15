import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/admin_dashboard_card.dart';

void main() {
  testWidgets('interactive Admin card is keyboard-focusable and actionable', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AdminDashboardCard(
            title: 'Platform Issues / Action Required',
            subtitle: '0 open issues',
            onTap: () => taps++,
          ),
        ),
      ),
    );

    expect(find.text('Manage'), findsOneWidget);
    expect(
      tester.widget<InkWell>(find.byType(InkWell)).canRequestFocus,
      isTrue,
    );
    await tester.tap(find.text('Platform Issues / Action Required'));
    expect(taps, 1);
  });

  testWidgets('Sales card is visibly and semantically disabled', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AdminDashboardCard(
            title: 'Sales Program',
            subtitle:
                'Referral commissions and payouts are being validated before release.',
            badge: 'PRIVATE DEVELOPMENT',
            disabled: true,
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    expect(find.text('PRIVATE DEVELOPMENT'), findsOneWidget);
    expect(find.byType(InkWell), findsNothing);
    final node = tester.getSemantics(
      find.bySemanticsLabel('Sales Program. Private development. Disabled.'),
    );
    expect(node.flagsCollection.isButton, isTrue);
    expect(node.flagsCollection.isEnabled, ui.Tristate.isFalse);
    semantics.dispose();
  });

  testWidgets('Admin card accepts the available mobile width', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: EdgeInsets.all(24),
            child: AdminDashboardCard(
              title: 'Provider / platform health',
              subtitle: 'Safe configuration status.',
              width: 272,
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.byType(AdminDashboardCard)).width, 272);
  });
}
