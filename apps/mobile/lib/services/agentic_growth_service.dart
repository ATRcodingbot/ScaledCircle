import 'package:cloud_functions/cloud_functions.dart';

class AgenticGrowthWorkspace {
  const AgenticGrowthWorkspace(this.data);

  final Map<String, dynamic> data;

  bool get initialized => data['initialized'] == true;
  bool get externalActionsEnabled => data['externalActionsEnabled'] == true;
  bool get killSwitchActive => data['killSwitchActive'] != false;
  List<Map<String, dynamic>> get agents => _maps(data['agents']);
  List<Map<String, dynamic>> get runs => _maps(data['runs']);

  /// Only describes returned stored evidence; static mode labels are not runs.
  String activitySummary(Map<String, dynamic> agent) {
    final type = agent['type']?.toString();
    final history = type == null
        ? <Map<String, dynamic>>[]
        : runs.where((run) => run['agentType'] == type).toList();
    final latest = history.isEmpty ? null : history.first;
    final status = latest?['status']?.toString();
    final result = switch (status) {
      'completed' || 'succeeded' => 'A stored review completed.',
      'failed' || 'error' => 'The recorded run failed. Review is needed.',
      'running' || 'pending' =>
        'A run is recorded as in progress; completion is not confirmed.',
      null => 'No completed run is recorded in the returned history.',
      _ => 'A run is recorded; its outcome is not confirmed.',
    };
    final available = initialized && agent['enabled'] == true;
    final next = type == 'marketing_manager'
        ? 'Request a review of your saved marketing evidence below.'
        : 'No automatic next run is recorded. Research and drafts need a supported workflow.';
    return 'Now: ${available ? 'Available for internal review' : 'Not enabled'}.\n'
        'Recorded activity: $result\n'
        'Next: $next\n'
        'Needs you: ${available ? 'Review recommendations before any external action.' : 'Set up this capability before requesting work.'}';
  }

  List<Map<String, dynamic>> get observations => _maps(data['observations']);
  List<Map<String, dynamic>> get recommendations =>
      _maps(data['recommendations']);

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
}

abstract interface class AgenticGrowthGateway {
  Future<AgenticGrowthWorkspace> load();
  Future<void> initialize();
  Future<Map<String, dynamic>> runMarketingObserve(String requestKey);
  Future<Map<String, dynamic>> loadAdminSummary();
}

class AgenticGrowthService implements AgenticGrowthGateway {
  AgenticGrowthService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  @override
  Future<AgenticGrowthWorkspace> load() async {
    final result = await _functions
        .httpsCallable('getAgenticGrowthWorkspaceV1')
        .call();
    return AgenticGrowthWorkspace(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  @override
  Future<void> initialize() async {
    await _functions.httpsCallable('initializeAgenticGrowthDogfoodV1').call();
  }

  @override
  Future<Map<String, dynamic>> runMarketingObserve(String requestKey) async {
    final result = await _functions
        .httpsCallable('runMarketingManagerObserveV1')
        .call({'requestKey': requestKey});
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  Future<Map<String, dynamic>> loadAdminSummary() async {
    final result = await _functions
        .httpsCallable('getAgenticGrowthAdminSummaryV1')
        .call();
    return Map<String, dynamic>.from(result.data as Map);
  }
}
