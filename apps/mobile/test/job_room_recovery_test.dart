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

class _HistoricalRoomService extends JobRoomService {
  @override
  Future<Map<String, dynamic>> load(String zoneId) async => {
    'viewerRole': 'scaler',
    'privateLogisticsAvailable': false,
    'room': {'id': zoneId, 'scalerId': 'scaler', 'status': 'submitted'},
    'campaign': {'materialsRequired': true},
    'handoff': {'required': false, 'status': 'unavailable'},
  };
}

void main() {
  testWidgets(
    'Historical logistics are withheld without claiming no materials or offering actions',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: JobRoomScreen(
            zoneId: 'historical-zone',
            service: _HistoricalRoomService(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('no longer available for this assignment'),
        findsOneWidget,
      );
      expect(find.textContaining('No Materials Required'), findsNothing);
      expect(find.text('No physical materials required'), findsNothing);
      expect(find.text('Confirm Ready'), findsNothing);
      expect(find.text('Confirm Materials Received'), findsNothing);
      expect(find.text('Send Message'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
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
