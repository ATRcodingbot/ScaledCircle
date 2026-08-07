import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../services/completion_payout_service.dart';
import '../../widgets/zone_intelligence_card.dart';
import 'campaign_area_screen.dart';

class CampaignZonesScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const CampaignZonesScreen({super.key, required this.campaign});

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  Future<String?> _askForZoneName(
    BuildContext context, {
    String initialValue = '',
    String title = 'Create Zone',
    String buttonLabel = 'Continue',
  }) async {
    final controller = TextEditingController(text: initialValue);

    final zoneName = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Zone Name',
              hintText: 'Example: North Neighborhood',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) {
              final value = controller.text.trim();

              if (value.isNotEmpty) {
                Navigator.pop(dialogContext, value);
              }
            },
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final value = controller.text.trim();

                if (value.isEmpty) {
                  return;
                }

                Navigator.pop(dialogContext, value);
              },
              child: Text(buttonLabel),
            ),
          ],
        );
      },
    );

    controller.dispose();

    return zoneName;
  }

  Future<void> _createZone(BuildContext context) async {
    final campaignData = campaign.data() as Map<String, dynamic>;

    final businessId = campaignData['businessId']?.toString();

    if (businessId == null || businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This campaign does not have a business attached.'),
        ),
      );

      return;
    }

    final suggestedName = await _nextSuggestedZoneName();

    if (!context.mounted) {
      return;
    }

    final zoneName = await _askForZoneName(
      context,
      initialValue: suggestedName,
    );

    if (zoneName == null || zoneName.isEmpty) {
      return;
    }

    DocumentReference<Map<String, dynamic>>? zoneReference;

    try {
      zoneReference = _zonesCollection.doc();

      await zoneReference.set({
        'campaignId': campaign.id,
        'businessId': businessId,
        'zoneName': zoneName,
        'shapeType': campaignData['shapeType'] ?? 'polygon',
        'serviceAreaType': campaignData['serviceAreaType'] ?? 'polygon',
        'serviceArea': campaignData['serviceArea'] ?? [],
        'serviceAreaPointCount':
            campaignData['serviceAreaPointCount'] ?? 0,
        'serviceAreaCenter': campaignData['serviceAreaCenter'],
        'serviceAreaRadiusMeters':
            campaignData['serviceAreaRadiusMeters'],
        'estimatedHomes': 0,
        'homeCountStatus': 'pending',
        'homeCountMethod': null,
        'homeCountConfidence': null,
        'homeCountConfidenceScore': null,
        'assignedScalerId': null,
        'assignedScalerEmail': null,
        'status': 'unassigned',
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!context.mounted) {
        return;
      }

      final areaSaved = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignAreaScreen(campaignReference: zoneReference!),
        ),
      );

      if (!context.mounted) {
        return;
      }

      if (areaSaved == true) {
        await zoneReference.update({'updatedAt': FieldValue.serverTimestamp()});

        await _refreshCampaignTotals();

        if (!context.mounted) {
          return;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$zoneName was added to the campaign.')),
        );
      } else {
        final keepDraft = await showDialog<bool>(
          context: context,
          builder: (dialogContext) {
            return AlertDialog(
              title: const Text('Keep Draft Zone?'),
              content: Text(
                '$zoneName does not have a mapped area. Keep it as a draft?',
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(dialogContext, false);
                  },
                  child: const Text('Delete Draft'),
                ),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(dialogContext, true);
                  },
                  child: const Text('Keep Draft'),
                ),
              ],
            );
          },
        );

        if (keepDraft != true) {
          await zoneReference.delete();
        }

        await _refreshCampaignTotals();
      }
    } catch (e) {
      if (zoneReference != null) {
        try {
          final snapshot = await zoneReference.get();

          final data = snapshot.data();

          final pointCount =
              (data?['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

          if (pointCount == 0) {
            await zoneReference.delete();
          }
        } catch (_) {
          // Preserve original exception.
        }
      }

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to create zone: $e')));
    }
  }

  Future<String> _nextSuggestedZoneName() async {
    final snapshot = await _zonesCollection
        .where('campaignId', isEqualTo: campaign.id)
        .get();

    final nextNumber = snapshot.docs.length + 1;

    return 'Zone $nextNumber';
  }

  Future<void> _editZoneArea(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final areaSaved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CampaignAreaScreen(campaignReference: zone.reference),
      ),
    );

    if (areaSaved != true) {
      return;
    }

    await zone.reference.update({'updatedAt': FieldValue.serverTimestamp()});

    await _refreshCampaignTotals();

    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Zone area updated.')));
  }

  Future<void> _renameZone(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final data = zone.data();

    final currentName = data['zoneName']?.toString() ?? 'Zone';

    final newName = await _askForZoneName(
      context,
      initialValue: currentName,
      title: 'Rename Zone',
      buttonLabel: 'Save',
    );

    if (newName == null || newName.isEmpty || newName == currentName) {
      return;
    }

    try {
      await zone.reference.update({
        'zoneName': newName,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Zone renamed.')));
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to rename zone: $e')));
    }
  }

  Future<void> _deleteZone(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final data = zone.data();

    final zoneName = data['zoneName']?.toString() ?? 'this zone';

    final assignedScalerEmail = data['assignedScalerEmail']?.toString();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Delete Zone'),
          content: Text(
            assignedScalerEmail != null && assignedScalerEmail.isNotEmpty
                ? '$zoneName is assigned to $assignedScalerEmail. Delete it anyway?'
                : 'Permanently delete $zoneName?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      await zone.reference.delete();

      await _refreshCampaignTotals();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Zone deleted.')));
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to delete zone: $e')));
    }
  }

  Future<void> _refreshCampaignTotals() async {
    final zonesSnapshot = await _zonesCollection
        .where('campaignId', isEqualTo: campaign.id)
        .get();

    int estimatedHomes = 0;
    int assignedZones = 0;
    int mappedZones = 0;

    double totalWalkingMiles = 0;
    int totalEstimatedMinutes = 0;
    double totalSuggestedPay = 0;
    int totalRecommendedScalers = 0;

    for (final zone in zonesSnapshot.docs) {
      final data = zone.data();

      estimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;

      totalWalkingMiles +=
          (data['estimatedWalkingMiles'] as num?)?.toDouble() ?? 0;

      totalEstimatedMinutes += (data['estimatedMinutes'] as num?)?.toInt() ?? 0;

      totalSuggestedPay += (data['suggestedBasePay'] as num?)?.toDouble() ?? 0;

      totalRecommendedScalers +=
          (data['recommendedScalerCount'] as num?)?.toInt() ?? 0;

      final assignedScalerId = data['assignedScalerId']?.toString();

      if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
        assignedZones++;
      }

      final pointCount = (data['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

      if (pointCount >= 3) {
        mappedZones++;
      }
    }

    await campaign.reference.update({
      'zoneCount': zonesSnapshot.docs.length,
      'mappedZoneCount': mappedZones,
      'estimatedHomes': estimatedHomes,
      'assignedScalerCount': assignedZones,
      'estimatedWalkingMiles': totalWalkingMiles,
      'estimatedMinutes': totalEstimatedMinutes,
      'suggestedBasePayTotal': totalSuggestedPay,
      'recommendedScalerCount': totalRecommendedScalers,
      'zonesUpdatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> _approveZonePayout(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final data = zone.data();

    final zoneName = data['zoneName']?.toString() ?? 'Zone';

    final payoutId = data['pendingPayoutId']?.toString() ?? zone.id;

    final payoutAmount = (data['payoutAmount'] as num?)?.toDouble() ?? 0.0;

    final completionPercentage =
        (data['completionPercentage'] as num?)?.toDouble() ?? 0.0;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Approve Zone Payment'),
          content: Text(
            'Approve $zoneName at '
            '${completionPercentage.toStringAsFixed(1)}% completion '
            'and release \$${payoutAmount.toStringAsFixed(2)} '
            'to the assigned Scaler?',
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
              child: const Text('Approve Payment'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final payoutService = CompletionPayoutService();

      await payoutService.approvePayout(payoutId: payoutId);

      await _refreshCampaignTotals();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$zoneName approved. '
            '\$${payoutAmount.toStringAsFixed(2)} was released to the Scaler wallet.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to approve payment: $e')));
    }
  }

  Future<void> _requestZoneRedo(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final data = zone.data();

    final zoneName = data['zoneName']?.toString() ?? 'Zone';

    final payoutId = data['pendingPayoutId']?.toString() ?? zone.id;

    final controller = TextEditingController();

    final feedback = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Request Redo'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: 'What needs to be completed?',
              hintText: 'Explain what the Scaler needs to redo in $zoneName.',
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final value = controller.text.trim();

                if (value.isEmpty) {
                  return;
                }

                Navigator.pop(dialogContext, value);
              },
              child: const Text('Request Redo'),
            ),
          ],
        );
      },
    );

    controller.dispose();

    if (feedback == null || feedback.isEmpty) {
      return;
    }

    try {
      final payoutService = CompletionPayoutService();

      await payoutService.requestRedo(payoutId: payoutId, feedback: feedback);

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$zoneName was returned to the Scaler for additional work.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to request redo: $e')));
    }
  }

  Future<void> _dropZoneScaler(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final data = zone.data();

    final zoneName = data['zoneName']?.toString() ?? 'Zone';

    final scalerEmail = data['assignedScalerEmail']?.toString();

    final payoutId = data['pendingPayoutId']?.toString() ?? zone.id;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Drop Scaler'),
          content: Text(
            scalerEmail != null && scalerEmail.isNotEmpty
                ? 'Remove $scalerEmail from $zoneName and make the zone unassigned again?'
                : 'Remove the current Scaler from $zoneName and make the zone unassigned again?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Drop Scaler'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final payoutService = CompletionPayoutService();

      await payoutService.dropScaler(payoutId: payoutId);

      await _refreshCampaignTotals();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$zoneName is now unassigned.')));
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to drop Scaler: $e')));
    }
  }

  Widget _submittedZoneReviewCard(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) {
    final data = zone.data();

    final completedHomes = (data['completedHomes'] as num?)?.toInt() ?? 0;

    final assignedHomes =
        (data['assignedHomes'] as num?)?.toInt() ??
        (data['estimatedHomes'] as num?)?.toInt() ??
        0;

    final completionPercentage =
        (data['completionPercentage'] as num?)?.toDouble() ?? 0.0;

    final payoutAmount = (data['payoutAmount'] as num?)?.toDouble() ?? 0.0;

    final routePointCount =
        (data['submittedRoutePointCount'] as num?)?.toInt() ??
        (data['gpsRoutePointCount'] as num?)?.toInt() ??
        0;

    final simulated =
        data['submittedRouteSimulated'] == true ||
        data['gpsRouteSimulated'] == true;

    final eligibleForPayment = data['eligibleForPayment'] == true;

    return Card(
      margin: const EdgeInsets.only(top: 12, bottom: 18),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.fact_check_outlined),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Completion Review',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),

            _reviewMetricRow(
              label: 'Homes Completed',
              value: '$completedHomes / $assignedHomes',
            ),

            const Divider(),

            _reviewMetricRow(
              label: 'Completion',
              value: '${completionPercentage.toStringAsFixed(1)}%',
            ),

            const Divider(),

            _reviewMetricRow(
              label: 'GPS Route Points',
              value: '$routePointCount',
            ),

            const Divider(),

            _reviewMetricRow(
              label: 'Proposed Payout',
              value: '\$${payoutAmount.toStringAsFixed(2)}',
            ),

            const SizedBox(height: 16),

            if (simulated)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade300),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.science_outlined, color: Colors.orange),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'TEST ROUTE: This GPS route was generated with the development simulation tool.',
                      ),
                    ),
                  ],
                ),
              ),

            if (simulated) const SizedBox(height: 14),

            if (!eligibleForPayment)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'This submission is below the minimum completion requirement for payment.',
                ),
              ),

            const SizedBox(height: 18),

            if (eligibleForPayment)
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    _approveZonePayout(context, zone);
                  },
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('Approve Payment'),
                ),
              ),

            if (eligibleForPayment) const SizedBox(height: 10),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                onPressed: () {
                  _requestZoneRedo(context, zone);
                },
                icon: const Icon(Icons.replay),
                label: const Text('Request Redo'),
              ),
            ),

            const SizedBox(height: 10),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                onPressed: () {
                  _dropZoneScaler(context, zone);
                },
                icon: const Icon(Icons.person_remove_outlined),
                label: const Text('Drop Scaler'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reviewMetricRow({required String label, required String value}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            value,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Future<void> _showZoneActions(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.edit_location_alt_outlined),
                title: const Text('Edit Zone Map'),
                onTap: () {
                  Navigator.pop(sheetContext, 'map');
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Rename Zone'),
                onTap: () {
                  Navigator.pop(sheetContext, 'rename');
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: const Text(
                  'Delete Zone',
                  style: TextStyle(color: Colors.red),
                ),
                onTap: () {
                  Navigator.pop(sheetContext, 'delete');
                },
              ),
            ],
          ),
        );
      },
    );

    if (!context.mounted) {
      return;
    }

    switch (selected) {
      case 'map':
        await _editZoneArea(context, zone);
        break;

      case 'rename':
        await _renameZone(context, zone);
        break;

      case 'delete':
        await _deleteZone(context, zone);
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaign Zones'),
        centerTitle: true,
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context, true);
            },
            child: const Text('Done'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          _createZone(context);
        },
        icon: const Icon(Icons.add_location_alt),
        label: const Text('Add Zone'),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _zonesCollection
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

          final zones = List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(
            snapshot.data?.docs ?? [],
          );

          zones.sort((a, b) {
            final aData = a.data();

            final bData = b.data();

            final aCreated = aData['createdAt'];

            final bCreated = bData['createdAt'];

            if (aCreated is Timestamp && bCreated is Timestamp) {
              return aCreated.compareTo(bCreated);
            }

            return (aData['zoneName']?.toString() ?? '').compareTo(
              bData['zoneName']?.toString() ?? '',
            );
          });

          int totalEstimatedHomes = 0;
          int assignedZones = 0;
          int mappedZones = 0;
          double totalWalkingMiles = 0;
          int totalMinutes = 0;

          for (final zone in zones) {
            final data = zone.data();

            totalEstimatedHomes +=
                (data['estimatedHomes'] as num?)?.toInt() ?? 0;

            totalWalkingMiles +=
                (data['estimatedWalkingMiles'] as num?)?.toDouble() ?? 0;

            totalMinutes += (data['estimatedMinutes'] as num?)?.toInt() ?? 0;

            final assignedScalerId = data['assignedScalerId']?.toString();

            if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
              assignedZones++;
            }

            final pointCount =
                (data['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

            if (pointCount >= 3) {
              mappedZones++;
            }
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
            children: [
              const Text(
                'Campaign Zone Manager',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              const Text(
                'Divide the campaign into individual work areas. Each zone receives its own workload estimate, Scaler assignment, GPS route, and completion status.',
              ),

              const SizedBox(height: 22),

              Row(
                children: [
                  Expanded(
                    child: _summaryCard(
                      icon: Icons.map_outlined,
                      value: '${zones.length}',
                      label: 'Zones',
                    ),
                  ),

                  const SizedBox(width: 10),

                  Expanded(
                    child: _summaryCard(
                      icon: Icons.location_on_outlined,
                      value: '$mappedZones',
                      label: 'Mapped',
                    ),
                  ),

                  const SizedBox(width: 10),

                  Expanded(
                    child: _summaryCard(
                      icon: Icons.person_outline,
                      value: '$assignedZones',
                      label: 'Assigned',
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 10),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      _campaignMetricRow(
                        icon: Icons.home_work_outlined,
                        label: 'Estimated Homes',
                        value: totalEstimatedHomes > 0
                            ? '$totalEstimatedHomes'
                            : 'Pending',
                      ),
                      const Divider(),
                      _campaignMetricRow(
                        icon: Icons.directions_walk,
                        label: 'Estimated Walking Distance',
                        value: totalWalkingMiles > 0
                            ? '${totalWalkingMiles.toStringAsFixed(1)} miles'
                            : 'Pending',
                      ),
                      const Divider(),
                      _campaignMetricRow(
                        icon: Icons.schedule,
                        label: 'Estimated Campaign Time',
                        value: totalMinutes > 0
                            ? _formatDuration(totalMinutes)
                            : 'Pending',
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 22),

              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Zone Intelligence',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Text('${zones.length} total'),
                ],
              ),

              const SizedBox(height: 12),

              if (zones.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const Icon(Icons.add_location_alt_outlined, size: 54),
                        const SizedBox(height: 12),
                        const Text(
                          'No zones yet',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Add the first canvassing zone for this campaign.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 18),
                        ElevatedButton.icon(
                          onPressed: () {
                            _createZone(context);
                          },
                          icon: const Icon(Icons.add_location_alt),
                          label: const Text('Create First Zone'),
                        ),
                      ],
                    ),
                  ),
                ),

              ...zones.map((zone) {
                final data = zone.data();

                final zoneName = data['zoneName']?.toString() ?? 'Unnamed Zone';

                final zoneStatus = data['status']?.toString() ?? 'unassigned';

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: IconButton(
                        tooltip: 'Zone options',
                        onPressed: () {
                          _showZoneActions(context, zone);
                        },
                        icon: const Icon(Icons.more_horiz),
                      ),
                    ),

                    ZoneIntelligenceCard(
                      zoneName: zoneName,
                      data: data,
                      onTap: () {
                        _editZoneArea(context, zone);
                      },
                    ),

                    if (zoneStatus == 'submitted')
                      _submittedZoneReviewCard(context, zone),
                  ],
                );
              }),
            ],
          );
        },
      ),
    );
  }

  Widget _summaryCard({
    required IconData icon,
    required String value,
    required String label,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        child: Column(
          children: [
            Icon(icon),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
            ),
            Text(label, style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _campaignMetricRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(icon),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  String _formatDuration(int minutes) {
    if (minutes < 60) {
      return '$minutes min';
    }

    final hours = minutes ~/ 60;

    final remainingMinutes = minutes % 60;

    if (remainingMinutes == 0) {
      return '$hours hr';
    }

    return '$hours hr $remainingMinutes min';
  }
}
