import 'package:cloud_functions/cloud_functions.dart';

abstract interface class TrackingPhoneGateway {
  Future<Map<String, dynamic>> workspace();
}

class TrackingPhoneService implements TrackingPhoneGateway {
  TrackingPhoneService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  @override
  Future<Map<String, dynamic>> workspace() async {
    final result = await _functions
        .httpsCallable('getTrackingPhoneWorkspace')
        .call<Map<Object?, Object?>>(const {});
    return Map<String, dynamic>.from(result.data);
  }
}
