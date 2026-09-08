import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_app/models/route_visualization.dart';
import 'package:flutter_app/models/tracking_models.dart';
import 'package:flutter_app/widgets/active_route_guidance.dart';

TrackingLocationSample fix(
  int second,
  double latitude, {
  double accuracy = 8,
}) => TrackingLocationSample(
  sequence: second + 1,
  latitude: latitude,
  longitude: 0.0005,
  recordedAt: DateTime.utc(2026, 1, 1).add(Duration(seconds: second)),
  horizontalAccuracy: accuracy,
  accepted: true,
);
void main() {
  const line = [LatLng(0, 0), LatLng(0, .001)];
  test(
    'single noisy fix is not an off-route warning; sustained useful fixes are',
    () {
      final tracker = RouteDeviationTracker();
      expect(
        tracker.update(fix(0, .0004), line),
        RoutePositionHint.accuracyAdjusting,
      );
      expect(tracker.update(fix(1, .0001), line), RoutePositionHint.none);
      expect(
        tracker.update(fix(10, .0004), line),
        RoutePositionHint.accuracyAdjusting,
      );
      expect(
        tracker.update(fix(25, .0004), line),
        RoutePositionHint.accuracyAdjusting,
      );
      expect(tracker.update(fix(40, .0004), line), RoutePositionHint.offRoute);
      expect(tracker.update(fix(41, .0001), line), RoutePositionHint.none);
    },
  );
  test(
    'poor accuracy, replayed fixes and long gaps cannot accumulate alarm',
    () {
      final tracker = RouteDeviationTracker();
      for (final second in [0, 20, 40]) {
        expect(
          tracker.update(fix(second, .0006, accuracy: 60), line),
          RoutePositionHint.accuracyAdjusting,
        );
      }
      expect(
        tracker.update(fix(60, .0005), line),
        RoutePositionHint.accuracyAdjusting,
      );
      expect(
        tracker.update(fix(60, .0005), line),
        RoutePositionHint.accuracyAdjusting,
      );
      expect(
        tracker.update(fix(120, .0005), line),
        RoutePositionHint.accuracyAdjusting,
      );
    },
  );
  test(
    'render simplification preserves input, endpoints and max3m deviation',
    () {
      final raw = [
        const LatLng(0, 0),
        const LatLng(.00001, .0001),
        const LatLng(0, .0002),
        const LatLng(.00001, .0003),
        const LatLng(0, .0004),
      ];
      final before = List<LatLng>.of(raw), shown = displayRoute(raw);
      expect(raw, before);
      expect(identical(raw, shown), false);
      expect(shown.first, raw.first);
      expect(shown.last, raw.last);
      expect(shown.length, lessThan(raw.length));
      for (final p in raw) {
        expect(
          routeSegmentDistance(p, shown.first, shown.last),
          lessThanOrEqualTo(3),
        );
      }
      expect(displayRoute([line.first, line.last]).length, 2);
    },
  );
  testWidgets(
    'canvassing map contains no manual checkpoint instructions or legend',
    (t) async {
      await t.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ActiveRouteGuidance(
              zone: {
                'executionRoute': {
                  'instructions': [
                    'Follow the public route',
                    'GPS Checkpoint: private fixture label',
                  ],
                  'checkpoints': [
                    {'label': 'Turnaround'},
                  ],
                },
              },
              location: null,
              progress: null,
              automaticGps: true,
              tilesEnabled: false,
            ),
          ),
        ),
      );
      expect(find.textContaining('GPS Checkpoint'), findsNothing);
      expect(find.textContaining('GPS checkpoint'), findsNothing);
      expect(find.textContaining('Purple:'), findsNothing);
      expect(find.text('Follow the public route'), findsOneWidget);
    },
  );
}
