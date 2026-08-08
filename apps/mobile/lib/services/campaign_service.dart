import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/campaign_model.dart';

class CampaignService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> createCampaign(Map<String, dynamic> data) async {
    final doc = await _firestore.collection("campaigns").add(data);

    return doc.id;
  }

  Stream<List<CampaignModel>> getOpenCampaigns() {
    return _firestore
        .collection("campaigns")
        .where("status", isEqualTo: "open")
        .orderBy("createdAt", descending: true)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map((doc) => CampaignModel.fromFirestore(doc))
              .toList();
        });
  }

  Stream<List<CampaignModel>> getBusinessCampaigns(String businessId) {
    return _firestore
        .collection("campaigns")
        .where("businessId", isEqualTo: businessId)
        .orderBy("createdAt", descending: true)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map((doc) => CampaignModel.fromFirestore(doc))
              .toList();
        });
  }

  Future<CampaignModel?> getCampaignById(String campaignId) async {
    final snapshot = await _firestore
        .collection("campaigns")
        .doc(campaignId)
        .get();

    if (!snapshot.exists) {
      return null;
    }

    return CampaignModel.fromFirestore(snapshot);
  }

  Future<void> applyToCampaign({
    required String campaignId,
    required String scalerId,
  }) async {
    final applicationRef = _firestore
        .collection("campaigns")
        .doc(campaignId)
        .collection("applications")
        .doc(scalerId);

    await applicationRef.set({
      "scalerId": scalerId,

      "campaignId": campaignId,

      "status": "pending",

      "createdAt": FieldValue.serverTimestamp(),

      "updatedAt": FieldValue.serverTimestamp(),
    });
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> getCampaignApplications(
    String campaignId,
  ) {
    return _firestore
        .collection("campaigns")
        .doc(campaignId)
        .collection("applications")
        .orderBy("createdAt", descending: true)
        .snapshots();
  }

  Future<void> acceptScalerApplication({
    required String campaignId,

    required String scalerId,
  }) async {
    final batch = _firestore.batch();

    final applicationRef = _firestore
        .collection("campaigns")
        .doc(campaignId)
        .collection("applications")
        .doc(scalerId);

    final assignedRef = _firestore
        .collection("campaigns")
        .doc(campaignId)
        .collection("assignedScalers")
        .doc(scalerId);

    batch.update(applicationRef, {
      "status": "accepted",

      "updatedAt": FieldValue.serverTimestamp(),
    });

    batch.set(assignedRef, {
      "scalerId": scalerId,

      "assignedAt": FieldValue.serverTimestamp(),

      "status": "assigned",
    });

    await batch.commit();
  }

  Future<void> completeCampaign({
    required String campaignId,

    required String scalerId,
  }) async {
    final batch = _firestore.batch();

    final campaignRef = _firestore.collection("campaigns").doc(campaignId);

    final scalerRef = campaignRef.collection("assignedScalers").doc(scalerId);

    batch.update(campaignRef, {
      "status": "completed",

      "completedBy": scalerId,

      "completedAt": FieldValue.serverTimestamp(),

      // unlock reviews
      "reviewsUnlocked": true,
    });

    batch.update(scalerRef, {
      "status": "completed",

      "completedAt": FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }
}
