import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../models/campaign_planner.dart';
import '../../models/campaign_map_context.dart';
import '../../models/material_logistics.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../services/business_operations_service.dart';
import '../../services/business_workspace_service.dart';
import '../../services/business_onboarding_service.dart';
import '../../services/discovery_preferences_service.dart';
import '../../services/property_area_context_service.dart';
import '../../widgets/campaign_marketing_history.dart';
import '../../widgets/material_fulfillment_form.dart';
import '../campaigns/campaign_details_screen.dart';
import 'campaign_map_record_screen.dart';
import 'campaign_zones_screen.dart';

typedef CampaignPlannerOperation =
    Future<Map<String, dynamic>> Function(
      String operation,
      Map<String, dynamic> input,
    );

/// Maintained web planner backed by the existing campaigns and campaignZones.
/// No local step transition confers funding, assignment or completion authority.
class CampaignPlannerScreen extends StatefulWidget {
  const CampaignPlannerScreen({
    super.key,
    this.campaignId,
    this.campaignType = 'flyer_distribution',
    this.initialServiceArea = const [],
    this.initialServiceAreaName,
    this.initialGoal,
    this.initialService,
    this.propertyIntelligenceAnalysisId,
    this.operation,
    this.openArea,
    this.loadAreas,
    this.openMarketplaceReview,
  });
  final String? campaignId;
  final String campaignType;
  final List<Map<String, double>> initialServiceArea;
  final String? initialServiceAreaName,
      initialGoal,
      initialService,
      propertyIntelligenceAnalysisId;
  final CampaignPlannerOperation? operation;
  final Future<void> Function(String campaignId)? openArea,
      openMarketplaceReview;
  final Future<List<SavedPropertyAreaContext>> Function()? loadAreas;
  @override
  State<CampaignPlannerScreen> createState() => _CampaignPlannerScreenState();
}

class _CampaignPlannerScreenState extends State<CampaignPlannerScreen> {
  final _name = TextEditingController(), _description = TextEditingController();
  final _quantity = TextEditingController(), _pay = TextEditingController();
  final _bonus = TextEditingController(text: '0');
  final _staging = TextEditingController(),
      _returnLocation = TextEditingController();
  final _printNotes = TextEditingController();
  final _service = BusinessOperationsService();
  final _mapContext = CampaignMapContext();
  late final String _createRequestId;
  String? _campaignId, _error, _historyError;
  String _executionMode = 'marketplace', _materialSource = 'business_provided';
  int _step = 0;
  bool _busy = false, _historyAccepted = false;
  Map<String, dynamic>? _context, _history;
  MaterialLogisticsDraft _logistics = const MaterialLogisticsDraft();
  DateTime? _start, _end;
  Map<String, dynamic> get _campaign => _map(_context?['campaign']);
  List<Map<String, dynamic>> get _zones => operationRows(_context?['zones']);
  bool get _ownTeam => _executionMode == 'own_team';
  bool get _editable => _context?['editable'] == true;
  bool get _hasArea =>
      _context?['areaDigest'] != null &&
      (_zones.any((z) => (z['serviceArea'] as List? ?? []).length >= 3) ||
          (_campaign['serviceArea'] as List? ?? []).length >= 3);
  bool get _scheduled => const {
    'own_team_scheduled',
    'own_team_in_progress',
    'own_team_completed',
    'scheduled',
    'in_progress',
    'completed',
  }.contains(_campaign['status']);
  bool get _completed =>
      const {'own_team_completed', 'completed'}.contains(_campaign['status']);
  bool get _areaReady =>
      _hasArea &&
      (_ownTeam ||
          _zones.any((z) => (z['serviceArea'] as List? ?? []).length >= 3));
  static Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : {};

