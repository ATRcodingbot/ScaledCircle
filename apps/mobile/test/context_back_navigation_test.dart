import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/context_back_button.dart';
import 'package:flutter_app/screens/jobs/job_room_screen.dart';
import 'package:flutter_app/services/job_room_service.dart';

class _Room extends JobRoomService {
  @override
  Future<Map<String, dynamic>> load(String _) async => {
    'viewerRole': 'scaler',
    'privateLogisticsAvailable': false,
    'room': {'scalerId': 'self'},
    'campaign': {},
    'zone': {'status': 'submitted'},
  };
}

void main() {
  for (final origin in ['Current Campaigns', 'Notifications']) {
    testWidgets('$origin → Job Room → visible Back preserves the caller', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => JobRoomScreen(
                      zoneId: 'zone',
                      service: _Room(),
                      tilesEnabled: false,
                    ),
                  ),
                ),
                child: Text(origin),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text(origin));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text(origin), findsOneWidget);
    });
  }
  testWidgets(
    'router Back and system Back restore prior routes and arguments',
    (tester) async {
      final delegate = AppRouterDelegate(
        (settings) => MaterialPageRoute<void>(
          settings: settings,
          builder: (_) => Scaffold(
            appBar: AppBar(leading: const ContextBackButton()),
            body: Text('${settings.name}:${settings.arguments ?? "none"}'),
          ),
        ),
      );
      await tester.pumpWidget(
        MaterialApp.router(
          routeInformationParser: const AppRouteInformationParser(),
          routerDelegate: delegate,
        ),
      );
      delegate.navigate('/scaler/work', arguments: 'saved-filter');
      await tester.pumpAndSettle();
      delegate.navigate('/job-room/zone');
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('/scaler/work:saved-filter'), findsOneWidget);
      delegate.navigate('/job-room/zone');
      await tester.pumpAndSettle();
      expect(await delegate.popRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('/scaler/work:saved-filter'), findsOneWidget);
    },
  );
  testWidgets(
    'deep-linked Job Room Back uses My Work when there is no caller',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: JobRoomScreen(
            zoneId: 'zone',
            service: _Room(),
            tilesEnabled: false,
          ),
          routes: {
            '/scaler/work': (_) => const Scaffold(body: Text('My Work')),
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('My Work'), findsOneWidget);
    },
  );
}
