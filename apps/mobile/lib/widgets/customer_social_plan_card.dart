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
    this.onSchedulePost,
    this.onPreparePost,
    this.onResolveBlocker,
    this.strategyOnly = false,
  });
  final Map<String, dynamic> plan;
  final bool initiallyExpanded;
  final VoidCallback? onApprove;
  final VoidCallback? onReviewPosts;
  final void Function(Map<String, dynamic>)? onSchedulePost;
  final void Function(Map<String, dynamic>)? onPreparePost;
  final void Function(String, Map<String, dynamic>)? onResolveBlocker;
  final bool strategyOnly;
  @override
  Widget build(BuildContext context) {
    final strategy = plan['strategy'] as Map? ?? {};
    return Card(
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        title: Text(socialEvidenceText(plan['goal'], '30-day Social strategy')),
        subtitle: Text(
          socialPlanApproved(plan)
              ? 'Approved strategy'
              : 'Plan version needs review',
        ),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        childrenPadding: const EdgeInsets.all(16),
        children: [
          ExpansionTile(
            title: Text(
              socialPlanApproved(plan)
                  ? 'View Approved Strategy'
                  : 'View Strategy',
            ),
            initiallyExpanded: strategyOnly,
            children: [
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
                  child: Text(
                    key == 'cadence' &&
                            strategy['version'] ==
                                'CustomerSocialDraftStrategyV1'
                        ? 'Proposed starting cadence: 5 posts per week per platform. Your approved publishing preferences determine the current target. Adaptive changes require owner authorization and sufficient measured results.'
                        : socialEvidenceText(strategy[key], ''),
                  ),
                ),
            ],
          ),
          if (!strategyOnly)
            for (final item in (plan['items'] as List? ?? []).whereType<Map>())
              for (final v
                  in (item['variants'] as List? ?? []).whereType<Map>())
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${socialProviderName(v['provider']?.toString() ?? '')} · ${item['pillar'] ?? 'Post'}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(socialPostStateLabel(v['status'])),
                        const SizedBox(height: 8),
                        Text(
                          v['copy']?.toString() ?? '',
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Proposed: ${socialCustomerTime(context, (v['scheduling'] as Map?)?['proposedFutureTime'] ?? v['scheduledFor'] ?? item['scheduledFor'], label: (v['scheduling'] as Map?)?['scheduledForLabel'])}',
                        ),
                        Text(
                          'Objective: ${item['goal'] ?? 'Review the proposed purpose'}',
                        ),
                        if (![
                          'scheduled',
                          'published',
                        ].contains(v['status'])) ...[
                          const SizedBox(height: 12),
                          if (onPreparePost != null &&
                              (v['scheduling'] as Map?)?['version'] != null)
                            FilledButton(
                              onPressed: () => onPreparePost!(
                                Map<String, dynamic>.from(
                                  v['scheduling'] as Map,
                                ),
                              ),
                              child: const Text('Preview Post'),
                            )
                          else
                            const Text(
                              'Post preview is unavailable. Reload the current content before approval.',
                            ),
                        ] else
                          Text(
                            '${socialPostStateLabel(v['status'])}: ${socialCustomerTime(context, v['scheduledFor'], label: v['scheduling']?['scheduledForLabel'])}',
                          ),
                      ],
                    ),
                  ),
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
