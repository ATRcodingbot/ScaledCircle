import 'package:cloud_functions/cloud_functions.dart';
import '../config/app_environment.dart';
import 'address_search_service.dart';

class BusinessOnboardingService {
  Future<Map<String, dynamic>> load() => _call('getBusinessOnboarding', {});
  Future<Map<String, dynamic>> save(Map<String, dynamic> input) {
    final profile = Map<String, dynamic>.from(input);
    final geography = profile.remove('geography');
    return _call('saveBusinessOnboarding', {
      'profile': profile,
      'geography': ?geography,
    });
  }

  Future<List<AddressSuggestion>> searchPlaces(
    String query,
    bool serviceArea,
  ) async {
    final result = await _call('searchBusinessProfilePlaces', {
      'query': query,
      'kind': serviceArea ? 'service_area' : 'base',
    });
    return (result['results'] as List? ?? [])
        .map(AddressSearchService.parseSuggestion)
        .whereType<AddressSuggestion>()
        .toList();
  }

  Future<List<Map<String, dynamic>>> serviceAreaSuggestions() async {
    final result = await _call('getBusinessServiceAreaSuggestions', {});
    return (result['areas'] as List? ?? [])
        .whereType<Map>()
        .map((area) => Map<String, dynamic>.from(area))
        .toList();
  }

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
