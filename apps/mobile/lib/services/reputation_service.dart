import 'package:cloud_firestore/cloud_firestore.dart';

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

    final completedSnapshot = await _firestore
        .collection('campaigns')
        .where('completedBy', isEqualTo: userId)
        .where('status', isEqualTo: 'completed')
        .get();

    return {
      'rating': averageRating,

      'reviewCount': reviewCount,

      'completedCount': completedSnapshot.docs.length,
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
