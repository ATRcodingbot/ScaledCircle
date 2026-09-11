import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';

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
                ? '30-Day Plan · Approved ✓'
                : '${presentation.plans.length} saved plan${presentation.plans.length == 1 ? '' : 's'}',
          ),
          if (!refreshingApproval) ...[
            Text('Draft Posts: ${presentation.draftPosts} ready for review'),
            Text(
              'Scheduled: ${presentation.count('scheduled') ?? 'Not confirmed'}',
            ),
            Text(
              'Published: ${presentation.count('published') ?? 'Not confirmed'}',
            ),
          ],
          const Text(
            'Plan approval does not approve posts, complete media or schedule publication.',
          ),
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
