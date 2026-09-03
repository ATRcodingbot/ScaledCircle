import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/campaign_model.dart';

class CampaignService {
  final FirebaseFirestore _firestore =
      FirebaseFirestore.instance;
  final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'us-east1');


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
  final currentUid = FirebaseAuth.instance.currentUser?.uid;
  if (currentUid == null || currentUid != scalerId) {
    throw Exception('Sign in as the Scaler applying for this campaign.');
  }
  await _functions.httpsCallable('applyToCampaign').call({
    'campaignId': campaignId,
  });
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
    throw StateError(
      'Choose a zone or exact locations before assigning this Scaler.',
    );

  }





  // ==============================
  // COMPLETE CAMPAIGN
  // ==============================

  Future<void> completeCampaign({

    required String campaignId,

    required String scalerId,

  }) async {
    throw StateError(
      'Completion must be submitted and reviewed through the Job Room.',
    );
  }

}
