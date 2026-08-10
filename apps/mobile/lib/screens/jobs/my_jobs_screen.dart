import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../scaler/campaigns/exact_location_job_screen.dart';
import '../reviews/create_review_screen.dart';
import 'job_details_screen.dart';

class MyJobsScreen extends StatelessWidget {
  const MyJobsScreen({super.key});

  FirebaseFirestore get _firestore => FirebaseFirestore.instance;

  Future<void> _openBusinessReview(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> campaign,
    String businessId,
  ) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null || businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Business information is unavailable.')),
      );
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateReviewScreen(
          campaignId: campaign.id,
          reviewerId: user.uid,
          reviewerType: 'scaler',
          targetId: businessId,
          targetType: 'business',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in to view your jobs.')),
      );
    }

    return Scaffold(
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _firestore
            .collection('campaignZones')
            .where('assignedScalerId', isEqualTo: user.uid)
            .snapshots(),
        builder: (context, zoneSnapshot) {
          if (zoneSnapshot.hasError) {
            return _errorView(
              'Unable to load assigned zones: ${zoneSnapshot.error}',
            );
          }

          return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _firestore
                .collection('campaignLocations')
                .where('assignedScalerId', isEqualTo: user.uid)
                .snapshots(),
            builder: (context, locationSnapshot) {
              if (locationSnapshot.hasError) {
                return _errorView(
                  'Unable to load assigned locations: '
                  '${locationSnapshot.error}',
                );
              }

              final zonesLoading =
                  zoneSnapshot.connectionState == ConnectionState.waiting &&
                  !zoneSnapshot.hasData;

              final locationsLoading =
                  locationSnapshot.connectionState == ConnectionState.waiting &&
                  !locationSnapshot.hasData;

              if (zonesLoading || locationsLoading) {
                return const Center(child: CircularProgressIndicator());
              }

              final zones = zoneSnapshot.data?.docs ?? [];

              final locations = locationSnapshot.data?.docs ?? [];

              final activeZones = zones.where((zone) {
                final status = zone.data()['status']?.toString() ?? '';

                return _isActiveStatus(status);
              }).toList();

              final completedZones = zones.where((zone) {
                return zone.data()['status']?.toString() == 'completed';
              }).toList();

              activeZones.sort(_sortDocumentsNewestFirst);

              completedZones.sort(_sortDocumentsNewestFirst);

              final exactLocationGroups = _groupLocationsByCampaign(locations);

              final activeExactCampaignIds = <String>[];

              final completedExactCampaignIds = <String>[];

              for (final entry in exactLocationGroups.entries) {
                final campaignLocations = entry.value;

                if (campaignLocations.isEmpty) {
                  continue;
                }

                final allCompleted = campaignLocations.every(
                  (location) =>
                      location.data()['status']?.toString() == 'completed',
                );

                final hasActive = campaignLocations.any((location) {
                  final status = location.data()['status']?.toString() ?? '';

                  return _isActiveStatus(status);
                });

                if (allCompleted) {
                  completedExactCampaignIds.add(entry.key);
                } else if (hasActive) {
                  activeExactCampaignIds.add(entry.key);
                }
              }

              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const Text(
                    'Active Jobs',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 15),

                  if (activeZones.isEmpty && activeExactCampaignIds.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Text(
                          "You don't have any active assigned jobs yet.",
                        ),
                      ),
                    ),

                  ...activeZones.map((zone) => _zoneJobCard(context, zone)),

                  ...activeExactCampaignIds.map(
                    (campaignId) => _exactLocationJobCard(
                      context,
                      campaignId,
                      exactLocationGroups[campaignId] ?? [],
                    ),
                  ),

                  const SizedBox(height: 30),

                  const Text(
                    'Completed Jobs',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 15),

                  if (completedZones.isEmpty &&
                      completedExactCampaignIds.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Text('No completed jobs yet.'),
                      ),
                    ),

                  ...completedZones.map((zone) => _zoneJobCard(context, zone)),

                  ...completedExactCampaignIds.map(
                    (campaignId) => _exactLocationJobCard(
                      context,
                      campaignId,
                      exactLocationGroups[campaignId] ?? [],
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _errorView(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Text(message, textAlign: TextAlign.center),
      ),
    );
  }

  Map<String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>
  _groupLocationsByCampaign(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> locations,
  ) {
    final grouped =
        <String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>{};

    for (final location in locations) {
      final campaignId = location.data()['campaignId']?.toString() ?? '';

      if (campaignId.isEmpty) {
        continue;
      }

      grouped.putIfAbsent(campaignId, () => []);

      grouped[campaignId]!.add(location);
    }

    return grouped;
  }

  bool _isActiveStatus(String status) {
    return status == 'assigned' ||
        status == 'accepted' ||
        status == 'in_progress' ||
        status == 'submitted';
  }

  int _sortDocumentsNewestFirst(
    QueryDocumentSnapshot<Map<String, dynamic>> a,
    QueryDocumentSnapshot<Map<String, dynamic>> b,
  ) {
    final aData = a.data();

    final bData = b.data();

    final aUpdated = aData['updatedAt'];

    final bUpdated = bData['updatedAt'];

    if (aUpdated is Timestamp && bUpdated is Timestamp) {
      return bUpdated.compareTo(aUpdated);
    }

    final aCreated = aData['createdAt'];

    final bCreated = bData['createdAt'];

    if (aCreated is Timestamp && bCreated is Timestamp) {
      return bCreated.compareTo(aCreated);
    }

    return 0;
  }

  Widget _zoneJobCard(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) {
    final zoneData = zone.data();

    final campaignId = zoneData['campaignId']?.toString();

    if (campaignId == null || campaignId.isEmpty) {
      return const Card(
        margin: EdgeInsets.only(bottom: 15),
        child: Padding(
          padding: EdgeInsets.all(18),
          child: Text('This assigned zone is missing its campaign reference.'),
        ),
      );
    }

    final campaignReference = _firestore
        .collection('campaigns')
        .doc(campaignId);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: campaignReference.snapshots(),
      builder: (context, campaignSnapshot) {
        if (campaignSnapshot.hasError) {
          return Card(
            margin: const EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Text(
                'Unable to load campaign: '
                '${campaignSnapshot.error}',
              ),
            ),
          );
        }

        if (!campaignSnapshot.hasData) {
          return const Card(
            margin: EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final campaign = campaignSnapshot.data!;

        if (!campaign.exists) {
          return const Card(
            margin: EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text(
                'This assigned zone belongs to a campaign '
                'that no longer exists.',
              ),
            ),
          );
        }

        final campaignData = campaign.data()!;

        final campaignName =
            campaignData['campaignName']?.toString() ?? 'Untitled Campaign';

        final description = campaignData['description']?.toString() ?? '';

        final businessEmail = campaignData['businessEmail']?.toString() ?? '';
        final businessId = campaignData['businessId']?.toString() ?? '';

        final zoneName = zoneData['zoneName']?.toString() ?? 'Assigned Zone';

        final status = zoneData['status']?.toString() ?? 'assigned';

        final paymentComplete =
            status == 'completed' &&
            (zoneData['paymentStatus']?.toString() == 'paid' ||
                zoneData['paidAt'] is Timestamp);

        final estimatedHomes =
            (zoneData['estimatedHomes'] as num?)?.toInt() ?? 0;

        final walkingMiles = (zoneData['estimatedWalkingMiles'] as num?)
            ?.toDouble();

        final suggestedPay = (zoneData['suggestedBasePay'] as num?)?.toDouble();

        final reviewFeedback = zoneData['reviewFeedback']?.toString();

        final hasChangesRequested =
            status == 'in_progress' &&
            reviewFeedback != null &&
            reviewFeedback.isNotEmpty;

        return Card(
          margin: const EdgeInsets.only(bottom: 15),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => JobDetailsScreen(campaign: campaign),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const CircleAvatar(child: Icon(Icons.map_outlined)),

                      const SizedBox(width: 12),

                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              campaignName,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),

                            const SizedBox(height: 4),

                            Text(
                              zoneName,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),

                            if (businessEmail.isNotEmpty) ...[
                              const SizedBox(height: 3),

                              Text(
                                businessEmail,
                                style: TextStyle(color: Colors.grey.shade700),
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(width: 10),

                      _statusChip(status, hasChangesRequested),
                    ],
                  ),

                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 14),

                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],

                  if (hasChangesRequested) ...[
                    const SizedBox(height: 12),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.orange.shade200),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.feedback_outlined,
                            color: Colors.orange,
                            size: 20,
                          ),

                          const SizedBox(width: 8),

                          Expanded(
                            child: Text(
                              reviewFeedback,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 15),

                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: const Icon(Icons.home_outlined, size: 18),
                        label: Text(
                          estimatedHomes > 0
                              ? '$estimatedHomes Homes'
                              : 'Homes Pending',
                        ),
                      ),

                      if (walkingMiles != null)
                        Chip(
                          avatar: const Icon(Icons.directions_walk, size: 18),
                          label: Text('${walkingMiles.toStringAsFixed(1)} mi'),
                        ),

                      if (suggestedPay != null)
                        Chip(
                          avatar: const Icon(Icons.attach_money, size: 18),
                          label: Text('\$${suggestedPay.toStringAsFixed(0)}'),
                        ),
                    ],
                  ),

                  const SizedBox(height: 10),

                  Align(
                    alignment: Alignment.centerRight,
                    child: Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 8,
                      children: [
                        TextButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    JobDetailsScreen(campaign: campaign),
                              ),
                            );
                          },
                          icon: Icon(
                            hasChangesRequested
                                ? Icons.feedback_outlined
                                : Icons.arrow_forward,
                          ),
                          label: Text(
                            _zoneActionLabel(status, hasChangesRequested),
                          ),
                        ),
                        if (paymentComplete)
                          FilledButton.icon(
                            onPressed: () {
                              _openBusinessReview(
                                context,
                                campaign,
                                businessId,
                              );
                            },
                            icon: const Icon(Icons.star_outline),
                            label: const Text('Leave Review'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _exactLocationJobCard(
    BuildContext context,
    String campaignId,
    List<QueryDocumentSnapshot<Map<String, dynamic>>> locations,
  ) {
    final campaignReference = _firestore
        .collection('campaigns')
        .doc(campaignId);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: campaignReference.snapshots(),
      builder: (context, campaignSnapshot) {
        if (campaignSnapshot.hasError) {
          return Card(
            margin: const EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Text(
                'Unable to load campaign: '
                '${campaignSnapshot.error}',
              ),
            ),
          );
        }

        if (!campaignSnapshot.hasData) {
          return const Card(
            margin: EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final campaign = campaignSnapshot.data!;

        if (!campaign.exists) {
          return const Card(
            margin: EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text(
                'This assigned job belongs to a campaign '
                'that no longer exists.',
              ),
            ),
          );
        }

        final campaignData = campaign.data()!;

        final campaignName =
            campaignData['campaignName']?.toString() ?? 'Untitled Campaign';

        final campaignType = campaignData['campaignType']?.toString() ?? '';

        final description = campaignData['description']?.toString() ?? '';

        final businessEmail = campaignData['businessEmail']?.toString() ?? '';
        final businessId = campaignData['businessId']?.toString() ?? '';

        final totalQuantity = locations.fold<int>(
          0,
          (total, location) =>
              total + ((location.data()['quantity'] as num?)?.toInt() ?? 1),
        );

        final completedLocations = locations.where((location) {
          return location.data()['status']?.toString() == 'completed';
        }).length;

        final allCompleted =
            locations.isNotEmpty && completedLocations == locations.length;

        final paymentComplete = locations.isNotEmpty &&
            locations.every((location) {
              final data = location.data();
              return data['status']?.toString() == 'completed' &&
                  (data['paymentStatus']?.toString() == 'paid' ||
                      data['paidAt'] is Timestamp);
            });

        final hasInProgress = locations.any((location) {
          return location.data()['status']?.toString() == 'in_progress';
        });

        final hasSubmitted = locations.any((location) {
          return location.data()['status']?.toString() == 'submitted';
        });

        final status = allCompleted
            ? 'completed'
            : hasSubmitted
            ? 'submitted'
            : hasInProgress
            ? 'in_progress'
            : 'assigned';

        final typeLabel = _campaignTypeLabel(campaignType);

        return Card(
          margin: const EdgeInsets.only(bottom: 15),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ExactLocationJobScreen(campaign: campaign),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        child: Icon(_campaignTypeIcon(campaignType)),
                      ),

                      const SizedBox(width: 12),

                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              campaignName,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),

                            const SizedBox(height: 4),

                            Text(
                              typeLabel,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),

                            if (businessEmail.isNotEmpty) ...[
                              const SizedBox(height: 3),

                              Text(
                                businessEmail,
                                style: TextStyle(color: Colors.grey.shade700),
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(width: 10),

                      _statusChip(status, false),
                    ],
                  ),

                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 14),

                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],

                  const SizedBox(height: 15),

                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: const Icon(
                          Icons.location_on_outlined,
                          size: 18,
                        ),
                        label: Text(
                          '${locations.length} Location'
                          '${locations.length == 1 ? '' : 's'}',
                        ),
                      ),

                      Chip(
                        avatar: const Icon(
                          Icons.inventory_2_outlined,
                          size: 18,
                        ),
                        label: Text('Quantity $totalQuantity'),
                      ),

                      Chip(
                        avatar: const Icon(
                          Icons.check_circle_outline,
                          size: 18,
                        ),
                        label: Text(
                          '$completedLocations/${locations.length} Complete',
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 10),

                  Align(
                    alignment: Alignment.centerRight,
                    child: Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 8,
                      children: [
                        TextButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    ExactLocationJobScreen(campaign: campaign),
                              ),
                            );
                          },
                          icon: const Icon(Icons.arrow_forward),
                          label: Text(_exactLocationActionLabel(status)),
                        ),
                        if (paymentComplete)
                          FilledButton.icon(
                            onPressed: () {
                              _openBusinessReview(
                                context,
                                campaign,
                                businessId,
                              );
                            },
                            icon: const Icon(Icons.star_outline),
                            label: const Text('Leave Review'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _statusChip(String status, bool hasChangesRequested) {
    return Chip(
      avatar: Icon(
        hasChangesRequested ? Icons.warning_amber_rounded : _statusIcon(status),
        size: 18,
      ),
      label: Text(
        hasChangesRequested ? 'Changes Requested' : _statusLabel(status),
      ),
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'assigned':
      case 'accepted':
        return 'Assigned';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Submitted';

      case 'completed':
        return 'Completed';

      default:
        return status;
    }
  }

  String _zoneActionLabel(String status, bool hasChangesRequested) {
    if (hasChangesRequested) {
      return 'Changes Requested';
    }

    switch (status) {
      case 'assigned':
      case 'accepted':
        return 'Start Zone';

      case 'in_progress':
        return 'Continue Zone';

      case 'submitted':
        return 'View Submission';

      case 'completed':
        return 'View Completed Zone';

      default:
        return 'View Zone';
    }
  }

  String _exactLocationActionLabel(String status) {
    switch (status) {
      case 'assigned':
      case 'accepted':
        return 'Start Job';

      case 'in_progress':
        return 'Continue Job';

      case 'submitted':
        return 'View Submission';

      case 'completed':
        return 'View Completed Job';

      default:
        return 'Open Job';
    }
  }

  String _campaignTypeLabel(String campaignType) {
    switch (campaignType) {
      case 'yard_sign_installation':
        return 'Yard Sign Installation';

      case 'dump_run':
        return 'Dump Run';

      case 'event_marketing':
        return 'Event Marketing';

      default:
        return 'Exact Location Job';
    }
  }

  IconData _campaignTypeIcon(String campaignType) {
    switch (campaignType) {
      case 'yard_sign_installation':
        return Icons.signpost_outlined;

      case 'dump_run':
        return Icons.local_shipping_outlined;

      case 'event_marketing':
        return Icons.event_outlined;

      default:
        return Icons.location_on_outlined;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'assigned':
      case 'accepted':
        return Icons.assignment_turned_in;

      case 'in_progress':
        return Icons.play_circle_outline;

      case 'submitted':
        return Icons.hourglass_top;

      case 'completed':
        return Icons.verified;

      default:
        return Icons.work_outline;
    }
  }
}
