import 'dart:async';

import 'package:flutter/material.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../../../config/app_environment.dart';
import '../../../../../navigation/app_routes.dart';
import '../../../../../navigation/app_router.dart';
import '../../../../../services/platform_billing_service.dart';
import '../../../../../services/discovery_preferences_service.dart';
import '../../../../../services/property_area_context_service.dart';

import '../../../campaign_zones_screen.dart';

import '../../../campaign/campaign_locations_screen.dart';
import '../../../../../models/material_logistics.dart';
import '../../../../../widgets/material_fulfillment_form.dart';

class FlyerCampaignScreen extends StatefulWidget {
  final String campaignType;
  final List<Map<String, double>> initialServiceArea;
  final String? initialServiceAreaName;
  final String? initialGoal;
  final String? initialService;
  final String? propertyIntelligenceAnalysisId;
  final PlatformBillingService? billingService;
  final Future<CampaignCostQuote> Function(double workerBudget)? quoteLoader;
  final Future<Map<String, dynamic>?> Function()? loadPreferences;
  final Future<void> Function(BuildContext context)? draftAndAreaFlowOverride;

  const FlyerCampaignScreen({
    super.key,
    this.campaignType = 'flyer_distribution',
    this.initialServiceArea = const [],
    this.initialServiceAreaName,
    this.initialGoal,
    this.initialService,
    this.propertyIntelligenceAnalysisId,
    this.billingService,
    this.quoteLoader,
    this.loadPreferences,
    this.draftAndAreaFlowOverride,
  });

  @override
  State<FlyerCampaignScreen> createState() => _FlyerCampaignScreenState();
}

class _FlyerCampaignScreenState extends State<FlyerCampaignScreen> {
  final _formKey = GlobalKey<FormState>();
  final _formScrollController = ScrollController();
  final _materialQuantityKey = GlobalKey();
  final _campaignNameKey = GlobalKey();
  final _descriptionKey = GlobalKey();
  final _scalerCountKey = GlobalKey();
  final _payKey = GlobalKey();

  final campaignNameController = TextEditingController();
  final descriptionController = TextEditingController();
  final payController = TextEditingController();
  final bonusController = TextEditingController();
  final scalerCountController = TextEditingController(text: '1');

  final materialQuantityController = TextEditingController();

  PlatformBillingService get _billingService =>
      widget.billingService ?? PlatformBillingService();

  DateTime? _marketingDate;

  TimeOfDay? _startTime;
  TimeOfDay? _deadlineTime;

  late String _campaignType;

  String _materialSource = 'business_provided';

  MaterialLogisticsDraft _materialLogistics = const MaterialLogisticsDraft(
    fulfillmentType: MaterialLogisticsDraft.scalerPickupBusiness,
  );

  bool _trackingEnabled = false;

  bool publishing = false;
  Timer? _quoteDebounce;
  CampaignCostQuote? _costQuote;
  bool _quoteUpdating = false;
  String? _quoteError;
  int _quoteRequestSequence = 0;
  List<Map<String, double>> _campaignArea = const [];
  String? _campaignAreaName;
  List<SavedPropertyAreaContext> _savedAreas = const [];
  String? _businessAddress;
  double? _businessLatitude;
  double? _businessLongitude;
  @override
  void initState() {
    super.initState();

    _campaignType = widget.campaignType;
    _campaignArea = List<Map<String, double>>.from(widget.initialServiceArea);
    _campaignAreaName = widget.initialServiceAreaName;
    if (widget.initialGoal?.trim().isNotEmpty == true) {
      campaignNameController.text = widget.initialGoal!.trim();
      descriptionController.text = [
        widget.initialGoal!.trim(),
        if (widget.initialService?.trim().isNotEmpty == true)
          'Service: ${widget.initialService!.trim()}',
      ].join('\n');
    }
    _loadSavedAreas();
    _loadBusinessPickupAddress();
  }

