import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_plan_card.dart';

void main() {
  for (final ready in [false, true]) {
    testWidgets('ready=$ready enters preview without approving from the list', (tester) async {
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!,
          ),
          home: Scaffold(
            body: SingleChildScrollView(
              child: CustomerSocialPlanCard(
                initiallyExpanded: true,
                onSchedulePost: (_) => fail('The list must not approve a post'),
                onPreparePost: (_) => taps++,
                plan: {
                  'status': 'approved',
                  'planVersion': 1,
                  'approvedVersion': 1,
                  'items': [
                    {
                      'pillar': 'Post to review',
                      'scheduledFor': '2030-01-01T12:00:00Z',
                      'variants': [
                        {
                          'provider': 'facebook',
                          'copy': 'Exact post copy.',
                          'mediaRequirement': 'none',
                          'scheduling': {
                            'version': 1,
                            'ready': ready,
                            'reasons': ready
                                ? []
                                : [
                                    {
                                      'message':
                                          'Choose a future publish time.',
                                    },
                                  ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ),
            ),
          ),
        ),
      );
      await tester.ensureVisible(find.text('Preview Post'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview Post'));
      expect(taps, 1);
      expect(find.text('Approve & Schedule'), findsNothing);
      expect(find.text('Approve 30-Day Plan'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
