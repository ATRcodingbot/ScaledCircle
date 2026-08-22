import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../jobs/job_room_screen.dart';

import '../../services/completion_payout_service.dart';
import '../../widgets/zone_intelligence_card.dart';
import 'campaign_area_screen.dart';

bool campaignZonesCanContinue(Iterable<Map<String, dynamic>> zones) {
  return zones.any(
    (zone) => ((zone['serviceAreaPointCount'] as num?)?.toInt() ?? 0) >= 3,
  );
}

const int productionMaximumZonesPerCampaign = 1;

bool campaignCanAddZone(
  int persistedZoneCount, {
  int maximumZones = productionMaximumZonesPerCampaign,
}) => persistedZoneCount < maximumZones;

class CampaignZonesScreen extends StatelessWidget {
  final DocumentSnapshot campaign;
  final bool startWithAreaBuilder;

  const CampaignZonesScreen({
    super.key,
    required this.campaign,
    this.startWithAreaBuilder = false,
  });

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  bool get _campaignLocked {
    final data = campaign.data() as Map<String, dynamic>?;
    final status = data?['status']?.toString() ?? 'draft';
    return status != 'draft';
  }

  bool get _hasTransferredAnalysisArea {
    final data = campaign.data() as Map<String, dynamic>?;
    return data?['propertyIntelligenceAnalysisId'] != null &&
        _serviceAreaBoundary.length >= 3;
  }

  List<Map<String, dynamic>> get _serviceAreaBoundary {
    final data = campaign.data() as Map<String, dynamic>?;
    final points = data?['serviceArea'];
    if (points is! List) return const [];
    return points
        .whereType<Map>()
        .map((point) => Map<String, dynamic>.from(point))
        .toList();
  }

  String get _serviceAreaName {
    final data = campaign.data() as Map<String, dynamic>?;
    final name = data?['serviceAreaTemplateName']?.toString().trim();
    return name == null || name.isEmpty ? 'your selected Service Area' : name;
  }

  int? get _materialQuantity {
    final data = campaign.data() as Map<String, dynamic>?;
    return (data?['materialQuantity'] as num?)?.toInt();
  }

