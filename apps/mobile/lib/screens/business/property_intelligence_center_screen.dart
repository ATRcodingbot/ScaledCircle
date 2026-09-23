import 'package:flutter_app/widgets/map_source_credit.dart';
import '../../config/native_release_policy.dart';
import 'dart:math';
import '../../widgets/property_territory_shortlist.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import '../../navigation/context_back_button.dart';
import '../../services/business_workspace_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/campaign_area_geometry.dart';
import '../../services/address_search_service.dart';
import '../../services/discovery_preferences_service.dart';
import '../../services/property_intelligence_service.dart';
import '../../services/property_area_context_service.dart';
import '../../services/scaled_circle_intelligence_service.dart';
import '../../services/opportunity_goal_service.dart';
import '../../models/campaign/campaign.dart';
import '../../widgets/mapped_address_field.dart';
import '../../widgets/property_intelligence_panel.dart';
import 'subscription_screen.dart';
import 'create/campaigns/distribution/material_distribution_campaign_screen.dart';
import '../preferences/areas_preferences_screen.dart';

class PropertyIntelligenceCenterScreen extends StatefulWidget {
  const PropertyIntelligenceCenterScreen({super.key});

  @override
  State<PropertyIntelligenceCenterScreen> createState() =>
      _PropertyIntelligenceCenterScreenState();
}

enum _PropertyDiscoveryMode { serviceAreas, exploreAnywhere }

