import 'package:cloud_functions/cloud_functions.dart';

class AddressSuggestion {
  const AddressSuggestion({
    required this.id,
    required this.primaryText,
    required this.secondaryText,
    required this.fullAddress,
    required this.latitude,
    required this.longitude,
    this.geometry = const [],
    this.geometryParts = const [],
    this.bounds,
    this.placeType = '',
    this.city = '',
    this.county = '',
    this.state = '',
    this.postalCode = '',
    this.resolutionSource = 'openstreetmap_nominatim',
    this.resolutionVersion = 'ServiceAreaResolutionV2',
    this.geometryType = '',
    this.geographyType = '',
    this.geographicId = '',
    this.sourceVintage = '',
  });

  final String id;
  final String primaryText;
  final String secondaryText;
  final String fullAddress;
  final double latitude;
  final double longitude;
  final List<Map<String, double>> geometry;
  final List<List<Map<String, double>>> geometryParts;
  final Map<String, double>? bounds;
  final String placeType;
  final String city;
  final String county;
  final String state;
  final String postalCode;
  final String resolutionSource;
  final String resolutionVersion;
  final String geometryType;
  final String geographyType;
  final String geographicId;
  final String sourceVintage;

  bool get hasAuthoritativeBoundary => geometry.length >= 3;
}

class AddressSearchService {
  AddressSearchService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  static final Map<String, List<AddressSuggestion>> _cache = {};

  Future<List<AddressSuggestion>> search(String query) async {
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty) {
      return const [];
    }

    final cacheKey = normalizedQuery.toLowerCase();
    final cached = _cache[cacheKey];
    if (cached != null) {
      return cached;
    }

    final response = await _functions
        .httpsCallable('resolveServiceAreaPlace')
        .call(<String, dynamic>{'query': normalizedQuery});
    final payload = response.data;
    if (payload is! Map || payload['results'] is! List) {
      return const [];
    }

