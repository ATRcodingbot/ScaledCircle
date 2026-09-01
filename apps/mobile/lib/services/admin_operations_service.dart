import 'package:cloud_functions/cloud_functions.dart';

class AdminOperationsService {
  AdminOperationsService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;

  Future<AdminOperationsSnapshot> loadOverview() async {
    final result = await _functions
        .httpsCallable('getAdminOperationsOverview')
        .call<Map<Object?, Object?>>();
    return AdminOperationsSnapshot.fromMap(
      Map<String, dynamic>.from(result.data),
    );
  }

  Future<AdminCampaignTimeline> loadCampaignTimeline(String campaignId) async {
    final result = await _functions
        .httpsCallable('getAdminCampaignTimeline')
        .call<Map<Object?, Object?>>({'campaignId': campaignId});
    return AdminCampaignTimeline.fromMap(
      Map<String, dynamic>.from(result.data),
    );
  }

  Future<void> updateSupportStatus(String caseId, String status) async {
    await _functions.httpsCallable('updateAdminSupportCaseStatus').call<void>({
      'caseId': caseId,
      'status': status,
    });
  }

  Future<GeneratedMediaWifPreflight> runGeneratedMediaWifPreflight() async {
    final result = await _functions
        .httpsCallable('getGeneratedMediaOperations')
        .call<Map<Object?, Object?>>({'providerAuthPreflight': true});
    final data = Map<String, dynamic>.from(result.data);
    return GeneratedMediaWifPreflight.fromMap(
      _map(data['providerAuthPreflight']),
    );
  }

  Future<Map<String, dynamic>> reconcileGeneratedMediaAccounting() async {
    final result = await _functions
        .httpsCallable('getGeneratedMediaOperations')
        .call<Map<Object?, Object?>>({'reconcileAccounting': true});
    final data = Map<String, dynamic>.from(result.data);
    return _map(data['accountingReconciliation']);
  }

  Future<GeneratedMediaCommercialMetrics>
  loadGeneratedMediaCommercialMetrics() async {
    final result = await _functions
        .httpsCallable('getGeneratedMediaOperations')
        .call<Map<Object?, Object?>>(const {});
    return GeneratedMediaCommercialMetrics.fromMap(
      Map<String, dynamic>.from(result.data),
    );
  }