  @override
  void initState() {
    super.initState();
    _createRequestId = _service.requestId();
    _campaignId = widget.campaignId;
    _name.text = widget.initialGoal ?? '';
    _description.text = [
      widget.initialGoal,
      widget.initialService,
    ].whereType<String>().where((s) => s.isNotEmpty).join('\n');
    if (_campaignId != null) {
      _step = 1;
      _run(() async {
        await _reload(hydrate: true);
        _step = _scheduled ? 3 : 1;
      });
    }
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _description,
      _quantity,
      _pay,
      _bonus,
      _staging,
      _returnLocation,
      _printNotes,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<Map<String, dynamic>> _call(
    String operation,
    Map<String, dynamic> input,
  ) {
    if (widget.operation != null) return widget.operation!(operation, input);
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw StateError('Sign in to plan a campaign.');
    return _service.call(
      BusinessWorkspaceSession.businessIdFor(uid),
      operation,
      input,
      requestId: input['requestId']?.toString() ?? _service.requestId(),
    );
  }

  Future<void> _run(Future<void> Function() work) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reload({bool hydrate = false}) async {
    final next = await _call('campaignPlanningContext', {
      'campaignId': _campaignId,
    });
    if (!mounted) return;
    final changedArea = _context?['areaDigest'] != next['areaDigest'];
    _context = next;
    _executionMode = _campaign['executionMode']?.toString() ?? 'marketplace';
    if (changedArea) _historyAccepted = false;
    if (hydrate) {
      _name.text = _campaign['campaignName']?.toString() ?? '';
      _description.text = _campaign['description']?.toString() ?? '';
      _quantity.text = _campaign['materialQuantity']?.toString() ?? '';
      _pay.text = _campaign['basePay']?.toString() ?? '';
      _bonus.text = _campaign['bonus']?.toString() ?? '0';
      _materialSource =
          _campaign['materialSource']?.toString() ?? 'business_provided';
      _logistics = MaterialLogisticsDraft.fromCampaign(_campaign);
      _staging.text = _campaign['materialStagingLocation']?.toString() ?? '';
      _returnLocation.text =
          _campaign['materialReturnLocation']?.toString() ?? '';
      _printNotes.text = _campaign['materialPrintNotes']?.toString() ?? '';
      _start = campaignPlanningDate(_campaign['startAt']);
      _end = campaignPlanningDate(_campaign['deadlineAt']);
    }
    if (_hasArea) {
      _history = null;
      _historyError = null;
      try {
        _history = await _call('marketingAreaHistory', {
          'campaignId': _campaignId,
        });
      } catch (_) {
        _historyError =
            'Marketing history is currently unavailable. Previous marketing could not be checked.';
      }
    }
    if (mounted) setState(() {});
  }

  Future<void> _create() => _run(() async {
    if (_name.text.trim().isEmpty || _description.text.trim().isEmpty) {
      throw StateError('Enter a campaign name and description.');
    }
    final result = await _call('createCampaignPlan', {
      'requestId': _createRequestId,
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'campaignType': widget.campaignType,
      'executionMode': _executionMode,
      if (widget.initialServiceArea.isNotEmpty)
        'initialServiceArea': widget.initialServiceArea,
      if (widget.initialServiceAreaName != null)
        'serviceAreaName': widget.initialServiceAreaName,
      if (widget.propertyIntelligenceAnalysisId != null)
        'propertyIntelligenceAnalysisId': widget.propertyIntelligenceAnalysisId,
    });
    _campaignId = result['campaignId'].toString();
    _step = 1;
    await _reload();
  });

  Future<void> _editArea() => _run(() async {
    if (widget.openArea != null) {
      await widget.openArea!(_campaignId!);
    } else {
      final snapshot = await FirebaseFirestore.instance
          .collection('campaigns')
          .doc(_campaignId)
          .get();
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CampaignZonesScreen(
            campaign: snapshot,
            planningFlow: true,
            mapContext: _mapContext,
          ),
        ),
      );
    }
    await _reload();
  });

  Future<void> _chooseServiceArea() => _run(() async {
    final areas = widget.loadAreas != null
        ? await widget.loadAreas!()
        : await _loadSavedAreas();
    if (!mounted) return;
    if (areas.isEmpty) {
      throw StateError(
        'No mapped Service Areas are available. Draw a custom area.',
      );
    }
    final selected = await showDialog<SavedPropertyAreaContext>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Use a Service Area'),
        children: [
          for (final area in areas)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(dialogContext, area),
              child: Text(area.name),
            ),
        ],
      ),
    );
    if (selected == null) return;
    await _call('saveCampaignPlanningArea', {
      'campaignId': _campaignId,
      'expectedPlanningVersion': _context?['planningVersion'],
      'serviceAreaName': selected.name,
      'serviceArea': selected.polygon
          .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
          .toList(),
    });
    _mapContext.selectedArea = null;
    await _reload();
  });

  Future<List<SavedPropertyAreaContext>> _loadSavedAreas() async {
    final areas = <String, SavedPropertyAreaContext>{};
    try {
      final preferences = await DiscoveryPreferencesService().load();
      for (final area in const PropertyAreaContextService().resolveEnabledAreas(
        preferences,
      )) {
        areas[area.id] = area;
      }
    } catch (_) {
      /* Profile suggestions can still be available. */
    }
    try {
      final profile = await BusinessOnboardingService()
          .serviceAreaSuggestions();
      for (final area in const PropertyAreaContextService().resolveEnabledAreas(
        {'areas': profile},
      )) {
        areas[area.id] = area;
      }
    } catch (_) {
      /* Drawing remains available. */
    }
    return areas.values.toList();
  }

  Future<void> _saveMaterials() => _run(() async {
    final quantity = int.tryParse(_quantity.text.trim());
    if (quantity == null || quantity < 0) {
      throw StateError(
        'Enter a whole material quantity, including zero when no materials are needed.',
      );
    }
    final logisticsError = _logistics.validate();
    if (logisticsError != null) throw StateError(logisticsError);
    if (_start == null || _end == null || !_end!.isAfter(_start!)) {
      throw StateError(
        'Choose a start and end time; the end must be after the start.',
      );
    }
    final pay = double.tryParse(_pay.text.trim());
    final bonus = double.tryParse(_bonus.text.trim());
    if (!_ownTeam &&
        (pay == null ||
            !pay.isFinite ||
            pay <= 0 ||
            bonus == null ||
            !bonus.isFinite ||
            bonus < 0)) {
      throw StateError(
        'Enter positive Scaler base pay and a non-negative bonus.',
      );
    }
    await _call('saveCampaignMaterials', {
      'campaignId': _campaignId,
      'expectedPlanningVersion': _context?['planningVersion'],
      'areaDigest': _context?['areaDigest'],
      'materialQuantity': quantity,
      'materialType': _campaign['campaignType'] ?? widget.campaignType,
      'materialSource': _materialSource,
      'materialLogistics': _logistics.toCallableData(),
      'materialStagingLocation': _staging.text.trim(),
      'materialReturnLocation': _returnLocation.text.trim(),
      'materialPrintNotes': _printNotes.text.trim(),
      'scheduledStartAt': _start!.millisecondsSinceEpoch,
      'scheduledEndAt': _end!.millisecondsSinceEpoch,
      if (!_ownTeam) ...{'basePay': pay, 'bonus': bonus},
    });
    await _reload();
    _step = 3;
  });

  Future<void> _finish() => _run(() async {
    if (_ownTeam) {
      await _call('scheduleOwnTeamCampaign', {
        'campaignId': _campaignId,
        'expectedPlanningVersion': _context?['planningVersion'],
        'areaDigest': _context?['areaDigest'],
        'scheduledStartAt': _start?.millisecondsSinceEpoch,
        'scheduledEndAt': _end?.millisecondsSinceEpoch,
      });
      await _reload(hydrate: true);
    } else if (widget.openMarketplaceReview != null) {
      await widget.openMarketplaceReview!(_campaignId!);
    } else {
      final snapshot = await FirebaseFirestore.instance
          .collection('campaigns')
          .doc(_campaignId)
          .get();
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              CampaignDetailsScreen(campaign: snapshot, plannerReview: true),
        ),
      );
      await _reload(hydrate: true);
    }
  });

  Future<void> _complete() => _run(() async {
    final selected = <String>{};
    bool whole = false, confirmed = false;
    DateTime completion = DateTime.now();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Mark Marketing Complete'),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Record only the territory your team actually marketed. This completion is Business-reported.',
                  ),
                  CheckboxListTile(
                    value: whole,
                    title: const Text(
                      'Entire saved campaign territory was completed',
                    ),
                    onChanged: (v) => update(() {
                      whole = v == true;
                      selected.clear();
                    }),
                  ),
                  if (!whole) ...[
                    const Text(
                      'Or select completed zones. Unselected zones will not enter marketing history.',
                    ),
                    for (final zone in _zones)
                      CheckboxListTile(
                        value: selected.contains(
                          (zone['id'] ?? zone['zoneId']).toString(),
                        ),
                        title: Text(zone['zoneName']?.toString() ?? 'Zone'),
                        onChanged: (v) => update(() {
                          final id = (zone['id'] ?? zone['zoneId']).toString();
                          if (v == true) {
                            selected.add(id);
                          } else {
                            selected.remove(id);
                          }
                        }),
                      ),
                  ],
                  TextButton.icon(
                    icon: const Icon(Icons.event),
                    label: Text(
                      'Completed: ${campaignPlanningDateLabel(completion)}',
                    ),
                    onPressed: () async {
                      final date = await showDatePicker(
                        context: context,
                        initialDate: completion,
                        firstDate: DateTime(2000),
                        lastDate: DateTime.now(),
                      );
                      if (date != null) {
                        update(() {
                          final now = DateTime.now();
                          completion = DateUtils.isSameDay(date, now)
                              ? now
                              : DateTime(
                                  date.year,
                                  date.month,
                                  date.day,
                                  23,
                                  59,
                                  59,
                                );
                        });
                      }
                    },
                  ),
                  CheckboxListTile(
                    value: confirmed,
                    title: const Text(
                      'I confirm our team completed marketing in the selected territory.',
                    ),
                    onChanged: (v) => update(() => confirmed = v == true),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: confirmed && (whole || selected.isNotEmpty)
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              child: const Text('Record Completion'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true) return;
    await _call('markMarketingComplete', {
      'campaignId': _campaignId,
      'completedAtMs': completion.millisecondsSinceEpoch,
      'confirmed': true,
      'wholeTerritory': whole,
      if (!whole) 'zoneIds': selected.toList(),
    });
    await _reload(hydrate: true);
  });

  Future<void> _pickSchedule(bool start) async {
    final initial =
        (start ? _start : _end) ?? DateTime.now().add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(DateTime.now().year + 3),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    setState(() {
      final value = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      if (start) {
        _start = value;
      } else {
        _end = value;
      }
    });
  }

  String _scheduleLabel(DateTime? value) => value == null
      ? 'Choose date and time'
      : '${campaignPlanningDateLabel(value)} · ${TimeOfDay.fromDateTime(value.toLocal()).format(context)}';
  void _viewCampaign(String id) =>
      AppNavigation.push(context, AppRoutes.campaignDetail(id));
  void _mapRecord() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CampaignMapRecordScreen(campaignId: _campaignId!),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_campaignId == null ? 'Create Campaign' : _name.text),
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Semantics(
              label: 'Campaign setup step ${_step + 1} of 4',
              child: Wrap(
                spacing: 8,
                children: [
                  for (final pair in [
                    (0, 'Campaign'),
                    (1, 'Area'),
                    (2, 'Materials'),
                    (3, _ownTeam ? 'Review & Schedule' : 'Review & Fund'),
                  ])
                    ChoiceChip(
                      label: Text('${pair.$1 + 1}  ${pair.$2}'),
                      selected: _step == pair.$1,
                      onSelected:
                          _busy || pair.$1 == 0 || pair.$1 > _step || !_editable
                          ? null
                          : (_) => setState(() => _step = pair.$1),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_error!, key: const Key('planner-error')),
                      if (_campaignId != null)
                        TextButton(
                          onPressed: _busy ? null : () => _run(() => _reload()),
                          child: const Text('Refresh saved campaign'),
                        ),
                    ],
                  ),
                ),
              ),
            if (_step == 0) ..._intent(),
            if (_step == 1 && _context != null) ..._area(),
            if (_step == 2 && _context != null) ..._materials(),
            if (_step == 3 && _context != null) ..._review(),
          ],
        ),
      ),
    ),
  );

  List<Widget> _intent() => [
    Text(
      campaignPlanningTypeLabel(widget.campaignType),
      style: Theme.of(context).textTheme.headlineSmall,
    ),
    const SizedBox(height: 16),
    TextField(
      controller: _name,
      enabled: !_busy,
      decoration: const InputDecoration(labelText: 'Campaign name'),
    ),
    TextField(
      controller: _description,
      enabled: !_busy,
      maxLines: 3,
      decoration: const InputDecoration(
        labelText: 'Campaign goal and instructions',
      ),
    ),
    const SizedBox(height: 20),
    const Text('Who will perform the work?'),
    RadioGroup<String>(
      groupValue: _executionMode,
      onChanged: (value) {
        if (!_busy && value != null) setState(() => _executionMode = value);
      },
      child: const Column(
        children: [
          RadioListTile(
            value: 'marketplace',
            title: Text('ScaledCircle Scalers'),
            subtitle: Text(
              'Review compensation and fund marketplace work after planning.',
            ),
          ),
          RadioListTile(
            value: 'own_team',
            title: Text('My Own Team'),
            subtitle: Text(
              'Plan, schedule and use maps with your employees or marketers. No Scaler compensation funding.',
            ),
          ),
        ],
      ),
    ),
    const SizedBox(height: 16),
    FilledButton(
      onPressed: _busy ? null : _create,
      child: const Text('Continue to Area'),
    ),
  ];

  List<Widget> _area() => [
    Text(
      'Choose your campaign area',
      style: Theme.of(context).textTheme.headlineSmall,
    ),
    const Text(
      'Save the territory first. Its available geography and property data will inform materials.',
    ),
    const SizedBox(height: 16),
    Wrap(
      spacing: 12,
      runSpacing: 8,
      children: [
        OutlinedButton.icon(
          onPressed: _busy || !_editable ? null : _chooseServiceArea,
          icon: const Icon(Icons.business_outlined),
          label: const Text('Use a Service Area'),
        ),
        FilledButton.icon(
          onPressed: _busy || !_editable ? null : _editArea,
          icon: const Icon(Icons.map_outlined),
          label: Text(
            _hasArea
                ? 'Choose Another Area / Edit Zones'
                : 'Draw Custom Area / Smart Zones',
          ),
        ),
        if (_hasArea)
          OutlinedButton.icon(
            onPressed: _mapRecord,
            icon: const Icon(Icons.print_outlined),
            label: const Text('Download / Print Map'),
          ),
      ],
    ),
    if (_hasArea) ...[
      const SizedBox(height: 16),
      Text(
        '${_zones.length} saved zones · ${_campaign['serviceAreaTemplateName'] ?? _campaign['serviceAreaName'] ?? 'Campaign geography saved'}',
      ),
      if (_zones.isNotEmpty)
        const Text(
          'Changing a Service Area keeps existing saved zones. Edit or remove zones to match the territory you intend to market.',
        ),
      if (!_areaReady)
        const Text(
          'Save at least one campaign zone for Scaler work before choosing materials.',
        ),
      ..._intelligence(),
      if (_history != null)
        CampaignMarketingHistory(
          history: _history!,
          accepted: _historyAccepted,
          onViewCampaign: _viewCampaign,
          onChooseArea: _editArea,
          onContinue: () => setState(() {
            _historyAccepted = true;
            if (_areaReady) _step = 2;
          }),
        ),
      if (_historyError != null)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_historyError!),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: _busy ? null : () => _run(() => _reload()),
                      child: const Text('Retry history check'),
                    ),
                    OutlinedButton(
                      onPressed: _busy || !_areaReady
                          ? null
                          : () => setState(() {
                              _historyAccepted = true;
                              _step = 2;
                            }),
                      child: const Text('Continue Anyway'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
    ],
    const SizedBox(height: 16),
    FilledButton(
      onPressed:
          !_busy &&
              _editable &&
              _areaReady &&
              _history != null &&
              (_history?['warning'] != true || _historyAccepted)
          ? () => setState(() => _step = 2)
          : null,
      child: const Text('Continue to Materials'),
    ),
  ];

  List<Widget> _intelligence() {
    final raw = _map(_context?['areaIntelligence']);
    final intel = CampaignMaterialIntelligence(raw);
    final quantity = int.tryParse(_quantity.text);
    final difference = quantity == null ? null : intel.difference(quantity);
    return [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Area intelligence',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (raw['housingEstimate'] != null)
                Text(
                  '${raw['housingEstimateLabel'] ?? 'Regional housing estimate'}: ${raw['housingEstimate']}',
                ),
              for (final zone in operationRows(raw['zones'])) ...[
                const SizedBox(height: 12),
                Text(
                  zone['name']?.toString() ?? 'Zone',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(
                  zone['residentialProperties'] == null
                      ? 'Property intelligence unavailable for this saved zone.'
                      : '${zone['metric'] ?? 'Source property estimate'}: ${zone['residentialProperties']}',
                ),
                if (zone['source'] != null)
                  Text(
                    '${zone['source']} · ${zone['sourceVersion'] ?? ''} · ${zone['dataDate'] ?? 'Date unavailable'} · ${zone['status']}',
                  ),
                if (zone['workloadMinutes'] is num)
                  Text(
                    'Estimated workload: ${zone['workloadMinutes']} minutes',
                  ),
                for (final limitation in zone['limitations'] as List? ?? [])
                  Text(limitation.toString()),
              ],
              Text(
                intel.distributionPoints == null
                    ? 'Eligible distribution points: not available'
                    : 'Eligible distribution points: ${intel.distributionPoints}',
              ),
              if (intel.suggestedQuantity != null) ...[
                Text('Suggested material quantity: ${intel.suggestedQuantity}'),
                if (raw['recommendationReason'] != null)
                  Text(raw['recommendationReason'].toString()),
                if (_step == 2)
                  TextButton(
                    onPressed: () => setState(
                      () => _quantity.text = '${intel.suggestedQuantity}',
                    ),
                    child: const Text('Use suggested quantity'),
                  ),
                if (difference != null)
                  Text(
                    difference < 0
                        ? 'Shortage against suggestion: ${-difference}'
                        : difference == 0
                        ? 'Your quantity matches the suggestion.'
                        : 'Surplus against suggestion: $difference',
                  ),
              ] else
                const Text(
                  'A reliable delivery-point quantity is not implemented for this area. Enter your own material quantity. Regional housing estimates are not eligible delivery points.',
                ),
              for (final limitation in raw['limitations'] as List? ?? [])
                Text(limitation.toString()),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _materials() => [
    Text(
      'Materials and logistics',
      style: Theme.of(context).textTheme.headlineSmall,
    ),
    ..._intelligence(),
    TextField(
      controller: _quantity,
      enabled: !_busy,
      onChanged: (_) => setState(() {}),
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
        labelText: 'Your material quantity',
        helperText:
            'Your quantity is authoritative. Enter 0 if no physical materials are needed.',
      ),
    ),
    const SizedBox(height: 16),
    DropdownButtonFormField<String>(
      initialValue: _materialSource,
      decoration: const InputDecoration(labelText: 'Material source'),
      items: const [
        DropdownMenuItem(
          value: 'business_provided',
          child: Text('I provide the materials'),
        ),
        DropdownMenuItem(
          value: 'scaled_circle_generated',
          child: Text('My ScaledCircle materials'),
        ),
      ],
      onChanged: _busy ? null : (v) => setState(() => _materialSource = v!),
    ),
    const Text(
      'ScaledCircle printing and planner uploads are not yet available. Arrange printing with your supplier and record the requirements below.',
    ),
    TextField(
      controller: _printNotes,
      decoration: const InputDecoration(
        labelText: 'Print requirements / existing material reference',
      ),
    ),
    if ((_campaign['marketingAssets'] as List? ?? []).isNotEmpty)
      Text(
        'Existing materials: ${(_campaign['marketingAssets'] as List).length} attached assets',
      ),
    const SizedBox(height: 16),
    MaterialFulfillmentForm(
      value: _logistics,
      enabled: !_busy,
      ownTeam: _ownTeam,
      onChanged: (v) => setState(() => _logistics = v),
    ),
    TextField(
      controller: _staging,
      decoration: const InputDecoration(
        labelText: 'Staging / zone handoff location (optional)',
      ),
    ),
    TextField(
      controller: _returnLocation,
      decoration: const InputDecoration(
        labelText: 'Return / drop-off location (optional)',
      ),
    ),
    const Text(
      'Pickup → saved campaign territory → return/drop-off. Locations and instructions are approved by you. Route-based logistics recommendations are not yet available.',
    ),
    const SizedBox(height: 20),
    Text('Campaign schedule', style: Theme.of(context).textTheme.titleLarge),
    ListTile(
      title: const Text('Start'),
      subtitle: Text(_scheduleLabel(_start)),
      trailing: const Icon(Icons.event),
      onTap: _busy ? null : () => _pickSchedule(true),
    ),
    ListTile(
      title: const Text('End'),
      subtitle: Text(_scheduleLabel(_end)),
      trailing: const Icon(Icons.event),
      onTap: _busy ? null : () => _pickSchedule(false),
    ),
    if (!_ownTeam) ...[
      const Text(
        'Scaler compensation is reviewed against the saved area before funding.',
      ),
      TextField(
        controller: _pay,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(labelText: 'Scaler base pay (USD)'),
      ),
      TextField(
        controller: _bonus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(labelText: 'Completion bonus (USD)'),
      ),
    ],
    const SizedBox(height: 20),
    FilledButton(
      onPressed: _busy ? null : _saveMaterials,
      child: Text(
        _ownTeam
            ? 'Continue to Review & Schedule'
            : 'Continue to Review & Fund',
      ),
    ),
  ];

  List<Widget> _review() => [
    Text(
      _ownTeam ? 'Review & Schedule' : 'Review & Fund',
      style: Theme.of(context).textTheme.headlineSmall,
    ),
    Text(_name.text, style: Theme.of(context).textTheme.titleLarge),
    Text(
      _ownTeam ? 'Execution: My Own Team' : 'Execution: ScaledCircle Scalers',
    ),
    Text('Status: ${_campaign['status'] ?? 'draft'}'),
    Text(
      'Material quantity: ${_campaign['materialQuantity'] ?? _quantity.text}',
    ),
    Text('Start: ${_scheduleLabel(_start)}'),
    Text('End: ${_scheduleLabel(_end)}'),
    if (_logistics.materialsRequired)
      Text('Pickup / delivery: ${_logistics.location}'),
    if (_staging.text.isNotEmpty) Text('Staging: ${_staging.text}'),
    if (_returnLocation.text.isNotEmpty)
      Text('Return / drop-off: ${_returnLocation.text}'),
    const SizedBox(height: 16),
    OutlinedButton.icon(
      onPressed: _hasArea ? _mapRecord : null,
      icon: const Icon(Icons.print_outlined),
      label: const Text('Download / Print Map'),
    ),
    if (_ownTeam) ...[
      const Text(
        'Your team performs this campaign. Planning and scheduling do not require Scaler assignments or compensation funding.',
      ),
      if (!_scheduled)
        FilledButton(
          onPressed: _busy ? null : _finish,
          child: const Text('Schedule My Own Team'),
        ),
      if (_scheduled && !_completed) ...[
        const Text(
          'Give the campaign map and material plan to your team. Record completion only after marketing actually occurs.',
        ),
        FilledButton.icon(
          onPressed: _busy ? null : _complete,
          icon: const Icon(Icons.task_alt),
          label: const Text('Mark Marketing Complete'),
        ),
      ],
      if (_completed)
        const Text(
          'Marketing completion recorded as Business-reported history.',
        ),
    ] else ...[
      const Text(
        'The next review uses the saved Scaler compensation, funding and consent requirements. Work can start only after marketplace requirements are met.',
      ),
      FilledButton(
        onPressed: _busy ? null : _finish,
        child: const Text('Review Marketplace Funding'),
      ),
    ],
  ];
}
