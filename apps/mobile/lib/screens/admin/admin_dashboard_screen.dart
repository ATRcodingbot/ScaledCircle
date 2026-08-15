import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../business/internal_beta_entitlements_screen.dart';
import 'admin_role_management_screen.dart';

class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('Administrator authentication required.')),
      );
    }
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.data?.data()?['role'] != 'admin') {
          return const Scaffold(
            body: Center(child: Text('Administrator authority is required.')),
          );
        }
        return Scaffold(
          appBar: AppBar(
            title: const Text('ScaledCircle Admin Dashboard'),
            actions: [
              IconButton(
                tooltip: 'Sign out',
                icon: const Icon(Icons.logout),
                onPressed: () async {
                  await FirebaseAuth.instance.signOut();
                  if (context.mounted) {
                    Navigator.pushNamedAndRemoveUntil(
                      context,
                      '/admin/login',
                      (_) => false,
                    );
                  }
                },
              ),
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
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  const _AdminCard(
                    'Platform Issues / Action Required',
                    'High and critical issues can queue one deduplicated minimal support alert.',
                  ),
                  _AdminCard(
                    'Administrator Accounts',
                    'Audited promotion and safe replacement-admin demotion.',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AdminRoleManagementScreen(),
                      ),
                    ),
                  ),
                  _AdminCard(
                    'Beta Entitlements',
                    'Finite Internal Beta or Internal QA Managed Growth access.',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const InternalBetaEntitlementsScreen(),
                      ),
                    ),
                  ),
                  const _AdminCard(
                    'Subscription overview',
                    'Paid and internal comped authority remain distinctly represented.',
                  ),
                  const _AdminCard(
                    'Provider / platform health',
                    'Operational status without exposing secret values.',
                  ),
                  const _AdminCard(
                    'Sales Program — Private Development',
                    'Referral commissions and payouts are disabled pending financial validation.',
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Text(
                'Actionable issues',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('adminIssues')
                    .where('status', isEqualTo: 'open')
                    .limit(25)
                    .snapshots(),
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
        );
      },
    );
  }
}

class _AdminCard extends StatelessWidget {
  const _AdminCard(this.title, this.subtitle, {this.onTap});

  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 310,
    child: Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text(subtitle),
            ],
          ),
        ),
      ),
    ),
  );
}
