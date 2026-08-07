import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/campaign_model.dart';


class CampaignService {

  final FirebaseFirestore _firestore =
      FirebaseFirestore.instance;



  Future<String> createCampaign(
    Map<String, dynamic> data,
  ) async {

    final doc =
        await _firestore
            .collection("campaigns")
            .add(data);


    return doc.id;

  }




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

        .map(

          (snapshot) {

            return snapshot.docs
                .map(

                  (doc) =>
                      CampaignModel
                          .fromFirestore(doc),

                )

                .toList();

          },

        );

  }





  Stream<List<CampaignModel>> getBusinessCampaigns(
    String businessId,
  ) {

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

        .map(

          (snapshot) {

            return snapshot.docs
                .map(

                  (doc) =>
                      CampaignModel
                          .fromFirestore(doc),

                )

                .toList();

          },

        );

  }





  Future<void> applyToCampaign({

    required String campaignId,

    required String scalerId,

  }) async {


    await _firestore

        .collection("campaigns")

        .doc(campaignId)

        .collection("applications")

        .doc(scalerId)

        .set({


      "scalerId":
          scalerId,


      "campaignId":
          campaignId,


      "status":
          "pending",


      "createdAt":
          FieldValue.serverTimestamp(),


      "updatedAt":
          FieldValue.serverTimestamp(),


    });


  }


}