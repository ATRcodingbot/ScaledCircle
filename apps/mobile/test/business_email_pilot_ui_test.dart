import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/business_email_service.dart';
import 'package:flutter_app/screens/business/business_email_assistance_screen.dart';
import 'package:flutter_app/screens/business/business_email_conversation_screen.dart';

class FixtureEmail extends BusinessEmailService {
  final calls = <String>[];
  Map<String, dynamic>? saved;
  Map<String, dynamic>? submitted;
  @override
  Future<Map<String, dynamic>> call(
    String operation, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(operation);
    if (operation == 'loadAssistance') {
      return {
        'businessId': 'fixture',
        'workspaceName': 'Fixture Business',
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
        findsNWidgets(2),
      );
      expect(find.text('A. Business and monitored mailbox'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('I saved this automatic Gmail filter'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.textContaining('Already-linked replies are checked independently'),
        findsOneWidget,
      );
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
