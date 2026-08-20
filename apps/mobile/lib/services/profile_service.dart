import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class ProfileService {
  ProfileService({FirebaseFirestore? firestore, FirebaseFunctions? functions})
    : _firestore = firestore ?? FirebaseFirestore.instance,
      _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  Future<Map<String, dynamic>?> getProfile(String userId) async {
    final snapshot = await _firestore.collection('users').doc(userId).get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data();
  }

  Stream<Map<String, dynamic>?> watchProfile(String userId) {
    return _firestore.collection('users').doc(userId).snapshots().map((
      snapshot,
    ) {
      if (!snapshot.exists) {
        return null;
      }

      return snapshot.data();
    });
  }

  Future<void> updateProfile({
    required String userId,
    required Map<String, dynamic> data,
  }) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .set(data, SetOptions(merge: true));
  }

  Future<Map<String, dynamic>> updateScalerPresentationProfile({
    required String displayName,
    required String bio,
  }) async {
    final result = await _functions.httpsCallable('updateScalerProfile').call({
      'displayName': displayName.trim(),
      'bio': bio.trim(),
    });
    return Map<String, dynamic>.from(result.data as Map);
  }
}
