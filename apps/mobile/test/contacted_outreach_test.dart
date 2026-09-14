import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_screen.dart';

void main() {
  testWidgets(
    'sent prospect shows conversation instead of another introduction',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BusinessEmailDraftButton(
              mailbox: {
                'connection': {'send': true},
                'operations': [
                  {
                    'id': 'one',
                    'prospectId': 'aspen',
                    'recipient': 'a@example.test',
                    'state': 'sent',
                    'providerAcceptedAt': 1789329538147,
                    'replyCount': 0,
                  },
                ],
              },
              prospect: {'id': 'aspen', 'email': 'a@example.test'},
            ),
          ),
        ),
      );
      expect(find.text('Contacted — Awaiting reply'), findsOneWidget);
      expect(find.text('View Conversation'), findsOneWidget);
      expect(find.text('Edit Draft / Approve & Send Email'), findsNothing);
    },
  );
}
