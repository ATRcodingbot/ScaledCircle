import 'package:flutter/material.dart';

class GrowthRelationshipCounts extends StatelessWidget {
  const GrowthRelationshipCounts({
    super.key,
    required this.prospects,
    this.mailbox,
    this.observations,
  });
  final List<Map<String, dynamic>> prospects;
  final Map? mailbox;
  final num? observations;

  @override
  Widget build(BuildContext context) {
    final accounts = prospects
        .where(
          (p) =>
              p['kind'] != 'scaler' &&
              p['opportunityType'] != 'workforce_candidate' &&
              p['opportunityType'] != 'recruitment_channel',
        )
        .toList();
    final ops = (mailbox?['operations'] as List? ?? const [])
        .whereType<Map>()
        .where((o) => o['certification'] != true)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Chip(
              label: Text('Observations: ${observations ?? 'Not recorded'}'),
            ),
            Chip(label: Text('Researched accounts: ${accounts.length}')),
            Chip(
              label: Text(
                'Qualified fit: ${accounts.where((p) => p['qualified'] == true).length}',
              ),
            ),
            Chip(
              label: Text(
                'Email permission verified: ${accounts.where((p) => p['emailEligibility'] == 'eligible' && p['doNotContact'] != true).length}',
              ),
            ),
            Chip(
              label: Text(
                'Messages accepted: ${mailbox == null ? 'Not loaded' : ops.where((o) => o['state'] == 'sent').length}',
              ),
            ),
            Chip(
              label: Text(
                'Conversations with replies: ${mailbox == null ? 'Not loaded' : ops.where((o) => (o['replyCount'] ?? 0) > 0).length}',
              ),
            ),
          ],
        ),
        const Text(
          'Current loaded evidence. Research fit does not establish buying intent or permission to email. Provider acceptance does not confirm inbox delivery.',
        ),
      ],
    );
  }
}
