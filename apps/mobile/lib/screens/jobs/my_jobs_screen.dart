import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'job_details_screen.dart';

class MyJobsScreen extends StatelessWidget {
  const MyJobsScreen({super.key});

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
        stream: FirebaseFirestore.instance
            .collection('campaignZones')
            .where('assignedScalerId', isEqualTo: user.uid)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  snapshot.error.toString(),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final zones = snapshot.data?.docs ?? [];

          final activeZones = zones.where((zone) {
            final data = zone.data();

            final status = data['status']?.toString() ?? '';

            return status == 'assigned' ||
                status == 'accepted' ||
                status == 'in_progress' ||
                status == 'submitted';
          }).toList();

          final completedZones = zones.where((zone) {
            final data = zone.data();

            return data['status']?.toString() == 'completed';
          }).toList();

          activeZones.sort(_sortZonesNewestFirst);

          completedZones.sort(_sortZonesNewestFirst);

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Active Jobs',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 15),

              if (activeZones.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      "You don't have any active assigned zones yet.",
                    ),
                  ),
                ),

              ...activeZones.map((zone) => _zoneJobCard(context, zone)),

              const SizedBox(height: 30),

              const Text(
                'Completed Jobs',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 15),

              if (completedZones.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('No completed zones yet.'),
                  ),
                ),

              ...completedZones.map((zone) => _zoneJobCard(context, zone)),
            ],
          );
        },
      ),
    );
  }

  int _sortZonesNewestFirst(
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
      return Card(
        margin: const EdgeInsets.only(bottom: 15),
        child: const Padding(
          padding: EdgeInsets.all(18),
          child: Text('This assigned zone is missing its campaign reference.'),
        ),
      );
    }

    final campaignReference = FirebaseFirestore.instance
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
              child: Text('Unable to load campaign: ${campaignSnapshot.error}'),
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
          return Card(
            margin: const EdgeInsets.only(bottom: 15),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Text(
                '${zoneData['zoneName'] ?? 'Assigned Zone'} belongs to a campaign that no longer exists.',
              ),
            ),
          );
        }

        final campaignData = campaign.data()!;

        final campaignName =
            campaignData['campaignName']?.toString() ?? 'Untitled Campaign';

        final description = campaignData['description']?.toString() ?? '';

        final businessEmail = campaignData['businessEmail']?.toString() ?? '';

        final zoneName = zoneData['zoneName']?.toString() ?? 'Assigned Zone';

        final status = zoneData['status']?.toString() ?? 'assigned';

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
                    child: TextButton.icon(
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
                      label: Text(_actionLabel(status, hasChangesRequested)),
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

  String _actionLabel(String status, bool hasChangesRequested) {
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
