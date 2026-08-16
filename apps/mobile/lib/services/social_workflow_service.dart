import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

class SocialProviderAvailability {
  const SocialProviderAvailability({
    required this.provider,
    required this.label,
    required this.status,
    required this.capabilities,
  });
  final String provider;
  final String label;
  final String status;
  final Map<String, dynamic> capabilities;
  bool get canPublish => capabilities['canCreatePost'] == true;
}

class SocialWorkflowService {
  SocialWorkflowService({
    FirebaseFunctions? functions,
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
    FirebaseStorage? storage,
  }) : _functions =
           functions ?? FirebaseFunctions.instanceFor(region: 'us-east1'),
       _firestore = firestore ?? FirebaseFirestore.instance,
       _auth = auth ?? FirebaseAuth.instance,
       _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFunctions _functions;
  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;
  final FirebaseStorage _storage;
  String get _uid =>
      _auth.currentUser?.uid ??
      (throw StateError('Business authentication required.'));

  Future<List<SocialProviderAvailability>> providerAvailability() async {
    final response = await _functions
        .httpsCallable('getSocialProviderAvailability')
        .call();
    final data = Map<String, dynamic>.from(response.data as Map);
    return (data['providers'] as List? ?? const [])
        .whereType<Map>()
        .map((raw) {
          final item = Map<String, dynamic>.from(raw);
          return SocialProviderAvailability(
            provider: item['provider'].toString(),
            label: item['label'].toString(),
            status: item['status'].toString(),
            capabilities: Map<String, dynamic>.from(
              item['capabilities'] as Map? ?? const {},
            ),
          );
        })
        .toList(growable: false);
  }

  Stream<List<Map<String, dynamic>>> connections() => _firestore
      .collection('socialConnections')
      .doc(_uid)
      .collection('providers')
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => {...doc.data(), 'id': doc.id})
            .toList(growable: false),
      );

  Stream<List<Map<String, dynamic>>> mediaItems() => _firestore
      .collection('socialMediaLibraries')
      .doc(_uid)
      .collection('items')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => {...doc.data(), 'id': doc.id})
            .toList(growable: false),
      );

  Future<String> createDraft({
    required String artifactId,
    required List<Map<String, dynamic>> posts,
  }) async {
    final response = await _functions
        .httpsCallable('createSocialPostDraft')
        .call({'artifactId': artifactId, 'posts': posts});
    return Map<String, dynamic>.from(
      response.data as Map,
    )['draftId'].toString();
  }

  Future<int> updateDraft({
    required String draftId,
    required List<Map<String, dynamic>> posts,
  }) async {
    final response = await _functions
        .httpsCallable('updateSocialPostDraft')
        .call({'draftId': draftId, 'posts': posts});
    return (Map<String, dynamic>.from(response.data as Map)['contentVersion']
            as num)
        .toInt();
  }

  Future<void> approve({
    required String draftId,
    required int contentVersion,
  }) => _functions.httpsCallable('approveSocialPostDraft').call({
    'draftId': draftId,
    'contentVersion': contentVersion,
  });

  Future<void> schedule({
    required String draftId,
    required DateTime scheduledFor,
  }) => _functions.httpsCallable('scheduleSocialPostDraft').call({
    'draftId': draftId,
    'scheduledFor': scheduledFor.toUtc().toIso8601String(),
  });

  Future<String> uploadPhoto({
    required Uint8List bytes,
    required String filename,
    String? category,
    String? description,
  }) async {
    final mediaId = 'media_${DateTime.now().microsecondsSinceEpoch}';
    final safeName = filename.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    final path = 'social_media/$_uid/$mediaId/$safeName';
    await _storage
        .ref(path)
        .putData(bytes, SettableMetadata(contentType: _contentType(safeName)));
    await _functions.httpsCallable('registerSocialMediaItem').call({
      'mediaId': mediaId,
      'storagePath': path,
      'filename': safeName,
      'category': category,
      'description': description,
    });
    return mediaId;
  }

  Future<String> mediaDownloadUrl(String storagePath) =>
      _storage.ref(storagePath).getDownloadURL();

  String _contentType(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
