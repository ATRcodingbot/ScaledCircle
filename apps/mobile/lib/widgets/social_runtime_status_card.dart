import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';

class SocialRuntimeStatusCard extends StatelessWidget {
  const SocialRuntimeStatusCard({
    super.key,
    required this.status,
    required this.onRefresh,
    this.compact = false,
    this.onReviewPosts,
  });
  final Map<String, dynamic> status;
  final VoidCallback onRefresh;
  final bool compact;
  final VoidCallback? onReviewPosts;

  String _time(BuildContext context, dynamic raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '');
    if (value == null) return 'Not scheduled';
    final local = value.toLocal();
    final labels = MaterialLocalizations.of(context);
    return '${labels.formatMediumDate(local)}, ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(local))} (device time)';
  }

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
          'Next ${channel['nextFormat'] ?? 'post'}: ${_time(context, channel['nextScheduledFor'])}',
        ),
        Text(
          socialEvidenceText(
            channel['result'],
            'No confirmed outcome is available.',
          ),
        ),
        Text(
          'Next measurement: ${_time(context, channel['nextMeasurementAt'])}',
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
                child: const Text('Review Draft Posts'),
              ),
            const Text(
              'Account permissions do not approve posts. Your content approval and scheduling controls remain separate.',
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
