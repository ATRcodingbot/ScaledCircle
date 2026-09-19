import 'package:flutter/material.dart';
import '../../services/admin_operations_service.dart';
import 'admin_role_gate.dart';

class AdminPlatformHealthScreen extends StatelessWidget {
  const AdminPlatformHealthScreen({super.key});
  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (_) => AdminPlatformHealthBody(
      load: () => AdminOperationsService().loadOverview(),
    ),
  );
}

// Load only inside the role gate. The callable separately requires Admin
// authority; this view never expands workspace Team permissions.
class AdminPlatformHealthBody extends StatefulWidget {
  const AdminPlatformHealthBody({super.key, required this.load});
  final Future<AdminOperationsSnapshot> Function() load;
  @override
  State<AdminPlatformHealthBody> createState() => _HealthState();
}

class _HealthState extends State<AdminPlatformHealthBody> {
  late Future<AdminOperationsSnapshot> _readback = widget.load();
  void _refresh() => setState(() {
    _readback = widget.load();
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Operational health'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh status',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<AdminOperationsSnapshot>(
      future: _readback,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Operational status could not be loaded. No provider health has been confirmed.',
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _refresh,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          );
        }
        final data = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Saved operational evidence',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text(
              'These results summarize recorded issues. They do not test a provider connection or certify that payments or publishing are available.',
            ),
            if (data.partial)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Some sources could not be loaded. Missing evidence is not a healthy result.',
                ),
              ),
            if (data.health.isEmpty)
              const Text('No operational health results are available.'),
            for (final item in data.health)
              Card(
                child: ListTile(
                  title: Text(_label(item.metric)),
                  subtitle: Text(
                    '${_state(item.state)}\nRecorded issues: ${item.issueCount}',
                  ),
                ),
              ),
            const SizedBox(height: 16),
            const Text(
              'Provider and release checks',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text(
              'Stripe Connect activation, Google OAuth verification, mobile release readiness and actual scheduler invocations are not measured here. Use the maintained provider, release and specialist evidence before changing a hold.',
            ),
            const SizedBox(height: 16),
            const Text(
              'Delegated operations',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text(
              'Business assistants use the workspace’s existing Team permissions. A Business Team role does not grant platform Admin, payout or security authority. Do not grant Administrator access merely to delegate routine work.',
            ),
          ],
        );
      },
    ),
  );
}

String _state(String value) => switch (value) {
  'healthy' => 'No recorded issues',
  'attention' => 'Needs attention',
  'degraded' => 'Evidence unavailable or incomplete',
  _ => 'Status unknown',
};
String _label(String value) => switch (value) {
  'payments' => 'Campaign payments',
  'email' => 'Account email delivery',
  'campaigns' => 'Campaigns',
  'completions' => 'Completion and earnings records',
  'support' => 'Customer support',
  'providers' => 'Recorded provider issues',
  _ => 'Other operational records',
};
