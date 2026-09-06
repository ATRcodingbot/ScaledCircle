import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../config/app_environment.dart';

const physicalQaCampaignId = 'ios_physical_qa_v1';

/// Rules authorize the reserved document separately; the ordinary query never
/// includes it. A denied QA read is expected for unrelated staging accounts.
Stream<List<DocumentSnapshot<Map<String, dynamic>>>> marketplaceCampaigns(
  FirebaseFirestore firestore,
) {
  final campaigns = firestore.collection('campaigns');
  if (!AppEnvironmentConfig.isStaging) {
    return campaigns
        .where('status', isEqualTo: 'open')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((s) => s.docs);
  }
  late StreamController<List<DocumentSnapshot<Map<String, dynamic>>>>
  controller;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? normalSubscription;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? qaSubscription;
  List<DocumentSnapshot<Map<String, dynamic>>>? normal;
  DocumentSnapshot<Map<String, dynamic>>? qa;
  void emit() {
    if (normal == null || controller.isClosed) return;
    final result = [...normal!];
    if (qa?.exists == true && qa!.data()?['status'] == 'open') result.add(qa!);
    result.sort((a, b) {
      final at = a.data()?['createdAt'];
      final bt = b.data()?['createdAt'];
      return (bt is Timestamp ? bt.millisecondsSinceEpoch : 0).compareTo(
        at is Timestamp ? at.millisecondsSinceEpoch : 0,
      );
    });
    controller.add(result);
  }

  controller = StreamController(
    onListen: () {
      normalSubscription = campaigns
          .where('status', isEqualTo: 'open')
          .where(FieldPath.documentId, isNotEqualTo: physicalQaCampaignId)
          .snapshots()
          .listen((s) {
            normal = s.docs;
            emit();
          }, onError: controller.addError);
      qaSubscription = campaigns
          .doc(physicalQaCampaignId)
          .snapshots()
          .listen(
            (s) {
              qa = s;
              emit();
            },
            onError: (Object error, StackTrace stack) {
              if (error is FirebaseException &&
                  error.code == 'permission-denied') {
                qa = null;
                emit();
              } else {
                controller.addError(error, stack);
              }
            },
          );
    },
    onCancel: () async {
      await normalSubscription?.cancel();
      await qaSubscription?.cancel();
    },
  );
  return controller.stream;
}
