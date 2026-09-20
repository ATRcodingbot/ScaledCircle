import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/business_email_service.dart';
import 'package:flutter_app/screens/business/business_email_assistance_screen.dart';
import 'package:flutter_app/screens/business/business_email_conversation_screen.dart';

class FixtureEmail extends BusinessEmailService {
  final calls = <String>[];
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
        'policy': null,
      };
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
        findsOneWidget,
      );
      expect(find.text('Model-data review is pending.'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('I saved this automatic Gmail filter'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.textContaining(
          'one-time filter routes future matching mail automatically',
        ),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Authorize email assistance'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      final authorize = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Authorize email assistance'),
      );
      expect(authorize.onPressed, isNull);
      expect(service.calls, ['loadAssistance']);
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