  Future<Map<String, dynamic>> restrictGeneratedMediaToFounderQaBusiness(
    String generationJobId,
  ) async {
    final result = await _functions
        .httpsCallable('updateGeneratedMediaSafetyConfiguration')
        .call<Map<Object?, Object?>>({
          'providerGenerationEnabled': false,
          'authorizedBusinessJobIds': [generationJobId.trim()],
        });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> stageGeneratedMediaPrivateBeta(
    String generationJobId,
  ) async {
    final result = await _functions
        .httpsCallable('updateGeneratedMediaSafetyConfiguration')
        .call<Map<Object?, Object?>>({
          'providerGenerationEnabled': false,
          'rolloutMode': 'beta_cohort',
          'betaCohortStage': 'initial_5',
          'betaCohortBusinessJobIds': [generationJobId.trim()],
          'globalDailyMaximum': 50,
          'globalMonthlyMaximum': 300,
          'globalDailyCostMicros': 10000000,
          'globalMonthlyCostMicros': 100000000,
        });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> restoreGeneratedMediaFounderOnly() async {
    final result = await _functions
        .httpsCallable('updateGeneratedMediaSafetyConfiguration')
        .call<Map<Object?, Object?>>({
          'providerGenerationEnabled': false,
          'rolloutMode': 'founder_only',
          'betaCohortBusinessJobIds': <String>[],
          'betaCohortStage': 'initial_5',
          'globalDailyMaximum': 50,
          'globalMonthlyMaximum': 300,
          'globalDailyCostMicros': 10000000,
          'globalMonthlyCostMicros': 100000000,
        });
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> setStagingGeneratedMediaProviderEnabled(
    bool enabled,
  ) async {
    final result = await _functions
        .httpsCallable('updateGeneratedMediaSafetyConfiguration')
        .call<Map<Object?, Object?>>({'providerGenerationEnabled': enabled});
    return Map<String, dynamic>.from(result.data);
  }

  Future<Map<String, dynamic>> loadPhysicalMarketingOperations() async {
    final result = await _functions
        .httpsCallable('getPhysicalMarketingOperations')
        .call<Map<Object?, Object?>>(const {});
    return Map<String, dynamic>.from(result.data);
  }
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};
List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList(growable: false) : const [];
DateTime? _date(Object? value) =>
    value is num ? DateTime.fromMillisecondsSinceEpoch(value.toInt()) : null;

class AdminOperationsSnapshot {
  const AdminOperationsSnapshot({
    required this.metrics,
    required this.exceptions,
    required this.activity,
    required this.health,
    required this.partial,
  });
  factory AdminOperationsSnapshot.fromMap(Map<String, dynamic> map) =>
      AdminOperationsSnapshot(
        metrics: _map(
          map['metrics'],
        ).map((key, value) => MapEntry(key, (value as num?)?.toInt() ?? 0)),
        exceptions: _maps(
          map['exceptions'],
        ).map(AdminOpsException.fromMap).toList(growable: false),
        activity: _maps(
          map['recentActivity'],
        ).map(AdminOpsActivity.fromMap).toList(growable: false),
        health: _maps(
          map['health'],
        ).map(AdminOpsHealth.fromMap).toList(growable: false),
        partial: map['partial'] == true,
      );
  final Map<String, int> metrics;
  final List<AdminOpsException> exceptions;
  final List<AdminOpsActivity> activity;
  final List<AdminOpsHealth> health;
  final bool partial;
}

class AdminOpsException {
  const AdminOpsException({
    required this.id,
    required this.category,
    required this.severity,
    required this.summary,
    required this.status,
    required this.recommendedAction,
    this.campaignId,
    this.entityId,
    this.detailKind,
    this.createdAt,
  });
  factory AdminOpsException.fromMap(Map<String, dynamic> map) =>
      AdminOpsException(
        id: map['id']?.toString() ?? '',
        category: map['category']?.toString() ?? 'campaign_participant',
        severity: map['severity']?.toString() ?? 'attention',
        summary:
            map['summary']?.toString() ?? 'Operational review is required.',
        status: map['status']?.toString() ?? 'open',
        recommendedAction:
            map['recommendedAction']?.toString() ?? 'Review details.',
        campaignId: map['campaignId']?.toString(),
        entityId: map['entityId']?.toString(),
        detailKind: map['detailKind']?.toString(),
        createdAt: _date(map['createdAt']),
      );
  final String id, category, severity, summary, status, recommendedAction;
  final String? campaignId, entityId, detailKind;
  final DateTime? createdAt;
}

class AdminOpsActivity {
  const AdminOpsActivity({
    required this.type,
    required this.title,
    required this.occurredAt,
    this.campaignId,
  });
  factory AdminOpsActivity.fromMap(Map<String, dynamic> map) =>
      AdminOpsActivity(
        type: map['type']?.toString() ?? 'activity',
        title: map['title']?.toString() ?? 'Operational activity',
        occurredAt: _date(map['occurredAt']),
        campaignId: map['campaignId']?.toString(),
      );
  final String type, title;
  final DateTime? occurredAt;
  final String? campaignId;
}

class AdminOpsHealth {
  const AdminOpsHealth({
    required this.metric,
    required this.state,
    required this.issueCount,
  });
  factory AdminOpsHealth.fromMap(Map<String, dynamic> map) => AdminOpsHealth(
    metric: map['metric']?.toString() ?? 'system',
    state: map['state']?.toString() ?? 'degraded',
    issueCount: (map['issueCount'] as num?)?.toInt() ?? 0,
  );
  final String metric, state;
  final int issueCount;
}

class GeneratedMediaWifPreflight {
  const GeneratedMediaWifPreflight({
    required this.metadataToken,
    required this.claimsMatch,
    required this.openAIExchange,
    this.failureCategory,
  });

  factory GeneratedMediaWifPreflight.fromMap(Map<String, dynamic> map) =>
      GeneratedMediaWifPreflight(
        metadataToken: map['metadataToken']?.toString() ?? 'FAIL',
        claimsMatch: map['claimsMatch']?.toString() ?? 'FAIL',
        openAIExchange: map['openAIExchange']?.toString() ?? 'FAIL',
        failureCategory: map['failureCategory']?.toString(),
      );

  final String metadataToken, claimsMatch, openAIExchange;
  final String? failureCategory;

  bool get passed =>
      metadataToken == 'PASS' &&
      claimsMatch == 'PASS' &&
      openAIExchange == 'PASS';
}

class GeneratedMediaCommercialMetrics {
  const GeneratedMediaCommercialMetrics({
    required this.providerEnabled,
    required this.rolloutMode,
    required this.betaCohortStage,
    required this.betaCohortEnabled,
    required this.betaCohortCount,
    required this.betaCohortLimit,
    required this.planAllowances,
    required this.requestsByPlan,
    required this.customerUnitsByPlan,
    required this.providerUnitsByPlan,
    required this.dailyCalls,
    required this.dailyCallLimit,
    required this.dailyCostMicros,
    required this.dailyCostLimitMicros,
    required this.monthlyCostMicros,
    required this.monthlyCostLimitMicros,
    required this.outstandingReservations,
    required this.systemRejections,
    required this.limitExhaustions,
    required this.averageLatencyMs,
    required this.providerFailures,
  });

  factory GeneratedMediaCommercialMetrics.fromMap(Map<String, dynamic> map) {
    final commercial = _map(map['commercial']);
    final access = _map(map['providerAccess']);
    final operations = _map(map['providerOperations']);
    final limits = _map(commercial['limits']);
    final utilization = _map(commercial['utilization']);
    return GeneratedMediaCommercialMetrics(
      providerEnabled: commercial['providerGenerationEnabled'] == true,
      rolloutMode: commercial['rolloutMode']?.toString() ?? 'founder_only',
      betaCohortStage: commercial['betaCohortStage']?.toString() ?? 'initial_5',
      betaCohortEnabled: commercial['betaCohortEnabled'] == true,
      betaCohortCount:
          (commercial['betaCohortCount'] as num?)?.toInt() ??
          (access['betaCohortCount'] as num?)?.toInt() ??
          0,
      betaCohortLimit: (commercial['betaCohortLimit'] as num?)?.toInt() ?? 5,
      planAllowances: _intMap(commercial['planMonthlyAllowances']),
      requestsByPlan: _intMap(operations['requestsByPlan']),
      customerUnitsByPlan: _intMap(operations['customerConsumedUnitsByPlan']),
      providerUnitsByPlan: _intMap(operations['providerBilledUnitsByPlan']),
      dailyCalls: (utilization['dailyCalls'] as num?)?.toInt() ?? 0,
      dailyCallLimit: (limits['globalDailyMaximum'] as num?)?.toInt() ?? 0,
      dailyCostMicros: (utilization['dailyCostMicros'] as num?)?.toInt() ?? 0,
      dailyCostLimitMicros:
          (limits['globalDailyCostMicros'] as num?)?.toInt() ?? 0,
      monthlyCostMicros:
          (utilization['monthlyCostMicros'] as num?)?.toInt() ?? 0,
      monthlyCostLimitMicros:
          (limits['globalMonthlyCostMicros'] as num?)?.toInt() ?? 0,
      outstandingReservations:
          (operations['outstandingReservationUnits'] as num?)?.toInt() ?? 0,
      systemRejections:
          (operations['systemRejectionCount'] as num?)?.toInt() ?? 0,
      limitExhaustions:
          (utilization['customerLimitExhaustionCount'] as num?)?.toInt() ?? 0,
      averageLatencyMs:
          (map['averageCompletionLatencyMs'] as num?)?.toInt() ?? 0,
      providerFailures: _intMap(
        map['failures'],
      ).values.fold(0, (a, b) => a + b),
    );
  }

  final bool providerEnabled, betaCohortEnabled;
  final String rolloutMode, betaCohortStage;
  final int betaCohortCount,
      betaCohortLimit,
      dailyCalls,
      dailyCallLimit,
      dailyCostMicros,
      dailyCostLimitMicros,
      monthlyCostMicros,
      monthlyCostLimitMicros,
      outstandingReservations,
      systemRejections,
      limitExhaustions,
      averageLatencyMs,
      providerFailures;
  final Map<String, int> planAllowances,
      requestsByPlan,
      customerUnitsByPlan,
      providerUnitsByPlan;
}

Map<String, int> _intMap(Object? value) =>
    _map(value).map((key, item) => MapEntry(key, (item as num?)?.toInt() ?? 0));

class AdminCampaignTimeline {
  const AdminCampaignTimeline({
    required this.name,
    required this.status,
    required this.events,
  });
  factory AdminCampaignTimeline.fromMap(Map<String, dynamic> map) {
    final campaign = _map(map['campaign']);
    return AdminCampaignTimeline(
      name: campaign['name']?.toString() ?? 'Campaign',
      status: campaign['status']?.toString() ?? 'Unknown',
      events: _maps(
        map['events'],
      ).map(AdminTimelineEvent.fromMap).toList(growable: false),
    );
  }
  final String name, status;
  final List<AdminTimelineEvent> events;
}

class AdminTimelineEvent {
  const AdminTimelineEvent({
    required this.type,
    required this.title,
    required this.occurredAt,
    required this.detail,
  });
  factory AdminTimelineEvent.fromMap(Map<String, dynamic> map) =>
      AdminTimelineEvent(
        type: map['type']?.toString() ?? 'event',
        title: map['title']?.toString() ?? 'Campaign event',
        occurredAt: _date(map['occurredAt']),
        detail: _map(map['detail']),
      );
  final String type, title;
  final DateTime? occurredAt;
  final Map<String, dynamic> detail;
}
