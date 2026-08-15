import 'package:flutter/material.dart';

import 'admin_role_gate.dart';

class AdminSubscriptionOverviewScreen extends StatelessWidget {
  const AdminSubscriptionOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(title: const Text('Subscription overview')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          Text(
            'Authoritative subscription summary',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Text(
            'Subscription authority remains backend-only. This release does not expose '
            'cross-Business billing records or calculate revenue in the client.',
          ),
          SizedBox(height: 20),
          _SummaryRow('Active paid subscriptions', 'Not available'),
          _SummaryRow('Active internal beta entitlements', 'Not available'),
          _SummaryRow('Active internal QA entitlements', 'Not available'),
          _SummaryRow('Plan distribution', 'Not available'),
          _SummaryRow('Comped vs paid', 'Not available'),
          _SummaryRow('Expired or revoked entitlements', 'Not available'),
          _SummaryRow('Revenue / MRR', 'Not connected'),
          SizedBox(height: 16),
          Text(
            'No Stripe or provider request is made to render this page.',
            style: TextStyle(fontStyle: FontStyle.italic),
          ),
        ],
      ),
    ),
  );
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      title: Text(label),
      trailing: Text(
        value,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    ),
  );
}
