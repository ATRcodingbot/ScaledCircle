import 'package:flutter/material.dart';

import '../../services/discovery_preferences_service.dart';
import 'service_area_map_picker.dart';

class AreasPreferencesScreen extends StatefulWidget {
  const AreasPreferencesScreen({
    super.key,
    required this.role,
    this.initialServices = const [],
    this.onSaved,
  });
  final String role;
  final List<String> initialServices;
  final ValueChanged<Map<String, dynamic>>? onSaved;

  @override
  State<AreasPreferencesScreen> createState() => _AreasPreferencesScreenState();
}

class _AreasPreferencesScreenState extends State<AreasPreferencesScreen> {
  final _service = DiscoveryPreferencesService();
  final List<Map<String, dynamic>> _areas = [];
  final Set<String> _priorities = {};
  final Set<String> _otherServices = {};
  final Set<String> _excluded = {};
  final Set<String> _jobTypes = {};
  Map<String, bool> _notifications = {};
  String _outsideScope = 'none';
  String _travelMode = 'nearby';
  double _travelMiles = 20;
  bool _outreach = false;
  bool _crew = false;
  bool _loading = true;
  bool _saving = false;

  bool get _business => widget.role == 'business';

  @override
  void initState() {
    super.initState();
    _priorities.addAll(widget.initialServices);
    _notifications = _business
        ? {
            'weatherInMyAreas': true,
            'propertyOpportunities': true,
            'campaignActivity': true,
            'managedGrowthReminders': true,
            'outsideMyAreas': false,
          }
        : {
            'newJobsInMyAreas': true,
            'travelOpportunities': false,
            'crewOpportunities': false,
            'materialPickupJobs': true,
            'doorToDoorOpportunities': false,
          };
    _load();
  }

  Future<void> _load() async {
    final data = await _service.load();
    if (data != null) {
      _areas.addAll(
        (data['areas'] as List? ?? const []).whereType<Map>().map(
          (value) => Map<String, dynamic>.from(value),
        ),
      );
      _priorities
        ..clear()
        ..addAll(_strings(data['priorityServices']));
      _otherServices.addAll(_strings(data['otherServices']));
      _excluded.addAll(_strings(data['excludedServices']));
      _jobTypes.addAll(_strings(data['jobTypes']));
      _outsideScope = data['outsideOpportunityScope']?.toString() ?? 'none';
      _travelMode = data['travelMode']?.toString() ?? 'nearby';
      _travelMiles = (data['maxTravelMiles'] as num?)?.toDouble() ?? 20;
      _outreach = data['outreachOptIn'] == true;
      _crew = data['crewOptIn'] == true;
      _notifications = Map<String, bool>.from(
        (data['notifications'] as Map? ?? const {}).map(
          (key, value) => MapEntry(key.toString(), value == true),
        ),
      );
    }
    if (mounted) setState(() => _loading = false);
  }

  List<String> _strings(dynamic value) => (value as List? ?? const [])
      .map((item) => item.toString())
      .where((item) => item.isNotEmpty)
      .toList();

