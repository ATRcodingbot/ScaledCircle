import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../config/app_environment.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../models/material_logistics.dart';
import '../../services/platform_billing_service.dart';
import '../../widgets/material_fulfillment_form.dart';
import '../../widgets/legal_consent_prompt.dart';
import '../../widgets/response_tracking_feature_card.dart';
import 'campaign_zones_screen.dart';
import 'campaign/campaign_locations_screen.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({
    super.key,
    this.initialServiceArea = const [],
    this.initialServiceAreaType = 'polygon',
    this.propertyIntelligenceAnalysisId,
  });

  final List<Map<String, double>> initialServiceArea;
  final String initialServiceAreaType;
  final String? propertyIntelligenceAnalysisId;

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

  final materialQuantityController = TextEditingController();

  final PlatformBillingService _billingService = PlatformBillingService();

  DateTime? _marketingDate;

  TimeOfDay? _startTime;
  TimeOfDay? _deadlineTime;

  String _campaignType = 'flyer_distribution';

  String _materialSource = 'business_provided';

  MaterialLogisticsDraft _materialLogistics = const MaterialLogisticsDraft();

  final bool _trackingEnabled = false;

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

  Future<void> publishCampaign() async {
    if (publishing) {
      return;
    }

    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_usesMarketingMaterials) {
      final materialError = _materialLogistics.validate();
      if (materialError != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(materialError)));
        return;
      }
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

    final scalerCount = AppEnvironmentConfig.isLocal
        ? int.tryParse(scalerCountController.text.trim())
        : 1;

    if (scalerCount == null || scalerCount < 1) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter at least 1 Scaler.')));

      return;
    }

    final basePay = double.tryParse(payController.text.trim()) ?? 0.0;

    final completionBonus = double.tryParse(bonusController.text.trim()) ?? 0.0;

    final maximumWorkerBudget = basePay + completionBonus;

    if (maximumWorkerBudget <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Campaign worker budget must be greater than zero.'),
        ),
      );

      return;
    }

    final marketplaceQuote = await _billingService.campaignQuoteEstimate(
      maximumWorkerBudget,
    );
    final platformFee = marketplaceQuote['platformFee']!;
    final totalCampaignCost = marketplaceQuote['totalCharge']!;

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
        'requiredScalerCount': scalerCount,
        'assignedScalerCount': 0,

        'maximumWorkerBudget': maximumWorkerBudget,
        'workerPoolCents': (maximumWorkerBudget * 100).round(),
        'estimatedIndividualShareCents':
            (maximumWorkerBudget * 100 / scalerCount).floor(),

        'marketingDate': Timestamp.fromDate(_marketingDate!),

        'startAt': Timestamp.fromDate(startDateTime),

        'deadlineAt': Timestamp.fromDate(deadlineDateTime),

        'status': 'draft',

        'applications': 0,
        'zoneCount': 0,
        'mappedZoneCount': 0,

        'estimatedHomes': 0,

        if (widget.initialServiceArea.length >= 3) ...{
          'serviceArea': widget.initialServiceArea,
          'serviceAreaPointCount': widget.initialServiceArea.length,
          'serviceAreaType': widget.initialServiceAreaType,
          'shapeType': widget.initialServiceAreaType,
        },
        if (widget.propertyIntelligenceAnalysisId != null)
          'propertyIntelligenceAnalysisId':
              widget.propertyIntelligenceAnalysisId,

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

      if (_usesMarketingMaterials) {
        initialData.addAll({
          'materialsRequired': _materialLogistics.materialsRequired,
          'materialFulfillmentType': _materialLogistics.fulfillmentType,
          'materialHandoffMethod': _materialLogistics.fulfillmentType,
          'materialHandoffAddress': _materialLogistics.materialsRequired
              ? _materialLogistics.location.trim()
              : null,
          'materialHandoffLatitude': _materialLogistics.materialsRequired
              ? _materialLogistics.latitude
              : null,
          'materialHandoffLongitude': _materialLogistics.materialsRequired
              ? _materialLogistics.longitude
              : null,
          'materialHandoffScheduledAt':
              _materialLogistics.materialsRequired &&
                  _materialLogistics.scheduledAt != null
              ? Timestamp.fromDate(_materialLogistics.scheduledAt!)
              : null,
          'materialHandoffWindowEndAt':
              _materialLogistics.materialsRequired &&
                  _materialLogistics.windowEndAt != null
              ? Timestamp.fromDate(_materialLogistics.windowEndAt!)
              : null,
          'materialHandoffPrintingShopName':
              _materialLogistics.fulfillmentType ==
                  MaterialLogisticsDraft.scalerPickupPrintShop
              ? _materialLogistics.printingShopName.trim()
              : null,
          'materialHandoffOrderReference': _materialLogistics.materialsRequired
              ? _materialLogistics.orderReference.trim()
              : null,
          'materialHandoffInstructions': _materialLogistics.materialsRequired
              ? _materialLogistics.instructions.trim()
              : null,
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

        if (fundingStatus != 'funded') {
          final approvedQuote = await _billingService
              .campaignCostQuoteForCampaign(campaignReference.id);
          if (!mounted) return;
          if (!await ensureLegalConsentForAction(
            context,
            LegalActionConsent.businessFunding,
          )) {
            return;
          }
          await _billingService.fundCampaignWithCard(
            businessId: user.uid,
            campaignId: campaignReference.id,
            approvedQuoteDigest: approvedQuote.quoteDigest,
          );
          return;
        }

        await _billingService.publishFundedCampaign(
          businessId: user.uid,
          campaignId: campaignReference.id,
        );

        if (!mounted) {
          return;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${_campaignTypeLabel(_campaignType)} launched. '
              'Funding was confirmed by Stripe and the backend.',
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

      for (final zone in mappedZones) {
        final data = zone.data();

        totalEstimatedHomes += (data['estimatedHomes'] as num?)?.toInt() ?? 0;
      }

      await campaignReference.update({
        'zoneCount': zonesSnapshot.docs.length,

        'mappedZoneCount': mappedZones.length,

        'estimatedHomes': totalEstimatedHomes,

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

      if (fundingStatus != 'funded') {
        final approvedQuote = await _billingService
            .campaignCostQuoteForCampaign(campaignReference.id);
        if (!mounted) return;
        if (!await ensureLegalConsentForAction(
          context,
          LegalActionConsent.businessFunding,
        )) {
          return;
        }
        await _billingService.fundCampaignWithCard(
          businessId: user.uid,
          campaignId: campaignReference.id,
          approvedQuoteDigest: approvedQuote.quoteDigest,
        );
        return;
      }

      await _billingService.publishFundedCampaign(
        businessId: user.uid,
        campaignId: campaignReference.id,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Campaign launched. '
            'Funding was confirmed by Stripe and the backend.',
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
            if (fundingStatus != 'funded') {
              await campaignReference.update({
                'status': 'draft',
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

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Unable to publish campaign: '
            '${e.toString().replaceFirst('Exception: ', '')}',
          ),
        ),
      );
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

    final previewScalers = AppEnvironmentConfig.isLocal
        ? int.tryParse(scalerCountController.text.trim()) ?? 1
        : 1;

    final previewWorkerBudget = previewBasePay + previewBonus;
    final previewIndividualShare = previewScalers > 0
        ? previewWorkerBudget / previewScalers
        : previewWorkerBudget;

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

                if (_usesMarketingMaterials) ...[
                  const SizedBox(height: 20),
                  MaterialFulfillmentForm(
                    value: _materialLogistics,
                    enabled: !publishing,
                    onChanged: (value) {
                      setState(() => _materialLogistics = value);
                    },
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
                              'Response attribution tools such as campaign QR '
                              'codes, tracked calls, landing pages, and '
                              'forwarding addresses are Coming Soon.',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                ResponseTrackingFeatureCard(
                  available: AppEnvironmentConfig.responseTrackingEnabled,
                  onOpen: () => AppNavigation.push(
                    context,
                    AppRoutes.businessAttribution,
                  ),
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
                enabled: AppEnvironmentConfig.isLocal,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                onChanged: (_) {
                  setState(() {});
                },
                decoration: InputDecoration(
                  labelText: 'Scalers for this area',
                  helperText: AppEnvironmentConfig.isLocal
                      ? 'Defaults to 1. More Scalers share the same worker-pay pool.'
                      : 'Multi-Scaler crews — Private Beta. Production campaigns currently use 1 Scaler.',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.groups_outlined),
                ),
                validator: (value) {
                  final count = int.tryParse(value?.trim() ?? '');

                  if (count == null || count < 1) {
                    return 'Enter at least 1 Scaler';
                  }

                  if (count > 12) {
                    return 'Enter 12 or fewer for now';
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
                  labelText: 'Group worker pay (\$)',
                  helperText:
                      'Total compensation reserved for this area—not multiplied by Scaler count.',
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
                  labelText: 'Group completion bonus (\$)',
                  helperText:
                      'Part of the total worker-pay pool and divided among the group.',
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

                      _costRow('Group worker pay', previewWorkerBudget),
                      _valueRow('Scalers', '$previewScalers'),
                      _costRow(
                        'Estimated initial pay per Scaler',
                        previewIndividualShare,
                      ),

                      const SizedBox(height: 8),

                      const Text(
                        'The worker-pay amount is the total compensation reserved for completing this area. Selecting multiple Scalers divides the worker pool among the group rather than multiplying the total price. The secure backend calculates the Platform Fee and final charge before checkout.',
                      ),

                      if (previewScalers > 1) ...[
                        const SizedBox(height: 10),
                        const Text(
                          'Group jobs reserve one total worker-pay amount. If an assigned Scaler does not participate and the remaining team substantially completes at least 75% of the verified area, the absent Scaler’s reserved share may be redistributed to the Scalers who performed the work. This does not increase your funded worker-pay amount.',
                        ),
                      ],

                      const SizedBox(height: 12),

                      const Text(
                        'The final amount is paid securely through Stripe. '
                        'An active monthly subscription is required to '
                        'publish campaigns.',
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

  Widget _valueRow(String label, String value) => Row(
    children: [
      Expanded(child: Text(label)),
      Text(value),
    ],
  );
}
