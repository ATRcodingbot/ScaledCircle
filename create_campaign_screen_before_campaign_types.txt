import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/platform_billing_service.dart';
import 'campaign_zones_screen.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() => _CreateCampaignScreenState();
}

class _CreateCampaignScreenState extends State<CreateCampaignScreen> {
  final _formKey = GlobalKey<FormState>();

  final campaignNameController = TextEditingController();

  final descriptionController = TextEditingController();

  final payController = TextEditingController();

  final bonusController = TextEditingController();

  final scalerCountController = TextEditingController(text: '1');

  final PlatformBillingService _billingService = PlatformBillingService();

  DateTime? _marketingDate;

  TimeOfDay? _startTime;

  TimeOfDay? _deadlineTime;

  bool publishing = false;

  @override
  void dispose() {
    campaignNameController.dispose();

    descriptionController.dispose();

    payController.dispose();

    bonusController.dispose();

    scalerCountController.dispose();

    super.dispose();
  }

  Future<void> _pickMarketingDate() async {
    final now = DateTime.now();

    final initialDate = _marketingDate ?? now.add(const Duration(days: 1));

    final selected = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 3),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _marketingDate = DateTime(selected.year, selected.month, selected.day);
    });
  }

  Future<void> _pickStartTime() async {
    final selected = await showTimePicker(
      context: context,
      initialTime: _startTime ?? const TimeOfDay(hour: 9, minute: 0),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _startTime = selected;
    });
  }

  Future<void> _pickDeadlineTime() async {
    final selected = await showTimePicker(
      context: context,
      initialTime: _deadlineTime ?? const TimeOfDay(hour: 17, minute: 0),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _deadlineTime = selected;
    });
  }

  DateTime? _combineDateAndTime(DateTime? date, TimeOfDay? time) {
    if (date == null || time == null) {
      return null;
    }

    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  String _formatDate(DateTime? date) {
    if (date == null) {
      return 'Choose marketing date';
    }

    return '${date.month}/${date.day}/${date.year}';
  }

  String _formatTime(TimeOfDay? time) {
    if (time == null) {
      return 'Choose time';
    }

    return time.format(context);
  }

  Future<void> publishCampaign() async {
    if (publishing) {
      return;
    }

    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_marketingDate == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Choose a marketing date.')));

      return;
    }

    if (_startTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a campaign start time.')),
      );

      return;
    }

    if (_deadlineTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a completion deadline.')),
      );

      return;
    }

    final startDateTime = _combineDateAndTime(_marketingDate, _startTime);

    final deadlineDateTime = _combineDateAndTime(_marketingDate, _deadlineTime);

    if (startDateTime == null || deadlineDateTime == null) {
      return;
    }

    if (!deadlineDateTime.isAfter(startDateTime)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Completion deadline must be after the start time.'),
        ),
      );

      return;
    }

    final scalerCount = int.tryParse(scalerCountController.text.trim());

    if (scalerCount == null || scalerCount < 1) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter at least 1 Scaler.')));

      return;
    }

    final basePay = double.tryParse(payController.text.trim()) ?? 0.0;

    final completionBonus = double.tryParse(bonusController.text.trim()) ?? 0.0;

    /*
     * Worker budget is the maximum amount
     * that can ultimately be paid to Scalers.
     *
     * Example:
     *
     * $100 base
     * $150 bonus
     * 1 Scaler
     *
     * Worker budget = $250.
     */
    final maximumWorkerBudget = (basePay + completionBonus) * scalerCount;

    if (maximumWorkerBudget <= 0.0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Campaign worker budget must be greater than zero.'),
        ),
      );

      return;
    }

    /*
     * Platform fee is currently 10%.
     *
     * $250 worker budget
     * = $25 platform fee
     * = $275 total campaign cost.
     */
    final platformFee = _billingService.calculateCampaignFee(
      maximumWorkerBudget,
    );

    final totalCampaignCost = _billingService.calculateCampaignTotal(
      maximumWorkerBudget,
    );

    setState(() {
      publishing = true;
    });

    DocumentReference<Map<String, dynamic>>? campaignReference;

    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in to create a campaign.');
      }

      /*
       * Scaled Circle requires an active
       * subscription before a business can
       * create/run campaigns.
       */
      final hasActiveSubscription = await _billingService.hasActiveSubscription(
        businessId: user.uid,
      );

      if (!hasActiveSubscription) {
        throw Exception(
          'An active Scaled Circle subscription is required '
          'before creating a campaign.',
        );
      }

      final campaignName = campaignNameController.text.trim();

      campaignReference = FirebaseFirestore.instance
          .collection('campaigns')
          .doc();

      /*
       * Create the draft.
       *
       * Nothing has been charged yet.
       */
      await campaignReference.set({
        'businessId': user.uid,

        'businessEmail': user.email,

        'campaignName': campaignName,

        'description': descriptionController.text.trim(),

        /*
         * Compensation advertised to the
         * Scaler.
         */
        'basePay': basePay,

        'bonus': completionBonus,

        'requestedScalerCount': scalerCount,

        'assignedScalerCount': 0,

        /*
         * Worker compensation.
         */
        'maximumWorkerBudget': maximumWorkerBudget,

        'workerBudget': maximumWorkerBudget,

        'reservedWorkerBudget': 0.0,

        /*
         * Scaled Circle revenue.
         */
        'platformFeeRate': PlatformBillingService.campaignFeeRate,

        'platformFee': platformFee,

        /*
         * Total credits required from
         * the business.
         */
        'totalCampaignCost': totalCampaignCost,

        'fundingStatus': 'not_reserved',

        'platformFeeStatus': 'not_charged',

        'marketingDate': Timestamp.fromDate(_marketingDate!),

        'startAt': Timestamp.fromDate(startDateTime),

        'deadlineAt': Timestamp.fromDate(deadlineDateTime),

        /*
         * Draft campaigns are invisible
         * to Scalers.
         */
        'status': 'draft',

        'applications': 0,

        'zoneCount': 0,

        'mappedZoneCount': 0,

        'estimatedHomes': 0,

        'estimatedWalkingMiles': 0.0,

        'estimatedMinutes': 0,

        'suggestedBasePayTotal': 0.0,

        'recommendedScalerCount': 0,

        'createdAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      final campaignSnapshot = await campaignReference.get();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Campaign draft created. '
            '\$${maximumWorkerBudget.toStringAsFixed(2)} worker budget '
            '+ \$${platformFee.toStringAsFixed(2)} platform fee '
            '= \$${totalCampaignCost.toStringAsFixed(2)} total.',
          ),
        ),
      );

      /*
       * Business now defines zones.
       */
      final zonesConfigured = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignZonesScreen(campaign: campaignSnapshot),
        ),
      );

      if (!mounted) {
        return;
      }

      /*
       * Backing out leaves an unpaid draft.
       */
      if (zonesConfigured != true) {
        await campaignReference.update({
          'status': 'draft',
          'fundingStatus': 'not_reserved',
          'platformFeeStatus': 'not_charged',
          'updatedAt': FieldValue.serverTimestamp(),
        });

        if (!mounted) {
          return;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Campaign saved as a draft. '
              'No campaign funding was charged.',
            ),
          ),
        );

        Navigator.pop(context);

        return;
      }

      /*
       * Load campaign zones.
       */
      final zonesSnapshot = await FirebaseFirestore.instance
          .collection('campaignZones')
          .where('campaignId', isEqualTo: campaignReference.id)
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

      /*
       * Campaign intelligence totals.
       */
      int totalEstimatedHomes = 0;

      double totalWalkingMiles = 0.0;

      int totalEstimatedMinutes = 0;

      double totalSuggestedBasePay = 0.0;

      int totalRecommendedScalers = 0;

      for (final zone in mappedZones) {
        final data = zone.data();

        totalEstimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        totalWalkingMiles +=
            (data['estimatedWalkingMiles'] as num?)?.toDouble() ?? 0.0;

        totalEstimatedMinutes +=
            (data['estimatedMinutes'] as num?)?.toInt() ?? 0;

        totalSuggestedBasePay +=
            (data['suggestedBasePay'] as num?)?.toDouble() ?? 0.0;

        totalRecommendedScalers +=
            (data['recommendedScalerCount'] as num?)?.toInt() ?? 0;
      }

      await campaignReference.update({
        'zoneCount': zonesSnapshot.docs.length,

        'mappedZoneCount': mappedZones.length,

        'estimatedHomes': totalEstimatedHomes,

        'estimatedWalkingMiles': totalWalkingMiles,

        'estimatedMinutes': totalEstimatedMinutes,

        /*
         * Recommendation only.
         *
         * IMPORTANT:
         * This must NOT silently replace
         * campaign basePay when the Scaler
         * is paid.
         */
        'suggestedBasePayTotal': totalSuggestedBasePay,

        'recommendedScalerCount': totalRecommendedScalers,

        'updatedAt': FieldValue.serverTimestamp(),
      });

      /*
       * Make sure we did not already fund
       * this campaign.
       */
      final latestCampaignSnapshot = await campaignReference.get();

      if (!latestCampaignSnapshot.exists) {
        throw Exception('Campaign no longer exists.');
      }

      final latestCampaignData = latestCampaignSnapshot.data();

      if (latestCampaignData == null) {
        throw Exception('Campaign data is invalid.');
      }

      final fundingStatus = latestCampaignData['fundingStatus']?.toString();

      final existingReservedBudget =
          (latestCampaignData['reservedWorkerBudget'] as num?)?.toDouble() ??
          0.0;

      final alreadyFunded =
          fundingStatus == 'reserved' && existingReservedBudget > 0.0;

      Map<String, double> funding = {
        'workerBudget': maximumWorkerBudget,
        'platformFee': platformFee,
        'totalCharge': totalCampaignCost,
      };

      /*
       * Charge campaign.
       *
       * fundCampaign():
       *
       * Business available credits:
       * - worker budget
       * - platform fee
       *
       * Business reserved credits:
       * + worker budget
       *
       * Admin wallet:
       * + platform fee
       */
      if (!alreadyFunded) {
        funding = await _billingService.fundCampaign(
          businessId: user.uid,
          campaignId: campaignReference.id,
          workerBudget: maximumWorkerBudget,
          description: 'Worker funding reserved for $campaignName.',
        );
      }

      final chargedWorkerBudget =
          funding['workerBudget'] ?? maximumWorkerBudget;

      final chargedPlatformFee = funding['platformFee'] ?? platformFee;

      final chargedTotal = funding['totalCharge'] ?? totalCampaignCost;

      /*
       * Funding succeeded.
       *
       * Campaign can now become visible
       * to Scalers.
       */
      await campaignReference.update({
        'status': 'open',

        'fundingStatus': 'reserved',

        'platformFeeStatus': 'charged',

        'workerBudget': chargedWorkerBudget,

        'reservedWorkerBudget': alreadyFunded
            ? existingReservedBudget
            : chargedWorkerBudget,

        'platformFee': chargedPlatformFee,

        'totalCampaignCost': chargedTotal,

        'fundedAt':
            latestCampaignData['fundedAt'] ?? FieldValue.serverTimestamp(),

        'publishedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Campaign published. '
            '\$${chargedWorkerBudget.toStringAsFixed(2)} secured for Scaler pay '
            '+ \$${chargedPlatformFee.toStringAsFixed(2)} Scaled Circle fee '
            '= \$${chargedTotal.toStringAsFixed(2)} total credits.',
          ),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      /*
       * Campaigns that fail before successful
       * funding/publication remain drafts.
       */
      if (campaignReference != null) {
        try {
          final snapshot = await campaignReference.get();

          if (snapshot.exists) {
            final data = snapshot.data();

            final fundingStatus = data?['fundingStatus']?.toString();

            /*
             * If no money moved, safely
             * restore draft status.
             *
             * If money DID move, we do not
             * blindly reverse it here because
             * the worker reserve and platform
             * revenue must be reversed together.
             *
             * We will put that reversal inside
             * PlatformBillingService.
             */
            if (fundingStatus != 'reserved') {
              await campaignReference.update({
                'status': 'draft',
                'fundingStatus': 'not_reserved',
                'platformFeeStatus': 'not_charged',
                'updatedAt': FieldValue.serverTimestamp(),
              });
            }
          }
        } catch (updateError) {
          debugPrint(
            'Unable to restore campaign draft state: '
            '$updateError',
          );
        }
      }

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to publish campaign: $e')));
    } finally {
      if (mounted) {
        setState(() {
          publishing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final previewBasePay = double.tryParse(payController.text.trim()) ?? 0.0;

    final previewBonus = double.tryParse(bonusController.text.trim()) ?? 0.0;

    final previewScalers = int.tryParse(scalerCountController.text.trim()) ?? 1;

    final previewWorkerBudget =
        (previewBasePay + previewBonus) * previewScalers;

    final previewPlatformFee = _billingService.calculateCampaignFee(
      previewWorkerBudget,
    );

    final previewTotal = previewWorkerBudget + previewPlatformFee;

    return Scaffold(
      appBar: AppBar(title: const Text('Create Campaign'), centerTitle: true),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                const Text(
                  'New Marketing Campaign',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 8),

                const Text(
                  'Set the schedule, staffing, and compensation. '
                  'Next, define one or more canvassing zones.',
                ),

                const SizedBox(height: 30),

                TextFormField(
                  controller: campaignNameController,
                  textInputAction: TextInputAction.next,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Required';
                    }

                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Campaign Name',
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 20),

                TextFormField(
                  controller: descriptionController,
                  maxLines: 4,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Required';
                    }

                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Campaign Schedule',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                Card(
                  child: ListTile(
                    leading: const Icon(Icons.calendar_month),
                    title: const Text('Marketing Date'),
                    subtitle: Text(_formatDate(_marketingDate)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _pickMarketingDate,
                  ),
                ),

                Card(
                  child: ListTile(
                    leading: const Icon(Icons.play_circle_outline),
                    title: const Text('Start Time'),
                    subtitle: Text(_formatTime(_startTime)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _pickStartTime,
                  ),
                ),

                Card(
                  child: ListTile(
                    leading: const Icon(Icons.timer_outlined),
                    title: const Text('Completion Deadline'),
                    subtitle: Text(_formatTime(_deadlineTime)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _pickDeadlineTime,
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Staffing',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                TextFormField(
                  controller: scalerCountController,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  onChanged: (_) {
                    setState(() {});
                  },
                  validator: (value) {
                    final count = int.tryParse(value?.trim() ?? '');

                    if (count == null || count < 1) {
                      return 'Enter at least 1 Scaler';
                    }

                    if (count > 100) {
                      return 'Enter 100 or fewer for now';
                    }

                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Scalers Needed',
                    helperText:
                        'How many Scalers do you want working this campaign?',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.groups_outlined),
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Compensation',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                TextFormField(
                  controller: payController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) {
                    setState(() {});
                  },
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Required';
                    }

                    final pay = double.tryParse(value.trim());

                    if (pay == null || pay <= 0) {
                      return 'Enter an amount greater than zero';
                    }

                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Base Pay per Scaler (\$)',
                    helperText: 'Guaranteed base compensation for each Scaler.',
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 20),

                TextFormField(
                  controller: bonusController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.done,
                  onChanged: (_) {
                    setState(() {});
                  },
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return null;
                    }

                    final bonus = double.tryParse(value.trim());

                    if (bonus == null || bonus < 0) {
                      return 'Enter a valid amount';
                    }

                    return null;
                  },
                  decoration: const InputDecoration(
                    labelText: 'Completion Bonus per Scaler (\$)',
                    helperText:
                        'Paid when the completion requirements are met.',
                    border: OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 22),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.receipt_long_outlined),
                            SizedBox(width: 10),
                            Text(
                              'Campaign Cost',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 14),

                        _costRow('Scaler compensation', previewWorkerBudget),

                        const SizedBox(height: 8),

                        _costRow('Scaled Circle fee (10%)', previewPlatformFee),

                        const Divider(height: 24),

                        _costRow(
                          'Total credits required',
                          previewTotal,
                          bold: true,
                        ),

                        const SizedBox(height: 12),

                        const Text(
                          '1 credit = \$1. An active monthly subscription '
                          'is required to publish campaigns.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.account_balance_wallet_outlined),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Worker compensation is secured before the '
                            'campaign becomes visible to Scalers. The '
                            'Scaled Circle campaign fee is transferred '
                            'to platform revenue when the campaign launches.',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.home_work_outlined),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'You do not need to enter a home count. '
                            'Scaled Circle estimates the homes in each '
                            'mapped zone.',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 32),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    onPressed: publishing ? null : publishCampaign,
                    icon: publishing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.map_outlined),
                    label: Text(
                      publishing
                          ? 'Creating Campaign...'
                          : 'Create & Define Zones',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _costRow(String label, double amount, {bool bold = false}) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ),
        Text(
          '\$${amount.toStringAsFixed(2)}',
          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    );
  }
}
