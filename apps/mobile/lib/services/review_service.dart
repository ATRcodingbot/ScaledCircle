import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'secure_function_service.dart';

class ReviewService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final SecureFunctionService _secureFunctions = const SecureFunctionService();

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
    final user = FirebaseAuth.instance.currentUser;

    if (user == null || user.uid != fromUserId) {
      throw Exception('You must be logged in as the review author.');
    }

    await _secureFunctions.call(
      functionName: 'submitCampaignReview',
      data: {
        'campaignId': campaignId,
        'targetId': toUserId,
        'targetType': toUserType,
        'rating': rating,
        'comment': comment,
      },
    );

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

  Future<Map<String, dynamic>?> getReview({
    required String campaignId,
    required String fromUserId,
    required String toUserId,
  }) async {
    final reviewId = '${fromUserId}_${toUserId}_$campaignId';
    final snapshot = await _firestore.collection('reviews').doc(reviewId).get();

    if (!snapshot.exists) {
      return null;
    }

    return {
      'id': snapshot.id,
      ...?snapshot.data(),
    };
  }

  Future<bool> reportReview({
    required String reviewId,
    required String reason,
    required String details,
  }) async {
    final result = await _secureFunctions.call(
      functionName: 'reportCampaignReview',
      data: {
        'reviewId': reviewId,
        'reason': reason,
        'details': details,
      },
    );

    return result['alreadyReported'] == true;
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
