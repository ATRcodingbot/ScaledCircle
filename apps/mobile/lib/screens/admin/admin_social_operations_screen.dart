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

  Future<void> _configureProvider() async {
    final clientId = TextEditingController();
    final redirectUri = TextEditingController(
      text:
          'https://us-east1-scaledcircle-staging.cloudfunctions.net/socialOAuthCallbackV1',
    );
    var provider = 'meta';
    var enabled = false;
    var historicalSyncEnabled = false;
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('Configure read-only provider'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: provider,
                  decoration: const InputDecoration(labelText: 'Provider'),
                  items: const [
                    DropdownMenuItem(
                      value: 'meta',
                      child: Text('Meta — Facebook + Instagram'),
                    ),
                    DropdownMenuItem(value: 'x', child: Text('X')),
                    DropdownMenuItem(value: 'youtube', child: Text('YouTube')),
                  ],
                  onChanged: (value) =>
                      setModalState(() => provider = value ?? 'meta'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: clientId,
                  onChanged: (_) => setModalState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'OAuth client ID',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: redirectUri,
                  onChanged: (_) => setModalState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Exact HTTPS callback',
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Allow read-only connection'),
                  subtitle: const Text('Publishing scopes remain unavailable.'),
                  value: enabled,
                  onChanged: (value) => setModalState(() => enabled = value),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Allow historical insights sync'),
                  subtitle: Text(
                    provider == 'x'
                        ? 'Keep off until X API credits are separately approved.'
                        : 'Imports provider-supported read-only metrics.',
                  ),
                  value: historicalSyncEnabled,
                  onChanged: (value) =>
                      setModalState(() => historicalSyncEnabled = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed:
                  clientId.text.trim().isEmpty ||
                      !redirectUri.text.trim().startsWith('https://')
                  ? null
                  : () => Navigator.pop(dialogContext, true),
              child: const Text('Save safe configuration'),
            ),
          ],
        ),
      ),
    );
    if (save == true && mounted) {
      try {
        await _service.configureSocialProvider(
          provider: provider,
          appName: 'ScaledCircle Social Operations — Production',
          clientId: clientId.text.trim(),
          redirectUri: redirectUri.text.trim(),
          enabled: enabled,
          historicalSyncEnabled: historicalSyncEnabled,
        );
        _refresh();
      } on Object catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Provider configuration was not saved.'),
            ),
          );
        }
      }
    }
    clientId.dispose();
    redirectUri.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Social Operations'),
      actions: [
        IconButton(
          onPressed: _configureProvider,
          tooltip: 'Configure read-only provider',
          icon: const Icon(Icons.settings_outlined),
        ),
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
              'Social connection operational health',
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
            for (final config
                in (value['providerConfigs'] as List? ?? const [])
                    .whereType<Map>())
              Card(
                child: ListTile(
                  leading: const Icon(Icons.admin_panel_settings_outlined),
                  title: Text(
                    '${config['provider'] ?? 'Provider'} configuration',
                  ),
                  subtitle: Text(
                    'Connection: ${config['enabled'] == true ? 'Enabled' : 'Off'} · '
                    'Historical sync: ${config['historicalSyncEnabled'] == true ? 'Enabled' : 'Off'} · '
                    'Write scopes: Off',
                  ),
                ),
              ),
            for (final connection
                in (value['connections'] as List? ?? const []).whereType<Map>())
              Card(
                child: ListTile(
                  leading: const Icon(Icons.link_outlined),
                  title: Text(
                    '${connection['provider'] ?? 'Provider'} — ${connection['status'] ?? 'unknown'}',
                  ),
                  subtitle: Text(
                    [
                          connection['accountDisplayName']?.toString(),
                          connection['handle']?.toString(),
                          'Token: ${connection['tokenHealth'] ?? 'unknown'}',
                          'Analytics: ${connection['analyticsAvailable'] == true ? 'Available' : 'Unavailable'}',
                        ]
                        .whereType<String>()
                        .where((item) => item.isNotEmpty)
                        .join(' · '),
                  ),
                ),
              ),
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
