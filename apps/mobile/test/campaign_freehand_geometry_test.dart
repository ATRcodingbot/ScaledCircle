import 'dart:math' as math;
import 'package:flutter_app/models/campaign_freehand_geometry.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

LatLng point(double x, double y) => LatLng(
  39.16 + y / 111195,
  -76.62 + x / (111195 * math.cos(39.16 * math.pi / 180)),
);
List<LatLng> polygon(List<(double, double)> values) =>
    values.map((p) => point(p.$1, p.$2)).toList();
void main() {
  test('implicit closing edge cannot cross an otherwise simple open trace', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([
        (0, 0),
        (100, 0),
        (100, 100),
        (20, 100),
        (20, 20),
        (80, 20),
        (80, 90),
      ]),
    );
    expect(result.error, contains('crosses'));
  });
  test('closing edge cannot retrace the first edge', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([(0, 0), (100, 0), (100, 100), (0, 100), (50, 0)]),
    );
    expect(result.error, contains('crosses'));
  });
  test(
    'closes a concave neighborhood trace without angle sorting or a hull',
    () {
      final trace = polygon([
        (0, 0),
        (200, 0),
        (200, 200),
        (120, 200),
        (120, 80),
        (80, 80),
        (80, 200),
        (0, 200),
      ]);
      final result = CampaignFreehandGeometry.finish(trace);
      expect(result.isValid, isTrue);
      expect(result.points, trace);
      expect(result.areaSquareMeters, closeTo(35200, 2));
    },
  );
  test('smooth dense finger sampling reduces points and preserves area', () {
    final trace = List.generate(1500, (i) {
      final a = 2 * math.pi * i / 1499;
      final radius = 200 + .1 * math.sin(i * 2);
      return point(radius * math.cos(a), radius * math.sin(a));
    });
    final result = CampaignFreehandGeometry.finish(trace);
    expect(result.isValid, isTrue);
    expect(result.points.length, lessThanOrEqualTo(100));
    expect(
      result.areaSquareMeters,
      closeTo(math.pi * 40000, math.pi * 40000 * .02),
    );
    expect(result.simplificationToleranceMeters, lessThanOrEqualTo(5));
  });
  test(
    'duplicate consecutive samples and explicit closing sample are harmless',
    () {
      final trace = polygon([
        (0, 0),
        (0, 0),
        (.1, 0),
        (100, 0),
        (100, 100),
        (0, 100),
        (0, 0),
      ]);
      final result = CampaignFreehandGeometry.finish(trace);
      expect(result.isValid, isTrue);
      expect(result.points.length, 4);
    },
  );
  test('meaningful crossings are rejected rather than reshaped', () {
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 100), (0, 100), (100, 0)]),
      ).error,
      contains('crosses'),
    );
  });
  test('a repeated edge or nonadjacent duplicate point is rejected', () {
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 0), (50, 0), (100, 100), (0, 100)]),
      ).isValid,
      isFalse,
    );
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 0), (100, 100), (100, 0), (0, 100)]),
      ).isValid,
      isFalse,
    );
  });
  test('accidental small loop larger than jitter is not silently erased', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([
        (0, 0),
        (100, 0),
        (100, 50),
        (103, 53),
        (100, 53),
        (103, 50),
        (100, 60),
        (100, 100),
        (0, 100),
      ]),
    );
    expect(result.isValid, isFalse);
  });
  test('small territory and zero-length trace fail closed', () {
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (5, 0), (5, 5), (0, 5)]),
      ).error,
      contains('100 m²'),
    );
    expect(
      CampaignFreehandGeometry.finish([
        point(0, 0),
        point(0, 0),
        point(0, 0),
      ]).isValid,
      isFalse,
    );
  });
  test(
    'manual size ceiling is separate from the 25km² intelligence query limit',
    () {
      expect(
        CampaignFreehandGeometry.finish(
          polygon([(0, 0), (9000, 0), (9000, 9000), (0, 9000)]),
        ).isValid,
        isTrue,
      );
      expect(
        CampaignFreehandGeometry.finish(
          polygon([(0, 0), (11000, 0), (11000, 11000), (0, 11000)]),
        ).error,
        contains('100 km²'),
      );
    },
  );
  test('invalid coordinates, date-line and non-local extent fail safely', () {
    expect(
      CampaignFreehandGeometry.finish([
        const LatLng(39, 179.9),
        const LatLng(39, -179.9),
        const LatLng(39.1, 179.9),
      ]).error,
      contains('date line'),
    );
    expect(
      CampaignFreehandGeometry.finish([
        const LatLng(39, -76),
        const LatLng(40, -76),
        const LatLng(39, -75),
      ]).error,
      contains('local territory'),
    );
    expect(
      CampaignFreehandGeometry.finish([
        LatLng(double.nan, -76),
        point(1, 1),
        point(3, 3),
      ]).isValid,
      isFalse,
    );
  });
  test('raw sample limit is bounded before topology work', () {
    expect(
      CampaignFreehandGeometry.finish(List.filled(2049, point(0, 0))).error,
      contains('too detailed'),
    );
  });
  test(
    'excess irreducible vertices require redraw rather than aggressive smoothing',
    () {
      final trace = List.generate(240, (i) {
        final a = 2 * math.pi * i / 240, r = i.isEven ? 400.0 : 420.0;
        return point(r * math.cos(a), r * math.sin(a));
      });
      final result = CampaignFreehandGeometry.finish(trace);
      expect(result.isValid, isFalse);
      expect(result.error, contains('has not been replaced'));
    },
  );
  test('clockwise direction and original input remain intact', () {
    final trace = polygon([(0, 0), (0, 200), (200, 200), (200, 0)]),
        copy = List<LatLng>.of(
          polygon([(0, 0), (0, 200), (200, 200), (200, 0)]),
        );
    final result = CampaignFreehandGeometry.finish(trace);
    expect(result.isValid, isTrue);
    expect(result.points, copy);
    expect(trace, copy);
  });
}
