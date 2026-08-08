import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/campaign/campaign_completion.dart';

class CompletionSubmissionService {
  CompletionSubmissionService({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _completions =>
      _firestore.collection('campaignCompletions');

  // ------------------------------------------------------------
  // CREATE DRAFT COMPLETION
  //
  // Creates a completion record when the scaler starts work.
  // Status begins as draft.
  // ------------------------------------------------------------

  Future<String> createDraftCompletion({
    required String campaignId,
    required String businessId,
    required String scalerId,
  }) async {
    final document = _completions.doc();

    final completion = CampaignCompletion(
      id: document.id,
      campaignId: campaignId,
      businessId: businessId,
      scalerId: scalerId,
      type: CampaignCompletionType.campaign,
      status: CampaignCompletionStatus.draft,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await document.set(completion.toMap());

    return document.id;
  }

  // ------------------------------------------------------------
  // START COMPLETION
  //
  // Changes draft -> in progress
  // ------------------------------------------------------------

  Future<void> startCompletion({required String completionId}) async {
    await _completions.doc(completionId).update({
      'status': 'in_progress',
      'startedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ------------------------------------------------------------
  // ADD COMPLETION PROOF
  //
  // Adds photos, GPS evidence, checkpoints, etc.
  // ------------------------------------------------------------

  Future<void> addProof({
    required String completionId,
    required CompletionProof proof,
  }) async {
    await _completions.doc(completionId).update({
      'proofs': FieldValue.arrayUnion([proof.toMap()]),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ------------------------------------------------------------
  // SUBMIT COMPLETION
  //
  // Sends completion to business review.
  // ------------------------------------------------------------

  Future<void> submitCompletion({
    required String completionId,
    String? scalerNotes,
  }) async {
    await _completions.doc(completionId).update({
      'status': 'submitted',
      'scalerNotes': scalerNotes,
      'submittedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ------------------------------------------------------------
  // GET COMPLETION
  // ------------------------------------------------------------

  Future<CampaignCompletion?> getCompletion(String completionId) async {
    final snapshot = await _completions.doc(completionId).get();

    if (!snapshot.exists) {
      return null;
    }

    return CampaignCompletion.fromDocument(snapshot);
  }

  // ------------------------------------------------------------
  // WATCH COMPLETION
  // ------------------------------------------------------------

  Stream<CampaignCompletion?> watchCompletion(String completionId) {
    return _completions.doc(completionId).snapshots().map((snapshot) {
      if (!snapshot.exists) {
        return null;
      }

      return CampaignCompletion.fromDocument(snapshot);
    });
  }
}
