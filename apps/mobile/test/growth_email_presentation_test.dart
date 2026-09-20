import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/growth_prospect_email_action.dart';
import 'package:flutter_app/widgets/growth_relationship_counts.dart';

void main() {
  testWidgets('public source is not consent and missing email is explicit', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: GrowthProspectEmailAction(
            prospect: {'qualified': true, 'email': 'public@example.test'},
            mailbox: {'available': true},
          ),
        ),
      ),
    );
    expect(
      find.textContaining('public listing is not consent'),
      findsOneWidget,
    );
    expect(find.text('Approve & Send'), findsNothing);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: GrowthProspectEmailAction(
            prospect: {'qualified': true},
            mailbox: {'available': true},
          ),
        ),
      ),
    );
    expect(find.textContaining('No verified email route'), findsOneWidget);
  });

  testWidgets(
    'reply action opens recorded conversation; counters exclude certification',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const mailbox = {
        'available': true,
        'operations': [
          {
            'id': 'real',
            'recipient': 'person@example.test',
            'replyCount': 1,
            'state': 'sent',
          },
          {
            'id': 'cert',
            'recipient': 'test@example.test',
            'certification': true,
            'replyCount': 1,
            'state': 'sent',
          },
        ],
      };
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: ListView(
                children: const [
                  GrowthProspectEmailAction(
                    prospect: {'email': 'person@example.test'},
                    mailbox: mailbox,
                  ),
                  GrowthRelationshipCounts(
                    prospects: [
                      {'qualified': true},
                    ],
                    mailbox: mailbox,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      expect(find.text('Open conversation'), findsOneWidget);
      expect(find.text('Messages accepted: 1'), findsOneWidget);
      expect(find.text('Email permission verified: 0'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
