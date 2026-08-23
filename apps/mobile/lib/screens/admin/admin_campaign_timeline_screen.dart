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
                      subtitle: Text(_formatTime(event.occurredAt)),
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
