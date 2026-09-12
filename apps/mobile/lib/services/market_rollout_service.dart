import 'package:cloud_functions/cloud_functions.dart';

class MarketRolloutService {
  static Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic>? data,
  ]) async {
    final result = await FirebaseFunctions.instanceFor(
      region: 'us-east1',
    ).httpsCallable(name).call(data).timeout(const Duration(seconds: 20));
    return Map<String, dynamic>.from(result.data as Map);
  }

  static Future<Map<String, dynamic>> load() => call('getMarketProfileV1');
  static Future<Map<String, dynamic>> catalog() => call('getMarketStatesV1');
  static Future<Map<String, dynamic>> save(
    String stateId,
    bool notifications,
  ) => call('saveMarketProfileV1', {
    'stateId': stateId,
    'launchNotifications': notifications,
  });
  static Future<Map<String, dynamic>> admin(Map<String, dynamic> data) =>
      call('adminMarketRolloutV1', data);
}
