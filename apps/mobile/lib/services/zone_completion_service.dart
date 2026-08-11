import 'package:cloud_firestore/cloud_firestore.dart';

class ZoneCompletionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Map<String, dynamic> calculateZoneCompletion({
    required int assignedHomes,
    required int completedHomes,
    required double basePay,
    required double bonus,
  }) {
    if (assignedHomes <= 0) {
      return {
        'completionPercentage': 0,
        'payoutAmount': 0,
        'bonusAmount': 0,
        'eligible': false,
      };
    }

    final percentage = (completedHomes / assignedHomes) * 100;

    // Less than 10% earns nothing.
    if (percentage < 10) {
      return {
        'completionPercentage': percentage,
        'payoutAmount': 0,
        'bonusAmount': 0,
        'eligible': false,
      };
    }

    // 95%+ earns full base pay and the required bonus.
    if (percentage >= 95) {
      return {
        'completionPercentage': percentage.clamp(0, 100),
        'payoutAmount': basePay,
        'bonusAmount': bonus,
        'eligible': true,
      };
    }

    // Partial completion earns percentage
    return {
      'completionPercentage': percentage,
      'payoutAmount': basePay * (percentage / 100),
      'bonusAmount': 0,
      'eligible': true,
    };
  }

  Future<void> createCompletionRecord({
    required String zoneId,
    required String campaignId,
    required String scalerId,
    required int assignedHomes,
    required int completedHomes,
    required double basePay,
    required double bonus,
  }) async {
    final calculation = calculateZoneCompletion(
      assignedHomes: assignedHomes,
      completedHomes: completedHomes,
      basePay: basePay,
      bonus: bonus,
    );

    await _firestore.collection('zoneCompletions').add({
      'zoneId': zoneId,

      'campaignId': campaignId,

      'scalerId': scalerId,

      'assignedHomes': assignedHomes,

      'completedHomes': completedHomes,

      'completionPercentage': calculation['completionPercentage'],

      'payoutAmount': calculation['payoutAmount'],

      'bonusAmount': calculation['bonusAmount'],

      'eligible': calculation['eligible'],

      'paymentStatus': 'pending',

      'createdAt': FieldValue.serverTimestamp(),

      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
