import 'package:firebase_auth/firebase_auth.dart';
import 'business_workspace_service.dart';
import 'package:cloud_functions/cloud_functions.dart';

class WeatherMonitoringService {
  Future<Map<String, dynamic>> call(
    String operation, {
    Map<String, dynamic>? preferences,
    String? alertId,
  }) async {
    final result = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable('weatherWorkspaceV1')
        .call({
          'operation': operation,
          'businessId': BusinessWorkspaceSession.businessIdFor(
            FirebaseAuth.instance.currentUser!.uid,
          ),
          'preferences': ?preferences,
          'alertId': ?alertId,
        });
    return Map<String, dynamic>.from(result.data as Map);
  }
}
