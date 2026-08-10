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
  });

  final String id;
  final String primaryText;
  final String secondaryText;
  final String fullAddress;
  final double latitude;
  final double longitude;
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
        .map(_parseSuggestion)
        .whereType<AddressSuggestion>()
        .toList(growable: false);
    _cache[cacheKey] = suggestions;
    return suggestions;
  }

  AddressSuggestion? _parseSuggestion(dynamic rawResult) {
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

    return AddressSuggestion(
      id: '${rawResult['osm_type']}-${rawResult['osm_id']}',
      primaryText: resolvedPrimary,
      secondaryText: secondaryText,
      fullAddress: fullAddress,
      latitude: latitude,
      longitude: longitude,
    );
  }
}
