import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/job_completion.dart';

class CompletionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  JobCompletion calculateCompletion({
    required String id,

    required String campaignId,

    required String zoneId,

    required String scalerId,

    required String scalerEmail,

    required String businessId,

    required int assignedHomes,

    required int completedHomes,

    required double basePay,

    required double bonus,

    String? routeId,
  }) {
    double percentage = 0;

    if (assignedHomes > 0) {
      percentage = (completedHomes / assignedHomes) * 100;
    }

    double earnedPay = 0;

    if (percentage >= 30 && percentage < 100) {
      earnedPay = basePay * (percentage / 100);
    }

    if (percentage >= 100) {
      earnedPay = basePay;
    }

    bool fullCompletion = percentage >= 100;

    double earnedBonus = 0;

    if (fullCompletion) {
      earnedBonus = bonus;
    }

    return JobCompletion(
      id: id,

      campaignId: campaignId,

      zoneId: zoneId,

      scalerId: scalerId,

      scalerEmail: scalerEmail,

      businessId: businessId,

      assignedHomes: assignedHomes,

      completedHomes: completedHomes,

      completionPercentage: percentage,

      basePay: basePay,

      earnedPay: earnedPay,

      bonus: earnedBonus,

      fullCompletion: fullCompletion,

      status:
        percentage < 30
          ? 'needs_redo'
          : percentage >= 100
             ? 'completed'
             : 'pending_payment',

      routeId: routeId,
    );
  }

  Future<void> saveCompletion(JobCompletion completion) async {
    await _firestore
        .collection('jobCompletions')
        .doc(completion.id)
        .set(completion.toFirestore());
  }
}
