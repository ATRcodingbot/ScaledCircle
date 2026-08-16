import 'dart:io';

import 'package:flutter_app/services/property_area_context_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

void main() {
  const service = PropertyAreaContextService();

  test('My Service Areas resolves the selected saved polygon', () {
    final areas = service.resolveEnabledAreas({
      'areas': [
        {
          'id': 'area-a',
          'name': 'Main Service Area',
          'type': 'drawn',
          'enabled': true,
          'geometry': [
            {'latitude': 39.0, 'longitude': -76.6},
            {'latitude': 39.1, 'longitude': -76.5},
            {'latitude': 38.9, 'longitude': -76.4},
          ],
        },
        {
          'id': 'disabled',
          'name': 'Disabled Area',
          'type': 'drawn',
          'enabled': false,
          'geometry': [
            {'latitude': 1, 'longitude': 1},
            {'latitude': 2, 'longitude': 1},
            {'latitude': 1, 'longitude': 2},
          ],
        },
      ],
    });
    expect(areas, hasLength(1));
    expect(areas.single.id, 'area-a');
    expect(areas.single.name, 'Main Service Area');
    expect(areas.single.polygon, hasLength(3));
  });

  test('saved radius reconstructs geometry without changing preferences', () {
    final input = {
      'id': 'radius-a',
      'name': 'Annapolis Radius',
      'type': 'around_business',
      'radiusMiles': 30,
      'center': {'latitude': 38.9784, 'longitude': -76.4922},
    };
    final before = input.toString();
    final area = service.resolve(input)!;
    expect(area.polygon, hasLength(48));
    expect(input.toString(), before);
  });

  test('Explore Anywhere permits Area B outside saved Area A', () {
    final saved = service.resolve({
      'id': 'area-a',
      'name': 'Area A',
      'type': 'drawn',
      'geometry': [
        {'latitude': 39.0, 'longitude': -76.6},
        {'latitude': 39.1, 'longitude': -76.5},
        {'latitude': 38.9, 'longitude': -76.4},
      ],
    })!;
    const areaB = [
      LatLng(38.97, -76.0),
      LatLng(39.02, -75.95),
      LatLng(38.92, -75.9),
    ];
    expect(service.overlapsSavedArea(areaB, [saved]), isFalse);
    final source = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
    expect(source, contains('_exploreAnywhere'));
    expect(source, contains('_area = []'));
    expect(source, contains('manual exploration is always available'));
    expect(source, contains(r"'Analyzing: $_selectedSavedAreaName'"));
  });
}
