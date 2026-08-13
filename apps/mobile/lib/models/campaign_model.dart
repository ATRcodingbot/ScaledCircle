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
  final int estimatedMinutes;

  final double basePay;
  final double bonus;
  final int workerPoolCents;
  final int scheduledShareCents;
  final Map<String, dynamic> materialLogistics;

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
    required this.estimatedMinutes,

    required this.basePay,

    required this.bonus,
    required this.workerPoolCents,
    required this.scheduledShareCents,
    this.materialLogistics = const {},

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

  factory CampaignModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return CampaignModel.fromMap(doc.id, data);
  }

  factory CampaignModel.fromMap(String id, Map<String, dynamic> data) {
    return CampaignModel(
      id: id,

      businessId: data["businessId"] ?? "",

      businessEmail: data["businessEmail"],

      campaignType: data["campaignType"] ?? "",

      campaignName: data["campaignName"] ?? "",

      description: data["description"] ?? "",

      address: data["location"]?["address"] ?? "",

      latitude: (data["location"]?["latitude"] ?? 0).toDouble(),

      longitude: (data["location"]?["longitude"] ?? 0).toDouble(),

      scalerCount:
          data["requiredScalerCount"] ?? data["requestedScalerCount"] ?? 1,

      estimatedMinutes:
          (data["estimatedMinutes"] as num?)?.round() ??
          (data["preliminaryEstimatedMinutes"] as num?)?.round() ??
          0,

      basePay: (data["basePay"] ?? 0).toDouble(),

      bonus: (data["bonus"] ?? 0).toDouble(),
      workerPoolCents:
          (data["workerPoolCents"] as num?)?.round() ??
          (((data["maximumWorkerBudget"] ?? data["basePay"] ?? 0) as num)
                      .toDouble() *
                  100)
              .round(),
      scheduledShareCents: (data["scheduledShareCents"] as num?)?.round() ?? 0,
      materialLogistics: Map<String, dynamic>.from(
        (data['materialLogistics'] as Map?) ?? const {},
      ),

      beforePhotoRequired:
          data["verification"]?["beforePhotoRequired"] ?? false,

      afterPhotoRequired: data["verification"]?["afterPhotoRequired"] ?? false,

      businessApprovalRequired:
          data["verification"]?["businessApprovalRequired"] ?? false,

      gpsRequired: data["tracking"]?["gpsRequired"] ?? false,

      locationRequired: data["tracking"]?["locationRequired"] ?? false,

      status: data["status"] ?? "open",

      applications: data["applications"] ?? 0,

      assignedScalerCount: data["assignedScalerCount"] ?? 0,

      deadline: _timestampToDate(data["deadline"]),

      createdAt: _timestampToDate(data["createdAt"]),

      updatedAt: _timestampToDate(data["updatedAt"]),
    );
  }

  factory CampaignModel.fromDiscovery(Map<String, dynamic> data) {
    DateTime? date(dynamic value) {
      if (value is Timestamp) return value.toDate();
      if (value is String) return DateTime.tryParse(value);
      return null;
    }

    final workerCents = (data['estimatedPayCents'] as num?)?.round() ?? 0;
    final bonusCents = (data['bonusAmountCents'] as num?)?.round() ?? 0;
    return CampaignModel(
      id: data['campaignId']?.toString() ?? '',
      businessId: '',
      campaignType: data['campaignType']?.toString() ?? '',
      campaignName: data['title']?.toString() ?? 'Campaign',
      description: data['zoneSummary']?.toString() ?? '',
      address: data['zoneName']?.toString() ?? 'Mapped zone',
      latitude: 0,
      longitude: 0,
      scalerCount: (data['requiredScalerCount'] as num?)?.round() ?? 1,
      estimatedMinutes: (data['estimatedWalkingMinutes'] as num?)?.round() ?? 0,
      basePay: workerCents / 100,
      bonus: bonusCents / 100,
      workerPoolCents: workerCents,
      scheduledShareCents:
          (data['scheduledShareCents'] as num?)?.round() ?? workerCents,
      materialLogistics: Map<String, dynamic>.from(
        (data['materialLogistics'] as Map?) ?? const {},
      ),
      beforePhotoRequired: false,
      afterPhotoRequired: false,
      businessApprovalRequired: true,
      gpsRequired: true,
      locationRequired: true,
      status: 'available',
      applications: 0,
      assignedScalerCount:
          (data['acceptedScalerCount'] as num?)?.round() ??
          (data['assignedScalerCount'] as num?)?.round() ??
          0,
      deadline: date(data['deadline']),
    );
  }

  static DateTime? _timestampToDate(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }

    return null;
  }
}
