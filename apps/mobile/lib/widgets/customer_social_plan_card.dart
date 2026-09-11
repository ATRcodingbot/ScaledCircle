import 'package:flutter/material.dart';
import 'social_connection_card.dart';

class CustomerSocialPlanCard extends StatelessWidget {
  const CustomerSocialPlanCard({
    super.key,
    required this.plan,
    this.initiallyExpanded = false,
    this.onApprove,
    this.onReviewPosts,
  });
  final Map<String, dynamic> plan;
  final bool initiallyExpanded;
  final VoidCallback? onApprove;
  final VoidCallback? onReviewPosts;
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
              'Creative briefs are not finished images or videos. Review each post’s copy and any required media separately before scheduling. Text-only posts do not need an image where the platform supports them.',
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
                          'Post approval: ${v['status'] == 'approved' ? 'Approved version' : 'Needs content review'}',
                        ),
                        Text(
                          v['mediaRequirement'] == 'none'
                              ? 'Creative status: Text-only. No media required by this draft.'
                              : 'Creative status: Brief prepared. Finished media must be verified before scheduling.',
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
          if (plan['status'] == 'approved' && onReviewPosts != null) ...[
            const SizedBox(height: 16),
            const Text(
              '30-Day Plan Approved. Each post still needs content review; approval has not scheduled anything.',
            ),
            FilledButton(
              onPressed: onReviewPosts,
              child: const Text('Review Posts'),
            ),
          ],
        ],
      ),
    );
  }
}
