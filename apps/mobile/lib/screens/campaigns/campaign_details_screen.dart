import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../models/campaign_card_compensation.dart';
import '../../models/business_result_summary.dart';
import '../../models/material_logistics.dart';
import '../../services/completion_payout_service.dart';
import '../../services/platform_billing_service.dart';
import '../../services/secure_function_service.dart';
import '../../widgets/legal_consent_prompt.dart';

import '../../services/wallet_service.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../business/campaign_zones_screen.dart';
import '../business/edit_campaign_screen.dart';
import '../business/create_campaign_screen.dart' as business_campaign;
import 'campaign_applicants_screen.dart';
import 'campaign_tracking_screen.dart';
import '../reviews/user_reviews_screen.dart';
import '../reviews/create_review_screen.dart';

class CampaignDetailsScreen extends StatefulWidget {
  final DocumentSnapshot campaign;
  final String fallbackRoute;

  const CampaignDetailsScreen({
    super.key,
    required this.campaign,
    this.fallbackRoute = AppRoutes.businessDashboard,
  });

  @override
  State<CampaignDetailsScreen> createState() => _CampaignDetailsScreenState();
}

class _CampaignDetailsScreenState extends State<CampaignDetailsScreen> {
  final GlobalKey _zoneReviewKey = GlobalKey();

  final PlatformBillingService _billingService = PlatformBillingService();
  final SecureFunctionService _secureFunctions = const SecureFunctionService();
  int? _reviewQuoteWorkerCents;
  Future<CampaignCostQuote>? _reviewQuoteFuture;

  Future<CampaignCostQuote> _reviewQuote(double workerBudget) {
    final workerCents = (workerBudget * 100).round();
    if (_reviewQuoteFuture == null || _reviewQuoteWorkerCents != workerCents) {
      _reviewQuoteWorkerCents = workerCents;
      _reviewQuoteFuture = _billingService.campaignCostQuoteForCampaign(
        campaign.id,
      );
    }
    return _reviewQuoteFuture!;
  }

