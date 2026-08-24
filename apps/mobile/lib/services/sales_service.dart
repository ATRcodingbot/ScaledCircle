import 'package:cloud_functions/cloud_functions.dart';

class SalesService {
  SalesService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;

  Future<SalesPipeline> loadPipeline({String? stage}) async {
    final result = await _functions
        .httpsCallable('getSalesPipeline')
        .call<Map<Object?, Object?>>({'limit': 50, 'stage': ?stage});
    return SalesPipeline.fromMap(Map<String, dynamic>.from(result.data));
  }

  Future<void> createLead(Map<String, dynamic> lead) async => _functions
      .httpsCallable('mutateSalesLead')
      .call<void>({'action': 'create', 'lead': lead});

  Future<void> mutate(
    String leadId,
    String action, [
    Map<String, dynamic> values = const {},
  ]) async => _functions.httpsCallable('mutateSalesLead').call<void>({
    'leadId': leadId,
    'action': action,
    ...values,
  });

  Future<void> recordActivity(
    String leadId, {
    required String type,
    String? channel,
    required String summary,
    String? outcome,
  }) async => _functions.httpsCallable('recordSalesActivity').call<void>({
    'leadId': leadId,
    'type': type,
    'channel': ?channel,
    'summary': summary,
    'outcome': ?outcome,
  });
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : const {};
List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList() : const [];

class SalesPipeline {
  const SalesPipeline({
    required this.leads,
    required this.summary,
    required this.recentActivity,
  });
  factory SalesPipeline.fromMap(Map<String, dynamic> value) => SalesPipeline(
    leads: _maps(value['leads']).map(SalesLead.fromMap).toList(),
    summary: _map(value['summary']),
    recentActivity: _maps(value['recentActivity']),
  );
  final List<SalesLead> leads;
  final Map<String, dynamic> summary;
  final List<Map<String, dynamic>> recentActivity;
}

class SalesLead {
  const SalesLead({
    required this.id,
    required this.businessName,
    required this.stage,
    required this.priority,
    required this.mayContact,
    this.industry,
    this.cityRegion,
    this.contactName,
    this.contactEmail,
    this.nextFollowUpAt,
    this.followUpBucket,
    this.suppressionStatus,
    this.researchSummary,
    this.convertedBusinessUid,
  });
  factory SalesLead.fromMap(Map<String, dynamic> value) => SalesLead(
    id: value['leadId']?.toString() ?? '',
    businessName: value['businessName']?.toString() ?? 'Business',
    stage: value['stage']?.toString() ?? 'prospect',
    priority: value['priority']?.toString() ?? 'normal',
    mayContact: value['mayContact'] == true,
    industry: value['industry']?.toString(),
    cityRegion: value['cityRegion']?.toString(),
    contactName: value['contactName']?.toString(),
    contactEmail: value['contactEmail']?.toString(),
    nextFollowUpAt: value['nextFollowUpAt'] is num
        ? DateTime.fromMillisecondsSinceEpoch(
            (value['nextFollowUpAt'] as num).toInt(),
          )
        : null,
    followUpBucket: value['followUpBucket']?.toString(),
    suppressionStatus: value['suppressionStatus']?.toString(),
    researchSummary: value['researchSummary']?.toString(),
    convertedBusinessUid: value['convertedBusinessUid']?.toString(),
  );
  final String id, businessName, stage, priority;
  final bool mayContact;
  final String? industry,
      cityRegion,
      contactName,
      contactEmail,
      followUpBucket,
      suppressionStatus,
      researchSummary,
      convertedBusinessUid;
  final DateTime? nextFollowUpAt;
}
