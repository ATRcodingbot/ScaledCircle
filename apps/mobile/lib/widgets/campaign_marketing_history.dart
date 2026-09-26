import 'package:flutter/material.dart';
import '../models/campaign_planner.dart';
import '../services/business_operations_service.dart';

class CampaignMarketingHistory extends StatelessWidget {
  const CampaignMarketingHistory({
    super.key,
    required this.history,
    required this.onViewCampaign,
    required this.onChooseArea,
    required this.onContinue,
    this.accepted = false,
  });
  final Map<String, dynamic> history;
  final ValueChanged<String> onViewCampaign;
  final VoidCallback onChooseArea, onContinue;
  final bool accepted;

  @override
  Widget build(BuildContext context) {
    final recent = operationRows(history['recent']);
    final historical = operationRows(history['historical']);
    final warning = history['warning'] == true;
    final percent = history['overlapPercent'];
    return Card(
      color: warning ? Theme.of(context).colorScheme.secondaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              warning
                  ? "You've marketed this area recently"
                  : history['state'] == 'marketed_historically'
                  ? 'Previous marketing is more than 12 months old'
                  : 'No completed marketing found for this area',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (warning) ...[
              Text(
                'Last marketed: ${campaignPlanningDateLabel(history['mostRecentCompletedAtMs'])}',
              ),
              const Text(
                'This campaign overlaps your completed marketing territory from the preceding 12 months.',
              ),
              if (percent is num)
                Text(
                  'Approximately ${percent.toStringAsFixed(1)}% of this area was marketed within the last 12 months.',
                ),
            ] else
              const Text(
                'History includes recorded completions for this Business. Saved or printed maps do not count as completed work.',
              ),
            if (recent.isNotEmpty || historical.isNotEmpty)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('View marketing history'),
                children: [
                  for (final item in [...recent, ...historical])
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        item['campaignName']?.toString() ?? 'Previous campaign',
                      ),
                      subtitle: Text(
                        '${campaignPlanningDateLabel(item['completedAtMs'])} · '
                        '${campaignPlanningTypeLabel(item['campaignType']?.toString() ?? '')}'
                        '${item['materialType'] == null ? '' : ' · ${item['materialType']}'}'
                        '${item['completionEvidenceSource'] == 'business_reported' ? ' · Business-reported completion' : ''}',
                      ),
                      trailing: const Icon(Icons.open_in_new),
                      onTap: () =>
                          onViewCampaign(item['campaignId'].toString()),
                    ),
                ],
              ),
            if (warning)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (recent.isNotEmpty)
                    TextButton(
                      onPressed: () =>
                          onViewCampaign(recent.first['campaignId'].toString()),
                      child: const Text('View Previous Campaign'),
                    ),
                  OutlinedButton(
                    onPressed: onChooseArea,
                    child: const Text('Choose Another Area'),
                  ),
                  FilledButton(
                    onPressed: accepted ? null : onContinue,
                    child: Text(
                      accepted
                          ? 'Repeat marketing acknowledged'
                          : 'Continue Anyway',
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
