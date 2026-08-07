import 'package:cloud_firestore/cloud_firestore.dart';

enum CampaignType {
  flyerDistribution,
  doorHangerDistribution,
  businessCardDistribution,
  yardSignInstallation,
  dumpRun,
  eventMarketing,
}

enum CampaignStatus {
  draft,
  funded,
  active,
  verificationPending,
  completed,
  cancelled,
}

enum MaterialSource {
  businessProvided,
  scaledCircleGenerated,
  printedByScaledCircle,
}

class Campaign {
  final String id;

  final String businessId;

  final String campaignName;

  final String description;

  final CampaignType type;

  final CampaignStatus status;

  final MaterialSource materialSource;

  final double workerBudget;

  final double platformFee;

  final double totalFunding;

  final double bonus;

  final int targetQuantity;

  final int applicationCount;

  final int zoneCount;

  final int assignedZoneCount;

  final int completedZoneCount;

  final DateTime? deadline;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  final DateTime? completedAt;

  const Campaign({
    required this.id,
    required this.businessId,
    required this.campaignName,
    required this.description,
    required this.type,
    required this.status,
    required this.materialSource,
    required this.workerBudget,
    required this.platformFee,
    required this.totalFunding,
    required this.bonus,
    required this.targetQuantity,
    required this.applicationCount,
    required this.zoneCount,
    required this.assignedZoneCount,
    required this.completedZoneCount,
    this.deadline,
    this.createdAt,
    this.updatedAt,
    this.completedAt,
  });

  factory Campaign.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? {};

