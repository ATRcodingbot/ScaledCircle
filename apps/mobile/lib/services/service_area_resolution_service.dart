import 'dart:math' as math;

import 'address_search_service.dart';

class ServiceAreaResolution {
  const ServiceAreaResolution({required this.data, required this.resolved});

  final Map<String, dynamic> data;
  final bool resolved;
}

/// Provider-neutral normalization boundary for reusable Business service areas.
class ServiceAreaResolutionService {
  const ServiceAreaResolutionService();

  ServiceAreaResolution fromKnownPlace({
    required AddressSuggestion suggestion,
    required String areaType,
  }) {
    final geometry = suggestion.geometry;
    return ServiceAreaResolution(
      resolved: geometry.length >= 3,
      data: {
        'areaType': areaType,
        'displayName': suggestion.fullAddress,
        'city': suggestion.city,
        'county': suggestion.county,
        'state': suggestion.state,
        'postalCode': suggestion.postalCode,
        'center': {
          'latitude': suggestion.latitude,
          'longitude': suggestion.longitude,
        },
        'bounds': suggestion.bounds,
        'geometry': geometry,
        'resolutionSource': suggestion.resolutionSource,
        'resolutionVersion': suggestion.resolutionVersion,
      },
    );
  }

  ServiceAreaResolution radius({
    required AddressSuggestion center,
    required double radiusMiles,
  }) {
    return radiusFromCoordinates(
      latitude: center.latitude,
      longitude: center.longitude,
      radiusMiles: radiusMiles,
      displayName: center.fullAddress,
      city: center.city,
      county: center.county,
      state: center.state,
      postalCode: center.postalCode,
      resolutionSource: center.resolutionSource,
    );
  }

  ServiceAreaResolution radiusFromCoordinates({
    required double latitude,
    required double longitude,
    required double radiusMiles,
    String displayName = '',
    String city = '',
    String county = '',
    String state = '',
    String postalCode = '',
    String resolutionSource = 'saved_center',
  }) {
    final geometry = List.generate(48, (index) {
      final angle = 2 * math.pi * index / 48;
      return <String, double>{
        'latitude': latitude + radiusMiles / 69 * math.sin(angle),
        'longitude':
            longitude +
            radiusMiles /
                (69 * math.cos(latitude * math.pi / 180)) *
                math.cos(angle),
      };
    });
    return ServiceAreaResolution(
      resolved: true,
      data: {
        'areaType': 'around_business',
        'displayName': displayName,
        'city': city,
        'county': county,
        'state': state,
        'postalCode': postalCode,
        'center': {'latitude': latitude, 'longitude': longitude},
        'radiusMiles': radiusMiles,
        'geometry': geometry,
        'resolutionSource': resolutionSource,
        'resolutionVersion': 'ServiceAreaResolutionV1',
      },
    );
  }
}
