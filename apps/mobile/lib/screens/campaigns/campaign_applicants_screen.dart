import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../services/secure_function_service.dart';

class CampaignApplicantsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const CampaignApplicantsScreen({super.key, required this.campaign});

  CollectionReference<Map<String, dynamic>> get _applicationsCollection {
    return FirebaseFirestore.instance
        .collection('campaigns')
        .doc(campaign.id)
        .collection('applications');
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

        final serviceArea = data['serviceArea'];

        final actualPointCount = serviceArea is List ? serviceArea.length : 0;

        final center = data['serviceAreaCenter'];

        final radius = (data['serviceAreaRadiusMeters'] as num?)?.toDouble();

        final hasValidCircle = center != null && radius != null && radius > 0;

        final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        final isAssigned =
            assignedScalerId != null && assignedScalerId.isNotEmpty;

        final hasUsableMapping =
            (pointCount >= 3 && actualPointCount >= 3) || hasValidCircle;

        return !isAssigned && hasUsableMapping && estimatedHomes > 0;
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

                  final homesLabel = '$estimatedHomes estimated homes';

                  return ListTile(
                    leading: const CircleAvatar(
                      child: Icon(Icons.map_outlined),
                    ),
                    title: Text(
                      zoneName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text('$homesLabel\nRoute not yet verified'),
                    isThreeLine: true,
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

    final latestCampaignSnapshot = await campaign.reference.get();

    if (!latestCampaignSnapshot.exists) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This campaign no longer exists.')),
      );

      return;
    }

    final campaignData =
        latestCampaignSnapshot.data() as Map<String, dynamic>? ?? {};

    final campaignType = campaignData['campaignType']?.toString() ?? '';

    final exactLocationCampaign =
        campaignType == 'yard_sign_installation' ||
        campaignType == 'dump_run' ||
        campaignType == 'event_marketing';

    if (exactLocationCampaign) {
      if (!context.mounted) {
        return;
      }

      await _acceptExactLocationApplicant(
        context,
        application,
        scalerId: scalerId,
        scalerEmail: scalerEmail,
        campaignName: campaignName,
        campaignType: campaignType,
      );

      return;
    }

    if (!context.mounted) {
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
      final requiredScalerCount =
          (selectedZoneData['requiredScalerCount'] as num?)?.round() ?? 1;
      if (requiredScalerCount > 1 &&
          selectedZoneData['groupAssignmentId'] == null) {
        await const SecureFunctionService().call(
          functionName: 'configureZoneGroupAssignment',
          data: {
            'campaignId': campaign.id,
            'zoneId': selectedZone.id,
            'requiredScalerCount': requiredScalerCount,
          },
        );
      }
      await const SecureFunctionService().call(
        functionName: requiredScalerCount > 1
            ? 'acceptZoneGroupSlot'
            : 'assignScalerToZone',
        data: {
          'campaignId': campaign.id,
          'zoneId': selectedZone.id,
          'applicationId': application.id,
        },
      );

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

  Future<void> _acceptExactLocationApplicant(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> application, {
    required String scalerId,
    required String? scalerEmail,
    required String campaignName,
    required String campaignType,
  }) async {
    final firestore = FirebaseFirestore.instance;

    final locationsSnapshot = await firestore
        .collection('campaignLocations')
        .where('campaignId', isEqualTo: campaign.id)
        .get();

    if (!context.mounted) {
      return;
    }

    if (locationsSnapshot.docs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This campaign does not have any configured locations.',
          ),
        ),
      );

      return;
    }

    final unassignedLocations = locationsSnapshot.docs.where((location) {
      final data = location.data();

      final assignedScalerId = data['assignedScalerId']?.toString();

      final status = data['status']?.toString() ?? 'pending';

      return (assignedScalerId == null || assignedScalerId.isEmpty) &&
          status != 'completed' &&
          status != 'cancelled';
    }).toList();

    if (unassignedLocations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('All campaign locations are already assigned.'),
        ),
      );

      return;
    }

    final campaignSnapshot = await campaign.reference.get();

    if (!context.mounted) {
      return;
    }

    if (!campaignSnapshot.exists) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This campaign no longer exists.')),
      );

      return;
    }

    final campaignData = campaignSnapshot.data() as Map<String, dynamic>? ?? {};

    final requestedScalerCount =
        (campaignData['requestedScalerCount'] as num?)?.toInt() ?? 1;

    final acceptedApplicationsSnapshot = await _applicationsCollection
        .where('status', isEqualTo: 'accepted')
        .get();

    if (!context.mounted) {
      return;
    }

    final alreadyAssignedScalers = acceptedApplicationsSnapshot.docs.length;

    final remainingScalerSlots = requestedScalerCount - alreadyAssignedScalers;

    if (remainingScalerSlots <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This campaign already has all requested Scalers assigned.',
          ),
        ),
      );

      return;
    }

    late final List<QueryDocumentSnapshot<Map<String, dynamic>>>
    locationsToAssign;

    if (campaignType == 'dump_run') {
      /*
   * A dump run is one connected job.
   *
   * Pickup and disposal locations must stay
   * with the same Scaler.
   */
      locationsToAssign = unassignedLocations;
    } else {
      final locationsToAssignCount =
          (unassignedLocations.length / remainingScalerSlots).ceil();

      locationsToAssign = unassignedLocations
          .take(locationsToAssignCount)
          .toList();
    }

    final totalQuantity = locationsToAssign.fold<int>(
      0,
      (total, location) =>
          total + ((location.data()['quantity'] as num?)?.toInt() ?? 1),
    );

    String jobLabel;

    switch (campaignType) {
      case 'yard_sign_installation':
        jobLabel = 'yard sign locations';
        break;

      case 'dump_run':
        jobLabel = 'dump run locations';
        break;

      case 'event_marketing':
        jobLabel = 'event marketing locations';
        break;

      default:
        jobLabel = 'campaign locations';
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Assign Scaler'),
          content: Text(
            'Assign ${scalerEmail ?? 'this Scaler'} '
            '${locationsToAssign.length} $jobLabel?\n\n'
            'Total quantity assigned: $totalQuantity',
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

    if (!context.mounted || confirmed != true) {
      return;
    }

    try {
      await firestore.runTransaction((transaction) async {
        final latestApplication = await transaction.get(application.reference);

        final latestCampaign = await transaction.get(campaign.reference);

        if (!latestApplication.exists) {
          throw Exception('This application no longer exists.');
        }

        if (!latestCampaign.exists) {
          throw Exception('This campaign no longer exists.');
        }

        final latestCampaignData =
            latestCampaign.data() as Map<String, dynamic>? ?? {};
        final latestCampaignStatus =
            latestCampaignData['status']?.toString() ?? '';
        if (latestCampaignStatus != 'open') {
          throw Exception(
            'This campaign is no longer accepting Scaler assignments.',
          );
        }

        final latestApplicationData = latestApplication.data()!;

        final applicationStatus =
            latestApplicationData['status']?.toString() ?? 'pending';

        if (applicationStatus != 'pending') {
          throw Exception('This application has already been processed.');
        }

        final claimedLocationIds = <String>[];

        int claimedQuantity = 0;

        for (final location in locationsToAssign) {
          final latestLocation = await transaction.get(location.reference);

          if (!latestLocation.exists) {
            throw Exception('One of the selected locations no longer exists.');
          }

          final locationData = latestLocation.data()!;

          final existingScalerId = locationData['assignedScalerId']?.toString();

          final locationStatus =
              locationData['status']?.toString() ?? 'pending';

          if (existingScalerId != null && existingScalerId.isNotEmpty) {
            continue;
          }

          if (locationStatus == 'completed' || locationStatus == 'cancelled') {
            continue;
          }

          final quantity = (locationData['quantity'] as num?)?.toInt() ?? 1;

          claimedLocationIds.add(location.id);

          claimedQuantity += quantity;

          transaction.update(location.reference, {
            'assignedScalerId': scalerId,
            'assignedScalerEmail': scalerEmail,
            'assignedApplicationId': application.id,
            'status': 'assigned',
            'assignedAt': FieldValue.serverTimestamp(),
            'updatedAt': FieldValue.serverTimestamp(),
          });
        }

        if (claimedLocationIds.isEmpty) {
          throw Exception(
            'The selected locations were assigned by another action. '
            'Please try again.',
          );
        }

        transaction.update(application.reference, {
          'status': 'accepted',
          'assignmentMode': 'exact_locations',
          'assignedCampaignId': campaign.id,
          'assignedLocationIds': claimedLocationIds,
          'assignedLocationCount': claimedLocationIds.length,
          'assignedQuantity': claimedQuantity,
          'acceptedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });

      await _refreshCampaignStaffing();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${scalerEmail ?? 'Scaler'} was assigned '
            '${locationsToAssign.length} locations.',
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
    final campaignSnapshot = await campaign.reference.get();

    if (!campaignSnapshot.exists) {
      return;
    }

    final campaignData = campaignSnapshot.data() as Map<String, dynamic>? ?? {};

    final campaignType = campaignData['campaignType']?.toString() ?? '';

    final exactLocationCampaign =
        campaignType == 'yard_sign_installation' ||
        campaignType == 'dump_run' ||
        campaignType == 'event_marketing';

    if (exactLocationCampaign) {
      final locationsSnapshot = await FirebaseFirestore.instance
          .collection('campaignLocations')
          .where('campaignId', isEqualTo: campaign.id)
          .get();

      int assignableLocations = 0;

      int assignedLocations = 0;

      final assignedScalerIds = <String>{};

      for (final location in locationsSnapshot.docs) {
        final data = location.data();

        final status = data['status']?.toString() ?? 'pending';

        if (status == 'cancelled') {
          continue;
        }

        assignableLocations++;

        final scalerId = data['assignedScalerId']?.toString();

        if (scalerId != null && scalerId.isNotEmpty) {
          assignedLocations++;

          assignedScalerIds.add(scalerId);
        }
      }

      final fullyStaffed =
          assignableLocations > 0 && assignedLocations >= assignableLocations;

      await campaign.reference.update({
        'locationCount': locationsSnapshot.docs.length,

        'assignedLocationCount': assignedLocations,

        'assignedScalerCount': assignedScalerIds.length,

        'staffingStatus': fullyStaffed
            ? 'fully_staffed'
            : assignedLocations > 0
            ? 'partially_staffed'
            : 'unstaffed',

        /*
       * Keep open while unassigned work remains.
       *
       * Once all exact locations are assigned,
       * applications no longer need to be accepted.
       */
        'status': fullyStaffed ? 'accepted' : 'open',

        'staffingUpdatedAt': FieldValue.serverTimestamp(),
      });

      return;
    }

    /*
   * Original mapped-zone staffing workflow.
   */
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
    final campaignData =
        campaign.data() as Map<String, dynamic>? ?? <String, dynamic>{};

    final campaignType = campaignData['campaignType']?.toString() ?? '';

    final exactLocationCampaign =
        campaignType == 'yard_sign_installation' ||
        campaignType == 'dump_run' ||
        campaignType == 'event_marketing';

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
            final aAppliedAt = a.data()['appliedAt'];
            final bAppliedAt = b.data()['appliedAt'];

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

                final scalerIdentity =
                    data['scalerDisplayName']?.toString().trim().isNotEmpty ==
                        true
                    ? data['scalerDisplayName'].toString()
                    : data['scalerName']?.toString().trim().isNotEmpty == true
                    ? data['scalerName'].toString()
                    : data['scalerEmail']?.toString().trim().isNotEmpty == true
                    ? data['scalerEmail'].toString()
                    : 'Scaler applicant';

                final status = data['status']?.toString() ?? 'pending';

                final assignmentMode = data['assignmentMode']?.toString();

                final assignedZoneName = data['assignedZoneName']?.toString();

                final assignedHomes =
                    (data['assignedHomes'] as num?)?.toInt() ?? 0;

                final assignedLocationCount =
                    (data['assignedLocationCount'] as num?)?.toInt() ?? 0;

                final assignedQuantity =
                    (data['assignedQuantity'] as num?)?.toInt() ?? 0;

                final isExactLocationAssignment =
                    assignmentMode == 'exact_locations';

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
                                scalerIdentity,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),

                            Chip(label: Text(_statusLabel(status))),
                          ],
                        ),

                        if (isExactLocationAssignment) ...[
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
                                const Icon(Icons.location_on_outlined),

                                const SizedBox(width: 10),

                                Expanded(
                                  child: Text(
                                    assignedQuantity > 0
                                        ? '$assignedLocationCount assigned '
                                              'location'
                                              '${assignedLocationCount == 1 ? '' : 's'} '
                                              '• $assignedQuantity total quantity'
                                        : '$assignedLocationCount assigned '
                                              'location'
                                              '${assignedLocationCount == 1 ? '' : 's'}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],

                        if (!isExactLocationAssignment &&
                            assignedZoneName != null &&
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
                                  icon: Icon(
                                    exactLocationCampaign
                                        ? Icons.location_on_outlined
                                        : Icons.assignment_ind_outlined,
                                  ),
                                  label: Text(
                                    exactLocationCampaign
                                        ? 'Assign Locations'
                                        : 'Assign Zone',
                                  ),
                                ),
                              ),
                            ],
                          ),

                        if (status == 'accepted')
                          Text(
                            isExactLocationAssignment
                                ? assignedQuantity > 0
                                      ? 'This Scaler is assigned '
                                            '$assignedLocationCount location'
                                            '${assignedLocationCount == 1 ? '' : 's'} '
                                            'with a total quantity of '
                                            '$assignedQuantity.'
                                      : 'This Scaler is assigned '
                                            '$assignedLocationCount location'
                                            '${assignedLocationCount == 1 ? '' : 's'}.'
                                : assignedZoneName == null
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
