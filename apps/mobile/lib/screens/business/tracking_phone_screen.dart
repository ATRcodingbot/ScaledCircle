import 'package:flutter/material.dart';

import '../../navigation/business_back_button.dart';
import '../../services/tracking_phone_service.dart';

class TrackingPhoneScreen extends StatefulWidget {
  const TrackingPhoneScreen({super.key, this.service});

  final TrackingPhoneGateway? service;

  @override
  State<TrackingPhoneScreen> createState() => _TrackingPhoneScreenState();
}

class _TrackingPhoneScreenState extends State<TrackingPhoneScreen> {
  late final TrackingPhoneGateway _service = widget.service ?? TrackingPhoneService();
  late Future<Map<String, dynamic>> _workspace = _service.workspace();

  void _reload() => setState(() => _workspace = _service.workspace());

  List<Map<String, dynamic>> _maps(Object? value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
      : const [];

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const BusinessBackButton(),
      title: const Text('Tracking Numbers — Beta'),
      actions: [IconButton(onPressed: _reload, tooltip: 'Refresh', icon: const Icon(Icons.refresh))],
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _workspace,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return Center(child: FilledButton(onPressed: _reload, child: const Text('Try again')));
        }
        final data = snapshot.data!;
        final numbers = _maps(data['numbers']);
        final calls = _maps(data['recentCalls']);
        final usage = data['usage'] is Map
            ? Map<String, dynamic>.from(data['usage'] as Map)
            : <String, dynamic>{};
        final allowance = usage['allowance'] is Map
            ? Map<String, dynamic>.from(usage['allowance'] as Map)
            : <String, dynamic>{};
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Campaign call tracking', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(data['message']?.toString() ??
                        'Tracking Numbers are in Beta. Setup is not available yet.'),
                    const SizedBox(height: 8),
                    const Text('Calls, answered calls, missed calls, qualified leads, and conversions remain separate.'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: null,
                      icon: const Icon(Icons.phone_forwarded_outlined),
                      label: const Text('Set up Tracking Number — Coming Soon'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _UsageCard(label: 'Active numbers', value:
                  '${usage['activeNumbers'] ?? 0} / ${allowance['activeNumbers'] ?? 0}'),
                _UsageCard(label: 'Forwarded minutes', value:
                  '${usage['minutes'] ?? 0} / ${allowance['includedMinutes'] ?? 0}'),
                _UsageCard(label: 'Calls', value: '${calls.length}'),
                _UsageCard(label: 'Answered', value:
                  '${calls.where((call) => ['ANSWERED', 'COMPLETED'].contains(call['state'])).length}'),
                _UsageCard(label: 'Missed', value:
                  '${calls.where((call) => ['BUSY', 'NO_ANSWER', 'FAILED'].contains(call['state'])).length}'),
                _UsageCard(label: 'Qualified leads', value:
                  '${calls.where((call) => call['qualifiedLead'] == true).length}'),
              ],
            ),
            const SizedBox(height: 20),
            Text('Tracking numbers', style: Theme.of(context).textTheme.titleLarge),
            if (numbers.isEmpty)
              const Card(child: ListTile(
                leading: Icon(Icons.phone_disabled_outlined),
                title: Text('No tracking numbers yet'),
                subtitle: Text('Your existing Business phone and campaigns are unaffected.'),
              ))
            else
              ...numbers.map((number) => Card(child: ListTile(
                leading: const Icon(Icons.phone_in_talk_outlined),
                title: Text(number['campaignName']?.toString() ?? 'Campaign'),
                subtitle: Text('${number['displayNumber'] ?? ''}\nForwards to ${number['destinationMaskedDisplay'] ?? 'verified Business phone'}'),
                isThreeLine: true,
                trailing: Text(number['status']?.toString() ?? 'UNKNOWN'),
              ))),
            const SizedBox(height: 20),
            Text('Recent calls', style: Theme.of(context).textTheme.titleLarge),
            if (calls.isEmpty)
              const Card(child: ListTile(
                leading: Icon(Icons.call_outlined),
                title: Text('No calls yet'),
                subtitle: Text('An answered call is not automatically a lead or conversion.'),
              ))
            else
              ...calls.map((call) => Card(child: ListTile(
                title: Text(call['caller']?.toString() ?? 'Private caller'),
                subtitle: Text(call['state']?.toString() ?? 'UNKNOWN'),
              ))),
          ],
        );
      },
    ),
  );
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 170,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ]),
      ),
    ),
  );
}
