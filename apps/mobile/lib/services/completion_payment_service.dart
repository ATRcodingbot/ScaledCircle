import 'package:cloud_firestore/cloud_firestore.dart';

class CompletionPaymentService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Map<String, dynamic> calculatePayment({
    required int assignedHomes,
    required int completedHomes,
    required double basePay,
    required double completionBonus,
  }) {
    if (assignedHomes == 0) {
      return {'percentage': 0, 'payment': 0, 'bonus': 0, 'eligible': false};
    }

    final percentage = (completedHomes / assignedHomes) * 100;

    if (percentage < 30) {
      return {
        'percentage': percentage,
        'payment': 0,
        'bonus': 0,
        'eligible': false,
      };
    }

    if (percentage >= 100) {
      return {
        'percentage': 100,
        'payment': basePay,
        'bonus': completionBonus,
        'eligible': true,
      };
    }

    return {
      'percentage': percentage,
      'payment': basePay * (percentage / 100),
      'bonus': 0,
      'eligible': true,
    };
  }

  Future<void> recordScalerPayment({
    required String scalerId,
    required String campaignId,
    required String zoneId,
    required double amount,
  }) async {
    final paymentReference = _firestore.collection('payouts').doc();

    await paymentReference.set({
      'scalerId': scalerId,

      'campaignId': campaignId,

      'zoneId': zoneId,

      'amount': amount,

      'status': 'pending',

      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}
