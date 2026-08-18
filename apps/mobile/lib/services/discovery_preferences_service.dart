import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'service_area_geometry_codec.dart';

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
    final data = snapshot.data();
    return data == null ? null : ServiceAreaGeometryCodec.decodePreferences(data);
  }

  Future<Map<String, dynamic>> save(Map<String, dynamic> preferences) async {
    final result = await _functions
        .httpsCallable('saveDiscoveryPreferences')
        .call({'preferences': preferences});
    return ServiceAreaGeometryCodec.decodePreferences(Map<String, dynamic>.from(
      Map<String, dynamic>.from(result.data as Map)['preferences'] as Map,
    ));
  }

  Future<Map<String, dynamic>> completeScalerSetup(
    Map<String, dynamic> preferences,
  ) async {
    final result = await _functions
        .httpsCallable('saveDiscoveryPreferences')
        .call({'preferences': preferences, 'initialSetupCompleted': true});
    return ServiceAreaGeometryCodec.decodePreferences(Map<String, dynamic>.from(
      Map<String, dynamic>.from(result.data as Map)['preferences'] as Map,
    ));
  }

  Future<Map<String, dynamic>?> loadPendingScaler() async {
    final result = await _functions
        .httpsCallable('getPendingScalerPreferences')
        .call();
    final raw = Map<String, dynamic>.from(result.data as Map)['preferences'];
    return raw is Map
        ? ServiceAreaGeometryCodec.decodePreferences(
            Map<String, dynamic>.from(raw),
          )
        : null;
  }

  Future<Map<String, dynamic>> savePendingScaler(
    Map<String, dynamic> preferences,
  ) async {
    final result = await _functions
        .httpsCallable('savePendingScalerPreferences')
        .call({'preferences': preferences});
    return ServiceAreaGeometryCodec.decodePreferences(
      Map<String, dynamic>.from(
        Map<String, dynamic>.from(result.data as Map)['preferences'] as Map,
      ),
    );
  }

  Future<Map<String, dynamic>> completePendingScalerSetup(
    Map<String, dynamic> preferences,
  ) async {
    final result = await _functions
        .httpsCallable('savePendingScalerPreferences')
        .call({'preferences': preferences, 'initialSetupCompleted': true});
    return ServiceAreaGeometryCodec.decodePreferences(
      Map<String, dynamic>.from(
        Map<String, dynamic>.from(result.data as Map)['preferences'] as Map,
      ),
    );
  }

  Future<List<MarketplaceWorkType>> loadMarketplaceWorkTypes() async {
    final result = await _functions.httpsCallable('getMarketplaceWorkTypes').call();
    final data = Map<String, dynamic>.from(result.data as Map);
    return (data['workTypes'] as List? ?? const [])
        .whereType<Map>()
        .map((value) => MarketplaceWorkType.fromMap(Map<String, dynamic>.from(value)))
        .toList(growable: false);
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

class MarketplaceWorkType {
  const MarketplaceWorkType({
    required this.id,
    required this.customerLabel,
    required this.description,
    required this.scalerSelectable,
    required this.requiresVehicle,
    required this.requiresOutreachConsent,
  });

  factory MarketplaceWorkType.fromMap(Map<String, dynamic> value) =>
      MarketplaceWorkType(
        id: value['id']?.toString() ?? '',
        customerLabel: value['customerLabel']?.toString() ?? '',
        description: value['description']?.toString() ?? '',
        scalerSelectable: value['scalerSelectable'] == true,
        requiresVehicle: value['requiresVehicle'] == true,
        requiresOutreachConsent: value['requiresOutreachConsent'] == true,
      );

  final String id;
  final String customerLabel;
  final String description;
  final bool scalerSelectable;
  final bool requiresVehicle;
  final bool requiresOutreachConsent;
}
