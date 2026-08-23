import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../widgets/authenticated_sign_out_button.dart';

import '../business/internal_beta_entitlements_screen.dart';
import 'admin_dashboard_card.dart';
import 'admin_platform_health_screen.dart';
import 'admin_role_gate.dart';
import 'admin_role_management_screen.dart';
import 'admin_subscription_overview_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final _issuesKey = GlobalKey();

  void _showActionableIssues() {
    final target = _issuesKey.currentContext;
    if (target == null) return;
    Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      alignment: 0.05,
    );
  }

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        title: const Text('ScaledCircle Admin Dashboard'),
        actions: [
          const AuthenticatedSignOutButton(),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Platform operations',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Administrator authority, product entitlements, subscription revenue, worker funds, '
            'planned budgets, actual spend, and provider costs remain separate.',
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              final cardWidth = constraints.maxWidth < 656
                  ? constraints.maxWidth
                  : 310.0;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: _openIssuesQuery.snapshots(),
                    builder: (context, issues) {
                      final docs = issues.data?.docs;
                      final highPriority = docs?.where((doc) {
                        final severity = doc
                            .data()['severity']
                            ?.toString()
                            .toLowerCase();
                        return severity == 'high' || severity == 'critical';
                      }).length;
                      final status = issues.hasError
                          ? 'Issue status unavailable'
                          : docs == null
                          ? 'Loading issue status'
                          : highPriority! > 0
                          ? '${docs.length} open • $highPriority high priority'
                          : '${docs.length} open issues';
                      return AdminDashboardCard(
                        title: 'Platform Issues / Action Required',
                        subtitle: status,
                        badge: docs == null ? null : 'OPEN ISSUES',
                        width: cardWidth,
                        onTap: _showActionableIssues,
                      );
                    },
                  ),
                  AdminDashboardCard(
                    title: 'Administrator Accounts',
                    subtitle:
                        'Audited promotion and safe replacement-admin demotion.',
                    width: cardWidth,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AdminRoleManagementScreen(),
                      ),
                    ),
                  ),
                  AdminDashboardCard(
                    title: 'Beta Entitlements',
                    subtitle:
                        'Finite Internal Beta or Internal QA Managed Growth access.',
                    width: cardWidth,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const InternalBetaEntitlementsScreen(),
                      ),
                    ),
                  ),
                  AdminDashboardCard(
                    title: 'Subscription overview',
                    subtitle:
                        'Paid and internal comped authority remain distinctly represented.',
                    width: cardWidth,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AdminSubscriptionOverviewScreen(),
                      ),
                    ),
                  ),
                  AdminDashboardCard(
                    title: 'Provider / platform health',
                    subtitle:
                        'Safe configuration status without exposing secret values.',
                    width: cardWidth,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AdminPlatformHealthScreen(),
                      ),
                    ),
                  ),
                  AdminDashboardCard(
                    title: 'Sales Program',
                    subtitle:
                        'Referral commissions and payouts are being validated before release.',
                    badge: 'PRIVATE DEVELOPMENT',
                    disabled: true,
                    width: cardWidth,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 24),
          Text(
            'Actionable issues',
            key: _issuesKey,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _openIssuesQuery.snapshots(),
            builder: (context, issues) {
              if (issues.hasError) {
                return const Text('Issue data is not available.');
              }
              final docs = issues.data?.docs ?? const [];
              if (docs.isEmpty) {
                return const ListTile(title: Text('No open issues'));
              }
              return Column(
                children: docs
                    .map(
                      (doc) => ListTile(
                        title: Text(
                          doc.data()['summary']?.toString() ??
                              'Action required',
                        ),
                        subtitle: Text(
                          '${doc.data()['severity'] ?? 'normal'} • '
                          '${doc.data()['type'] ?? 'platform'}',
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
        ],
      ),
    ),
  );

  Query<Map<String, dynamic>> get _openIssuesQuery => FirebaseFirestore.instance
      .collection('adminIssues')
      .where('status', isEqualTo: 'open')
      .limit(25);
}
