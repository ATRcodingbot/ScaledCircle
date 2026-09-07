import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../config/app_environment.dart';

class ReputationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<Map<String, dynamic>> getUserReputation(String userId) async {
    final reviewsSnapshot = await _firestore
        .collection('reviews')
        .where('toUserId', isEqualTo: userId)
        .get();

    double totalRating = 0;

    int reviewCount = reviewsSnapshot.docs.length;

    for (final review in reviewsSnapshot.docs) {
      final data = review.data();

      totalRating += (data['rating'] ?? 0).toDouble();
    }

    final averageRating = reviewCount == 0 ? 0.0 : totalRating / reviewCount;

    final int completedCount;
    if (AppEnvironmentConfig.isProduction) {
      final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
          .httpsCallable('getReputationCompletionCountV1')
          .call({'userId': userId});
      completedCount = (response.data as Map)['completedCount'] as int;
    } else {
      final completedSnapshot = await _firestore
          .collection('campaigns')
          .where('completedBy', isEqualTo: userId)
          .where('status', isEqualTo: 'completed')
          .get();
      completedCount = completedSnapshot.docs.length;
    }

    return {
      'rating': averageRating,

      'reviewCount': reviewCount,

      'completedCount': completedCount,
    };
  }

  Stream<Map<String, dynamic>> watchUserReputation(String userId) {
    return _firestore
        .collection('reviews')
        .where('toUserId', isEqualTo: userId)
        .snapshots()
        .asyncMap((snapshot) async {
          return await getUserReputation(userId);
        });
  }
}
