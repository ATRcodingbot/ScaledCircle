import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/appointment_offer_dialog.dart';
import 'package:flutter_app/services/business_operations_service.dart';

class FakeSchedule extends BusinessOperationsService {
  final calls = <String>[];
  final keys = <String?>[];
  int reads = 0, writes = 0;
  bool fail = false, failSaveOnce = false;
  final readWaits = <String, Completer<void>>{};
  Completer<Map<String, dynamic>>? delayed;
  @override
  Future<Map<String, dynamic>> call(
    String businessId,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    calls.add(operation);
    if (operation == 'saveItem') {
      writes++;
      keys.add(requestId);
      if (failSaveOnce) {
        failSaveOnce = false;
        throw TimeoutException('uncertain fixture');
      }
      return delayed?.future ?? Future.value({'saved': true, 'itemId': 'same'});
    }
    reads++;
    if (fail) throw Exception('fixture read failed');
    final day = input['date'] ?? '2026-09-22';
    if (readWaits[day] != null) await readWaits[day]!.future;
    return {
      'today': '2026-09-22',
      'selectedDate': day,
      'assignedPeople': input['assignedPeople'] ?? [],
      'availability': {
        'version': 2,
        'settings': {
          'timeZone': 'America/New_York',
          'durationMinutes': 15,
          'bufferMinutes': 5,
          'assignedPeople': [],
          'locationRequired': false,
        },
      },
      'datesWithAppointments': ['2026-09-22'],
      'people': [
        {'id': 'user:owner', 'name': 'Fixture owner'},
      ],
      'slots': [
        {
          'startMs': 1790085600000,
          'endMs': 1790086500000,
          'label': '10:00 AM GMT-4 – 10:15 AM GMT-4',
          'summary':
              'Tuesday, September 22, 10:00 AM – 10:15 AM (America/New_York)',
        },
      ],
      'agenda': [
        {
          'id': 'busy',
          'title': 'Existing estimate',
          'label': '9:00 AM – 9:30 AM',
          'status': 'Confirmed / Booked',
          'assignedLabels': ['Fixture owner'],
          'bufferMinutes': 5,
        },
        {
          'id': 'pending',
          'title': 'Pending offer',
          'label': '11:00 AM – 11:15 AM',
          'status': 'Tentative / Awaiting customer confirmation',
          'assignedLabels': [],
          'bufferMinutes': 5,
        },
      ],
    };
  }
}

