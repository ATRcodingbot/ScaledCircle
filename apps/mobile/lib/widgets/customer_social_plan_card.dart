import 'package:flutter/material.dart';
import 'social_connection_card.dart';

class CustomerSocialPlanCard extends StatelessWidget {
  const CustomerSocialPlanCard({
    super.key,
    required this.plan,
    this.initiallyExpanded = false,
  });
  final Map<String, dynamic> plan;
  final bool initiallyExpanded;
  @override
  Widget build(BuildContext context) {
    final strategy = plan['strategy'] as Map? ?? {};
    return Card(
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        title: Text(plan['goal']?.toString() ?? '30-day Social strategy'),
        subtitle: Text(
          plan['status'] == 'approved'
              ? 'Plan approved · Post approval and scheduling are separate'
              : 'Draft · Needs your review',
        ),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        childrenPadding: const EdgeInsets.all(16),
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'Review only. Creative briefs describe media to prepare; they are not finished images or videos. Each post still needs approved content and media before scheduling.',
            ),
          ),
          for (final key in [
            'cadence',
            'timingBasis',
            'objective',
            'measurement',
            'creativeState',
            'nextAction',
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(strategy[key]?.toString() ?? ''),
            ),
          for (final item in (plan['items'] as List? ?? []).whereType<Map>())
            ExpansionTile(
              title: Text(item['pillar']?.toString() ?? 'Proposed post'),
              subtitle: Text(
                'Proposed: ${DateTime.tryParse(item['scheduledFor']?.toString() ?? '')?.toLocal().toString().substring(0, 16) ?? 'Review timing'}',
              ),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Why: ${item['goal']}'),
                for (final v
                    in (item['variants'] as List? ?? []).whereType<Map>())
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          socialProviderName(v['provider']?.toString() ?? ''),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        SelectableText(v['copy']?.toString() ?? ''),
                        Text('Next step: ${v['callToAction'] ?? 'Review'}'),
                        Text(
                          'Destination: ${v['destinationUrl'] ?? 'Needs review'}',
                        ),
                        Text(
                          'Creative brief: ${v['mediaRequirement'] ?? 'Needs approved media'}',
                        ),
                        Text(
                          'Measurement: ${v['responseAssetRequirement'] ?? 'No measurement recorded yet'}',
                        ),
                      ],
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
