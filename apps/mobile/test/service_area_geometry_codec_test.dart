import 'package:flutter_app/services/service_area_geometry_codec.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const ring = [
    {'latitude': 38.8, 'longitude': -76.8},
    {'latitude': 39.2, 'longitude': -76.8},
    {'latitude': 39.2, 'longitude': -76.4},
  ];

  test('decodes map-parts storage to the existing runtime model', () {
    final decoded = ServiceAreaGeometryCodec.decodePreferences({
      'geometryEncoding': ServiceAreaGeometryCodec.encoding,
      'areas': [
        {
          'id': 'anne-arundel',
          'geometryEncoding': ServiceAreaGeometryCodec.encoding,
          'geometry': {'points': ring},
          'geometryParts': [
            {'points': ring},
          ],
        },
      ],
    });
    final area = (decoded['areas'] as List).single as Map<String, dynamic>;
    expect(area['geometry'], hasLength(3));
    expect(area['geometryParts'], hasLength(1));
    expect((area['geometryParts'] as List).single, hasLength(3));
    expect(area.containsKey('geometryEncoding'), isFalse);
  });

  test('legacy geometry derives one runtime part without rewriting storage', () {
    final decoded = ServiceAreaGeometryCodec.decodeArea({'geometry': ring});
    expect(decoded['geometryParts'], hasLength(1));
  });
}
