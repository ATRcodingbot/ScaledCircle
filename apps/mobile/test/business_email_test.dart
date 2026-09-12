import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

void main() {
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
