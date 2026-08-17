import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../services/discovery_preferences_service.dart';
import '../../services/address_search_service.dart';
import '../../services/service_area_resolution_service.dart';
import '../../widgets/mapped_address_field.dart';
import 'service_area_map_picker.dart';

class AreasPreferencesScreen extends StatefulWidget {
  const AreasPreferencesScreen({
    super.key,
    required this.role,
    this.initialServices = const [],
    this.onSaved,
    this.loadPreferences,
    this.savePreferences,
    this.searchAddresses,
    this.onboarding = false,
    this.onSkip,
    this.loadWorkTypes,
  });
  final String role;
  final List<String> initialServices;
  final ValueChanged<Map<String, dynamic>>? onSaved;
  final Future<Map<String, dynamic>?> Function()? loadPreferences;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>)?
  savePreferences;
  final Future<List<AddressSuggestion>> Function(String query)? searchAddresses;
  final bool onboarding;
  final VoidCallback? onSkip;
  final Future<List<MarketplaceWorkType>> Function()? loadWorkTypes;

  @override
  State<AreasPreferencesScreen> createState() => _AreasPreferencesScreenState();
}

class _AreasPreferencesScreenState extends State<AreasPreferencesScreen> {
  DiscoveryPreferencesService get _service => DiscoveryPreferencesService();
  final _areaResolver = const ServiceAreaResolutionService();
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
  String _vehicleType = '';
  String _vehicleBed = '';
  List<MarketplaceWorkType> _workTypes = const [];
  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic> _authoritative = {};
  Map<String, bool> _alertDelivery = {
    'inApp': true,
    'email': false,
    'push': false,
  };

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
    final results = await Future.wait<dynamic>([
      widget.loadPreferences?.call() ?? _service.load(),
      if (!_business)
        widget.loadWorkTypes?.call() ?? _service.loadMarketplaceWorkTypes(),
    ]);
    final data = results.first as Map<String, dynamic>?;
    if (!_business) {
      _workTypes = (results[1] as List).cast<MarketplaceWorkType>();
    }
    if (data != null) {
      _authoritative = Map<String, dynamic>.from(data);
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
      _vehicleType = data['vehicleType']?.toString() ?? '';
      _vehicleBed = data['vehicleBed']?.toString() ?? '';
      _notifications = Map<String, bool>.from(
        (data['notifications'] as Map? ?? const {}).map(
          (key, value) => MapEntry(key.toString(), value == true),
        ),
      );
      _alertDelivery = Map<String, bool>.from(
        (data['alertDelivery'] as Map? ?? const {}).map(
          (key, value) => MapEntry(key.toString(), value == true),
        ),
      );
      _alertDelivery.putIfAbsent('inApp', () => true);
      _alertDelivery.putIfAbsent('email', () => false);
      _alertDelivery['push'] = false;
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
    final centerLabel = TextEditingController(
      text: existing?['centerLabel']?.toString() ?? '',
    );
    var type = existing?['type']?.toString() ?? 'place';
    var radius = (existing?['radiusMiles'] as num?)?.toDouble() ?? 20;
    String? resolutionError;
    Map<String, dynamic> normalized = existing == null
        ? <String, dynamic>{}
        : Map<String, dynamic>.from(existing);
    Map<String, dynamic>? center = existing?['center'] is Map
        ? Map<String, dynamic>.from(existing!['center'] as Map)
        : null;
    List<Map<String, dynamic>> geometry =
        (existing?['geometry'] as List? ?? const [])
            .whereType<Map>()
            .map((value) => Map<String, dynamic>.from(value))
            .toList();
    List<List<Map<String, dynamic>>> geometryParts =
        (existing?['geometryParts'] as List? ?? const [])
            .whereType<List>()
            .map(
              (part) => part
                  .whereType<Map>()
                  .map((point) => Map<String, dynamic>.from(point))
                  .toList(),
            )
            .where((part) => part.length >= 3)
            .toList();
    var dialogSaving = false;
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
                    MappedAddressField(
                      controller: places,
                      labelText: 'City or county',
                      hintText: 'Anne Arundel County, Maryland',
                      searchAddresses: widget.searchAddresses,
                      onSelected: (suggestion) {
                        final resolution = _areaResolver.fromKnownPlace(
                          suggestion: suggestion,
                          areaType: 'place',
                        );
                        setDialogState(() {
                          normalized = resolution.data;
                          center = Map<String, dynamic>.from(
                            resolution.data['center'] as Map,
                          );
                          geometry = List<Map<String, dynamic>>.from(
                            resolution.data['geometry'] as List,
                          );
                          geometryParts =
                              (resolution.data['geometryParts'] as List? ??
                                      const [])
                                  .whereType<List>()
                                  .map(
                                    (part) => part
                                        .whereType<Map>()
                                        .map(
                                          (point) =>
                                              Map<String, dynamic>.from(point),
                                        )
                                        .toList(),
                                  )
                                  .toList();
                          places.text = suggestion.fullAddress;
                          resolutionError = resolution.resolved
                              ? null
                              : "We found ${suggestion.primaryText}, but couldn't load its boundary.";
                        });
                      },
                    ),
                  if (type == 'postal_codes')
                    MappedAddressField(
                      controller: postals,
                      labelText: 'ZIP code',
                      hintText: '21401',
                      searchAddresses: widget.searchAddresses,
                      onSelected: (suggestion) {
                        final resolution = _areaResolver.fromKnownPlace(
                          suggestion: suggestion,
                          areaType: 'postal_codes',
                        );
                        setDialogState(() {
                          normalized = resolution.data;
                          center = Map<String, dynamic>.from(
                            resolution.data['center'] as Map,
                          );
                          geometry = List<Map<String, dynamic>>.from(
                            resolution.data['geometry'] as List,
                          );
                          geometryParts =
                              (resolution.data['geometryParts'] as List? ??
                                      const [])
                                  .whereType<List>()
                                  .map(
                                    (part) => part
                                        .whereType<Map>()
                                        .map(
                                          (point) =>
                                              Map<String, dynamic>.from(point),
                                        )
                                        .toList(),
                                  )
                                  .toList();
                          postals.text = suggestion.postalCode.isEmpty
                              ? suggestion.fullAddress
                              : suggestion.postalCode;
                          resolutionError = resolution.resolved
                              ? null
                              : "We found ${suggestion.primaryText}, but couldn't load its boundary.";
                        });
                      },
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
                      onChanged: (value) {
                        final selectedRadius = value ?? radius;
                        setDialogState(() {
                          radius = selectedRadius;
                          final latitude = center?['latitude'];
                          final longitude = center?['longitude'];
                          if (latitude is num && longitude is num) {
                            final updated = _areaResolver.radiusFromCoordinates(
                              latitude: latitude.toDouble(),
                              longitude: longitude.toDouble(),
                              radiusMiles: radius,
                              displayName: centerLabel.text.trim(),
                            );
                            normalized = updated.data;
                            geometry = List<Map<String, dynamic>>.from(
                              updated.data['geometry'] as List,
                            );
                          }
                        });
                      },
                    ),
                    MappedAddressField(
                      controller: centerLabel,
                      labelText: 'Business location, city, or ZIP',
                      hintText: 'Example: Annapolis, Maryland',
                      searchAddresses: widget.searchAddresses,
                      onSelected: (suggestion) {
                        final resolution = _areaResolver.radius(
                          center: suggestion,
                          radiusMiles: radius,
                        );
                        setDialogState(() {
                          normalized = resolution.data;
                          center = Map<String, dynamic>.from(
                            resolution.data['center'] as Map,
                          );
                          geometry = List<Map<String, dynamic>>.from(
                            resolution.data['geometry'] as List,
                          );
                          centerLabel.text = suggestion.fullAddress;
                          resolutionError = null;
                        });
                      },
                    ),
                  ],
                  if (resolutionError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      resolutionError!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: () => setDialogState(() {
                            resolutionError = null;
                            normalized = <String, dynamic>{};
                            geometry = [];
                            geometryParts = [];
                          }),
                          child: const Text('Try Again'),
                        ),
                        OutlinedButton(
                          onPressed: () => setDialogState(() {
                            type = 'around_business';
                            resolutionError = null;
                          }),
                          child: const Text('Use a Radius Instead'),
                        ),
                        OutlinedButton(
                          onPressed: () => setDialogState(() {
                            type = 'drawn';
                            resolutionError = null;
                          }),
                          child: const Text('Draw a Custom Area'),
                        ),
                      ],
                    ),
                  ],
                  if (geometry.length >= 3 &&
                      (type == 'place' || type == 'postal_codes')) ...[
                    const SizedBox(height: 12),
                    Text(
                      'We found your area',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      normalized['displayName']?.toString() ??
                          (places.text.trim().isNotEmpty
                              ? places.text.trim()
                              : postals.text.trim()),
                    ),
                  ],
                  if (type == 'around_business' ||
                      type == 'drawn' ||
                      type == 'place' ||
                      type == 'postal_codes')
                    FilledButton.tonalIcon(
                      onPressed: () async {
                        final selection = await Navigator.of(dialogContext)
                            .push<ServiceAreaMapSelection>(
                              MaterialPageRoute(
                                builder: (_) => ServiceAreaMapPicker(
                                  drawArea: type != 'around_business',
                                  initialCenter:
                                      center?['latitude'] is num &&
                                          center?['longitude'] is num
                                      ? LatLng(
                                          (center!['latitude'] as num)
                                              .toDouble(),
                                          (center!['longitude'] as num)
                                              .toDouble(),
                                        )
                                      : null,
                                  initialGeometry: geometry
                                      .where(
                                        (point) =>
                                            point['latitude'] is num &&
                                            point['longitude'] is num,
                                      )
                                      .map(
                                        (point) => LatLng(
                                          (point['latitude'] as num).toDouble(),
                                          (point['longitude'] as num)
                                              .toDouble(),
                                        ),
                                      )
                                      .toList(growable: false),
                                  initialGeometryParts: geometryParts
                                      .map(
                                        (part) => part
                                            .where(
                                              (point) =>
                                                  point['latitude'] is num &&
                                                  point['longitude'] is num,
                                            )
                                            .map(
                                              (point) => LatLng(
                                                (point['latitude'] as num)
                                                    .toDouble(),
                                                (point['longitude'] as num)
                                                    .toDouble(),
                                              ),
                                            )
                                            .toList(growable: false),
                                      )
                                      .where((part) => part.length >= 3)
                                      .toList(growable: false),
                                  confirmationOnly: geometry.length >= 3,
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
                            geometryParts = selection.geometryParts
                                .map(
                                  (part) => part
                                      .map(
                                        (point) => {
                                          'latitude': point.latitude,
                                          'longitude': point.longitude,
                                        },
                                      )
                                      .toList(),
                                )
                                .toList();
                          });
                        }
                      },
                      icon: const Icon(Icons.map_outlined),
                      label: Text(
                        center == null
                            ? (type == 'around_business'
                                  ? 'Choose a Nearby Map Area'
                                  : type == 'drawn'
                                  ? 'Draw a Custom Area'
                                  : 'Choose a Nearby Map Area')
                            : geometry.length >= 3
                            ? (_business
                                  ? 'Adjust Boundary'
                                  : 'Adjust Work Area')
                            : 'Choose a Nearby Map Area',
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
              onPressed:
                  dialogSaving ||
                      ((type == 'place' || type == 'postal_codes') &&
                          geometry.length < 3)
                  ? null
                  : () async {
                      final valid =
                          name.text.trim().isNotEmpty &&
                          (type == 'place'
                              ? places.text.trim().isNotEmpty &&
                                    geometry.length >= 3
                              : type == 'postal_codes'
                              ? postals.text.trim().isNotEmpty &&
                                    geometry.length >= 3
                              : center != null);
                      if (!valid) {
                        setDialogState(() {
                          resolutionError =
                              type == 'place' || type == 'postal_codes'
                              ? "We found the place, but couldn't map its boundary automatically. Choose a nearby map area or draw a custom area."
                              : 'Choose the center of this service area.';
                        });
                        return;
                      }
                      final area = <String, dynamic>{
                        'id':
                            existing?['id'] ??
                            'area_${DateTime.now().microsecondsSinceEpoch}',
                        'name': name.text.trim(),
                        'type': type,
                        'primary':
                            existing?['primary'] == true || _areas.isEmpty,
                        'enabled': existing?['enabled'] != false,
                        'places': _split(places.text),
                        'postalCodes': _split(postals.text),
                        'centerLabel': centerLabel.text.trim(),
                        'center': center,
                        'radiusMiles': type == 'around_business'
                            ? radius
                            : null,
                        'geometry': geometry,
                        'geometryParts':
                            geometryParts.isEmpty && geometry.length >= 3
                            ? [geometry]
                            : geometryParts,
                        'areaType': normalized['areaType'] ?? type,
                        'displayName': normalized['displayName'],
                        'city': normalized['city'],
                        'county': normalized['county'],
                        'state': normalized['state'],
                        'postalCode': normalized['postalCode'],
                        'bounds': normalized['bounds'],
                        'resolutionSource': normalized['resolutionSource'],
                        'resolutionVersion': normalized['resolutionVersion'],
                        'geometryType': normalized['geometryType'],
                        'geographyType': normalized['geographyType'],
                        'geographicId': normalized['geographicId'],
                        'sourceVintage': normalized['sourceVintage'],
                      };
                      final candidate = _areas
                          .map((item) => Map<String, dynamic>.from(item))
                          .toList();
                      if (editIndex == null) {
                        candidate.add(area);
                      } else {
                        candidate[editIndex] = area;
                      }
                      setDialogState(() {
                        dialogSaving = true;
                        resolutionError = null;
                      });
                      try {
                        final saved = await _persistAreas(candidate);
                        if (!dialogContext.mounted) return;
                        Navigator.pop(dialogContext, saved);
                      } catch (_) {
                        if (!dialogContext.mounted) return;
                        setDialogState(() {
                          dialogSaving = false;
                          resolutionError =
                              "We couldn't save this service area.";
                        });
                      }
                    },
              child: Text(
                dialogSaving
                    ? 'Saving…'
                    : resolutionError ==
                          "We couldn't save this service area."
                    ? 'Try Again'
                    : _business
                    ? 'Save Service Area'
                    : 'Save Work Area',
              ),
            ),
          ],
        ),
      ),
    );
    // Route dismissal can still animate one final dialog frame. These short-lived
    // controllers are released with the route instead of being disposed while a
    // TextField may still be detaching.
    if (result != null && mounted) {
      final savedArea = (result['areas'] as List? ?? const [])
          .whereType<Map>()
          .map((value) => Map<String, dynamic>.from(value))
          .firstWhere(
            (area) =>
                area['id'] ==
                (editIndex == null
                    ? result['lastSavedAreaId']
                    : existing?['id']),
            orElse: () => const <String, dynamic>{},
          );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '✓ ${savedArea['displayName'] ?? savedArea['name'] ?? 'Service area'} saved',
          ),
          action: SnackBarAction(
            label: 'Add Another',
            onPressed: () => _addArea(),
          ),
        ),
      );
    }
  }

  Map<String, dynamic> _payload({List<Map<String, dynamic>>? areas}) {
    final payload = Map<String, dynamic>.from(_authoritative)
      ..remove('updatedAt')
      ..remove('createdAt')
      ..remove('updatedBy')
      ..remove('userUid')
      ..remove('preferenceVersion')
      ..['areas'] = areas ?? _areas
      ..['notifications'] = _notifications
      ..['alertDelivery'] = _alertDelivery;
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
        'vehicleType': _vehicleType,
        'vehicleBed': _vehicleBed,
      });
    }
    return payload;
  }

  Future<Map<String, dynamic>> _persistAreas(
    List<Map<String, dynamic>> candidate,
  ) async {
    final saved =
        await (widget.savePreferences?.call(_payload(areas: candidate)) ??
            _service.save(_payload(areas: candidate)));
    final persisted = (saved['areas'] as List? ?? const [])
        .whereType<Map>()
        .map((value) => Map<String, dynamic>.from(value))
        .toList();
    if (persisted.length != candidate.length) {
      throw StateError('Area was not persisted.');
    }
    if (mounted) {
      setState(() {
        _authoritative = Map<String, dynamic>.from(saved);
        _areas
          ..clear()
          ..addAll(persisted);
      });
    }
    widget.onSaved?.call(saved);
    return {
      ...saved,
      'lastSavedAreaId': candidate.isEmpty ? null : candidate.last['id'],
    };
  }

  List<String> _split(String value) => value
      .split(RegExp(r'[,\n]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  Future<void> _setPrimary(int index) async {
    final candidate = _areas
        .map((area) => Map<String, dynamic>.from(area))
        .toList();
    for (var i = 0; i < candidate.length; i++) {
      candidate[i]['primary'] = i == index;
    }
    await _persistAreas(candidate);
  }

  Future<void> _toggleArea(int index) async {
    final candidate = _areas
        .map((area) => Map<String, dynamic>.from(area))
        .toList();
    candidate[index]['enabled'] = candidate[index]['enabled'] == false;
    await _persistAreas(candidate);
  }

  Future<void> _deleteArea(int index) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this saved area?'),
        content: const Text(
          'Existing campaign zones keep their copied geometry.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final candidate =
        _areas.map((area) => Map<String, dynamic>.from(area)).toList()
          ..removeAt(index);
    if (candidate.isNotEmpty &&
        !candidate.any((area) => area['primary'] == true)) {
      candidate.first['primary'] = true;
    }
    await _persistAreas(candidate);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final saved =
          await (widget.savePreferences?.call(_payload()) ??
              _service.save(_payload()));
      _authoritative = Map<String, dynamic>.from(saved);
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
          if ((area['type'] == 'place' || area['type'] == 'postal_codes') &&
              (area['geometry'] as List? ?? const []).length < 3)
            'Needs a map boundary before targeting',
        ].join(' • '),
      ),
      trailing: PopupMenuButton<String>(
        onSelected: (value) async {
          try {
            if (value == 'edit') await _addArea(index);
            if (value == 'primary') await _setPrimary(index);
            if (value == 'toggle') await _toggleArea(index);
            if (value == 'delete') await _deleteArea(index);
          } catch (_) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    "We couldn't update this ${_business ? 'service' : 'work'} area.",
                  ),
                ),
              );
            }
          }
        },
        itemBuilder: (_) => [
          PopupMenuItem(
            value: 'edit',
            child: Text(
              (area['type'] == 'place' || area['type'] == 'postal_codes') &&
                      (area['geometry'] as List? ?? const []).length < 3
                  ? 'Map This Area'
                  : 'Edit',
            ),
          ),
          const PopupMenuItem(value: 'primary', child: Text('Make Primary')),
          const PopupMenuItem(value: 'toggle', child: Text('Enable / Disable')),
          const PopupMenuItem(value: 'delete', child: Text('Delete')),
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
    appBar: AppBar(title: Text(widget.onboarding ? 'Set Up Work Preferences' : 'Areas & Preferences')),
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
                label: Text(
                  _business
                      ? 'Add Another Service Area'
                      : 'Add Another Work Area',
                ),
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
                if (widget.initialServices.isNotEmpty) ...[
                  const Text(
                    'YOUR SERVICES',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(widget.initialServices.join(' • ')),
                  const SizedBox(height: 10),
                ],
                _chips(
                  <String>{
                    ...widget.initialServices,
                    'Decks',
                    'Fences',
                    'Roofing',
                    'HVAC',
                    'Remodeling',
                    'Landscaping',
                    'Cleaning',
                    'Other',
                  }.toList(),
                  _priorities,
                ),
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
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _workTypes
                      .where((type) => type.scalerSelectable && !type.requiresOutreachConsent)
                      .map((type) => FilterChip(
                            label: Text(type.customerLabel),
                            selected: _jobTypes.contains(type.id),
                            onSelected: (value) => setState(() => value
                                ? _jobTypes.add(type.id)
                                : _jobTypes.remove(type.id)),
                          ))
                      .toList(),
                ),
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
                if (_workTypes.any((type) =>
                    type.requiresVehicle && _jobTypes.contains(type.id))) ...[
                  DropdownButtonFormField<String>(
                    initialValue: _vehicleType.isEmpty ? null : _vehicleType,
                    decoration: const InputDecoration(
                      labelText: 'Vehicle available for work (optional)',
                    ),
                    items: const [
                      DropdownMenuItem(value: 'car', child: Text('Car')),
                      DropdownMenuItem(value: 'pickup_truck', child: Text('Pickup Truck')),
                      DropdownMenuItem(value: 'van', child: Text('Van')),
                      DropdownMenuItem(value: 'box_truck', child: Text('Box Truck')),
                      DropdownMenuItem(value: 'no_vehicle', child: Text('No Vehicle')),
                    ],
                    onChanged: (value) => setState(() => _vehicleType = value ?? ''),
                  ),
                  if (_vehicleType == 'pickup_truck' || _vehicleType == 'van' || _vehicleType == 'box_truck')
                    DropdownButtonFormField<String>(
                      initialValue: _vehicleBed.isEmpty ? null : _vehicleBed,
                      decoration: const InputDecoration(labelText: 'Cargo area (optional)'),
                      items: const [
                        DropdownMenuItem(value: 'open', child: Text('Open bed')),
                        DropdownMenuItem(value: 'covered', child: Text('Covered / enclosed')),
                      ],
                      onChanged: (value) => setState(() => _vehicleBed = value ?? ''),
                    ),
                ],
              ],
              const Divider(height: 32),
              Text(
                _business
                    ? 'HOW SHOULD WE NOTIFY YOU?'
                    : 'HOW SHOULD WE TELL YOU ABOUT MATCHING JOBS?',
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
              SwitchListTile(
                value: _alertDelivery['inApp'] ?? true,
                onChanged: (value) =>
                    setState(() => _alertDelivery['inApp'] = value),
                title: const Text('In ScaledCircle'),
              ),
              if (!_business)
                SwitchListTile(
                  value: _alertDelivery['email'] ?? false,
                  onChanged: (value) =>
                      setState(() => _alertDelivery['email'] = value),
                  title: const Text('Email me about matching jobs'),
                  subtitle: const Text(
                    'One email per matching job. Duplicate alerts are prevented.',
                  ),
                ),
              const SwitchListTile(
                value: false,
                onChanged: null,
                title: Text('Push notifications — Coming Soon'),
                subtitle: Text(
                  'We will only ask for permission when this becomes available and you turn it on.',
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
              if (_areas.isNotEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _business ? 'YOU WORK IN' : 'YOU WANT TO WORK IN',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        ..._areas
                            .where((area) => area['enabled'] != false)
                            .map(
                              (area) => Text(
                                '✓ ${area['displayName'] ?? area['name']}',
                              ),
                            ),
                        const SizedBox(height: 12),
                        Text(
                          _business ? 'YOU WANT MORE' : "YOU'RE INTERESTED IN",
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          (_business ? _priorities : _jobTypes).isEmpty
                              ? 'You can choose this later.'
                              : _business
                                  ? _priorities.join(' • ')
                                  : _jobTypes.map((id) => _workTypes
                                      .where((type) => type.id == id)
                                      .map((type) => type.customerLabel)
                                      .firstOrNull ?? id).join(' • '),
                        ),
                        if (!_business) ...[
                          const SizedBox(height: 12),
                          const Text('TRAVEL', style: TextStyle(fontWeight: FontWeight.bold)),
                          Text(_travelMode == 'anywhere' ? 'Anywhere' : 'Up to ${_travelMiles.round()} miles'),
                          const SizedBox(height: 12),
                          const Text(
                            'ALERTS',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          Text(
                            'In ScaledCircle ${_alertDelivery['inApp'] == false ? '— Off' : '✓'}',
                          ),
                          Text(
                            'Email ${_alertDelivery['email'] == true ? '✓' : '— Off'}',
                          ),
                          const Text('Push — Coming Soon'),
                        ],
                      ],
                    ),
                  ),
                ),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(Icons.save_outlined),
                label: Text(_saving ? 'Saving…' : widget.onboarding ? 'Save & Continue' : 'Save Areas & Preferences'),
              ),
              if (widget.onboarding)
                TextButton(onPressed: widget.onSkip, child: const Text('Skip for Now')),
            ],
          ),
  );
}
