import '../../models/own_team_capacity.dart';
import '../../widgets/own_team_area_work.dart';
import 'campaign_map_record_screen.dart';
import '../../widgets/campaign_workload_summary.dart';
import '../../widgets/zone_intelligence_summary.dart';
import '../../services/business_operations_service.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import '../../config/app_environment.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../../widgets/production_route_review.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../models/campaign/zone_display_identity.dart';
import '../../models/campaign_map_context.dart';

import '../../services/completion_payout_service.dart';
import '../../services/address_search_service.dart';
import '../../services/business_workspace_service.dart';
import '../../widgets/mapped_address_field.dart';
import '../../widgets/smart_zone_geometry_map.dart';
import '../../widgets/zone_intelligence_card.dart';
import '../../widgets/smart_zone_recommendation_evidence.dart';
import 'campaign_area_screen.dart';

bool campaignZonesCanContinue(Iterable<Map<String, dynamic>> zones) {
  return zones.any(
    (zone) => ((zone['serviceAreaPointCount'] as num?)?.toInt() ?? 0) >= 3,
  );
}

Map<String, dynamic> smartZoneRecommendationRequest({
  required String campaignId,
  double desiredHours = 5,
  AddressSuggestion? selectedArea,
  List<Map<String, double>>? analysisBoundary,
  String objective = '',
  int alternativeIndex = 0,
  String? recommendationRunId,
  List<String>? selectionIds,
  int? replaceZoneIndex,
  bool resumeSavedPlan = false,
}) => {
  'campaignId': campaignId,
  'desiredHours': desiredHours,
  if (objective.trim().isNotEmpty) 'objective': objective.trim(),
  if (alternativeIndex > 0) 'alternativeIndex': alternativeIndex,
  'recommendationRunId': ?recommendationRunId,
  'selectionIds': ?selectionIds,
  'replaceZoneIndex': ?replaceZoneIndex,
  if (resumeSavedPlan) 'resumeSavedPlan': true,
  if (analysisBoundary != null)
    'analysisBoundary': analysisBoundary
        .map((point) => Map<String, double>.from(point))
        .toList()
  else if (selectedArea != null)
    'areaSelection': {
      'query': selectedArea.fullAddress,
      'resultId': selectedArea.id,
    },
};

bool intelligentAreaRecommendationAllowed(
  Map<String, dynamic>? workspace, {
  required String? actorUid,
  required String campaignBusinessId,
}) =>
    actorUid != null &&
    campaignBusinessId.isNotEmpty &&
    workspace?['actorUid'] == actorUid &&
    workspace?['businessId'] == campaignBusinessId &&
    workspace?['capabilities'] is Map &&
    workspace!['capabilities']['intelligentAreaRecommendation'] == true;

// One campaign may legitimately span many worker-sized territories. The
// server remains authoritative for the 6-hour per-Zone and 32-Zone practical
// launch ceilings; worker supply never shrinks the Business-selected area.
const int productionMaximumZonesPerCampaign = 32;

String _compensationMoney(Object? cents) {
  final value = (cents as num?)?.round() ?? 0;
  return '\$${(value / 100).toStringAsFixed(2)}';
}

String _compensationRate(Object? cents) {
  final value = (cents as num?)?.round() ?? 0;
  return '\$${(value / 100).toStringAsFixed(2)}/hour equivalent';
}

class CampaignZoneAreaEntry extends StatefulWidget {
  const CampaignZoneAreaEntry({
    super.key,
    required this.locked,
    required this.hasSavedArea,
    required this.savedAreaName,
    required this.onPlan,
    required this.onAdvancedEdit,
    this.onUseAnalyzedArea,
    this.initialSelection,
    this.onSelectionChanged,
    this.searchAddresses,
    this.recommendationEnabled = false,
    this.initialObjective = '',
    this.onSaveWorkload,
    this.executionMode = 'marketplace',
    this.initialTeamCapacity,
    this.onSaveTeamCapacity,
    this.onManualTeamCapacity,
    this.onPlanningInputChanged,
    this.initialHours = 5,
  });

  final String executionMode;
  final Map? initialTeamCapacity;
  final ValueChanged<Map<String, dynamic>?>? onManualTeamCapacity;
  final Future<bool> Function(double, Map<String, dynamic>)? onSaveTeamCapacity;
  final VoidCallback? onPlanningInputChanged;
  final bool locked;
  final bool hasSavedArea;
  final String savedAreaName;
  final Future<void> Function(
    AddressSuggestion? area,
    double desiredHours,
    String objective,
  )
  onPlan;
  final bool recommendationEnabled;
  final String initialObjective;
  final double initialHours;
  final Future<bool> Function(double)? onSaveWorkload;
  final ValueChanged<AddressSuggestion?> onAdvancedEdit;
  final VoidCallback? onUseAnalyzedArea;
  final AddressSuggestion? initialSelection;
  final ValueChanged<AddressSuggestion?>? onSelectionChanged;
  final Future<List<AddressSuggestion>> Function(String query)? searchAddresses;

  @override
  State<CampaignZoneAreaEntry> createState() => _SmartZoneEntryState();
}

class _SmartZoneEntryState extends State<CampaignZoneAreaEntry> {
  final _areaController = TextEditingController();
  late final _hoursController = TextEditingController(
    text: widget.initialHours.toString(),
  );
  late final _objectiveController = TextEditingController(
    text: widget.initialObjective,
  );
  AddressSuggestion? _selectedArea;
  bool _planning = false;
  late final _teamCountController = TextEditingController(
    text: widget.initialTeamCapacity?['marketerCount']?.toString() ?? '',
  );
  String? _coveragePattern;
  bool get _ownTeam => widget.executionMode == 'own_team';

  @override
  void initState() {
    super.initState();
    _coveragePattern =
        widget.initialTeamCapacity?['coveragePattern'] as String?;
    _selectedArea = widget.initialSelection;
    _areaController.text = _selectedArea?.fullAddress ?? '';
  }

  @override
  void dispose() {
    _areaController.dispose();
    _hoursController.dispose();
    _objectiveController.dispose();
    _teamCountController.dispose();
    super.dispose();
  }

