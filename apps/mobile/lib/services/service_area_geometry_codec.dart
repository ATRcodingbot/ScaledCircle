class ServiceAreaGeometryCodec {
  static const encoding = 'map-parts-v1';

  static Map<String, dynamic> decodePreferences(Map<String, dynamic> input) {
    final output = Map<String, dynamic>.from(input)..remove('geometryEncoding');
    output['areas'] = (input['areas'] as List? ?? const [])
        .whereType<Map>()
        .map((area) => decodeArea(Map<String, dynamic>.from(area)))
        .toList(growable: false);
    return output;
  }

  static Map<String, dynamic> decodeArea(Map<String, dynamic> area) {
    final output = Map<String, dynamic>.from(area)..remove('geometryEncoding');
    final geometry = _points(area['geometry']);
    final parts = (area['geometryParts'] as List? ?? const [])
        .map(_points)
        .where((part) => part.length >= 3)
        .toList(growable: false);
    output['geometry'] = geometry;
    output['geometryParts'] = parts.isNotEmpty
        ? parts
        : geometry.length >= 3
        ? [geometry]
        : <List<Map<String, dynamic>>>[];
    return output;
  }

  static List<Map<String, dynamic>> _points(Object? value) {
    final raw = value is Map ? value['points'] : value;
    return (raw as List? ?? const [])
        .whereType<Map>()
        .map((point) => Map<String, dynamic>.from(point))
        .where((point) => point['latitude'] is num && point['longitude'] is num)
        .toList(growable: false);
  }
}
