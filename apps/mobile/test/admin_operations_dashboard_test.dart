import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/admin_dashboard_screen.dart';
import 'package:flutter_app/services/admin_operations_service.dart';

Widget subject(AdminOperationsSnapshot snapshot) => MaterialApp(
  home: Scaffold(
    body: AdminOperationsContent(
      snapshot: snapshot,
      onOpenIssue: (_) {},
      onOpenAdminAccounts: () {},
      onOpenBeta: () {},
      onOpenSubscriptions: () {},
      onOpenConfiguration: () {},
      onOpenCampaign: (_) {},
    ),
  ),
);

const emptySnapshot = AdminOperationsSnapshot(
  metrics: {
    'businesses': 4,
    'approvedScalers': 3,
    'pendingScalers': 1,
    'openCampaigns': 2,
    'awaitingReview': 1,
    'openSupportCases': 0,
  },
  exceptions: [],
  activity: [],
  health: [AdminOpsHealth(metric: 'payments', state: 'healthy', issueCount: 0)],
  partial: false,
);

void main() {
  testWidgets('Admin home presents the simple four-section command center', (
    tester,
  ) async {
    await tester.pumpWidget(subject(emptySnapshot));
    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('No issues need your attention.'), findsOneWidget);
    expect(find.text('Operational overview'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('Businesses'), findsOneWidget);
    expect(find.text('Recent activity'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pumpAndSettle();
    expect(find.text('System health'), findsOneWidget);
    expect(find.text('Payments: HEALTHY'), findsOneWidget);
  });

  testWidgets('action-required exception is concise and navigable', (
    tester,
  ) async {
    AdminOpsException? opened;
    const item = AdminOpsException(
      id: 'payment-one',
      category: 'payment_refund',
      severity: 'action_required',
      summary: 'A campaign refund requires operational review.',
      status: 'refund_review_required',
      recommendedAction: 'Review the timeline.',
      campaignId: 'campaign-one',
      detailKind: 'campaign_timeline',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AdminOperationsContent(
            snapshot: const AdminOperationsSnapshot(
              metrics: {},
              exceptions: [item],
              activity: [],
              health: [],
              partial: false,
            ),
            onOpenIssue: (value) => opened = value,
            onOpenAdminAccounts: () {},
            onOpenBeta: () {},
            onOpenSubscriptions: () {},
            onOpenConfiguration: () {},
            onOpenCampaign: (_) {},
          ),
        ),
      ),
    );
    expect(
      find.text('A campaign refund requires operational review.'),
      findsOneWidget,
    );
    expect(find.textContaining('Payment Refund'), findsOneWidget);
    await tester.tap(
      find.text('A campaign refund requires operational review.'),
    );
    expect(opened?.campaignId, 'campaign-one');
    expect(find.textContaining('client_secret'), findsNothing);
  });

  testWidgets('campaign activity opens the authoritative timeline', (
    tester,
  ) async {
    String? openedCampaign;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AdminOperationsContent(
            snapshot: const AdminOperationsSnapshot(
              metrics: {},
              exceptions: [],
              activity: [
                AdminOpsActivity(
                  type: 'payment_received',
                  title: 'Payment received',
                  campaignId: 'campaign-one',
                  occurredAt: null,
                ),
              ],
              health: [],
              partial: false,
            ),
            onOpenIssue: (_) {},
            onOpenAdminAccounts: () {},
            onOpenBeta: () {},
            onOpenSubscriptions: () {},
            onOpenConfiguration: () {},
            onOpenCampaign: (campaignId) => openedCampaign = campaignId,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Payment received'));
    expect(openedCampaign, 'campaign-one');
  });

  testWidgets('partial data has a truthful degraded state on narrow layout', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      subject(
        const AdminOperationsSnapshot(
          metrics: {},
          exceptions: [],
          activity: [],
          health: [
            AdminOpsHealth(metric: 'email', state: 'degraded', issueCount: 0),
          ],
          partial: true,
        ),
      ),
    );
    expect(
      find.text("Some operational status couldn't be loaded."),
      findsOneWidget,
    );
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pumpAndSettle();
    expect(find.text('Email: DEGRADED'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
