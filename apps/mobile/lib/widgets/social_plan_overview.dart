import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';
import 'social_connection_card.dart';

class SocialPlanOverview extends StatelessWidget {
  const SocialPlanOverview({
    super.key,
    required this.presentation,
    required this.onReview,
    this.refreshingApproval = false,
  });
  final SocialPlanPresentation presentation;
  final VoidCallback onReview;
  final bool refreshingApproval;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            refreshingApproval
                ? 'Plan approved — refreshing status…'
                : presentation.allApproved
                ? '30-Day Strategy · Approved'
                : '${presentation.plans.length} saved plan${presentation.plans.length == 1 ? '' : 's'}',
          ),
          if (!refreshingApproval) ...[
            Text('Content Ideas: ${presentation.ideas.length}'),
            Text('Platform Versions: ${presentation.versions.length}'),
            for (final platform in presentation.byPlatform.entries)
              Text(
                '${socialProviderName(platform.key)}: ${platform.value.length} versions · ${platform.value.where((v) => !['approved', 'scheduled', 'published'].contains(v['status'])).length} drafts',
              ),
            Text(
              'Approved versions: ${presentation.versionsInState('approved')}',
            ),
            Text(
              'Scheduled versions: ${presentation.count('scheduled') == null ? 'Not confirmed' : presentation.versionsInState('scheduled')}',
            ),
            Text(
              'Published versions: ${presentation.count('published') == null ? 'Not confirmed' : presentation.versionsInState('published')}',
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: refreshingApproval ? null : onReview,
            child: Text(
              refreshingApproval
                  ? 'Refreshing status…'
                  : presentation.primaryAction,
            ),
          ),
        ],
      ),
    ),
  );
}
