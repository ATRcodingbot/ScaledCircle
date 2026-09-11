import 'package:flutter/material.dart';
import 'social_connection_card.dart';
import '../models/social_plan_presentation.dart';

class CustomerSocialPlanCard extends StatelessWidget {
  const CustomerSocialPlanCard({
    super.key,
    required this.plan,
    this.initiallyExpanded = false,
    this.onApprove,
    this.onReviewPosts,
    this.strategyOnly = false,
  });
  final Map<String, dynamic> plan;
  final bool initiallyExpanded;
  final VoidCallback? onApprove;
  final VoidCallback? onReviewPosts;
  final bool strategyOnly;
  @override
  Widget build(BuildContext context) {
    final strategy = plan['strategy'] as Map? ?? {};
    return Card(
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        title: Text(plan['goal']?.toString() ?? '30-day Social strategy'),
        subtitle: Text(
          socialPlanApproved(plan)
              ? 'Approved strategy'
              : 'Plan version needs review',
        ),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        childrenPadding: const EdgeInsets.all(16),
        children: [
          if (!strategyOnly)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Creative briefs are not finished images or videos. Review each post’s copy and any required media separately before scheduling. Text-only posts do not need an image where the platform supports them.',
              ),
            ),
          for (final key in [
            'cadence',
            'timingBasis',
            'objective',
            'measurement',
            if (!strategyOnly) 'creativeState',
            if (!socialPlanApproved(plan)) 'nextAction',
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(strategy[key]?.toString() ?? ''),
            ),
          if (!strategyOnly)
            for (final item in (plan['items'] as List? ?? []).whereType<Map>())
              ExpansionTile(
                title: Text(item['pillar']?.toString() ?? 'Proposed post'),
                subtitle: Text(
                  'Proposed: ${DateTime.tryParse(item['scheduledFor']?.toString() ?? '')?.toLocal().toString().substring(0, 16) ?? 'Review timing'}',
                ),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Objective / why recommended: ${item['goal'] ?? 'Review the proposed purpose'}',
                  ),
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
                            'Post status: ${socialPostStateLabel(v['status'])}',
                          ),
                          Text(
                            v['mediaRequirement'] == 'none'
                                ? 'Creative status: Text-only. No media required by this draft.'
                                : 'Creative not prepared yet. Finished media preparation is not available in this workflow yet; scheduling remains unavailable.',
                          ),
                          Text(
                            'Measurement: ${v['responseAssetRequirement'] ?? 'No measurement recorded yet'}',
                          ),
                        ],
                      ),
                    ),
                ],
              ),
          if (plan['status'] == 'ready_for_review' && onApprove != null) ...[
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onApprove,
              child: const Text('Approve 30-Day Plan'),
            ),
          ],
        ],
      ),
    );
  }
}