  Future<void> _loadBusinessPickupAddress() async {
    try {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;
      final snapshot = await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .get();
      final data = snapshot.data() ?? const <String, dynamic>{};
      String readAddress() {
        for (final key in const [
          'businessAddress',
          'streetAddress',
          'address',
          'pickupAddress',
        ]) {
          final raw = data[key];
          final value = raw is Map
              ? [
                      raw['street'] ?? raw['streetAddress'] ?? raw['line1'],
                      raw['city'],
                      raw['state'],
                      raw['postalCode'] ?? raw['zipCode'],
                    ]
                    .where((part) => part?.toString().trim().isNotEmpty == true)
                    .map((part) => part.toString().trim())
                    .join(', ')
              : raw?.toString().trim() ?? '';
          if (value.isNotEmpty) return value;
        }
        return '';
      }

      final address = readAddress();
      if (!mounted || address.isEmpty) return;
      final rawLatitude = data['businessLatitude'] ?? data['latitude'];
      final rawLongitude = data['businessLongitude'] ?? data['longitude'];
      setState(() {
        _businessAddress = address;
        _businessLatitude = rawLatitude is num ? rawLatitude.toDouble() : null;
        _businessLongitude = rawLongitude is num
            ? rawLongitude.toDouble()
            : null;
      });
    } catch (_) {
      // Manual pickup entry remains available when no profile address exists.
    }
  }

  Future<void> _loadSavedAreas() async {
    try {
      final preferences = widget.loadPreferences != null
          ? await widget.loadPreferences!()
          : await DiscoveryPreferencesService().load();
      final areas = const PropertyAreaContextService().resolveEnabledAreas(
        preferences,
      );
      if (mounted) setState(() => _savedAreas = areas);
    } catch (_) {
      // Campaign creation remains available with a custom area.
    }
  }