  Future<void> _openScalerReviews(BuildContext context, String scalerId) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => UserReviewsScreen(userId: scalerId, userType: "scaler"),
      ),
    );
  }

  bool _publishingDraft = false;
  bool _campaignActionPending = false;

  DocumentSnapshot get campaign => widget.campaign;

  void _leaveCampaignDetails() {
    AppNavigation.push(context, widget.fallbackRoute);
  }

  AppBar _campaignAppBar() => AppBar(
    leading: BackButton(onPressed: _leaveCampaignDetails),
    title: const Text('Campaign Details'),
    centerTitle: true,
  );

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  CollectionReference<Map<String, dynamic>> get _routesCollection {
    return FirebaseFirestore.instance.collection('campaignRoutes');
  }

  Future<void> _publishAndFundDraftCampaign(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) async {
    if (_publishingDraft) {
      return;
    }

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You must be logged in to launch this campaign.'),
        ),
      );

      return;
    }

    setState(() {
      _publishingDraft = true;
    });

    try {
      final campaignSnapshot = await liveCampaign.reference.get();

      if (!campaignSnapshot.exists) {
        throw Exception('This campaign no longer exists.');
      }

      final rawCampaignData = campaignSnapshot.data();

      if (rawCampaignData is! Map<String, dynamic>) {
        throw Exception('Campaign data is invalid.');
      }

      final campaignData = rawCampaignData;

      final businessId = campaignData['businessId']?.toString();

      if (businessId == null || businessId.isEmpty) {
        throw Exception('This campaign does not have a business attached.');
      }

      if (businessId != user.uid) {
        throw Exception('You do not have permission to launch this campaign.');
      }

      final currentStatus = campaignData['status']?.toString() ?? 'draft';

      final fundingStatus =
          campaignData['fundingStatus']?.toString() ?? 'not_reserved';

      if (currentStatus != 'draft') {
        throw Exception('This campaign has already been launched.');
      }

      final campaignType = campaignData['campaignType']?.toString() ?? '';

      final exactLocationCampaign =
          campaignType == 'yard_sign_installation' ||
          campaignType == 'dump_run' ||
          campaignType == 'event_marketing';

      int estimatedHomes = 0;
      int zoneCount = 0;
      int mappedZoneCount = 0;

      int locationCount = 0;
      int totalLocationQuantity = 0;
      final zoneReferencesToLock = <DocumentReference<Map<String, dynamic>>>[];

      if (exactLocationCampaign) {
        final locationsSnapshot = await FirebaseFirestore.instance
            .collection('campaignLocations')
            .where('campaignId', isEqualTo: liveCampaign.id)
            .get();

        if (locationsSnapshot.docs.isEmpty) {
          throw Exception('Add at least one location before publishing.');
        }

        if (campaignType == 'dump_run') {
          final hasPickup = locationsSnapshot.docs.any((location) {
            return location.data()['locationType']?.toString() == 'dump_pickup';
          });

          final hasDropoff = locationsSnapshot.docs.any((location) {
            return location.data()['locationType']?.toString() ==
                'dump_dropoff';
          });

          if (!hasPickup || !hasDropoff) {
            throw Exception(
              'A dump run requires both a pickup location and a dump location.',
            );
          }
        }

        for (final location in locationsSnapshot.docs) {
          final data = location.data();

          final latitude = (data['latitude'] as num?)?.toDouble() ?? 0.0;
          final longitude = (data['longitude'] as num?)?.toDouble() ?? 0.0;

          final validCoordinates =
              latitude >= -90 &&
              latitude <= 90 &&
              longitude >= -180 &&
              longitude <= 180 &&
              !(latitude == 0.0 && longitude == 0.0);

          if (!validCoordinates) {
            throw Exception(
              'Every campaign location must have a valid map position before publishing.',
            );
          }

          totalLocationQuantity += (data['quantity'] as num?)?.toInt() ?? 1;
        }

        locationCount = locationsSnapshot.docs.length;
      } else {
        final zonesSnapshot = await _zonesCollection
            .where('campaignId', isEqualTo: liveCampaign.id)
            .get();

        if (zonesSnapshot.docs.isEmpty) {
          throw Exception('Create at least one zone before publishing.');
        }

        final mappedZones = zonesSnapshot.docs.where((zone) {
          final data = zone.data();

          final pointCount =
              (data['serviceAreaPointCount'] as num?)?.toInt() ?? 0;

          return pointCount >= 3;
        }).toList();

        if (mappedZones.isEmpty) {
          throw Exception('Map at least one zone before publishing.');
        }

        zoneCount = zonesSnapshot.docs.length;
        mappedZoneCount = mappedZones.length;
        zoneReferencesToLock.addAll(
          zonesSnapshot.docs.map((zone) => zone.reference),
        );

        for (final zone in mappedZones) {
          final data = zone.data();

          estimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;
        }
      }

      final basePay = (campaignData['basePay'] as num?)?.toDouble() ?? 0.0;

      final bonus = (campaignData['bonus'] as num?)?.toDouble() ?? 0.0;

      final requestedScalerCount =
          (campaignData['requestedScalerCount'] as num?)?.toInt() ?? 1;

      double workerBudget =
          (campaignData['maximumWorkerBudget'] as num?)?.toDouble() ?? 0.0;

      if (workerBudget <= 0.0) {
        workerBudget = (basePay + bonus) * requestedScalerCount;
      }

      if (workerBudget <= 0.0) {
        throw Exception('Campaign worker budget must be greater than zero.');
      }

      await liveCampaign.reference.update({
        'maximumWorkerBudget': workerBudget,
        'zoneCount': zoneCount,
        'mappedZoneCount': mappedZoneCount,
        'locationCount': locationCount,
        'totalLocationQuantity': totalLocationQuantity,
        'estimatedHomes': estimatedHomes,
        'setupStatus': 'configured',
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (fundingStatus != 'funded') {
        final reviewedQuote = await _reviewQuote(workerBudget);
        final freshQuote = await _billingService.campaignCostQuoteForCampaign(
          liveCampaign.id,
        );
        if (reviewedQuote.quoteDigest != freshQuote.quoteDigest) {
          setState(() {
            _reviewQuoteFuture = Future.value(freshQuote);
            _reviewQuoteWorkerCents = freshQuote.workerCompensationCents;
          });
          throw Exception(
            'Campaign pricing changed. Review the updated total and approve again.',
          );
        }
        if (!context.mounted) return;
        if (!await ensureLegalConsentForAction(
          context,
          LegalActionConsent.businessFunding,
        )) {
          return;
        }
        await _billingService.fundCampaignWithCard(
          businessId: businessId,
          campaignId: liveCampaign.id,
          approvedQuoteDigest: freshQuote.quoteDigest,
        );
        return;
      }

      await _billingService.publishFundedCampaign(
        businessId: businessId,
        campaignId: liveCampaign.id,
      );

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Campaign launched. '
            '\$${workerBudget.toStringAsFixed(2)} is secured for '
            'Scaler pay and the mapped zones are now locked.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to publish campaign: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _publishingDraft = false;
        });
      }
    }
  }

  Future<void> _approveZone(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final zoneData = zone.data();

    final zoneName = zoneData['zoneName']?.toString() ?? 'Assigned Zone';

    final scalerId = zoneData['assignedScalerId']?.toString();

    final campaignData = liveCampaign.data() as Map<String, dynamic>;

    final payoutId = zoneData['pendingPayoutId']?.toString() ?? zone.id;

    final payoutAmount = (zoneData['payoutAmount'] as num?)?.toDouble() ?? 0.0;

    final completionPercentage =
        (zoneData['completionPercentage'] as num?)?.toDouble() ?? 0.0;

    if (scalerId == null || scalerId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This zone does not have an assigned Scaler.'),
        ),
      );

      return;
    }

    if (payoutAmount <= 0.0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This zone does not currently have a payable amount.'),
        ),
      );

      return;
    }

    final availableBonus =
        (zoneData['availableBonus'] as num?)?.toDouble() ??
        (campaignData['bonus'] as num?)?.toDouble() ??
        0.0;

    final bonusEarnedAutomatically = completionPercentage >= 95.0;

    final campaignBasePay =
        (campaignData['basePay'] as num?)?.toDouble() ?? 0.0;

    final basePayout = _contractBasePayout(
      campaignBasePay: campaignBasePay,
      completionPercentage: completionPercentage,
    );

    final releaseBonus = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        var includeBonus = bonusEarnedAutomatically && availableBonus > 0.0;

        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            final approvalTotal =
                basePayout + (includeBonus ? availableBonus : 0.0);

            return AlertDialog(
              title: const Text('Approve Work & Record Earning'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Approve $zoneName at '
                      '${completionPercentage.toStringAsFixed(1)}% completion.',
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      "Approval records the Scaler's earning. Bank payout and cash-out are separate.",
                    ),
                    const SizedBox(height: 16),
                    _approvalAmountRow('Base earning', basePayout),
                    if (availableBonus > 0.0) ...[
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
                            'The route is below 95%. You may still approve bonus eligibility after reviewing possible GPS lag or other evidence.',
                          ),
                          value: includeBonus,
                          onChanged: (value) {
                            setDialogState(() {
                              includeBonus = value;
                            });
                          },
                        ),
                    ],
                    const Divider(height: 24),
                    _approvalAmountRow(
                      'Total earning to record',
                      approvalTotal,
                    ),
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
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(dialogContext, includeBonus);
                  },
                  icon: const Icon(Icons.verified_outlined),
                  label: const Text('Approve Work'),
                ),
              ],
            );
          },
        );
      },
    );

    if (releaseBonus == null) {
      return;
    }

    try {
      final payoutService = CompletionPayoutService();

      // The maintained callable verifies the completion and records one worker
      // earning. Provider transfer and bank payout are separate later actions.
      final approval = await payoutService.approvePayout(
        payoutId: payoutId,
        releaseBonus: releaseBonus,
      );

      final releasedAmount =
          (approval['amount'] as num?)?.toDouble() ?? payoutAmount;

      final releasedBonus = (approval['bonus'] as num?)?.toDouble() ?? 0.0;

      await _refreshCampaignCompletion(liveCampaign);

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$zoneName approved. '
            '\$${releasedAmount.toStringAsFixed(2)} '
            'was recorded as a verified Scaler earning'
            '${releasedBonus > 0.0 ? ' including a \$${releasedBonus.toStringAsFixed(2)} bonus' : ''}.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't approve this work. No earning was recorded. Review the job state and try again.",
          ),
        ),
      );
    }
  }

  Widget _launchDraftButton(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) {
    if (!PlatformBillingService.authoritativeCampaignFundingAvailable) {
      return Card(
        color: Colors.amber.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Campaign funding is temporarily unavailable.',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
              ),
              const SizedBox(height: 8),
              const Text('Your campaign draft and target are saved.'),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => Navigator.maybePop(context),
                child: const Text('Back to Campaign'),
              ),
            ],
          ),
        ),
      );
    }
    final liveData = liveCampaign.data() as Map<String, dynamic>? ?? const {};
    final alreadyFunded = liveData['fundingStatus']?.toString() == 'funded';
    return SizedBox(
      width: double.infinity,
      height: 55,
      child: ElevatedButton.icon(
        style: ElevatedButton.styleFrom(splashFactory: NoSplash.splashFactory),
        onPressed: _publishingDraft
            ? null
            : () {
                _publishAndFundDraftCampaign(context, liveCampaign);
              },
        icon: _publishingDraft
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(alreadyFunded ? Icons.publish : Icons.lock_outline),
        label: Text(
          _publishingDraft
              ? (alreadyFunded
                    ? 'Publishing Campaign...'
                    : 'Preparing Secure Checkout...')
              : (alreadyFunded
                    ? 'Publish Funded Campaign'
                    : 'Approve & Continue to Funding'),
        ),
      ),
    );
  }

  Widget _approvalAmountRow(String label, double amount) {
    return Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          '\$${amount.toStringAsFixed(2)}',
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  double _contractBasePayout({
    required double campaignBasePay,
    required double completionPercentage,
  }) {
    if (completionPercentage < 10.0 || campaignBasePay <= 0.0) {
      return 0.0;
    }

    if (completionPercentage >= 95.0) {
      return campaignBasePay;
    }

    return campaignBasePay * (completionPercentage / 100.0);
  }

  Future<void> _requestZoneChanges(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) async {
    final zoneData = zone.data();

    final zoneName = zoneData['zoneName']?.toString() ?? 'Assigned Zone';

    final feedbackController = TextEditingController();

    final feedback = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text('Request Changes — $zoneName'),
          content: TextField(
            controller: feedbackController,
            maxLines: 5,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'What needs to be corrected?',
              hintText: 'Explain what the Scaler needs to fix...',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton.icon(
              onPressed: () {
                final value = feedbackController.text.trim();

                if (value.isEmpty) {
                  return;
                }

                Navigator.pop(dialogContext, value);
              },
              icon: const Icon(Icons.send),
              label: const Text('Send'),
            ),
          ],
        );
      },
    );

    feedbackController.dispose();

    if (feedback == null || feedback.isEmpty) {
      return;
    }

    try {
      final firestore = FirebaseFirestore.instance;

      final batch = firestore.batch();

      batch.update(zone.reference, {
        'status': 'in_progress',
        'reviewFeedback': feedback,
        'changesRequestedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      await _refreshCampaignCompletion(liveCampaign);

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$zoneName returned to the Scaler.')),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to request changes: $e')));
    }
  }

  Future<void> _refreshCampaignCompletion(DocumentSnapshot liveCampaign) async {
    final zonesSnapshot = await _zonesCollection
        .where('campaignId', isEqualTo: liveCampaign.id)
        .get();

    if (zonesSnapshot.docs.isEmpty) {
      return;
    }

    int completedZones = 0;
    int assignedZones = 0;
    int submittedZones = 0;
    int inProgressZones = 0;

    double totalPaidOut = 0.0;

    for (final zone in zonesSnapshot.docs) {
      final data = zone.data();

      final status = data['status']?.toString() ?? 'unassigned';

      final assignedScalerId = data['assignedScalerId']?.toString();

      if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
        assignedZones++;
      }

      if (status == 'completed') {
        completedZones++;

        totalPaidOut += (data['payoutAmount'] as num?)?.toDouble() ?? 0.0;
      }

      if (status == 'submitted') {
        submittedZones++;
      }

      if (status == 'in_progress') {
        inProgressZones++;
      }
    }

    final allZonesCompleted = completedZones == zonesSnapshot.docs.length;

    final latestCampaignSnapshot = await liveCampaign.reference.get();

    if (!latestCampaignSnapshot.exists) {
      return;
    }

    final rawCampaignData = latestCampaignSnapshot.data();

    if (rawCampaignData is! Map<String, dynamic>) {
      throw Exception('Campaign data is invalid.');
    }

    final campaignData = rawCampaignData;

    final businessId = campaignData['businessId']?.toString();

    final reservedWorkerBudget =
        (campaignData['reservedWorkerBudget'] as num?)?.toDouble() ?? 0.0;

    final updateData = <String, dynamic>{
      'zoneCount': zonesSnapshot.docs.length,

      'assignedZoneCount': assignedZones,

      'submittedZoneCount': submittedZones,

      'inProgressZoneCount': inProgressZones,

      'completedZoneCount': completedZones,

      'totalPaidOut': campaignData['totalPaidOut'] ?? totalPaidOut,

      'zonesUpdatedAt': FieldValue.serverTimestamp(),
    };

    if (allZonesCompleted) {
      /*
     * Calculate the portion of the original
     * campaign reserve that was never earned.
     */
      final unusedReservedFunds = reservedWorkerBudget;

      /*
     * Release leftover reserved credits
     * back to the business wallet.
     *
     * Example:
     *
     * Reserved = $300
     * Scaler earned = $50
     *
     * $250 is returned to available credits.
     */
      if (unusedReservedFunds > 0.0 &&
          businessId != null &&
          businessId.isNotEmpty) {
        final walletService = WalletService();

        await walletService.releaseReservedCredits(
          businessId: businessId,

          amount: unusedReservedFunds,

          description:
              'Unused worker funding released after campaign completion.',

          campaignId: liveCampaign.id,
        );
      }

      updateData['status'] = 'completed';

      updateData['completedAt'] = FieldValue.serverTimestamp();

      updateData['fundingStatus'] = 'settled';

      updateData['reservedWorkerBudget'] = 0.0;

      updateData['unusedWorkerBudgetReleased'] = unusedReservedFunds > 0.0
          ? unusedReservedFunds
          : 0.0;

      updateData['fundingSettledAt'] = FieldValue.serverTimestamp();
    } else {
      final currentStatus = campaignData['status']?.toString() ?? 'open';

      if (currentStatus == 'completed') {
        updateData['status'] = 'open';

        updateData['completedAt'] = FieldValue.delete();

        /*
       * Do NOT automatically re-reserve money here.
       * If a completed campaign is reopened,
       * funding should be handled explicitly.
       */
        updateData['fundingStatus'] = 'needs_review';
      }
    }

    await liveCampaign.reference.update(updateData);
  }

  Future<void> _deleteCampaign(
    BuildContext context,
    DocumentReference reference,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Delete Campaign'),
          content: const Text(
            'Permanently delete this unfunded draft and its zone setup? This cannot be undone.',
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
      await _secureFunctions.call(
        functionName: 'deleteDraftCampaign',
        data: {'campaignId': reference.id},
      );

      if (!context.mounted) {
        return;
      }

      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to delete campaign: $e')));
    }
  }

  Future<void> _cancelAndRefundCampaign(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) async {
    if (_campaignActionPending) return;
    String reason = 'campaign_no_longer_needed';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Cancel this campaign?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'No Scaler has been assigned, so the campaign can be canceled and its eligible funding returned to the original payment method.\n\nThe campaign will be removed from available work.',
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: reason,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'no_suitable_scaler',
                    child: Text('No suitable Scaler'),
                  ),
                  DropdownMenuItem(
                    value: 'pay_needs_adjustment',
                    child: Text('Pay needs adjustment'),
                  ),
                  DropdownMenuItem(
                    value: 'campaign_no_longer_needed',
                    child: Text('Campaign no longer needed'),
                  ),
                  DropdownMenuItem(
                    value: 'schedule_changed',
                    child: Text('Schedule changed'),
                  ),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (value) =>
                    setDialogState(() => reason = value ?? reason),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Keep Campaign'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Cancel & Request Refund'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _campaignActionPending = true);
    try {
      final result = await _secureFunctions.call(
        functionName: 'cancelUnassignedFundedCampaign',
        data: {'campaignId': liveCampaign.id, 'reason': reason},
      );
      if (!context.mounted) return;
      final cents = (result['refundableAmountCents'] as num?)?.toInt();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            cents == null
                ? 'Campaign canceled. Refund processing has started.'
                : 'Campaign canceled. ${(cents / 100).toStringAsFixed(2)} ${result['currency']?.toString().toUpperCase() ?? 'USD'} is processing to the original payment method.',
          ),
        ),
      );
    } on SecureFunctionError catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _campaignActionPending = false);
    }
  }

  Future<void> _archiveCanceledCampaign(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) async {
    if (_campaignActionPending) return;
    setState(() => _campaignActionPending = true);
    try {
      await _secureFunctions.call(
        functionName: 'archiveCanceledCampaign',
        data: {'campaignId': liveCampaign.id},
      );
      if (!context.mounted) return;
      Navigator.pop(context);
    } on SecureFunctionError catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _campaignActionPending = false);
    }
  }

  Widget _cancellationOptions(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    Map<String, dynamic> data,
  ) {
    final status = data['status']?.toString() ?? '';
    final fundingStatus = data['fundingStatus']?.toString() ?? '';
    if (status == 'canceling' || fundingStatus == 'refund_pending') {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.hourglass_top),
          title: Text('Refund Processing'),
          subtitle: Text(
            'The campaign is closed to new work while the refund is reconciled.',
          ),
        ),
      );
    }
    if (status == 'canceled' && fundingStatus == 'refunded') {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'CANCELED / REFUNDED',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Payment and refund history remain preserved for your records.',
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _campaignActionPending
                    ? null
                    : () => _archiveCanceledCampaign(context, liveCampaign),
                icon: const Icon(Icons.archive_outlined),
                label: const Text('Remove from My Campaigns'),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        const business_campaign.CreateCampaignScreen(),
                  ),
                ),
                icon: const Icon(Icons.copy_outlined),
                label: const Text('Create Revised Campaign'),
              ),
            ],
          ),
        ),
      );
    }
    if (status != 'open' || fundingStatus != 'funded') {
      return const SizedBox.shrink();
    }
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: liveCampaign.id)
          .snapshots(),
      builder: (context, snapshot) {
        final assigned =
            (data['assignedScalerCount'] as num? ?? 0).toInt() > 0 ||
            (snapshot.data?.docs.any((zone) {
                  final zoneData = zone.data();
                  return (zoneData['assignedScalerId']?.toString().isNotEmpty ??
                          false) ||
                      (zoneData['assignedScalerIds'] as List?)?.isNotEmpty ==
                          true;
                }) ??
                false);
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'CAMPAIGN OPTIONS',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                if (assigned)
                  const Text(
                    'A Scaler has already been assigned to this campaign. Cancellation requires a different review process.',
                  )
                else
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.red),
                    onPressed: _campaignActionPending
                        ? null
                        : () => _cancelAndRefundCampaign(context, liveCampaign),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Cancel Campaign & Refund'),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  List<LatLng> _parsePoints(dynamic rawPoints) {
    if (rawPoints is! List) {
      return [];
    }

    final points = <LatLng>[];

    for (final item in rawPoints) {
      if (item is! Map) {
        continue;
      }

      final latitude = item['latitude'];

      final longitude = item['longitude'];

      if (latitude is num && longitude is num) {
        points.add(LatLng(latitude.toDouble(), longitude.toDouble()));
      }
    }

    return points;
  }

  LatLng _calculateCenter(List<LatLng> points) {
    if (points.isEmpty) {
      return const LatLng(39.2904, -76.6122);
    }

    double latitude = 0;
    double longitude = 0;

    for (final point in points) {
      latitude += point.latitude;

      longitude += point.longitude;
    }

    return LatLng(latitude / points.length, longitude / points.length);
  }

  bool _isPointInsidePolygon(LatLng point, List<LatLng> polygon) {
    if (polygon.length < 3) {
      return false;
    }

    bool inside = false;

    int j = polygon.length - 1;

    for (int i = 0; i < polygon.length; i++) {
      final current = polygon[i];

      final previous = polygon[j];

      final crossesLatitude =
          (current.latitude > point.latitude) !=
          (previous.latitude > point.latitude);

      if (crossesLatitude) {
        final longitudeAtCrossing =
            (previous.longitude - current.longitude) *
                (point.latitude - current.latitude) /
                (previous.latitude - current.latitude) +
            current.longitude;

        if (point.longitude < longitudeAtCrossing) {
          inside = !inside;
        }
      }

      j = i;
    }

    return inside;
  }

  RouteVerification _calculateVerification(
    List<LatLng> serviceArea,
    List<LatLng> routePoints,
  ) {
    if (serviceArea.length < 3 || routePoints.isEmpty) {
      return RouteVerification(
        totalPoints: routePoints.length,
        insidePoints: 0,
        outsidePoints: routePoints.length,
        compliancePercent: 0,
        outsideLocations: routePoints,
        canVerify: false,
      );
    }

    int insidePoints = 0;

    final outsideLocations = <LatLng>[];

    for (final point in routePoints) {
      if (_isPointInsidePolygon(point, serviceArea)) {
        insidePoints++;
      } else {
        outsideLocations.add(point);
      }
    }

    final outsidePoints = routePoints.length - insidePoints;

    final compliancePercent = (insidePoints / routePoints.length) * 100;

    return RouteVerification(
      totalPoints: routePoints.length,
      insidePoints: insidePoints,
      outsidePoints: outsidePoints,
      compliancePercent: compliancePercent,
      outsideLocations: outsideLocations,
      canVerify: true,
    );
  }

  Widget _buildZoneReviewSection(DocumentSnapshot liveCampaign) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: liveCampaign.id)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Unable to load campaign zones: ${snapshot.error}'),
            ),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final zones = List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(
          snapshot.data?.docs ?? [],
        );

        zones.sort((first, second) {
          final firstName = first.data()['zoneName']?.toString() ?? '';

          final secondName = second.data()['zoneName']?.toString() ?? '';

          return firstName.compareTo(secondName);
        });

        if (zones.isEmpty) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(Icons.map_outlined, size: 44),
                  SizedBox(height: 10),
                  Text(
                    'No Campaign Zones',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Create campaign zones before assigning Scalers.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        int submittedCount = 0;
        int completedCount = 0;
        int inProgressCount = 0;
        int assignedCount = 0;

        for (final zone in zones) {
          final data = zone.data();

          final status = data['status']?.toString() ?? 'unassigned';

          if (BusinessResultSummary.zoneState(data) ==
              BusinessZoneResultState.awaitingReview) {
            submittedCount++;
          }

          if (status == 'completed') {
            completedCount++;
          }

          if (status == 'in_progress') {
            inProgressCount++;
          }

          final assignedScalerId = data['assignedScalerId']?.toString();

          if (assignedScalerId != null && assignedScalerId.isNotEmpty) {
            assignedCount++;
          }
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Zone Workflow',
              key: _zoneReviewKey,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'Each Scaler is reviewed against the GPS evidence for their assigned zone.',
            ),

            const SizedBox(height: 16),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  avatar: const Icon(Icons.map_outlined, size: 18),
                  label: Text('${zones.length} Zones'),
                ),
                Chip(
                  avatar: const Icon(Icons.person_outline, size: 18),
                  label: Text('$assignedCount Assigned'),
                ),
                Chip(
                  avatar: const Icon(Icons.play_circle_outline, size: 18),
                  label: Text('$inProgressCount In Progress'),
                ),
                Chip(
                  avatar: const Icon(Icons.hourglass_top, size: 18),
                  label: Text('$submittedCount Submitted'),
                ),
                Chip(
                  avatar: const Icon(Icons.verified_outlined, size: 18),
                  label: Text('$completedCount Completed'),
                ),
              ],
            ),

            const SizedBox(height: 18),

            ...zones.map((zone) {
              return _buildZoneCard(context, liveCampaign, zone);
            }),
          ],
        );
      },
    );
  }

  Widget _buildZoneCard(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
  ) {
    final data = zone.data();

    final zoneName = data['zoneName']?.toString() ?? 'Unnamed Zone';

    final status = data['status']?.toString() ?? 'unassigned';

    final scalerEmail = data['assignedScalerEmail']?.toString();

    final reviewFeedback = data['reviewFeedback']?.toString();

    final assignedHomes = (data['assignedHomes'] as num?)?.toInt() ?? 0;

    final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt() ?? 0;

    final displayHomes = assignedHomes > 0 ? assignedHomes : estimatedHomes;

    final gpsRoutePointCount =
        (data['gpsRoutePointCount'] as num?)?.toInt() ?? 0;

    final routeSimulated =
        data['gpsRouteSimulated'] == true ||
        data['submittedRouteSimulated'] == true;

    final serviceArea = _parsePoints(data['serviceArea']);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(child: Icon(_statusIcon(status))),

                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        zoneName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 4),

                      Text(
                        scalerEmail != null && scalerEmail.isNotEmpty
                            ? scalerEmail
                            : 'Unassigned',
                      ),
                    ],
                  ),
                ),

                Chip(label: Text(_statusLabel(status))),
              ],
            ),

            const SizedBox(height: 14),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  avatar: const Icon(Icons.home_outlined, size: 18),
                  label: Text(
                    displayHomes > 0 ? '$displayHomes homes' : 'Homes pending',
                  ),
                ),
                Chip(
                  avatar: const Icon(Icons.gps_fixed, size: 18),
                  label: Text('$gpsRoutePointCount GPS points'),
                ),
                if (routeSimulated)
                  const Chip(
                    avatar: Icon(Icons.science_outlined, size: 18),
                    label: Text('Simulation'),
                  ),
              ],
            ),

            if (reviewFeedback != null && reviewFeedback.isNotEmpty) ...[
              const SizedBox(height: 14),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Latest Review Feedback',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),

                    const SizedBox(height: 6),

                    Text(reviewFeedback),
                  ],
                ),
              ),
            ],

            if (BusinessResultSummary.zoneState(data) !=
                BusinessZoneResultState.none) ...[
              const SizedBox(height: 18),

              _buildZoneProofOfWork(zone, serviceArea),
            ],

            if (BusinessResultSummary.zoneState(data) ==
                BusinessZoneResultState.awaitingReview) ...[
              const SizedBox(height: 18),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    _approveZone(context, liveCampaign, zone);
                  },
                  icon: const Icon(Icons.verified),
                  label: Text('Approve $zoneName'),
                ),
              ),

              const SizedBox(height: 10),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () {
                    _requestZoneChanges(context, liveCampaign, zone);
                  },
                  icon: const Icon(Icons.assignment_return),
                  label: const Text('Request Changes'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildZoneProofOfWork(
    QueryDocumentSnapshot<Map<String, dynamic>> zone,
    List<LatLng> serviceArea,
  ) {
    final routeId = zone.data()['routeId']?.toString();

    final routeReference = _routesCollection.doc(routeId ?? zone.id);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: routeReference.snapshots(),
      builder: (context, routeSnapshot) {
        if (routeSnapshot.hasError) {
          return Text('Unable to load GPS proof: ${routeSnapshot.error}');
        }

        if (routeSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (!routeSnapshot.hasData || !routeSnapshot.data!.exists) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Column(
                children: [
                  Icon(Icons.gps_off, size: 40),
                  SizedBox(height: 8),
                  Text(
                    'No GPS Route Found',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          );
        }

        final routeData = routeSnapshot.data!.data() ?? {};

        final routePoints = _parsePoints(routeData['points']);

        final simulated = routeData['simulated'] == true;

        final pointCount =
            (routeData['pointCount'] as num?)?.toInt() ?? routePoints.length;

        final verification = _calculateVerification(serviceArea, routePoints);

        final allPoints = <LatLng>[...serviceArea, ...routePoints];

        final center = _calculateCenter(allPoints);

        final outsideMarkers = verification.outsideLocations.map((point) {
          return Marker(
            point: point,
            width: 28,
            height: 28,
            child: const Icon(Icons.warning, color: Colors.red, size: 24),
          );
        }).toList();

        return Column(
          children: [
            _buildVerificationCard(verification, simulated),

            const SizedBox(height: 12),

            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Icon(Icons.fact_check_outlined),
                        SizedBox(width: 8),
                        Text(
                          'Zone GPS Proof',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(
                    height: 320,
                    child: FlutterMap(
                      options: MapOptions(
                        initialCenter: center,
                        initialZoom: 16,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.scaledcircle.app',
                        ),

                        if (serviceArea.length >= 3)
                          PolygonLayer(
                            polygons: [
                              Polygon(
                                points: serviceArea,
                                borderStrokeWidth: 3,
                                color: Colors.blue.withValues(alpha: 0.15),
                                borderColor: Colors.blue,
                              ),
                            ],
                          ),

                        if (routePoints.length >= 2)
                          PolylineLayer(
                            polylines: [
                              Polyline(
                                points: routePoints,
                                strokeWidth: 5,
                                color: Colors.green,
                              ),
                            ],
                          ),

                        MarkerLayer(
                          markers: [
                            if (routePoints.isNotEmpty)
                              Marker(
                                point: routePoints.first,
                                width: 40,
                                height: 40,
                                child: const Icon(
                                  Icons.play_circle_fill,
                                  color: Colors.green,
                                  size: 34,
                                ),
                              ),

                            if (routePoints.length >= 2)
                              Marker(
                                point: routePoints.last,
                                width: 40,
                                height: 40,
                                child: const Icon(
                                  Icons.flag_circle,
                                  color: Colors.red,
                                  size: 34,
                                ),
                              ),

                            ...outsideMarkers,
                          ],
                        ),
                      ],
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$pointCount GPS point${pointCount == 1 ? '' : 's'} recorded',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),

                        const SizedBox(height: 8),

                        Text(
                          'Tracking started: ${_formatTimestamp(routeData['startedAt'])}',
                        ),

                        const SizedBox(height: 4),

                        Text(
                          'Tracking ended: ${_formatTimestamp(routeData['endedAt'])}',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildVerificationCard(
    RouteVerification verification,
    bool simulated,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_verificationIcon(verification), size: 28),

                const SizedBox(width: 10),

                Expanded(
                  child: Text(
                    _verificationLabel(verification),
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 14),

            if (verification.canVerify) ...[
              Text(
                '${verification.compliancePercent.toStringAsFixed(1)}%',
                style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 4),

              const Text('Recorded GPS points inside assigned zone'),

              const SizedBox(height: 14),

              LinearProgressIndicator(
                value: verification.compliancePercent / 100,
                minHeight: 10,
              ),

              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(
                    child: _statBox(
                      'Total',
                      verification.totalPoints.toString(),
                      Icons.gps_fixed,
                    ),
                  ),

                  const SizedBox(width: 8),

                  Expanded(
                    child: _statBox(
                      'Inside',
                      verification.insidePoints.toString(),
                      Icons.check_circle_outline,
                    ),
                  ),

                  const SizedBox(width: 8),

                  Expanded(
                    child: _statBox(
                      'Outside',
                      verification.outsidePoints.toString(),
                      Icons.outbound_outlined,
                    ),
                  ),
                ],
              ),
            ] else
              const Text(
                'A mapped zone and recorded GPS route are required before compliance can be calculated.',
              ),

            if (simulated) ...[
              const SizedBox(height: 16),

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
                        'Development Simulation — this route was generated by the simulation tool and is not real field GPS evidence.',
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 12),

            const Text(
              'GPS compliance measures recorded points inside the assigned zone. It does not by itself prove that every property or street was serviced.',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statBox(String title, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Icon(icon, size: 20),

          const SizedBox(height: 5),

          Text(
            value,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          Text(title, style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }

  Future<void> _scrollToZoneReview(DocumentSnapshot liveCampaign) async {
    final reviewContext = _zoneReviewKey.currentContext;

    if (reviewContext == null) {
      if (!mounted) {
        return;
      }

      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignZonesScreen(campaign: liveCampaign),
        ),
      );

      return;
    }

    await Scrollable.ensureVisible(
      reviewContext,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeInOut,
      alignment: 0.05,
    );
  }

  Widget _submittedZoneAlert(DocumentSnapshot liveCampaign) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: liveCampaign.id)
          .where('status', isEqualTo: 'submitted')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }

        if (snapshot.hasError) {
          return const SizedBox.shrink();
        }

        final submittedZones = (snapshot.data?.docs ?? [])
            .where(
              (zone) => BusinessResultSummary.zoneState(zone.data()) ==
                  BusinessZoneResultState.awaitingReview,
            )
            .toList(growable: false);

        if (submittedZones.isEmpty) {
          return const SizedBox.shrink();
        }

        final count = submittedZones.length;

        return Card(
          color: Colors.orange.shade50,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.fact_check_outlined,
                      size: 30,
                      color: Colors.orange,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        count == 1
                            ? '1 Zone Awaiting Review'
                            : '$count Zones Awaiting Review',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 10),

                Text(
                  count == 1
                      ? 'A Scaler has submitted completed work for review.'
                      : 'Scalers have submitted completed work for review.',
                ),

                const SizedBox(height: 16),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      _scrollToZoneReview(liveCampaign);
                    },
                    icon: const Icon(Icons.rate_review_outlined),
                    label: const Text('Review Submitted Zones'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream: campaign.reference.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            appBar: _campaignAppBar(),
            body: Center(child: Text(snapshot.error.toString())),
          );
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final liveCampaign = snapshot.data!;

        if (!liveCampaign.exists) {
          return Scaffold(
            appBar: _campaignAppBar(),
            body: const Center(child: Text('This campaign no longer exists.')),
          );
        }

        final data = liveCampaign.data() as Map<String, dynamic>;

        final campaignName =
            data['campaignName']?.toString() ?? 'Untitled Campaign';

        final description = data['description']?.toString() ?? '';

        final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        final basePay = (data['basePay'] as num?)?.toDouble() ?? 0.0;

        final bonus = (data['bonus'] as num?)?.toDouble() ?? 0.0;

        final deadline = _deadlineLabel(data);

        final status = data['status']?.toString() ?? 'draft';

        final trackingEnabled = data['trackingEnabled'] == true;

        final fundingStatus =
            data['fundingStatus']?.toString() ?? 'not_reserved';

        final reservedWorkerBudget =
            (data['reservedWorkerBudget'] as num?)?.toDouble() ?? 0.0;

        final maximumWorkerBudget =
            (data['maximumWorkerBudget'] as num?)?.toDouble() ?? 0.0;
        final compensation = CampaignCardCompensation.fromCampaign(data);

        return Scaffold(
          appBar: _campaignAppBar(),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                campaignName,
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 10),

              Align(
                alignment: Alignment.centerLeft,
                child: Chip(
                  avatar: Icon(_statusIcon(status), size: 18),
                  label: Text(_statusLabel(status)),
                ),
              ),

              const SizedBox(height: 12),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: fundingStatus == 'funded'
                      ? const ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            Icons.check_circle,
                            color: Colors.green,
                          ),
                          title: Text('Payment confirmed'),
                          subtitle: Text(
                            'Campaign funded and ready to publish.',
                          ),
                        )
                      : maximumWorkerBudget <= 0 || fundingStatus == 'reserved'
                      ? ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            fundingStatus == 'reserved'
                                ? Icons.lock
                                : Icons.lock_open_outlined,
                          ),
                          title: const Text('Worker Funding'),
                          subtitle: Text(
                            fundingStatus == 'reserved'
                                ? '\$${reservedWorkerBudget.toStringAsFixed(2)} secured for Scaler pay'
                                : 'Worker funding has not been secured.',
                          ),
                        )
                      : FutureBuilder<CampaignCostQuote>(
                          future: _reviewQuote(maximumWorkerBudget),
                          builder: (context, snapshot) {
                            final quote = snapshot.data;
                            if (quote == null) {
                              return const ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(Icons.lock_open_outlined),
                                title: Text('Campaign Cost'),
                                subtitle: Text(
                                  'Confirming the current total...',
                                ),
                              );
                            }
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'CAMPAIGN COST',
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Worker compensation  \$${quote.workerCompensation.toStringAsFixed(2)}',
                                ),
                                Text(
                                  'Platform fee (${quote.platformFeePercentLabel})  \$${quote.platformFee.toStringAsFixed(2)}',
                                ),
                                Text(
                                  'Estimated total  \$${quote.estimatedTotal.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'The final campaign amount is confirmed again before funding.',
                                ),
                              ],
                            );
                          },
                        ),
                ),
              ),

              if (status == 'draft') ...[
                const SizedBox(height: 12),
                _launchDraftButton(context, liveCampaign),
              ],

              if (trackingEnabled) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 55,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              CampaignTrackingScreen(campaign: liveCampaign),
                        ),
                      );
                    },
                    icon: const Icon(Icons.qr_code_2),
                    label: Text(
                      data['trackingStatus']?.toString() == 'active'
                          ? 'View Tracking & Marketing Assets'
                          : 'Set Up Tracking & Marketing Assets',
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 16),

              _submittedZoneAlert(liveCampaign),

              const SizedBox(height: 20),

              _infoCard(Icons.description, 'Description', description),

              _infoCard(
                Icons.home,
                'Estimated Campaign Homes',
                estimatedHomes > 0 ? estimatedHomes.toString() : 'Pending',
              ),

              if (compensation.isGroupCampaign)
                _infoCard(
                  Icons.groups_outlined,
                  'GROUP WORKER PAY',
                  [
                    compensation.primaryText,
                    if (compensation.secondaryText != null)
                      compensation.secondaryText!,
                  ].join('\n'),
                )
              else
                _infoCard(
                  Icons.attach_money,
                  'Campaign Base Pay',
                  '\$${basePay.toStringAsFixed(2)}',
                ),

              _infoCard(Icons.star, 'Bonus', '\$${bonus.toStringAsFixed(2)}'),

              _infoCard(Icons.calendar_today, 'Deadline', deadline),

              _materialPlanCard(context, liveCampaign, data),

              const SizedBox(height: 10),

              if (status != 'completed') ...[
                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              CampaignZonesScreen(campaign: liveCampaign),
                        ),
                      );
                    },
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('Manage Campaign Zones'),
                  ),
                ),

                const SizedBox(height: 12),

                StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection('campaigns')
                      .doc(liveCampaign.id)
                      .collection('applications')
                      .snapshots(),
                  builder: (context, applicationSnapshot) {
                    final applicationCount =
                        applicationSnapshot.data?.docs.length ?? 0;

                    return SizedBox(
                      height: 55,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CampaignApplicantsScreen(
                                campaign: liveCampaign,
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.people_alt_outlined),
                        label:
                            applicationSnapshot.connectionState ==
                                ConnectionState.waiting
                            ? const Text('View Applicants')
                            : Text('View Applicants ($applicationCount)'),
                      ),
                    );
                  },
                ),
              ],

              const SizedBox(height: 28),

              _buildZoneReviewSection(liveCampaign),

              if (status == 'completed') ...[
                const SizedBox(height: 20),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        const Icon(Icons.verified, size: 46),

                        const SizedBox(height: 10),

                        const Text(
                          'Campaign Completed',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 8),

                        const Text(
                          'All campaign zones have been approved.',
                          textAlign: TextAlign.center,
                        ),

                        const SizedBox(height: 20),

                        ElevatedButton.icon(
                          icon: const Icon(Icons.rate_review),
                          label: const Text('Review Scalers'),

                          onPressed: () async {
                            final data =
                                liveCampaign.data() as Map<String, dynamic>;

                            final scalerId = data['completedBy']?.toString();

                            if (scalerId == null || scalerId.isEmpty) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'No Scaler found for this campaign.',
                                  ),
                                ),
                              );

                              return;
                            }

                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => CreateReviewScreen(
                                  campaignId: liveCampaign.id,
                                  reviewerId:
                                      FirebaseAuth.instance.currentUser!.uid,
                                  reviewerType: 'business',
                                  targetId: scalerId,
                                  targetType: 'scaler',
                                ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                ElevatedButton.icon(
                  icon: const Icon(Icons.rate_review_outlined),
                  label: const Text('View Scaler Reviews'),

                  onPressed: () async {
                    final data = liveCampaign.data() as Map<String, dynamic>;

                    final scalerId = data['completedBy']?.toString();

                    if (scalerId == null || scalerId.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('No completed scaler found.'),
                        ),
                      );

                      return;
                    }

                    await _openScalerReviews(context, scalerId);
                  },
                ),
              ],
              const SizedBox(height: 30),

              _cancellationOptions(context, liveCampaign, data),

              if (status == 'open' ||
                  status == 'canceling' ||
                  status == 'canceled')
                const SizedBox(height: 15),

              if (status != 'completed') ...[
                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.edit),
                    label: const Text('Edit Campaign'),
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              EditCampaignScreen(campaign: liveCampaign),
                        ),
                      );
                    },
                  ),
                ),

                const SizedBox(height: 15),
              ],

              if (status == 'draft') ...[
                _launchDraftButton(context, liveCampaign),
                const SizedBox(height: 15),
              ],

              if (status == 'draft')
                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                    icon: const Icon(Icons.delete),
                    label: const Text('Delete Draft'),
                    onPressed: () {
                      _deleteCampaign(context, liveCampaign.reference);
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _infoCard(IconData icon, String title, String value) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(value),
      ),
    );
  }

  Widget _materialPlanCard(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    Map<String, dynamic> data,
  ) {
    final logistics = MaterialLogisticsDraft.fromCampaign(data);
    final locked = data['materialLogisticsLockedAt'] != null;
    final label = switch (logistics.fulfillmentType) {
      MaterialLogisticsDraft.scalerPickupPrintShop => 'Printing Shop Pickup',
      MaterialLogisticsDraft.scalerPickupBusiness => 'Business Pickup',
      MaterialLogisticsDraft.businessDelivery => 'Business Delivery',
      _ => 'No Physical Materials Required',
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.inventory_2_outlined),
                SizedBox(width: 10),
                Text(
                  'MATERIAL FULFILLMENT',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(label, style: Theme.of(context).textTheme.titleMedium),
            if (logistics.printingShopName.isNotEmpty)
              Text('Printing shop: ${logistics.printingShopName}'),
            if (logistics.location.isNotEmpty)
              Text('Location: ${logistics.location}'),
            if (logistics.scheduledAt != null)
              Text('Date/time: ${_formatDateTime(logistics.scheduledAt!)}'),
            if (logistics.windowEndAt != null)
              Text('Window ends: ${_formatDateTime(logistics.windowEndAt!)}'),
            if (logistics.instructions.isNotEmpty)
              Text('Instructions: ${logistics.instructions}'),
            const SizedBox(height: 8),
            Text(
              locked
                  ? 'Locked — a Scaler accepted these terms'
                  : 'Editable until a Scaler is assigned',
            ),
            const SizedBox(height: 8),
            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('campaignZones')
                  .where('campaignId', isEqualTo: liveCampaign.id)
                  .limit(10)
                  .snapshots(),
              builder: (context, snapshot) {
                QueryDocumentSnapshot<Map<String, dynamic>>? assigned;
                for (final zone in snapshot.data?.docs ?? const []) {
                  final zoneData = zone.data();
                  if (zoneData['assignedScalerId'] != null ||
                      (zoneData['assignedScalerIds'] as List?)?.isNotEmpty ==
                          true) {
                    assigned = zone;
                    break;
                  }
                }
                if (locked && assigned != null) {
                  return FilledButton.icon(
                    onPressed: () => AppNavigation.push(
                      context,
                      AppRoutes.jobRoom(assigned!.id),
                    ),
                    icon: const Icon(Icons.meeting_room_outlined),
                    label: const Text('Open Job Room'),
                  );
                }
                return OutlinedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          EditCampaignScreen(campaign: liveCampaign),
                    ),
                  ),
                  icon: const Icon(Icons.edit_outlined),
                  label: Text(
                    locked ? 'View Material Plan' : 'Edit Material Plan',
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  String _deadlineLabel(Map<String, dynamic> data) {
    final deadlineAt = data['deadlineAt'] ?? data['deadline'];

    if (deadlineAt is Timestamp) {
      final date = deadlineAt.toDate();

      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;

      final minute = date.minute.toString().padLeft(2, '0');

      final period = date.hour >= 12 ? 'PM' : 'AM';

      return '${date.month}/${date.day}/${date.year} '
          '$hour:$minute $period';
    }

    if (deadlineAt is DateTime) return _formatDateTime(deadlineAt);
    if (deadlineAt is String) {
      final parsed = DateTime.tryParse(deadlineAt);
      if (parsed != null) return _formatDateTime(parsed);
      final match = RegExp(
        r'Timestamp\(seconds=(\d+), nanoseconds=\d+\)',
      ).firstMatch(deadlineAt);
      if (match != null) {
        return _formatDateTime(
          DateTime.fromMillisecondsSinceEpoch(
            int.parse(match.group(1)!) * 1000,
          ),
        );
      }
    }
    if (deadlineAt is Map) {
      final seconds = deadlineAt['seconds'] ?? deadlineAt['_seconds'];
      if (seconds is num) {
        return _formatDateTime(
          DateTime.fromMillisecondsSinceEpoch(seconds.toInt() * 1000),
        );
      }
    }
    return 'No deadline';
  }

  String _formatDateTime(DateTime date) {
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    return '${date.month}/${date.day}/${date.year} $hour:'
        '${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
  }

  String _formatTimestamp(dynamic value) {
    if (value is! Timestamp) {
      return 'Not available';
    }

    final date = value.toDate();

    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;

    final minute = date.minute.toString().padLeft(2, '0');

    final period = date.hour >= 12 ? 'PM' : 'AM';

    return '${date.month}/${date.day}/${date.year} '
        '$hour:$minute $period';
  }

  String _verificationLabel(RouteVerification verification) {
    if (!verification.canVerify) {
      return 'Not Verified';
    }

    if (verification.compliancePercent >= 90) {
      return 'Strong Route Match';
    }

    if (verification.compliancePercent >= 70) {
      return 'Review Recommended';
    }

    return 'Low Route Match';
  }

  IconData _verificationIcon(RouteVerification verification) {
    if (!verification.canVerify) {
      return Icons.help_outline;
    }

    if (verification.compliancePercent >= 90) {
      return Icons.verified;
    }

    if (verification.compliancePercent >= 70) {
      return Icons.warning_amber;
    }

    return Icons.error_outline;
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'draft':
        return 'Draft';

      case 'open':
        return 'Open';

      case 'unassigned':
        return 'Unassigned';

      case 'assigned':
        return 'Assigned';

      case 'accepted':
        return 'Accepted';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Submitted for Review';

      case 'completed':
        return 'Completed';

      default:
        return status;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'draft':
        return Icons.edit_note;

      case 'open':
        return Icons.public;

      case 'unassigned':
        return Icons.person_off_outlined;

      case 'assigned':
        return Icons.person_outline;

      case 'accepted':
        return Icons.assignment_turned_in;

      case 'in_progress':
        return Icons.play_circle;

      case 'submitted':
        return Icons.hourglass_top;

      case 'completed':
        return Icons.verified;

      default:
        return Icons.flag;
    }
  }
}

class RouteVerification {
  final int totalPoints;
  final int insidePoints;
  final int outsidePoints;
  final double compliancePercent;
  final List<LatLng> outsideLocations;
  final bool canVerify;

  const RouteVerification({
    required this.totalPoints,
    required this.insidePoints,
    required this.outsidePoints,
    required this.compliancePercent,
    required this.outsideLocations,
    required this.canVerify,
  });
}
