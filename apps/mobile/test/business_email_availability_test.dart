import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_app/services/business_operations_service.dart';
import 'package:flutter_app/screens/business/business_email_availability.dart';

class ScheduleFixture extends BusinessOperationsService {
  final writes = <Map<String, dynamic>>[];
  Map<String, dynamic>? saved;
  Object? failure;
  Completer<void>? pending;
  @override
  Future<Map<String, dynamic>> call(
    String business,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    if (operation == 'load') {
      return {
        'people': [
          {'id': 'user:owner', 'name': 'Owner'},
        ],
        'schedulingAvailability': saved,
      };
    }
    writes.add({'requestId': requestId, 'input': input});
    await pending?.future;
    if (failure != null) throw failure!;
    saved = {
      'businessId': business,
      'version': (saved?['version'] ?? 0) + 1,
      'settings': input['settings'],
    };
    return {'saved': true, 'availability': saved};
  }
}

Future<void> open(WidgetTester t, ScheduleFixture service, Map data) async {
  await t.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              await editEmailAvailability(
                context,
                data,
                serviceOverride: service,
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    ),
  );
  await t.tap(find.text('Open'));
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
    'optional assignment saves exact hours and request id; reopening reads server state',
    (t) async {
      final service = ScheduleFixture(),
          data = <String, dynamic>{'businessId': 'owner'};
      await open(t, service, data);
      await t.tap(find.text('Save availability'));
      await t.pumpAndSettle();
      expect(
        service.writes.single['requestId'],
        matches(RegExp(r'^[a-f0-9]{48}$')),
      );
      expect(data['schedulingAvailability']['settings'], {
        'timeZone': 'America/New_York',
        'days': [1, 2, 3, 4, 5],
        'opensMinute': 540,
        'closesMinute': 1020,
        'durationMinutes': 15,
        'bufferMinutes': 5,
        'assignedPeople': [],
        'locationRequired': false,
      });
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('Require appointment location'));
      await t.tap(find.text('Require appointment location'));
      await t.tap(find.text('Save availability'));
      await t.pumpAndSettle();
      expect(service.saved!['settings']['locationRequired'], true);
      expect(service.writes.last['input']['expectedVersion'], 1);
    },
  );
  testWidgets(
    'unknown result retries same request; edits clear warning; saving blocks duplicates',
    (t) async {
      final service = ScheduleFixture()
        ..failure = FirebaseFunctionsException(
          code: 'unavailable',
          message: 'private',
        );
      await open(t, service, {'businessId': 'owner'});
      await t.tap(find.text('Save availability'));
      await t.pumpAndSettle();
      expect(find.textContaining('We could not confirm'), findsOneWidget);
      await t.tap(find.text('Save availability'));
      await t.pumpAndSettle();
      expect(service.writes[0]['requestId'], service.writes[1]['requestId']);
      await t.ensureVisible(find.text('Owner'));
      await t.tap(find.text('Owner'));
      await t.pump();
      expect(find.textContaining('We could not confirm'), findsNothing);
      service.failure = null;
      service.pending = Completer<void>();
      await t.tap(find.text('Save availability'));
      await t.pump();
      expect(find.text('Saving…'), findsOneWidget);
      await t.tap(find.text('Saving…'));
      await t.pump();
      expect(service.writes.length, 3);
      service.pending!.complete();
      await t.pumpAndSettle();
      expect(service.saved!['settings']['assignedPeople'], ['user:owner']);
    },
  );
  test('actionable conflicts preserve entries instead of claiming success', () {
    expect(
      availabilitySaveError(
        FirebaseFunctionsException(code: 'aborted', message: 'fixture'),
      ),
      contains('Cancel and reopen'),
    );
    expect(
      availabilitySaveError(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'fixture',
        ),
      ),
      contains('Schedule-edit'),
    );
  });
}
