import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/social_plan_presentation.dart';
import 'package:flutter_app/widgets/social_plan_overview.dart';

Map<String, dynamic> plan({bool approved = true, int version = 1}) => {
  'id': 'plan',
  'planVersion': version,
  'approvedVersion': approved ? version : null,
  'status': approved ? 'approved' : 'ready_for_review',
  'items': List.generate(
    8,
    (i) => {
      'variants': [
        {'provider': 'facebook', 'status': 'ready_for_review'},
        {'provider': 'instagram', 'status': 'ready_for_review'},
      ],
    },
  ),
};
Map<String, dynamic> runtime(int scheduled) => {
  'available': true,
  'summary': {
    'counters': {'scheduled': scheduled, 'published': 0},
  },
};

void main() {
  test('strategy approval does not approve drafts or imply a schedule', () {
    final p = plan(), view = SocialPlanPresentation([plan()], runtime(0));
    expect(view.allApproved, true);
    expect(
      view.draftPosts,
      16,
    ); // Eight ideas contain sixteen independent platform drafts.
    expect(view.primaryAction, 'Review Draft Posts');
    expect(view.contentAction, 'Review Draft Posts');
    expect(view.count('scheduled'), 0);
    expect(p['items'], plan()['items']);
    expect(
      SocialPlanPresentation([plan(approved: false)], runtime(0)).primaryAction,
      'Review 30-Day Plan',
    );
    expect(
      SocialPlanPresentation([plan()], runtime(1)).contentAction,
      'View Schedule',
    );
    expect(SocialPlanPresentation([plan()], {}).count('scheduled'), isNull);
  });
  test(
    'receipt survives failed or stale readback, exact new read reconciles',
    () {
      final state = SocialPlanApprovalReadback();
      state.acknowledge('plan', 1);
      state.reconcile([]);
      state.reconcile([plan(approved: false)]);
      expect(state.pending, true);
      state.reconcile([plan()]);
      expect(state.pending, false);
      state.acknowledge('plan', 1);
      state.reconcile([plan(approved: false, version: 2)]);
      expect(state.pending, false); // A newer strategy needs its own review.
      expect(socialPlanApproved({...plan(), 'approvedVersion': 0}), false);
    },
  );
  testWidgets(
    'narrow large text shows approved plan, 16 drafts, zero scheduled',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var reviews = 0;
      Future<void> show(bool pending) => tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: ListView(
                children: [
                  SocialPlanOverview(
                    presentation: SocialPlanPresentation([plan()], runtime(0)),
                    refreshingApproval: pending,
                    onReview: () => reviews++,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await show(false);
      expect(find.text('Draft Posts'), findsOneWidget);
      expect(find.text('Draft Posts: 16 ready for review'), findsOneWidget);
      expect(find.text('Scheduled: 0'), findsOneWidget);
      expect(find.text('Review 30-Day Plan'), findsNothing);
      expect(find.text('View Schedule'), findsNothing);
      await tester.ensureVisible(find.text('Review Draft Posts'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review Draft Posts'));
      expect(reviews, 1);
      expect(tester.takeException(), isNull);
      await show(true);
      expect(find.text('Plan approved — refreshing status…'), findsOneWidget);
      expect(find.text('Review 30-Day Plan'), findsNothing);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
