import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';

class SocialRuntimeStatusCard extends StatelessWidget {
  const SocialRuntimeStatusCard({
    super.key,
    required this.status,
    required this.onRefresh,
    this.compact = false,
    this.onReviewPosts,
    this.onNeedsAttention,
  });
  final Map<String, dynamic> status;
  final VoidCallback onRefresh;
  final bool compact;
  final VoidCallback? onReviewPosts;
  final VoidCallback? onNeedsAttention;

  String _time(BuildContext context, dynamic raw, dynamic label) => raw == null
      ? 'Not scheduled'
      : socialCustomerTime(context, raw, label: label);

  @override
  Widget build(BuildContext context) {
    final channels = (status['channels'] as List? ?? const []).whereType<Map>();
    final summary = status['summary'] as Map?;
    final details = <Widget>[
      for (final channel in channels) ...[
        const Divider(height: 24),
        Text(switch (channel['provider']) {
          'facebook' => 'Facebook',
          'instagram' => 'Instagram',
          'x' => 'X',
          _ => 'Social channel',
        }, style: const TextStyle(fontWeight: FontWeight.bold)),
        Text(
          'Next ${channel['nextFormat'] ?? 'post'}: ${_time(context, channel['nextScheduledFor'], channel['nextScheduledForLabel'])}',
        ),
        Text(
          socialEvidenceText(
            channel['result'],
            'No confirmed outcome is available.',
          ),
        ),
        Text(
          'Next measurement: ${_time(context, channel['nextMeasurementAt'], channel['nextMeasurementAtLabel'])}',
        ),
        Text(
          socialEvidenceText(channel['actionNeeded'], 'Review the saved plan.'),
        ),
      ],
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Social Manager — Beta',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (status['available'] == true && summary != null) ...[
              Text(
                summary['title']?.toString() ?? 'Review your Social plan',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(summary['description']?.toString() ?? ''),
              if (summary['counters'] is Map)
                Text('${summary['counters']['scheduled'] ?? 0} scheduled · '
                    '${summary['counters']['published'] ?? 0} published · '
                    '${summary['counters']['needsAttention'] ?? 0} need attention'),
              if ((summary['counters']?['needsAttention'] ?? 0) > 0 && onNeedsAttention != null)
                TextButton(onPressed: onNeedsAttention, child: const Text('View Needs Attention')),
            ],
            if (status['available'] != true)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'We could not confirm the latest status. Refresh to check before taking action.',
                ),
              )
            else if (compact && channels.isNotEmpty)
              ExpansionTile(
                title: const Text('Schedule and measurement details'),
                children: details,
              )
            else
              ...details,
            const SizedBox(height: 12),
            if (onReviewPosts != null &&
                summary?['review']?['planApprovalState'] == 'approved' &&
                (summary?['counters']?['draftPosts'] ?? 0) > 0)
              FilledButton(
                onPressed: onReviewPosts,
                child: const Text('Upcoming Posts'),
              ),
            const Text(
              'Account connection alone does not authorize publishing. Your approved strategy or individual post approval controls what is scheduled.',
            ),
            TextButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh saved status'),
            ),
          ],
        ),
      ),
    );
  }
}
