import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../models/campaign_card_compensation.dart';
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

  bool _hasResults(Map<String, dynamic> data) {
    final status = data['status']?.toString().toLowerCase() ?? '';
    return const {
      'submitted',
      'under_review',
      'completed',
      'approved',
      'redo_requested',
    }.contains(status);
  }

  int _priority(Map<String, dynamic> data) {
    final status = data['status']?.toString().toLowerCase() ?? '';
    if (const {
      'submitted',
      'under_review',
      'redo_requested',
    }.contains(status)) {
      return 0;
    }
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
        final docs =
            snapshot.data!.docs.where((doc) {
              final data = doc.data();
              if (data['archived'] == true ||
                  data['hiddenFromBusinessHistory'] == true) {
                return false;
              }
              return view == BusinessCampaignView.campaigns ||
                  _hasResults(data);
            }).toList()..sort(
              (a, b) => _priority(a.data()).compareTo(_priority(b.data())),
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
                  _hasResults(data)
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
                      _priority(data) == 0
                          ? 'Next: review the submitted work'
                          : _hasResults(data)
                          ? 'Open campaign results and history'
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
    ),
  );
}
