import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/admin_platform_health_screen.dart';
import 'package:flutter_app/services/admin_operations_service.dart';

void main() {
  testWidgets('saved health is not presented as live provider certification', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 850);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: AdminPlatformHealthBody(
          load: () async => const AdminOperationsSnapshot(
            metrics: {},
            exceptions: [],
            activity: [],
            partial: true,
            health: [
              AdminOpsHealth(
                metric: 'payments',
                state: 'healthy',
                issueCount: 0,
              ),
              AdminOpsHealth(metric: 'email', state: 'degraded', issueCount: 0),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No recorded issues'), findsOneWidget);
    expect(
      find.textContaining('Evidence unavailable or incomplete'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Missing evidence is not a healthy result'),
      findsOneWidget,
    );
    expect(find.text('Configured'), findsNothing);
    expect(find.text('External approval required'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('failure offers retry and does not keep stale healthy evidence', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: AdminPlatformHealthBody(
          load: () async {
            if (++calls == 1) throw StateError('offline');
            return const AdminOperationsSnapshot(
              metrics: {},
              exceptions: [],
              activity: [],
              partial: false,
              health: [],
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining('No provider health has been confirmed'),
      findsOneWidget,
    );
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(
      find.text('No operational health results are available.'),
      findsOneWidget,
    );
  });
}
