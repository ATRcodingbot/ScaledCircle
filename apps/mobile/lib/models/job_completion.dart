import 'package:cloud_firestore/cloud_firestore.dart';

class JobCompletion {
  final String id;

  final String campaignId;
  final String zoneId;

  final String scalerId;
  final String scalerEmail;

  final String businessId;

  final int assignedHomes;
  final int completedHomes;

  final double completionPercentage;

  final double basePay;
  final double earnedPay;
  final double bonus;

  final bool fullCompletion;

  final String status;

  final String? routeId;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  JobCompletion({
    required this.id,

    required this.campaignId,
    required this.zoneId,

    required this.scalerId,
    required this.scalerEmail,

    required this.businessId,

    required this.assignedHomes,
    required this.completedHomes,

    required this.completionPercentage,

    required this.basePay,
    required this.earnedPay,
    required this.bonus,

    required this.fullCompletion,

    required this.status,

    this.routeId,

    this.createdAt,
    this.updatedAt,
  });

  factory JobCompletion.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};

    return JobCompletion(
      id: doc.id,

      campaignId: data['campaignId']?.toString() ?? '',

      zoneId: data['zoneId']?.toString() ?? '',

      scalerId: data['scalerId']?.toString() ?? '',

      scalerEmail: data['scalerEmail']?.toString() ?? '',

      businessId: data['businessId']?.toString() ?? '',

      assignedHomes: (data['assignedHomes'] as num?)?.toInt() ?? 0,

      completedHomes: (data['completedHomes'] as num?)?.toInt() ?? 0,

      completionPercentage:
          (data['completionPercentage'] as num?)?.toDouble() ?? 0,

      basePay: (data['basePay'] as num?)?.toDouble() ?? 0,

      earnedPay: (data['earnedPay'] as num?)?.toDouble() ?? 0,

      bonus: (data['bonus'] as num?)?.toDouble() ?? 0,

      fullCompletion: data['fullCompletion'] == true,

      status: data['status']?.toString() ?? 'pending',

      routeId: data['routeId']?.toString(),

      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),

      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'campaignId': campaignId,

      'zoneId': zoneId,

      'scalerId': scalerId,

      'scalerEmail': scalerEmail,

      'businessId': businessId,

      'assignedHomes': assignedHomes,

      'completedHomes': completedHomes,

      'completionPercentage': completionPercentage,

      'basePay': basePay,

      'earnedPay': earnedPay,

      'bonus': bonus,

      'fullCompletion': fullCompletion,

      'status': status,

      'routeId': routeId,

      'createdAt': createdAt == null
          ? FieldValue.serverTimestamp()
          : Timestamp.fromDate(createdAt!),

      'updatedAt': updatedAt == null
          ? FieldValue.serverTimestamp()
          : Timestamp.fromDate(updatedAt!),
    };
  }

  double calculateCompletionPercentage() {
    if (assignedHomes == 0) {
      return 0;
    }

    return (completedHomes / assignedHomes) * 100;
  }

  bool qualifiesForPayment() {
    return completionPercentage >= 10;
  }

  bool qualifiesForBonus() {
    return completionPercentage >= 95;
  }
}