  Future<void> _retryZoneAnalysis(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final callable = FirebaseFunctions.instanceFor(
        region: 'us-east1',
      ).httpsCallable('analyzeCampaignZone');
      await callable.call({'zoneId': zone.id});
      messenger.showSnackBar(
        const SnackBar(content: Text('Zone analysis updated.')),
      );
    } on FirebaseFunctionsException catch (error) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            error.message ?? 'Zone analysis could not be updated right now.',
          ),
        ),
      );
    }
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

  Future<void> _createZone(
    BuildContext context, {
    bool skipNamePrompt = false,
  }) async {
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

    final suggestedName = _hasTransferredAnalysisArea
        ? 'Property Intelligence Area'
        : await _nextSuggestedZoneName();

    if (!context.mounted) {
      return;
    }

    final zoneName = skipNamePrompt
        ? suggestedName
        : await _askForZoneName(context, initialValue: suggestedName);

    if (zoneName == null || zoneName.isEmpty) {
      return;
    }

    DocumentReference<Map<String, dynamic>>? zoneReference;

    try {
      zoneReference = _zonesCollection.doc();

      final pendingZoneData = <String, dynamic>{
        'campaignId': campaign.id,
        'businessId': businessId,
        'zoneName': zoneName,
        'assignedScalerId': null,
        'status': 'unassigned',
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (!context.mounted) {
        return;
      }

      final areaSaved = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignAreaScreen(
            campaignReference: zoneReference!,
            pendingZoneData: pendingZoneData,
            searchBoundary: _serviceAreaBoundary,
            materialQuantity: _materialQuantity,
          ),
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

        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('✓ Target saved — $zoneName')));
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

      debugPrint('Campaign zone creation failed: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't save this campaign area.")),
      );
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
    final latestZone = await zone.reference.get();
    if (!context.mounted) {
      return;
    }

    final assignedScalerId = latestZone.data()?['assignedScalerId']?.toString();

    if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Remove the Scaler assignment before changing this zone map.',
          ),
        ),
      );

      return;
    }

    final areaSaved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CampaignAreaScreen(
          campaignReference: zone.reference,
          materialQuantity: _materialQuantity,
        ),
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

    for (final zone in zonesSnapshot.docs) {
      final data = zone.data();

      estimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;

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

    final isGroup = data['groupAssignmentId'] != null;
    final workerPayAllocatedCents = (data['workerPayAllocatedCents'] as num?)
        ?.round();
    final workerPoolCents = (data['workerPoolCents'] as num?)?.round();

    final completionPercentage =
        (data['completionPercentage'] as num?)?.toDouble() ?? 0.0;

    final displayedGroupAllocationCents =
        workerPayAllocatedCents ??
        (completionPercentage >= 75 ? workerPoolCents : null);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final campaignData =
            (campaign.data() as Map<String, dynamic>?) ?? <String, dynamic>{};
        final availableBonus =
            (data['availableBonus'] as num?)?.toDouble() ??
            (campaignData['bonus'] as num?)?.toDouble() ??
            0.0;
        final bonusEarnedAutomatically = completionPercentage >= 95.0;
        final basePayout = _contractBasePayout(completionPercentage);
        var releaseBonus = bonusEarnedAutomatically && availableBonus > 0.0;

        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            final approvalTotal =
                basePayout + (releaseBonus ? availableBonus : 0.0);

            return AlertDialog(
              title: const Text('Approve Zone Payment'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Approve $zoneName at '
                      '${completionPercentage.toStringAsFixed(1)}% completion.',
                    ),
                    if (isGroup) ...[
                      const SizedBox(height: 12),
                      _reviewMetricRow(
                        label: 'Verified completion',
                        value: '${completionPercentage.toStringAsFixed(1)}%',
                      ),
                      _reviewMetricRow(
                        label: 'Completion classification',
                        value: completionPercentage >= 100
                            ? 'Full verified completion'
                            : completionPercentage >= 75
                            ? 'Substantial verified completion'
                            : 'Incomplete / support review',
                      ),
                      if (displayedGroupAllocationCents != null)
                        _reviewMetricRow(
                          label: workerPayAllocatedCents == null
                              ? 'Proposed worker pay allocation'
                              : 'Worker pay allocated',
                          value:
                              '\$${(displayedGroupAllocationCents / 100).toStringAsFixed(2)}',
                        ),
                      const Text(
                        'Worker settlement does not change the evidence-based completion percentage.',
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (!isGroup)
                      _reviewMetricRow(
                        label: 'Base payment',
                        value: '\$${basePayout.toStringAsFixed(2)}',
                      ),
                    if (!isGroup && availableBonus > 0.0) ...[
                      const SizedBox(height: 8),
                      if (bonusEarnedAutomatically)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(
                            Icons.verified,
                            color: Colors.green,
                          ),
                          title: Text(
                            'Earned completion bonus '
                            '(\$${availableBonus.toStringAsFixed(2)})',
                          ),
                          subtitle: const Text(
                            '95% or greater completion earns the bonus automatically under platform rules.',
                          ),
                        )
                      else
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Release discretionary bonus '
                            '(\$${availableBonus.toStringAsFixed(2)})',
                          ),
                          subtitle: const Text(
                            'The route is below 95%. You may still release the bonus after reviewing possible GPS lag or other evidence.',
                          ),
                          value: releaseBonus,
                          onChanged: (value) {
                            setDialogState(() {
                              releaseBonus = value;
                            });
                          },
                        ),
                    ],
                    if (!isGroup) ...[
                      const Divider(height: 24),
                      _reviewMetricRow(
                        label: 'Total to release',
                        value: '\$${approvalTotal.toStringAsFixed(2)}',
                      ),
                    ],
                  ],
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
                    Navigator.pop(dialogContext, releaseBonus);
                  },
                  child: const Text('Approve Payment'),
                ),
              ],
            );
          },
        );
      },
    );

    if (confirmed == null) {
      return;
    }

    try {
      final payoutService = CompletionPayoutService();

      final approval = isGroup
          ? await payoutService.approveGroupSettlement(zoneId: zone.id)
          : await payoutService.approvePayout(
              payoutId: payoutId,
              releaseBonus: confirmed,
            );

      final releasedAmount =
          (approval['amount'] as num?)?.toDouble() ?? payoutAmount;
      final releasedBonus = (approval['bonus'] as num?)?.toDouble() ?? 0.0;

      await _refreshCampaignTotals();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isGroup
                ? '$zoneName group settlement was reserved from the funded worker pool.'
                : '$zoneName approved. '
                      '\$${releasedAmount.toStringAsFixed(2)} was released to the Scaler wallet'
                      '${releasedBonus > 0.0 ? ' including a \$${releasedBonus.toStringAsFixed(2)} bonus' : ''}.',
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

    final campaignData =
        (campaign.data() as Map<String, dynamic>?) ?? <String, dynamic>{};

    final availableBonus =
        (data['availableBonus'] as num?)?.toDouble() ??
        (campaignData['bonus'] as num?)?.toDouble() ??
        0.0;

    final basePayout = _contractBasePayout(completionPercentage);

    final routePointCount =
        (data['submittedRoutePointCount'] as num?)?.toInt() ??
        (data['gpsRoutePointCount'] as num?)?.toInt() ??
        0;

    final simulated =
        data['submittedRouteSimulated'] == true ||
        data['gpsRouteSimulated'] == true;

    final eligibleForPayment = data['eligibleForPayment'] == true;
    final isGroup = data['groupAssignmentId'] != null;

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
              label: 'Base Payment',
              value: '\$${basePayout.toStringAsFixed(2)}',
            ),

            if (availableBonus > 0.0) ...[
              const Divider(),
              _reviewMetricRow(
                label: 'Optional Bonus',
                value: '\$${availableBonus.toStringAsFixed(2)}',
              ),
              const SizedBox(height: 6),
              const Text(
                'You can release the campaign bonus after reviewing the GPS evidence, even when the automatic score is imperfect.',
              ),
            ],

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

            if (eligibleForPayment && (!isGroup || completionPercentage >= 75))
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

            if (eligibleForPayment && (!isGroup || completionPercentage >= 75))
              const SizedBox(height: 10),

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

  double _contractBasePayout(double completionPercentage) {
    final campaignData =
        (campaign.data() as Map<String, dynamic>?) ?? <String, dynamic>{};
    final campaignBasePay =
        (campaignData['basePay'] as num?)?.toDouble() ?? 0.0;

    if (completionPercentage < 10.0 || campaignBasePay <= 0.0) {
      return 0.0;
    }

    if (completionPercentage >= 95.0) {
      return campaignBasePay;
    }

    return campaignBasePay * (completionPercentage / 100.0);
  }

  Future<void> _showZoneActions(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final zoneData = zone.data();

    final assignedScalerId = zoneData['assignedScalerId']?.toString();

    final mapLocked =
        zoneData['mapLocked'] == true ||
        _campaignLocked ||
        (assignedScalerId != null && assignedScalerId.isNotEmpty);

    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: Icon(
                  mapLocked
                      ? Icons.lock_outline
                      : Icons.edit_location_alt_outlined,
                ),
                title: Text(mapLocked ? 'Zone Map Locked' : 'Edit Zone Map'),
                subtitle: mapLocked
                    ? const Text(
                        'Zone setup cannot change after campaign launch or assignment.',
                      )
                    : null,
                onTap: mapLocked
                    ? null
                    : () {
                        Navigator.pop(sheetContext, 'map');
                      },
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Rename Zone'),
                onTap: mapLocked
                    ? null
                    : () {
                        Navigator.pop(sheetContext, 'rename');
                      },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: const Text(
                  'Delete Zone',
                  style: TextStyle(color: Colors.red),
                ),
                onTap: mapLocked
                    ? null
                    : () {
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
            style: TextButton.styleFrom(splashFactory: NoSplash.splashFactory),
            onPressed: () {
              Navigator.pop(context, true);
            },
            child: const Text('Done'),
          ),
        ],
      ),
      bottomNavigationBar: _campaignLocked
          ? null
          : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: _zonesCollection
                  .where('campaignId', isEqualTo: campaign.id)
                  .snapshots(),
              builder: (context, snapshot) {
                final canContinue = campaignZonesCanContinue(
                  (snapshot.data?.docs ?? const []).map((doc) => doc.data()),
                );
                return SafeArea(
                  minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!canContinue)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Text(
                            'Add at least one campaign area before continuing.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      SizedBox(
                        width: double.infinity,
                        height: 58,
                        child: ElevatedButton.icon(
                          onPressed: canContinue
                              ? () => Navigator.pop(context, true)
                              : null,
                          icon: const Icon(Icons.arrow_forward),
                          label: const Text('Continue to Review & Launch'),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: null,
      body: _OpenAreaBuilderOnce(
        enabled: startWithAreaBuilder && !_campaignLocked,
        onOpen: () => _createZone(context, skipNamePrompt: true),
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
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

            final zones =
                List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(
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
            var anyHomeEstimatePending = false;

            for (final zone in zones) {
              final data = zone.data();

              totalEstimatedHomes +=
                  (data['estimatedHomes'] as num?)?.toInt() ?? 0;
              final homeStatus =
                  data['homeCountStatus']?.toString() ?? 'pending';
              anyHomeEstimatePending =
                  anyHomeEstimatePending ||
                  homeStatus == 'pending' ||
                  homeStatus == 'waiting';

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
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
              children: [
                Text(
                  zones.isEmpty
                      ? 'Choose where this campaign will run'
                      : 'Campaign Areas',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 8),

                Text(
                  zones.isEmpty
                      ? 'Starting inside: $_serviceAreaName'
                      : 'One Zone is one practical Scaler assignment area.',
                ),

                const SizedBox(height: 22),

                if (zones.isNotEmpty)
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

                if (zones.isNotEmpty)
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
                                : anyHomeEstimatePending
                                ? 'Analyzing...'
                                : 'Unavailable',
                          ),
                          const Divider(),
                          _campaignMetricRow(
                            icon: Icons.directions_walk,
                            label: 'Walking Route',
                            value: 'Not yet verified',
                          ),
                        ],
                      ),
                    ),
                  ),

                const SizedBox(height: 22),

                if (zones.isNotEmpty)
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

                if (zones.isNotEmpty && !campaignCanAddZone(zones.length))
                  const Card(
                    child: ListTile(
                      leading: Icon(Icons.groups_outlined),
                      title: Text('One Scaler • One Zone'),
                      subtitle: Text(
                        'Scaler Crew and additional worker Zones are currently '
                        'in limited rollout.',
                      ),
                    ),
                  ),

                if (zones.isEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Icon(Icons.add_location_alt_outlined, size: 54),
                          const SizedBox(height: 12),
                          const Text(
                            'Choose a target inside your Service Area',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'The saved Service Area is a visual boundary only. Draw a smaller area for this campaign.',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 18),
                          if (_hasTransferredAnalysisArea)
                            OutlinedButton.icon(
                              onPressed: _campaignLocked
                                  ? null
                                  : () => _createZone(
                                      context,
                                      skipNamePrompt: true,
                                    ),
                              icon: const Icon(Icons.insights_outlined),
                              label: const Text('Use Analyzed Area'),
                            ),
                          ElevatedButton.icon(
                            onPressed: _campaignLocked
                                ? null
                                : () => _createZone(
                                    context,
                                    skipNamePrompt: true,
                                  ),
                            icon: const Icon(Icons.add_location_alt),
                            label: const Text('Choose Target Area'),
                          ),
                          TextButton.icon(
                            onPressed: _campaignLocked
                                ? null
                                : () => _createZone(
                                    context,
                                    skipNamePrompt: true,
                                  ),
                            icon: const Icon(Icons.gesture),
                            label: const Text('Draw Custom Target'),
                          ),
                        ],
                      ),
                    ),
                  ),

                ...zones.map((zone) {
                  final data = zone.data();

                  final zoneName =
                      data['zoneName']?.toString() ?? 'Unnamed Zone';

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
                        onTap: _campaignLocked || data['mapLocked'] == true
                            ? null
                            : () {
                                _editZoneArea(context, zone);
                              },
                      ),

                      if (data['analysisStatus'] != 'complete' ||
                          data['serverZoneMetricsVersion'] !=
                              'geometry_v1_server') ...[
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: () => _retryZoneAnalysis(context, zone),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retry Zone Analysis'),
                        ),
                      ],

                      if (!_campaignLocked) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: data['mapLocked'] == true
                                    ? null
                                    : () => _editZoneArea(context, zone),
                                icon: const Icon(Icons.edit_location_alt),
                                label: const Text('Edit Zone'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: zoneStatus == 'unassigned'
                                    ? () => _deleteZone(context, zone)
                                    : null,
                                icon: const Icon(Icons.delete_outline),
                                label: const Text('Remove'),
                              ),
                            ),
                          ],
                        ),
                      ],

                      if (zoneStatus == 'assigned')
                        StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                          stream: FirebaseFirestore.instance
                              .collection('zoneGroupAssignments')
                              .doc(zone.id)
                              .snapshots(),
                          builder: (context, groupSnapshot) {
                            final group = groupSnapshot.data?.data();
                            final required =
                                (group?['requiredScalerCount'] as num?)
                                    ?.round() ??
                                (data['requiredScalerCount'] as num?)
                                    ?.round() ??
                                1;
                            final assigned =
                                (group?['acceptedScalerCount'] as num?)
                                    ?.round() ??
                                (data['assignedScalerId'] == null ? 0 : 1);
                            final pool =
                                (group?['workerPoolCents'] as num?)?.round() ??
                                (data['workerPoolCents'] as num?)?.round() ??
                                0;
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      required > 1
                                          ? 'GROUP COORDINATION'
                                          : 'JOB COORDINATION',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(
                                      '$assigned / $required Scalers assigned',
                                    ),
                                    if (pool > 0)
                                      Text(
                                        'Worker pool: \$${(pool / 100).toStringAsFixed(2)}',
                                      ),
                                    if (pool > 0 && required > 0)
                                      Text(
                                        'Scheduled share: \$${(pool / required / 100).toStringAsFixed(2)} each',
                                      ),
                                    const Text('Status: Coordination required'),
                                    const SizedBox(height: 8),
                                    FilledButton.icon(
                                      onPressed: () => Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              JobRoomScreen(zoneId: zone.id),
                                        ),
                                      ),
                                      icon: const Icon(
                                        Icons.meeting_room_outlined,
                                      ),
                                      label: const Text('Open Job Room'),
                                    ),
                                  ],
                                ),
                              ),
                            );
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
}

class _OpenAreaBuilderOnce extends StatefulWidget {
  const _OpenAreaBuilderOnce({
    required this.enabled,
    required this.onOpen,
    required this.child,
  });

  final bool enabled;
  final Future<void> Function() onOpen;
  final Widget child;

  @override
  State<_OpenAreaBuilderOnce> createState() => _OpenAreaBuilderOnceState();
}

class _OpenAreaBuilderOnceState extends State<_OpenAreaBuilderOnce> {
  bool _opened = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !widget.enabled || _opened) return;
      _opened = true;
      widget.onOpen();
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
