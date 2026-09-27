import '../../widgets/campaign_list_actions.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'business_results_overview.dart';
import '../../navigation/context_back_button.dart';
import '../../widgets/campaign_card_header.dart';
import '../../services/business_workspace_service.dart';
import '../../services/business_workspace_records.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../models/campaign_card_compensation.dart';
import '../../models/business_result_summary.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../theme/app_theme.dart';

enum BusinessCampaignView { campaigns, results }

class BusinessCampaignsScreen extends StatefulWidget {
  const BusinessCampaignsScreen({
    super.key,
    required this.businessId,
    this.view = BusinessCampaignView.campaigns,
    required this.onCreateCampaign,
  });

  final String businessId;
  final BusinessCampaignView view;
  final VoidCallback onCreateCampaign;

  @override
  State<BusinessCampaignsScreen> createState() =>
      _BusinessCampaignsScreenState();
}

class _BusinessCampaignsScreenState extends State<BusinessCampaignsScreen> {
  bool _archived = false;
  String get businessId => widget.businessId;
  BusinessCampaignView get view => widget.view;
  VoidCallback get onCreateCampaign => widget.onCreateCampaign;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _archived =
        PageStorage.maybeOf(
          context,
        )?.readState(context, identifier: 'campaign-filter-$businessId') ==
        true;
  }

  @override
  void didUpdateWidget(covariant BusinessCampaignsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.businessId != businessId) {
      _archived =
          PageStorage.maybeOf(
            context,
          )?.readState(context, identifier: 'campaign-filter-$businessId') ==
          true;
    }
  }

  void _filter(bool value) {
    setState(() => _archived = value);
    PageStorage.maybeOf(
      context,
    )?.writeState(context, value, identifier: 'campaign-filter-$businessId');
  }

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
    appBar: AuthenticatedAppBar(
      leading: const ContextBackButton(
        fallback: '/business',
        businessOnly: true,
      ),
      title: Text(
        view == BusinessCampaignView.results ? 'Results' : 'Campaigns',
      ),
    ),
    body: StreamBuilder<List<DocumentSnapshot<Map<String, dynamic>>>>(
      key: ValueKey('campaign-list-$businessId'),
      stream: businessWorkspaceRecords(
        FirebaseFirestore.instance,
        'campaigns',
        businessId,
      ),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(
            child: Text("We couldn't load your campaigns. Try again."),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return StreamBuilder<List<DocumentSnapshot<Map<String, dynamic>>>>(
          key: ValueKey('campaign-zones-$businessId'),
          stream: businessWorkspaceRecords(
            FirebaseFirestore.instance,
            'campaignZones',
            businessId,
          ),
          builder: (context, zoneSnapshot) {
            if (zoneSnapshot.hasError) {
              return const Center(
                child: Text(
                  "We couldn't load your campaign results. Try again.",
                ),
              );
            }
            if (!zoneSnapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final resultSummary = BusinessResultSummary.fromZones(
              zoneSnapshot.data!.map((zone) => zone.data()!),
            );
            final docs =
                snapshot.data!.where((doc) {
                  final data = doc.data()!;
                  if (!campaignInList(data, archived: _archived)) {
                    return false;
                  }
                  return view == BusinessCampaignView.campaigns ||
                      resultSummary.forCampaign(doc.id).hasResults;
                }).toList()..sort(
                  (a, b) =>
                      _priority(
                        a.data()!,
                        resultSummary.forCampaign(a.id),
                      ).compareTo(
                        _priority(b.data()!, resultSummary.forCampaign(b.id)),
                      ),
                );

            if (view == BusinessCampaignView.results) {
              return BusinessResultsOverview(
                campaigns: snapshot.data!
                    .where((d) => campaignInList(d.data()!, archived: false))
                    .map((d) => {...d.data()!, 'id': d.id})
                    .toList(),
                zones: zoneSnapshot.data!
                    .map((d) => {...d.data()!, 'id': d.id})
                    .toList(),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: docs.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Manage your campaigns',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const Text(
                        'Create work, manage assignments and review submissions.',
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('Current'),
                            selected: !_archived,
                            onSelected: (_) => _filter(false),
                          ),
                          ChoiceChip(
                            label: const Text('Archived'),
                            selected: _archived,
                            onSelected: (_) => _filter(true),
                          ),
                        ],
                      ),
                      if (docs.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Text(
                            _archived
                                ? 'No archived campaigns'
                                : 'No campaigns yet',
                          ),
                        ),
                      const SizedBox(height: 12),
                      if (BusinessWorkspaceSession.can('campaigns'))
                        FilledButton.icon(
                          key: const Key('campaign-list-create'),
                          onPressed: onCreateCampaign,
                          icon: const Icon(Icons.add),
                          label: const Text('Create Campaign'),
                        ),
                    ],
                  );
                }
                final doc = docs[index - 1];
                final data = doc.data()!;
                final result = resultSummary.forCampaign(doc.id);
                final status =
                    data['status']?.toString().toLowerCase() ?? 'unknown';
                final compensation = CampaignCardCompensation.fromCampaign(
                  data,
                );
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
                          ? campaignDisplayName(data['campaignName'].toString())
                          : 'Untitled Campaign',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Status: ${status.replaceAll('_', ' ')}'),
                        if (data['fundingStatus'] != null)
                          Text(
                            'Funding: ${data['fundingStatus'].toString().replaceAll('_', ' ')}',
                          ),
                        if (location != null && location.isNotEmpty)
                          Text(location),
                        Text(compensation.primaryText),
                        Text(
                          result.needsReview
                              ? 'Next: review the submitted work'
                              : result.hasResults
                              ? result.conciseStatus
                              : 'Open campaign status and next steps',
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    trailing: BusinessWorkspaceSession.can('campaigns')
                        ? CampaignListActions(
                            key: ValueKey('$businessId/${doc.id}'),
                            businessId: businessId,
                            campaignId: doc.id,
                            onManage: () => AppNavigation.push(
                              context,
                              AppRoutes.campaignDetail(doc.id),
                            ),
                          )
                        : const Icon(Icons.chevron_right),
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
