import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_plan_card.dart';

void main() {
  testWidgets(
    'approved strategy is read-only and hides stale next action and posts',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CustomerSocialPlanCard(
              initiallyExpanded: true,
              strategyOnly: true,
              plan: {
                'status': 'approved',
                'planVersion': 1,
                'approvedVersion': 1,
                'goal': 'Approved strategy',
                'strategy': {
                  'objective': 'Qualified estimate inquiries',
                  'nextAction': 'Review Social strategy',
                },
                'items': [
                  {'pillar': 'Draft content'},
                ],
              },
              onApprove: () =>
                  fail('Viewing approved strategy must not approve anything'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Qualified estimate inquiries'), findsOneWidget);
      expect(find.text('Review Social strategy'), findsNothing);
      expect(find.text('Draft content'), findsNothing);
      expect(find.text('Approve 30-Day Plan'), findsNothing);
      expect(find.text('Plan version needs review'), findsNothing);
    },
  );
  testWidgets(
    'customer can inspect draft purpose, timing, copy and creative without approving',
    (tester) async {
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView(
              children: [
                CustomerSocialPlanCard(
                  plan: {
                    'goal': 'Local estimate inquiries',
                    'strategy': {
                      'cadence': 'Two proposed posts each week',
                      'nextAction': 'Review before approval',
                    },
                    'items': [
                      {
                        'pillar': 'Estimate checklist',
                        'goal': 'Help customers prepare',
                        'scheduledFor': '2026-09-11T16:00:00Z',
                        'variants': [
                          {
                            'provider': 'facebook',
                            'copy': 'Write down your project goals.',
                            'callToAction': 'Request an estimate',
                            'mediaRequirement': 'Owner-approved checklist',
                            'responseAssetRequirement':
                                'Measure after approved publication',
                          },
                        ],
                      },
                    ],
                  },
                ),
              ],
            ),
          ),
        ),
      );
      await tester.tap(find.text('Local estimate inquiries'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Estimate checklist'));
      await tester.pumpAndSettle();
      expect(find.text('Write down your project goals.'), findsOneWidget);
      expect(
        find.text('Creative brief: Owner-approved checklist'),
        findsOneWidget,
      );
      expect(find.text('Plan version needs review'), findsOneWidget);
      expect(find.text('Approve'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
