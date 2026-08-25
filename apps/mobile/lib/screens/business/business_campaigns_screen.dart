import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../models/campaign_card_compensation.dart';
import '../../models/business_result_summary.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../theme/app_theme.dart';

enum BusinessCampaignView { campaigns, results }

class BusinessCampaignsScreen extends StatelessWidget {
  const BusinessCampaignsScreen({
    super.key,
    required this.businessId,
    this.view = BusinessCampaignView.campaigns,
    required this.onCreateCampaign,
  });

  final String businessId;
  final BusinessCampaignView view;
  final VoidCallback onCreateCampaign;

  int _priority(
    Map<String, dynamic> data,
    BusinessCampaignResultSummary result,
  ) {
    if (result.needsReview) return 0;
    final status = data['status']?.toString().toLowerCase() ?? '';
    if (!const {'completed', 'cancelled', 'canceled'}.contains(status)) {
      return 1;
    }
    return 2;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        view == BusinessCampaignView.results ? 'Results' : 'Campaigns',
      ),
      actions: [
        if (view == BusinessCampaignView.campaigns)
          TextButton.icon(
            key: const Key('campaign-list-create'),
            onPressed: onCreateCampaign,
            icon: const Icon(Icons.add),
            label: const Text('Create Campaign'),
          ),
      ],
    ),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('campaigns')
          .where('businessId', isEqualTo: businessId)
          .orderBy('createdAt', descending: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(
            child: Text("We couldn't load your campaigns. Try again."),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('campaignZones')
              .where('businessId', isEqualTo: businessId)
              .snapshots(),
          builder: (context, zoneSnapshot) {
            if (zoneSnapshot.hasError) {
              return const Center(
                child: Text("We couldn't load your campaign results. Try again."),
              );
            }
            if (!zoneSnapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final resultSummary = BusinessResultSummary.fromZones(
              zoneSnapshot.data!.docs.map((zone) => zone.data()),
            );
        final docs =
            snapshot.data!.docs.where((doc) {
              final data = doc.data();
              if (data['archived'] == true ||
                  data['hiddenFromBusinessHistory'] == true) {
                return false;
              }
              return view == BusinessCampaignView.campaigns ||
                  resultSummary.forCampaign(doc.id).hasResults;
            }).toList()..sort(
              (a, b) => _priority(
                a.data(),
                resultSummary.forCampaign(a.id),
              ).compareTo(
                _priority(b.data(), resultSummary.forCampaign(b.id)),
              ),
            );

        if (docs.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    view == BusinessCampaignView.results
                        ? Icons.insights_outlined
                        : Icons.campaign_outlined,
                    size: 48,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    view == BusinessCampaignView.results
                        ? 'No campaign results yet'
                        : 'No campaigns yet',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    view == BusinessCampaignView.results
                        ? 'Submitted and completed campaign results will appear here.'
                        : 'Create a campaign when you are ready to reach your next area.',
                    textAlign: TextAlign.center,
                  ),
                  if (view == BusinessCampaignView.campaigns) ...[
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: onCreateCampaign,
                      icon: const Icon(Icons.add),
                      label: const Text('Create Campaign'),
                    ),
                  ],
                ],
              ),
            ),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(20),
          itemCount: docs.length,
          separatorBuilder: (_, _) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            final doc = docs[index];
            final data = doc.data();
            final result = resultSummary.forCampaign(doc.id);
            final status =
                data['status']?.toString().toLowerCase() ?? 'unknown';
            final compensation = CampaignCardCompensation.fromCampaign(data);
            final location =
                data['locationName']?.toString() ??
                data['city']?.toString() ??
                data['countyName']?.toString();
            return Card(
              child: ListTile(
                key: Key('business-campaign-${doc.id}'),
                leading: Icon(
                  result.hasResults
                      ? Icons.insights_outlined
                      : Icons.campaign_outlined,
                ),
                title: Text(
                  data['campaignName']?.toString().trim().isNotEmpty == true
                      ? data['campaignName'].toString()
                      : 'Untitled Campaign',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Status: ${status.replaceAll('_', ' ')}'),
                    if (location != null && location.isNotEmpty) Text(location),
                    Text(compensation.primaryText),
                    Text(
                      result.needsReview
                          ? 'Next: review the submitted work'
                          : result.hasResults
                          ? result.conciseStatus
                          : 'Open campaign status and next steps',
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => AppNavigation.push(
                  context,
                  AppRoutes.campaignDetail(doc.id),
                ),
              ),
            );
          },
        );
          },
        );
      },
    ),
  );
}
