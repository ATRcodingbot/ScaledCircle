import 'dart:convert';

import 'package:http/http.dart' as http;

class AddressSuggestion {
  const AddressSuggestion({
    required this.id,
    required this.primaryText,
    required this.secondaryText,
    required this.fullAddress,
    required this.latitude,
    required this.longitude,
    this.geometry = const [],
    this.bounds,
    this.placeType = '',
    this.city = '',
    this.county = '',
    this.state = '',
    this.postalCode = '',
    this.resolutionSource = 'openstreetmap_nominatim',
    this.resolutionVersion = 'ServiceAreaResolutionV1',
  });

  final String id;
  final String primaryText;
  final String secondaryText;
  final String fullAddress;
  final double latitude;
  final double longitude;
  final List<Map<String, double>> geometry;
  final Map<String, double>? bounds;
  final String placeType;
  final String city;
  final String county;
  final String state;
  final String postalCode;
  final String resolutionSource;
  final String resolutionVersion;

  bool get hasAuthoritativeBoundary => geometry.length >= 3;
}

class AddressSearchService {
  const AddressSearchService();

  static final Map<String, List<AddressSuggestion>> _cache = {};
  static DateTime? _lastRequestAt;

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

    final lastRequestAt = _lastRequestAt;
    if (lastRequestAt != null) {
      final elapsed = DateTime.now().difference(lastRequestAt);
      const minimumInterval = Duration(seconds: 1);
      if (elapsed < minimumInterval) {
        await Future<void>.delayed(minimumInterval - elapsed);
      }
    }
    _lastRequestAt = DateTime.now();

    final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
      'q': normalizedQuery,
      'format': 'jsonv2',
      'limit': '6',
      'countrycodes': 'us',
      'addressdetails': '1',
      'polygon_geojson': '1',
    });
    final response = await http.get(
      uri,
      headers: const {
        'User-Agent': 'ScaledCircle/1.0',
        'Accept': 'application/json',
      },
    );
    if (response.statusCode != 200) {
      throw Exception('Map search returned status ${response.statusCode}.');
    }

    final payload = jsonDecode(response.body);
    if (payload is! List) {
      return const [];
    }

    final suggestions = payload
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
    final latitude = double.tryParse(rawResult['lat']?.toString() ?? '');
    final longitude = double.tryParse(rawResult['lon']?.toString() ?? '');
    final fullAddress = rawResult['display_name']?.toString().trim() ?? '';
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

    final geometry = _geometry(rawResult['geojson']);
    final boundingBox = rawResult['boundingbox'];
    Map<String, double>? bounds;
    if (boundingBox is List && boundingBox.length >= 4) {
      final south = double.tryParse(boundingBox[0].toString());
      final north = double.tryParse(boundingBox[1].toString());
      final west = double.tryParse(boundingBox[2].toString());
      final east = double.tryParse(boundingBox[3].toString());
      if (south != null && north != null && west != null && east != null) {
        bounds = {'south': south, 'north': north, 'west': west, 'east': east};
      }
    }

    return AddressSuggestion(
      id: '${rawResult['osm_type']}-${rawResult['osm_id']}',
      primaryText: resolvedPrimary,
      secondaryText: secondaryText,
      fullAddress: fullAddress,
      latitude: latitude,
      longitude: longitude,
      geometry: geometry,
      bounds: bounds,
      placeType: rawResult['type']?.toString() ?? '',
      city:
          addressMap['city']?.toString() ??
          addressMap['town']?.toString() ??
          addressMap['village']?.toString() ??
          '',
      county: addressMap['county']?.toString() ?? '',
      state: addressMap['state']?.toString() ?? '',
      postalCode: addressMap['postcode']?.toString() ?? '',
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