  Future<void> _plan({required bool useSavedArea}) async {
    if (!widget.recommendationEnabled) return;
    final hours = double.tryParse(_hoursController.text.trim());
    if (hours == null || !hours.isFinite || hours < 0.5 || hours > 192) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            hours != null && hours > 192
                ? 'Campaign workload cannot exceed 192 hours.'
                : 'Minimum campaign workload is 30 minutes.',
          ),
        ),
      );
      return;
    }
    if (!useSavedArea && _selectedArea == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Search for and select a campaign area first.'),
        ),
      );
      return;
    }
    setState(() => _planning = true);
    try {
      if (_ownTeam) {
        final capacity = ownTeamCapacityInput(
          hours,
          _teamCountController.text,
          _coveragePattern,
        );
        if (widget.onSaveTeamCapacity == null ||
            !await widget.onSaveTeamCapacity!(hours, capacity)) {
          return;
        }
      } else if (widget.onSaveWorkload != null &&
          !await widget.onSaveWorkload!(hours)) {
        return;
      }
      await widget.onPlan(
        useSavedArea ? null : _selectedArea,
        hours,
        _objectiveController.text.trim(),
      );
    } on FormatException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _planning = false);
    }
  }

  Future<void> _draw(AddressSuggestion? area, {VoidCallback? onReady}) async {
    if (area == null && !widget.hasSavedArea && onReady == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Search and select a location before drawing your area.',
          ),
        ),
      );
      return;
    }
    Map<String, dynamic>? previewCapacity;
    if (_ownTeam) {
      try {
        previewCapacity = ownTeamCapacityInput(
          double.tryParse(_hoursController.text) ?? 0,
          _teamCountController.text,
          _coveragePattern,
        );
      } on FormatException {
        /* Optional planning inputs do not gate manual drawing. */
      }
    }
    widget.onManualTeamCapacity?.call(previewCapacity);
    // Manual entry is navigation, not a workload write or recommendation.
    // Explicit acceptance rechecks saved-plan capacity separately.
    if (mounted) {
      if (onReady != null) {
        onReady();
      } else {
        widget.onAdvancedEdit(area);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.add_location_alt_outlined, size: 54),
          const SizedBox(height: 12),
          const Text(
            'Where do you want to run this campaign?',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            widget.recommendationEnabled
                ? 'Search a location, describe your customer goal and review a supported marketing area. You can also draw your own.'
                : 'Search a neighborhood, address, ZIP, or city, then draw the area you want to market.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 18),
          MappedAddressField(
            controller: _areaController,
            enabled: !widget.locked && !_planning,
            labelText: 'Search neighborhood, address or ZIP',
            hintText: 'Example: Federal Hill, Baltimore',
            searchAddresses: widget.searchAddresses,
            onChanged: (_) {
              widget.onPlanningInputChanged?.call();
              setState(() => _selectedArea = null);
              widget.onSelectionChanged?.call(null);
            },
            onSelected: (area) {
              widget.onPlanningInputChanged?.call();
              setState(() => _selectedArea = area);
              widget.onSelectionChanged?.call(area);
            },
          ),
          const SizedBox(height: 12),
          if (widget.recommendationEnabled) ...[
            TextFormField(
              controller: _objectiveController,
              onChanged: (_) => widget.onPlanningInputChanged?.call(),
              enabled: !widget.locked && !_planning,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'What kind of work are you looking for?',
                hintText:
                    'Example: residential areas for deck and remodeling outreach',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
          ],
          TextFormField(
            controller: _hoursController,
            onChanged: (_) => widget.onPlanningInputChanged?.call(),
            enabled: !widget.locked && !_planning,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: _ownTeam
                  ? 'How long will your team work? (hours)'
                  : 'Requested field workload (hours)',
              helperText: _ownTeam
                  ? 'Working time per person in this session. Minimum 30 minutes.'
                  : 'An advisory target. Available evidence may support less work.',
              border: const OutlineInputBorder(),
            ),
          ),
          if (_ownTeam) ...[
            const SizedBox(height: 12),
            TextFormField(
              controller: _teamCountController,
              enabled: !widget.locked && !_planning,
              keyboardType: TextInputType.number,
              onChanged: (_) => widget.onPlanningInputChanged?.call(),
              decoration: const InputDecoration(
                labelText: 'How many marketers will work this area?',
                helperText:
                    'Planning only. This does not assign people or add paid seats.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            const Text('How will they cover the area?'),
            RadioGroup<String>(
              groupValue: _coveragePattern,
              onChanged: (value) {
                setState(() => _coveragePattern = value);
                widget.onPlanningInputChanged?.call();
              },
              child: Column(
                children: [
                  RadioListTile<String>(
                    enabled: !widget.locked && !_planning,
                    value: 'split_streets',
                    title: const Text('Split up to cover different streets.'),
                  ),
                  RadioListTile<String>(
                    enabled: !widget.locked && !_planning,
                    value: 'stay_together',
                    title: const Text(
                      'Stay together and cover the same streets.',
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (widget.onUseAnalyzedArea != null) ...[
            OutlinedButton.icon(
              onPressed: widget.locked || _planning
                  ? null
                  : () =>
                        _draw(_selectedArea, onReady: widget.onUseAnalyzedArea),
              icon: const Icon(Icons.insights_outlined),
              label: const Text('Use Analyzed Area'),
            ),
            const SizedBox(height: 8),
          ],
          if (widget.recommendationEnabled)
            ElevatedButton.icon(
              onPressed: widget.locked || _planning || _selectedArea == null
                  ? null
                  : () => _plan(useSavedArea: false),
              icon: _planning
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(
                _planning
                    ? 'Finding the strongest areas in ${_selectedArea?.primaryText ?? 'your service area'}'
                    : 'Recommend an Area',
              ),
            )
          else
            const Text(
              'Intelligent area recommendations are included with Scale.',
            ),
          if (widget.hasSavedArea) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: widget.locked || _planning ? null : () => _draw(null),
              icon: const Icon(Icons.business_outlined),
              label: const Text('Use My Service Area'),
            ),
            Text(
              'Draw a campaign territory within ${widget.savedAreaName}. Your service area is a search boundary, not one campaign.',
            ),
          ],
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: widget.locked || _planning
                ? null
                : () => _draw(_selectedArea),
            icon: const Icon(Icons.gesture),
            label: const Text('Draw My Area'),
          ),
          const Text(
            'Finding future opportunities is separate from mapping an area you already know.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}

bool campaignCanAddZone(
  int persistedZoneCount, {
  int maximumZones = productionMaximumZonesPerCampaign,
}) => persistedZoneCount < maximumZones;

// This is display gating only. Continue always rechecks the server authority.
bool campaignZoneWorkloadCanReview(
  List<Map<String, dynamic>> zones,
  Map? state,
) {
  if (state?['ready'] != true || state?['requiredZoneCount'] != zones.length) {
    return false;
  }
  return zones.every((zone) {
    final evidence = zone['zoneIntelligence'] as Map?;
    final workload = evidence?['workload'] as Map?;
    final minutes = workload?['minutes'];
    return zoneEvidenceMatches(evidence, zone['serviceArea']) &&
        ['available', 'partial'].contains(evidence?['status']) &&
        minutes is num &&
        minutes > 0 &&
        minutes <= 360 &&
        workload?['oneScaler'] == true &&
        (zone['assignedScalerId'] == null || zone['assignedScalerId'] == '') &&
        zone['mapLocked'] != true;
  });
}

class CampaignZonesScreen extends StatefulWidget {
  final DocumentSnapshot campaign;
  final bool startWithAreaBuilder;
  final bool planningFlow;
  final CampaignMapContext? mapContext;

  const CampaignZonesScreen({
    super.key,
    required this.campaign,
    this.startWithAreaBuilder = false,
    this.planningFlow = false,
    this.mapContext,
  });

  @override
  State<CampaignZonesScreen> createState() => _CampaignZonesScreenState();
}

class _CampaignZonesScreenState extends State<CampaignZonesScreen> {
  DocumentSnapshot? _currentCampaign;
  DocumentSnapshot get campaign => _currentCampaign ?? widget.campaign;
  Map<String, dynamic>? _workloadState;
  Map<String, dynamic>? _manualTeamCapacity;
  int _planningRevision = 0;
  double get _requestedHours =>
      (_workloadState?['requestedHours'] as num?)?.toDouble() ?? 5;

  Future<bool> _refreshWorkload() async {
    try {
      final fresh = await widget.campaign.reference.get();
      final data = fresh.data() as Map<String, dynamic>;
      final result = await BusinessOperationsService().call(
        data['businessId'] as String,
        'campaignWorkloadContext',
        {'campaignId': fresh.id},
      );
      if (mounted) {
        setState(() {
          _currentCampaign = fresh;
          _workloadState = result;
        });
      }
      return result['ready'] == true;
    } catch (_) {
      if (mounted) {
        setState(
          () => _workloadState = {
            'ready': false,
            'reason':
                'Workload authority is unavailable. Refresh before review.',
          },
        );
      }
      return false;
    }
  }

  Future<bool> _saveWorkload(
    double hours, {
    Map<String, dynamic>? teamCapacity,
  }) async {
    await _refreshWorkload();
    if (!mounted) return false;
    try {
      final result = await BusinessOperationsService().call(
        (campaign.data() as Map)['businessId'] as String,
        'saveCampaignWorkload',
        {
          'campaignId': campaign.id,
          'requestedHours': hours,
          'teamCapacity': ?teamCapacity,
          'expectedWorkloadVersion': _workloadState?['workloadVersion'] ?? 0,
        },
      );
      if (mounted) {
        setState(() => _workloadState = result);
      }
      await _refreshWorkload();
      return true;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is FirebaseFunctionsException
                  ? error.message ?? 'Unable to save workload.'
                  : 'Unable to save workload.',
            ),
          ),
        );
      }
      return false;
    }
  }

  Future<void> _editTeamCapacity() async {
    final duration = TextEditingController(
      text: _workloadState?['requestedHours']?.toString() ?? '',
    );
    final count = TextEditingController(
      text: _workloadState?['marketerCount']?.toString() ?? '',
    );
    String? pattern = _workloadState?['coveragePattern'] as String?, error;
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, update) => AlertDialog(
          title: const Text('Team session capacity'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: duration,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Hours per person',
                  ),
                ),
                TextField(
                  controller: count,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Number of marketers',
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: pattern,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(
                      value: 'split_streets',
                      child: Text('Split different streets'),
                    ),
                    DropdownMenuItem(
                      value: 'stay_together',
                      child: Text('Stay together'),
                    ),
                  ],
                  onChanged: (v) => update(() => pattern = v),
                ),
                const Text(
                  'Planning only. No assignment, seats or worker compensation are created.',
                ),
                if (error != null) Text(error!),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                try {
                  Navigator.pop(
                    c,
                    ownTeamCapacityInput(
                      double.tryParse(duration.text) ?? 0,
                      count.text,
                      pattern,
                    ),
                  );
                } on FormatException catch (e) {
                  update(() => error = e.message);
                }
              },
              child: const Text('Save team capacity'),
            ),
          ],
        ),
      ),
    );
    duration.dispose();
    count.dispose();
    if (input != null && mounted) {
      _planningRevision++;
      await _saveWorkload(
        (input['sessionHours'] as num).toDouble(),
        teamCapacity: input,
      );
    }
  }

  Future<void> _editWorkload() async {
    if (_ownTeam) {
      await _editTeamCapacity();
      return;
    }
    final controller = TextEditingController(
      text: _workloadState?['requestedHours']?.toString() ?? '',
    );
    String? error;
    final hours = await showDialog<double>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, update) => AlertDialog(
          title: const Text('Requested campaign workload'),
          content: TextField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Hours',
              helperText: '30 minutes (0.5 hours) to 192 hours',
              errorText: error,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                final value = double.tryParse(controller.text);
                if (value != null &&
                    value.isFinite &&
                    value >= .5 &&
                    value <= 192) {
                  Navigator.pop(c, value);
                } else {
                  update(
                    () => error = value != null && value > 192
                        ? 'Campaign workload cannot exceed 192 hours.'
                        : 'Minimum campaign workload is 30 minutes.',
                  );
                }
              },
              child: const Text('Save workload'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (hours != null && mounted) await _saveWorkload(hours);
  }

  bool get startWithAreaBuilder => widget.startWithAreaBuilder;
  bool get planningFlow => widget.planningFlow;
  late final CampaignMapContext _mapContext =
      widget.mapContext ?? CampaignMapContext();
  Map<String, dynamic>? _recommendationWorkspace;
  String _recommendationObjective = '';

  @override
  void initState() {
    super.initState();
    _recommendationObjective =
        ((campaign.data() as Map<String, dynamic>?)?['smartZoneObjective'] ??
                (campaign.data() as Map<String, dynamic>?)?['objective'])
            ?.toString() ??
        '';
    _loadRecommendationAccess();
    _refreshWorkload();
  }

  Future<void> _loadRecommendationAccess() async {
    try {
      final value = await BusinessWorkspaceService().context(
        cacheSession: false,
      );
      if (mounted) setState(() => _recommendationWorkspace = value);
    } catch (_) {
      // Recommendation authority is unavailable. Manual planning stays usable.
      if (mounted) setState(() => _recommendationWorkspace = null);
    }
  }

  bool get _recommendationEnabled {
    if (_recommendationWorkspace == null) return false;
    return intelligentAreaRecommendationAllowed(
      _recommendationWorkspace,
      actorUid: FirebaseAuth.instance.currentUser?.uid,
      campaignBusinessId:
          (campaign.data() as Map<String, dynamic>?)?['businessId']
              ?.toString() ??
          '',
    );
  }

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  // Firestore Rules authorize the tenant as well as the campaign. Use the
  // canonical campaign owner, which can differ from an authorized team member.
  Query<Map<String, dynamic>> get _campaignZonesQuery {
    final data = campaign.data() as Map<String, dynamic>?;
    final businessId = data?['businessId']?.toString() ?? '';
    return _zonesCollection
        .where('campaignId', isEqualTo: campaign.id)
        .where('businessId', isEqualTo: businessId);
  }

  bool get _campaignLocked {
    final data = campaign.data() as Map<String, dynamic>?;
    final status = data?['status']?.toString() ?? 'draft';
    return status != 'draft';
  }

  bool get _ownTeam =>
      (campaign.data() as Map<String, dynamic>?)?['executionMode'] ==
      'own_team';

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
    final name = (data?['serviceAreaTemplateName'] ?? data?['serviceAreaName'])
        ?.toString()
        .trim();
    return name == null || name.isEmpty ? 'your selected Service Area' : name;
  }

  int? get _materialQuantity {
    final data = campaign.data() as Map<String, dynamic>?;
    return (data?['materialQuantity'] as num?)?.toInt();
  }

  Future<void> _confirmZoneEvidence(String zoneId) async {
    try {
      await FirebaseFunctions.instanceFor(region: 'us-east1')
          .httpsCallable('confirmCampaignZoneIntelligence')
          .call({'campaignId': campaign.id, 'zoneId': zoneId});
      await _refreshWorkload();
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.message ??
                'Area evidence is unavailable. Review this Zone before continuing.',
          ),
        ),
      );
    }
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
      final result = await callable.call({'zoneId': zone.id});
      await FirebaseFunctions.instanceFor(region: 'us-east1')
          .httpsCallable('confirmCampaignZoneIntelligence')
          .call({'campaignId': campaign.id, 'zoneId': zone.id});
      await _refreshWorkload();
      if (!context.mounted) return;
      await reviewProductionRouteAnalysis(context, result.data);
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

  Future<CampaignAreaRecommendationResult?> _reviewSmartZonePlan(
    BuildContext context, {
    AddressSuggestion? selectedArea,
    double desiredHours = 5,
    List<Map<String, double>>? analysisBoundary,
    String? objective,
    int alternativeIndex = 0,
    String? recommendationRunId,
    List<String>? selectionIds,
    int? replaceZoneIndex,
    bool resumeSavedPlan = false,
  }) async {
    if (!_recommendationEnabled) return null;
    final revision = _planningRevision;
    final actorUid = FirebaseAuth.instance.currentUser?.uid;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final functions = FirebaseFunctions.instanceFor(region: 'us-east1');
      final request = smartZoneRecommendationRequest(
        campaignId: campaign.id,
        desiredHours: desiredHours,
        selectedArea: selectedArea,
        analysisBoundary: analysisBoundary,
        objective: objective ?? _recommendationObjective,
        alternativeIndex: alternativeIndex,
        recommendationRunId: recommendationRunId,
        selectionIds: selectionIds,
        replaceZoneIndex: replaceZoneIndex,
        resumeSavedPlan: resumeSavedPlan,
      );
      final response = await functions
          .httpsCallable(
            'getSmartZonePlan',
            options: HttpsCallableOptions(
              timeout: const Duration(seconds: 180),
            ),
          )
          .call(request);
      final plan = Map<String, dynamic>.from(response.data as Map);
      final zones = (plan['zones'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final zoneIdentities = resolveZoneDisplayIdentities(zones);
      final compensation = Map<String, dynamic>.from(
        plan['compensation'] as Map? ?? const {},
      );
      final canApply = smartZonePlanCanApply(plan);
      if (!context.mounted ||
          !_recommendationEnabled ||
          revision != _planningRevision ||
          actorUid != FirebaseAuth.instance.currentUser?.uid) {
        return null;
      }
      var selectedZoneIndex = replaceZoneIndex ?? 0;
      var useRecommendedPay = false;
      var routeReviewed = false;
      final requiresRouteReview = plan['routeReviewDigest'] is String;
      final selectedTerritory = smartZonePoints(plan['selectedTerritory']);
      final recommendationContext = plan['recommendationContext'] is Map
          ? plan['recommendationContext'] as Map
          : const {};
      final accepted = await showDialog<String>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (dialogContext, setDialogState) => AlertDialog(
            title: const Text('Recommended Marketing Area'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Review and use your recommended area. This preview has not been saved.',
                    ),
                    SmartZoneRecommendationEvidence(
                      plan: plan,
                      selectedZoneIndex: selectedZoneIndex,
                    ),
                    const SizedBox(height: 16),
                    if (_ownTeam && plan['teamCapacity'] is Map) ...[
                      Text(
                        'Team target: ${plan['teamCapacity']['targetPersonHours']} person-hours of unique coverage',
                      ),
                      Text(
                        'Supported: ~${((plan['teamCapacity']['supportedMinutes'] as num) / 60).toStringAsFixed(1)} person-hours across ${zones.length} team sections',
                      ),
                      Text(
                        'Busiest planned lane: ~${plan['teamCapacity']['estimatedFieldElapsedMinutes']} min of field work. Total elapsed time is unknown until travel and access are reviewed.',
                      ),
                      const Text(
                        'Headcount is planning information, not Assigned to or Worked by.',
                      ),
                    ],
                    if (plan['supportedWorkloadShortfallMinutes'] is num &&
                        (plan['supportedWorkloadShortfallMinutes'] as num) > 0)
                      const Text(
                        'The requested workload is not fulfilled. Use only if you deliberately want this smaller supported plan, or adjust your area/workload.',
                      ),
                    if (zones.isNotEmpty)
                      SmartZoneGeometryMap(
                        zones: zones,
                        selectedTerritory: selectedTerritory,
                        selectedZoneIndex: selectedZoneIndex,
                        onZoneSelected: (index) =>
                            setDialogState(() => selectedZoneIndex = index),
                        mapKey: const Key('recommended-smart-zone-map'),
                        planningPreview: true,
                      ),
                    const SizedBox(height: 16),
                    if (requiresRouteReview)
                      CheckboxListTile(
                        value: routeReviewed,
                        onChanged: (value) =>
                            setDialogState(() => routeReviewed = value == true),
                        title: const Text(
                          'I reviewed the mapped routes for authorized public access.',
                        ),
                        subtitle: Text(
                          _ownTeam
                              ? 'Exclude inaccessible or unsafe areas before scheduling your team.'
                              : 'Exclude inaccessible or unsafe areas before funding. '
                                    'Route Coverage Estimate uses unique mapped route length, not household counts. '
                                    'Full base requires 80%; an offered coverage bonus requires 95%.',
                        ),
                        controlAffinity: ListTileControlAffinity.leading,
                      ),
                    const SizedBox(height: 8),
                    if (!_ownTeam &&
                        canApply &&
                        (plan['recommendedScalerCount'] as num? ?? 0) > 0)
                      Text(
                        '${plan['recommendedScalerCount']} Scaler${plan['recommendedScalerCount'] == 1 ? '' : 's'} recommended',
                      ),
                    const SizedBox(height: 8),
                    const SizedBox(height: 8),
                    Text(
                      _ownTeam
                          ? 'Review these team coverage sections before use. They are not marketplace assignments. Shared travel and execution routes are not verified.'
                          : 'These are planning estimates, not guaranteed completion times. '
                                'Each recommended Zone is kept within the six-hour single-Scaler '
                                'limit and validated again before funding.',
                    ),
                    const SizedBox(height: 12),
                    if (!_ownTeam && canApply && compensation.isNotEmpty)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Scaler compensation recommendation',
                                style: Theme.of(
                                  dialogContext,
                                ).textTheme.titleMedium,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Estimated workload: '
                                '${compensation['estimatedWorkHours']} hours',
                              ),
                              Text(
                                'Recommended base payout: '
                                '${_compensationMoney(compensation['recommendedBasePayCents'])}',
                              ),
                              Text(
                                'Estimated effective compensation: '
                                '${_compensationRate(compensation['estimatedEffectiveCompensationCentsPerHour'])}',
                              ),
                              Text(
                                'Optional completion incentive: +'
                                '${_compensationMoney(compensation['suggestedCompletionBonusCents'])}',
                              ),
                              Text(
                                'Optional quality incentive: +'
                                '${_compensationMoney(compensation['suggestedQualityBonusCents'])}',
                              ),
                              Text(
                                'Potential recommended payout: '
                                '${_compensationMoney(compensation['recommendedPotentialPayoutCents'])}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Campaign compensation remains fixed-price. The hourly '
                                'equivalent is a planning-quality estimate, not an employment '
                                'classification or guarantee. Optional incentives are not '
                                'applied automatically.',
                              ),
                              if (compensation['belowRecommendedFloor'] ==
                                  true) ...[
                                const SizedBox(height: 12),
                                Text(
                                  'Below Scaled Circle recommended compensation',
                                  style: TextStyle(
                                    color: Theme.of(
                                      dialogContext,
                                    ).colorScheme.error,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                OutlinedButton.icon(
                                  onPressed: () => setDialogState(
                                    () =>
                                        useRecommendedPay = !useRecommendedPay,
                                  ),
                                  icon: Icon(
                                    useRecommendedPay
                                        ? Icons.check_circle
                                        : Icons.price_check_outlined,
                                  ),
                                  label: Text(
                                    useRecommendedPay
                                        ? 'Recommended Pay Selected'
                                        : 'Use Recommended Pay',
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    if (plan['requiresSplit'] == true) ...[
                      const SizedBox(height: 12),
                      const Card(
                        child: ListTile(
                          leading: Icon(Icons.call_split),
                          title: Text(
                            'Automatically split into workable Zones',
                          ),
                          subtitle: Text(
                            'The supported workload is divided into practical planning areas. '
                            'Only areas supported by available evidence are recommended; '
                            'the full search region remains unchanged.',
                          ),
                        ),
                      ),
                    ],
                    if (!_ownTeam &&
                        compensation['attractiveness'] ==
                            'low_acceptance_likelihood') ...[
                      const SizedBox(height: 12),
                      const Card(
                        child: ListTile(
                          leading: Icon(Icons.info_outline),
                          title: Text('Low acceptance likelihood'),
                          subtitle: Text(
                            'Consider increasing compensation, adding a completion '
                            'bonus, or reducing the campaign area.',
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (_ownTeam)
                      OwnTeamAreaWork(
                        businessId: (campaign.data() as Map)['businessId']
                            .toString(),
                        campaignId: campaign.id,
                      ),
                    ...zones.asMap().entries.map((entry) {
                      final index = entry.key;
                      final zone = entry.value;
                      final identity = zoneIdentities[index];
                      final workload = Map<String, dynamic>.from(
                        zone['workload'] as Map? ?? const {},
                      );
                      return Card(
                        color: index == selectedZoneIndex
                            ? Theme.of(context).colorScheme.primaryContainer
                            : null,
                        child: ListTile(
                          onTap: () =>
                              setDialogState(() => selectedZoneIndex = index),
                          leading: CircleAvatar(
                            backgroundColor: smartZoneColor(
                              identity.styleKey - 1,
                            ),
                            foregroundColor: Colors.white,
                            child: Text('${identity.ordinal}'),
                          ),
                          title: Text(identity.label),
                          subtitle: Text(
                            zone['targetEvidence'] is Map &&
                                    zone['targetEvidence']['eligibleMappedFeatureCount']
                                        is num
                                ? '${zone['targetEvidence']['eligibleMappedFeatureCount']} mapped target features'
                                      '${workload['estimatedHours'] is num ? ' · ~${workload['estimatedHours']} hours' : ''}'
                                : 'Target inventory unavailable · manual review needed',
                          ),
                          trailing: Text(smartZoneEvidenceQuality(zone)),
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, 'adjust'),
                child: Text(
                  resumeSavedPlan ? 'Edit selected saved Zone' : 'Adjust Area',
                ),
              ),
              SmartZoneAlternativeAction(
                onAvailable: recommendationContext['hasAlternative'] == true
                    ? () => Navigator.pop(dialogContext, 'another')
                    : null,
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, 'draw'),
                child: Text(
                  resumeSavedPlan
                      ? 'Redraw selected saved Zone'
                      : 'Draw My Own Area',
                ),
              ),
              ElevatedButton(
                onPressed: !canApply || (requiresRouteReview && !routeReviewed)
                    ? null
                    : () => Navigator.pop(dialogContext, 'use'),
                child: Text(
                  (plan['supportedWorkloadShortfallMinutes'] as num? ?? 0) > 0
                      ? 'Use Smaller Supported Plan'
                      : 'Use Recommended Area',
                ),
              ),
            ],
          ),
        ),
      );
      if (!context.mounted || !_recommendationEnabled) return null;
      if (!mounted ||
          revision != _planningRevision ||
          actorUid != FirebaseAuth.instance.currentUser?.uid) {
        return null;
      }
      if (accepted == 'another' &&
          recommendationContext['hasAlternative'] == true) {
        return _reviewSmartZonePlan(
          context,
          selectedArea: selectedArea,
          desiredHours: desiredHours,
          analysisBoundary: analysisBoundary,
          objective: objective ?? _recommendationObjective,
          recommendationRunId: plan['recommendationRunId']?.toString(),
          selectionIds: (plan['selectionIds'] as List).cast<String>(),
          replaceZoneIndex: selectedZoneIndex,
          resumeSavedPlan: resumeSavedPlan,
        );
      }
      if (resumeSavedPlan && (accepted == 'draw' || accepted == 'adjust')) {
        final rows = await _campaignZonesQuery.get();
        final ids =
            ((campaign.data() as Map)['smartZoneSelectionIds'] as List?) ?? [];
        if (!context.mounted || selectedZoneIndex >= ids.length) return null;
        final selected = rows.docs.where(
          (d) => d.data()['smartZoneCandidateId'] == ids[selectedZoneIndex],
        );
        if (selected.length != 1) {
          messenger.showSnackBar(
            const SnackBar(
              content: Text('The saved Zone changed. Reopen its boundary.'),
            ),
          );
          return null;
        }
        await _editZoneArea(context, selected.single);
        return null;
      }
      if (accepted == 'draw') {
        if (analysisBoundary != null) {
          return const CampaignAreaRecommendationResult.drawOwn();
        }
        await _createZone(
          context,
          skipNamePrompt: true,
          searchArea: selectedArea ?? _mapContext.selectedArea,
          recommendationHours: desiredHours,
          recommendationObjective: objective ?? _recommendationObjective,
        );
        return null;
      }
      if (accepted == 'adjust') {
        final proposed = zones.isEmpty
            ? plan['reviewTerritory'] ?? plan['selectedTerritory']
            : zones[selectedZoneIndex]['geometry'] ??
                  zones[selectedZoneIndex]['serviceArea'];
        final points = smartZonePoints(proposed)
            .map(
              (p) => <String, dynamic>{
                'latitude': p.latitude,
                'longitude': p.longitude,
              },
            )
            .toList();
        if (analysisBoundary != null) {
          return CampaignAreaRecommendationResult.adjust(points);
        }
        await _createZone(
          context,
          skipNamePrompt: true,
          searchArea: selectedArea ?? _mapContext.selectedArea,
          initialArea: points,
          recommendationHours: desiredHours,
          recommendationObjective: objective ?? _recommendationObjective,
        );
        return null;
      }
      if (accepted != 'use' || !canApply || !_recommendationEnabled) {
        return null;
      }
      await functions
          .httpsCallable(
            'applySmartZonePlan',
            options: HttpsCallableOptions(
              timeout: const Duration(seconds: 180),
            ),
          )
          .call({
            ...request,
            if (plan['recommendationRunId'] is String)
              'recommendationRunId': plan['recommendationRunId'],
            'planId': plan['planId'],
            'useRecommendedPay': useRecommendedPay,
            if (requiresRouteReview && routeReviewed)
              'routeReviewDigest': plan['routeReviewDigest'],
          });
      await _refreshWorkload();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            useRecommendedPay
                ? 'Recommended Zones and pay are ready to review.'
                : 'Recommended Zones are ready to review.',
          ),
        ),
      );
      return const CampaignAreaRecommendationResult.applied();
    } on FirebaseFunctionsException catch (error) {
      if (!context.mounted) return null;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            (error.message ??
                    "We couldn't find enough reliable data to recommend an area here yet. You can still draw your own area.")
                .replaceAll(RegExp(r'\s*\[\d{3}\]'), ''),
          ),
        ),
      );
    }
    return null;
  }

  Future<void> _reviewSavedAreas() async {
    final snapshot = await _campaignZonesQuery.get();
    if (!mounted) return;
    final docs = snapshot.docs;
    final rows = docs
        .map((d) => <String, dynamic>{...d.data(), 'id': d.id})
        .toList();
    final identities = resolveZoneDisplayIdentities(rows);
    var selected = 0;
    if (rows.isEmpty) return;
    final action = await showDialog<String>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, update) => AlertDialog(
          title: const Text('Saved campaign Zones'),
          content: SizedBox(
            width: 820,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  SmartZoneGeometryMap(
                    zones: rows,
                    selectedZoneIndex: selected,
                    onZoneSelected: (i) => update(() => selected = i),
                    planningPreview: true,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    identities[selected].label,
                    style: Theme.of(c).textTheme.titleLarge,
                  ),
                  ZoneIntelligencePreview(
                    geometry: rows[selected]['serviceArea'],
                    campaignId: campaign.id,
                    zoneId: rows[selected]['id'] as String,
                  ),
                  const Text(
                    'These are the current saved boundaries. Reviewing them does not replace them.',
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, 'edit'),
              child: const Text('Edit selected Zone'),
            ),
            if (_recommendationEnabled &&
                _workloadState?['recommendationReviewAvailable'] == true)
              TextButton(
                onPressed: () => Navigator.pop(c, 'alternate'),
                child: const Text('Try another area for selected Zone'),
              ),
            if (_recommendationEnabled)
              TextButton(
                onPressed: () => Navigator.pop(c, 'refresh'),
                child: const Text('Refresh campaign recommendations'),
              ),
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'edit') {
      await _editZoneArea(context, docs[selected]);
      return;
    }
    if (action == 'alternate') {
      final data = campaign.data() as Map;
      await _reviewSmartZonePlan(
        context,
        desiredHours: _requestedHours,
        resumeSavedPlan: true,
        selectionIds: (data['smartZoneSelectionIds'] as List).cast<String>(),
        replaceZoneIndex: identities[selected].ordinal - 1,
      );
      return;
    }
    if (action == 'refresh') {
      final data = campaign.data() as Map;
      final region = data['smartZoneSearchRegion'] is Map
          ? data['smartZoneSearchRegion']['geometry']
          : null;
      if (region is List && region.length >= 3) {
        await _reviewSmartZonePlan(
          context,
          desiredHours: _requestedHours,
          analysisBoundary: region
              .whereType<Map>()
              .map(
                (p) => <String, double>{
                  'latitude': (p['latitude'] as num).toDouble(),
                  'longitude': (p['longitude'] as num).toDouble(),
                },
              )
              .toList(),
        );
      } else {
        await _reviewSmartZonePlan(context, desiredHours: _requestedHours);
      }
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
    bool useAnalyzedArea = false,
    AddressSuggestion? searchArea,
    List<Map<String, dynamic>> initialArea = const [],
    double recommendationHours = 5,
    String? recommendationObjective,
  }) async {
    final campaignData = campaign.data() as Map<String, dynamic>;

    if (searchArea == null &&
        _serviceAreaBoundary.length < 3 &&
        initialArea.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select a campaign location before opening its map.'),
        ),
      );
      return;
    }
    final businessId = campaignData['businessId']?.toString();

    if (businessId == null || businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This campaign does not have a business attached.'),
        ),
      );

      return;
    }

    DocumentReference<Map<String, dynamic>>? zoneReference;

    try {
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
            focusMapOnOpen: true,
            teamCapacity: _ownTeam
                ? _manualTeamCapacity ?? _workloadState
                : null,
            beforeAccept: () async {
              if (!_ownTeam) {
                await _refreshWorkload();
                if (!mounted) return false;
                if (_workloadState?['requiredZoneCount'] == null) {
                  await _editWorkload();
                }
                if (!context.mounted ||
                    _workloadState?['requiredZoneCount'] == null) {
                  return false;
                }
                if ((_workloadState?['zoneCount'] as num? ?? 0) >=
                    (_workloadState!['requiredZoneCount'] as num)) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Review your saved Zones or explicitly change workload before saving another area.',
                      ),
                    ),
                  );
                  return false;
                }
              }
              return true;
            },
            searchBoundary:
                searchArea?.geometry
                    .map((p) => Map<String, dynamic>.from(p))
                    .toList() ??
                _serviceAreaBoundary,
            initialCenter: searchArea == null
                ? null
                : LatLng(searchArea.latitude, searchArea.longitude),
            initialBounds: searchArea?.bounds,
            searchContextLabel: searchArea?.fullAddress,
            initialArea: initialArea.isNotEmpty
                ? initialArea
                : useAnalyzedArea
                ? _serviceAreaBoundary
                : const [],
            materialQuantity: _materialQuantity,
            recommendWithinArea: !_recommendationEnabled
                ? null
                : (areaContext, boundary) => _reviewSmartZonePlan(
                    areaContext,
                    analysisBoundary: boundary,
                    desiredHours: recommendationHours,
                    objective:
                        recommendationObjective ?? _recommendationObjective,
                  ),
          ),
        ),
      );

      if (!context.mounted) {
        return;
      }

      if (areaSaved == true) {
        await zoneReference.update({'updatedAt': FieldValue.serverTimestamp()});

        await _refreshCampaignTotals();
        await _refreshWorkload();

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
    final snapshot = await _campaignZonesQuery.get();

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
          teamCapacity: _ownTeam ? _workloadState : null,
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

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('The name could not be saved. Please try again.'),
        ),
      );
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

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Removal could not be confirmed. Check the current zones before trying again.',
          ),
        ),
      );
    }
  }

  Future<void> _refreshCampaignTotals() async {
    final zonesSnapshot = await _campaignZonesQuery.get();

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
      if (!_ownTeam) 'assignedScalerCount': assignedZones,
      'zonesUpdatedAt': FieldValue.serverTimestamp(),
    });
    await _refreshWorkload();
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
                        label: 'Base earning',
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
                            'The route is below 95%. You may still approve bonus eligibility after reviewing possible GPS lag or other evidence.',
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
                        label: 'Total earning to record',
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
                  child: const Text('Approve Work'),
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
                      '\$${releasedAmount.toStringAsFixed(2)} was recorded as a verified Scaler earning'
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

    // Let the dialog route finish detaching its TextField before disposing the
    // controller or applying the server response to the streamed Zone card.
    // An immediate authoritative update during the exit transition can rebuild
    // the parent and trip Flutter's dependent-element teardown assertion.
    await Future<void>.delayed(const Duration(milliseconds: 350));
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
            '$zoneName was returned to the Scaler for additional work. No earning was recorded.',
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
            "We couldn't request a redo. No earning or job state was changed. Try again.",
          ),
        ),
      );
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

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'The assignment change could not be confirmed. Check the current assignment before trying again.',
          ),
        ),
      );
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
              label: AppEnvironmentConfig.isStaging
                  ? 'Household coverage'
                  : 'Homes Completed',

              value: AppEnvironmentConfig.isStaging
                  ? 'Not verified — route evidence only'
                  : '$completedHomes / $assignedHomes',
            ),

            const Divider(),

            _reviewMetricRow(
              label: AppEnvironmentConfig.isStaging
                  ? 'Historical Route Coverage Estimate'
                  : 'Completion',

              value: '${completionPercentage.toStringAsFixed(1)}%',
            ),

            const Divider(),

            _reviewMetricRow(
              label: 'GPS Route Points',
              value: '$routePointCount',
            ),

            const Divider(),

            _reviewMetricRow(
              label: 'Base Earning',
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
                'You can approve bonus eligibility after reviewing the GPS evidence, even when the automatic score is imperfect.',
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
                        'Simulated route: generated by a development tool. This is not physical work evidence.',
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
                  label: const Text('Approve Work'),
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
      appBar: AuthenticatedAppBar(
        title: const Text('Campaign Zones'),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: 'Download / Print Map',
            icon: const Icon(Icons.print_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) =>
                    CampaignMapRecordScreen(campaignId: campaign.id),
              ),
            ),
          ),
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
              stream: _campaignZonesQuery.snapshots(),
              builder: (context, snapshot) {
                final currentZones = (snapshot.data?.docs ?? const [])
                    .map((doc) => doc.data())
                    .toList();
                final canContinue =
                    !snapshot.hasError &&
                    campaignZonesCanContinue(
                      (snapshot.data?.docs ?? const []).map(
                        (doc) => doc.data(),
                      ),
                    ) &&
                    (_ownTeam ||
                        campaignZoneWorkloadCanReview(
                          currentZones,
                          _workloadState,
                        ));
                return SafeArea(
                  minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!canContinue)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            _workloadState?['reason']?.toString() ??
                                'Set the workload and review the required campaign Zones before continuing.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: 58,
                          minWidth: double.infinity,
                        ),
                        child: ElevatedButton.icon(
                          onPressed: canContinue
                              ? () async {
                                  if (_ownTeam || await _refreshWorkload()) {
                                    if (context.mounted) {
                                      Navigator.pop(context, true);
                                    }
                                  } else if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          _workloadState?['reason']
                                                  ?.toString() ??
                                              'Review every required Zone.',
                                        ),
                                      ),
                                    );
                                  }
                                }
                              : null,
                          icon: const Icon(Icons.arrow_forward),
                          label: Text(
                            planningFlow
                                ? 'Save Area & Return to Planner'
                                : 'Continue to Review & Launch',
                          ),
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
        onOpen: () => _createZone(
          context,
          skipNamePrompt: true,
          searchArea: _mapContext.selectedArea,
        ),
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: _campaignZonesQuery.snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(
                    "We couldn't load this campaign's areas. Return to the campaign "
                    'and reopen its map. If this continues, check your workspace access.',
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

            final zoneIdentityById = <String, ZoneDisplayIdentity>{};
            final identityInputs = zones
                .map((zone) {
                  final data = Map<String, dynamic>.from(zone.data());
                  data['zoneId'] = zone.id;
                  return data;
                })
                .toList(growable: false);
            for (final identity in resolveZoneDisplayIdentities(
              identityInputs,
            )) {
              zoneIdentityById[identity.authoritativeId] = identity;
            }
            zones.sort(
              (first, second) => zoneIdentityById[first.id]!.ordinal.compareTo(
                zoneIdentityById[second.id]!.ordinal,
              ),
            );

            int totalEstimatedHomes = 0;
            int assignedZones = 0;
            int mappedZones = 0;
            var anyHomeEstimatePending = false;
            var anyAssumedHomeCounts = false;
            var anyMappedFeatureCounts = false;

            for (final zone in zones) {
              final data = zone.data();

              final assumedCount =
                  data['homeCountMethod'] ==
                  'smart_zone_conservative_density_v1';
              anyAssumedHomeCounts = anyAssumedHomeCounts || assumedCount;
              anyMappedFeatureCounts =
                  anyMappedFeatureCounts ||
                  data['homeCountMethod'] ==
                      'osm_classified_mapped_features_v2';
              if (!assumedCount) {
                totalEstimatedHomes +=
                    (data['estimatedHomes'] as num?)?.toInt() ?? 0;
              }
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
                CampaignWorkloadSummary(
                  state: _workloadState,
                  onEdit: _campaignLocked ? null : _editWorkload,
                ),
                Text(
                  zones.isEmpty
                      ? 'Choose where this campaign will run'
                      : 'Campaign Areas',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 8),

                Text(
                  zones.isEmpty
                      ? (_serviceAreaBoundary.length >= 3
                            ? 'Saved option: $_serviceAreaName'
                            : 'No saved Service Area is required.')
                      : _ownTeam
                      ? 'Zones organize the territory for your own team.'
                      : 'One Zone is one practical Scaler assignment area.',
                ),

                const SizedBox(height: 22),

                if (zones.isNotEmpty) ...[
                  SmartZoneGeometryMap(
                    zones: zones
                        .map((zone) {
                          final data = Map<String, dynamic>.from(zone.data());
                          data['zoneId'] = zone.id;
                          return data;
                        })
                        .toList(growable: false),
                    selectedTerritory: smartZonePoints(_serviceAreaBoundary),
                    mapKey: const Key('applied-smart-zone-map'),
                    showZoneSelector: true,
                  ),
                  const SizedBox(height: 18),
                  Text(
                    _ownTeam
                        ? 'Dashed outline: selected campaign territory. Colored areas: your team’s Zones.'
                        : 'Dashed outline: selected campaign territory. Colored areas: individual Scaler Zones.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 22),
                ],

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
                            label: anyMappedFeatureCounts
                                ? 'Mapped target inventory'
                                : 'Target-specific home estimate',
                            value: anyMappedFeatureCounts
                                ? 'See per-zone evidence'
                                : anyAssumedHomeCounts
                                ? 'Unavailable — review zone sources'
                                : totalEstimatedHomes > 0
                                ? '$totalEstimatedHomes'
                                : anyHomeEstimatePending
                                ? 'Analysis needed'
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

                if (zones.isNotEmpty &&
                    !_campaignLocked &&
                    _recommendationEnabled)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.auto_fix_high),
                      title: const Text('Intelligent area recommendations'),
                      subtitle: const Text(
                        'Review supported planning options before changing the saved territory. Regional housing estimates do not establish a route or worker count.',
                      ),
                      trailing: TextButton(
                        onPressed: _reviewSavedAreas,
                        child: const Text('Review area options'),
                      ),
                    ),
                  ),

                if (zones.isEmpty)
                  CampaignZoneAreaEntry(
                    recommendationEnabled: _recommendationEnabled,
                    initialObjective: _recommendationObjective,
                    initialHours: _requestedHours,
                    onSaveWorkload: _saveWorkload,
                    executionMode: _ownTeam ? 'own_team' : 'marketplace',
                    initialTeamCapacity: _ownTeam ? _workloadState : null,
                    onManualTeamCapacity: (input) =>
                        _manualTeamCapacity = input,
                    onSaveTeamCapacity: (hours, input) =>
                        _saveWorkload(hours, teamCapacity: input),
                    onPlanningInputChanged: () => _planningRevision++,
                    locked: _campaignLocked,
                    hasSavedArea: _serviceAreaBoundary.length >= 3,
                    savedAreaName: _serviceAreaName,
                    initialSelection: _mapContext.selectedArea,
                    onSelectionChanged: (area) =>
                        _mapContext.selectedArea = area,
                    onPlan: (area, hours, objective) {
                      _recommendationObjective = objective;
                      return _reviewSmartZonePlan(
                        context,
                        selectedArea: area,
                        desiredHours: hours,
                        objective: objective,
                      );
                    },
                    onAdvancedEdit: (area) => _createZone(
                      context,
                      skipNamePrompt: true,
                      searchArea: area,
                    ),
                    onUseAnalyzedArea: _hasTransferredAnalysisArea
                        ? () => _createZone(
                            context,
                            skipNamePrompt: true,
                            useAnalyzedArea: true,
                          )
                        : null,
                  ),

                if (!_campaignLocked &&
                    zones.isNotEmpty &&
                    (_ownTeam ||
                        (zones.length <
                            (_workloadState?['requiredZoneCount'] as num? ??
                                0))))
                  OutlinedButton.icon(
                    onPressed: () => _createZone(context, skipNamePrompt: true),
                    icon: const Icon(Icons.add_location_alt_outlined),
                    label: const Text('Add next Zone'),
                  ),
                ...zones.asMap().entries.map((entry) {
                  final zone = entry.value;
                  final data = zone.data();
                  final identity = zoneIdentityById[zone.id]!;
                  final zoneName = identity.label;

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
                        displayOrdinal: identity.ordinal,
                        identityColor: smartZoneColor(identity.styleKey - 1),
                        data: {...data, 'id': zone.id},
                        onTap: _campaignLocked || data['mapLocked'] == true
                            ? null
                            : () {
                                _editZoneArea(context, zone);
                              },
                      ),

                      if (!_campaignLocked &&
                          !zoneEvidenceMatches(
                            data['zoneIntelligence'] as Map?,
                            data['serviceArea'],
                          ))
                        OutlinedButton.icon(
                          onPressed: () => _confirmZoneEvidence(zone.id),
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('Analyze current area evidence'),
                        ),

                      if (data['coverageAuthority']?['state'] ==
                              'review_required' ||
                          data['analysisStatus'] != 'complete' ||
                          data['serverZoneMetricsVersion'] !=
                              'geometry_v1_server') ...[
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: () => _retryZoneAnalysis(context, zone),
                          icon: const Icon(Icons.refresh),
                          label: Text(
                            data['coverageAuthority']?['state'] ==
                                    'review_required'
                                ? 'Review mapped route'
                                : 'Retry Zone Analysis',
                          ),
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
                                      onPressed: () => AppNavigation.push(
                                        context,
                                        AppRoutes.jobRoom(zone.id),
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
