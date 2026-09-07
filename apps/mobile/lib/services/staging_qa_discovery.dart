import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../config/app_environment.dart';

String get scalerCampaignCollection =>
    AppEnvironmentConfig.isStaging ? 'campaignDiscovery' : 'campaigns';

const physicalQaCampaignIds = [
  'ios_physical_qa_v1',
  'android_physical_qa_v1',
  'ios_physical_qa_v2',
  'android_physical_qa_v2',
];

/// Rules authorize the reserved document separately; the ordinary query never
/// includes it. A denied QA read is expected for unrelated staging accounts.
Stream<List<DocumentSnapshot<Map<String, dynamic>>>> marketplaceCampaigns(
  FirebaseFirestore firestore,
) {
  final campaigns = firestore.collection(scalerCampaignCollection);
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
  final qaSubscriptions =
      <StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>>[];
  List<DocumentSnapshot<Map<String, dynamic>>>? normal;
  final qa = <String, DocumentSnapshot<Map<String, dynamic>>>{};
  void emit() {
    if (normal == null || controller.isClosed) return;
    final result = [...normal!];
    for (final item in qa.values) {
      if (item.exists && item.data()?['status'] == 'open') result.add(item);
    }
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
          .where(FieldPath.documentId, whereNotIn: physicalQaCampaignIds)
          .snapshots()
          .listen((s) {
            normal = s.docs;
            emit();
          }, onError: controller.addError);
      for (final campaignId in physicalQaCampaignIds) {
        qaSubscriptions.add(
          campaigns
              .doc(campaignId)
              .snapshots()
              .listen(
                (s) {
                  qa[campaignId] = s;
                  emit();
                },
                onError: (Object error, StackTrace stack) {
                  if (error is FirebaseException &&
                      error.code == 'permission-denied') {
                    qa.remove(campaignId);
                    emit();
                  } else {
                    controller.addError(error, stack);
                  }
                },
              ),
        );
      }
    },
    onCancel: () async {
      await normalSubscription?.cancel();
      await Future.wait(qaSubscriptions.map((s) => s.cancel()));
    },
  );
  return controller.stream;
}
