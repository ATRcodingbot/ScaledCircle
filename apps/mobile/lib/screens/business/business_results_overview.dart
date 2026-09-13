import 'package:flutter/material.dart';
import '../../models/business_result_summary.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../widgets/campaign_card_header.dart';

/// Read-only outcomes from the same authorized campaign/zone inventory.
/// A planned compensation contract is not treated as approved spend.
class BusinessResultsOverview extends StatelessWidget {
  const BusinessResultsOverview({
    super.key,
    required this.campaigns,
    required this.zones,
  });
  final List<Map<String, dynamic>> campaigns;
  final List<Map<String, dynamic>> zones;
  @override
  Widget build(BuildContext context) {
    final ids = campaigns.map((c) => c['id']).toSet();
    final visibleZones = zones
        .where((z) => ids.contains(z['campaignId']))
        .toList();
    final summary = BusinessResultSummary.fromZones(visibleZones);
    final approved = visibleZones
        .where(
          (z) =>
              BusinessResultSummary.zoneState(z) ==
              BusinessZoneResultState.approved,
        )
        .length;
    final active = campaigns
        .where(
          (c) => const {
            'active',
            'in_progress',
            'published',
            'open',
          }.contains(c['status']),
        )
        .length;
    final completed = campaigns.where((c) => c['status'] == 'completed').length;
    final results = campaigns
        .where((c) => summary.forCampaign(c['id'].toString()).hasResults)
        .toList();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'What happened?',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'Review completed work and evidence. Manage drafts and assignments in Campaigns.',
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final metric in [
              ('Campaigns active', active),
              ('Campaigns completed', completed),
              ('Zones approved', approved),
              ('Zones needing review', summary.awaitingReviewCount),
            ])
              SizedBox(
                width: 240,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(metric.$1),
                        Text(
                          '${metric.$2}',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        const Text(
          'Campaign spend, platform fees, bonuses and lead outcomes: aggregate data not available yet. Review each Job Room for its authoritative compensation and evidence. Accepted budget is not approved spend.',
        ),
        const SizedBox(height: 20),
        Text('Work outcomes', style: Theme.of(context).textTheme.titleLarge),
        if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Text(
              'No work outcomes yet. Submitted and reviewed work will appear here.',
            ),
          ),
        for (final c in results)
          Card(
            child: ExpansionTile(
              title: Text(
                campaignDisplayName(
                  c['campaignName']?.toString() ?? 'Campaign',
                ),
              ),
              subtitle: Text(
                summary.forCampaign(c['id'].toString()).conciseStatus,
              ),
              children: [
                for (final z in visibleZones.where(
                  (z) =>
                      z['campaignId'] == c['id'] &&
                      BusinessResultSummary.zoneState(z) !=
                          BusinessZoneResultState.none,
                ))
                  ListTile(
                    title: Text(
                      z['zoneName']?.toString().trim().isNotEmpty == true
                          ? campaignDisplayName(z['zoneName'].toString())
                          : 'Work evidence',
                    ),
                    subtitle: Text(switch (BusinessResultSummary.zoneState(z)) {
                      BusinessZoneResultState.approved => 'Approved work',
                      BusinessZoneResultState.awaitingReview =>
                        'Awaiting Business review',
                      BusinessZoneResultState.redoRequired =>
                        'Changes requested',
                      BusinessZoneResultState.disputed => 'Under dispute',
                      BusinessZoneResultState.rejected => 'Review history',
                      _ => 'Historical evidence',
                    }),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => AppNavigation.push(
                      context,
                      AppRoutes.jobRoom(z['id'].toString()),
                    ),
                  ),
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Open work evidence to inspect the route, timing, coverage, base, bonus and review result. Route coverage does not prove individual household delivery.',
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
