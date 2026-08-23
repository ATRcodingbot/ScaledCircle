import 'package:flutter/material.dart';
import '../../services/admin_operations_service.dart';
import 'admin_role_gate.dart';

class AdminCampaignTimelineScreen extends StatelessWidget {
  const AdminCampaignTimelineScreen({
    required this.campaignId,
    this.service,
    super.key,
  });
  final String campaignId;
  final AdminOperationsService? service;

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(title: const Text('Campaign timeline')),
      body: FutureBuilder<AdminCampaignTimeline>(
        future: (service ?? AdminOperationsService()).loadCampaignTimeline(
          campaignId,
        ),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Text(
                "We couldn't load this campaign timeline. Try again.",
              ),
            );
          }
          final timeline = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(
                timeline.name,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text('Current status: ${timeline.status}'),
              const SizedBox(height: 20),
              if (timeline.events.isEmpty)
                const Card(
                  child: ListTile(
                    title: Text('No authoritative timeline events found.'),
                  ),
                )
              else
                ...timeline.events.map(
                  (event) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.history),
                      title: Text(event.title),
                      subtitle: Text(
                        [
                          _formatTime(event.occurredAt),
                          ..._financialDetail(event),
                        ].join('\n'),
                      ),
                      isThreeLine: _financialDetail(event).isNotEmpty,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    ),
  );
}

String _formatTime(DateTime? value) => value == null
    ? 'Time unavailable'
    : value.toLocal().toString().split('.').first;

List<String> _financialDetail(AdminTimelineEvent event) {
  final detail = event.detail;
  if (event.type == 'payment_received') {
    return [
      'Customer paid: ${_money(detail['grossCents'])}${_reference(detail['reference'])}',
      'Worker allocation: ${_money(detail['workerCents'])} • ScaledCircle fee: ${_money(detail['platformFeeCents'])}',
    ];
  }
  if (event.type == 'refund_completed') {
    return [
      'Refund: ${_money(detail['refundCents'])}${_reference(detail['reference'])}',
    ];
  }
  if (event.type == 'worker_earning_established') {
    return ['Worker earning: ${_money(detail['totalEarnedCents'])}'];
  }
  return const [];
}

String _reference(Object? value) =>
    value?.toString().isNotEmpty == true ? ' • Ref ${value.toString()}' : '';

String _money(Object? cents) {
  final value = cents is num ? cents.toInt() : 0;
  return '\$${(value / 100).toStringAsFixed(2)}';
}
