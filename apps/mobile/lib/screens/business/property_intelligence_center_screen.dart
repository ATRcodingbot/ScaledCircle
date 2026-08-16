import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
import '../../services/subscription_plan_service.dart';
import '../../services/opportunity_goal_service.dart';
import '../../models/campaign/campaign.dart';
import '../../widgets/mapped_address_field.dart';
import '../../widgets/property_intelligence_panel.dart';
import 'subscription_screen.dart';
import 'managed_growth_screen.dart';
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
  final _planService = SubscriptionPlanService();
  final _areaContextService = const PropertyAreaContextService();
  final List<LatLng> _inputPoints = [];
  List<LatLng> _area = [];
  CampaignAreaShape _shape = CampaignAreaShape.polygon;
  final List<_ExploratoryAnalysis> _analyses = [];

  PropertyIntelligenceAnalysis? _analysis;
  bool _analyzing = false;
  bool _askingAi = false;
  bool _fromSavedArea = false;
  bool _outsideUsualArea = false;
  String? _selectedSavedAreaName;
  List<SavedPropertyAreaContext> _savedAreaContexts = const [];
  ScaledCircleAiInterpretation? _aiInterpretation;
  List<BusinessOpportunityGoal> _goals = const [];
  BusinessOpportunityGoal? _selectedGoal;

  @override
  void initState() {
    super.initState();
    _loadGoals();
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
    final selected = areas.length == 1
        ? areas.single
        : await showDialog<Map<String, dynamic>>(
            context: context,
            builder: (context) => SimpleDialog(
              title: const Text('Which service area should we analyze?'),
              children: areas
                  .map(
                    (area) => SimpleDialogOption(
                      onPressed: () => Navigator.pop(context, area),
                      child: Text(area['name']?.toString() ?? 'Service area'),
                    ),
                  )
                  .toList(),
            ),
          );
    if (selected == null || !mounted) return;
    final contextArea = _areaContextService.resolve(selected);
    if (contextArea == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This saved place needs a mapped boundary before Property Intelligence can analyze it. Edit the service area to add one.',
          ),
        ),
      );
      return;
    }
    _loadSavedArea(contextArea);
  }

  void _loadSavedArea(SavedPropertyAreaContext area) {
    setState(() {
      _shape = CampaignAreaShape.polygon;
      _inputPoints
        ..clear()
        ..addAll(area.polygon);
      _area = area.polygon;
      _fromSavedArea = true;
      _outsideUsualArea = false;
      _selectedSavedAreaName = area.name;
      _analysis = null;
      _aiInterpretation = null;
      _searchController.text = area.name;
    });
    _mapController.move(area.polygon.first, 11);
  }

  Future<void> _exploreAnywhere() async {
    final saved = await DiscoveryPreferencesService().load();
    if (!mounted) return;
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
    setState(() {
      _area.clear();
      _inputPoints.clear();
      _fromSavedArea = false;
      _selectedSavedAreaName = null;
      _analysis = null;
      _aiInterpretation = null;
    });
  }

  Future<void> _analyzeArea() async {
    if (_area.length < 3 || _analyzing) return;
    setState(() => _analyzing = true);
    try {
      final analysis = await _service.analyzeArea(_geometry);
      if (!mounted) return;
      setState(() {
        _outsideUsualArea =
            !_fromSavedArea &&
            !_areaContextService.overlapsSavedArea(_area, _savedAreaContexts);
        _analysis = analysis;
        _aiInterpretation = null;
        final analysisId = analysis.data['analysisId']?.toString();
        _analyses.removeWhere(
          (entry) => analysisId != null && entry.analysisId == analysisId,
        );
        _analyses.add(
          _ExploratoryAnalysis(
            label:
                _selectedSavedAreaName ??
                (_searchController.text.trim().isEmpty
                    ? 'Analysis ${_analyses.length + 1}'
                    : _searchController.text.trim()),
            geometry: List<Map<String, double>>.from(_geometry),
            analysis: analysis,
          ),
        );
      });
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.message ??
                'Property Intelligence is temporarily unavailable.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _analyzing = false);
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
      if (!mounted) return;
      setState(() => _aiInterpretation = result);
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.message ?? 'AI analysis is temporarily unavailable.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _askingAi = false);
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
                    onPressed: _createPostcardCampaign,
                    child: const Text('Plan a Postcard'),
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
    if (_analyses.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Analyze at least two areas before comparing them.'),
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

  Future<void> _createCampaign() async {
    final analysis = _analysis;
    if (analysis == null || _area.length < 3) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => MaterialDistributionCampaignScreen(
          campaignType: CampaignType.flyerDistribution,
          initialServiceArea: List<Map<String, double>>.from(_geometry),
          initialServiceAreaName: _selectedSavedAreaName,
          initialGoal: _selectedGoal?.label ?? _objectiveController.text.trim(),
          initialService: _selectedGoal?.service,
          propertyIntelligenceAnalysisId: analysis.data['analysisId']
              ?.toString(),
        ),
      ),
    );
  }

  Future<void> _createPostcardCampaign() async {
    final analysis = _analysis;
    if (analysis == null || _area.length < 3) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => ManagedGrowthScreen(
          postcardHandoff: {
            'geometry': List<Map<String, double>>.from(_geometry),
            'analysisId': analysis.data['analysisId'],
            'geometryDigest': analysis.data['geometryDigest'],
            'propertyCount': analysis.propertyCount,
            'businessObjective': _objectiveController.text.trim(),
            'aiMessagingContext': _aiInterpretation?.summary,
          },
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
                if (directMail)
                  FilledButton(
                    onPressed: _createPostcardCampaign,
                    child: const Text('Create Postcard Campaign'),
                  ),
                OutlinedButton(
                  onPressed: _createCampaign,
                  child: Text(
                    directMail
                        ? 'Choose Scaler Distribution Instead'
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
      appBar: AppBar(title: const Text('Property Intelligence')),
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
                  const Text('Included with Scale — \$499/month'),
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
                    label: const Text('Upgrade to Scale'),
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
        ? const <Polygon>[]
        : <Polygon>[
            Polygon(
              points: _area,
              borderStrokeWidth: 3,
              borderColor: const Color(0xFF19C7A2),
              color: const Color(0x3319C7A2),
            ),
          ];
    return Scaffold(
      appBar: AppBar(title: const Text('Property Intelligence')),
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
                            _chooseSavedArea();
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
                  child: FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: _defaultCenter,
                      initialZoom: 12,
                      onTap: _addPoint,
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
                        !CampaignAreaGeometry.isComplete(_shape, _area)
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
                                CampaignAreaGeometry.isComplete(
                                      _shape,
                                      _area,
                                    ) &&
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
                            label: const Text('Analyze Area'),
                          ),
                          OutlinedButton.icon(
                            onPressed: _area.isEmpty ? null : _clearArea,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Clear / Change Area'),
                          ),
                        ],
                      ),
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
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(user.uid)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData &&
            snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final entitled = _planService.hasActiveScalePropertyIntelligence(
          snapshot.data?.data(),
        );
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
