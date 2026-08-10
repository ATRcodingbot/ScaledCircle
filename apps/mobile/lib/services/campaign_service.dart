import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/campaign_model.dart';

class CampaignService {
  final FirebaseFirestore _firestore =
      FirebaseFirestore.instance;


  // ==============================
  // CREATE CAMPAIGN
  // ==============================

  Future<String> createCampaign(
    Map<String, dynamic> data,
  ) async {

    final doc = await _firestore
        .collection("campaigns")
        .add(data);

    return doc.id;
  }



  // ==============================
  // OPEN CAMPAIGNS
  // ==============================

  Stream<List<CampaignModel>> getOpenCampaigns() {

    return _firestore
        .collection("campaigns")
        .where(
          "status",
          isEqualTo: "open",
        )
        .orderBy(
          "createdAt",
          descending: true,
        )
        .snapshots()
        .map((snapshot) {

      return snapshot.docs
          .map(
            (doc) =>
                CampaignModel.fromFirestore(doc),
          )
          .toList();

    });

  }



  // ==============================
  // SCALER APPLICATIONS
  // ==============================

  Stream<List<CampaignModel>> getScalerApplications() {

    final user =
        FirebaseAuth.instance.currentUser;


    if (user == null) {

      return Stream.value([]);

    }


    return _firestore
        .collectionGroup("applications")
        .where(
          "scalerId",
          isEqualTo: user.uid,
        )
        .snapshots()
        .asyncMap(
          (snapshot) async {

        final List<CampaignModel> campaigns = [];


        for(final application in snapshot.docs){

          final data = application.data();

          if (data["status"]?.toString() != "pending") {
            continue;
          }

          final campaign =
              await getCampaignById(
                data["campaignId"],
              );


          if(campaign != null){

            campaigns.add(campaign);

          }

        }


        return campaigns;

      });

  }



  // ==============================
  // BUSINESS CAMPAIGNS
  // ==============================

  Stream<List<CampaignModel>> getBusinessCampaigns(
    String businessId,
  ){

    return _firestore
        .collection("campaigns")
        .where(
          "businessId",
          isEqualTo: businessId,
        )
        .orderBy(
          "createdAt",
          descending: true,
        )
        .snapshots()
        .map((snapshot){

      return snapshot.docs
          .map(
            (doc)=>
              CampaignModel.fromFirestore(doc),
          )
          .toList();

    });

  }



  // ==============================
  // GET CAMPAIGN
  // ==============================

  Future<CampaignModel?> getCampaignById(
    String campaignId,
  ) async {


    final snapshot =
        await _firestore
            .collection("campaigns")
            .doc(campaignId)
            .get();



    if(!snapshot.exists){

      return null;

    }


    return CampaignModel.fromFirestore(
      snapshot,
    );

  }



  // ==============================
  // GET CAMPAIGN ZONES
  // ==============================

  Stream<List<Map<String,dynamic>>> getCampaignZones(
    String campaignId,
  ){

    return _firestore
        .collection("campaignZones")
        .where(
          "campaignId",
          isEqualTo: campaignId,
        )
        .snapshots()
        .map((snapshot){

      return snapshot.docs
          .map(
            (doc)=>doc.data(),
          )
          .toList();

    });

  }



  // ==============================
  // ESTIMATED HOMES
  // ==============================

  Future<int> getEstimatedHomes(
    String campaignId,
  ) async {


    final snapshot =
        await _firestore
            .collection("campaignZones")
            .where(
              "campaignId",
              isEqualTo: campaignId,
            )
            .get();


    int total = 0;


    for(final doc in snapshot.docs){

      final data = doc.data();

      total +=
          (data["estimatedHomes"] ?? 0)
              as int;

    }


    return total;

  }




  // ==============================
  // APPLY TO CAMPAIGN
  // ==============================

