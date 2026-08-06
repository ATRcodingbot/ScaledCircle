class ZoneCompletion {
  final String id;

  final String zoneId;

  final String campaignId;

  final String scalerId;

  final int assignedHomes;

  final int completedHomes;

  final double completionPercentage;

  final double payoutAmount;

  final double bonusAmount;

  final String paymentStatus;
  // pending
  // approved
  // paid
  // rejected

  final DateTime? createdAt;

  final DateTime? updatedAt;

  ZoneCompletion({
    required this.id,
    required this.zoneId,
    required this.campaignId,
    required this.scalerId,
    required this.assignedHomes,
    required this.completedHomes,
    required this.completionPercentage,
    required this.payoutAmount,
    required this.bonusAmount,
    required this.paymentStatus,
    this.createdAt,
    this.updatedAt,
  });

  factory ZoneCompletion.fromMap(String id, Map<String, dynamic> data) {
    return ZoneCompletion(
      id: id,

      zoneId: data['zoneId']?.toString() ?? '',

      campaignId: data['campaignId']?.toString() ?? '',

      scalerId: data['scalerId']?.toString() ?? '',

      assignedHomes: (data['assignedHomes'] as num?)?.toInt() ?? 0,

      completedHomes: (data['completedHomes'] as num?)?.toInt() ?? 0,

      completionPercentage:
          (data['completionPercentage'] as num?)?.toDouble() ?? 0,

      payoutAmount: (data['payoutAmount'] as num?)?.toDouble() ?? 0,

      bonusAmount: (data['bonusAmount'] as num?)?.toDouble() ?? 0,

      paymentStatus: data['paymentStatus']?.toString() ?? 'pending',

      createdAt: data['createdAt'] as DateTime?,

      updatedAt: data['updatedAt'] as DateTime?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'zoneId': zoneId,

      'campaignId': campaignId,

      'scalerId': scalerId,

      'assignedHomes': assignedHomes,

      'completedHomes': completedHomes,

      'completionPercentage': completionPercentage,

      'payoutAmount': payoutAmount,

      'bonusAmount': bonusAmount,

      'paymentStatus': paymentStatus,

      'createdAt': createdAt,

      'updatedAt': updatedAt,
    };
  }

  ZoneCompletion copyWith({
    int? completedHomes,

    double? completionPercentage,

    double? payoutAmount,

    double? bonusAmount,

    String? paymentStatus,

    DateTime? updatedAt,
  }) {
    return ZoneCompletion(
      id: id,

      zoneId: zoneId,

      campaignId: campaignId,

      scalerId: scalerId,

      assignedHomes: assignedHomes,

      completedHomes: completedHomes ?? this.completedHomes,

      completionPercentage: completionPercentage ?? this.completionPercentage,

      payoutAmount: payoutAmount ?? this.payoutAmount,

      bonusAmount: bonusAmount ?? this.bonusAmount,

      paymentStatus: paymentStatus ?? this.paymentStatus,

      createdAt: createdAt,

      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