Future<void> open(
  WidgetTester t,
  FakeSchedule s, {
  double scale = 1,
  Map? existing,
}) async {
  await t.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (c) => Scaffold(
          body: TextButton(
            onPressed: () => showDialog<Map<String, dynamic>>(
              context: c,
              builder: (_) => MediaQuery(
                data: MediaQuery.of(
                  c,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: AppointmentOfferDialog(
                  service: s,
                  businessId: 'owner',
                  operationId: 'op',
                  inboundDigest: 'digest',
                  customerId: 'customer',
                  existing: existing,
                ),
              ),
            ),
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
    'calendar, readable agenda, optional staff; cancel writes nothing',
    (t) async {
      final s = FakeSchedule();
      await open(t, s);
      expect(find.text('Existing estimate'), findsOneWidget);
      expect(find.text('Confirmed / Booked'), findsOneWidget);
      expect(
        find.text('Tentative / Awaiting customer confirmation'),
        findsOneWidget,
      );
      expect(find.text('Assign later'), findsOneWidget);
      expect(find.textContaining('Exact date/time'), findsNothing);
      await t.ensureVisible(find.text('23'));
      await t.tap(find.text('23'));
      await t.pumpAndSettle();
      expect(s.reads, 2);
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(s.writes, 0);
    },
  );
  testWidgets(
    'read failure never means empty/free and Retry preserves location',
    (t) async {
      final s = FakeSchedule();
      await open(t, s);
      await t.enterText(find.byType(TextField), 'Office lobby');
      s.fail = true;
      await t.ensureVisible(find.text('23'));
      await t.tap(find.text('23'));
      await t.pumpAndSettle();
      expect(
        find.textContaining('Availability could not be checked'),
        findsOneWidget,
      );
      expect(find.text('No active appointments on this date.'), findsNothing);
      expect(
        t
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save tentative offer'),
            )
            .onPressed,
        isNull,
      );
      s.fail = false;
      await t.ensureVisible(find.text('Retry availability'));
      await t.tap(find.text('Retry availability'));
      await t.pumpAndSettle();
      expect(find.text('Office lobby'), findsOneWidget);
    },
  );
  testWidgets(
    'narrow large text has no overflow and existing offer is prefilled',
    (t) async {
      t.view.resetPhysicalSize();
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final s = FakeSchedule();
      await open(
        t,
        s,
        scale: 1.7,
        existing: {
          'id': 'same',
          'version': 2,
          'startMs': 1790085600000,
          'location': 'Saved location',
        },
      );
      expect(find.text('Saved location'), findsOneWidget);
      expect(find.textContaining('Proposed offer:'), findsOneWidget);
      expect(t.takeException(), isNull);
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(s.writes, 0);
    },
  );
  testWidgets('repeated Save while in flight creates one request', (t) async {
    final s = FakeSchedule()..delayed = Completer<Map<String, dynamic>>();
    await open(
      t,
      s,
      existing: {
        'id': 'same',
        'version': 2,
        'startMs': 1790085600000,
        'location': 'Saved location',
      },
    );
    await t.tap(find.text('Save tentative offer'));
    await t.pump();
    expect(s.writes, 1);
    expect(s.keys.single, isNotEmpty);
    expect(
      t
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Saving...'))
          .onPressed,
      isNull,
    );
    s.delayed!.complete({'saved': true, 'itemId': 'same'});
    await t.pumpAndSettle();
    expect(find.byType(AppointmentOfferDialog), findsNothing);
  });
  testWidgets('late prior-day response cannot replace latest selected day', (
    t,
  ) async {
    final s = FakeSchedule();
    await open(t, s);
    s.readWaits['2026-09-23'] = Completer<void>();
    await t.ensureVisible(find.text('23'));
    await t.tap(find.text('23'));
    await t.pump();
    await t.ensureVisible(find.text('24'));
    await t.tap(find.text('24'));
    await t.pumpAndSettle();
    expect(s.reads, 3);
    s.readWaits['2026-09-23']!.complete();
    await t.pumpAndSettle();
    final chosen = t.widget<Semantics>(
      find.byWidgetPredicate(
        (w) => w is Semantics && w.properties.selected == true,
      ),
    );
    expect(chosen.properties.label, contains('24'));
  });
  testWidgets('uncertain save retries exact payload with the same identity', (
    t,
  ) async {
    final s = FakeSchedule()..failSaveOnce = true;
    await open(
      t,
      s,
      existing: {
        'id': 'same',
        'version': 2,
        'startMs': 1790085600000,
        'location': 'Saved location',
      },
    );
    await t.tap(find.text('Save tentative offer'));
    await t.pumpAndSettle();
    expect(find.text('Check saved offer'), findsOneWidget);
    await t.tap(find.text('Check saved offer'));
    await t.pumpAndSettle();
    expect(s.writes, 2);
    expect(s.keys[0], s.keys[1]);
  });
  testWidgets('owner chooses a readable time without a timestamp field', (
    t,
  ) async {
    final s = FakeSchedule();
    await open(t, s);
    final menu = find.byType(DropdownButtonFormField<int>);
    await t.ensureVisible(menu);
    await t.tap(menu);
    await t.pumpAndSettle();
    await t.tap(find.text('10:00 AM GMT-4 – 10:15 AM GMT-4').last);
    await t.pumpAndSettle();
    expect(find.textContaining('Proposed offer:'), findsOneWidget);
    expect(
      t
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Save tentative offer'),
          )
          .onPressed,
      isNotNull,
    );
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    expect(s.writes, 0);
  });
}
