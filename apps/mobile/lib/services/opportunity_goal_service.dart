import 'discovery_preferences_service.dart';
import 'managed_growth_service.dart';

class BusinessOpportunityGoal {
  const BusinessOpportunityGoal({
    required this.id,
    required this.label,
    this.service = '',
    this.custom = false,
    this.enabled = true,
  });

  final String id;
  final String label;
  final String service;
  final bool custom;
  final bool enabled;

  Map<String, dynamic> toMap() => {
    'id': id,
    'label': label,
    'service': service,
    'custom': custom,
    'enabled': enabled,
  };

  factory BusinessOpportunityGoal.fromMap(Map value) => BusinessOpportunityGoal(
    id: value['id']?.toString() ?? '',
    label: value['label']?.toString() ?? '',
    service: value['service']?.toString() ?? '',
    custom: value['custom'] == true,
    enabled: value['enabled'] != false,
  );
}

class OpportunityGoalService {
  OpportunityGoalService({
    DiscoveryPreferencesService? preferences,
    ManagedGrowthService? growthProfile,
  }) : _preferences = preferences ?? DiscoveryPreferencesService(),
       _growthProfile = growthProfile ?? ManagedGrowthService();

  final DiscoveryPreferencesService _preferences;
  final ManagedGrowthService _growthProfile;

  Future<List<BusinessOpportunityGoal>> loadSuggestedAndSaved() async {
    final values = await Future.wait([
      _preferences.load(),
      _growthProfile.loadProfile(),
    ]);
    final preferences = values[0] as Map<String, dynamic>?;
    final profile = values[1] as BusinessGrowthProfile?;
    final services = <String>{
      ...(profile?.data['servicesOffered'] as List? ?? const []).map(
        (value) => value.toString().trim(),
      ),
      ...(preferences?['priorityServices'] as List? ?? const []).map(
        (value) => value.toString().trim(),
      ),
    }..removeWhere((value) => value.isEmpty);
    final goals = <BusinessOpportunityGoal>[
      ...suggestForServices(services),
      const BusinessOpportunityGoal(
        id: 'estimate_requests',
        label: 'Get more estimate requests',
      ),
      const BusinessOpportunityGoal(
        id: 'local_awareness',
        label: 'Build local awareness',
      ),
      for (final value
          in (preferences?['savedGoals'] as List? ?? const []).whereType<Map>())
        BusinessOpportunityGoal.fromMap(value),
    ];
    final byLabel = <String, BusinessOpportunityGoal>{};
    for (final goal in goals.where((goal) => goal.enabled)) {
      byLabel.putIfAbsent(goal.label.toLowerCase(), () => goal);
    }
    return byLabel.values.toList(growable: false);
  }

  static List<BusinessOpportunityGoal> suggestForServices(
    Iterable<String> services,
  ) => services
      .where((service) => service.trim().isNotEmpty)
      .map(
        (service) => BusinessOpportunityGoal(
          id: 'service_${_slug(service)}',
          label: _goalForService(service),
          service: service,
        ),
      )
      .toList(growable: false);

  Future<BusinessOpportunityGoal> saveCustom(String label) async {
    final clean = label.trim();
    if (clean.isEmpty) throw ArgumentError('Enter a goal to save.');
    final preferences = await _preferences.load() ?? <String, dynamic>{};
    final saved = (preferences['savedGoals'] as List? ?? const [])
        .whereType<Map>()
        .map((value) => Map<String, dynamic>.from(value))
        .toList();
    final goal = BusinessOpportunityGoal(
      id: 'custom_${_slug(clean)}',
      label: clean,
      custom: true,
    );
    saved.removeWhere(
      (value) =>
          value['label']?.toString().toLowerCase() == clean.toLowerCase(),
    );
    saved.add(goal.toMap());
    await _preferences.save({...preferences, 'savedGoals': saved});
    return goal;
  }

  static String _goalForService(String service) {
    final lower = service.toLowerCase();
    if (lower.contains('hvac') || lower.contains('replacement')) {
      return 'Get more ${service.toLowerCase()} inquiries';
    }
    if (lower.contains('remodel')) return 'Promote $service';
    final jobName = lower.endsWith('s')
        ? lower.substring(0, lower.length - 1)
        : lower;
    return 'Get more $jobName jobs';
  }

  static String _slug(String value) {
    final slug = value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');
    return slug.length <= 60 ? slug : slug.substring(0, 60);
  }
}
