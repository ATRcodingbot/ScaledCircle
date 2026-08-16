import 'package:flutter/material.dart';

import 'admin_role_gate.dart';

class AdminPlatformHealthScreen extends StatelessWidget {
  const AdminPlatformHealthScreen({super.key});

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(title: const Text('Provider / platform health')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: const [
          _HealthSection(
            title: 'Firebase',
            rows: [
              ('Hosting', 'Configured'),
              ('Functions', 'Configured'),
              ('Firestore', 'Configured'),
              ('Storage', 'Configured'),
            ],
          ),
          _HealthSection(
            title: 'Intelligence',
            rows: [
              ('Property Intelligence', 'Configured'),
              ('AI Intelligence', 'Configured'),
            ],
          ),
          _HealthSection(
            title: 'Integrations',
            rows: [
              ('Stripe health telemetry', 'Not connected'),
              ('Email health telemetry', 'Not connected'),
              ('Advertising integrations', 'Not connected'),
              ('Direct Mail provider', 'Not connected'),
              ('Meta social publishing', 'External approval required'),
              ('Google Business publishing', 'Not configured'),
              ('LinkedIn publishing', 'Not configured'),
            ],
          ),
          SizedBox(height: 12),
          Text(
            'These are safe application configuration states. Rendering this page makes no '
            'provider request and exposes no secret metadata or values.',
            style: TextStyle(fontStyle: FontStyle.italic),
          ),
        ],
      ),
    ),
  );
}

class _HealthSection extends StatelessWidget {
  const _HealthSection({required this.title, required this.rows});

  final String title;
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Card(
          child: Column(
            children: rows
                .map(
                  (row) => ListTile(
                    title: Text(row.$1),
                    trailing: Text(
                      row.$2,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ],
    ),
  );
}
