import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/social_plan_presentation.dart';
import 'package:flutter_app/widgets/customer_social_review_queue.dart';
import 'package:flutter_app/widgets/social_plan_overview.dart';
import 'package:flutter_app/widgets/social_runtime_status_card.dart';

void main() {
  testWidgets('status card retains progress beside exceptions and opens the exception action', (t) async {
    var opened = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: SocialRuntimeStatusCard(
      status: {'available': true, 'summary': {'title': 'Needs Attention', 'counters': {'scheduled': 10, 'published': 6, 'needsAttention': 2}}},
      onRefresh: () {}, onNeedsAttention: () => opened = true,
    ))));
    expect(find.text('10 scheduled · 6 published · 2 need attention'), findsOneWidget);
    await t.tap(find.text('View Needs Attention'));
    expect(opened, isTrue);
    expect(socialQualityLabel('keep'), 'No content changes recommended');
  });
  final runtime = <String, dynamic>{
    'available': true,
    'summary': {
      'counters': {
        'scheduled': 2,
        'publishing': 1,
        'published': 4,
        'needsAttention': 0,
      },
    },
    'posts': [
      {'itemId': 'a', 'provider': 'facebook', 'publicationStatus': 'scheduled'},
      {
        'itemId': 'b',
        'provider': 'instagram',
        'publicationStatus': 'scheduled',
      },
      {
        'itemId': 'c',
        'provider': 'facebook',
        'publicationStatus': 'publishing',
      },
      for (var i = 0; i < 4; i++)
        {
          'itemId': 'h$i',
          'provider': 'facebook',
          'publicationStatus': 'published',
        },
    ],
  };
  test(
    'queue and summary use the same saved execution feed despite stale plan states',
    () {
      final plans = <Map<String, dynamic>>[
        {
          'id': 'old',
          'items': [
            {
              'variants': [
                {'provider': 'facebook', 'status': 'scheduled'},
              ],
            },
          ],
        },
      ];
      final rows = socialReviewRows(plans, runtime),
          p = SocialPlanPresentation(plans, runtime);
      for (final state in ['scheduled', 'publishing', 'published']) {
        expect(
          rows.where((r) => r['publicationStatus'] == state).length,
          p.count(state),
        );
      }
      expect(
        socialQueueGroup({
          'automaticMode': true,
          'automaticState': 'preparing',
        }),
        'Preparing automatically',
      );
      expect(
        socialQueueGroup({
          'automaticMode': true,
          'automaticState': 'needs_attention',
        }),
        'Needs Attention',
      );
      expect(socialQueueGroup({'publicationStatus': 'published'}), 'Published');
      expect(
        socialEvidenceText('INITIAL_EXPERIMENT: old goal', 'Social strategy'),
        'Social strategy',
      );
    },
  );
  testWidgets(
    'summary shows execution counts, not plan-version counts; workspace label survives device locale',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                SocialPlanOverview(
                  presentation: SocialPlanPresentation([], runtime),
                  onReview: () {},
                ),
                Builder(
                  builder: (c) => Text(
                    socialCustomerTime(
                      c,
                      '2030-07-01T14:00:00Z',
                      label: 'Jul 1, 2030, 10:00 AM EDT · America/New_York',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Scheduled versions: 2'), findsOneWidget);
      expect(find.text('Published versions: 4'), findsOneWidget);
      expect(find.textContaining('America/New_York'), findsOneWidget);
      expect(find.textContaining('device time'), findsNothing);
    },
  );
}
