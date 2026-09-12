import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_schedule_screen.dart';
import 'package:flutter_app/services/business_operations_service.dart';

class FakeOperations extends BusinessOperationsService {
  final calls = <String>[];
  final customers = <Map<String, dynamic>>[];
  bool fieldUser = false;
  bool teamEditor = false;
  Map<String, dynamic>? savedItem;
  final existingItems = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> call(
    String businessId,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    calls.add(operation);
    if (operation == 'saveItem') {
      savedItem = Map<String, dynamic>.from(input['item']);
    }
    if (operation == 'saveCustomer') {
      customers.add({
        'id': 'customer',
        ...Map<String, dynamic>.from(input['customer']),
        'version': 1,
      });
      return {'saved': true};
    }
    if (operation == 'timeline') {
      return {
        'events': [
          {
            'summary': 'Lead created',
            'atMs': DateTime.now().millisecondsSinceEpoch,
          },
        ],
        'items': [],
      };
    }
    if (operation != 'load') return {'saved': true};
    return {
      'activePaid': true,
      'isOwner': !fieldUser && !teamEditor,
      'seatLimit': 3,
      'permissions': fieldUser
          ? ['jobsAssigned', 'jobsStatus']
          : teamEditor
          ? ['scheduleView', 'scheduleEdit']
          : [],
      'actorUid': teamEditor ? 'member' : 'owner',
      'customers': customers,
      'items': existingItems,
      'people': [
        {
          'id': 'user:owner',
          'uid': 'owner',
          'kind': 'user',
          'name': 'Workspace owner',
        },
        {
          'id': 'user:member',
          'uid': 'member',
          'kind': 'user',
          'name': 'Current Team Member',
        },
        {'id': 'crew:crew', 'kind': 'crew', 'name': 'Controlled Crew'},
      ],
      'inbound': [],
      'notifications': {},
      'counts': {
        'needsResponse': fieldUser ? null : customers.length,
        'needsFollowUp': fieldUser ? null : 0,
        'openTasks': 0,
      },
    };
  }
}

void main() {
  testWidgets(
    'new member-created work visibly defaults to that member and permits intentional Unassigned',
    (tester) async {
      final service = FakeOperations()..teamEditor = true;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessScheduleScreen(businessId: 'owner', service: service),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to schedule'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Title *'),
        'My appointment',
      );
      await tester.scrollUntilVisible(
        find.text('Assigned to'),
        250,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Current Team Member'), findsOneWidget);
      await tester.tap(find.text('Assigned to'));
      await tester.pumpAndSettle();
      expect(find.text('Workspace owner'), findsNothing);
      expect(find.text('Controlled Crew'), findsNothing);
      await tester.ensureVisible(
        find.widgetWithText(CheckboxListTile, 'Unassigned'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(CheckboxListTile, 'Unassigned'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      expect(service.savedItem!['assignedPeople'], isEmpty);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'owner sees own default, crew choice and explicit assignment on schedule cards',
    (tester) async {
      final service = FakeOperations();
      service.existingItems.add({
        'id': 'existing',
        'title': 'Existing assigned estimate',
        'type': 'estimate',
        'status': 'scheduled',
        'startMs': DateTime.now().millisecondsSinceEpoch,
        'durationMinutes': 60,
        'assignedPeople': ['user:member'],
        'assignedLabels': ['Current Team Member'],
        'version': 1,
      });
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessScheduleScreen(businessId: 'owner', service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Assigned to Current Team Member'), findsOneWidget);
      await tester.tap(find.text('Add to schedule'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Title *'),
        'Owner appointment',
      );
      await tester.scrollUntilVisible(
        find.text('Assigned to'),
        250,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Workspace owner'), findsOneWidget);
      await tester.tap(find.text('Assigned to'));
      await tester.pumpAndSettle();
      expect(find.text('Crew resource · no login seat'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      expect(service.savedItem!['assignedPeople'], ['user:owner']);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test('search uses provided contact details, not inferred customer facts', () {
    expect(
      matchesCustomerSearch({
        'name': 'John',
        'company': 'Example',
        'email': 'one@example.test',
        'phone': '410-555-1000',
        'location': 'Linthicum',
      }, 'LINTHICUM'),
      true,
    );
    expect(matchesCustomerSearch({'name': 'John'}, 'won'), false);
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'narrow schedule, calendar controls and customer form at text scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final service = FakeOperations();
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: BusinessScheduleScreen(businessId: 'owner', service: service),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Customers & Schedule'), findsOneWidget);
        expect(find.text('Today'), findsOneWidget);
        expect(find.text('Week'), findsOneWidget);
        expect(find.text('Month'), findsOneWidget);
        await tester.tap(find.text('Customers'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Add customer'));
        await tester.pumpAndSettle();
        expect(find.text('Add customer or lead'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.enterText(
          find.widgetWithText(TextField, 'Name *'),
          'Controlled customer',
        );
        await tester.tap(find.widgetWithText(FilledButton, 'Save'));
        await tester.pumpAndSettle();
        expect(service.calls.where((x) => x == 'saveCustomer').length, 1);
        await tester.scrollUntilVisible(
          find.text('Controlled customer'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Controlled customer'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
  testWidgets(
    'Field User cannot navigate to private customer or crew records',
    (tester) async {
      final service = FakeOperations()..fieldUser = true;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessScheduleScreen(businessId: 'owner', service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Customers'), findsNothing);
      expect(find.text('People'), findsNothing);
      expect(find.text('Add to schedule'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
