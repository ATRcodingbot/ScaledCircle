import 'package:flutter/material.dart';
import '../../services/attribution_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import 'admin_role_gate.dart';

class AdminAttributionScreen extends StatefulWidget {
  const AdminAttributionScreen({super.key, this.service});
  final AttributionService? service;
  @override
  State<AdminAttributionScreen> createState() => _AdminAttributionScreenState();
}

class _AdminAttributionScreenState extends State<AdminAttributionScreen> {
  late final AttributionService _service = widget.service ?? AttributionService();
  late Future<AttributionOverview> _overview = _service.loadOverview();
  void _refresh() => setState(() => _overview = _service.loadOverview());

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        title: const Text('Growth attribution'),
        actions: [
          IconButton(onPressed: _refresh, tooltip: 'Refresh', icon: const Icon(Icons.refresh)),
          const AuthenticatedSignOutButton(),
        ],
      ),
      body: FutureBuilder<AttributionOverview>(
        future: _overview,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(child: Text("We couldn't load attribution status. Try again."));
          }
          return _AttributionContent(overview: snapshot.data!);
        },
      ),
    ),
  );
}

class _AttributionContent extends StatelessWidget {
  const _AttributionContent({required this.overview});
  final AttributionOverview overview;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Text('Response performance', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 6),
      const Text('Real first-party response events. No estimated physical impressions.'),
      const SizedBox(height: 16),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          _Metric(label: 'Tracked interactions', value: overview.metric('trackedInteractions')),
          _Metric(label: 'Unique responses', value: overview.metric('uniqueResponses')),
          _Metric(label: 'Leads', value: overview.metric('leads')),
          _Metric(label: 'Conversions', value: overview.metric('conversions')),
        ],
      ),
      const SizedBox(height: 24),
      Text('Response assets', style: Theme.of(context).textTheme.headlineSmall),
      if (overview.dataStatus == 'insufficient_data')
        const Card(
          child: ListTile(
            leading: Icon(Icons.insights_outlined),
            title: Text('Insufficient attribution data.'),
            subtitle: Text('Metrics will appear after a tracked response asset records real activity.'),
          ),
        )
      else
        ...overview.assets.take(20).map((asset) => Card(
          child: ListTile(
            leading: Icon(asset['type'] == 'qr' ? Icons.qr_code_2 : Icons.link),
            title: Text(asset['label']?.toString() ?? 'Tracked response'),
            subtitle: Text('${_label(asset['type']?.toString() ?? 'tracked_link')} • '
                '${_label(asset['status']?.toString() ?? 'active')}'),
          ),
        )),
    ],
  );
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final int value;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 190,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$value', style: Theme.of(context).textTheme.headlineMedium),
          Text(label),
        ]),
      ),
    ),
  );
}

String _label(String value) => value.replaceAll('_', ' ').split(' ').map(
  (word) => word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}',
).join(' ');
