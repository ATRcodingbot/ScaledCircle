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
                        ? 'Starting cadence: 2 shared content ideas per week, each adapted for the connected platforms. That is 2 posts per week per platform. Recommendations will change only as real performance evidence accumulates.'
                        : socialEvidenceText(strategy[key], ''),
                  ),
                ),
            ],
          ),
          if (!strategyOnly)
            for (final item in (plan['items'] as List? ?? []).whereType<Map>())
              ExpansionTile(
                title: Text(item['pillar']?.toString() ?? 'Content idea'),
                subtitle: Text(
                  item['platformExclusive'] == true
                      ? 'Platform-exclusive idea · review its version and time'
                      : 'One idea · review each platform version and time',
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
                          Text(
                            'Proposed: ${socialCustomerTime(context, (v['scheduling'] as Map?)?['scheduledFor'] ?? v['scheduledFor'] ?? item['scheduledFor'])}',
                          ),
                          Text('Next step: ${v['callToAction'] ?? 'Review'}'),
                          Text(
                            'Destination: ${v['destinationUrl'] ?? 'Needs review'}',
                          ),
                          if (![
                            'none',
                            'approved_image',
                          ].contains(v['mediaRequirement']))
                            Text(
                              'Creative brief: ${socialEvidenceText(v['mediaRequirement'], 'Choose approved media')}',
                            ),
                          Text(
                            'Post status: ${socialPostStateLabel(v['status'])}',
                          ),
                          Text(
                            v['mediaRevisionId'] != null
                                ? 'Creative version prepared for this post.'
                                : v['mediaRequirement'] == 'none'
                                ? 'Creative status: Text-only. No media required by this draft.'
                                : 'Creative not prepared yet. Choose an approved Business image.',
                          ),
                          Text(
                            'Measurement: ${socialEvidenceText(v['responseAssetRequirement'], 'No measurement recorded yet')}',
                          ),
                          if (![
                            'scheduled',
                            'published',
                          ].contains(v['status'])) ...[
                            if (onPreparePost != null &&
                                (v['scheduling'] as Map?)?['version'] != null)
                              OutlinedButton(
                                onPressed: () => onPreparePost!(
                                  Map<String, dynamic>.from(
                                    v['scheduling'] as Map,
                                  ),
                                ),
                                child: const Text(
                                  'Prepare post / Choose creative',
                                ),
                              ),
                            for (final reason
                                in ((v['scheduling'] as Map?)?['reasons']
                                            as List? ??
                                        const [])
                                    .whereType<Map>())
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      socialEvidenceText(
                                        reason['message'],
                                        'Review this post.',
                                      ),
                                    ),
                                    if (onResolveBlocker != null)
                                      TextButton(
                                        onPressed: () => onResolveBlocker!(
                                          reason['code']?.toString() ??
                                              'readback',
                                          Map<String, dynamic>.from(
                                            v['scheduling'] as Map,
                                          ),
                                        ),
                                        child: Text(switch (reason['code']) {
                                          'creative' => 'Choose Creative',
                                          'quality' => 'Review Content Quality',
                                          'paused' =>
                                            'Review Publishing Settings',
                                          'permission' => 'Manage Connection',
                                          'time' => 'Choose Time',
                                          'scheduler' => 'Review availability',
                                          _ => 'Review post',
                                        }),
                                      ),
                                  ],
                                ),
                              ),
                            if ((v['scheduling'] as Map?)?['ready'] == true &&
                                onSchedulePost != null)
                              FilledButton(
                                onPressed: () => onSchedulePost!(
                                  Map<String, dynamic>.from(
                                    v['scheduling'] as Map,
                                  ),
                                ),
                                child: const Text('Approve & Schedule'),
                              ),
                          ] else
                            Text(
                              'Scheduled: ${socialCustomerTime(context, v['scheduledFor'])}',
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
