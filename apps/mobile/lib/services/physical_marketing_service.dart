import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';

abstract interface class PhysicalMarketingGateway {
  Future<Map<String, dynamic>> workspace();
  Future<Map<String, dynamic>> create({
    required String requestId,
    required Map<String, dynamic> draft,
  });
  Future<Map<String, dynamic>> prepare(String materialId);
  Future<Map<String, dynamic>> approve(String materialId, String versionId);
  Future<Uint8List?> bytes(String storagePath, {required int maximumBytes});
}

class PhysicalMarketingService implements PhysicalMarketingGateway {
  PhysicalMarketingService({FirebaseFunctions? functions, FirebaseStorage? storage})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1'),
      _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFunctions _functions;
  final FirebaseStorage _storage;

  Map<String, dynamic> _map(dynamic value) =>
      Map<String, dynamic>.from(value as Map);

  @override
  Future<Map<String, dynamic>> workspace() async => _map(
    (await _functions.httpsCallable('getPhysicalMarketingWorkspace').call()).data,
  );

  @override
  Future<Map<String, dynamic>> create({
    required String requestId,
    required Map<String, dynamic> draft,
  }) async => _map(
    (await _functions.httpsCallable('mutatePhysicalMarketingMaterial').call({
      'action': 'create',
      'requestId': requestId,
      'draft': draft,
    })).data,
  );

  @override
  Future<Map<String, dynamic>> prepare(String materialId) async => _map(
    (await _functions.httpsCallable('preparePhysicalMarketingVersion').call({
      'materialId': materialId,
    })).data,
  );

  @override
  Future<Map<String, dynamic>> approve(
    String materialId,
    String versionId,
  ) async => _map(
    (await _functions.httpsCallable('approvePhysicalMarketingVersion').call({
      'materialId': materialId,
      'versionId': versionId,
    })).data,
  );

  @override
  Future<Uint8List?> bytes(
    String storagePath, {
    required int maximumBytes,
  }) => _storage.ref(storagePath).getData(maximumBytes);
}
