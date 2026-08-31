import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/admin_dashboard_screen.dart';
import 'package:flutter_app/services/admin_operations_service.dart';

Widget subject(
  AdminOperationsSnapshot snapshot, {
  GeneratedMediaCommercialMetrics? commercialMetrics,
  GeneratedMediaWifPreflight? providerAuthPreflight,
  VoidCallback? onRunProviderAuthPreflight,
  TextEditingController? founderQaJobController,
  VoidCallback? onConfigureFounderQaAllowlist,
  VoidCallback? onStagePrivateBetaControls,
  VoidCallback? onRestoreFounderOnlyControls,
}) => MaterialApp(
  home: Scaffold(
    body: AdminOperationsContent(
      snapshot: snapshot,
      commercialMetrics: commercialMetrics,
      onOpenIssue: (_) {},
      onOpenAdminAccounts: () {},
      onOpenBeta: () {},
      onOpenSubscriptions: () {},
      onOpenAttribution: () {},
      onOpenConfiguration: () {},
      providerAuthPreflight: providerAuthPreflight,
      providerAuthPreflightRunning: false,
      onRunProviderAuthPreflight: onRunProviderAuthPreflight ?? () {},
      accountingReconciliation: null,
      accountingReconciliationRunning: false,
      onReconcileAccounting: () {},
      founderQaJobController: founderQaJobController,
      onConfigureFounderQaAllowlist: onConfigureFounderQaAllowlist,
      onStagePrivateBetaControls: onStagePrivateBetaControls,
      onRestoreFounderOnlyControls: onRestoreFounderOnlyControls,
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
  testWidgets('commercial metrics separate customer and provider usage', (
    tester,
  ) async {
    await tester.pumpWidget(
      subject(
        emptySnapshot,
        commercialMetrics: const GeneratedMediaCommercialMetrics(
          providerEnabled: false,
          rolloutMode: 'beta_cohort',
          betaCohortStage: 'initial_5',
          betaCohortEnabled: true,
          betaCohortCount: 5,
          betaCohortLimit: 5,
          planAllowances: {
            'starter': 5,
            'growth': 15,
            'scale': 30,
            'managed_growth': 60,
          },
          requestsByPlan: {'starter': 4},
          customerUnitsByPlan: {'starter': 3},
          providerUnitsByPlan: {'starter': 4},
          dailyCalls: 4,
          dailyCallLimit: 50,
          dailyCostMicros: 167000,
          dailyCostLimitMicros: 10000000,
          monthlyCostMicros: 167000,
          monthlyCostLimitMicros: 100000000,
          outstandingReservations: 0,
          systemRejections: 1,
          limitExhaustions: 2,
          averageLatencyMs: 50000,
          providerFailures: 0,
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.text('Generated visual commercial controls'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Rollout: Beta Cohort'), findsOneWidget);
    expect(find.textContaining('Beta cohort: Enabled · 5 / 5'), findsOneWidget);
    expect(find.textContaining('Daily calls: 4 / 50'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Customer units by plan: Starter 3'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Provider-billed units by plan: Starter 4'),
      findsOneWidget,
    );
  });

  testWidgets('Founder QA control resolves job evidence without raw UID UI', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    var submitted = false;
    await tester.pumpWidget(
      subject(
        emptySnapshot,
        founderQaJobController: controller,
        onConfigureFounderQaAllowlist: () => submitted = true,
      ),
    );
    await tester.scrollUntilVisible(
      find.text('Founder QA generation access'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Founder QA generation access'), findsOneWidget);
    expect(
      find.textContaining('Business UID is resolved server-side'),
      findsOneWidget,
    );
    expect(find.textContaining('authorizedBusinessUids'), findsNothing);
    await tester.enterText(
      find.byType(TextField),
      'visual_job_351077bdc865932da9a46f03bccf42e21f8ea373',
    );
    await tester.tap(find.text('Restrict to this QA Business'));
    expect(submitted, isTrue);
  });

  testWidgets('private Beta controls remain provider-disabled and reversible', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    var staged = 0;
    var restored = 0;
    await tester.pumpWidget(
      subject(
        emptySnapshot,
        founderQaJobController: controller,
        onConfigureFounderQaAllowlist: () {},
        onStagePrivateBetaControls: () => staged++,
        onRestoreFounderOnlyControls: () => restored++,
      ),
    );
    await tester.scrollUntilVisible(
      find.text('Stage first-five Beta controls'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.textContaining('keep provider generation disabled'),
      findsOneWidget,
    );
    await tester.ensureVisible(find.text('Stage first-five Beta controls'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stage first-five Beta controls'));
    await tester.ensureVisible(
      find.text('Apply Founder-only safety controls'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apply Founder-only safety controls'));
    expect(staged, 1);
    expect(restored, 1);
    expect(find.textContaining('Business UID'), findsOneWidget);
    expect(find.textContaining('clears the commercial cohort'), findsOneWidget);
    expect(find.textContaining('300 calls/month'), findsOneWidget);
  });

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
    await tester.scrollUntilVisible(
      find.text('System health'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
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
            onOpenAttribution: () {},
            onOpenConfiguration: () {},
            providerAuthPreflight: null,
            providerAuthPreflightRunning: false,
            onRunProviderAuthPreflight: () {},
            accountingReconciliation: null,
            accountingReconciliationRunning: false,
            onReconcileAccounting: () {},
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
            onOpenAttribution: () {},
            onOpenConfiguration: () {},
            providerAuthPreflight: null,
            providerAuthPreflightRunning: false,
            onRunProviderAuthPreflight: () {},
            accountingReconciliation: null,
            accountingReconciliationRunning: false,
            onReconcileAccounting: () {},
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

  testWidgets('generated-media auth preflight reports only safe status', (
    tester,
  ) async {
    var invoked = 0;
    await tester.pumpWidget(
      subject(
        emptySnapshot,
        providerAuthPreflight: const GeneratedMediaWifPreflight(
          metadataToken: 'PASS',
          claimsMatch: 'PASS',
          openAIExchange: 'PASS',
        ),
        onRunProviderAuthPreflight: () => invoked++,
      ),
    );
    await tester.scrollUntilVisible(
      find.text('Run zero-model auth preflight'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('Metadata PASS • Claims PASS • OpenAI exchange PASS'),
      findsOneWidget,
    );
    expect(find.textContaining('access token'), findsNothing);
    await tester.ensureVisible(find.text('Run zero-model auth preflight'));
    await tester.drag(find.byType(ListView), const Offset(0, -100));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Run zero-model auth preflight'));
    expect(invoked, 1);
  });
}
