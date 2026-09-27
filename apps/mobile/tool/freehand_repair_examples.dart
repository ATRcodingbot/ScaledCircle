// Synthetic review evidence only. No map provider, app session or persistence.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:latlong2/latlong.dart';
import 'package:flutter_app/models/campaign_freehand_geometry.dart';

void main(List<String> args) {
  final xScale = 111195 * math.cos(39.16 * math.pi / 180);
  final examples = {
    'Small closing overshoot': [
      (0.0, 0.0),
      (100.0, 0.0),
      (100.0, 100.0),
      (0.0, 100.0),
      (-2.0, -2.0),
      (3.0, 0.0),
    ],
    'Small crossing loop': [
      (0.0, 0.0),
      (100.0, 0.0),
      (100.0, 50.0),
      (103.0, 53.0),
      (100.0, 53.0),
      (103.0, 50.0),
      (100.0, 60.0),
      (100.0, 100.0),
      (0.0, 100.0),
    ],
    'Short backtrack beside concavity': [
      (0.0, 0.0),
      (200.0, 0.0),
      (198.0, 0.0),
      (200.0, 200.0),
      (120.0, 200.0),
      (120.0, 80.0),
      (80.0, 80.0),
      (80.0, 200.0),
      (0.0, 200.0),
    ],
    'Substantial figure-eight': [
      (0.0, 0.0),
      (100.0, 100.0),
      (0.0, 100.0),
      (100.0, 0.0),
    ],
  };
  final output = examples.entries.map((entry) {
    final input = entry.value
        .map((p) => LatLng(39.16 + p.$2 / 111195, -76.62 + p.$1 / xScale))
        .toList();
    final result = CampaignFreehandGeometry.finish(input, metersPerPixel: 2);
    return {
      'name': entry.key,
      'synthetic': true,
      'rawMeters': entry.value.map((p) => [p.$1, p.$2]).toList(),
      'previewMeters': result.points
          .map(
            (p) => [
              (p.longitude + 76.62) * xScale,
              (p.latitude - 39.16) * 111195,
            ],
          )
          .toList(),
      'valid': result.isValid,
      'repairedDefects': result.repairedDefects,
      'areaSquareMeters': result.areaSquareMeters,
      'repairToleranceMeters': result.repairToleranceMeters,
      'error': result.error,
    };
  }).toList();
  File(args.single).writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(output)}\n',
  );
}
