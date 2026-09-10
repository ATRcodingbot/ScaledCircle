import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_plan_card.dart';

void main() {
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
      expect(find.text('Creative: Owner-approved checklist'), findsOneWidget);
      expect(
        find.text('Draft · Needs your review · Nothing scheduled'),
        findsOneWidget,
      );
      expect(find.text('Approve'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
