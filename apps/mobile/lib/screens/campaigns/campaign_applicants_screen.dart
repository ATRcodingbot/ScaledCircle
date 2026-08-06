import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class CampaignApplicantsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const CampaignApplicantsScreen({super.key, required this.campaign});

  CollectionReference<Map<String, dynamic>> get _applicationsCollection {
    return FirebaseFirestore.instance.collection('applications');
  }

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  Future<QueryDocumentSnapshot<Map<String, dynamic>>?> _chooseAvailableZone(
    BuildContext context,
  ) async {
    try {
      final snapshot = await _zonesCollection
          .where('campaignId', isEqualTo: campaign.id)
          .get();

      final availableZones = snapshot.docs.where((zone) {
        final data = zone.data();

        final assignedScalerId = data['assignedScalerId']?.toString();

        final pointCount =
            (data['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

        final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        final isAssigned =
            assignedScalerId != null && assignedScalerId.isNotEmpty;

        return !isAssigned && pointCount >= 3 && estimatedHomes > 0;
      }).toList();

      availableZones.sort((a, b) {
        final aName = a.data()['zoneName']?.toString() ?? '';

        final bName = b.data()['zoneName']?.toString() ?? '';

        return aName.compareTo(bName);
      });

      if (!context.mounted) {
        return null;
      }

      if (availableZones.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'There are no mapped, analyzed, unassigned zones available.',
            ),
          ),
        );

        return null;
      }

      return showDialog<QueryDocumentSnapshot<Map<String, dynamic>>>(
        context: context,
        builder: (dialogContext) {
          return AlertDialog(
            title: const Text('Assign a Zone'),
            content: SizedBox(
              width: 420,
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: availableZones.length,
                separatorBuilder: (context, index) {
                  return const Divider();
                },
                itemBuilder: (context, index) {
                  final zone = availableZones[index];

                  final data = zone.data();

                  final zoneName =
                      data['zoneName']?.toString() ?? 'Unnamed Zone';

                  final estimatedHomes =
                      (data['estimatedHomes'] as num?)?.toInt() ?? 0;

                  final walkingMiles = (data['estimatedWalkingMiles'] as num?)
                      ?.toDouble();

                  final homesLabel = '$estimatedHomes estimated homes';

                  final distanceLabel = walkingMiles == null
                      ? null
                      : '${walkingMiles.toStringAsFixed(1)} estimated miles';

                  return ListTile(
                    leading: const CircleAvatar(
                      child: Icon(Icons.map_outlined),
                    ),
                    title: Text(
                      zoneName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text(
                      distanceLabel == null
                          ? homesLabel
                          : '$homesLabel\n$distanceLabel',
                    ),
                    isThreeLine: distanceLabel != null,
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.pop(dialogContext, zone);
                    },
                  );
                },
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(dialogContext);
                },
                child: const Text('Cancel'),
              ),
            ],
          );
        },
      );
    } catch (e) {
      if (!context.mounted) {
        return null;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to load available zones: $e')),
      );

      return null;
    }
  }

  Future<void> _acceptApplicant(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> application,
  ) async {
    final applicationData = application.data();

    final scalerId = applicationData['scalerId']?.toString();

    final scalerEmail = applicationData['scalerEmail']?.toString();

    final campaignName =
        applicationData['campaignName']?.toString() ?? 'this campaign';

    if (scalerId == null || scalerId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This application is missing a Scaler ID.'),
        ),
      );

      return;
    }

    final selectedZone = await _chooseAvailableZone(context);

    if (selectedZone == null || !context.mounted) {
      return;
    }

    final selectedZoneData = selectedZone.data();

    final zoneName =
        selectedZoneData['zoneName']?.toString() ?? 'Selected Zone';

    final selectedEstimatedHomes =
        (selectedZoneData['estimatedHomes'] as num?)?.toInt() ?? 0;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Assign Scaler'),
          content: Text(
            'Assign ${scalerEmail ?? 'this Scaler'} '
            'to $zoneName with '
            '$selectedEstimatedHomes homes?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Assign'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final firestore = FirebaseFirestore.instance;

      await firestore.runTransaction((transaction) async {
        final latestApplication = await transaction.get(application.reference);

        final latestZone = await transaction.get(selectedZone.reference);

        final latestCampaign = await transaction.get(campaign.reference);

        if (!latestApplication.exists) {
          throw Exception('This application no longer exists.');
        }

        if (!latestZone.exists) {
          throw Exception('The selected zone no longer exists.');
        }

        if (!latestCampaign.exists) {
          throw Exception('This campaign no longer exists.');
        }

        final latestApplicationData = latestApplication.data()!;

        final applicationStatus =
            latestApplicationData['status']?.toString() ?? 'pending';

        if (applicationStatus != 'pending') {
          throw Exception('This application has already been processed.');
        }

        final latestZoneData = latestZone.data()!;

        final assignedScalerId = latestZoneData['assignedScalerId']?.toString();

        if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
          throw Exception('This zone has already been assigned.');
        }

        final mappedPointCount =
            (latestZoneData['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

        if (mappedPointCount < 3) {
          throw Exception('This zone does not have a completed map.');
        }

        final assignedHomes =
            (latestZoneData['estimatedHomes'] as num?)?.toInt() ?? 0;

        if (assignedHomes <= 0) {
          throw Exception('This zone does not have a valid home estimate yet.');
        }

        transaction.update(application.reference, {
          'status': 'accepted',
          'assignedZoneId': selectedZone.id,
          'assignedZoneName': zoneName,

          // Snapshot the workload the Scaler accepted.
          'assignedHomes': assignedHomes,

          'acceptedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });

        transaction.update(selectedZone.reference, {
          'assignedScalerId': scalerId,
          'assignedScalerEmail': scalerEmail,
          'assignedApplicationId': application.id,

          // Freeze the workload at assignment time.
          'assignedHomes': assignedHomes,

          'assignedHomeCountSource': 'estimatedHomes',

          'assignedHomeCountLockedAt': FieldValue.serverTimestamp(),

          'status': 'assigned',

          'assignedAt': FieldValue.serverTimestamp(),

          'updatedAt': FieldValue.serverTimestamp(),
        });

        final notificationReference = firestore
            .collection('notifications')
            .doc();

        transaction.set(notificationReference, {
          'userId': scalerId,
          'type': 'application_accepted',
          'title': 'Zone Assignment Accepted',
          'message':
              'You were assigned to $zoneName '
              'for $campaignName. '
              '$assignedHomes homes are assigned.',
          'campaignId': campaign.id,
          'campaignName': campaignName,
          'zoneId': selectedZone.id,
          'zoneName': zoneName,
          'assignedHomes': assignedHomes,
          'read': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      });

      await _refreshCampaignStaffing();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${scalerEmail ?? 'Scaler'} was assigned to '
            '$zoneName with $selectedEstimatedHomes homes.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to assign applicant: $e')));
    }
  }

  Future<void> _rejectApplicant(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> application,
  ) async {
    final applicationData = application.data();

    final scalerId = applicationData['scalerId']?.toString();

    final campaignName =
        applicationData['campaignName']?.toString() ?? 'this campaign';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Reject Application'),
          content: const Text('Reject this Scaler’s application?'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Reject'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final firestore = FirebaseFirestore.instance;

      final batch = firestore.batch();

      batch.update(application.reference, {
        'status': 'rejected',
        'rejectedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (scalerId != null && scalerId.isNotEmpty) {
        final notificationReference = firestore
            .collection('notifications')
            .doc();

        batch.set(notificationReference, {
          'userId': scalerId,
          'type': 'application_rejected',
          'title': 'Application Update',
          'message': 'Your application for $campaignName was not selected.',
          'campaignId': campaign.id,
          'campaignName': campaignName,
          'read': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Application rejected.')));
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to reject applicant: $e')));
    }
  }

  Future<void> _refreshCampaignStaffing() async {
    final zonesSnapshot = await _zonesCollection
        .where('campaignId', isEqualTo: campaign.id)
        .get();

    int mappedZones = 0;
    int assignedZones = 0;

    for (final zone in zonesSnapshot.docs) {
      final data = zone.data();

      final pointCount = (data['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

      if (pointCount < 3) {
        continue;
      }

      mappedZones++;

      final assignedScalerId = data['assignedScalerId']?.toString();

      if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
        assignedZones++;
      }
    }

    final allMappedZonesAssigned =
        mappedZones > 0 && assignedZones >= mappedZones;

    await campaign.reference.update({
      'zoneCount': zonesSnapshot.docs.length,
      'mappedZoneCount': mappedZones,
      'assignedScalerCount': assignedZones,
      'staffingStatus': allMappedZonesAssigned
          ? 'fully_staffed'
          : assignedZones > 0
          ? 'partially_staffed'
          : 'unstaffed',
      'status': allMappedZonesAssigned ? 'accepted' : 'open',
      'staffingUpdatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaign Applicants'),
        centerTitle: true,
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _applicationsCollection
            .where('campaignId', isEqualTo: campaign.id)
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

          final applications =
              List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(
                snapshot.data?.docs ?? [],
              );

          applications.sort((a, b) {
            final aData = a.data();

            final bData = b.data();

            final aAppliedAt = aData['appliedAt'];

            final bAppliedAt = bData['appliedAt'];

            if (aAppliedAt is Timestamp && bAppliedAt is Timestamp) {
              return aAppliedAt.compareTo(bAppliedAt);
            }

            return 0;
          });

          if (applications.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'No Scalers have applied yet.',
                  style: TextStyle(fontSize: 18),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          final pendingCount = applications.where((application) {
            return application.data()['status']?.toString() == 'pending';
          }).length;

          final acceptedCount = applications.where((application) {
            return application.data()['status']?.toString() == 'accepted';
          }).length;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                '${applications.length} '
                'Applicant${applications.length == 1 ? '' : 's'}',
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 8),

              Text(
                '$pendingCount pending • '
                '$acceptedCount assigned',
              ),

              const SizedBox(height: 20),

              ...applications.map((application) {
                final data = application.data();

                final scalerEmail =
                    data['scalerEmail']?.toString() ?? 'Unknown Scaler';

                final status = data['status']?.toString() ?? 'pending';

                final assignedZoneName = data['assignedZoneName']?.toString();

                final assignedHomes =
                    (data['assignedHomes'] as num?)?.toInt() ?? 0;

                return Card(
                  margin: const EdgeInsets.only(bottom: 15),
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const CircleAvatar(child: Icon(Icons.person)),

                            const SizedBox(width: 12),

                            Expanded(
                              child: Text(
                                scalerEmail,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),

                            Chip(label: Text(_statusLabel(status))),
                          ],
                        ),

                        if (assignedZoneName != null &&
                            assignedZoneName.isNotEmpty) ...[
                          const SizedBox(height: 14),

                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.map_outlined),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    assignedHomes > 0
                                        ? 'Assigned to '
                                              '$assignedZoneName • '
                                              '$assignedHomes homes'
                                        : 'Assigned to '
                                              '$assignedZoneName',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],

                        const SizedBox(height: 16),

                        if (status == 'pending')
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () {
                                    _rejectApplicant(context, application);
                                  },
                                  icon: const Icon(Icons.close),
                                  label: const Text('Reject'),
                                ),
                              ),

                              const SizedBox(width: 12),

                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: () {
                                    _acceptApplicant(context, application);
                                  },
                                  icon: const Icon(
                                    Icons.assignment_ind_outlined,
                                  ),
                                  label: const Text('Assign Zone'),
                                ),
                              ),
                            ],
                          ),

                        if (status == 'accepted')
                          Text(
                            assignedZoneName == null
                                ? 'This Scaler was accepted.'
                                : assignedHomes > 0
                                ? 'This Scaler is assigned to '
                                      '$assignedZoneName with '
                                      '$assignedHomes homes.'
                                : 'This Scaler is assigned to '
                                      '$assignedZoneName.',
                          ),

                        if (status == 'rejected')
                          const Text('This application was not selected.'),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }

  static String _statusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Pending';

      case 'accepted':
        return 'Assigned';

      case 'rejected':
        return 'Rejected';

      default:
        return status;
    }
  }
}
