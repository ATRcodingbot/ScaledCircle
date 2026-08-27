import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../services/attribution_service.dart';

class BusinessAttributionScreen extends StatefulWidget {
  const BusinessAttributionScreen({super.key, this.service});
  final AttributionService? service;
  @override
  State<BusinessAttributionScreen> createState() => _BusinessAttributionScreenState();
}

class _BusinessAttributionScreenState extends State<BusinessAttributionScreen> {
  late final AttributionService _service = widget.service ?? AttributionService();
  late Future<AttributionOverview> _overview = _service.loadOverview();
  void _refresh() => setState(() => _overview = _service.loadOverview());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Response tracking — Beta')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _create,
      icon: const Icon(Icons.add_link),
      label: const Text('Create tracked response'),
    ),
    body: FutureBuilder<AttributionOverview>(
      future: _overview,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return const Center(child: Text("We couldn't load response tracking. Try again."));
        }
        final overview = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
          children: [
            Text('Know which responses came back', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            const Text('QR codes and tracked links use the same first-party ScaledCircle response path.'),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: [
              Chip(label: Text('${overview.metric('trackedInteractions')} interactions')),
              Chip(label: Text('${overview.metric('uniqueResponses')} unique responses')),
              Chip(label: Text('${overview.metric('leads')} leads')),
              Chip(label: Text('${overview.metric('conversions')} conversions')),
            ]),
            const SizedBox(height: 20),
            if (overview.assets.isEmpty)
              const Card(child: ListTile(
                leading: Icon(Icons.qr_code_2),
                title: Text('No response assets yet.'),
                subtitle: Text('Create a tracked link or QR code when you have a real destination to measure.'),
              )),
            ...overview.assets.map((asset) => Card(child: ListTile(
              leading: Icon(asset['type'] == 'qr' ? Icons.qr_code_2 : Icons.link),
              title: Text(asset['label']?.toString() ?? 'Tracked response'),
              subtitle: Text(asset['trackedUrl']?.toString() ?? ''),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showAsset(asset),
            ))),
          ],
        );
      },
    ),
  );

  Future<void> _create() async {
    final label = TextEditingController();
    final destination = TextEditingController();
    var type = 'tracked_link';
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Create a tracked response'),
          content: SizedBox(width: 430, child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: label, decoration: const InputDecoration(labelText: 'Label')),
            TextField(controller: destination, decoration: const InputDecoration(
              labelText: 'Secure destination URL', hintText: 'https://example.com/contact')),
            DropdownButtonFormField<String>(
              initialValue: type,
              decoration: const InputDecoration(labelText: 'Format'),
              items: const [
                DropdownMenuItem(value: 'tracked_link', child: Text('Tracked link')),
                DropdownMenuItem(value: 'qr', child: Text('QR code')),
              ],
              onChanged: (value) => setDialogState(() => type = value ?? type),
            ),
          ])),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    if (submit != true || label.text.trim().isEmpty || destination.text.trim().isEmpty) return;
    try {
      final created = await _service.createResponseAsset(label: label.text.trim(), type: type,
        destination: destination.text.trim(), source: type == 'qr' ? 'qr' : 'tracked_link');
      if (!mounted) return;
      _showAsset({...created, 'label': label.text.trim(), 'type': type});
      _refresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't create that tracked response. Check the secure URL and try again.")),
      );
    }
  }

  void _showAsset(Map<String, dynamic> asset) {
    final trackedUrl = asset['trackedUrl']?.toString() ?? '';
    showDialog<void>(context: context, builder: (context) => AlertDialog(
      title: Text(asset['label']?.toString() ?? 'Tracked response'),
      content: SizedBox(width: 360, child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (asset['type'] == 'qr' && trackedUrl.isNotEmpty)
          QrImageView(data: trackedUrl, size: 220, semanticsLabel: 'Tracked response QR code'),
        const SizedBox(height: 12),
        SelectableText(trackedUrl),
        const SizedBox(height: 8),
        const Text('A visit is a response interaction. A lead is counted only after an explicit contact request.'),
      ])),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
    ));
  }
}