  Future<void> applyToCampaign({
  required String campaignId,
  required String scalerId,
}) async {
  final campaignRef =
      _firestore.collection("campaigns").doc(campaignId);

  final campaignSnapshot = await campaignRef.get();

  if (!campaignSnapshot.exists) {
    throw Exception("Campaign not found.");
  }

  final campaignData =
      campaignSnapshot.data() as Map<String, dynamic>;

  final businessId =
      campaignData["businessId"]?.toString() ?? "";

  if (businessId.isEmpty) {
    throw Exception(
      "This campaign does not have a business attached.",
    );
  }

  final applicationRef = campaignRef
      .collection("applications")
      .doc(scalerId);

  // Check whether this scaler has already applied.
  final existingApplication =
      await applicationRef.get();

  if (existingApplication.exists) {
    final data =
        existingApplication.data() ?? {};

    final status =
        data["status"]?.toString() ?? "pending";

    if (status == "pending") {
      throw Exception(
        "You already applied for this campaign. "
        "Your application is waiting for business approval.",
      );
    }

    if (status == "accepted") {
      throw Exception(
        "You have already been accepted for this campaign.",
      );
    }

    if (status == "rejected") {
      throw Exception(
        "Your previous application for this campaign was declined.",
      );
    }

    throw Exception(
      "You already have an application for this campaign.",
    );
  }

  final notificationRef =
      _firestore
          .collection("notifications")
          .doc();

  final batch = _firestore.batch();

  batch.set(
    applicationRef,
    {
      "scalerId": scalerId,
      "campaignId": campaignId,
      "businessId": businessId,
      "status": "pending",
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    },
  );

  batch.set(
    notificationRef,
    {
      "userId": businessId,
      "campaignId": campaignId,
      "scalerId": scalerId,
      "type": "application_received",
      "title": "New Scaler Application",
      "message": "A scaler applied for your campaign.",
      "read": false,
      "createdAt": FieldValue.serverTimestamp(),
    },
  );

  await batch.commit();
}





  // ==============================
  // CAMPAIGN APPLICATIONS
  // ==============================

  Stream<QuerySnapshot<Map<String,dynamic>>>
  getCampaignApplications(
    String campaignId,
  ){

    return _firestore
        .collection("campaigns")
        .doc(campaignId)
        .collection("applications")
        .orderBy(
          "createdAt",
          descending: true,
        )
        .snapshots();

  }





  // ==============================
  // ACCEPT SCALER
  // ==============================

  Future<void> acceptScalerApplication({

    required String campaignId,

    required String scalerId,

  }) async {


    final batch =
        _firestore.batch();



    final applicationRef =
        _firestore
            .collection("campaigns")
            .doc(campaignId)
            .collection("applications")
            .doc(scalerId);



    final assignedRef =
        _firestore
            .collection("campaigns")
            .doc(campaignId)
            .collection("assignedScalers")
            .doc(scalerId);



    batch.update(
      applicationRef,
      {

        "status":"accepted",

        "updatedAt":
            FieldValue.serverTimestamp(),

      },
    );



    batch.set(
      assignedRef,
      {

        "scalerId":scalerId,

        "assignedAt":
            FieldValue.serverTimestamp(),

        "status":"assigned",

      },
    );



    await batch.commit();

  }





  // ==============================
  // COMPLETE CAMPAIGN
  // ==============================

  Future<void> completeCampaign({

    required String campaignId,

    required String scalerId,

  }) async {


    final batch =
        _firestore.batch();



    final campaignRef =
        _firestore
            .collection("campaigns")
            .doc(campaignId);



    final scalerRef =
        campaignRef
            .collection("assignedScalers")
            .doc(scalerId);



    batch.update(
      campaignRef,
      {

        "status":"completed",

        "completedBy":
            scalerId,

        "completedAt":
            FieldValue.serverTimestamp(),

        "reviewsUnlocked":
            true,

      },
    );



    batch.update(
      scalerRef,
      {

        "status":"completed",

        "completedAt":
            FieldValue.serverTimestamp(),

      },
    );



    await batch.commit();

  }

}
