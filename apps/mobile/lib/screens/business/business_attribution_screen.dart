import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../config/app_environment.dart';
import '../../services/attribution_service.dart';

class BusinessAttributionScreen extends StatefulWidget {
  const BusinessAttributionScreen({
    super.key,
    this.service,
    this.enabled = AppEnvironmentConfig.isStaging,
  });
  final AttributionClient? service;
  final bool enabled;
  @override
  State<BusinessAttributionScreen> createState() =>
      _BusinessAttributionScreenState();
}

class _BusinessAttributionScreenState extends State<BusinessAttributionScreen> {
  late final AttributionClient _service =
      widget.service ?? AttributionService();
  late Future<AttributionOverview> _overview = widget.enabled
      ? _service.loadOverview()
      : Future.value(
          const AttributionOverview(
            metrics: {},
            assets: [],
            dataStatus: 'unavailable',
          ),
        );
  bool _creating = false;
  void _refresh() => setState(() => _overview = _service.loadOverview());

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) {
      return Scaffold(
        appBar: AppBar(title: const Text('Response tracking — Coming Soon')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Tracked links and QR response measurement are not available yet.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Response tracking — Beta')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _creating ? null : _create,
        icon: const Icon(Icons.add_link),
        label: Text(_creating ? 'Creating…' : 'Create tracked link + QR'),
      ),
      body: FutureBuilder<AttributionOverview>(
        future: _overview,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Text("We couldn't load response tracking. Try again."),
            );
          }
          final overview = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
            children: [
              Text(
                'Know which responses came back',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              const Text(
                'QR codes and tracked links use the same first-party ScaledCircle response path.',
              ),
              const SizedBox(height: 6),
              const Text(
                'Each Create action makes a new response asset. Reopening this page reuses the assets already listed.',
              ),
              const SizedBox(height: 6),
              const Text(
                'Testing and pre-launch visits are kept separate from live campaign results.',
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(
                    label: Text(
                      '${overview.metric('trackedInteractions')} live interactions',
                    ),
                  ),
                  Chip(
                    label: Text(
                      '${overview.metric('uniqueResponses')} unique live responses',
                    ),
                  ),
                  Chip(
                    label: Text(
                      '${overview.metric('testInteractions')} test / pre-launch visits',
                    ),
                  ),
                  Chip(label: Text('${overview.metric('leads')} leads')),
                  Chip(
                    label: Text(
                      '${overview.metric('conversions')} conversions',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (overview.assets.isEmpty)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.qr_code_2),
                    title: Text('No response assets yet.'),
                    subtitle: Text(
                      'Create one tracked link with a matching QR code when you have a real destination to measure.',
                    ),
                  ),
                ),
              ...overview.assets.map(
                (asset) => Card(
                  child: ListTile(
                    leading: Icon(
                      asset['type'] == 'qr' ? Icons.qr_code_2 : Icons.link,
                    ),
                    title: Text(
                      asset['label']?.toString() ?? 'Tracked response',
                    ),
                    subtitle: Text(
                      '${_activityLabel(asset['analyticsClass'])}\n${asset['trackedUrl']?.toString() ?? ''}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _showAsset(asset),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _create() async {
    if (_creating) return;
    final label = TextEditingController();
    final destination = TextEditingController();
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create a tracked response'),
        content: SizedBox(
          width: 430,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: label,
                decoration: const InputDecoration(labelText: 'Label'),
              ),
              TextField(
                controller: destination,
                decoration: const InputDecoration(
                  labelText: 'Secure destination URL',
                  hintText: 'https://example.com/contact',
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'ScaledCircle will create one tracked link and a QR code containing that exact link.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (submit != true ||
        label.text.trim().isEmpty ||
        destination.text.trim().isEmpty) {
      return;
    }
    setState(() => _creating = true);
    try {
      final created = await _service.createResponseAsset(
        label: label.text.trim(),
        type: 'tracked_link',
        destination: destination.text.trim(),
        source: 'tracked_link',
      );
      if (!mounted) return;
      _showAsset({
        ...created,
        'label': label.text.trim(),
        'type': 'tracked_link',
        'analyticsClass': 'prelaunch',
      });
      _refresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't create that tracked response. Check the secure URL and try again.",
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  void _showAsset(Map<String, dynamic> asset) {
    final trackedUrl = asset['trackedUrl']?.toString() ?? '';
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(asset['label']?.toString() ?? 'Tracked response'),
        content: SizedBox(
          width: 360,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (trackedUrl.isNotEmpty)
                  QrImageView(
                    data: trackedUrl,
                    size: 200,
                    semanticsLabel: 'Tracked response QR code',
                  ),
                const SizedBox(height: 12),
                SelectableText(trackedUrl),
                const SizedBox(height: 8),
                Chip(
                  label: Text(
                    '${_activityLabel(asset['analyticsClass'])} · Beta',
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  asset['analyticsClass'] == 'live'
                      ? 'Live visits count as campaign responses. A lead is counted only after an explicit contact request.'
                      : 'Test visits verify the permanent link but are not included in live campaign results.',
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: trackedUrl.isEmpty
                ? null
                : () async {
                    await Clipboard.setData(ClipboardData(text: trackedUrl));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Tracked link copied.')),
                    );
                  },
            icon: const Icon(Icons.copy),
            label: const Text('Copy link'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  String _activityLabel(Object? value) => switch (value?.toString()) {
    'live' => 'Live',
    'paused' => 'Paused campaign',
    'post_campaign' => 'Campaign complete',
    'cancelled' => 'Campaign cancelled',
    'retired' => 'Retired',
    _ => 'Testing / Pre-launch',
  };
}
