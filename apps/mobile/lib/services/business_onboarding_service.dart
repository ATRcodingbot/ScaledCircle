import 'package:cloud_functions/cloud_functions.dart';
import '../config/app_environment.dart';

class BusinessOnboardingService {
  Future<Map<String, dynamic>> load() => _call('getBusinessOnboarding', {});
  Future<Map<String, dynamic>> save(Map<String, dynamic> profile) =>
      _call('saveBusinessOnboarding', {'profile': profile});
  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> data,
  ) async {
    final result = await FirebaseFunctions.instanceFor(
      region: AppEnvironmentConfig.functionsRegion,
    ).httpsCallable(name).call(data).timeout(const Duration(seconds: 20));
    return Map<String, dynamic>.from(result.data as Map);
  }
}
