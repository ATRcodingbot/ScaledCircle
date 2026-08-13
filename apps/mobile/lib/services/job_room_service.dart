import 'package:cloud_functions/cloud_functions.dart';

class JobRoomService {
  const JobRoomService();

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: 'us-east1');

  Future<Map<String, dynamic>> load(String zoneId) async {
    final response = await _functions.httpsCallable('getJobRoom').call({
      'zoneId': zoneId,
    });
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> sendMessage(String zoneId, String text) async {
    await _functions.httpsCallable('sendJobMessage').call({
      'zoneId': zoneId,
      'text': text,
    });
  }

  Future<void> configure({
    required String zoneId,
    required String fulfillmentType,
    required DateTime? scheduledAt,
    DateTime? windowEndAt,
    required String location,
    String printingShopName = '',
    String orderReference = '',
    required String instructions,
  }) async {
    await _functions.httpsCallable('configureJobCoordination').call({
      'zoneId': zoneId,
      'fulfillmentType': fulfillmentType,
      'scheduledAt': scheduledAt?.toIso8601String(),
      'windowEndAt': windowEndAt?.toIso8601String(),
      'location': location,
      'printingShopName': printingShopName,
      'orderReference': orderReference,
      'instructions': instructions,
    });
  }

  Future<void> acknowledgeReadiness(String zoneId) async {
    await _functions.httpsCallable('acknowledgeJobReadiness').call({
      'zoneId': zoneId,
    });
  }

  Future<Map<String, dynamic>> confirmMaterialReceipt({
    required String zoneId,
    required String handoffId,
  }) async {
    if (zoneId.isEmpty || handoffId.isEmpty) {
      throw StateError('The participant material handoff is unavailable.');
    }
    return _transitionMaterialHandoff(
      zoneId: zoneId,
      handoffId: handoffId,
      nextStatus: 'received',
    );
  }

  Future<Map<String, dynamic>> confirmBusinessMaterials({
    required String zoneId,
    required String handoffId,
  }) async {
    return _transitionMaterialHandoff(
      zoneId: zoneId,
      handoffId: handoffId,
      nextStatus: 'received',
    );
  }

  Future<void> reportMaterialIssue({
    required String zoneId,
    required String summary,
  }) async {
    await _functions.httpsCallable('createSupportCase').call({
      'zoneId': zoneId,
      'category': 'material_handoff',
      'summary': summary,
    });
  }

  Future<Map<String, dynamic>> _transitionMaterialHandoff({
    required String zoneId,
    required String handoffId,
    required String nextStatus,
  }) async {
    final response = await _functions
        .httpsCallable('transitionMaterialHandoff')
        .call({
          'zoneId': zoneId,
          'handoffId': handoffId,
          'nextStatus': nextStatus,
        });
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> respondToMaterialLogisticsChange({
    required String proposalId,
    required bool accept,
  }) async {
    await _functions.httpsCallable('respondToMaterialLogisticsChange').call({
      'proposalId': proposalId,
      'decision': accept ? 'accept' : 'decline',
    });
  }
}
