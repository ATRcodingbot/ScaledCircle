import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_plan_card.dart';

void main() {
  for (final ready in [false, true]) {
    testWidgets('post scheduling readiness $ready is explicit', (tester) async {
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
                onSchedulePost: (_) => taps++,
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
      await tester.ensureVisible(find.text('Post to review'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Post to review'));
      await tester.pumpAndSettle();
      if (ready) {
        await tester.ensureVisible(find.text('Approve & Schedule'));
        await tester.tap(find.text('Approve & Schedule'));
        expect(taps, 1);
      } else {
        expect(find.text('Choose a future publish time.'), findsOneWidget);
        expect(find.text('Approve & Schedule'), findsNothing);
        expect(taps, 0);
      }
      expect(find.text('Approve 30-Day Plan'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
