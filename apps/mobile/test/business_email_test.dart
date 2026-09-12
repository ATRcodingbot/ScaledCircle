import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_app/screens/business/business_email_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

class ControlledEmailService extends BusinessEmailService {
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(op);
    if (op == 'saveDraft') {
      return {
        ...input,
        'version': 1,
        'prospectId': 'founder_certification',
        'operationId': 'one',
        'from': 'owner@example.test',
        'recipient': 'recipient@example.test',
      };
    }
    return {'state': 'sent'};
  }
}

class ConversationEmailService extends BusinessEmailService {
  ConversationEmailService(this.replyCount);
  final int replyCount;
  bool checked = false;
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(op);
    expect(input['operationId'], 'certification-send');
    if (replyCount < 0) {
      throw FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Private provider diagnostic [400]',
      );
    }
    checked = true;
    return {'state': 'sent', 'replies': replyCount};
  }

  Map<String, dynamic> load() => {
    'available': true,
    'configured': true,
    'connection': {
      'status': 'connected',
      'email': 'owner@example.test',
      'read': true,
      'send': true,
    },
    'operations': [
      {
        'id': 'certification-send',
        'subject': 'Controlled certification',
        'from': 'owner@example.test',
        'recipient': 'recipient@example.test',
        'body': 'Please reply to this single controlled message.',
        'state': 'sent',
        'certification': true,
        'replyCount': checked ? replyCount : 0,
        'providerAcceptedAt': 1789241289489,
      },
    ],
    'replies': checked && replyCount > 0
        ? [
            {
              'operationId': 'certification-send',
              'body': 'The real reply is readable.',
              'from': 'recipient@example.test',
              'receivedAt': 1789241370000,
            },
          ]
        : [],
    'learning': {'sent': 0, 'replied': 0},
  };
}

void main() {
  for (final count in [0, 1, -1]) {
    testWidgets('conversation check has visible result $count and never sends', (
      tester,
    ) async {
      final service = ConversationEmailService(count);
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessEmailScreen(
            service: service,
            loadOverride: () async => service.load(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Check conversation'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Check conversation'));
      await tester.pumpAndSettle();
      expect(service.calls, ['reconcile']);
      expect(
        find.text(
          count == 1
              ? 'Reply received'
              : count == 0
              ? 'No reply found yet'
              : 'Conversation could not be checked. Try again. No message was resent.',
        ),
        findsWidgets,
      );
      expect(find.textContaining('Private provider diagnostic'), findsNothing);
      expect(find.text('Conversation outcome'), findsNothing);
      if (count == 1) {
        expect(find.text('Replies: 1'), findsOneWidget);
        await tester.ensureVisible(find.text('View Conversation'));
        await tester.tap(find.text('View Conversation'));
        await tester.pumpAndSettle();
        expect(
          find.text('Please reply to this single controlled message.'),
          findsOneWidget,
        );
        expect(find.text('The real reply is readable.'), findsOneWidget);
        expect(find.text('From: recipient@example.test'), findsOneWidget);
        expect(service.calls, ['reconcile']);
      }
      expect(tester.takeException(), isNull);
    });
  }
  for (final allowed in [false, true]) {
    testWidgets(
      'controlled review never sends; final send follows separate certification gate $allowed',
      (tester) async {
        final service = ControlledEmailService();
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: BusinessEmailDraftButton(
                service: service,
                certification: true,
                recipient: 'recipient@example.test',
                mailbox: {
                  'connection': {'email': 'owner@example.test', 'send': true},
                  'sendEnabled': false,
                  'certificationSendEnabled': allowed,
                },
              ),
            ),
          ),
        );
        await tester.tap(find.text('Review Controlled Test Message'));
        await tester.pumpAndSettle();
        expect(service.calls, isEmpty);
        expect(find.text('From: owner@example.test'), findsOneWidget);
        expect(find.text('To: recipient@example.test'), findsOneWidget);
        expect(find.text('Send Test Email'), findsNothing);
        await tester.tap(find.text('Review exact email'));
        await tester.pumpAndSettle();
        expect(service.calls, ['saveDraft']);
        final send = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Send Test Email'),
        );
        expect(send.onPressed != null, allowed);
        if (allowed) {
          await tester.tap(find.text('Send Test Email'));
          await tester.pumpAndSettle();
          expect(service.calls, ['saveDraft', 'send']);
        }
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
  test('provider acceptance and unknown outcomes never claim delivery', () {
    expect(businessEmailState('sent'), 'Sent — delivery not confirmed');
    expect(businessEmailState('sending'), contains('do not resend'));
    expect(
      businessEmailState('needs_reconciliation'),
      contains('needs checking'),
    );
  });
  testWidgets('uninvited deep link offers no connection or send workflow', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: BusinessEmailScreen(loadOverride: () async => null)),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Business Email is available by private invitation.'),
      findsOneWidget,
    );
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Send Email'), findsNothing);
  });
  for (final width in [320.0, 1280.0]) {
    testWidgets(
      'separate permissions and truthful history at $width with large text',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(2)),
              child: BusinessEmailScreen(
                loadOverride: () async => {
                  'available': true,
                  'configured': true,
                  'expectedMailbox': 'owner@example.test',
                  'connection': {
                    'status': 'connected',
                    'email': 'owner@example.test',
                    'read': true,
                    'send': false,
                    'pending': false,
                    'landingSender': 'account_notifications',
                  },
                  'operations': [
                    {
                      'id': 'test',
                      'subject': 'One message',
                      'recipient': 'test@example.test',
                      'state': 'sent',
                      'replyCount': 0,
                    },
                  ],
                  'learning': {
                    'sent': 1,
                    'replied': 0,
                    'patterns': [],
                    'followups': [],
                    'learningBasis': 'Not enough local outcomes yet.',
                  },
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Read leads'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('Send approved outreach'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Send approved outreach'), findsOneWidget);
        final sendSwitch = tester.widget<SwitchListTile>(
          find.ancestor(
            of: find.text('Send approved outreach'),
            matching: find.byType(SwitchListTile),
          ),
        );
        expect(sendSwitch.value, false);
        await tester.scrollUntilVisible(
          find.text('Outreach history'),
          400,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Sent — delivery not confirmed'), findsOneWidget);
        expect(find.text('Send Email'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