  Future<void> _chooseServiceArea() async {
    if (_savedAreas.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No mapped Service Areas are available. Choose another area in the map step.',
          ),
        ),
      );
      return;
    }
    final area = await showDialog<SavedPropertyAreaContext>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Use a Service Area'),
        children: [
          for (final area in _savedAreas)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(dialogContext, area),
              child: ListTile(
                leading: const Icon(Icons.map_outlined),
                title: Text(area.name),
                subtitle: const Text('Use as a starting template'),
              ),
            ),
        ],
      ),
    );
    if (area == null || !mounted) return;
    setState(() {
      _campaignAreaName = area.name;
      _campaignArea = area.polygon
          .map(
            (point) => {
              'latitude': point.latitude,
              'longitude': point.longitude,
            },
          )
          .toList(growable: false);
    });
  }

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
    _quoteDebounce?.cancel();
    campaignNameController.dispose();
    descriptionController.dispose();
    payController.dispose();
    bonusController.dispose();
    scalerCountController.dispose();
    materialQuantityController.dispose();
    _formScrollController.dispose();

    super.dispose();
  }

  double get _currentWorkerBudget {
    final basePay = double.tryParse(payController.text.trim()) ?? 0;
    final bonus = double.tryParse(bonusController.text.trim()) ?? 0;
    final scalers = AppEnvironmentConfig.isLocal
        ? int.tryParse(scalerCountController.text.trim()) ?? 1
        : 1;
    return (basePay + bonus) * scalers;
  }

  void _scheduleCampaignCostQuote() {
    _quoteDebounce?.cancel();
    final workerBudget = _currentWorkerBudget;
    if (workerBudget <= 0) {
      setState(() {
        _costQuote = null;
        _quoteUpdating = false;
        _quoteError = null;
      });
      return;
    }
    setState(() {
      _quoteUpdating = true;
      _quoteError = null;
    });
    _quoteDebounce = Timer(
      const Duration(milliseconds: 400),
      () => _requestCampaignCostQuote(workerBudget),
    );
  }

  Future<void> _requestCampaignCostQuote([double? requestedBudget]) async {
    _quoteDebounce?.cancel();
    final workerBudget = requestedBudget ?? _currentWorkerBudget;
    if (workerBudget <= 0) return;
    final requestSequence = ++_quoteRequestSequence;
    if (!_quoteUpdating && mounted) {
      setState(() {
        _quoteUpdating = true;
        _quoteError = null;
      });
    }
    try {
      final quote = await (widget.quoteLoader != null
          ? widget.quoteLoader!(workerBudget)
          : _billingService.campaignCostQuote(workerBudget));
      if (!mounted || requestSequence != _quoteRequestSequence) return;
      if ((quote.workerCompensation - _currentWorkerBudget).abs() > 0.001) {
        return;
      }
      setState(() {
        _costQuote = quote;
        _quoteUpdating = false;
        _quoteError = null;
      });
    } catch (_) {
      if (!mounted || requestSequence != _quoteRequestSequence) return;
      setState(() {
        _quoteUpdating = false;
        _quoteError = _costQuote == null
            ? 'Unable to calculate the campaign total.'
            : "Couldn't refresh — Retry";
      });
    }
  }

  String _platformFeeLabel(CampaignCostQuote quote) {
    final percent = quote.platformFeeRateBps / 100;
    final formatted = percent == percent.roundToDouble()
        ? percent.toStringAsFixed(0)
        : percent
              .toStringAsFixed(2)
              .replaceFirst(RegExp(r'0+$'), '')
              .replaceFirst(RegExp(r'\.$'), '');
    return 'PLATFORM FEE ($formatted%)';
  }

  Future<bool> _validateAndRevealFirstError() async {
    if (_formKey.currentState?.validate() ?? false) return true;

    GlobalKey target = _campaignNameKey;
    var message = 'Complete the highlighted campaign information.';
    if (_usesMarketingMaterials &&
        materialQuantityController.text.trim().isEmpty) {
      target = _materialQuantityKey;
      message = _campaignType == 'flyer_distribution'
          ? 'Enter how many flyers you have.'
          : 'Enter how many materials you have.';
    } else if (campaignNameController.text.trim().isEmpty) {
      target = _campaignNameKey;
      message = 'Enter a campaign name.';
    } else if (descriptionController.text.trim().isEmpty) {
      target = _descriptionKey;
      message = 'Tell Scalers what this campaign involves.';
    } else if ((int.tryParse(scalerCountController.text.trim()) ?? 0) < 1) {
      target = _scalerCountKey;
      message = 'Enter how many Scalers you need.';
    } else if ((double.tryParse(payController.text.trim()) ?? 0) <= 0) {
      target = _payKey;
      message = 'Enter the Scaler compensation.';
    }

    final fieldContext = target.currentContext;
    if (fieldContext != null) {
      await Scrollable.ensureVisible(
        fieldContext,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
        alignment: 0.18,
      );
    }
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
    return false;
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

    if (!await _validateAndRevealFirstError()) {
      return;
    }
    if (!mounted) {
      return;
    }
    final logisticsError = _usesMarketingMaterials
        ? _materialLogistics.validate()
        : null;
    if (logisticsError != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(logisticsError)));
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

    final maximumWorkerBudget = (basePay + completionBonus) * scalerCount;

    if (maximumWorkerBudget <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Campaign worker budget must be greater than zero.'),
        ),
      );

      return;
    }

    setState(() {
      publishing = true;
    });

    DocumentReference<Map<String, dynamic>>? campaignReference;

    try {
      if (widget.draftAndAreaFlowOverride != null) {
        await widget.draftAndAreaFlowOverride!(context);
        return;
      }
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in to create a campaign.');
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

        'marketingDate': Timestamp.fromDate(_marketingDate!),

        'startAt': Timestamp.fromDate(startDateTime),

        'deadlineAt': Timestamp.fromDate(deadlineDateTime),

        'status': 'draft',

        'applications': 0,
        'zoneCount': 0,
        'mappedZoneCount': 0,

        'estimatedHomes': 0,

        if (_campaignArea.length >= 3) ...{
          'serviceArea': _campaignArea,
          'serviceAreaPointCount': _campaignArea.length,
          'serviceAreaType': 'polygon',
          'shapeType': 'polygon',
          'serviceAreaTemplateName': _campaignAreaName,
        },
        if (widget.initialGoal?.trim().isNotEmpty == true)
          'opportunityGoal': widget.initialGoal!.trim(),
        if (widget.initialService?.trim().isNotEmpty == true)
          'promotedService': widget.initialService!.trim(),
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
          'materialsRequired': _materialLogistics.materialsRequired,
          'materialFulfillmentType': _materialLogistics.fulfillmentType,
          'materialHandoffMethod': _materialLogistics.fulfillmentType,
          'materialHandoffAddress': _materialLogistics.location.trim(),
          'materialHandoffLatitude': _materialLogistics.latitude,
          'materialHandoffLongitude': _materialLogistics.longitude,
          'materialHandoffScheduledAt': _materialLogistics.scheduledAt == null
              ? null
              : Timestamp.fromDate(_materialLogistics.scheduledAt!),
          'materialHandoffWindowEndAt': _materialLogistics.windowEndAt == null
              ? null
              : Timestamp.fromDate(_materialLogistics.windowEndAt!),
          'materialHandoffPrintingShopName': _materialLogistics.printingShopName
              .trim(),
          'materialHandoffOrderReference': _materialLogistics.orderReference
              .trim(),
          'materialHandoffInstructions': _materialLogistics.instructions.trim(),
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
        const SnackBar(
          content: Text(
            'Campaign draft created. No funding was charged. Define the area, then review authoritative costs before checkout.',
          ),
        ),
      );

      final zonesConfigured = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => CampaignZonesScreen(
            campaign: campaignSnapshot,
            startWithAreaBuilder: false,
          ),
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

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Zones saved. Review the campaign data, then launch when ready. '
            'No payment has been made.',
          ),
        ),
      );

      AppNavigation.replace(
        context,
        AppRoutes.campaignDetail(latestCampaignSnapshot.id),
      );
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
            campaignReference == null
                ? "We couldn't create the campaign draft. Try again."
                : "We saved the draft, but couldn't open the area step. Try again. ($e)",
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

    return Scaffold(
      appBar: AppBar(
        title: Text('Create ${_campaignTypeLabel(_campaignType)}'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1080),
            child: Form(
              key: _formKey,
              child: ListView(
                key: const Key('flyer-campaign-form-scroll'),
                controller: _formScrollController,
                padding: const EdgeInsets.all(20),
                children: [
                  const _CampaignCreationSteps(currentStep: 1),
                  const SizedBox(height: 24),
                  const Text(
                    'Create Campaign',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 8),

                  const Text(
                    'Choose the kind of field work, configure materials, '
                    'schedule the campaign, and secure Scaler compensation.',
                  ),

                  const SizedBox(height: 16),

                  Card(
                    key: const Key('campaign-service-area-template'),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Where should this campaign run?',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            _campaignAreaName == null
                                ? 'Use a saved Service Area, or choose another area in the map step.'
                                : 'Starting with: $_campaignAreaName',
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: publishing
                                    ? null
                                    : _chooseServiceArea,
                                icon: const Icon(Icons.bookmark_outline),
                                label: const Text('Use a Service Area'),
                              ),
                              TextButton(
                                onPressed: publishing
                                    ? null
                                    : () => setState(() {
                                        _campaignArea = const [];
                                        _campaignAreaName = null;
                                      }),
                                child: const Text('Choose Another Area'),
                              ),
                              TextButton.icon(
                                onPressed: publishing
                                    ? null
                                    : () => setState(() {
                                        _campaignArea = const [];
                                        _campaignAreaName = 'Custom Area';
                                      }),
                                icon: const Icon(Icons.gesture),
                                label: const Text('Draw Custom Area'),
                              ),
                            ],
                          ),
                          if (_campaignArea.length >= 3)
                            const Text(
                              'You can use the entire area, adjust it, or divide it into zones next. Your saved Service Area will not change.',
                            ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 28),

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
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
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
                      key: _materialQuantityKey,
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
                          return _campaignType == 'flyer_distribution'
                              ? 'Enter how many flyers you have'
                              : 'Enter the material quantity';
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
                        businessAddress: _businessAddress,
                        businessLatitude: _businessLatitude,
                        businessLongitude: _businessLongitude,
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
                      title: const Text('Track responses from this campaign'),
                      subtitle: const Text(
                        'Use QR codes, landing pages, calls and campaign links to see what generates responses.',
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
                    key: _campaignNameKey,
                    controller: campaignNameController,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Campaign Name',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Enter a campaign name';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 20),

                  TextFormField(
                    key: _descriptionKey,
                    controller: descriptionController,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Description',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Tell Scalers what this campaign involves';
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
                    key: _scalerCountKey,
                    controller: scalerCountController,
                    enabled: AppEnvironmentConfig.isLocal,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => _scheduleCampaignCostQuote(),
                    decoration: InputDecoration(
                      labelText: 'Scalers Needed',
                      helperText: AppEnvironmentConfig.isLocal
                          ? 'Local staging supports multi-Scaler testing.'
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
                    key: _payKey,
                    controller: payController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => _scheduleCampaignCostQuote(),
                    decoration: const InputDecoration(
                      labelText: 'Base Pay per Scaler (\$)',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Enter the Scaler compensation';
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
                    onChanged: (_) => _scheduleCampaignCostQuote(),
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

                          _costRow(
                            'SCALER PAY',
                            previewBasePay * previewScalers,
                            bold: true,
                          ),

                          if (previewBonus > 0) ...[
                            const SizedBox(height: 8),
                            _costRow(
                              'COMPLETION BONUS',
                              previewBonus * previewScalers,
                            ),
                          ],

                          const SizedBox(height: 8),

                          if (_costQuote != null)
                            _costRow(
                              _platformFeeLabel(_costQuote!),
                              _costQuote!.platformFee,
                              key: const Key('campaign-platform-fee'),
                            )
                          else if (_quoteError == null)
                            const Text(
                              'PLATFORM FEE\nEnter Scaler pay to calculate',
                            ),

                          const SizedBox(height: 8),

                          if (_costQuote != null)
                            _costRow(
                              'ESTIMATED TOTAL',
                              _costQuote!.estimatedTotal,
                              key: const Key('campaign-estimated-total'),
                              bold: true,
                            ),

                          if (_quoteUpdating)
                            const Padding(
                              padding: EdgeInsets.only(top: 10),
                              child: Text('Updating total...'),
                            ),

                          if (_quoteError != null) ...[
                            const SizedBox(height: 10),
                            Text(_quoteError!),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: _quoteUpdating
                                    ? null
                                    : _requestCampaignCostQuote,
                                child: const Text('Try Again'),
                              ),
                            ),
                          ],

                          const SizedBox(height: 12),

                          const Text(
                            'Your final campaign amount is confirmed again '
                            'before funding. An active monthly subscription '
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
        ),
      ),
    );
  }

  Widget _costRow(String label, double amount, {Key? key, bool bold = false}) {
    return Row(
      key: key,
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

class _CampaignCreationSteps extends StatelessWidget {
  const _CampaignCreationSteps({required this.currentStep});

  final int currentStep;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Campaign setup step $currentStep of 4',
    child: Wrap(
      spacing: 8,
      runSpacing: 8,
      children: const [
        Chip(label: Text('1  Campaign')),
        Chip(label: Text('2  Materials')),
        Chip(label: Text('3  Area')),
        Chip(label: Text('4  Review & Fund')),
      ],
    ),
  );
}
