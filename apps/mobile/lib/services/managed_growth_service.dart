import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

class BusinessGrowthProfile {
  const BusinessGrowthProfile({
    required this.data,
    required this.profileVersion,
  });
  final Map<String, dynamic> data;
  final int profileVersion;
  bool get isReady =>
      (data['businessName']?.toString().trim().isNotEmpty ?? false) &&
      (data['businessDescription']?.toString().trim().isNotEmpty ?? false) &&
      (data['servicesOffered'] as List? ?? const []).isNotEmpty &&
      (data['serviceAreas'] as List? ?? const []).isNotEmpty;
}

class ManagedGrowthArtifact {
  const ManagedGrowthArtifact({required this.id, required this.data});
  final String id;
  final Map<String, dynamic> data;
  String get title => data['title']?.toString() ?? 'Managed Growth draft';
  String get summary => data['summary']?.toString() ?? '';
  List<Map<String, dynamic>> get sections =>
      (data['sections'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
  List<String> get limitations => (data['limitations'] as List? ?? const [])
      .map((item) => item.toString())
      .toList(growable: false);
  String toPlainText() {
    final output = StringBuffer()
      ..writeln(title.toUpperCase())
      ..writeln()
      ..writeln(summary);
    for (final section in sections) {
      output
        ..writeln()
        ..writeln((section['heading'] ?? '').toString().toUpperCase())
        ..writeln(section['content'] ?? '');
    }
    if (limitations.isNotEmpty) {
      output
        ..writeln()
        ..writeln('LIMITATIONS')
        ..writeln(limitations.join('\n'));
    }
    return output.toString().trim();
  }
}

class ManagedGrowthService {
  ManagedGrowthService({
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
      _auth.currentUser?.uid ??
      (throw StateError('Business authentication required.'));

  Future<BusinessGrowthProfile?> loadProfile() async {
    final snapshot = await _firestore
        .collection('businessGrowthProfiles')
        .doc(_uid)
        .get();
    if (!snapshot.exists) return null;
    final data = snapshot.data() ?? <String, dynamic>{};
    return BusinessGrowthProfile(
      data: data,
      profileVersion: (data['profileVersion'] as num?)?.toInt() ?? 1,
    );
  }

  Future<BusinessGrowthProfile> saveProfile(
    Map<String, dynamic> profile,
  ) async {
    final response = await _functions
        .httpsCallable('saveBusinessGrowthProfile')
        .call({'profile': profile});
    final data = Map<String, dynamic>.from(response.data as Map);
    return BusinessGrowthProfile(
      data: Map<String, dynamic>.from(data['profile'] as Map),
      profileVersion: (data['profileVersion'] as num).toInt(),
    );
  }

  Future<Map<String, dynamic>> suggestFromWebsite(String website) async {
    final response = await _functions
        .httpsCallable('suggestBusinessGrowthProfileFromWebsite')
        .call({'website': website.trim()});
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<ManagedGrowthArtifact> generate({
    required String artifactType,
    String instruction = '',
    String mode = 'organic_only',
    List<String> platforms = const [],
    String audience = '',
    num? plannedBudget,
    Map<String, dynamic>? propertyContext,
  }) async {
    final response = await _functions
        .httpsCallable('generateManagedGrowthArtifact')
        .call({
          'artifactType': artifactType,
          'instruction': instruction.trim(),
          'mode': mode,
          'platforms': platforms,
          'audience': audience.trim(),
          'plannedBudget': plannedBudget,
          'propertyContext': propertyContext,
        });
    final data = Map<String, dynamic>.from(response.data as Map);
    return ManagedGrowthArtifact(
      id: data['artifactId'].toString(),
      data: Map<String, dynamic>.from(data['artifact'] as Map),
    );
  }
}
