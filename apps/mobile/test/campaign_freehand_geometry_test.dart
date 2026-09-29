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
  test('more than eight local defects is bounded and requires redraw', () {
    final input = <(double, double)>[(0, 0)];
    for (var i = 1; i <= 9; i++) {
      input.addAll([(i * 10.0, 0), (i * 10.0 - 2, 0)]);
    }
    input.addAll([(100, 100), (0, 100)]);
    expect(
      CampaignFreehandGeometry.finish(polygon(input)).error,
      CampaignFreehandGeometry.unclearOutline,
    );
  });
  test(
    'small closing overshoot repairs without selecting a large alternate lobe',
    () {
      final trace = polygon([
        (0, 0),
        (100, 0),
        (100, 100),
        (0, 100),
        (-2, -2),
        (3, 0),
      ]);
      final result = CampaignFreehandGeometry.finish(trace, metersPerPixel: 2);
      expect(result.isValid, true);
      expect(result.wasRepaired, true);
      expect(result.areaSquareMeters, closeTo(10000, 150));
      expect(result.points.length, lessThanOrEqualTo(6));
      expect(
        CampaignFreehandGeometry.finish(
          result.points,
          repairMinorDefects: false,
        ).isValid,
        true,
      );
    },
  );
  test('short backtrack is repairable; a long retrace remains ambiguous', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([(0, 0), (100, 0), (98, 0), (100, 100), (0, 100)]),
    );
    expect(result.isValid, true);
    expect(result.wasRepaired, true);
    expect(result.areaSquareMeters, closeTo(9900, 2));
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 0), (70, 0), (100, 100), (0, 100)]),
      ).isValid,
      false,
    );
  });
  test(
    'endpoint gap closes directly without demanding first-pixel reconnection',
    () {
      final result = CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 0), (100, 100), (0, 100), (0, 2)]),
      );
      expect(result.isValid, true);
      expect(result.areaSquareMeters, closeTo(10000, 2));
    },
  );
  test('repair tolerance follows scale but never exceeds five metres', () {
    final trace = polygon([(0, 0), (100, 0), (98, 0), (100, 100), (0, 100)]);
    expect(
      CampaignFreehandGeometry.finish(trace, metersPerPixel: .1).isValid,
      false,
    );
    final result = CampaignFreehandGeometry.finish(trace, metersPerPixel: 200);
    expect(result.isValid, true);
    expect(result.repairToleranceMeters, 5);
    expect(
      CampaignFreehandGeometry.finish(
        polygon([(0, 0), (100, 0), (90, 0), (100, 100), (0, 100)]),
        metersPerPixel: 200,
      ).isValid,
      false,
    );
  });
  test(
    'strict validation does not auto-repair an existing or uploaded boundary',
    () {
      expect(
        CampaignFreehandGeometry.finish(
          polygon([(0, 0), (100, 0), (98, 0), (100, 100), (0, 100)]),
          repairMinorDefects: false,
        ).isValid,
        false,
      );
    },
  );
  test('unequal figure-eight does not silently keep its largest region', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([(0, 0), (300, 300), (0, 300), (70, 0)]),
    );
    expect(result.error, CampaignFreehandGeometry.unclearOutline);
  });
  test(
    'separated closed loops cannot become multiple Zones or a connecting hull',
    () {
      final result = CampaignFreehandGeometry.finish(
        polygon([
          (0, 0),
          (100, 0),
          (100, 100),
          (0, 100),
          (0, 0),
          (300, 0),
          (400, 0),
          (400, 100),
          (300, 100),
          (300, 0),
        ]),
      );
      expect(result.isValid, false);
      expect(result.points, isEmpty);
    },
  );
  test('barrier-shaped concavity survives repair on a different edge', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([
        (0, 0),
        (200, 0),
        (198, 0),
        (200, 200),
        (120, 200),
        (120, 80),
        (80, 80),
        (80, 200),
        (0, 200),
      ]),
    );
    expect(result.isValid, true);
    for (final corner in [
      point(120, 200),
      point(120, 80),
      point(80, 80),
      point(80, 200),
    ]) {
      expect(result.points, contains(corner));
    }
    expect(result.areaSquareMeters, lessThan(36000));
  });
  test(
    'local loop near a tiny area fails its relative region-change budget',
    () {
      final result = CampaignFreehandGeometry.finish(
        polygon([
          (0, 0),
          (12, 0),
          (12, 6),
          (15, 6),
          (15, 9),
          (12, 6),
          (12, 12),
          (0, 12),
        ]),
        metersPerPixel: 2,
      );
      expect(result.isValid, false);
    },
  );
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
    expect(result.error, CampaignFreehandGeometry.unclearOutline);
  });
  test('closing edge cannot retrace the first edge', () {
    final result = CampaignFreehandGeometry.finish(
      polygon([(0, 0), (100, 0), (100, 100), (0, 100), (50, 0)]),
    );
    expect(result.error, CampaignFreehandGeometry.unclearOutline);
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
      CampaignFreehandGeometry.unclearOutline,
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
  test('small loop is repaired into an explicit bounded preview', () {
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
    expect(result.isValid, isTrue);
    expect(result.wasRepaired, isTrue);
    expect(result.areaSquareMeters, closeTo(10000, 20));
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
