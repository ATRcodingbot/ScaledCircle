import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_schedule_screen.dart';
import 'package:flutter_app/services/business_operations_service.dart';

class FakeOperations extends BusinessOperationsService {
  final calls = <String>[];
  final customers = <Map<String, dynamic>>[];
  bool fieldUser = false;
  @override
  Future<Map<String, dynamic>> call(
    String businessId,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    calls.add(operation);
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
      'isOwner': !fieldUser,
      'seatLimit': 3,
      'permissions': fieldUser ? ['jobsAssigned', 'jobsStatus'] : [],
      'actorUid': 'owner',
      'customers': customers,
      'items': [],
      'people': [
        {
          'id': 'user:owner',
          'uid': 'owner',
          'kind': 'user',
          'name': 'Workspace owner',
        },
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
