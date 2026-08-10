import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/platform_billing_service.dart';
import 'campaign_zones_screen.dart';
import 'campaign/campaign_locations_screen.dart';
import '../../widgets/mapped_address_field.dart';

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

  final materialAddressController = TextEditingController();
  final materialInstructionsController = TextEditingController();
  final materialQuantityController = TextEditingController();

  final PlatformBillingService _billingService = PlatformBillingService();

  DateTime? _marketingDate;

  TimeOfDay? _startTime;
  TimeOfDay? _deadlineTime;

  String _campaignType = 'flyer_distribution';

  String _materialSource = 'business_provided';

  String _materialHandoffMethod = 'business_pickup';
  double? _materialHandoffLatitude;
  double? _materialHandoffLongitude;

  bool _trackingEnabled = false;

  bool publishing = false;

  static const Set<String> _distributionCampaignTypes = {
    'flyer_distribution',
    'door_hanger_distribution',
    'business_card_distribution',
  };

  static const Set<String> _marketingMaterialCampaignTypes = {
    'flyer_distribution',
    'door_hanger_distribution',
    'business_card_distribution',
    'yard_sign_installation',
  };

  bool get _usesCampaignZones {
    return _distributionCampaignTypes.contains(_campaignType);
  }

  bool get _usesMarketingMaterials {
    return _marketingMaterialCampaignTypes.contains(_campaignType);
  }

  bool get _usesBusinessProvidedMaterials {
    return _usesMarketingMaterials && _materialSource == 'business_provided';
  }

  bool get _requiresExactLocations {
    return _campaignType == 'yard_sign_installation' ||
        _campaignType == 'dump_run' ||
        _campaignType == 'event_marketing';
  }

  bool get _canPublishThroughCurrentWorkflow {
    return _usesCampaignZones;
  }

  @override
  void dispose() {
    campaignNameController.dispose();
    descriptionController.dispose();
    payController.dispose();
    bonusController.dispose();
    scalerCountController.dispose();
    materialAddressController.dispose();
    materialInstructionsController.dispose();
    materialQuantityController.dispose();

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

    if (selected == null || !mounted) {
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

    if (selected == null || !mounted) {
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

    if (selected == null || !mounted) {
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

  String _campaignTypeLabel(String type) {
    switch (type) {
      case 'flyer_distribution':
        return 'Flyer Distribution';

      case 'door_hanger_distribution':
        return 'Door Hanger Distribution';

      case 'business_card_distribution':
        return 'Business Card Distribution';

      case 'yard_sign_installation':
        return 'Yard Sign Installation';

      case 'dump_run':
        return 'Dump Run';

      case 'event_marketing':
        return 'Event Marketing';

      default:
        return type;
    }
  }

  String _campaignTypeDescription(String type) {
    switch (type) {
      case 'flyer_distribution':
        return 'Scalers distribute flyers throughout mapped neighborhoods.';

      case 'door_hanger_distribution':
        return 'Scalers distribute door hangers throughout mapped neighborhoods.';

      case 'business_card_distribution':
        return 'Scalers distribute business cards in the selected campaign area.';

      case 'yard_sign_installation':
        return 'Install signs at exact addresses or map pins specified by the business.';

      case 'dump_run':
        return 'Pickup and haul material from one location to a designated disposal location.';

      case 'event_marketing':
        return 'Send Scalers to a specific event or venue for local promotion.';

      default:
        return '';
    }
  }

  String _materialSourceLabel(String source) {
    switch (source) {
      case 'business_provided':
        return 'I Already Have My Materials';

      case 'scaled_circle_generated':
        return 'Create Tracked Materials with Scaled Circle';

      case 'printed_by_scaled_circle':
        return 'Scaled Circle Printing';

      default:
        return source;
    }
  }

  String _handoffLabel(String value) {
    switch (value) {
      case 'business_pickup':
        return 'Scaler Picks Up from Business';

      case 'business_dropoff':
        return 'Business Drops Off Materials';

      default:
        return value;
    }
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
      ).showSnackBar(const SnackBar(content: Text('Choose a campaign date.')));

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

    final maximumWorkerBudget = (basePay + completionBonus) * scalerCount;

    if (maximumWorkerBudget <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Campaign worker budget must be greater than zero.'),
        ),
      );

      return;
    }

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

      final materialQuantity =
          int.tryParse(materialQuantityController.text.trim()) ?? 0;

      final initialData = <String, dynamic>{
        'businessId': user.uid,
        'businessEmail': user.email,
        'campaignName': campaignName,
        'description': descriptionController.text.trim(),

        'campaignType': _campaignType,
        'campaignTypeLabel': _campaignTypeLabel(_campaignType),

        'configurationMode': _usesCampaignZones ? 'zones' : 'exact_locations',

        'requiresExactLocations': _requiresExactLocations,

        'basePay': basePay,
        'bonus': completionBonus,

        'requestedScalerCount': scalerCount,
        'assignedScalerCount': 0,

        'maximumWorkerBudget': maximumWorkerBudget,
        'workerBudget': maximumWorkerBudget,
        'reservedWorkerBudget': 0.0,

        'platformFeeRate': PlatformBillingService.campaignFeeRate,

        'platformFee': platformFee,

        'totalCampaignCost': totalCampaignCost,

        'fundingStatus': 'not_reserved',
        'platformFeeStatus': 'not_charged',

        'marketingDate': Timestamp.fromDate(_marketingDate!),

        'startAt': Timestamp.fromDate(startDateTime),

        'deadlineAt': Timestamp.fromDate(deadlineDateTime),

        'status': 'draft',

        'applications': 0,
        'zoneCount': 0,
        'mappedZoneCount': 0,

        'estimatedHomes': 0,
        'estimatedWalkingMiles': 0.0,
        'estimatedMinutes': 0,
        'suggestedBasePayTotal': 0.0,
        'recommendedScalerCount': 0,

        'trackingEnabled': _trackingEnabled,

        'createdAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (_usesMarketingMaterials) {
        initialData.addAll({
          'materialSource': _materialSource,
          'materialQuantity': materialQuantity,
        });
      }

      if (_usesBusinessProvidedMaterials) {
        initialData.addAll({
          'materialHandoffMethod': _materialHandoffMethod,

          'materialHandoffAddress': materialAddressController.text.trim(),
          'materialHandoffLatitude': _materialHandoffLatitude,
          'materialHandoffLongitude': _materialHandoffLongitude,

          'materialHandoffInstructions': materialInstructionsController.text
              .trim(),
        });
      }

      await campaignReference.set(initialData);

      final campaignSnapshot = await campaignReference.get();

      if (!mounted) {
        return;
      }

      /*
       * Exact-location campaigns remain drafts
       * until the location configuration screen
       * is connected.
       *
       * We intentionally do not reserve money
       * or publish them without their required
       * addresses / map pins.
       */
      if (!_canPublishThroughCurrentWorkflow) {
        await campaignReference.update({
          'status': 'draft',
          'setupStatus': 'locations_required',
          'updatedAt': FieldValue.serverTimestamp(),
        });

        if (!mounted) {
          return;
        }

        final locationsConfigured = await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => CampaignLocationsScreen(
              campaignReference: campaignReference!,
              campaignType: _campaignType,
            ),
          ),
        );

        if (!mounted) {
          return;
        }

        if (locationsConfigured != true) {
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

        final locationsSnapshot = await FirebaseFirestore.instance
            .collection('campaignLocations')
            .where('campaignId', isEqualTo: campaignReference.id)
            .get();

        if (locationsSnapshot.docs.isEmpty) {
          throw Exception('Add at least one location before publishing.');
        }

        await campaignReference.update({
          'locationCount': locationsSnapshot.docs.length,
          'setupStatus': 'configured',
          'updatedAt': FieldValue.serverTimestamp(),
        });

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
              '${_campaignTypeLabel(_campaignType)} published. '
              '\$${chargedWorkerBudget.toStringAsFixed(2)} secured for Scaler pay '
              '+ \$${chargedPlatformFee.toStringAsFixed(2)} Scaled Circle fee '
              '= \$${chargedTotal.toStringAsFixed(2)} total credits.',
            ),
          ),
        );

        Navigator.pop(context);

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

      final zonesConfigured = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignZonesScreen(campaign: campaignSnapshot),
        ),
      );

      if (!mounted) {
        return;
      }

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

      int totalEstimatedHomes = 0;

      double totalWalkingMiles = 0;

      int totalEstimatedMinutes = 0;

      double totalSuggestedBasePay = 0;

      int totalRecommendedScalers = 0;

      for (final zone in mappedZones) {
        final data = zone.data();

        totalEstimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        totalWalkingMiles +=
            (data['estimatedWalkingMiles'] as num?)?.toDouble() ?? 0;

        totalEstimatedMinutes +=
            (data['estimatedMinutes'] as num?)?.toInt() ?? 0;

        totalSuggestedBasePay +=
            (data['suggestedBasePay'] as num?)?.toDouble() ?? 0;

        totalRecommendedScalers +=
            (data['recommendedScalerCount'] as num?)?.toInt() ?? 0;
      }

      await campaignReference.update({
        'zoneCount': zonesSnapshot.docs.length,

        'mappedZoneCount': mappedZones.length,

        'estimatedHomes': totalEstimatedHomes,

        'estimatedWalkingMiles': totalWalkingMiles,

        'estimatedMinutes': totalEstimatedMinutes,

        'suggestedBasePayTotal': totalSuggestedBasePay,

        'recommendedScalerCount': totalRecommendedScalers,

        'setupStatus': 'configured',

        'updatedAt': FieldValue.serverTimestamp(),
      });

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
          (latestCampaignData['reservedWorkerBudget'] as num?)?.toDouble() ?? 0;

      final alreadyFunded =
          fundingStatus == 'reserved' && existingReservedBudget > 0;

      Map<String, double> funding = {
        'workerBudget': maximumWorkerBudget,
        'platformFee': platformFee,
        'totalCharge': totalCampaignCost,
      };

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
      if (campaignReference != null) {
        try {
          final snapshot = await campaignReference.get();

          if (snapshot.exists) {
            final data = snapshot.data();

            final fundingStatus = data?['fundingStatus']?.toString();

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
    final previewBasePay = double.tryParse(payController.text.trim()) ?? 0;

    final previewBonus = double.tryParse(bonusController.text.trim()) ?? 0;

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
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Create Campaign',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              const Text(
                'Choose the kind of field work, configure materials, '
                'schedule the campaign, and secure Scaler compensation.',
              ),

              const SizedBox(height: 28),

              const Text(
                'Campaign Type',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 12),

              RadioGroup<String>(
                groupValue: _campaignType,
                onChanged: (value) {
                  if (publishing || value == null) {
                    return;
                  }

                  setState(() {
                    _campaignType = value;
                  });
                },
                child: Column(
                  children:
                      [
                        'flyer_distribution',
                        'door_hanger_distribution',
                        'business_card_distribution',
                        'yard_sign_installation',
                        'dump_run',
                        'event_marketing',
                      ].map((type) {
                        return Card(
                          child: RadioListTile<String>(
                            value: type,
                            title: Text(
                              _campaignTypeLabel(type),
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(_campaignTypeDescription(type)),
                          ),
                        );
                      }).toList(),
                ),
              ),

              if (_requiresExactLocations) ...[
                const SizedBox(height: 10),

                Card(
                  color: Colors.blue.shade50,
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.location_on_outlined),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'This campaign uses exact locations rather than '
                            'a canvassing zone. After this screen we will '
                            'configure addresses and map pins.',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],

              if (_usesMarketingMaterials) ...[
                const SizedBox(height: 28),

                const Text(
                  'Marketing Materials',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                DropdownButtonFormField<String>(
                  initialValue: _materialSource,
                  decoration: const InputDecoration(
                    labelText: 'Material Source',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'business_provided',
                      child: Text('I Already Have My Materials'),
                    ),
                    DropdownMenuItem(
                      value: 'scaled_circle_generated',
                      child: Text(
                        'Create Tracked Materials with Scaled Circle',
                      ),
                    ),
                    DropdownMenuItem(
                      value: 'printed_by_scaled_circle',
                      child: Text('Scaled Circle Printing'),
                    ),
                  ],
                  onChanged: publishing
                      ? null
                      : (value) {
                          if (value == null) {
                            return;
                          }

                          setState(() {
                            _materialSource = value;
                          });
                        },
                ),

                const SizedBox(height: 10),

                Text(
                  _materialSourceLabel(_materialSource),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),

                const SizedBox(height: 18),

                TextFormField(
                  controller: materialQuantityController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Material Quantity',
                    hintText: 'Example: 500',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (!_usesMarketingMaterials) {
                      return null;
                    }

                    if (value == null || value.trim().isEmpty) {
                      return null;
                    }

                    final quantity = int.tryParse(value.trim());

                    if (quantity == null || quantity < 1) {
                      return 'Enter a valid quantity';
                    }

                    return null;
                  },
                ),

                if (_usesBusinessProvidedMaterials) ...[
                  const SizedBox(height: 20),

                  DropdownButtonFormField<String>(
                    initialValue: _materialHandoffMethod,
                    decoration: const InputDecoration(
                      labelText: 'Material Handoff',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'business_pickup',
                        child: Text('Scaler Picks Up from Business'),
                      ),
                      DropdownMenuItem(
                        value: 'business_dropoff',
                        child: Text('Business Drops Off Materials'),
                      ),
                    ],
                    onChanged: publishing
                        ? null
                        : (value) {
                            if (value == null) {
                              return;
                            }

                            setState(() {
                              _materialHandoffMethod = value;
                            });
                          },
                  ),

                  const SizedBox(height: 8),

                  Text(_handoffLabel(_materialHandoffMethod)),

                  const SizedBox(height: 18),

                  MappedAddressField(
                    controller: materialAddressController,
                    labelText: 'Pickup / Drop-off Address',
                    hintText: 'Enter the full street address',
                    onChanged: (_) {
                      _materialHandoffLatitude = null;
                      _materialHandoffLongitude = null;
                    },
                    onSelected: (suggestion) {
                      _materialHandoffLatitude = suggestion.latitude;
                      _materialHandoffLongitude = suggestion.longitude;
                    },
                    validator: (value) {
                      if (!_usesBusinessProvidedMaterials) {
                        return null;
                      }

                      if (value == null || value.trim().isEmpty) {
                        return 'Enter the material handoff address';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 18),

                  TextFormField(
                    controller: materialInstructionsController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Material Handoff Instructions',
                      hintText: 'Example: Ask for Mike at the front desk.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],

                if (_materialSource == 'scaled_circle_generated') ...[
                  const SizedBox(height: 16),

                  Card(
                    color: Colors.green.shade50,
                    child: const Padding(
                      padding: EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.auto_awesome_outlined),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Scaled Circle-created materials can eventually '
                              'include campaign QR codes, tracking phone '
                              'numbers, landing pages, and forwarding email '
                              'addresses so leads can be attributed to this '
                              'campaign.',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Enable Campaign Tracking'),
                  subtitle: const Text(
                    'Prepare this campaign for QR, phone, website, '
                    'landing-page, and email attribution.',
                  ),
                  value: _trackingEnabled,
                  onChanged: publishing
                      ? null
                      : (value) {
                          setState(() {
                            _trackingEnabled = value;
                          });
                        },
                ),
              ],

              const SizedBox(height: 28),

              TextFormField(
                controller: campaignNameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Campaign Name',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Required';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: descriptionController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Required';
                  }

                  return null;
                },
              ),

              const SizedBox(height: 28),

              const Text(
                'Campaign Schedule',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 12),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.calendar_month),
                  title: const Text('Campaign Date'),
                  subtitle: Text(_formatDate(_marketingDate)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: publishing ? null : _pickMarketingDate,
                ),
              ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.play_circle_outline),
                  title: const Text('Start Time'),
                  subtitle: Text(_formatTime(_startTime)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: publishing ? null : _pickStartTime,
                ),
              ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.timer_outlined),
                  title: const Text('Completion Deadline'),
                  subtitle: Text(_formatTime(_deadlineTime)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: publishing ? null : _pickDeadlineTime,
                ),
              ),

              const SizedBox(height: 28),

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
                decoration: const InputDecoration(
                  labelText: 'Scalers Needed',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.groups_outlined),
                ),
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
              ),

              const SizedBox(height: 28),

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
                decoration: const InputDecoration(
                  labelText: 'Base Pay per Scaler (\$)',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Required';
                  }

                  final amount = double.tryParse(value.trim());

                  if (amount == null || amount <= 0) {
                    return 'Enter an amount greater than zero';
                  }

                  return null;
                },
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
                decoration: const InputDecoration(
                  labelText: 'Completion Bonus per Scaler (\$)',
                  helperText: 'Paid when completion requirements are met.',
                  border: OutlineInputBorder(),
                ),
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
                          'campaign becomes visible to Scalers. '
                          'The campaign platform fee is charged when '
                          'the campaign launches.',
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
                      : Icon(
                          _usesCampaignZones
                              ? Icons.map_outlined
                              : Icons.location_on_outlined,
                        ),
                  label: Text(
                    publishing
                        ? 'Creating Campaign...'
                        : _usesCampaignZones
                        ? 'Create & Define Zones'
                        : 'Create & Define Locations',
                  ),
                ),
              ),
            ],
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
