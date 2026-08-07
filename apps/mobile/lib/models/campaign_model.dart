import 'package:cloud_firestore/cloud_firestore.dart';

class CampaignModel {

  final String id;

  final String businessId;
  final String? businessEmail;

  final String campaignType;
  final String campaignName;
  final String description;


  final String address;
  final double latitude;
  final double longitude;


  final int scalerCount;

  final double basePay;
  final double bonus;


  final bool beforePhotoRequired;
  final bool afterPhotoRequired;
  final bool businessApprovalRequired;


  final bool gpsRequired;
  final bool locationRequired;


  final String status;


  final int applications;
  final int assignedScalerCount;


  final DateTime? deadline;
  final DateTime? createdAt;
  final DateTime? updatedAt;



  CampaignModel({

    required this.id,

    required this.businessId,

    this.businessEmail,


    required this.campaignType,

    required this.campaignName,

    required this.description,


    required this.address,

    required this.latitude,

    required this.longitude,


    required this.scalerCount,


    required this.basePay,

    required this.bonus,


    required this.beforePhotoRequired,

    required this.afterPhotoRequired,

    required this.businessApprovalRequired,


    required this.gpsRequired,

    required this.locationRequired,


    required this.status,


    required this.applications,

    required this.assignedScalerCount,


    this.deadline,

    this.createdAt,

    this.updatedAt,

  });



  factory CampaignModel.fromFirestore(
      DocumentSnapshot doc,
  ) {

    final data =
        doc.data() as Map<String, dynamic>;


    return CampaignModel(

      id: doc.id,


      businessId:
          data["businessId"] ?? "",


      businessEmail:
          data["businessEmail"],


      campaignType:
          data["campaignType"] ?? "",


      campaignName:
          data["campaignName"] ?? "",


      description:
          data["description"] ?? "",



      address:
          data["location"]?["address"] ?? "",


      latitude:
          (data["location"]?["latitude"] ?? 0)
              .toDouble(),


      longitude:
          (data["location"]?["longitude"] ?? 0)
              .toDouble(),



      scalerCount:
          data["requestedScalerCount"] ?? 1,



      basePay:
          (data["basePay"] ?? 0)
              .toDouble(),


      bonus:
          (data["bonus"] ?? 0)
              .toDouble(),



      beforePhotoRequired:
          data["verification"]
              ?["beforePhotoRequired"] ?? false,


      afterPhotoRequired:
          data["verification"]
              ?["afterPhotoRequired"] ?? false,


      businessApprovalRequired:
          data["verification"]
              ?["businessApprovalRequired"] ?? false,



      gpsRequired:
          data["tracking"]
              ?["gpsRequired"] ?? false,


      locationRequired:
          data["tracking"]
              ?["locationRequired"] ?? false,



      status:
          data["status"] ?? "open",



      applications:
          data["applications"] ?? 0,


      assignedScalerCount:
          data["assignedScalerCount"] ?? 0,



      deadline:
          _timestampToDate(
              data["deadline"],
          ),


      createdAt:
          _timestampToDate(
              data["createdAt"],
          ),


      updatedAt:
          _timestampToDate(
              data["updatedAt"],
          ),

    );

  }



  static DateTime? _timestampToDate(
      dynamic value,
  ) {

    if (value is Timestamp) {

      return value.toDate();

    }

    return null;

  }

}