    return Campaign(
      id: document.id,
      businessId: data['businessId']?.toString() ?? '',
      campaignName: data['campaignName']?.toString() ?? 'Untitled Campaign',
      description: data['description']?.toString() ?? '',
      type: _campaignTypeFromString(data['campaignType']?.toString()),
      status: _campaignStatusFromString(data['status']?.toString()),
      materialSource: _materialSourceFromString(
        data['materialSource']?.toString(),
      ),
      workerBudget:
          (data['workerBudget'] as num?)?.toDouble() ??
          (data['basePay'] as num?)?.toDouble() ??
          0.0,
      platformFee: (data['platformFee'] as num?)?.toDouble() ?? 0.0,
      totalFunding:
          (data['totalFunding'] as num?)?.toDouble() ??
          (data['totalCharge'] as num?)?.toDouble() ??
          0.0,
      bonus: (data['bonus'] as num?)?.toDouble() ?? 0.0,
      targetQuantity:
          (data['targetQuantity'] as num?)?.toInt() ??
          (data['estimatedHomes'] as num?)?.toInt() ??
          (data['homes'] as num?)?.toInt() ??
          0,
      applicationCount: (data['applications'] as num?)?.toInt() ?? 0,
      zoneCount: (data['zoneCount'] as num?)?.toInt() ?? 0,
      assignedZoneCount:
          (data['assignedZoneCount'] as num?)?.toInt() ??
          (data['assignedScalerCount'] as num?)?.toInt() ??
          0,
      completedZoneCount: (data['completedZoneCount'] as num?)?.toInt() ?? 0,
      deadline: _dateTimeFromValue(data['deadlineAt']),
      createdAt: _dateTimeFromValue(data['createdAt']),
      updatedAt: _dateTimeFromValue(data['updatedAt']),
      completedAt: _dateTimeFromValue(data['completedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'businessId': businessId,
      'campaignName': campaignName,
      'description': description,
      'campaignType': campaignTypeValue(type),
      'status': campaignStatusValue(status),
      'materialSource': materialSourceValue(materialSource),
      'workerBudget': workerBudget,
      'platformFee': platformFee,
      'totalFunding': totalFunding,
      'bonus': bonus,
      'targetQuantity': targetQuantity,
      'applications': applicationCount,
      'zoneCount': zoneCount,
      'assignedZoneCount': assignedZoneCount,
      'completedZoneCount': completedZoneCount,
      if (deadline != null) 'deadlineAt': Timestamp.fromDate(deadline!),
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
      if (completedAt != null) 'completedAt': Timestamp.fromDate(completedAt!),
    };
  }

  Campaign copyWith({
    String? id,
    String? businessId,
    String? campaignName,
    String? description,
    CampaignType? type,
    CampaignStatus? status,
    MaterialSource? materialSource,
    double? workerBudget,
    double? platformFee,
    double? totalFunding,
    double? bonus,
    int? targetQuantity,
    int? applicationCount,
    int? zoneCount,
    int? assignedZoneCount,
    int? completedZoneCount,
    DateTime? deadline,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? completedAt,
  }) {
    return Campaign(
      id: id ?? this.id,
      businessId: businessId ?? this.businessId,
      campaignName: campaignName ?? this.campaignName,
      description: description ?? this.description,
      type: type ?? this.type,
      status: status ?? this.status,
      materialSource: materialSource ?? this.materialSource,
      workerBudget: workerBudget ?? this.workerBudget,
      platformFee: platformFee ?? this.platformFee,
      totalFunding: totalFunding ?? this.totalFunding,
      bonus: bonus ?? this.bonus,
      targetQuantity: targetQuantity ?? this.targetQuantity,
      applicationCount: applicationCount ?? this.applicationCount,
      zoneCount: zoneCount ?? this.zoneCount,
      assignedZoneCount: assignedZoneCount ?? this.assignedZoneCount,
      completedZoneCount: completedZoneCount ?? this.completedZoneCount,
      deadline: deadline ?? this.deadline,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      completedAt: completedAt ?? this.completedAt,
    );
  }

  static CampaignType _campaignTypeFromString(String? value) {
    switch (value) {
      case 'door_hanger_distribution':
        return CampaignType.doorHangerDistribution;

      case 'business_card_distribution':
        return CampaignType.businessCardDistribution;

      case 'yard_sign_installation':
        return CampaignType.yardSignInstallation;

      case 'dump_run':
        return CampaignType.dumpRun;

      case 'event_marketing':
        return CampaignType.eventMarketing;

      case 'flyer_distribution':
      default:
        return CampaignType.flyerDistribution;
    }
  }

  static CampaignStatus _campaignStatusFromString(String? value) {
    switch (value) {
      case 'funded':
        return CampaignStatus.funded;

      case 'active':
      case 'open':
      case 'assigned':
      case 'accepted':
      case 'in_progress':
        return CampaignStatus.active;

      case 'verification_pending':
      case 'submitted':
        return CampaignStatus.verificationPending;

      case 'completed':
        return CampaignStatus.completed;

      case 'cancelled':
      case 'canceled':
        return CampaignStatus.cancelled;

      case 'draft':
      default:
        return CampaignStatus.draft;
    }
  }

  static MaterialSource _materialSourceFromString(String? value) {
    switch (value) {
      case 'scaled_circle_generated':
        return MaterialSource.scaledCircleGenerated;

      case 'printed_by_scaled_circle':
        return MaterialSource.printedByScaledCircle;

      case 'business_provided':
      default:
        return MaterialSource.businessProvided;
    }
  }

  static DateTime? _dateTimeFromValue(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }

    if (value is DateTime) {
      return value;
    }

    return null;
  }

  static String campaignTypeValue(CampaignType type) {
    switch (type) {
      case CampaignType.flyerDistribution:
        return 'flyer_distribution';

      case CampaignType.doorHangerDistribution:
        return 'door_hanger_distribution';

      case CampaignType.businessCardDistribution:
        return 'business_card_distribution';

      case CampaignType.yardSignInstallation:
        return 'yard_sign_installation';

      case CampaignType.dumpRun:
        return 'dump_run';

      case CampaignType.eventMarketing:
        return 'event_marketing';
    }
  }

  static String campaignStatusValue(CampaignStatus status) {
    switch (status) {
      case CampaignStatus.draft:
        return 'draft';

      case CampaignStatus.funded:
        return 'funded';

      case CampaignStatus.active:
        return 'active';

      case CampaignStatus.verificationPending:
        return 'verification_pending';

      case CampaignStatus.completed:
        return 'completed';

      case CampaignStatus.cancelled:
        return 'cancelled';
    }
  }

  static String materialSourceValue(MaterialSource source) {
    switch (source) {
      case MaterialSource.businessProvided:
        return 'business_provided';

      case MaterialSource.scaledCircleGenerated:
        return 'scaled_circle_generated';

      case MaterialSource.printedByScaledCircle:
        return 'printed_by_scaled_circle';
    }
  }
}
