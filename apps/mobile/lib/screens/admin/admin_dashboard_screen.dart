import 'package:flutter/material.dart';
import '../../services/admin_operations_service.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import '../../widgets/scaled_circle_brand.dart';
import '../business/internal_beta_entitlements_screen.dart';
import 'admin_campaign_timeline_screen.dart';
import 'admin_attribution_screen.dart';
import 'admin_dashboard_card.dart';
import 'admin_platform_health_screen.dart';
import 'admin_role_gate.dart';
import 'admin_role_management_screen.dart';
import 'admin_subscription_overview_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key, this.service});
  final AdminOperationsService? service;
  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  late final AdminOperationsService _service =
      widget.service ?? AdminOperationsService();
  late Future<AdminOperationsSnapshot> _overview = _service.loadOverview();
  late Future<GeneratedMediaCommercialMetrics> _generatedMediaMetrics = _service
      .loadGeneratedMediaCommercialMetrics();
  GeneratedMediaWifPreflight? _providerAuthPreflight;
  bool _providerAuthPreflightRunning = false;
  Map<String, dynamic>? _accountingReconciliation;
  bool _accountingReconciliationRunning = false;
  final TextEditingController _founderQaJobController = TextEditingController();
  bool _founderQaAllowlistUpdating = false;
  bool _commercialControlsUpdating = false;
  void _refresh() => setState(() {
    _overview = _service.loadOverview();
    _generatedMediaMetrics = _service.loadGeneratedMediaCommercialMetrics();
  });

  @override
  void dispose() {
    _founderQaJobController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        title: MediaQuery.sizeOf(context).width < 300
            ? null
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Flexible(child: ScaledCircleBrand(compact: true)),
                  if (MediaQuery.sizeOf(context).width >= 720) ...[
                    const SizedBox(width: 12),
                    const Text('ScaledCircle Command Center'),
                  ],
                ],
              ),
        actions: [
          if (MediaQuery.sizeOf(context).width >= 520)
            IconButton(
              onPressed: _refresh,
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh),
            ),
          if (MediaQuery.sizeOf(context).width >= 520)
            const AuthenticatedSignOutButton(),
        ],
      ),
      body: FutureBuilder<AdminOperationsSnapshot>(
        future: _overview,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return _LoadFailure(onRetry: _refresh);
          }
          return FutureBuilder<GeneratedMediaCommercialMetrics>(
            future: _generatedMediaMetrics,
            builder: (context, generatedSnapshot) => AdminOperationsContent(
              snapshot: snapshot.data!,
              commercialMetrics: generatedSnapshot.data,
              onOpenIssue: _openIssue,
              onOpenAdminAccounts: () =>
                  _push(const AdminRoleManagementScreen()),
              onOpenBeta: () => _push(const InternalBetaEntitlementsScreen()),
              onOpenSubscriptions: () =>
                  _push(const AdminSubscriptionOverviewScreen()),
              onOpenAttribution: () => _push(const AdminAttributionScreen()),
              onOpenConfiguration: () =>
                  _push(const AdminPlatformHealthScreen()),
              providerAuthPreflight: _providerAuthPreflight,
              providerAuthPreflightRunning: _providerAuthPreflightRunning,
              onRunProviderAuthPreflight: _runProviderAuthPreflight,
              accountingReconciliation: _accountingReconciliation,
              accountingReconciliationRunning: _accountingReconciliationRunning,
              onReconcileAccounting: _reconcileAccounting,
              founderQaJobController: _founderQaJobController,
              founderQaAllowlistUpdating: _founderQaAllowlistUpdating,
              onConfigureFounderQaAllowlist: _configureFounderQaAllowlist,
              commercialControlsUpdating: _commercialControlsUpdating,
              onStagePrivateBetaControls: _stagePrivateBetaControls,
              onRestoreFounderOnlyControls: _restoreFounderOnlyControls,
              onOpenCampaign: (campaignId) => _push(
                AdminCampaignTimelineScreen(
                  campaignId: campaignId,
                  service: _service,
                ),
              ),
            ),
          );
        },
      ),
    ),
  );

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  Future<void> _runProviderAuthPreflight() async {
    if (_providerAuthPreflightRunning) return;
    setState(() => _providerAuthPreflightRunning = true);
    try {
      final result = await _service.runGeneratedMediaWifPreflight();
      if (!mounted) return;
      setState(() => _providerAuthPreflight = result);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Provider authentication preflight failed safely. Review operational logs.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _providerAuthPreflightRunning = false);
    }
  }

  Future<void> _reconcileAccounting() async {
    if (_accountingReconciliationRunning) return;
    setState(() => _accountingReconciliationRunning = true);
    try {
      final result = await _service.reconcileGeneratedMediaAccounting();
      if (!mounted) return;
      setState(() => _accountingReconciliation = result);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Generated visual accounting reconciled.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Accounting reconciliation failed safely.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _accountingReconciliationRunning = false);
    }
  }

  Future<void> _configureFounderQaAllowlist() async {
    if (_founderQaAllowlistUpdating) return;
    final jobId = _founderQaJobController.text.trim();
    if (!RegExp(r'^visual_job_[a-f0-9]{40}$').hasMatch(jobId)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter valid generated-media job evidence.'),
        ),
      );
      return;
    }
    setState(() => _founderQaAllowlistUpdating = true);
    try {
      final result = await _service.restrictGeneratedMediaToFounderQaBusiness(
        jobId,
      );
      if (!mounted) return;
      final count = (result['authorizedBusinessCount'] as num?)?.toInt() ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            count == 1 && result['providerGenerationEnabled'] != true
                ? 'Founder QA access is restricted to one Business. Generation remains disabled.'
                : 'Generated-media access could not be verified safely.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Founder QA access update failed safely.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _founderQaAllowlistUpdating = false);
    }
  }

  Future<void> _stagePrivateBetaControls() async {
    if (_commercialControlsUpdating) return;
    final jobId = _founderQaJobController.text.trim();
    if (!RegExp(r'^visual_job_[a-f0-9]{40}$').hasMatch(jobId)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter valid generated-media job evidence.'),
        ),
      );
      return;
    }
    setState(() => _commercialControlsUpdating = true);
    try {
      final result = await _service.stageGeneratedMediaPrivateBeta(jobId);
      if (!mounted) return;
      final safe =
          result['providerGenerationEnabled'] != true &&
          result['rolloutMode'] == 'beta_cohort' &&
          result['betaCohortCount'] == 1;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            safe
                ? 'First-five Private Beta controls staged. Generation remains disabled.'
                : 'Private Beta controls could not be verified safely.',
          ),
        ),
      );
      _refresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Private Beta controls failed safely.')),
      );
    } finally {
      if (mounted) setState(() => _commercialControlsUpdating = false);
    }
  }

  Future<void> _restoreFounderOnlyControls() async {
    if (_commercialControlsUpdating) return;
    setState(() => _commercialControlsUpdating = true);
    try {
      final result = await _service.restoreGeneratedMediaFounderOnly();
      if (!mounted) return;
      final safe =
          result['providerGenerationEnabled'] != true &&
          result['rolloutMode'] == 'founder_only';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            safe
                ? 'Founder-only mode restored. Generation remains disabled.'
                : 'Founder-only controls could not be verified safely.',
          ),
        ),
      );
      _refresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Founder-only controls failed safely.')),
      );
    } finally {
      if (mounted) setState(() => _commercialControlsUpdating = false);
    }
  }

  void _openIssue(AdminOpsException issue) {
    if (issue.detailKind == 'campaign_timeline' &&
        issue.campaignId?.isNotEmpty == true) {
      _push(
        AdminCampaignTimelineScreen(
          campaignId: issue.campaignId!,
          service: _service,
        ),
      );
    } else if (issue.detailKind == 'support_case' &&
        issue.entityId?.isNotEmpty == true) {
      _showSupportStatus(issue);
    } else {
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(issue.summary),
          content: Text(
            '${issue.recommendedAction}\n\nCurrent status: ${issue.status}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }
  }

  void _showSupportStatus(AdminOpsException issue) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  issue.summary,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(issue.recommendedAction),
                const SizedBox(height: 16),
                if (issue.status == 'open')
                  FilledButton.tonal(
                    onPressed: () => _changeSupportStatus(
                      sheetContext,
                      issue.entityId!,
                      'in_progress',
                    ),
                    child: const Text('Begin review'),
                  ),
                if (issue.status != 'resolved')
                  FilledButton(
                    onPressed: () => _changeSupportStatus(
                      sheetContext,
                      issue.entityId!,
                      'resolved',
                    ),
                    child: const Text('Mark resolved'),
                  ),
              ],
            ),
          ),
        ),
      );

  Future<void> _changeSupportStatus(
    BuildContext sheetContext,
    String caseId,
    String status,
  ) async {
    await _service.updateSupportStatus(caseId, status);
    if (!sheetContext.mounted) return;
    Navigator.pop(sheetContext);
    _refresh();
  }
}

