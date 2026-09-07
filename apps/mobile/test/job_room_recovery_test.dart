import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/jobs/job_room_screen.dart';
import 'package:flutter_app/services/job_room_service.dart';

class _RoomService extends JobRoomService {
  final pending = Completer<Map<String, dynamic>>();
  bool hang = false;
  int calls = 0;
  @override
  Future<Map<String, dynamic>> load(String zoneId) async {
    calls++;
    if (hang) return pending.future;
    throw StateError('private diagnostic');
  }
}

void main() {
  testWidgets(
    'Job Room read failure exits loading and offers an explicit retry',
    (tester) async {
      final service = _RoomService();
      await tester.pumpWidget(
        MaterialApp(
          home: JobRoomScreen(zoneId: 'test-zone', service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Unable to load this Job Room'),
        findsOneWidget,
      );
      expect(find.textContaining('private diagnostic'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(service.calls, 2);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Job Room timeout cannot be overwritten by late read', (
    tester,
  ) async {
    final service = _RoomService()..hang = true;
    await tester.pumpWidget(
      MaterialApp(
        home: JobRoomScreen(zoneId: 'test-zone', service: service),
      ),
    );
    await tester.pump(const Duration(seconds: 31));
    await tester.pump();
    service.pending.complete({});
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
