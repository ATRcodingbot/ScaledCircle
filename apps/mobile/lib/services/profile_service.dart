import 'package:cloud_firestore/cloud_firestore.dart';

class ProfileService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

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
}
