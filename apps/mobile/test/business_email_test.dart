import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

void main() {
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
