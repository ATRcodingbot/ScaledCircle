import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';

abstract interface class BusinessMediaGateway {
  Future<Map<String, dynamic>> workspace({String? cursor});
  Future<void> upload({
    required Uint8List bytes,
    required String filename,
    required String purpose,
    String? assetId,
  });
  Future<void> saveReviewMetadata({
    required String assetId,
    required String revisionId,
    required String altText,
    required String serviceLabel,
    required bool rightsAttestation,
  });
  Future<void> approve(String assetId, String revisionId);
  Future<void> reject(String assetId, String revisionId);
  Future<void> remove(String assetId);
  Future<void> selectLogo(String assetId, String revisionId);
  Future<void> updateBrand({
    required String primaryColor,
    required String secondaryColor,
    required String stylePreset,
    required List<String> approvedServiceCategories,
  });
  Future<Uint8List?> previewBytes(Map<String, dynamic> asset);
}

abstract interface class GeneratedVisualGateway {
  Future<Map<String, dynamic>> generationWorkspace({String? cursor});
  Future<Map<String, dynamic>> requestGeneration({
    required String requestId,
    required String serviceCategory,
    required String visualDirection,
  });
  Future<Map<String, dynamic>> processGeneration(String jobId);
  Future<void> approveGeneration(String jobId);
  Future<void> rejectGeneration(String jobId);
}

class BusinessMediaService
    implements BusinessMediaGateway, GeneratedVisualGateway {
  BusinessMediaService({FirebaseFunctions? functions, FirebaseStorage? storage})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1'),
      _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFunctions _functions;
  final FirebaseStorage _storage;

  @override
  Future<Map<String, dynamic>> workspace({String? cursor}) async {
    final response = await _functions
        .httpsCallable('getBusinessMediaWorkspace')
        .call({'cursor': ?cursor});
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  Future<void> upload({
    required Uint8List bytes,
    required String filename,
    required String purpose,
    String? assetId,
  }) async {
    final requestId =
        'upload_${DateTime.now().microsecondsSinceEpoch}_${bytes.length}';
    final created = await _functions
        .httpsCallable('createBusinessMediaUploadIntent')
        .call({
          'requestId': requestId,
          'purpose': purpose,
          'title': purpose == 'logo' ? 'Company logo' : filename,
          'assetId': ?assetId,
        });
    final data = Map<String, dynamic>.from(created.data as Map);
    final path = data['uploadPath'].toString();
    await _storage
        .ref(path)
        .putData(bytes, SettableMetadata(contentType: _contentType(filename)));
    await _functions.httpsCallable('finalizeBusinessMediaUpload').call({
      'assetId': data['assetId'],
      'revisionId': data['revisionId'],
    });
  }

  @override
  Future<void> saveReviewMetadata({
    required String assetId,
    required String revisionId,
    required String altText,
    required String serviceLabel,
    required bool rightsAttestation,
  }) => _functions.httpsCallable('updateBusinessMediaRevisionMetadata').call({
    'assetId': assetId,
    'revisionId': revisionId,
    'altText': altText,
    'serviceLabel': serviceLabel,
    'rightsAttestation': rightsAttestation,
  });

  @override
  Future<void> approve(String assetId, String revisionId) => _functions
      .httpsCallable('approveBusinessMediaRevision')
      .call({'assetId': assetId, 'revisionId': revisionId});
  @override
  Future<void> reject(String assetId, String revisionId) => _functions
      .httpsCallable('rejectBusinessMediaRevision')
      .call({'assetId': assetId, 'revisionId': revisionId});
  @override
  Future<void> remove(String assetId) => _functions
      .httpsCallable('removeBusinessMediaAsset')
      .call({'assetId': assetId});
  @override
  Future<void> selectLogo(String assetId, String revisionId) =>
      _functions.httpsCallable('updateBusinessBrandProfile').call({
        'approvedLogo': {'assetId': assetId, 'revisionId': revisionId},
        'stylePreset': 'clean',
      });

  @override
  Future<void> updateBrand({
    required String primaryColor,
    required String secondaryColor,
    required String stylePreset,
    required List<String> approvedServiceCategories,
  }) => _functions.httpsCallable('updateBusinessBrandProfile').call({
    'primaryColor': primaryColor,
    'secondaryColor': secondaryColor,
    'stylePreset': stylePreset,
    'approvedServiceCategories': approvedServiceCategories,
  });

  @override
  Future<Uint8List?> previewBytes(Map<String, dynamic> asset) async {
    var revision = asset['revision'] is Map
        ? Map<String, dynamic>.from(asset['revision'] as Map)
        : null;
    if ((revision?['renditions'] as Map?)?.isEmpty != false &&
        asset['approvedRevision'] is Map) {
      revision = Map<String, dynamic>.from(asset['approvedRevision'] as Map);
    }
    final renditions = revision?['renditions'] is Map
        ? Map<String, dynamic>.from(revision!['renditions'] as Map)
        : null;
    final card = renditions?['card'] is Map
        ? Map<String, dynamic>.from(renditions!['card'] as Map)
        : null;
    final path = card?['storagePath']?.toString();
    // Keep private media behind authenticated Storage Rules. A Firebase
    // download-token URL would behave as a bearer URL outside those rules.
    return path == null || path.isEmpty
        ? null
        : _storage.ref(path).getData(5 * 1024 * 1024);
  }

  String _contentType(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Future<Map<String, dynamic>> generationWorkspace({String? cursor}) async {
    final response = await _functions
        .httpsCallable('getGeneratedServiceVisualWorkspace')
        .call({'cursor': ?cursor});
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  Future<Map<String, dynamic>> requestGeneration({
    required String requestId,
    required String serviceCategory,
    required String visualDirection,
  }) async {
    final response = await _functions
        .httpsCallable('requestGeneratedServiceVisual')
        .call({
          'requestId': requestId,
          'serviceCategory': serviceCategory,
          'visualDirection': visualDirection,
          'requestedPurpose': 'service_visual',
        });
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  Future<Map<String, dynamic>> processGeneration(String jobId) async {
    final response = await _functions
        .httpsCallable('processGeneratedServiceVisual')
        .call({'jobId': jobId});
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  Future<void> approveGeneration(String jobId) => _functions
      .httpsCallable('approveGeneratedServiceVisual')
      .call({'jobId': jobId});

  @override
  Future<void> rejectGeneration(String jobId) => _functions
      .httpsCallable('rejectGeneratedServiceVisual')
      .call({'jobId': jobId});
}
