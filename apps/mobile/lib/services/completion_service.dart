import 'package:cloud_firestore/cloud_firestore.dart';

import 'payment_service.dart';

class CompletionService {
  static Future<void> submitCompletion({
    required String campaignId,

    required String zoneId,

    required String workerId,

    required int assignedUnits,

    required int completedUnits,

    required double basePay,

    required double bonusPay,

    required bool gpsVerified,
  }) async {
    final firestore = FirebaseFirestore.instance;

    final percentage = (completedUnits / assignedUnits) * 100;

    final payment = PaymentService.calculatePayment(
      completionPercentage: percentage,
      basePay: basePay,
      bonusPay: bonusPay,
    );

    final status = PaymentService.getCompletionStatus(percentage);

    await firestore.collection('jobCompletions').add({
      'campaignId': campaignId,

      'zoneId': zoneId,

      'workerId': workerId,

      'assignedUnits': assignedUnits,

      'completedUnits': completedUnits,

      'completionPercentage': percentage,

      'basePay': basePay,

      'bonusPay': bonusPay,

      'calculatedPay': payment,

      'gpsVerified': gpsVerified,

      'status': status,

      'submittedAt': FieldValue.serverTimestamp(),
    });
  }
}