    final suggestions = (payload['results'] as List)
        .map(parseSuggestion)
        .whereType<AddressSuggestion>()
        .toList(growable: false);
    _cache[cacheKey] = suggestions;
    return suggestions;
  }

  static AddressSuggestion? parseSuggestion(dynamic rawResult) {
    if (rawResult is! Map) {
      return null;
    }
    final latitude = double.tryParse(
      (rawResult['latitude'] ?? rawResult['lat'])?.toString() ?? '',
    );
    final longitude = double.tryParse(
      (rawResult['longitude'] ?? rawResult['lon'])?.toString() ?? '',
    );
    final fullAddress =
        (rawResult['fullAddress'] ?? rawResult['display_name'])
            ?.toString()
            .trim() ??
        '';
    if (latitude == null || longitude == null || fullAddress.isEmpty) {
      return null;
    }

    final address = rawResult['address'];
    final addressMap = address is Map ? address : const {};
    final houseNumber = addressMap['house_number']?.toString().trim() ?? '';
    final road = addressMap['road']?.toString().trim() ?? '';
    final name = rawResult['name']?.toString().trim() ?? '';
    final primaryText = [
      if (houseNumber.isNotEmpty) houseNumber,
      if (road.isNotEmpty) road,
    ].join(' ').trim();
    final resolvedPrimary = primaryText.isNotEmpty
        ? primaryText
        : name.isNotEmpty
        ? name
        : fullAddress.split(',').first.trim();
    final secondaryText = fullAddress.startsWith('$resolvedPrimary, ')
        ? fullAddress.substring(resolvedPrimary.length + 2)
        : fullAddress;

    final geometry = rawResult['geometry'] is List
        ? (rawResult['geometry'] as List)
              .whereType<Map>()
              .map(
                (point) => <String, double>{
                  'latitude': (point['latitude'] as num).toDouble(),
                  'longitude': (point['longitude'] as num).toDouble(),
                },
              )
              .toList(growable: false)
        : _geometry(rawResult['geojson']);
    final geometryParts = rawResult['geometryParts'] is List
        ? (rawResult['geometryParts'] as List)
              .whereType<List>()
              .map(
                (part) => part
                    .whereType<Map>()
                    .map(
                      (point) => <String, double>{
                        'latitude': (point['latitude'] as num).toDouble(),
                        'longitude': (point['longitude'] as num).toDouble(),
                      },
                    )
                    .toList(growable: false),
              )
              .where((part) => part.length >= 3)
              .toList(growable: false)
        : <List<Map<String, double>>>[if (geometry.length >= 3) geometry];
    final boundingBox = rawResult['boundingbox'];
    Map<String, double>? bounds;
    if (rawResult['bounds'] is Map) {
      final rawBounds = rawResult['bounds'] as Map;
      bounds = <String, double>{
        for (final key in const ['south', 'north', 'west', 'east'])
          key: (rawBounds[key] as num).toDouble(),
      };
    } else if (boundingBox is List && boundingBox.length >= 4) {
      final south = double.tryParse(boundingBox[0].toString());
      final north = double.tryParse(boundingBox[1].toString());
      final west = double.tryParse(boundingBox[2].toString());
      final east = double.tryParse(boundingBox[3].toString());
      if (south != null && north != null && west != null && east != null) {
        bounds = {'south': south, 'north': north, 'west': west, 'east': east};
      }
    }

    return AddressSuggestion(
      id:
          rawResult['id']?.toString() ??
          '${rawResult['osm_type']}-${rawResult['osm_id']}',
      primaryText: rawResult['primaryText']?.toString() ?? resolvedPrimary,
      secondaryText: rawResult['secondaryText']?.toString() ?? secondaryText,
      fullAddress: fullAddress,
      latitude: latitude,
      longitude: longitude,
      geometry: geometry,
      geometryParts: geometryParts,
      bounds: bounds,
      placeType:
          (rawResult['placeType'] ?? rawResult['type'])?.toString() ?? '',
      city:
          rawResult['city']?.toString() ??
          addressMap['city']?.toString() ??
          addressMap['town']?.toString() ??
          addressMap['village']?.toString() ??
          '',
      county:
          rawResult['county']?.toString() ??
          addressMap['county']?.toString() ??
          '',
      state:
          rawResult['state']?.toString() ??
          addressMap['state']?.toString() ??
          '',
      postalCode:
          rawResult['postalCode']?.toString() ??
          addressMap['postcode']?.toString() ??
          '',
      resolutionSource:
          rawResult['resolutionSource']?.toString() ??
          'openstreetmap_nominatim',
      resolutionVersion:
          rawResult['resolutionVersion']?.toString() ??
          'ServiceAreaResolutionV2',
      geometryType: rawResult['geometryType']?.toString() ?? '',
      geographyType: rawResult['geographyType']?.toString() ?? '',
      geographicId: rawResult['geographicId']?.toString() ?? '',
      sourceVintage: rawResult['sourceVintage']?.toString() ?? '',
    );
  }

  static List<Map<String, double>> _geometry(dynamic rawGeoJson) {
    if (rawGeoJson is! Map) return const [];
    final type = rawGeoJson['type']?.toString();
    final coordinates = rawGeoJson['coordinates'];
    dynamic ring;
    if (type == 'Polygon' && coordinates is List && coordinates.isNotEmpty) {
      ring = coordinates.first;
    } else if (type == 'MultiPolygon' &&
        coordinates is List &&
        coordinates.isNotEmpty &&
        coordinates.first is List &&
        (coordinates.first as List).isNotEmpty) {
      ring = (coordinates.first as List).first;
    }
    if (ring is! List) return const [];
    final points = ring
        .whereType<List>()
        .map((coordinate) {
          if (coordinate.length < 2) return null;
          final longitude = (coordinate[0] as num?)?.toDouble();
          final latitude = (coordinate[1] as num?)?.toDouble();
          if (latitude == null || longitude == null) return null;
          return {'latitude': latitude, 'longitude': longitude};
        })
        .whereType<Map<String, double>>()
        .toList(growable: false);
    if (points.length < 3) return const [];
    if (points.length <= 100) return points;
    final step = (points.length / 99).ceil();
    final reduced = <Map<String, double>>[
      for (var index = 0; index < points.length; index += step) points[index],
    ];
    if (reduced.last != points.last) reduced.add(points.last);
    return reduced.take(100).toList(growable: false);
  }
}
