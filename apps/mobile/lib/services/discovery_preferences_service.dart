import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

class DiscoveryPreferencesService {
  DiscoveryPreferencesService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _functions =
           functions ?? FirebaseFunctions.instanceFor(region: 'us-east1'),
       _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;
  String get _uid =>
      _auth.currentUser?.uid ?? (throw StateError('Sign in required.'));

  Future<Map<String, dynamic>?> load() async {
    final snapshot = await _firestore
        .collection('discoveryPreferences')
        .doc(_uid)
        .get();
    return snapshot.data();
  }

  Future<Map<String, dynamic>> save(Map<String, dynamic> preferences) async {
    final result = await _functions
        .httpsCallable('saveDiscoveryPreferences')
        .call({'preferences': preferences});
    return Map<String, dynamic>.from(
      Map<String, dynamic>.from(result.data as Map)['preferences'] as Map,
    );
  }

  Future<Map<String, dynamic>> explainMatch(
    Map<String, dynamic> opportunity, {
    bool manualSearch = false,
  }) async {
    final result = await _functions
        .httpsCallable('evaluateOpportunityMatch')
        .call({
          'opportunity': opportunity,
          'scope': manualSearch ? 'manual' : 'push',
        });
    return Map<String, dynamic>.from(result.data as Map);
  }
}
