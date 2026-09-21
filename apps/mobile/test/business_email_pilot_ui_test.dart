import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/business_email_service.dart';
import 'package:flutter_app/screens/business/business_email_assistance_screen.dart';
import 'package:flutter_app/screens/business/business_email_conversation_screen.dart';

class FixtureEmail extends BusinessEmailService {
  final calls = <String>[];
  Map<String, dynamic>? saved;
  Map<String, dynamic>? savedAvailability;
  Map<String, dynamic>? submitted;
  bool partialAvailable = false;
  @override
  Future<Map<String, dynamic>> call(
    String operation, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(operation);
    if (operation == 'loadAssistance') {
      return {
        'authorizationReview': {
          'partialAvailable': partialAvailable,
          'canRevoke': false,
        },
        'businessId': 'fixture',
        'workspaceName': 'Fixture Business',
        'schedulingAvailability': savedAvailability,
        'sender': 'owner@example.test',
        'canManage': true,
        'contacts': [],
        'blockers': ['model_data_review_required'],
        'blockerMessages': {
          'model_data_review_required': 'Model-data review is pending.',
        },
        'proposal': {
          'values': {
            'businessName': 'Fixture Business',
            'services': ['Decks'],
            'voice': 'Clear',
            'claims': ['Profile fact'],
            'destinations': ['https://example.test'],
          },
          'sources': {'voice': 'Business Profile'},
        },
        'policy': saved,
      };
    }
    if (operation == 'manageAssistance') {
      submitted = input;
      saved = {'status': 'prepared', 'version': 1, 'policy': input['policy']};
      return {'status': 'prepared'};
    }
    if (operation == 'loadConversation') {
      return {
        'businessId': 'fixture',
        'operation': {
          'id': 'op',
          'state': 'received',
          'crmCustomerId': 'contact',
          'recipient': 'customer@example.test',
        },
        'replies': [
          {
            'from': 'customer@example.test',
            'classification': 'substantive',
            'body': 'Can we arrange a consultation?',
          },
        ],
        'canManage': true,
        'inboundDigest': 'exact',
        'appointments': [],
      };
    }
    if (operation == 'suggestReply') {
      return {'state': 'model_processing_not_enabled'};
    }
    if (operation == 'reconcile') return {'state': 'received', 'replies': 1};
    throw StateError('Unexpected fixture operation: $operation');
  }
}