  Future<void> _addArea([int? editIndex]) async {
    final existing = editIndex == null ? null : _areas[editIndex];
    final name = TextEditingController(
      text:
          existing?['name']?.toString() ??
          (_areas.isEmpty
              ? (_business ? 'Main Service Area' : 'Home Area')
              : 'Another Area'),
    );
    final places = TextEditingController(
      text: _strings(existing?['places']).join(', '),
    );
    final postals = TextEditingController(
      text: _strings(existing?['postalCodes']).join(', '),
    );
    var type = existing?['type']?.toString() ?? 'place';
    var radius = (existing?['radiusMiles'] as num?)?.toDouble() ?? 20;
    Map<String, dynamic>? center = existing?['center'] is Map
        ? Map<String, dynamic>.from(existing!['center'] as Map)
        : null;
    List<Map<String, dynamic>> geometry =
        (existing?['geometry'] as List? ?? const [])
            .whereType<Map>()
            .map((value) => Map<String, dynamic>.from(value))
            .toList();
    if (!mounted) return;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            editIndex == null ? 'Add a service area' : 'Edit service area',
          ),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(
                      labelText: 'What should we call this area?',
                    ),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: type,
                    decoration: InputDecoration(
                      labelText: _business
                          ? 'How do you want to choose it?'
                          : 'How do you want to choose your work area?',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'around_business',
                        child: Text('Around my business / close to me'),
                      ),
                      DropdownMenuItem(
                        value: 'place',
                        child: Text('Cities / counties'),
                      ),
                      DropdownMenuItem(
                        value: 'postal_codes',
                        child: Text('ZIP codes'),
                      ),
                      DropdownMenuItem(
                        value: 'drawn',
                        child: Text('Draw an area'),
                      ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => type = value ?? type),
                  ),
                  if (type == 'place')
                    TextField(
                      controller: places,
                      decoration: const InputDecoration(
                        labelText: 'Cities or counties',
                        hintText: 'Baltimore County, Annapolis',
                      ),
                    ),
                  if (type == 'postal_codes')
                    TextField(
                      controller: postals,
                      decoration: const InputDecoration(
                        labelText: 'ZIP codes',
                        hintText: '21401, 21201',
                      ),
                    ),
                  if (type == 'around_business') ...[
                    const SizedBox(height: 12),
                    const Text('How far do you normally travel for customers?'),
                    DropdownButtonFormField<double>(
                      initialValue: radius,
                      items: [10, 20, 30, 50, 75]
                          .map(
                            (value) => DropdownMenuItem(
                              value: value.toDouble(),
                              child: Text('$value miles'),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setDialogState(() => radius = value ?? radius),
                    ),
                  ],
                  if (type == 'around_business' || type == 'drawn')
                    FilledButton.tonalIcon(
                      onPressed: () async {
                        final selection = await Navigator.of(dialogContext)
                            .push<ServiceAreaMapSelection>(
                              MaterialPageRoute(
                                builder: (_) => ServiceAreaMapPicker(
                                  drawArea: type == 'drawn',
                                ),
                              ),
                            );
                        if (selection != null) {
                          setDialogState(() {
                            center = {
                              'latitude': selection.center.latitude,
                              'longitude': selection.center.longitude,
                            };
                            geometry = selection.geometry
                                .map(
                                  (point) => {
                                    'latitude': point.latitude,
                                    'longitude': point.longitude,
                                  },
                                )
                                .toList();
                          });
                        }
                      },
                      icon: const Icon(Icons.map_outlined),
                      label: Text(
                        center == null
                            ? (type == 'drawn'
                                  ? 'Draw my area'
                                  : 'Choose the center on a map')
                            : 'Map area selected',
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final valid =
                    name.text.trim().isNotEmpty &&
                    (type == 'place'
                        ? places.text.trim().isNotEmpty
                        : type == 'postal_codes'
                        ? postals.text.trim().isNotEmpty
                        : center != null);
                if (!valid) return;
                Navigator.pop(dialogContext, {
                  'id':
                      existing?['id'] ??
                      'area_${DateTime.now().microsecondsSinceEpoch}',
                  'name': name.text.trim(),
                  'type': type,
                  'primary': existing?['primary'] == true || _areas.isEmpty,
                  'enabled': existing?['enabled'] != false,
                  'places': _split(places.text),
                  'postalCodes': _split(postals.text),
                  'center': center,
                  'radiusMiles': type == 'around_business' ? radius : null,
                  'geometry': geometry,
                });
              },
              child: const Text('Save Area'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    places.dispose();
    postals.dispose();
    if (result != null) {
      setState(() {
        if (editIndex == null) {
          _areas.add(result);
        } else {
          _areas[editIndex] = result;
        }
      });
    }
  }

  List<String> _split(String value) => value
      .split(RegExp(r'[,\n]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  void _setPrimary(int index) => setState(() {
    for (var i = 0; i < _areas.length; i++) {
      _areas[i]['primary'] = i == index;
    }
  });

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final payload = <String, dynamic>{
        'areas': _areas,
        'notifications': _notifications,
      };
      if (_business) {
        payload.addAll({
          'priorityServices': _priorities.toList(),
          'otherServices': _otherServices.toList(),
          'excludedServices': _excluded.toList(),
          'outsideOpportunityScope': _outsideScope,
        });
      } else {
        payload.addAll({
          'jobTypes': _jobTypes.toList(),
          'travelMode': _travelMode,
          'maxTravelMiles': _travelMiles,
          'outreachOptIn': _outreach,
          'crewOptIn': _crew,
        });
      }
      final saved = await _service.save(payload);
      widget.onSaved?.call(saved);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Areas & Preferences saved.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _areaCard(Map<String, dynamic> area, int index) => Card(
    child: ListTile(
      leading: Icon(
        area['enabled'] == false
            ? Icons.location_off_outlined
            : Icons.location_on_outlined,
      ),
      title: Text(area['name']?.toString() ?? 'Saved Area'),
      subtitle: Text(
        [
          if (area['primary'] == true) 'Primary',
          if (area['type'] == 'around_business') '${area['radiusMiles']} miles',
          ..._strings(area['places']),
          ..._strings(area['postalCodes']),
        ].join(' • '),
      ),
      trailing: PopupMenuButton<String>(
        onSelected: (value) {
          if (value == 'edit') _addArea(index);
          if (value == 'primary') _setPrimary(index);
          if (value == 'toggle') {
            setState(() => area['enabled'] = area['enabled'] == false);
          }
          if (value == 'delete') setState(() => _areas.removeAt(index));
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'edit', child: Text('Edit')),
          PopupMenuItem(value: 'primary', child: Text('Make Primary')),
          PopupMenuItem(value: 'toggle', child: Text('Enable / Disable')),
          PopupMenuItem(value: 'delete', child: Text('Delete')),
        ],
      ),
    ),
  );

  Widget _chips(List<String> options, Set<String> selected) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: options
        .map(
          (option) => FilterChip(
            label: Text(option),
            selected: selected.contains(option),
            onSelected: (value) => setState(
              () => value ? selected.add(option) : selected.remove(option),
            ),
          ),
        )
        .toList(),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Areas & Preferences')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                _business
                    ? 'Where do you work?'
                    : 'Where do you usually want to work?',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Text(
                'These choices personalize what ScaledCircle shows and sends. You can still search anywhere.',
              ),
              const SizedBox(height: 12),
              ..._areas.asMap().entries.map(
                (entry) => _areaCard(entry.value, entry.key),
              ),
              OutlinedButton.icon(
                onPressed: _areas.length >= 8 ? null : _addArea,
                icon: const Icon(Icons.add_location_alt_outlined),
                label: const Text('Add Another Service Area'),
              ),
              const Divider(height: 32),
              Text(
                _business
                    ? 'What kind of work do you want more of?'
                    : 'What kind of jobs are you interested in?',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (_business) ...[
                _chips([
                  'Decks',
                  'Fences',
                  'Roofing',
                  'HVAC',
                  'Remodeling',
                  'Landscaping',
                  'Cleaning',
                  'Other',
                ], _priorities),
                TextField(
                  onSubmitted: (value) =>
                      setState(() => _otherServices.addAll(_split(value))),
                  decoration: const InputDecoration(
                    labelText: 'Other work you do (optional)',
                  ),
                ),
                TextField(
                  onSubmitted: (value) =>
                      setState(() => _excluded.addAll(_split(value))),
                  decoration: const InputDecoration(
                    labelText: "Jobs you don't want (optional)",
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: _outsideScope,
                  decoration: const InputDecoration(
                    labelText: 'Show me opportunities outside my normal area',
                  ),
                  items: const [
                    DropdownMenuItem(value: 'none', child: Text('No')),
                    DropdownMenuItem(
                      value: 'nearby',
                      child: Text('Nearby only'),
                    ),
                    DropdownMenuItem(
                      value: 'maryland',
                      child: Text('Anywhere in Maryland'),
                    ),
                    DropdownMenuItem(
                      value: 'followed',
                      child: Text('Anywhere I search or follow'),
                    ),
                  ],
                  onChanged: (value) =>
                      setState(() => _outsideScope = value ?? _outsideScope),
                ),
              ] else ...[
                _chips(const [
                  'flyer_distribution',
                  'door_hangers',
                  'material_pickup',
                  'crew_jobs',
                  'short_local',
                  'long_high_paying',
                ], _jobTypes),
                DropdownButtonFormField<String>(
                  initialValue: _travelMode,
                  decoration: const InputDecoration(
                    labelText:
                        'When should we tell you about jobs outside your normal area?',
                  ),
                  items: const [
                    DropdownMenuItem(value: 'never', child: Text('Never')),
                    DropdownMenuItem(
                      value: 'nearby',
                      child: Text('Nearby only'),
                    ),
                    DropdownMenuItem(
                      value: 'worth_drive',
                      child: Text('Only if the pay is worth the drive'),
                    ),
                    DropdownMenuItem(
                      value: 'up_to_miles',
                      child: Text('Up to my selected distance'),
                    ),
                    DropdownMenuItem(
                      value: 'anywhere',
                      child: Text("Anywhere — I'm willing to travel"),
                    ),
                  ],
                  onChanged: (value) =>
                      setState(() => _travelMode = value ?? _travelMode),
                ),
                if (_travelMode == 'nearby' || _travelMode == 'up_to_miles')
                  Slider(
                    value: _travelMiles.clamp(10, 100),
                    min: 10,
                    max: 100,
                    divisions: 18,
                    label: '${_travelMiles.round()} miles',
                    onChanged: (value) => setState(() => _travelMiles = value),
                  ),
                SwitchListTile(
                  value: _crew,
                  onChanged: (value) => setState(() => _crew = value),
                  title: const Text('Tell me about Scaler Crew jobs'),
                ),
                SwitchListTile(
                  value: _outreach,
                  onChanged: (value) => setState(() {
                    _outreach = value;
                    if (value) {
                      _jobTypes.add('door_to_door');
                    } else {
                      _jobTypes.remove('door_to_door');
                    }
                  }),
                  title: const Text('I am willing to do door-to-door outreach'),
                  subtitle: const Text(
                    'Off by default. Other field work does not turn this on.',
                  ),
                ),
              ],
              const Divider(height: 32),
              const Text(
                'What should we notify you about?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              ...(_business
                      ? <String, String>{
                          'weatherInMyAreas':
                              'Weather opportunities in my areas',
                          'campaignActivity': 'Campaign activity',
                          'outsideMyAreas':
                              'Opportunities outside my service area',
                        }
                      : <String, String>{
                          'newJobsInMyAreas': 'New jobs in my areas',
                          'travelOpportunities':
                              'Higher-paying travel opportunities',
                          'crewOpportunities': 'Crew opportunities',
                          'materialPickupJobs': 'Material pickup jobs',
                          'doorToDoorOpportunities':
                              'Door-to-door outreach opportunities',
                        })
                  .entries
                  .map(
                    (entry) => SwitchListTile(
                      value: _notifications[entry.key] ?? false,
                      onChanged:
                          entry.key == 'doorToDoorOpportunities' && !_outreach
                          ? null
                          : (value) => setState(
                              () => _notifications[entry.key] = value,
                            ),
                      title: Text(entry.value),
                    ),
                  ),
              const Card(
                child: ListTile(
                  leading: Icon(Icons.search),
                  title: Text('Manual search stays open'),
                  subtitle: Text(
                    'FOR YOU uses these preferences. SEARCH ALL JOBS and EXPLORE ANYWHERE remain unrestricted.',
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(Icons.save_outlined),
                label: Text(_saving ? 'Saving…' : 'Save Areas & Preferences'),
              ),
            ],
          ),
  );
}