class _PropertyIntelligenceCenterScreenState
    extends State<PropertyIntelligenceCenterScreen> {
  static const _defaultCenter = LatLng(38.9784, -76.4922);

  final _mapController = MapController();
  final _searchController = TextEditingController();
  final _objectiveController = TextEditingController();
  final _questionController = TextEditingController();
  final _aiSectionKey = GlobalKey();
  final _aiQuestionFocus = FocusNode();
  final _service = PropertyIntelligenceService();
  final _aiService = ScaledCircleIntelligenceService();
  final _areaContextService = const PropertyAreaContextService();
  final List<LatLng> _inputPoints = [];
  List<LatLng> _area = [];
  CampaignAreaShape _shape = CampaignAreaShape.polygon;
  final List<_ExploratoryAnalysis> _analyses = [];

  PropertyIntelligenceAnalysis? _analysis;
  bool _analyzing = false;
  bool _askingAi = false;
  bool _fromSavedArea = true;
  bool _outsideUsualArea = false;
  String? _selectedSavedAreaName = 'All enabled service areas';
  String? _selectedSavedAreaId;
  Map<String, dynamic>? _territoryReport;
  List<Map<String, dynamic>> _territories = [];
  String? _selectedTerritoryId;
  int _scopeVersion = 0;
  String? _savedRequestId;
  bool _territoryBusy = false;

  void _invalidateScope() {
    _scopeVersion++;
    _savedRequestId = null;
    _territoryReport = null;
    _territories = [];
    _selectedTerritoryId = null;
    _analyzing = false;
    _askingAi = false;
    _analysis = null;
    _aiInterpretation = null;
  }

  List<SavedPropertyAreaContext> _savedAreaContexts = const [];
  ScaledCircleAiInterpretation? _aiInterpretation;
  List<BusinessOpportunityGoal> _goals = const [];
  BusinessOpportunityGoal? _selectedGoal;

  @override
  void initState() {
    super.initState();
    _objectiveController.addListener(_objectiveChanged);
    _loadGoals();
  }

  void _objectiveChanged() {
    if (mounted) setState(_invalidateScope);
  }

  Future<void> _loadGoals() async {
    try {
      final goals = await OpportunityGoalService().loadSuggestedAndSaved();
      if (!mounted) return;
      setState(() {
        _goals = goals;
        _selectedGoal ??= goals.isEmpty ? null : goals.first;
        if (_objectiveController.text.trim().isEmpty && _selectedGoal != null) {
          _objectiveController.text = _selectedGoal!.label;
        }
      });
    } catch (_) {
      // Manual goal entry remains available.
    }
  }

  Future<void> _saveCustomGoal() async {
    final controller = TextEditingController();
    final label = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Save a goal'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'What are you trying to get more of?',
            hintText: 'Get more screened porch jobs',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Save this goal'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (label == null || label.trim().isEmpty) return;
    try {
      final goal = await OpportunityGoalService().saveCustom(label);
      if (!mounted) return;
      setState(() {
        _goals = [..._goals, goal];
        _selectedGoal = goal;
        _objectiveController.text = goal.label;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("We couldn't save that goal. Try again."),
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _objectiveController.dispose();
    _questionController.dispose();
    _aiQuestionFocus.dispose();
    super.dispose();
  }

  Future<void> _focusAiQuestion() async {
    if (_questionController.text.trim().isEmpty) {
      _questionController.text =
          'What marketing opportunities does this area suggest for my business?';
    }
    final target = _aiSectionKey.currentContext;
    if (target != null) {
      await Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
        alignment: 0.08,
      );
    }
    if (mounted) _aiQuestionFocus.requestFocus();
  }

  String _copyableAiAnalysis() {
    final result = _aiInterpretation;
    if (result == null) return '';
    final buffer = StringBuffer()
      ..writeln('PROPERTY SIGNAL')
      ..writeln(
        'Property Age Signal ${_analysis?.signal?.toString() ?? 'unavailable'}',
      )
      ..writeln();
    if (result.knownData['weather'] case final Map weather) {
      buffer
        ..writeln('WEATHER SIGNAL')
        ..writeln(
          (weather['alerts'] as List? ?? const []).isEmpty
              ? 'No active authoritative weather alert was supplied.'
              : (weather['alerts'] as List)
                    .map((item) => item.toString())
                    .join('\n'),
        )
        ..writeln();
    }
    buffer
      ..writeln('AI OPPORTUNITY ANALYSIS')
      ..writeln(result.summary);
    for (final opportunity in result.opportunities) {
      buffer
        ..writeln()
        ..writeln(opportunity['title'] ?? '')
        ..writeln(opportunity['rationale'] ?? '')
        ..writeln(opportunity['qualification'] ?? '');
    }
    buffer
      ..writeln()
      ..writeln('LIMITATIONS')
      ..writeln(result.limitations.join('\n'));
    return buffer.toString().trim();
  }

  Future<void> _copyAiAnalysis() async {
    await Clipboard.setData(ClipboardData(text: _copyableAiAnalysis()));
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Copied to clipboard')));
    }
  }

  List<Map<String, double>> get _geometry => _area
      .map(
        (point) => <String, double>{
          'latitude': point.latitude,
          'longitude': point.longitude,
        },
      )
      .toList(growable: false);

  void _selectLocation(AddressSuggestion suggestion) {
    _mapController.move(LatLng(suggestion.latitude, suggestion.longitude), 14);
  }

  void _addPoint(TapPosition _, LatLng point) {
    if (_fromSavedArea) return;
    _invalidateScope();
    setState(() {
      _fromSavedArea = false;
      _selectedSavedAreaName = null;
      if (_inputPoints.length >=
          CampaignAreaGeometry.maximumInputPoints(_shape)) {
        _inputPoints.clear();
      }
      _inputPoints.add(point);
      _area = CampaignAreaGeometry.fromInput(_shape, _inputPoints);
      _analysis = null;
      _aiInterpretation = null;
    });
  }

  Future<void> _chooseSavedArea() async {
    final saved = await DiscoveryPreferencesService().load();
    final areas = List<Map<String, dynamic>>.from(
      (saved?['areas'] as List? ?? const []).whereType<Map>().map(
        (value) => Map<String, dynamic>.from(value),
      ),
    ).where((area) => area['enabled'] != false).toList();
    _savedAreaContexts = _areaContextService.resolveEnabledAreas(saved);
    if (!mounted) return;
    if (areas.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Set up My Service Areas first, or use Explore Anywhere.',
          ),
        ),
      );
      return;
    }
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Which service areas should we analyze?'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.pop(context, <String, dynamic>{
              'name': 'All enabled service areas',
            }),
            child: const Text('All enabled service areas'),
          ),
          for (final area in areas)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, area),
              child: Text(area['name']?.toString() ?? 'Service area'),
            ),
        ],
      ),
    );
    if (selected == null || !mounted) return;
    _loadSavedArea(selected);
  }

  void _loadSavedArea(Map<String, dynamic> area) {
    setState(() {
      _invalidateScope();
      _selectedSavedAreaId = area['id']?.toString();
      _selectedSavedAreaName = area['name']?.toString();
      _fromSavedArea = true;
      _outsideUsualArea = false;
      _area = [];
      _inputPoints.clear();
      _analysis = null;
      _aiInterpretation = null;
    });
  }

  Future<void> _exploreAnywhere() async {
    _invalidateScope();
    final version = _scopeVersion;
    final saved = await DiscoveryPreferencesService().load();
    if (!mounted || version != _scopeVersion) return;
    setState(() {
      _savedAreaContexts = _areaContextService.resolveEnabledAreas(saved);
      _fromSavedArea = false;
      _outsideUsualArea = false;
      _selectedSavedAreaName = null;
      _inputPoints.clear();
      _area = [];
      _analysis = null;
      _aiInterpretation = null;
      _searchController.clear();
    });
  }

  void _selectShape(CampaignAreaShape shape) {
    _invalidateScope();
    setState(() {
      _shape = shape;
      _inputPoints.clear();
      _area = [];
      _fromSavedArea = false;
      _selectedSavedAreaName = null;
      _analysis = null;
      _aiInterpretation = null;
    });
  }

  void _clearArea() {
    _invalidateScope();
    setState(() {
      _area.clear();
      _inputPoints.clear();
      _fromSavedArea = false;
      _selectedSavedAreaName = null;
      _analysis = null;
      _aiInterpretation = null;
    });
  }

  void _selectTerritory(Map<String, dynamic> territory) {
    final geometry = (territory['geometry'] as List? ?? [])
        .whereType<Map>()
        .where((p) => p['latitude'] is num && p['longitude'] is num)
        .map(
          (p) => LatLng(
            (p['latitude'] as num).toDouble(),
            (p['longitude'] as num).toDouble(),
          ),
        )
        .toList();
    if (geometry.length < 3 || territory['analysis'] is! Map) return;
    setState(() {
      _scopeVersion++;
      _analyzing = false;
      _askingAi = false;
      _area = geometry;
      _shape = CampaignAreaShape.polygon;
      _selectedTerritoryId = territory['id']?.toString();
      _analysis = PropertyIntelligenceAnalysis(
        Map<String, dynamic>.from(territory['analysis'] as Map),
      );
      _aiInterpretation = null;
    });
    _mapController.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(geometry),
        padding: const EdgeInsets.all(35),
      ),
    );
  }

  void _territoryError() {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Property Intelligence could not be confirmed. Check your saved results or try again.',
          ),
        ),
      );
    }
  }

  Future<void> _showTerritoryHistory() async {
    if (_territoryBusy) return;
    final version = _scopeVersion;
    setState(() => _territoryBusy = true);
    try {
      final history = await _service.territoryHistory();
      if (!mounted || version != _scopeVersion) return;
      setState(() {
        _territories = history;
        _analysis = null;
        _area = [];
        _selectedTerritoryId = null;
        _territoryReport = {
          'summary': 'Your territory history',
          'historyNote':
              'Saved territories are separate from My Service Areas.',
        };
      });
    } catch (_) {
      _territoryError();
    } finally {
      if (mounted) setState(() => _territoryBusy = false);
    }
  }

  Future<void> _saveTerritory(Map<String, dynamic> territory) async {
    if (_territoryBusy || territory['id'] == null) return;
    final version = _scopeVersion;
    setState(() => _territoryBusy = true);
    try {
      final saved = await _service.saveTerritory(territory['id'].toString());
      if (!mounted || version != _scopeVersion) return;
      setState(() {
        _territories = _territories
            .map(
              (item) => item['id'] == saved['id'] ? {...item, ...saved} : item,
            )
            .toList();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Territory saved. My Service Areas are unchanged.'),
        ),
      );
    } catch (_) {
      _territoryError();
    } finally {
      if (mounted) setState(() => _territoryBusy = false);
    }
  }

  Future<void> _analyzeArea() async {
    if ((!_fromSavedArea && _area.length < 3) || _analyzing) return;
    final version = _scopeVersion;
    final geometry = _geometry;
    final label = _selectedSavedAreaName ?? _searchController.text.trim();
    final objective = _objectiveController.text.trim();
    setState(() => _analyzing = true);
    try {
      if (_fromSavedArea) {
        _savedRequestId ??=
            'property_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(0x100000000)}';
        final report = await _service.analyzeSavedAreas(
          objective: objective,
          requestId: _savedRequestId!,
          savedAreaId: _selectedSavedAreaId,
        );
        if (!mounted || version != _scopeVersion) return;
        final recommendations = (report['recommendations'] as List? ?? [])
            .whereType<Map>()
            .map((r) => Map<String, dynamic>.from(r))
            .toList();
        setState(() {
          _territoryReport = report;
          _savedRequestId = null;
          _territories = recommendations;
          _analysis = null;
          _area = [];
          _selectedTerritoryId = null;
        });
        if (recommendations.isNotEmpty) _selectTerritory(recommendations.first);
      } else {
        final analysis = await _service.analyzeArea(
          geometry,
          objective: objective,
        );
        if (!mounted || version != _scopeVersion) return;
        setState(() {
          _outsideUsualArea = !_areaContextService.overlapsSavedArea(
            _area,
            _savedAreaContexts,
          );
          _analysis = analysis;
          _aiInterpretation = null;
          final analysisId = analysis.data['analysisId']?.toString();
          _analyses.removeWhere(
            (entry) => analysisId != null && entry.analysisId == analysisId,
          );
          _analyses.add(
            _ExploratoryAnalysis(
              label: label.isEmpty ? 'Analysis ${_analyses.length + 1}' : label,
              geometry: geometry,
              analysis: analysis,
            ),
          );
        });
      }
    } catch (_) {
      if (version == _scopeVersion) _territoryError();
    } finally {
      if (mounted && version == _scopeVersion) {
        setState(() => _analyzing = false);
      }
    }
  }

  Future<void> _confirmAddToServiceAreas() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add this area?'),
        content: const Text(
          'Your saved service areas will change only after you review and save the area.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Review Service Areas'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => const AreasPreferencesScreen(role: 'business'),
        ),
      );
    }
  }

  Future<void> _askAi({bool combineWithWeather = false}) async {
    final version = _scopeVersion;
    final analysis = _analysis;
    final analysisId = analysis?.data['analysisId']?.toString() ?? '';
    final geometryDigest = analysis?.data['geometryDigest']?.toString() ?? '';
    if (analysis == null ||
        analysisId.isEmpty ||
        geometryDigest.isEmpty ||
        _askingAi) {
      return;
    }
    setState(() => _askingAi = true);
    try {
      final result = combineWithWeather
          ? await _aiService.analyzeCombined(
              analysisId: analysisId,
              geometryDigest: geometryDigest,
              latitude:
                  _area.map((point) => point.latitude).reduce((a, b) => a + b) /
                  _area.length,
              longitude:
                  _area
                      .map((point) => point.longitude)
                      .reduce((a, b) => a + b) /
                  _area.length,
              businessObjective: _objectiveController.text,
              question: _questionController.text,
            )
          : await _aiService.analyzeProperty(
              analysisId: analysisId,
              geometryDigest: geometryDigest,
              businessObjective: _objectiveController.text,
              question: _questionController.text,
            );
      if (!mounted || version != _scopeVersion) return;
      setState(() => _aiInterpretation = result);
    } catch (_) {
      if (!mounted || version != _scopeVersion) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'AI analysis is temporarily unavailable. Your property facts remain available.',
          ),
        ),
      );
    } finally {
      if (mounted && version == _scopeVersion) {
        setState(() => _askingAi = false);
      }
    }
  }

  Widget _buildAiAnalysis() {
    final result = _aiInterpretation;
    return Card(
      key: _aiSectionKey,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'AI OPPORTUNITY ANALYSIS',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Known property and weather facts remain authoritative. AI interpretation is advisory.',
            ),
            if ((_selectedGoal?.service.toLowerCase() ?? '').contains('hvac'))
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Property age does not establish HVAC system age, condition, ownership, or replacement need. Any recommendation is broad area marketing only.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
            const SizedBox(height: 10),
            TextField(
              controller: _objectiveController,
              decoration: const InputDecoration(
                labelText: 'Business objective (optional)',
                hintText: 'Example: I run an HVAC company.',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _questionController,
              focusNode: _aiQuestionFocus,
              maxLength: 1200,
              decoration: const InputDecoration(
                labelText: 'Ask about this area',
                hintText: 'What would you market here?',
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: _askingAi ? null : () => _askAi(),
                  icon: _askingAi
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome_outlined),
                  label: const Text('Ask AI About This Area'),
                ),
                OutlinedButton.icon(
                  onPressed: _askingAi
                      ? null
                      : () => _askAi(combineWithWeather: true),
                  icon: const Icon(Icons.cloud_outlined),
                  label: const Text('Combine With Weather'),
                ),
              ],
            ),
            if (result != null) ...[
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  key: const Key('copy-property-ai-analysis'),
                  onPressed: _copyAiAnalysis,
                  icon: const Icon(Icons.copy_all_outlined),
                  label: const Text('Copy All'),
                ),
              ),
              const Divider(height: 24),
              const Text(
                'WHAT WE KNOW',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                'Property Age Signal ${_analysis?.signal?.toString() ?? 'unavailable'} — authoritative Property Intelligence above.',
              ),
              if (result.knownData['weather'] case final Map weather) ...[
                const SizedBox(height: 8),
                const Text(
                  'WEATHER SIGNAL',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(
                  (weather['alerts'] as List? ?? const []).isEmpty
                      ? 'No active authoritative weather alert was supplied.'
                      : (weather['alerts'] as List)
                            .whereType<Map>()
                            .map(
                              (alert) =>
                                  '${alert['event'] ?? 'Weather alert'} (${alert['severity'] ?? 'unknown severity'})',
                            )
                            .join(' • '),
                ),
              ],
              const SizedBox(height: 10),
              const Text(
                'WHAT IT MAY MEAN FOR YOUR GOAL',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(result.summary),
              for (final opportunity in result.opportunities) ...[
                const SizedBox(height: 8),
                Text(
                  opportunity['title'] ?? '',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(opportunity['rationale'] ?? ''),
                Text(
                  opportunity['qualification'] ?? '',
                  style: const TextStyle(fontStyle: FontStyle.italic),
                ),
              ],
              if (result.limitations.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Limitations: ${result.limitations.join(' ')}'),
              ],
              const SizedBox(height: 12),
              const Text(
                'WHAT YOU COULD DO NEXT',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton(
                    onPressed: _createCampaign,
                    child: const Text('Create Flyer Campaign'),
                  ),
                  OutlinedButton(
                    onPressed: _createCampaign,
                    child: const Text('Create Campaign Anyway'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _compareAreas() async {
    if (_analyzing || _analysis == null || _area.length < 3) return;
    final version = _scopeVersion;
    final current = _analysis!;
    setState(() => _analyzing = true);
    try {
      final report = await _service.analyzeSavedAreas(
        objective: _objectiveController.text.trim(),
        requestId:
            'nearby_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(0x100000000)}',
        comparisonGeometry: _geometry,
      );
      if (!mounted || version != _scopeVersion) return;
      final alternatives = (report['recommendations'] as List? ?? [])
          .whereType<Map>()
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      setState(() {
        _territoryReport = report;
        _territories = alternatives;
        _analyses.clear();
        _analyses.add(
          _ExploratoryAnalysis(
            label: 'Current area',
            geometry: _geometry,
            analysis: current,
          ),
        );
        for (final area in alternatives) {
          _analyses.add(
            _ExploratoryAnalysis(
              label: area['name'].toString(),
              geometry: (area['geometry'] as List)
                  .map(
                    (p) => <String, double>{
                      'latitude': (p['latitude'] as num).toDouble(),
                      'longitude': (p['longitude'] as num).toDouble(),
                    },
                  )
                  .toList(),
              analysis: PropertyIntelligenceAnalysis(
                Map<String, dynamic>.from(area['analysis'] as Map),
              ),
            ),
          );
        }
      });
    } catch (_) {
      _territoryError();
      return;
    } finally {
      if (mounted && version == _scopeVersion) {
        setState(() => _analyzing = false);
      }
    }
    if (_analyses.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No fresh nearby territory had enough property evidence. Your current analysis is preserved; review your saved service areas or try again later.',
          ),
        ),
      );
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Compare Property Intelligence'),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: _analyses
                  .map(
                    (entry) => ListTile(
                      leading: CircleAvatar(
                        child: Text(entry.analysis.signal?.toString() ?? '—'),
                      ),
                      title: Text(entry.label),
                      subtitle: Text(
                        '${entry.analysis.source} • ${entry.analysis.inputGranularity} • '
                        '${entry.analysis.predominantEra} • Pre-1980 '
                        '${entry.analysis.pre1980.toStringAsFixed(0)}% • Pre-2000 '
                        '${entry.analysis.pre2000.toStringAsFixed(0)}% • '
                        '${entry.analysis.confidence} confidence • '
                        '${entry.analysis.coverage.toStringAsFixed(0)}% coverage',
                      ),
                    ),
                  )
                  .toList(growable: false),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  String? get _selectedTerritoryName {
    final territory = _territories
        .where((item) => item['id'] == _selectedTerritoryId)
        .firstOrNull;
    return territory?['name']?.toString();
  }

  Future<void> _createCampaign() async {
    final analysis = _analysis;
    if (analysis == null || _area.length < 3) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => MaterialDistributionCampaignScreen(
          campaignType: CampaignType.flyerDistribution,
          initialServiceArea: List<Map<String, double>>.from(_geometry),
          initialServiceAreaName: _fromSavedArea
              ? _selectedTerritoryName
              : _selectedSavedAreaName,
          initialGoal: _selectedGoal?.label ?? _objectiveController.text.trim(),
          initialService: _selectedGoal?.service,
          propertyIntelligenceAnalysisId: analysis.data['analysisId']
              ?.toString(),
        ),
      ),
    );
  }

  Widget _buildPhysicalChannelRecommendation() {
    final suitability = _analysis?.physicalChannelSuitability ?? const {};
    final recommendation = suitability['recommendation']?.toString();
    if (recommendation == null) return const SizedBox.shrink();
    final directMail = recommendation == 'direct_mail_preferred';
    final field = recommendation == 'scaler_distribution_preferred';
    final label = directMail
        ? 'Direct Mail / Postcards'
        : field
        ? 'Scaler Distribution'
        : 'Manual channel review';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'RECOMMENDED PHYSICAL CHANNEL',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(label, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(suitability['explanation']?.toString() ?? ''),
            if ((suitability['unavailableSignals'] as List? ?? const [])
                .isNotEmpty)
              Text(
                'Unavailable: ${(suitability['unavailableSignals'] as List).join(', ')}. No unavailable access characteristic was inferred.',
                style: const TextStyle(fontStyle: FontStyle.italic),
              ),
            if (suitability['lawfulAuthorizedAccessRequired'] == true)
              const Text(
                'Scaler activity requires lawful, authorized physical access.',
              ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (directMail) const Text('Postcards — Coming Soon'),
                OutlinedButton(
                  onPressed: _createCampaign,
                  child: Text(
                    directMail
                        ? 'Create Campaign Anyway'
                        : 'Create Field Campaign',
                  ),
                ),
              ],
            ),
            if (directMail)
              const Text(
                'This recommendation is advisory. Choosing Scaler distribution preserves distribution-only work and does not create a door-to-door outreach job.',
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPremiumGate() {
    return Scaffold(
      appBar: AuthenticatedAppBar(
        leading: const ContextBackButton(
          fallback: '/business/growth',
          businessOnly: true,
        ),
        title: const Text('Property Intelligence'),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.workspace_premium_outlined, size: 40),
                  const SizedBox(height: 14),
                  const Text(
                    'Know your market before you spend.',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    kIsWeb
                        ? 'Included with Scale — \$499/month'
                        : 'Not included in your current membership',
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Analyze housing-stock age, compare target areas, understand construction eras, and turn selected areas into ScaledCircle campaigns.',
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    key: const Key('property-intelligence-upgrade'),
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const SubscriptionScreen(),
                      ),
                    ),
                    icon: const Icon(Icons.upgrade),
                    label: const Text(
                      kIsWeb ? 'Upgrade to Scale' : 'View Membership',
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

  Widget _buildOperationalCenter() {
    final polygon = _area.length < 3
        ? <Polygon>[]
        : <Polygon>[
            Polygon(
              points: _area,
              borderStrokeWidth: 3,
              borderColor: const Color(0xFF19C7A2),
              color: const Color(0x3319C7A2),
              label: _fromSavedArea ? _selectedTerritoryName : null,
            ),
          ];
    if (_fromSavedArea) {
      for (final territory in _territories) {
        final points = (territory['geometry'] as List? ?? [])
            .whereType<Map>()
            .where((p) => p['latitude'] is num && p['longitude'] is num)
            .map(
              (p) => LatLng(
                (p['latitude'] as num).toDouble(),
                (p['longitude'] as num).toDouble(),
              ),
            )
            .toList();
        if (points.length >= 3 && territory['id'] != _selectedTerritoryId) {
          polygon.add(
            Polygon(
              points: points,
              borderStrokeWidth: 2,
              borderColor: Colors.blue,
              color: const Color(0x222878FF),
              label:
                  '${territory['rank'] ?? ''}. ${territory['name'] ?? 'Territory'}',
            ),
          );
        }
      }
    }
    return Scaffold(
      appBar: AuthenticatedAppBar(
        leading: const ContextBackButton(
          fallback: '/business/growth',
          businessOnly: true,
        ),
        title: const Text('Property Intelligence'),
      ),
      body: LayoutBuilder(
        builder: (context, viewport) {
          final desktop = viewport.maxWidth >= 760;
          final mapHeight = desktop
              ? (viewport.maxHeight * 0.62).clamp(520.0, 760.0)
              : (viewport.maxHeight * 0.55).clamp(360.0, 560.0);
          return SingleChildScrollView(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'STEP 1 — WHAT DO YOU WANT MORE OF?',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      if (_goals.isNotEmpty)
                        DropdownButtonFormField<BusinessOpportunityGoal>(
                          key: const Key('property-opportunity-goal'),
                          initialValue: _selectedGoal,
                          decoration: const InputDecoration(
                            labelText: 'What are you trying to accomplish?',
                            border: OutlineInputBorder(),
                          ),
                          items: _goals
                              .map(
                                (goal) => DropdownMenuItem(
                                  value: goal,
                                  child: Text(goal.label),
                                ),
                              )
                              .toList(growable: false),
                          onChanged: (goal) => setState(() {
                            _selectedGoal = goal;
                            _objectiveController.text = goal?.label ?? '';
                            _aiInterpretation = null;
                          }),
                        ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: _saveCustomGoal,
                          icon: const Icon(Icons.add_task_outlined),
                          label: const Text('Save a different goal'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'STEP 2 — WHERE DO YOU WANT TO LOOK?',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Explore property age and housing-stock patterns before choosing where to market.',
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Choose an area:',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      SegmentedButton<_PropertyDiscoveryMode>(
                        segments: const [
                          ButtonSegment(
                            value: _PropertyDiscoveryMode.serviceAreas,
                            icon: Icon(Icons.home_work_outlined),
                            label: Text('My Service Areas'),
                          ),
                          ButtonSegment(
                            value: _PropertyDiscoveryMode.exploreAnywhere,
                            icon: Icon(Icons.public),
                            label: Text('Explore Anywhere'),
                          ),
                        ],
                        selected: {
                          _fromSavedArea
                              ? _PropertyDiscoveryMode.serviceAreas
                              : _PropertyDiscoveryMode.exploreAnywhere,
                        },
                        onSelectionChanged: (selection) {
                          if (selection.first ==
                              _PropertyDiscoveryMode.serviceAreas) {
                            _loadSavedArea({
                              'name': 'All enabled service areas',
                            });
                          } else {
                            _exploreAnywhere();
                          }
                        },
                      ),
                      if (_fromSavedArea && _selectedSavedAreaName != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Analyzing: $_selectedSavedAreaName',
                                  key: const Key(
                                    'selected-saved-property-area',
                                  ),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              TextButton.icon(
                                key: const Key('property-change-saved-area'),
                                onPressed: _chooseSavedArea,
                                icon: const Icon(Icons.swap_horiz),
                                label: const Text('Change area'),
                              ),
                            ],
                          ),
                        ),
                      if (_area.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _fromSavedArea
                                      ? 'Inside your service area'
                                      : _outsideUsualArea
                                      ? 'Outside your usual service area — manual exploration is always available.'
                                      : 'Explore Anywhere — saved preferences do not restrict manual analysis.',
                                ),
                              ),
                              if (!_fromSavedArea && _outsideUsualArea)
                                TextButton(
                                  onPressed: _confirmAddToServiceAreas,
                                  child: const Text('Add to Service Areas'),
                                ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 12),
                      if (!_fromSavedArea) ...[
                        MappedAddressField(
                          controller: _searchController,
                          labelText: 'Search location',
                          hintText: 'City, ZIP, neighborhood, or address',
                          onSelected: _selectLocation,
                        ),
                        const SizedBox(height: 10),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: SegmentedButton<CampaignAreaShape>(
                            segments: CampaignAreaShape.values
                                .map(
                                  (shape) => ButtonSegment(
                                    value: shape,
                                    label: Text(
                                      CampaignAreaGeometry.label(shape),
                                    ),
                                  ),
                                )
                                .toList(growable: false),
                            selected: {_shape},
                            onSelectionChanged: (selection) =>
                                _selectShape(selection.first),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                SizedBox(
                  key: const Key('property-map-workspace'),
                  height: mapHeight,
                  child: MapAttributionFrame(
                    child: FlutterMap(
                      mapController: _mapController,
                      options: MapOptions(
                        initialCenter: _defaultCenter,
                        initialZoom: 12,
                        onTap: _fromSavedArea ? null : _addPoint,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.scaledcircle.app',
                        ),
                        PolygonLayer(polygons: polygon),
                        MarkerLayer(
                          markers: _area
                              .asMap()
                              .entries
                              .map(
                                (entry) => Marker(
                                  point: entry.value,
                                  width: 34,
                                  height: 34,
                                  child: CircleAvatar(
                                    child: Text('${entry.key + 1}'),
                                  ),
                                ),
                              )
                              .toList(growable: false),
                        ),
                      ],
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'STEP 3 — ANALYZE',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _fromSavedArea
                            ? 'Analyze your saved service areas for ranked territories. No campaign is created.'
                            : !CampaignAreaGeometry.isComplete(_shape, _area)
                            ? 'Draw a ${CampaignAreaGeometry.label(_shape).toLowerCase()} using the same controls as campaign maps.'
                            : '${CampaignAreaGeometry.label(_shape)} ready with ${_area.length} normalized polygon points. Analysis does not create a campaign.',
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FilledButton.icon(
                            onPressed:
                                (_fromSavedArea ||
                                        CampaignAreaGeometry.isComplete(
                                          _shape,
                                          _area,
                                        )) &&
                                    !_analyzing
                                ? _analyzeArea
                                : null,
                            icon: _analyzing
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.analytics_outlined),
                            label: Text(
                              _fromSavedArea
                                  ? 'Where should I market next?'
                                  : 'Analyze Area',
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: _fromSavedArea
                                ? _chooseSavedArea
                                : _area.isEmpty
                                ? null
                                : _clearArea,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Clear / Change Area'),
                          ),
                        ],
                      ),
                      if (_fromSavedArea) ...[
                        TextButton.icon(
                          onPressed: _territoryBusy
                              ? null
                              : _showTerritoryHistory,
                          icon: const Icon(Icons.history),
                          label: const Text('Territory History'),
                        ),
                        if (_territoryReport != null)
                          PropertyTerritoryShortlist(
                            report: _territoryReport!,
                            recommendations: _territories,
                            selectedId: _selectedTerritoryId,
                            busy: _territoryBusy,
                            onSelect: _selectTerritory,
                            onSave: _saveTerritory,
                          ),
                      ],
                      if (_analysis != null) ...[
                        const SizedBox(height: 12),
                        PropertyIntelligencePanel(
                          analysis: _analysis!,
                          onCreateCampaign: _createCampaign,
                          onCompare: _compareAreas,
                          onAskAi: _focusAiQuestion,
                        ),
                        const SizedBox(height: 12),
                        _buildPhysicalChannelRecommendation(),
                        const SizedBox(height: 12),
                        if (NativeReleasePolicy.premiumToolsAvailable)
                          _buildAiAnalysis(),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return _buildPremiumGate();
    return FutureBuilder<Map<String, dynamic>>(
      future: BusinessWorkspaceService().context(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          return Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => setState(() {}),
                child: const Text('Retry workspace access'),
              ),
            ),
          );
        }
        final entitled =
            snapshot.data?['propertyIntelligenceAvailable'] == true &&
            BusinessWorkspaceSession.can('intelligence');
        return entitled ? _buildOperationalCenter() : _buildPremiumGate();
      },
    );
  }
}

class _ExploratoryAnalysis {
  const _ExploratoryAnalysis({
    required this.label,
    required this.geometry,
    required this.analysis,
  });

  final String label;
  final List<Map<String, double>> geometry;
  final PropertyIntelligenceAnalysis analysis;

  String? get analysisId => analysis.data['analysisId']?.toString();
}
