import 'package:flutter/material.dart';

import '../../services/admin_operations_service.dart';

class AdminSocialOperationsScreen extends StatefulWidget {
  const AdminSocialOperationsScreen({super.key});

  @override
  State<AdminSocialOperationsScreen> createState() =>
      _AdminSocialOperationsScreenState();
}

class _AdminSocialOperationsScreenState
    extends State<AdminSocialOperationsScreen> {
  final _service = AdminOperationsService();
  late Future<Map<String, dynamic>> _summary = _service.loadSocialOperations();

  void _refresh() => setState(() => _summary = _service.loadSocialOperations());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Social Operations'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _summary,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!snapshot.hasData) {
          return const Center(
            child: Text('Social Operations diagnostics are unavailable.'),
          );
        }
        final value = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Provider-free operational health',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            _metric('Content plans', value['contentPlanCount']),
            _metric('Publish jobs', value['publishJobCount']),
            _metric(
              'Connection projections',
              value['connectionProjectionCount'],
            ),
            _metric('Performance snapshots', value['performanceSnapshotCount']),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Safety state',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    _state(
                      'External publishing',
                      value['externalPublishingEnabled'] == true,
                    ),
                    _state('Ad mutations', value['adMutationsEnabled'] == true),
                    _state(
                      'Bulk email delivery',
                      value['emailDeliveryEnabled'] == true,
                    ),
                    const Text(
                      'Tokens, passwords, private media, and content bodies are not shown.',
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    ),
  );

  Widget _metric(String label, Object? value) => Card(
    child: ListTile(
      title: Text(label),
      trailing: Text(
        '${value ?? 0}',
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
  );

  Widget _state(String label, bool enabled) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(enabled ? Icons.warning_amber_outlined : Icons.lock_outline),
    title: Text(label),
    trailing: Text(enabled ? 'Enabled' : 'Off'),
  );
}
