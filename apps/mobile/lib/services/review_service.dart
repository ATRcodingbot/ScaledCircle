import 'package:cloud_firestore/cloud_firestore.dart';

class ReviewService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> createReview({
    required String campaignId,
    required String fromUserId,
    required String fromUserType,
    required String toUserId,
    required String toUserType,
    required int rating,
    required String comment,
  }) async {
    final reviewId = '${fromUserId}_${toUserId}_$campaignId';

    await _firestore.collection('reviews').doc(reviewId).set({
      'campaignId': campaignId,

      'fromUserId': fromUserId,
      'fromUserType': fromUserType,

      'toUserId': toUserId,
      'toUserType': toUserType,

      'rating': rating,
      'comment': comment,

      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    return reviewId;
  }

  Future<bool> hasReviewed({
    required String campaignId,
    required String fromUserId,
    required String toUserId,
  }) async {
    final reviewId = '${fromUserId}_${toUserId}_$campaignId';

    final snapshot = await _firestore.collection('reviews').doc(reviewId).get();

    return snapshot.exists;
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> getUserReviews(String userId) {
    return _firestore
        .collection('reviews')
        .where('toUserId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  Future<Map<String, dynamic>> getUserReviewStats(String userId) async {
    final snapshot = await _firestore
        .collection('reviews')
        .where('toUserId', isEqualTo: userId)
        .get();

    if (snapshot.docs.isEmpty) {
      return {'reviewCount': 0, 'averageRating': 0.0};
    }

    double totalRating = 0;

    for (final review in snapshot.docs) {
      final data = review.data();

      totalRating += (data['rating'] as num?)?.toDouble() ?? 0;
    }

    final count = snapshot.docs.length;

    return {'reviewCount': count, 'averageRating': totalRating / count};
  }
}
