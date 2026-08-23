import 'package:flutter/material.dart';
import '../../services/admin_operations_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import '../business/internal_beta_entitlements_screen.dart';
import 'admin_campaign_timeline_screen.dart';
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
  void _refresh() => setState(() => _overview = _service.loadOverview());

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        title: const Text('ScaledCircle Command Center'),
        actions: [
          IconButton(
            onPressed: _refresh,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
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
          return AdminOperationsContent(
            snapshot: snapshot.data!,
            onOpenIssue: _openIssue,
            onOpenAdminAccounts: () => _push(const AdminRoleManagementScreen()),
            onOpenBeta: () => _push(const InternalBetaEntitlementsScreen()),
            onOpenSubscriptions: () =>
                _push(const AdminSubscriptionOverviewScreen()),
            onOpenConfiguration: () => _push(const AdminPlatformHealthScreen()),
            onOpenCampaign: (campaignId) => _push(
              AdminCampaignTimelineScreen(
                campaignId: campaignId,
                service: _service,
              ),
            ),
          );
        },
      ),
    ),
  );

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

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
    required this.onOpenIssue,
    required this.onOpenAdminAccounts,
    required this.onOpenBeta,
    required this.onOpenSubscriptions,
    required this.onOpenConfiguration,
    required this.onOpenCampaign,
    super.key,
  });
  final AdminOperationsSnapshot snapshot;
  final ValueChanged<AdminOpsException> onOpenIssue;
  final VoidCallback onOpenAdminAccounts,
      onOpenBeta,
      onOpenSubscriptions,
      onOpenConfiguration;
  final ValueChanged<String> onOpenCampaign;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
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
