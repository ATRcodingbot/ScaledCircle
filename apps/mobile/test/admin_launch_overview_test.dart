import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/admin_operations_service.dart';
import 'package:flutter_app/screens/admin/admin_launch_overview.dart';

void main() {
  test('unknown metrics stay null', () {
    final s = AdminOperationsSnapshot.fromMap({
      'metrics': {'businesses': null},
    });
    expect(s.metrics['businesses'], isNull);
  });
  testWidgets(
    'read-only overview is safe at narrow width and routes existing details',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var opened = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: AdminLaunchOverview(
                data: const {
                  'payoutCertification': {},
                  'billing': {'active': null},
                },
                onBilling: () => opened++,
                onProviders: () {},
              ),
            ),
          ),
        ),
      );
      expect(
        find.textContaining('cash-out → bank receipt: pending'),
        findsOneWidget,
      );
      expect(find.text('Active memberships: Unavailable'), findsOneWidget);
      await tester.ensureVisible(find.text('Review subscriptions'));
      await tester.tap(find.text('Review subscriptions'));
      expect(opened, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
