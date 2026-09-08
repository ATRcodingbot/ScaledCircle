import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'business_workspace_service.dart';

/// Owners retain their existing live query. Members receive only authorized IDs,
/// then read each canonical document under Rules. No private records are cached
/// after removal or an authorization/read failure.
Stream<List<DocumentSnapshot<Map<String, dynamic>>>> businessWorkspaceRecords(
  FirebaseFirestore firestore,
  String collectionName,
  String businessId,
) {
  final collection = firestore.collection(collectionName);
  if (FirebaseAuth.instance.currentUser?.uid == businessId) {
    return collection
        .where('businessId', isEqualTo: businessId)
        .snapshots()
        .map((s) => s.docs);
  }
  late StreamController<List<DocumentSnapshot<Map<String, dynamic>>>>
  controller;
  Timer? timer;
  var reading = false;
  Future<void> read() async {
    if (reading || controller.isClosed) return;
    reading = true;
    try {
      final result = <DocumentSnapshot<Map<String, dynamic>>>[];
      String? cursor;
      do {
        final page = await BusinessWorkspaceService().call(
          'listBusinessWorkspaceRecordIds',
          {
            'businessId': businessId,
            'collection': collectionName,
            'cursor': ?cursor,
          },
        );
        final docs = await Future.wait(
          (page['ids'] as List).map(
            (id) => collection
                .doc(id.toString())
                .get(const GetOptions(source: Source.server)),
          ),
        );
        result.addAll(docs.where((d) => d.exists));
        cursor = page['nextCursor'] as String?;
        if (result.length >= 2000 && cursor != null) {
          throw StateError('Workspace view exceeds bounded page size');
        }
      } while (cursor != null && !controller.isClosed);
      if (!controller.isClosed) controller.add(result);
    } catch (error, stack) {
      if (!controller.isClosed) controller.addError(error, stack);
    } finally {
      reading = false;
    }
  }

  controller = StreamController(
    onListen: () {
      read();
      timer = Timer.periodic(const Duration(seconds: 30), (_) => read());
    },
    onCancel: () {
      timer?.cancel();
    },
  );
  return controller.stream;
}