void main() {
  testWidgets(
    'partial authorization does not describe OFF inbox intake or introductions as operating',
    (tester) async {
      final service = FixtureEmail()
        ..saved = {
          'status': 'active',
          'version': 2,
          'modelAuthorizationPending': true,
          'policy': {
            'mailboxMode': 'inbox',
            'newInquiriesEnabled': false,
            'introductionsEnabled': false,
            'followupsEnabled': false,
            'modelAssistance': true,
            'expiresAt': DateTime.now()
                .add(const Duration(days: 1))
                .millisecondsSinceEpoch,
          },
        };
      await tester.pumpWidget(
        MaterialApp(home: BusinessEmailAssistanceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Partially active'), findsOneWidget);
      expect(
        find.text('New-inquiry monitoring: Off — not authorized'),
        findsOneWidget,
      );
      expect(
        find.text('Automatic introductions: Off — not authorized'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Unavailable — no ready device'),
        findsOneWidget,
      );
      expect(service.calls.contains('manageAssistance'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'AI blocked keeps review visible and partial operation requires explicit confirmation',
    (tester) async {
      final service = FixtureEmail()
        ..partialAvailable = true
        ..saved = {
          'status': 'prepared',
          'version': 3,
          'policy': {
            'modelAssistance': true,
            'modelDataConsent': true,
            'mailboxMode': 'inbox',
            'introductionsEnabled': false,
            'newInquiriesEnabled': false,
          },
        };
      await tester.pumpWidget(
        MaterialApp(home: BusinessEmailAssistanceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('E. Review and save'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('E. Review and save'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Review & authorize assistance'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Revoke assistance'), findsNothing);
      await tester.tap(find.text('Review & authorize assistance'));
      await tester.pumpAndSettle();
      expect(find.text('Authorize available features'), findsOneWidget);
      expect(service.submitted, isNull);
      expect(find.textContaining('no new-inquiry intake'), findsOneWidget);
      await tester.tap(find.text('Authorize available features'));
      await tester.pumpAndSettle();
      expect(service.submitted!['availableOnly'], true);
      expect(service.submitted!['expectedVersion'], 3);
      expect(service.submitted!.containsKey('policy'), false);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'owner setup shows label/filter coverage and independent controls, never authorizes a gated pilot',
    (tester) async {
      final service = FixtureEmail();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          builder: (c, w) => MediaQuery(
            data: MediaQuery.of(
              c,
            ).copyWith(textScaler: const TextScaler.linear(1.5)),
            child: w!,
          ),
          home: BusinessEmailAssistanceScreen(service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Fixture Business · owner@example.test'),
        findsOneWidget,
      );
      expect(find.text('A. Business and monitored mailbox'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Only follow existing conversations'),
        350,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Only follow existing conversations'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Monitor my whole inbox').last);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('No Gmail label or filter setup is required'),
        findsOneWidget,
      );
      expect(find.text('I saved this automatic Gmail filter'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('E. Review and save'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('E. Review and save'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Save preferences'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Authorize email assistance'), findsNothing);
      expect(service.calls, ['loadAssistance']);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'reviewed proposal saves without consent, UTC guessing or activation',
    (tester) async {
      final service = FixtureEmail();
      await tester.pumpWidget(
        MaterialApp(home: BusinessEmailAssistanceScreen(service: service)),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Clear'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('E. Review and save'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('E. Review and save'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Save preferences'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Save preferences'));
      await tester.pumpAndSettle();
      final p = service.submitted!['policy'] as Map;
      expect(service.submitted!['action'], 'prepare');
      expect(p['expiresAt'], isNull);
      expect(p['termMode'], 'shared_pilot');
      expect(p['opensMinute'], 540);
      expect(p['closesMinute'], 1020);
      expect(p['sendingDays'], [1, 2, 3, 4, 5]);
      expect(p['modelDataConsent'], false);
      expect(p['introductionsEnabled'], false);
      expect(p['inquiryRoutingConfirmed'], false);
      expect(service.calls.where((v) => v == 'manageAssistance').length, 1);
      expect(find.text('Authorize email assistance'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Schedule return retains unsaved owner values and leaves toggles unchanged',
    (tester) async {
      final service = FixtureEmail();
      var visits = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessEmailAssistanceScreen(
            service: service,
            availabilityEditor: (c, d) async {
              visits++;
              service.savedAvailability = {
                'version': 1,
                'settings': {
                  'timeZone': 'America/New_York',
                  'days': [1, 2, 3, 4, 5],
                  'opensMinute': 540,
                  'closesMinute': 1020,
                  'durationMinutes': 15,
                  'bufferMinutes': 5,
                  'assignedPeople': [],
                  'locationRequired': true,
                },
              };
              return true;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Fixture Business'),
        'Edited owner name',
      );
      await tester.scrollUntilVisible(
        find.text('D. Appointment availability'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('D. Appointment availability'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Set appointment availability'));
      await tester.tap(find.text('Set appointment availability'));
      await tester.pumpAndSettle();
      expect(visits, 1);
      expect(find.textContaining('Staff: Assign later'), findsOneWidget);
      expect(find.textContaining('Location required: Yes'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('A. Business and monitored mailbox'),
        -500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('A. Business and monitored mailbox'));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(TextField, 'Edited owner name'),
        findsOneWidget,
      );
      expect(service.submitted, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'saved Edit, Cancel and Save retain section D and unsaved owner edits',
    (tester) async {
      final service = FixtureEmail()
        ..savedAvailability = {
          'version': 1,
          'settings': {
            'timeZone': 'America/New_York',
            'days': [1, 2, 3, 4, 5],
            'opensMinute': 540,
            'closesMinute': 1020,
            'durationMinutes': 15,
            'bufferMinutes': 5,
            'assignedPeople': [],
            'locationRequired': true,
          },
        };
      var visits = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessEmailAssistanceScreen(
            service: service,
            availabilityEditor: (c, d) async {
              visits++;
              if (visits == 1) return false;
              service.savedAvailability = {
                ...service.savedAvailability!,
                'version': 2,
              };
              return true;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Fixture Business'),
        'Preserved edit',
      );
      await tester.scrollUntilVisible(
        find.text('D. Appointment availability'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('D. Appointment availability'));
      await tester.pumpAndSettle();
      for (var visit = 0; visit < 2; visit++) {
        await tester.ensureVisible(find.text('Edit appointment availability'));
        final before = tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position
            .pixels;
        await tester.tap(find.text('Edit appointment availability'));
        await tester.pumpAndSettle();
        expect(
          tester
              .state<ScrollableState>(find.byType(Scrollable).first)
              .position
              .pixels,
          closeTo(before, 1),
        );
        expect(
          find.text('Edit appointment availability').hitTestable(),
          findsOneWidget,
        );
        expect(service.savedAvailability!['version'], visit + 1);
        expect(service.submitted, isNull);
      }
      expect(visits, 2);
      await tester.scrollUntilVisible(
        find.text('A. Business and monitored mailbox'),
        -500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('A. Business and monitored mailbox'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Preserved edit'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'manual composition remains available when suggestions are gated; check has visible feedback',
    (tester) async {
      final service = FixtureEmail();
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessEmailConversationScreen(
            service: service,
            operationId: 'op',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Can we arrange a consultation?'), findsOneWidget);
      await tester.tap(find.text('Check conversation'));
      await tester.pumpAndSettle();
      expect(find.text('Reply received'), findsOneWidget);
      await tester.ensureVisible(find.text('Suggest reply'));
      await tester.tap(find.text('Suggest reply'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('You can still write a reply'),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNWidgets(2));
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Approve & Send'),
            )
            .onPressed,
        isNull,
      );
      expect(service.calls.contains('send'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );
}