class AdminOperationsContent extends StatelessWidget {
  const AdminOperationsContent({
    required this.snapshot,
    this.commercialMetrics,
    required this.onOpenIssue,
    required this.onOpenAdminAccounts,
    required this.onOpenBeta,
    required this.onOpenSubscriptions,
    required this.onOpenAttribution,
    required this.onOpenConfiguration,
    required this.providerAuthPreflight,
    required this.providerAuthPreflightRunning,
    required this.onRunProviderAuthPreflight,
    required this.accountingReconciliation,
    required this.accountingReconciliationRunning,
    required this.onReconcileAccounting,
    required this.onOpenCampaign,
    this.founderQaJobController,
    this.founderQaAllowlistUpdating = false,
    this.onConfigureFounderQaAllowlist,
    this.commercialControlsUpdating = false,
    this.onStagePrivateBetaControls,
    this.onRestoreFounderOnlyControls,
    super.key,
  });
  final AdminOperationsSnapshot snapshot;
  final GeneratedMediaCommercialMetrics? commercialMetrics;
  final ValueChanged<AdminOpsException> onOpenIssue;
  final VoidCallback onOpenAdminAccounts,
      onOpenBeta,
      onOpenSubscriptions,
      onOpenAttribution,
      onOpenConfiguration;
  final GeneratedMediaWifPreflight? providerAuthPreflight;
  final bool providerAuthPreflightRunning;
  final VoidCallback onRunProviderAuthPreflight;
  final Map<String, dynamic>? accountingReconciliation;
  final bool accountingReconciliationRunning;
  final VoidCallback onReconcileAccounting;
  final TextEditingController? founderQaJobController;
  final bool founderQaAllowlistUpdating;
  final VoidCallback? onConfigureFounderQaAllowlist;
  final bool commercialControlsUpdating;
  final VoidCallback? onStagePrivateBetaControls;
  final VoidCallback? onRestoreFounderOnlyControls;
  final ValueChanged<String> onOpenCampaign;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      if (MediaQuery.sizeOf(context).width < 520)
        const Align(
          alignment: Alignment.centerRight,
          child: AuthenticatedSignOutButton(),
        ),
      Text('Needs attention', style: Theme.of(context).textTheme.headlineSmall),
      const Text('Operational exceptions that may need a human decision.'),
      const SizedBox(height: 12),
      if (snapshot.partial)
        const Card(
          child: ListTile(
            leading: Icon(Icons.cloud_off_outlined),
            title: Text("Some operational status couldn't be loaded."),
            subtitle: Text(
              'Available results are shown below. Try refreshing.',
            ),
          ),
        ),
      if (snapshot.exceptions.isEmpty)
        const Card(
          child: ListTile(
            leading: Icon(Icons.check_circle_outline),
            title: Text('No issues need your attention.'),
          ),
        )
      else
        ...snapshot.exceptions.map(
          (item) => _ExceptionCard(item: item, onTap: () => onOpenIssue(item)),
        ),
      const SizedBox(height: 24),
      Text(
        'Operational overview',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          _MetricCard(
            label: 'Businesses',
            value: snapshot.metrics['businesses'] ?? 0,
          ),
          _MetricCard(
            label: 'Approved Scalers',
            value: snapshot.metrics['approvedScalers'] ?? 0,
          ),
          _MetricCard(
            label: 'Pending Scalers',
            value: snapshot.metrics['pendingScalers'] ?? 0,
          ),
          _MetricCard(
            label: 'Open campaigns',
            value: snapshot.metrics['openCampaigns'] ?? 0,
          ),
          _MetricCard(
            label: 'Awaiting review',
            value: snapshot.metrics['awaitingReview'] ?? 0,
          ),
          _MetricCard(
            label: 'Open support',
            value: snapshot.metrics['openSupportCases'] ?? 0,
          ),
        ],
      ),
      const SizedBox(height: 24),
      Text('Recent activity', style: Theme.of(context).textTheme.headlineSmall),
      if (snapshot.activity.isEmpty)
        const Card(
          child: ListTile(title: Text('No recent operational activity.')),
        )
      else
        ...snapshot.activity
            .take(8)
            .map(
              (item) => ListTile(
                onTap: item.campaignId?.isNotEmpty == true
                    ? () => onOpenCampaign(item.campaignId!)
                    : null,
                leading: const Icon(Icons.history),
                title: Text(item.title),
                subtitle: Text(_formatTime(item.occurredAt)),
                trailing: item.campaignId?.isNotEmpty == true
                    ? const Icon(Icons.chevron_right)
                    : null,
              ),
            ),
      const SizedBox(height: 24),
      Text('System health', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 10),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: snapshot.health
            .map((item) => _HealthChip(item: item))
            .toList(),
      ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Generated visual commercial controls',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (commercialMetrics == null)
                const Text('Commercial metrics are temporarily unavailable.')
              else ...[
                Text(
                  'Provider: ${commercialMetrics!.providerEnabled ? 'Enabled' : 'Disabled'}',
                ),
                Text('Rollout: ${_category(commercialMetrics!.rolloutMode)}'),
                Text(
                  'Beta cohort: ${commercialMetrics!.betaCohortEnabled ? 'Enabled' : 'Disabled'} · ${commercialMetrics!.betaCohortCount} / ${commercialMetrics!.betaCohortLimit} Businesses · ${_category(commercialMetrics!.betaCohortStage)}',
                ),
                Text(
                  'Daily calls: ${commercialMetrics!.dailyCalls} / ${commercialMetrics!.dailyCallLimit}',
                ),
                Text(
                  'Daily spend: ${_money(commercialMetrics!.dailyCostMicros)} / ${_money(commercialMetrics!.dailyCostLimitMicros)}',
                ),
                Text(
                  'Monthly spend: ${_money(commercialMetrics!.monthlyCostMicros)} / ${_money(commercialMetrics!.monthlyCostLimitMicros)}',
                ),
                Text(
                  'Outstanding reservations: ${commercialMetrics!.outstandingReservations}',
                ),
                Text(
                  'System rejections: ${commercialMetrics!.systemRejections} · Limit exhaustion: ${commercialMetrics!.limitExhaustions}',
                ),
                Text(
                  'Average completion: ${commercialMetrics!.averageLatencyMs > 0 ? '${(commercialMetrics!.averageLatencyMs / 1000).toStringAsFixed(1)}s' : 'No completed sample'}',
                ),
                Text(
                  'Provider failures: ${commercialMetrics!.providerFailures}',
                ),
                const SizedBox(height: 8),
                Text(
                  'Plan allowances: ${_planMap(commercialMetrics!.planAllowances)}',
                ),
                Text(
                  'Requests by plan: ${_planMap(commercialMetrics!.requestsByPlan)}',
                ),
                Text(
                  'Customer units by plan: ${_planMap(commercialMetrics!.customerUnitsByPlan)}',
                ),
                Text(
                  'Provider-billed units by plan: ${_planMap(commercialMetrics!.providerUnitsByPlan)}',
                ),
              ],
              const Divider(height: 28),
              Text(
                'Generated visual provider authentication',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 6),
              Text(_providerAuthSummary(providerAuthPreflight)),
              if (providerAuthPreflight?.failureCategory?.isNotEmpty == true)
                Text(
                  'Safe category: ${_category(providerAuthPreflight!.failureCategory!)}',
                ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonalIcon(
                  onPressed: providerAuthPreflightRunning
                      ? null
                      : onRunProviderAuthPreflight,
                  icon: providerAuthPreflightRunning
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.verified_user_outlined),
                  label: Text(
                    providerAuthPreflightRunning
                        ? 'Running preflight…'
                        : 'Run zero-model auth preflight',
                  ),
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'This checks runtime identity and token exchange only. It does not request generated content.',
                style: TextStyle(fontStyle: FontStyle.italic),
              ),
              const Divider(height: 28),
              Text(
                'Reservation accounting',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 6),
              Text(
                accountingReconciliation == null
                    ? 'Rebuild bounded usage totals from canonical reservation evidence.'
                    : 'Reconciled ${accountingReconciliation!['reservationCount'] ?? 0} reservations; released ${accountingReconciliation!['releasedJobCount'] ?? 0} definitive pre-provider failure.',
              ),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: accountingReconciliationRunning
                      ? null
                      : onReconcileAccounting,
                  icon: accountingReconciliationRunning
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.calculate_outlined),
                  label: Text(
                    accountingReconciliationRunning
                        ? 'Reconciling…'
                        : 'Reconcile accounting',
                  ),
                ),
              ),
              if (founderQaJobController != null &&
                  onConfigureFounderQaAllowlist != null) ...[
                const Divider(height: 28),
                Text(
                  'Founder QA generation access',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Select an existing internal QA generation job. Its Business becomes the only account authorized for future provider requests; generation stays disabled.',
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: founderQaJobController,
                  enabled: !founderQaAllowlistUpdating,
                  decoration: const InputDecoration(
                    labelText: 'Internal QA generation job ID',
                    helperText:
                        'The Business UID is resolved server-side and is not displayed.',
                  ),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.tonalIcon(
                    onPressed: founderQaAllowlistUpdating
                        ? null
                        : onConfigureFounderQaAllowlist,
                    icon: founderQaAllowlistUpdating
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.lock_person_outlined),
                    label: Text(
                      founderQaAllowlistUpdating
                          ? 'Restricting access…'
                          : 'Restrict to this QA Business',
                    ),
                  ),
                ),
                if (onStagePrivateBetaControls != null &&
                    onRestoreFounderOnlyControls != null) ...[
                  const SizedBox(height: 10),
                  const Text(
                    'Private Beta staging uses the same server-resolved Business evidence. Both actions keep provider generation disabled.',
                    style: TextStyle(fontStyle: FontStyle.italic),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      FilledButton.tonalIcon(
                        onPressed: commercialControlsUpdating
                            ? null
                            : onStagePrivateBetaControls,
                        icon: const Icon(Icons.groups_outlined),
                        label: const Text('Stage first-five Beta controls'),
                      ),
                      OutlinedButton.icon(
                        onPressed: commercialControlsUpdating
                            ? null
                            : onRestoreFounderOnlyControls,
                        icon: const Icon(Icons.shield_outlined),
                        label: const Text('Return to Founder-only'),
                      ),
                    ],
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
      const SizedBox(height: 28),
      Text('Administration', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 12),
      LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth < 656
              ? constraints.maxWidth
              : 310.0;
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              AdminDashboardCard(
                title: 'Sales',
                subtitle: 'Prospects, follow-ups, and conversion status.',
                width: width,
                onTap: () => AppNavigation.push(context, AppRoutes.sales),
              ),
              AdminDashboardCard(
                title: 'Growth attribution',
                subtitle: 'Tracked responses, leads, and verified conversions.',
                width: width,
                onTap: onOpenAttribution,
              ),
              AdminDashboardCard(
                title: 'Administrator accounts',
                subtitle: 'Role authority and audited replacement.',
                width: width,
                onTap: onOpenAdminAccounts,
              ),
              AdminDashboardCard(
                title: 'Beta entitlements',
                subtitle: 'Internal QA and beta access.',
                width: width,
                onTap: onOpenBeta,
              ),
              AdminDashboardCard(
                title: 'Subscriptions',
                subtitle: 'Paid and internal comped authority.',
                width: width,
                onTap: onOpenSubscriptions,
              ),
              AdminDashboardCard(
                title: 'Configuration',
                subtitle: 'Safe provider configuration status.',
                width: width,
                onTap: onOpenConfiguration,
              ),
            ],
          );
        },
      ),
    ],
  );
}

