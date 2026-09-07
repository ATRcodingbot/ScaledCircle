import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../config/app_environment.dart';

/// Discover IDs through server authority, then retain Rules-governed
/// document listeners. Revocation removes a record instead of retaining its data.
Stream<List<DocumentSnapshot<Map<String, dynamic>>>> assignedLocations(
  FirebaseFirestore firestore,
  String uid,
) {
  late StreamController<List<DocumentSnapshot<Map<String, dynamic>>>>
  controller;
  final subscriptions =
      <StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>>[];
  final records = <String, DocumentSnapshot<Map<String, dynamic>>>{};
  final pending = <String>{};
  var cancelled = false;
  void emit() {
    if (!cancelled && pending.isEmpty) controller.add(records.values.toList());
  }

  controller = StreamController(
    onListen: () async {
      try {
        final result = await FirebaseFunctions.instanceFor(region: 'us-east1')
            .httpsCallable(
              AppEnvironmentConfig.isStaging
                  ? 'listStagingAssignedLocationIds'
                  : 'listAssignedLocationIdsV1',
            )
            .call();
        if (cancelled) return;
        final ids = List<String>.from(
          (result.data as Map)['locationIds'] as List,
        );
        pending.addAll(ids);
        for (final id in ids) {
          subscriptions.add(
            firestore
                .collection('campaignLocations')
                .doc(id)
                .snapshots()
                .listen(
                  (record) {
                    pending.remove(id);
                    if (record.exists &&
                        record.data()?['assignedScalerId'] == uid &&
                        [
                          'assigned',
                          'in_progress',
                        ].contains(record.data()?['status'])) {
                      records[id] = record;
                    } else {
                      records.remove(id);
                    }
                    emit();
                  },
                  onError: (Object error, StackTrace stack) {
                    final previouslyVisible = records.containsKey(id);
                    pending.remove(id);
                    records.remove(id);
                    if (previouslyVisible &&
                        error is FirebaseException &&
                        error.code == 'permission-denied') {
                      emit(); // Revoke data that was previously authorized.
                    } else if (!cancelled) {
                      controller.addError(error, stack);
                    }
                  },
                ),
          );
        }
        emit();
      } catch (error, stack) {
        if (!cancelled) controller.addError(error, stack);
      }
    },
    onCancel: () async {
      cancelled = true;
      for (final subscription in subscriptions) {
        await subscription.cancel();
      }
    },
  );
  return controller.stream;
}
