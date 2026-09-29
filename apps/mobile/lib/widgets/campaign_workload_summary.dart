import 'package:flutter/material.dart';
import 'zone_intelligence_summary.dart';

class CampaignWorkloadSummary extends StatelessWidget {
  const CampaignWorkloadSummary({super.key, required this.state, this.onEdit});
  final Map<String, dynamic>? state;
  final VoidCallback? onEdit;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Campaign workload',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            state?['requestedHours'] is num
                ? '${state?['requestedWorkloadSource'] == 'saved_recommendation' ? 'Saved recommendation request' : 'Requested'}: ${state!['requestedHours']} hours'
                : 'Requested workload not set',
          ),
          Text('Required Zones: ${state?['requiredZoneCount'] ?? 'Not set'}'),
          Text(
            'Zones ready for review: ${state?['validZoneCount'] ?? 0} of ${state?['requiredZoneCount'] ?? '—'}',
          ),
          Text(
            state?['supportedMinutes'] is num
                ? 'Supported planning workload: ~${fieldWorkload(state!['supportedMinutes'] as num)}'
                : 'Supported planning workload: Not established',
          ),
          if (state?['supportedMinutes'] is num &&
              state?['requestedMinutes'] is num &&
              state!['supportedMinutes'] < state!['requestedMinutes'])
            const Text(
              'Available evidence supports less than the requested workload.',
            ),
          if (state?['reason'] is String) Text(state!['reason'] as String),
          if (state?['targetMinutesPerZone'] is num)
            Text(
              'Planning target per Zone: ~${fieldWorkload(state!['targetMinutesPerZone'] as num)}. Actual field estimates use area evidence.',
            ),
          if (onEdit != null)
            TextButton(
              onPressed: onEdit,
              child: const Text('Set requested workload'),
            ),
        ],
      ),
    ),
  );
}