class _ExceptionCard extends StatelessWidget {
  const _ExceptionCard({required this.item, required this.onTap});
  final AdminOpsException item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final urgent = item.severity == 'action_required';
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: Icon(
          urgent ? Icons.error_outline : Icons.info_outline,
          color: urgent
              ? Theme.of(context).colorScheme.error
              : Theme.of(context).colorScheme.primary,
        ),
        title: Text(item.summary),
        subtitle: Text(
          '${_category(item.category)} • ${_formatTime(item.createdAt)}\n${item.recommendedAction}',
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});
  final String label;
  final int value;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 180,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value', style: Theme.of(context).textTheme.headlineMedium),
            Text(label),
          ],
        ),
      ),
    ),
  );
}

class _HealthChip extends StatelessWidget {
  const _HealthChip({required this.item});
  final AdminOpsHealth item;
  @override
  Widget build(BuildContext context) {
    final color = switch (item.state) {
      'healthy' => Colors.green,
      'attention' => Colors.orange,
      _ => Theme.of(context).colorScheme.error,
    };
    return Chip(
      avatar: Icon(Icons.circle, size: 12, color: color),
      label: Text('${_category(item.metric)}: ${item.state.toUpperCase()}'),
    );
  }
}

class _LoadFailure extends StatelessWidget {
  const _LoadFailure({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text("We couldn't load operational status. Try again."),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    ),
  );
}

String _category(String value) => value
    .replaceAll('_', ' ')
    .split(' ')
    .map(
      (part) =>
          part.isEmpty ? part : '${part[0].toUpperCase()}${part.substring(1)}',
    )
    .join(' ');
String _formatTime(DateTime? value) => value == null
    ? 'Time unavailable'
    : value.toLocal().toString().split('.').first;
String _money(int micros) => '\$${(micros / 1000000).toStringAsFixed(2)}';
String _planMap(Map<String, int> values) => values.isEmpty
    ? 'No bounded sample'
    : values.entries
          .map((entry) => '${_category(entry.key)} ${entry.value}')
          .join(' · ');

String _providerAuthSummary(GeneratedMediaWifPreflight? value) {
  if (value == null) return 'Not checked in this Admin session.';
  return 'Metadata ${value.metadataToken} • Claims ${value.claimsMatch} • '
      'OpenAI exchange ${value.openAIExchange}';
}
