import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/campaign/campaign_completion.dart';
import '../secure_function_service.dart';

class CompletionSubmissionService {
  CompletionSubmissionService({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  final SecureFunctionService _secureFunctions = const SecureFunctionService();

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
    required String zoneId,
    required String zoneName,
    required String routeId,
  }) async {
    if (routeId.trim().isEmpty) {
      throw Exception('A saved GPS route is required.');
    }

    final routeSnapshot = await _firestore
        .collection('campaignRoutes')
        .doc(routeId)
        .get();

    if (!routeSnapshot.exists) {
      throw Exception('The saved GPS route was not found.');
    }

    final routeData = routeSnapshot.data() ?? {};

    if (routeData['scalerId']?.toString() != scalerId) {
      throw Exception('This GPS route belongs to another Scaler.');
    }

    if (routeData['campaignId']?.toString() != campaignId ||
        routeData['zoneId']?.toString() != zoneId) {
      throw Exception('The GPS route does not match this assigned zone.');
    }

    if (routeData['tracking'] == true) {
      throw Exception('Stop and save GPS tracking before submitting.');
    }

    final routePoints = routeData['points'];
    final gpsPointCount = routePoints is List ? routePoints.length : 0;

    if (gpsPointCount < 2) {
      throw Exception('Record at least two GPS points before submitting.');
    }

    final routeSimulated = routeData['simulated'] == true;
    final document = _completions.doc();

    final gpsProof = CompletionProof(
      id: routeId,
      type: CompletionProofType.gpsRoute,
      note: 'Saved GPS route with $gpsPointCount recorded points.',
      capturedAt: DateTime.now(),
    );

    final completion = CampaignCompletion(
      id: document.id,
      campaignId: campaignId,
      businessId: businessId,
      scalerId: scalerId,
      zoneId: zoneId,
      zoneName: zoneName,
      type: CampaignCompletionType.zone,
      status: CampaignCompletionStatus.draft,
      routeId: routeId,
      gpsPointCount: gpsPointCount,
      routeSimulated: routeSimulated,
      proofs: [gpsProof],
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
    final completionSnapshot = await _completions.doc(completionId).get();

    if (!completionSnapshot.exists) {
      throw Exception('Completion record not found.');
    }

    final completionData = completionSnapshot.data() ?? {};

    if (completionData['status']?.toString() == 'submitted') {
      return;
    }

    final routeId = completionData['routeId']?.toString();

    if (routeId == null || routeId.isEmpty) {
      throw Exception('A saved GPS route is required.');
    }

    final routeSnapshot = await _firestore
        .collection('campaignRoutes')
        .doc(routeId)
        .get();
    final routeData = routeSnapshot.data();
    final routePoints = routeData?['points'];

    if (!routeSnapshot.exists ||
        routeData == null ||
        routeData['tracking'] == true ||
        routePoints is! List ||
        routePoints.length < 2) {
      throw Exception('Stop and save a valid GPS route before submitting.');
    }

    await _secureFunctions.call(
      functionName: 'submitZoneCompletion',
      data: {
        'completionId': completionId,
        'scalerNotes': scalerNotes?.trim() ?? '',
      },
    );
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
