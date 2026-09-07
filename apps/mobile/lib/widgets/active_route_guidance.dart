import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../models/tracking_models.dart';

List<LatLng> routeCoordinates(dynamic raw) => raw is List
    ? raw
          .whereType<Map>()
          .where((p) => p['latitude'] is num && p['longitude'] is num)
          .map(
            (p) => LatLng(
              (p['latitude'] as num).toDouble(),
              (p['longitude'] as num).toDouble(),
            ),
          )
          .toList()
    : const [];

bool positionInsideCorridor(LatLng point, List<LatLng> polygon) {
  bool inside = false;
  for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    final a = polygon[i], b = polygon[j];
    if ((a.latitude > point.latitude) != (b.latitude > point.latitude) &&
        point.longitude <
            (b.longitude - a.longitude) *
                    (point.latitude - a.latitude) /
                    (b.latitude - a.latitude) +
                a.longitude) {
      inside = !inside;
    }
  }
  return inside;
}

class ActiveRouteGuidance extends StatelessWidget {
  const ActiveRouteGuidance({
    super.key,
    required this.zone,
    required this.location,
    required this.progress,
    this.tilesEnabled = true,
  });
  final Map<String, dynamic> zone;
  final TrackingLocationSample? location;
  final Map<String, dynamic>? progress;
  final bool tilesEnabled;
  @override
  Widget build(BuildContext context) {
    final corridor = routeCoordinates(zone['serviceArea']);
    final route = zone['executionRoute'] is Map
        ? zone['executionRoute'] as Map
        : const {};
    final line = routeCoordinates(route['centerline']);
    final walked = routeCoordinates(progress?['path']);
    final current = location == null
        ? null
        : LatLng(location!.latitude, location!.longitude);
    final known =
        progress?['state'] == 'available' &&
        progress?['coveragePercentage'] is num;
    final percent = known
        ? (progress!['coveragePercentage'] as num).toStringAsFixed(1)
        : null;
    final checkpoints = route['checkpoints'] is List
        ? route['checkpoints'] as List
        : const [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Assigned walking area',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(
              known
                  ? '$percent% route coverage · server-calculated, provisional'
                  : 'Route coverage: ${progress?['state'] == 'unavailable' ? 'UNKNOWN' : 'CALCULATING'}',
            ),
            const Text(
              'Coverage uses uploaded GPS evidence. Final payment is determined after submission and review.',
            ),
            if (current != null &&
                corridor.length >= 3 &&
                !positionInsideCorridor(current, corridor))
              const Text(
                'Your GPS position is outside the assigned corridor. Check the map and GPS accuracy.',
                style: TextStyle(color: Colors.deepOrange),
              ),
            if (corridor.length >= 3)
              SizedBox(
                height: 300,
                child: FlutterMap(
                  options: MapOptions(
                    initialCameraFit: CameraFit.bounds(
                      bounds: LatLngBounds.fromPoints(corridor),
                      padding: const EdgeInsets.all(24),
                      maxZoom: 18,
                    ),
                  ),
                  children: [
                    if (tilesEnabled)
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.scaledcircle.app',
                      ),
                    PolygonLayer(
                      polygons: [
                        Polygon(
                          points: corridor,
                          color: Colors.blue.withValues(alpha: .12),
                          borderColor: Colors.blue,
                          borderStrokeWidth: 2,
                        ),
                      ],
                    ),
                    PolylineLayer(
                      polylines: [
                        if (line.length > 1)
                          Polyline(
                            points: line,
                            color: Colors.blue,
                            strokeWidth: 4,
                          ),
                        if (walked.length > 1)
                          Polyline(
                            points: walked,
                            color: Colors.green,
                            strokeWidth: 4,
                          ),
                      ],
                    ),
                    MarkerLayer(
                      markers: [
                        if (line.isNotEmpty)
                          Marker(
                            point: line.first,
                            child: const Tooltip(
                              message: 'Start / end area',
                              child: Icon(Icons.flag, color: Colors.blue),
                            ),
                          ),
                        for (final checkpoint in checkpoints.whereType<Map>())
                          if (routeCoordinates([
                            checkpoint['position'],
                          ]).isNotEmpty)
                            Marker(
                              point: routeCoordinates([
                                checkpoint['position'],
                              ]).first,
                              child: Tooltip(
                                message:
                                    checkpoint['label']?.toString() ??
                                    'GPS checkpoint',
                                child: const Icon(
                                  Icons.location_on,
                                  color: Colors.purple,
                                ),
                              ),
                            ),
                        if (current != null)
                          Marker(
                            point: current,
                            child: const Icon(
                              Icons.my_location,
                              color: Colors.black,
                            ),
                          ),
                      ],
                    ),
                    const RichAttributionWidget(
                      attributions: [
                        TextSourceAttribution('OpenStreetMap contributors'),
                      ],
                    ),
                  ],
                ),
              ),
            const Text(
              'Blue: assigned corridor/route. Green: uploaded GPS path. Purple: GPS checkpoints.',
            ),
            if (line.isEmpty)
              const Text(
                'A recommended route has not been supplied. Follow the assigned public service area; do not use private shortcuts.',
              ),
            if (route['instructions'] is List) ...[
              for (final instruction in route['instructions'] as List)
                Text(instruction.toString()),
            ],
            for (final checkpoint in checkpoints.whereType<Map>())
              Text(
                'GPS checkpoint: ${checkpoint['label'] ?? 'Assigned checkpoint'}',
              ),
          ],
        ),
      ),
    );
  }
}
