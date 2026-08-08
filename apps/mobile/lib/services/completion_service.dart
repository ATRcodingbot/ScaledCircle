import 'package:cloud_firestore/cloud_firestore.dart';

class CompletionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<void> submitCompletion({
    required String campaignId,

    required String scalerId,

    required List<String> photos,

    required String notes,
  }) async {
    await _firestore.collection('campaign_completions').doc(campaignId).set({
      'campaignId': campaignId,

      'scalerId': scalerId,

      'photos': photos,

      'notes': notes,

      'status': 'submitted',

      'createdAt': FieldValue.serverTimestamp(),
    });

    await _firestore.collection('campaigns').doc(campaignId).update({
      'status': 'submitted',
    });
  }

  Future<void> approveCompletion({
    required String campaignId,

    required String scalerId,

    required String businessId,
  }) async {
    final batch = _firestore.batch();

    final campaignRef = _firestore.collection('campaigns').doc(campaignId);

    final completionRef = _firestore
        .collection('campaign_completions')
        .doc(campaignId);

    final scalerRef = _firestore.collection('users').doc(scalerId);

    final businessRef = _firestore.collection('users').doc(businessId);

    batch.update(campaignRef, {
      'status': 'completed',

      'completedAt': FieldValue.serverTimestamp(),
    });

    batch.update(completionRef, {
      'status': 'approved',

      'approvedAt': FieldValue.serverTimestamp(),

      'approvedBy': businessId,
    });

    batch.update(scalerRef, {
      'completedCampaigns': FieldValue.increment(1),

      'successfulJobs': FieldValue.increment(1),
    });

    batch.update(businessRef, {
      'completedCampaigns': FieldValue.increment(1),

      'successfulCampaigns': FieldValue.increment(1),
    });

    await batch.commit();
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> watchCompletion(
    String campaignId,
  ) {
    return _firestore
        .collection('campaign_completions')
        .doc(campaignId)
        .snapshots();
  }
}
